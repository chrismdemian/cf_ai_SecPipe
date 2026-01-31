import type { TriageResult } from "../types";
import { TRIAGE_SYSTEM_PROMPT, TRIAGE_USER_PROMPT } from "../prompts/triage";
import { parseJsonResponse, runAIAnalysis, type StageEnv } from "./utils";

export async function runTriageStage(
  env: StageEnv,
  code: string
): Promise<TriageResult> {
  const response = await runAIAnalysis(
    env,
    TRIAGE_SYSTEM_PROMPT,
    TRIAGE_USER_PROMPT(code)
  );

  const result = parseJsonResponse<TriageResult>(response);

  // Validate required fields
  if (!result.language || !result.dataFlowMap) {
    throw new Error("Invalid triage response: missing required fields");
  }

  // Ensure arrays exist
  result.dataFlowMap.nodes = result.dataFlowMap.nodes || [];
  result.dataFlowMap.edges = result.dataFlowMap.edges || [];
  result.dataFlowMap.entryPoints = result.dataFlowMap.entryPoints || [];
  result.dataFlowMap.sinks = result.dataFlowMap.sinks || [];
  result.entryPoints = result.entryPoints || [];
  result.riskAreas = result.riskAreas || [];

  return result;
}
