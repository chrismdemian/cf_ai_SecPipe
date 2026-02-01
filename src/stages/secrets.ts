import type { RawFinding } from "../types";
import { SECRETS_SYSTEM_PROMPT, SECRETS_USER_PROMPT } from "../prompts/secrets";
import {
  parseJsonResponse,
  runAIAnalysis,
  generateId,
  extractArrayFromResponse,
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
    const parsed = parseJsonResponse<unknown>(response);
    const findings = extractArrayFromResponse<RawFinding>(parsed);

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
