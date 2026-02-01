// SecPipe - Security Review MCP Server
// Main entry point

import { SecPipeAgent } from "./secpipe-agent";
import GitHubHandler from "./github-handler";

// Export the Durable Object class and Workflow
export { SecPipeAgent } from "./secpipe-agent";
export { SecurityPipelineWorkflow } from "./pipeline-workflow";

// Environment interface
interface SecPipeWorkerEnv {
  AI: Ai;
  SECPIPE_AGENT: DurableObjectNamespace;
  SECPIPE_WORKFLOW: Workflow;
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AI_GATEWAY_ID?: string;
}

// Custom handler that routes all MCP requests to a single shared DO
async function handleMcpRequest(
  request: Request,
  env: SecPipeWorkerEnv,
  ctx: ExecutionContext
): Promise<Response> {
  // Use a single shared DO for all users (demo mode)
  // In production, you'd use the authenticated user's ID
  const doId = env.SECPIPE_AGENT.idFromName("secpipe-shared");
  const stub = env.SECPIPE_AGENT.get(doId);

  // Forward the request to the DO
  return stub.fetch(request);
}

// Main worker handler
export default {
  async fetch(
    request: Request,
    env: SecPipeWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Route /mcp to the SecPipe MCP Agent (shared DO)
    if (url.pathname.startsWith("/mcp")) {
      return handleMcpRequest(request, env, ctx);
    }

    // All other routes go to the GitHub handler (landing page, OAuth)
    return GitHubHandler.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<SecPipeWorkerEnv>;
