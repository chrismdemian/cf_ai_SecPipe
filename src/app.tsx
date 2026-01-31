import { useEffect, useState } from "react";

// Types matching our backend
interface Review {
  id: string;
  status: string;
  currentStage?: string;
  stats: {
    rawFindings: number;
    exploitableFindings: number;
    noiseReductionPercent: number;
  };
  createdAt: number;
  updatedAt: number;
  error?: string;
}

interface Finding {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  location: {
    startLine: number;
    endLine: number;
    snippet: string;
  };
  isReachable: boolean;
  reachabilityAnalysis: {
    hasUserInputPath: boolean;
    dataFlowPath: Array<{
      name: string;
      type: string;
      description: string;
    }>;
    falsePositiveReason?: string;
  };
}

const PIPELINE_STAGES = [
  { id: "triage", label: "Triage", description: "Data flow mapping" },
  {
    id: "dependency",
    label: "Dependencies",
    description: "Supply chain analysis"
  },
  { id: "auth", label: "Auth", description: "Access control checks" },
  {
    id: "injection",
    label: "Injection",
    description: "SQL/XSS/Command injection"
  },
  { id: "secrets", label: "Secrets", description: "Hardcoded credentials" },
  {
    id: "reachability",
    label: "Reachability",
    description: "Filter false positives"
  },
  { id: "synthesis", label: "Synthesis", description: "Aggregate findings" },
  { id: "approval", label: "Approval", description: "Human review" },
  { id: "remediation", label: "Remediation", description: "Generate fixes" }
];

