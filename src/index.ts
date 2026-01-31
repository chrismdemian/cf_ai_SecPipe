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

// Main worker handler
export default {
  async fetch(
    request: Request,
    env: SecPipeWorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Route /mcp to the SecPipe MCP Agent
    if (url.pathname.startsWith("/mcp")) {
      return SecPipeAgent.mount("/mcp").fetch(request, env, ctx);
    }

    // All other routes go to the GitHub handler (landing page, OAuth)
    return GitHubHandler.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<SecPipeWorkerEnv>;
