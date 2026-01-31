# AI Prompts Used

This document contains the AI prompts used to develop SecPipe.

## Development Prompts

### Initial Planning Prompt

```
I want to build a remote MCP security review server for the Cloudflare Software Engineer
Internship application. The key differentiator should be a reachability filter that
eliminates non-exploitable findings, reducing noise by 60-80%.

The server should:
- Expose MCP tools over Streamable HTTP
- Use Workers AI with Llama 3.3 for analysis
- Store state in Durable Objects with SQL
- Run an async pipeline using Workflows
- Include human-in-the-loop approval via waitForEvent
- Authenticate users via GitHub OAuth

Can you help me plan the architecture and implementation?
```

### Implementation Prompt

```
Implement the following plan for SecPipe:

- Create a McpAgent class with 7 MCP tools (submit_review, check_status, get_findings,
  approve_findings, get_remediation, list_reviews, compare_reviews)
- Implement a 9-stage security pipeline as a Cloudflare Workflow
- Create system prompts for each analysis stage
- Set up GitHub OAuth for authentication
- Configure wrangler.jsonc with all required bindings
```

### Code Review Prompts

```
Does my project follow the instructions? I'm mostly concerned about the readme - is it good?
```

```
Clean up the project structure - remove unused template files from the agents-starter
scaffold that aren't needed for SecPipe.
```

## System Prompts (Used in Production)

These prompts are sent to Llama 3.3 during security analysis. See `src/prompts/` for full implementations.

### Triage Stage (`src/prompts/triage.ts`)

```
You are a security triage specialist. Analyze code to map data flow.

Identify:
1. SOURCES - Where user input enters (req.body, req.query, req.params, etc.)
2. SINKS - Where data is used dangerously (SQL queries, exec(), innerHTML, etc.)
3. SANITIZERS - Functions that validate/escape data (escape(), parseInt(), etc.)

Return a data flow map as JSON with nodes and edges.
```

### Reachability Filter (`src/prompts/reachability.ts`)

```
You are a reachability analysis expert. Given a list of potential vulnerabilities and
a data flow map, determine which findings are actually exploitable.

For each finding:
1. Is there a complete path from user-controlled SOURCE to vulnerable SINK?
2. Are there SANITIZERS in the path that neutralize the threat?
3. Is the vulnerable code actually reachable during normal execution?

Mark unreachable findings with falsePositiveReason. This is the key filter that
reduces noise - be thorough but accurate.
```

### Injection Detection (`src/prompts/injection.ts`)

```
You are an injection vulnerability specialist. Analyze code for:

1. SQL Injection - String concatenation in queries, missing parameterization
2. XSS - Unsanitized output to HTML, missing encoding
3. Command Injection - User input in exec/spawn calls
4. Path Traversal - User input in file paths

For each finding, identify the exact source and sink locations.
Return findings as JSON array.
```

### Remediation Generation (`src/prompts/remediation.ts`)

```
You are a security remediation expert. Given a vulnerability finding with its
data flow path, generate a fix.

Requirements:
1. Minimal changes - only fix the security issue
2. Preserve existing functionality
3. Use framework-appropriate solutions (parameterized queries, built-in escapers)
4. Include before/after code snippets

Return remediation as JSON with original code, fixed code, and explanation.
```

## Prompt Engineering Notes

### Temperature Settings
- Analysis stages: `temperature: 0.1` (deterministic, consistent)
- Remediation: `temperature: 0.2` (slight creativity for solutions)

### JSON Output Strategy
All prompts end with explicit JSON schema requirements to ensure parseable output:
```
Return your analysis as JSON matching this schema:
{
  "findings": [...],
  "summary": "..."
}
```

### Context Management
Each stage receives only the context it needs:
- Triage: Full code
- Analyzers: Code + triage results (data flow map)
- Reachability: Code + all raw findings + data flow map
- Remediation: Code + single approved finding
