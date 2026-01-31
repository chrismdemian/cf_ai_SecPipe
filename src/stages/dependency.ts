import type { RawFinding, TriageResult } from "../types";
import {
  DEPENDENCY_SYSTEM_PROMPT,
  DEPENDENCY_USER_PROMPT
} from "../prompts/dependency";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  type StageEnv
} from "./utils";

export async function runDependencyStage(
  env: StageEnv,
  code: string,
  triage: TriageResult
): Promise<RawFinding[]> {
  const triageContext = JSON.stringify(
    {
      language: triage.language,
      framework: triage.framework,
      codeType: triage.codeType
    },
    null,
    2
  );

  const response = await runAIAnalysis(
    env,
    DEPENDENCY_SYSTEM_PROMPT,
    DEPENDENCY_USER_PROMPT(code, triageContext)
  );

  const findings = parseJsonResponse<RawFinding[]>(response);

  // Ensure each finding has a unique ID and required fields
  return findings.map((finding, index) => ({
    ...finding,
    id: finding.id || generateId(`dep-${index}`),
    category: "dependency" as const
  }));
}
