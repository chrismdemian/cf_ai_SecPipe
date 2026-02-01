import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import type {
  PipelineParams,
  RawFinding,
  Finding,
  SynthesisResult,
  Remediation
} from "./types";
import {
  runTriageStage,
  runDependencyStage,
  runAuthStage,
  runInjectionStage,
  runSecretsStage,
  runReachabilityFilter,
  runSynthesisStage,
  runRemediationStage
} from "./stages";

export interface ApprovalEvent {
  approved: boolean;
  findingIds: string[];
}

// Env type for workflow
interface WorkflowEnv {
  AI: Ai;
  SECPIPE_AGENT: DurableObjectNamespace;
  SECPIPE_WORKFLOW: Workflow;
  OAUTH_KV: KVNamespace;
  AI_GATEWAY_ID?: string;
}

export class SecurityPipelineWorkflow extends WorkflowEntrypoint<
  WorkflowEnv,
  PipelineParams
> {
  async run(event: WorkflowEvent<PipelineParams>, step: WorkflowStep) {
    const { reviewId, code } = event.payload;

    // Stage 1: Triage - Data flow mapping and risk identification
    const triage = await step.do(
      "triage",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes"
      },
      async () => {
        try {
          console.log("Starting triage stage for review:", reviewId);
          const result = await runTriageStage(this.env, code);
          console.log("Triage completed successfully");
          return result;
        } catch (error) {
          console.error("Triage stage failed:", error);
          throw error;
        }
      }
    );

    // Update review status in KV
    await step.do("update-status-analyzing", async () => {
      await this.updateReviewStatusKV(reviewId, "analyzing", "dependency");
    });

    // Stage 2-5: Run specialist analyzers in parallel based on triage results
    const [
      dependencyFindings,
      authFindings,
      injectionFindings,
      secretsFindings
    ] = await Promise.all([
      step.do(
        "dependency-analysis",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "2 minutes"
        },
        async () => {
          return await runDependencyStage(this.env, code, triage);
        }
      ),
      step.do(
        "auth-analysis",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "2 minutes"
        },
        async () => {
          return await runAuthStage(this.env, code, triage);
        }
      ),
      step.do(
        "injection-analysis",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "2 minutes"
        },
        async () => {
          return await runInjectionStage(this.env, code, triage);
        }
      ),
      step.do(
        "secrets-analysis",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "2 minutes"
        },
        async () => {
          return await runSecretsStage(this.env, code);
        }
      )
    ]);

    // Aggregate all raw findings
    let allRawFindings: RawFinding[] = [
      ...dependencyFindings,
      ...authFindings,
      ...injectionFindings,
      ...secretsFindings
    ];

    // Issue #3 Fix: Deduplicate findings by CWE + normalized snippet
    // Multiple analyzers may detect the same vulnerability at slightly different lines
    const deduplicateFindings = (findings: RawFinding[]): RawFinding[] => {
      const seen = new Map<string, RawFinding>();
      const severityOrder: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4, info: 5 };

      for (const finding of findings) {
        // Normalize the snippet by removing whitespace for comparison
        const normalizedSnippet = finding.location.snippet
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 100); // Use first 100 chars to avoid minor differences

        // Create key from CWE + normalized snippet (not line numbers which vary)
        const key = `${finding.cweId || finding.title}:${normalizedSnippet}`;

        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, finding);
        } else {
          // Keep the finding with higher severity
          const existingSeverity = severityOrder[existing.severity] || 5;
          const newSeverity = severityOrder[finding.severity] || 5;
          if (newSeverity < existingSeverity) {
            seen.set(key, finding);
          }
        }
      }

      return Array.from(seen.values());
    };

    allRawFindings = deduplicateFindings(allRawFindings);
    console.log(`Deduplicated findings: ${dependencyFindings.length + authFindings.length + injectionFindings.length + secretsFindings.length} -> ${allRawFindings.length}`);

    // Fallback: If no findings from AI stages, use triage riskAreas
    // Triage correctly identifies vulnerabilities, so use that data
    if (allRawFindings.length === 0 && triage.riskAreas.length > 0) {
      console.log("No findings from AI stages, using triage riskAreas as fallback");
      allRawFindings = triage.riskAreas.map((risk, index) => ({
        id: `triage-${index}`,
        category: risk.category as RawFinding["category"],
        severity: risk.confidence === "high" ? "critical" as const :
                  risk.confidence === "medium" ? "high" as const : "medium" as const,
        title: `${risk.category.charAt(0).toUpperCase() + risk.category.slice(1)} vulnerability detected`,
        description: risk.reason,
        location: {
          startLine: risk.locations[0] || 1,
          endLine: risk.locations[risk.locations.length - 1] || 1,
          snippet: code.split('\n').slice(
            (risk.locations[0] || 1) - 1,
            (risk.locations[risk.locations.length - 1] || 1)
          ).join('\n')
        }
      }));
    }

    // Update status
    await step.do("update-status-filtering", async () => {
      await this.updateReviewStatusKV( reviewId, "filtering", "reachability");
    });

    // Stage 6: REACHABILITY FILTER - The key differentiator
    const filteredFindings = await step.do(
      "reachability-filter",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "3 minutes"
      },
      async () => {
        return await runReachabilityFilter(
          this.env,
          code,
          allRawFindings,
          triage.dataFlowMap,
          reviewId
        );
      }
    );

    // Stage 7: Synthesis - Aggregate and summarize
    const synthesis = await step.do(
      "synthesis",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes"
      },
      async () => {
        return await runSynthesisStage(
          this.env,
          allRawFindings.length,
          filteredFindings
        );
      }
    );

    // Store findings and synthesis in DO storage
    await step.do("store-findings", async () => {
      await this.storeFindingsKV( reviewId, filteredFindings, synthesis);
    });

    // Update status to awaiting approval
    await step.do("update-status-awaiting-approval", async () => {
      await this.updateReviewStatusKV( reviewId, "awaiting_approval", "approval");
    });

    // Stage 8: Wait for human approval (MCP elicitation)
    const approvalEvent = await step.waitForEvent<ApprovalEvent>("approval", {
      type: "approval",
      timeout: "7 days"
    });

    const approval = approvalEvent.payload;

    if (!approval.approved || approval.findingIds.length === 0) {
      // User declined or no findings approved
      await step.do("update-status-completed-no-remediation", async () => {
        await this.updateReviewStatusKV( reviewId, "completed", undefined);
      });
      return {
        status: "completed",
        synthesis,
        remediations: []
      };
    }

    // Update status to remediating
    await step.do("update-status-remediating", async () => {
      await this.updateReviewStatusKV( reviewId, "remediating", "remediation");
    });

    // Get approved findings
    const approvedFindings = filteredFindings.filter(
      (f) => f.isReachable && approval.findingIds.includes(f.id)
    );

    // Stage 9: Generate remediation code
    const remediations = await step.do(
      "remediation",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "3 minutes"
      },
      async () => {
        return await runRemediationStage(
          this.env,
          code,
          approvedFindings,
          reviewId
        );
      }
    );

    // Store remediations
    await step.do("store-remediations", async () => {
      await this.storeRemediationsKV( reviewId, remediations);
    });

    // Update final status
    await step.do("update-status-completed", async () => {
      await this.updateReviewStatusKV( reviewId, "completed", undefined);
    });

    return {
      status: "completed",
      synthesis,
      remediations
    };
  }

  // KV-based helper methods (shared across all sessions)
  private async updateReviewStatusKV(
    reviewId: string,
    status: string,
    currentStage: string | undefined
  ): Promise<void> {
    const reviewData = await this.env.OAUTH_KV.get(`review:${reviewId}`);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      review.status = status;
      review.currentStage = currentStage;
      review.updatedAt = Date.now();
      await this.env.OAUTH_KV.put(`review:${reviewId}`, JSON.stringify(review));
    }
  }

  private async storeFindingsKV(
    reviewId: string,
    findings: Finding[],
    synthesis: SynthesisResult
  ): Promise<void> {
    // Store findings
    await this.env.OAUTH_KV.put(`findings:${reviewId}`, JSON.stringify(findings));

    // Update review with stats
    const reviewData = await this.env.OAUTH_KV.get(`review:${reviewId}`);
    if (reviewData) {
      const review = JSON.parse(reviewData);
      review.totalFindingsRaw = synthesis.totalRaw;
      review.totalFindingsFiltered = findings.filter(f => f.isReachable).length;
      review.noiseReductionPercent = synthesis.noiseReductionPercent;
      review.updatedAt = Date.now();
      await this.env.OAUTH_KV.put(`review:${reviewId}`, JSON.stringify(review));
    }
  }

  private async storeRemediationsKV(
    reviewId: string,
    remediations: Remediation[]
  ): Promise<void> {
    await this.env.OAUTH_KV.put(`remediations:${reviewId}`, JSON.stringify(remediations));
  }
}
