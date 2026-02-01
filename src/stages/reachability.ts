import type { RawFinding, Finding, DataFlowMap, DataFlowNode } from "../types";
import {
  REACHABILITY_SYSTEM_PROMPT,
  REACHABILITY_USER_PROMPT
} from "../prompts/reachability";
import { parseJsonResponse, runAIAnalysis, extractArrayFromResponse, type StageEnv } from "./utils";

interface ReachabilityResult {
  id: string;
  isReachable: boolean;
  reachabilityAnalysis: {
    hasUserInputPath: boolean;
    dataFlowPath?: DataFlowNode[];
    sanitizersInPath?: string[];
    falsePositiveReason?: string;
  };
}

export async function runReachabilityFilter(
  env: StageEnv,
  code: string,
  rawFindings: RawFinding[],
  dataFlowMap: DataFlowMap,
  reviewId: string
): Promise<Finding[]> {
  if (rawFindings.length === 0) {
    return [];
  }

  const findingsJson = JSON.stringify(rawFindings, null, 2);
  const dataFlowJson = JSON.stringify(dataFlowMap, null, 2);

  const response = await runAIAnalysis(
    env,
    REACHABILITY_SYSTEM_PROMPT,
    REACHABILITY_USER_PROMPT(code, findingsJson, dataFlowJson)
  );

  let reachabilityResults: ReachabilityResult[] = [];
  try {
    const parsed = parseJsonResponse<unknown>(response);
    reachabilityResults = extractArrayFromResponse<ReachabilityResult>(parsed);
  } catch (error) {
    console.error("Reachability parse error:", error);
    // Continue with empty results - all findings will be marked reachable
  }

  // Create a map of reachability results by finding ID
  const reachabilityMap = new Map<string, ReachabilityResult>();
  for (const result of reachabilityResults) {
    reachabilityMap.set(result.id, result);
  }

  // Issue #2 Fix: Categories and CWEs that should ALWAYS be marked as reachable
  // Secrets are always exploitable since they're exposed in code regardless of user input
  const alwaysReachableCategories = new Set(["secrets"]);
  // CWE-798 = Use of Hard-coded Credentials - always a real vulnerability
  const alwaysReachableCWEs = new Set(["CWE-798"]);

  // Merge raw findings with reachability analysis
  const findings: Finding[] = rawFindings.map((rawFinding) => {
    const reachability = reachabilityMap.get(rawFinding.id);

    // Force secrets to always be reachable - they're exposed in code
    // Check both category AND CWE (hardcoded credentials can come from any analyzer)
    const isSecretsFinding = alwaysReachableCategories.has(rawFinding.category) ||
      (rawFinding.cweId && alwaysReachableCWEs.has(rawFinding.cweId));

    if (reachability) {
      return {
        ...rawFinding,
        reviewId,
        // Secrets are always reachable, otherwise use AI determination
        isReachable: isSecretsFinding ? true : reachability.isReachable,
        reachabilityAnalysis: {
          hasUserInputPath: isSecretsFinding
            ? false // Secrets don't need user input to be exploitable
            : (reachability.reachabilityAnalysis.hasUserInputPath ?? false),
          dataFlowPath: reachability.reachabilityAnalysis.dataFlowPath || [],
          sanitizersInPath:
            reachability.reachabilityAnalysis.sanitizersInPath || [],
          falsePositiveReason: isSecretsFinding
            ? undefined // Clear any false positive reason for secrets
            : reachability.reachabilityAnalysis.falsePositiveReason
        }
      };
    }

    // If no reachability result, assume reachable (safer default)
    return {
      ...rawFinding,
      reviewId,
      isReachable: true,
      reachabilityAnalysis: {
        hasUserInputPath: !isSecretsFinding, // Secrets don't need user input
        dataFlowPath: [],
        sanitizersInPath: [],
        falsePositiveReason: undefined
      }
    };
  });

  return findings;
}

// Helper to calculate noise reduction statistics
export function calculateNoiseReduction(findings: Finding[]): {
  total: number;
  reachable: number;
  filtered: number;
  noiseReductionPercent: number;
} {
  const total = findings.length;
  const reachable = findings.filter((f) => f.isReachable).length;
  const filtered = total - reachable;
  const noiseReductionPercent =
    total > 0 ? Math.round((filtered / total) * 100 * 10) / 10 : 0;

  return {
    total,
    reachable,
    filtered,
    noiseReductionPercent
  };
}