export default function SecPipeDashboard() {
  const [reviews] = useState<Review[]>([]);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [findings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFiltered, setShowFiltered] = useState(false);

  // Fetch reviews on mount
  useEffect(() => {
    // In a real app, we would connect to WebSocket and fetch from API
    // For now, just set loading to false
    setLoading(false);
  }, []);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "text-green-400";
      case "failed":
        return "text-red-400";
      case "awaiting_approval":
        return "text-yellow-400";
      default:
        return "text-blue-400";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🔒</div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                SecPipe
              </h1>
              <p className="text-xs text-slate-400">
                Security Review Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              MCP Server:{" "}
              <code className="text-purple-400">
                {window.location.origin}/mcp
              </code>
            </div>
            <a
              href="/authorize"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              Connect GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Card */}
        {reviews.length === 0 && !loading && (
          <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 mb-8">
            <div className="text-center max-w-2xl mx-auto">
              <div className="text-6xl mb-6">🛡️</div>
              <h2 className="text-2xl font-bold mb-4">Welcome to SecPipe</h2>
              <p className="text-slate-400 mb-6">
                AI-powered security analysis with{" "}
                <span className="text-purple-400 font-semibold">
                  reachability filtering
                </span>
                . Connect via MCP to start reviewing code.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-purple-400">
                    60-80%
                  </div>
                  <div className="text-sm text-slate-400">Noise Reduction</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-pink-400">7</div>
                  <div className="text-sm text-slate-400">MCP Tools</div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="text-3xl font-bold text-blue-400">9</div>
                  <div className="text-sm text-slate-400">Pipeline Stages</div>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4 text-left">
                <h3 className="font-semibold mb-2">How to connect:</h3>
                <ol className="text-sm text-slate-400 space-y-2">
                  <li>
                    1. Open Claude Desktop, Cursor, or Anthropic AI Playground
                  </li>
                  <li>
                    2. Add MCP server:{" "}
                    <code className="text-purple-400">
                      {window.location.origin}/mcp
                    </code>
                  </li>
                  <li>3. Authenticate with GitHub when prompted</li>
                  <li>
                    4. Use the{" "}
                    <code className="text-green-400">submit_review</code> tool
                    to analyze code
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Available Tools */}
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 mb-8">
          <h2 className="text-lg font-semibold mb-4">Available MCP Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                name: "submit_review",
                desc: "Submit code for security analysis",
                icon: "📤"
              },
              {
                name: "check_status",
                desc: "Check pipeline progress",
                icon: "📊"
              },
              {
                name: "get_findings",
                desc: "Get exploitable vulnerabilities",
                icon: "🔍"
              },
              {
                name: "approve_findings",
                desc: "Approve for remediation",
                icon: "✅"
              },
              {
                name: "get_remediation",
                desc: "Get generated fixes",
                icon: "🔧"
              },
              { name: "list_reviews", desc: "View review history", icon: "📋" },
              {
                name: "compare_reviews",
                desc: "Diff between reviews",
                icon: "🔀"
              }
            ].map((tool) => (
              <div
                key={tool.name}
                className="bg-slate-700/30 rounded-lg p-3 flex items-start gap-3"
              >
                <div className="text-xl">{tool.icon}</div>
                <div>
                  <code className="text-purple-400 text-sm">{tool.name}</code>
                  <p className="text-xs text-slate-400">{tool.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Stages */}
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            Security Pipeline Stages
          </h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map((stage, index) => (
              <div key={stage.id} className="flex items-center">
                <div
                  className={`px-3 py-2 rounded-lg text-center min-w-[100px] ${
                    stage.id === "reachability"
                      ? "bg-gradient-to-r from-purple-500/30 to-pink-500/30 border border-purple-500/50"
                      : "bg-slate-700/50"
                  }`}
                >
                  <div className="text-xs font-medium">{stage.label}</div>
                  <div className="text-[10px] text-slate-400">
                    {stage.description}
                  </div>
                </div>
                {index < PIPELINE_STAGES.length - 1 && (
                  <div className="text-slate-600 mx-1">→</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            <span className="text-purple-400">★ Reachability Filter</span> - The
            key differentiator that eliminates 60-80% of false positives by
            tracing data flow paths.
          </p>
        </div>

        {/* Selected Review Details */}
        {selectedReview && (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">
                  Review {selectedReview.id}
                </h2>
                <p
                  className={`text-sm ${getStatusColor(selectedReview.status)}`}
                >
                  {selectedReview.status}
                  {selectedReview.currentStage &&
                    ` - ${selectedReview.currentStage}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedReview(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Stats */}
            {selectedReview.stats && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">
                    {selectedReview.stats.rawFindings}
                  </div>
                  <div className="text-xs text-slate-400">Raw Findings</div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">
                    {selectedReview.stats.exploitableFindings}
                  </div>
                  <div className="text-xs text-slate-400">Exploitable</div>
                </div>
                <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg p-4 text-center border border-purple-500/30">
                  <div className="text-2xl font-bold text-purple-400">
                    {selectedReview.stats.noiseReductionPercent}%
                  </div>
                  <div className="text-xs text-slate-400">Noise Reduced</div>
                </div>
              </div>
            )}

            {/* Findings */}
            {findings.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Findings</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showFiltered}
                      onChange={(e) => setShowFiltered(e.target.checked)}
                      className="rounded"
                    />
                    Show filtered
                  </label>
                </div>

                <div className="space-y-3">
                  {findings
                    .filter((f) => showFiltered || f.isReachable)
                    .map((finding) => (
                      <div
                        key={finding.id}
                        className={`bg-slate-700/30 rounded-lg p-4 ${
                          !finding.isReachable ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(
                                finding.severity
                              )}`}
                            >
                              {finding.severity}
                            </span>
                            <span className="text-sm font-medium">
                              {finding.title}
                            </span>
                          </div>
                          {!finding.isReachable && (
                            <span className="text-xs text-yellow-400">
                              Filtered
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 mt-2">
                          {finding.description}
                        </p>
                        <div className="mt-2 text-xs text-slate-500">
                          Line {finding.location.startLine}-
                          {finding.location.endLine}
                        </div>

                        {/* Data flow path */}
                        {finding.isReachable &&
                          finding.reachabilityAnalysis.dataFlowPath.length >
                            0 && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <div className="text-xs text-slate-400 mb-2">
                                Data Flow Path:
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {finding.reachabilityAnalysis.dataFlowPath.map(
                                  (node, i) => (
                                    <div key={i} className="flex items-center">
                                      <span className="text-xs bg-slate-600 px-2 py-1 rounded">
                                        {node.name}
                                      </span>
                                      {i <
                                        finding.reachabilityAnalysis
                                          .dataFlowPath.length -
                                          1 && (
                                        <span className="text-slate-500 mx-1">
                                          →
                                        </span>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                        {/* False positive reason */}
                        {!finding.isReachable &&
                          finding.reachabilityAnalysis.falsePositiveReason && (
                            <div className="mt-3 pt-3 border-t border-slate-600">
                              <div className="text-xs text-yellow-400">
                                Why filtered:{" "}
                                {
                                  finding.reachabilityAnalysis
                                    .falsePositiveReason
                                }
                              </div>
                            </div>
                          )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-400 text-sm">
          <p>SecPipe - Remote MCP Security Review Server</p>
          <p className="text-xs mt-2">
            Built with Cloudflare Workers, Durable Objects, Workflows, and
            Workers AI
          </p>
        </div>
      </footer>
    </div>
  );
}
