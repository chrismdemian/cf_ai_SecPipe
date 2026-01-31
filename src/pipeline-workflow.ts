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
        return await runTriageStage(this.env, code);
      }
    );

    // Update review status
    await step.do("update-status-analyzing", async () => {
      await this.updateReviewStatus(reviewId, "analyzing", "dependency");
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
    const allRawFindings: RawFinding[] = [
      ...dependencyFindings,
      ...authFindings,
      ...injectionFindings,
      ...secretsFindings
    ];

    // Update status
    await step.do("update-status-filtering", async () => {
      await this.updateReviewStatus(reviewId, "filtering", "reachability");
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
      await this.storeFindings(reviewId, filteredFindings, synthesis);
    });

    // Update status to awaiting approval
    await step.do("update-status-awaiting-approval", async () => {
      await this.updateReviewStatus(reviewId, "awaiting_approval", "approval");
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
        await this.updateReviewStatus(reviewId, "completed", undefined);
      });
      return {
        status: "completed",
        synthesis,
        remediations: []
      };
    }

    // Update status to remediating
    await step.do("update-status-remediating", async () => {
      await this.updateReviewStatus(reviewId, "remediating", "remediation");
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
      await this.storeRemediations(reviewId, remediations);
    });

    // Update final status
    await step.do("update-status-completed", async () => {
      await this.updateReviewStatus(reviewId, "completed", undefined);
    });

    return {
      status: "completed",
      synthesis,
      remediations
    };
  }

  private async updateReviewStatus(
    reviewId: string,
    status: string,
    currentStage: string | undefined
  ): Promise<void> {
    // Get the DO stub and call it to update status
    const doId = this.env.SECPIPE_AGENT.idFromName(
      reviewId.split("-")[0] || "default"
    );
    const stub = this.env.SECPIPE_AGENT.get(doId);

    await stub.fetch(
      new Request("http://internal/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, status, currentStage })
      })
    );
  }

  private async storeFindings(
    reviewId: string,
    findings: Finding[],
    synthesis: SynthesisResult
  ): Promise<void> {
    const doId = this.env.SECPIPE_AGENT.idFromName(
      reviewId.split("-")[0] || "default"
    );
    const stub = this.env.SECPIPE_AGENT.get(doId);

    await stub.fetch(
      new Request("http://internal/store-findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, findings, synthesis })
      })
    );
  }

  private async storeRemediations(
    reviewId: string,
    remediations: Remediation[]
  ): Promise<void> {
    const doId = this.env.SECPIPE_AGENT.idFromName(
      reviewId.split("-")[0] || "default"
    );
    const stub = this.env.SECPIPE_AGENT.get(doId);

    await stub.fetch(
      new Request("http://internal/store-remediations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, remediations })
      })
    );
  }
}
