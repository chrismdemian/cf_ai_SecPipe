// SecPipe Types - Security Review Pipeline

export type ReviewStatus =
  | "pending"
  | "triaging"
  | "analyzing"
  | "filtering"
  | "awaiting_approval"
  | "remediating"
  | "completed"
  | "failed";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "injection"
  | "auth"
  | "secrets"
  | "dependency"
  | "xss"
  | "ssrf"
  | "path_traversal"
  | "crypto"
  | "other";

export interface Review {
  id: string;
  userId: string;
  code: string;
  language: string;
  status: ReviewStatus;
  createdAt: number;
  updatedAt: number;
  workflowInstanceId?: string;
  totalFindingsRaw: number;
  totalFindingsFiltered: number;
  noiseReductionPercent: number;
  currentStage?: string;
  error?: string;
}

export interface RawFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  location: {
    startLine: number;
    endLine: number;
    snippet: string;
  };
  cweId?: string;
  owaspCategory?: string;
}

export interface Finding extends RawFinding {
  reviewId: string;
  isReachable: boolean;
  reachabilityAnalysis: {
    hasUserInputPath: boolean;
    dataFlowPath?: DataFlowNode[];
    sanitizersInPath?: string[];
    falsePositiveReason?: string;
  };
  approved?: boolean;
  approvedAt?: number;
}

export interface DataFlowNode {
  id: string;
  type: "source" | "sink" | "transform" | "sanitizer" | "validator";
  name: string;
  location: {
    line: number;
    column?: number;
  };
  description: string;
}

export interface DataFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DataFlowMap {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  entryPoints: string[];
  sinks: string[];
}

export interface TriageResult {
  language: string;
  framework?: string;
  codeType:
    | "backend"
    | "frontend"
    | "fullstack"
    | "library"
    | "cli"
    | "unknown";
  dataFlowMap: DataFlowMap;
  entryPoints: EntryPoint[];
  riskAreas: RiskArea[];
}

export interface EntryPoint {
  type: "http" | "websocket" | "cli" | "function" | "event" | "file";
  name: string;
  location: {
    line: number;
    function?: string;
  };
  parameters: string[];
}

export interface RiskArea {
  category: FindingCategory;
  confidence: "high" | "medium" | "low";
  locations: number[];
  reason: string;
}

export interface StageResult {
  id: string;
  reviewId: string;
  stage: PipelineStage;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  output?: unknown;
  error?: string;
}

export type PipelineStage =
  | "triage"
  | "dependency"
  | "auth"
  | "injection"
  | "secrets"
  | "reachability"
  | "synthesis"
  | "approval"
  | "remediation";

export interface Remediation {
  id: string;
  findingId: string;
  reviewId: string;
  originalCode: string;
  fixedCode: string;
  explanation: string;
  diffHunks: DiffHunk[];
  createdAt: number;
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  original: string;
  fixed: string;
}

export interface SynthesisResult {
  totalRaw: number;
  totalFiltered: number;
  noiseReductionPercent: number;
  findingsBySeverity: Record<FindingSeverity, number>;
  findingsByCategory: Record<FindingCategory, number>;
  topRisks: string[];
  summary: string;
}

export interface PipelineParams {
  reviewId: string;
  userId: string;
  code: string;
  language: string;
}

export interface PipelineState {
  triage?: TriageResult;
  rawFindings: RawFinding[];
  filteredFindings: Finding[];
  synthesis?: SynthesisResult;
  remediations: Remediation[];
}

// OAuth/Auth types
export interface AuthProps {
  userId: string;
  login: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

// MCP Tool Input Types
export interface SubmitReviewInput {
  code: string;
  language?: string;
}

export interface CheckStatusInput {
  reviewId: string;
}

export interface GetFindingsInput {
  reviewId: string;
  includeFiltered?: boolean;
}

export interface ApproveFindingsInput {
  reviewId: string;
  findingIds: string[];
}

export interface GetRemediationInput {
  reviewId: string;
  findingId?: string;
}

export interface CompareReviewsInput {
  reviewId1: string;
  reviewId2: string;
}

// AI Response parsing helpers
export interface AIStageResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
