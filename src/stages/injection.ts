import type { RawFinding, TriageResult } from "../types";
import {
  INJECTION_SYSTEM_PROMPT,
  INJECTION_USER_PROMPT
} from "../prompts/injection";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  type StageEnv
} from "./utils";

export async function runInjectionStage(
  env: StageEnv,
  code: string,
  triage: TriageResult
): Promise<RawFinding[]> {
  // Check if there are potential injection risk areas
  const hasInjectionRiskAreas = triage.riskAreas.some((area) =>
    ["injection", "xss", "ssrf", "path_traversal"].includes(area.category)
  );

  // Check if there are sinks in the data flow that could be injection targets
  const hasSinks = triage.dataFlowMap.sinks.length > 0;

  if (!hasInjectionRiskAreas && !hasSinks && triage.entryPoints.length === 0) {
    return [];
  }

  const triageContext = JSON.stringify(
    {
      dataFlowMap: triage.dataFlowMap,
      entryPoints: triage.entryPoints,
      riskAreas: triage.riskAreas.filter((r) =>
        ["injection", "xss", "ssrf", "path_traversal"].includes(r.category)
      )
    },
    null,
    2
  );

  const response = await runAIAnalysis(
    env,
    INJECTION_SYSTEM_PROMPT,
    INJECTION_USER_PROMPT(code, triageContext)
  );

  try {
    const findings = parseJsonResponse<RawFinding[]>(response);
    if (!Array.isArray(findings)) return [];

    return findings.map((finding, index) => ({
      ...finding,
      id: finding.id || generateId(`inj-${index}`),
      category: finding.category || ("injection" as const)
    }));
  } catch (error) {
    console.error("Injection stage parse error:", error);
    return [];
  }
}
