import type { Finding, Remediation, DiffHunk } from "../types";
import {
  REMEDIATION_SYSTEM_PROMPT,
  REMEDIATION_USER_PROMPT
} from "../prompts/remediation";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  extractArrayFromResponse,
  type StageEnv
} from "./utils";

interface RemediationResponse {
  id?: string;
  findingId: string;
  originalCode: string;
  fixedCode: string;
  explanation: string;
  diffHunks?: DiffHunk[];
}

export async function runRemediationStage(
  env: StageEnv,
  code: string,
  approvedFindings: Finding[],
  reviewId: string
): Promise<Remediation[]> {
  if (approvedFindings.length === 0) {
    return [];
  }

  const findingsJson = JSON.stringify(
    approvedFindings.map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      location: f.location
    })),
    null,
    2
  );

  const response = await runAIAnalysis(
    env,
    REMEDIATION_SYSTEM_PROMPT,
    REMEDIATION_USER_PROMPT(code, findingsJson)
  );

  const parsed = parseJsonResponse<unknown>(response);
  const remediationResults = extractArrayFromResponse<RemediationResponse>(parsed);

  const now = Date.now();

  return remediationResults.map((rem, index) => ({
    id: rem.id || generateId(`rem-${index}`),
    findingId: rem.findingId,
    reviewId,
    originalCode: rem.originalCode || "",
    fixedCode: rem.fixedCode || "",
    explanation: rem.explanation || "",
    diffHunks: rem.diffHunks || [],
    createdAt: now
  }));
}
