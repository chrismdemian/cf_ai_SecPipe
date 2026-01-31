/* eslint-disable */
// SecPipe Environment Types

import type { SecPipeAgent } from "./src/secpipe-agent";
import type { SecurityPipelineWorkflow } from "./src/pipeline-workflow";

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/index");
		durableNamespaces: "SecPipeAgent";
	}
	interface Env {
		// Workers AI
		AI: Ai;

		// Durable Objects
		SECPIPE_AGENT: DurableObjectNamespace<SecPipeAgent>;

		// Workflows
		SECPIPE_WORKFLOW: Workflow;

		// KV Namespace for OAuth
		OAUTH_KV: KVNamespace;

		// Secrets (set via wrangler secret)
		GITHUB_CLIENT_ID: string;
		GITHUB_CLIENT_SECRET: string;

		// Optional: AI Gateway ID for observability
		AI_GATEWAY_ID?: string;
	}
}

interface Env extends Cloudflare.Env {}

type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};

declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET">> {}
}

// Workflow type declarations
interface Workflow {
	create(options: { id: string; params: unknown }): Promise<WorkflowInstance>;
	get(id: string): Promise<WorkflowInstance>;
}

interface WorkflowInstance {
	id: string;
	status: () => Promise<WorkflowStatus>;
	sendEvent(name: string, payload: unknown): Promise<void>;
}

interface WorkflowStatus {
	status: "queued" | "running" | "paused" | "complete" | "errored";
	error?: string;
}
