import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Finding, Remediation, SynthesisResult } from "./types";
import { generateId } from "./stages/utils";

// Environment interface
interface SecPipeEnv {
  AI: Ai;
  SECPIPE_AGENT: DurableObjectNamespace;
  SECPIPE_WORKFLOW: Workflow;
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AI_GATEWAY_ID?: string;
}

// Zod schemas for MCP tool inputs
const SubmitReviewSchema = z.object({
  code: z
    .string()
    .min(1)
    .describe("The source code to analyze for security vulnerabilities"),
  language: z
    .string()
    .optional()
    .describe("Programming language (auto-detected if not provided)")
});

const CheckStatusSchema = z.object({
  reviewId: z.string().describe("The review ID to check status for")
});

const GetFindingsSchema = z.object({
  reviewId: z.string().describe("The review ID to get findings for"),
  includeFiltered: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include non-exploitable findings that were filtered out")
});

const ApproveFindingsSchema = z.object({
  reviewId: z.string().describe("The review ID"),
  findingIds: z
    .array(z.string())
    .describe("IDs of findings to approve for remediation")
});

const GetRemediationSchema = z.object({
  reviewId: z.string().describe("The review ID"),
  findingId: z
    .string()
    .optional()
    .describe("Specific finding ID (returns all if not provided)")
});

const CompareReviewsSchema = z.object({
  reviewId1: z.string().describe("First review ID"),
  reviewId2: z.string().describe("Second review ID")
});

