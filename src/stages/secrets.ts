import type { RawFinding } from "../types";
import { SECRETS_SYSTEM_PROMPT, SECRETS_USER_PROMPT } from "../prompts/secrets";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  type StageEnv
} from "./utils";

export async function runSecretsStage(
  env: StageEnv,
  code: string
): Promise<RawFinding[]> {
  const response = await runAIAnalysis(
    env,
    SECRETS_SYSTEM_PROMPT,
    SECRETS_USER_PROMPT(code)
  );

  try {
    const findings = parseJsonResponse<RawFinding[]>(response);
    if (!Array.isArray(findings)) return [];

    return findings.map((finding, index) => ({
      ...finding,
      id: finding.id || generateId(`sec-${index}`),
      category: "secrets" as const
    }));
  } catch (error) {
    console.error("Secrets stage parse error:", error);
    return [];
  }
}
