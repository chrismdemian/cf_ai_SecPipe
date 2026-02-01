import type { RawFinding, TriageResult } from "../types";
import { AUTH_SYSTEM_PROMPT, AUTH_USER_PROMPT } from "../prompts/auth";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  extractArrayFromResponse,
  type StageEnv
} from "./utils";

export async function runAuthStage(
  env: StageEnv,
  code: string,
  triage: TriageResult
): Promise<RawFinding[]> {
  // Only run if there are relevant risk areas or entry points
  const hasAuthRiskAreas = triage.riskAreas.some(
    (area) => area.category === "auth"
  );
  const hasHttpEntryPoints = triage.entryPoints.some(
    (ep) => ep.type === "http" || ep.type === "websocket"
  );

  if (!hasAuthRiskAreas && !hasHttpEntryPoints) {
    // Skip auth analysis for code without auth-relevant patterns
    return [];
  }

  const triageContext = JSON.stringify(
    {
      entryPoints: triage.entryPoints,
      riskAreas: triage.riskAreas.filter((r) => r.category === "auth"),
      framework: triage.framework
    },
    null,
    2
  );

  const response = await runAIAnalysis(
    env,
    AUTH_SYSTEM_PROMPT,
    AUTH_USER_PROMPT(code, triageContext)
  );

  try {
    const parsed = parseJsonResponse<unknown>(response);
    const findings = extractArrayFromResponse<RawFinding>(parsed);

    return findings.map((finding, index) => ({
      ...finding,
      id: finding.id || generateId(`auth-${index}`),
      category: "auth" as const
    }));
  } catch (error) {
    console.error("Auth stage parse error:", error);
    return [];
  }
}