// AuthProps with index signature for McpAgent compatibility
interface AuthPropsWithIndex {
  userId: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

export class SecPipeAgent extends McpAgent<
  SecPipeEnv,
  Record<string, unknown>,
  AuthPropsWithIndex
> {
  server = new McpServer({
    name: "SecPipe",
    version: "1.0.0"
  });

  async init() {
    // Initialize SQL schema
    this.initializeDatabase();

    // Register MCP tools
    this.registerTools();
  }

  private initializeDatabase() {
    const sql = this.ctx.storage.sql;

    // Reviews table
    sql.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        language TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        workflow_instance_id TEXT,
        total_findings_raw INTEGER DEFAULT 0,
        total_findings_filtered INTEGER DEFAULT 0,
        noise_reduction_percent REAL DEFAULT 0,
        current_stage TEXT,
        error TEXT
      )
    `);

    // Findings table
    sql.exec(`
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location_start_line INTEGER NOT NULL,
        location_end_line INTEGER NOT NULL,
        location_snippet TEXT NOT NULL,
        cwe_id TEXT,
        owasp_category TEXT,
        is_reachable INTEGER NOT NULL DEFAULT 0,
        has_user_input_path INTEGER NOT NULL DEFAULT 0,
        data_flow_path TEXT,
        sanitizers_in_path TEXT,
        false_positive_reason TEXT,
        approved INTEGER DEFAULT 0,
        approved_at INTEGER
      )
    `);

    // Remediations table
    sql.exec(`
      CREATE TABLE IF NOT EXISTS remediations (
        id TEXT PRIMARY KEY,
        finding_id TEXT NOT NULL,
        review_id TEXT NOT NULL,
        original_code TEXT NOT NULL,
        fixed_code TEXT NOT NULL,
        explanation TEXT NOT NULL,
        diff_hunks TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  private registerTools() {
    // Tool 1: Submit code for security review
    this.server.tool(
      "submit_review",
      "Submit source code for async security analysis with reachability filtering. Returns a review ID to track progress.",
      SubmitReviewSchema.shape,
      async (args) => {
        const { code, language } = args;
        const userId = this.props?.userId || "anonymous";

        const reviewId = generateId("rev");
        const now = Date.now();

        // Create review record
        this.ctx.storage.sql.exec(
          `
          INSERT INTO reviews (id, user_id, code, language, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `,
          reviewId,
          userId,
          code,
          language || "auto",
          now,
          now
        );

        // Start the workflow - pass the DO ID so workflow can call back
        // Use toString() since McpAgent uses unique IDs, not named IDs
        const doId = this.ctx.id.toString();
        const instance = await this.env.SECPIPE_WORKFLOW.create({
          id: reviewId,
          params: {
            reviewId,
            userId,
            code,
            language: language || "auto",
            doId
          }
        });

        // Update review with workflow instance ID
        this.ctx.storage.sql.exec(
          `
          UPDATE reviews SET workflow_instance_id = ?, status = 'triaging', current_stage = 'triage', updated_at = ?
          WHERE id = ?
        `,
          instance.id,
          Date.now(),
          reviewId
        );

        // Broadcast status update via WebSocket
        this.broadcastStatus(reviewId, "triaging", "triage");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                reviewId,
                status: "triaging",
                message:
                  "Security review started. Pipeline stages: triage → dependency → auth → injection → secrets → REACHABILITY FILTER → synthesis. Use check_status to monitor progress."
              })
            }
          ]
        };
      }
    );

    // Tool 2: Check pipeline status
    this.server.tool(
      "check_status",
      "Check the current status and progress of a security review pipeline.",
      CheckStatusSchema.shape,
      async (args) => {
        const { reviewId } = args;

        const result = this.ctx.storage.sql
          .exec(
            `
          SELECT * FROM reviews WHERE id = ?
        `,
            reviewId
          )
          .toArray();

        if (result.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Review not found" })
              }
            ]
          };
        }

        const review = result[0] as unknown as {
          id: string;
          status: string;
          current_stage: string;
          total_findings_raw: number;
          total_findings_filtered: number;
          noise_reduction_percent: number;
          error: string;
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                reviewId: review.id,
                status: review.status,
                currentStage: review.current_stage,
                stats: {
                  rawFindings: review.total_findings_raw,
                  exploitableFindings: review.total_findings_filtered,
                  noiseReductionPercent: review.noise_reduction_percent
                },
                error: review.error || undefined
              })
            }
          ]
        };
      }
    );

    // Tool 3: Get findings
    this.server.tool(
      "get_findings",
      "Get security findings for a completed review. By default returns only exploitable findings after reachability filtering.",
      GetFindingsSchema.shape,
      async (args) => {
        const { reviewId, includeFiltered } = args;

        const whereClause = includeFiltered
          ? "WHERE review_id = ?"
          : "WHERE review_id = ? AND is_reachable = 1";

        const findings = this.ctx.storage.sql
          .exec(
            `
          SELECT * FROM findings ${whereClause} ORDER BY
            CASE severity
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2
              WHEN 'medium' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END
        `,
            reviewId
          )
          .toArray();

        // Get review stats
        const reviewResult = this.ctx.storage.sql
          .exec(
            `
          SELECT total_findings_raw, total_findings_filtered, noise_reduction_percent
          FROM reviews WHERE id = ?
        `,
            reviewId
          )
          .toArray();

        const stats = reviewResult[0] as unknown as
          | {
              total_findings_raw: number;
              total_findings_filtered: number;
              noise_reduction_percent: number;
            }
          | undefined;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                reviewId,
                stats: stats
                  ? {
                      rawFindings: stats.total_findings_raw,
                      exploitableFindings: stats.total_findings_filtered,
                      noiseReductionPercent: stats.noise_reduction_percent
                    }
                  : null,
                findingsCount: findings.length,
                findings: findings.map((f: unknown) => this.mapFindingFromDb(f))
              })
            }
          ]
        };
      }
    );

    // Tool 4: Approve findings (MCP elicitation for human-in-the-loop)
    this.server.tool(
      "approve_findings",
      "Approve specific findings to generate remediation code. This triggers the remediation stage of the pipeline.",
      ApproveFindingsSchema.shape,
      async (args) => {
        const { reviewId, findingIds } = args;

        // Get workflow instance ID
        const reviewResult = this.ctx.storage.sql
          .exec(
            `
          SELECT workflow_instance_id FROM reviews WHERE id = ?
        `,
            reviewId
          )
          .toArray();

        if (reviewResult.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Review not found" })
              }
            ]
          };
        }

        const review = reviewResult[0] as unknown as {
          workflow_instance_id: string;
        };

        // Mark findings as approved
        const now = Date.now();
        for (const findingId of findingIds) {
          this.ctx.storage.sql.exec(
            `
            UPDATE findings SET approved = 1, approved_at = ? WHERE id = ? AND review_id = ?
          `,
            now,
            findingId,
            reviewId
          );
        }

        // Send approval event to workflow
        try {
          const instance = await this.env.SECPIPE_WORKFLOW.get(
            review.workflow_instance_id
          );
          // The workflow API uses {type, payload} format
          if (instance && typeof instance.sendEvent === "function") {
            await instance.sendEvent({
              type: "approval",
              payload: {
                approved: true,
                findingIds
              }
            });
          }
        } catch (e) {
          console.error("Failed to send approval event:", e);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: `Approved ${findingIds.length} findings for remediation. Generating fixes...`,
                approvedFindingIds: findingIds
              })
            }
          ]
        };
      }
    );

    // Tool 5: Get remediation
    this.server.tool(
      "get_remediation",
      "Get generated remediation code for approved findings.",
      GetRemediationSchema.shape,
      async (args) => {
        const { reviewId, findingId } = args;

        const whereClause = findingId
          ? "WHERE review_id = ? AND finding_id = ?"
          : "WHERE review_id = ?";

        const params = findingId ? [reviewId, findingId] : [reviewId];

        const remediations = this.ctx.storage.sql
          .exec(`SELECT * FROM remediations ${whereClause}`, ...params)
          .toArray();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                reviewId,
                remediationsCount: remediations.length,
                remediations: remediations.map((r: unknown) =>
                  this.mapRemediationFromDb(r)
                )
              })
            }
          ]
        };
      }
    );

    // Tool 6: List reviews
    this.server.tool(
      "list_reviews",
      "List all security reviews for the current user.",
      {},
      async () => {
        const userId = this.props?.userId || "anonymous";

        const reviews = this.ctx.storage.sql
          .exec(
            `
          SELECT id, status, current_stage, total_findings_raw, total_findings_filtered,
                 noise_reduction_percent, created_at, updated_at, error
          FROM reviews
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 50
        `,
            userId
          )
          .toArray();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                userId,
                reviewsCount: reviews.length,
                reviews: reviews.map((r: unknown) => {
                  const review = r as {
                    id: string;
                    status: string;
                    current_stage: string;
                    total_findings_raw: number;
                    total_findings_filtered: number;
                    noise_reduction_percent: number;
                    created_at: number;
                    updated_at: number;
                    error: string;
                  };
                  return {
                    id: review.id,
                    status: review.status,
                    currentStage: review.current_stage,
                    stats: {
                      rawFindings: review.total_findings_raw,
                      exploitableFindings: review.total_findings_filtered,
                      noiseReductionPercent: review.noise_reduction_percent
                    },
                    createdAt: review.created_at,
                    updatedAt: review.updated_at,
                    error: review.error || undefined
                  };
                })
              })
            }
          ]
        };
      }
    );

    // Tool 7: Compare reviews
    this.server.tool(
      "compare_reviews",
      "Compare findings between two security reviews to see what changed.",
      CompareReviewsSchema.shape,
      async (args) => {
        const { reviewId1, reviewId2 } = args;

        const findings1 = this.ctx.storage.sql
          .exec(
            `
          SELECT * FROM findings WHERE review_id = ? AND is_reachable = 1
        `,
            reviewId1
          )
          .toArray();

        const findings2 = this.ctx.storage.sql
          .exec(
            `
          SELECT * FROM findings WHERE review_id = ? AND is_reachable = 1
        `,
            reviewId2
          )
          .toArray();

        // Simple diff based on title/location
        const findings1Set = new Set(
          findings1.map((f: unknown) => {
            const finding = f as { title: string; location_start_line: number };
            return `${finding.title}:${finding.location_start_line}`;
          })
        );
        const findings2Set = new Set(
          findings2.map((f: unknown) => {
            const finding = f as { title: string; location_start_line: number };
            return `${finding.title}:${finding.location_start_line}`;
          })
        );

        const newInReview2 = findings2.filter((f: unknown) => {
          const finding = f as { title: string; location_start_line: number };
          return !findings1Set.has(
            `${finding.title}:${finding.location_start_line}`
          );
        });

        const fixedInReview2 = findings1.filter((f: unknown) => {
          const finding = f as { title: string; location_start_line: number };
          return !findings2Set.has(
            `${finding.title}:${finding.location_start_line}`
          );
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                comparison: {
                  review1: { id: reviewId1, findingsCount: findings1.length },
                  review2: { id: reviewId2, findingsCount: findings2.length },
                  delta: findings2.length - findings1.length
                },
                newVulnerabilities: newInReview2.map((f: unknown) =>
                  this.mapFindingFromDb(f)
                ),
                fixedVulnerabilities: fixedInReview2.map((f: unknown) =>
                  this.mapFindingFromDb(f)
                )
              })
            }
          ]
        };
      }
    );
  }

  // Internal endpoint handlers (called by workflow)
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Ensure database is initialized for internal calls from workflow
    if (url.hostname === "internal") {
      this.initializeDatabase();
    }

    if (url.pathname === "/update-status" && request.method === "POST") {
      const { reviewId, status, currentStage } = (await request.json()) as {
        reviewId: string;
        status: string;
        currentStage?: string;
      };

      this.ctx.storage.sql.exec(
        `
        UPDATE reviews SET status = ?, current_stage = ?, updated_at = ? WHERE id = ?
      `,
        status,
        currentStage || null,
        Date.now(),
        reviewId
      );

      this.broadcastStatus(reviewId, status, currentStage);
      return new Response("OK");
    }

    if (url.pathname === "/store-findings" && request.method === "POST") {
      const { reviewId, findings, synthesis } = (await request.json()) as {
        reviewId: string;
        findings: Finding[];
        synthesis: SynthesisResult;
      };

      // Store findings
      for (const finding of findings) {
        this.ctx.storage.sql.exec(
          `
          INSERT OR REPLACE INTO findings (
            id, review_id, category, severity, title, description,
            location_start_line, location_end_line, location_snippet,
            cwe_id, owasp_category, is_reachable, has_user_input_path,
            data_flow_path, sanitizers_in_path, false_positive_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          finding.id,
          reviewId,
          finding.category,
          finding.severity,
          finding.title,
          finding.description,
          finding.location.startLine,
          finding.location.endLine,
          finding.location.snippet,
          finding.cweId || null,
          finding.owaspCategory || null,
          finding.isReachable ? 1 : 0,
          finding.reachabilityAnalysis.hasUserInputPath ? 1 : 0,
          JSON.stringify(finding.reachabilityAnalysis.dataFlowPath || []),
          JSON.stringify(finding.reachabilityAnalysis.sanitizersInPath || []),
          finding.reachabilityAnalysis.falsePositiveReason || null
        );
      }

      // Update review stats
      const reachableCount = findings.filter((f) => f.isReachable).length;
      this.ctx.storage.sql.exec(
        `
        UPDATE reviews SET
          total_findings_raw = ?,
          total_findings_filtered = ?,
          noise_reduction_percent = ?,
          updated_at = ?
        WHERE id = ?
      `,
        synthesis.totalRaw,
        reachableCount,
        synthesis.noiseReductionPercent,
        Date.now(),
        reviewId
      );

      return new Response("OK");
    }

    if (url.pathname === "/store-remediations" && request.method === "POST") {
      const { reviewId, remediations } = (await request.json()) as {
        reviewId: string;
        remediations: Remediation[];
      };

      for (const rem of remediations) {
        this.ctx.storage.sql.exec(
          `
          INSERT OR REPLACE INTO remediations (
            id, finding_id, review_id, original_code, fixed_code,
            explanation, diff_hunks, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          rem.id,
          rem.findingId,
          reviewId,
          rem.originalCode,
          rem.fixedCode,
          rem.explanation,
          JSON.stringify(rem.diffHunks),
          rem.createdAt
        );
      }

      return new Response("OK");
    }

    // Default: pass to MCP server
    return super.fetch(request);
  }

  private broadcastStatus(
    reviewId: string,
    status: string,
    currentStage?: string
  ) {
    // Broadcast to all connected WebSocket clients
    const message = JSON.stringify({
      type: "status_update",
      reviewId,
      status,
      currentStage,
      timestamp: Date.now()
    });
    // McpAgent extends Agent which has broadcast method
    if (typeof this.broadcast === "function") {
      this.broadcast(message);
    }
  }

  private mapFindingFromDb(row: unknown): Partial<Finding> {
    const f = row as {
      id: string;
      category: string;
      severity: string;
      title: string;
      description: string;
      location_start_line: number;
      location_end_line: number;
      location_snippet: string;
      cwe_id: string;
      owasp_category: string;
      is_reachable: number;
      has_user_input_path: number;
      data_flow_path: string;
      sanitizers_in_path: string;
      false_positive_reason: string;
    };

    return {
      id: f.id,
      category: f.category as Finding["category"],
      severity: f.severity as Finding["severity"],
      title: f.title,
      description: f.description,
      location: {
        startLine: f.location_start_line,
        endLine: f.location_end_line,
        snippet: f.location_snippet
      },
      cweId: f.cwe_id || undefined,
      owaspCategory: f.owasp_category || undefined,
      isReachable: f.is_reachable === 1,
      reachabilityAnalysis: {
        hasUserInputPath: f.has_user_input_path === 1,
        dataFlowPath: JSON.parse(f.data_flow_path || "[]"),
        sanitizersInPath: JSON.parse(f.sanitizers_in_path || "[]"),
        falsePositiveReason: f.false_positive_reason || undefined
      }
    };
  }

  private mapRemediationFromDb(row: unknown): Partial<Remediation> {
    const r = row as {
      id: string;
      finding_id: string;
      review_id: string;
      original_code: string;
      fixed_code: string;
      explanation: string;
      diff_hunks: string;
      created_at: number;
    };

    return {
      id: r.id,
      findingId: r.finding_id,
      reviewId: r.review_id,
      originalCode: r.original_code,
      fixedCode: r.fixed_code,
      explanation: r.explanation,
      diffHunks: JSON.parse(r.diff_hunks || "[]"),
      createdAt: r.created_at
    };
  }
}
