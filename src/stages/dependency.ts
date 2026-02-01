import type { RawFinding, TriageResult } from "../types";
import {
  DEPENDENCY_SYSTEM_PROMPT,
  DEPENDENCY_USER_PROMPT
} from "../prompts/dependency";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  extractArrayFromResponse,
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

  try {
    const parsed = parseJsonResponse<unknown>(response);
    const findings = extractArrayFromResponse<RawFinding>(parsed);

    return findings.map((finding, index) => ({
      ...finding,
      id: finding.id || generateId(`dep-${index}`),
      category: "dependency" as const
    }));
  } catch (error) {
    console.error("Dependency stage parse error:", error);
    return [];
  }
}
