import type {
  Finding,
  SynthesisResult,
  FindingSeverity,
  FindingCategory
} from "../types";
import {
  SYNTHESIS_SYSTEM_PROMPT,
  SYNTHESIS_USER_PROMPT
} from "../prompts/synthesis";
import { parseJsonResponse, runAIAnalysis, type StageEnv } from "./utils";

export async function runSynthesisStage(
  env: StageEnv,
  rawFindingsCount: number,
  filteredFindings: Finding[]
): Promise<SynthesisResult> {
  // Get only reachable findings for the synthesis
  const reachableFindings = filteredFindings.filter((f) => f.isReachable);

  if (reachableFindings.length === 0) {
    // No exploitable findings - return clean report
    return {
      totalRaw: rawFindingsCount,
      totalFiltered: 0,
      noiseReductionPercent: rawFindingsCount > 0 ? 100 : 0,
      findingsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      findingsByCategory: {
        injection: 0,
        auth: 0,
        secrets: 0,
        dependency: 0,
        xss: 0,
        ssrf: 0,
        path_traversal: 0,
        crypto: 0,
        other: 0
      },
      topRisks: [],
      summary:
        "No exploitable security issues were found. All identified patterns were determined to be unreachable or properly mitigated."
    };
  }

  const findingsJson = JSON.stringify(
    reachableFindings.map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      location: f.location,
      reachabilityAnalysis: f.reachabilityAnalysis
    })),
    null,
    2
  );

  const response = await runAIAnalysis(
    env,
    SYNTHESIS_SYSTEM_PROMPT,
    SYNTHESIS_USER_PROMPT(rawFindingsCount, findingsJson)
  );

  const result = parseJsonResponse<SynthesisResult>(response);

  // Ensure all required fields are present
  return {
    totalRaw: result.totalRaw ?? rawFindingsCount,
    totalFiltered: result.totalFiltered ?? reachableFindings.length,
    noiseReductionPercent:
      result.noiseReductionPercent ??
      Math.round(
        ((rawFindingsCount - reachableFindings.length) / rawFindingsCount) *
          100 *
          10
      ) / 10,
    findingsBySeverity: ensureSeverityCounts(
      result.findingsBySeverity,
      reachableFindings
    ),
    findingsByCategory: ensureCategoryCounts(
      result.findingsByCategory,
      reachableFindings
    ),
    topRisks: result.topRisks ?? [],
    summary: result.summary ?? "Security analysis complete."
  };
}

function ensureSeverityCounts(
  counts: Record<FindingSeverity, number> | undefined,
  findings: Finding[]
): Record<FindingSeverity, number> {
  const defaults: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };

  if (counts) {
    return { ...defaults, ...counts };
  }

  // Calculate from findings
  for (const finding of findings) {
    if (finding.severity in defaults) {
      defaults[finding.severity]++;
    }
  }

  return defaults;
}

function ensureCategoryCounts(
  counts: Record<FindingCategory, number> | undefined,
  findings: Finding[]
): Record<FindingCategory, number> {
  const defaults: Record<FindingCategory, number> = {
    injection: 0,
    auth: 0,
    secrets: 0,
    dependency: 0,
    xss: 0,
    ssrf: 0,
    path_traversal: 0,
    crypto: 0,
    other: 0
  };

  if (counts) {
    return { ...defaults, ...counts };
  }

  // Calculate from findings
  for (const finding of findings) {
    if (finding.category in defaults) {
      defaults[finding.category]++;
    }
  }

  return defaults;
}
