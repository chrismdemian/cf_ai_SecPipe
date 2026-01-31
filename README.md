# SecPipe

A remote MCP (Model Context Protocol) server for AI-powered security code review, built on Cloudflare's developer platform.

## What It Does

SecPipe analyzes code for security vulnerabilities with a key differentiator: **reachability filtering**. While traditional scanners dump 50-200 findings, SecPipe filters down to only the exploitable ones by tracing data flow paths from user input to vulnerable sinks.

**Example output:**
```
8 potential issues found → 3 actually exploitable (62% noise reduction)
```

Each finding includes the exact data flow path showing HOW an attacker could reach the vulnerability.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Clients                                   │
│         (Claude Desktop, Cursor, AI Playground)                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Streamable HTTP (/mcp)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Cloudflare Worker                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              GitHub OAuth Authentication                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              SecPipeAgent (Durable Object)                  │ │
│  │  • 7 MCP Tools for security review                         │ │
│  │  • SQLite storage for reviews, findings, remediations      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           SecurityPipelineWorkflow                          │ │
│  │  triage → dependency → auth → injection → secrets          │ │
│  │       → REACHABILITY FILTER → synthesis → remediation      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Workers AI                                     │ │
│  │              @cf/meta/llama-3.3-70b-instruct-fp8-fast      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Cloudflare Services Used

| Service | Purpose |
|---------|---------|
| **Workers** | HTTP handling, OAuth flow, request routing |
| **Workers AI** | Llama 3.3 70B for all security analysis |
| **Durable Objects** | MCP agent state, per-user session isolation |
| **Durable Object SQL** | Persistent storage for reviews and findings |
| **Workflows** | Durable async pipeline with human-in-the-loop |
| **KV** | OAuth state management |

## MCP Tools

| Tool | Description |
|------|-------------|
| `submit_review` | Submit code for security analysis |
| `check_status` | Get pipeline progress and current stage |
| `get_findings` | Retrieve exploitable findings with noise stats |
| `approve_findings` | Human approval before remediation |
| `get_remediation` | Get AI-generated fixes for approved findings |
| `list_reviews` | View history of all reviews |
| `compare_reviews` | Diff findings between two reviews |

## Security Pipeline Stages

1. **Triage** - Map data flow: sources, sinks, sanitizers
2. **Dependency** - Check for vulnerable dependencies
3. **Auth** - Analyze authentication and access control
4. **Injection** - Detect SQL, XSS, command injection
5. **Secrets** - Find hardcoded credentials
6. **Reachability** - Filter to only exploitable paths (key differentiator)
7. **Synthesis** - Aggregate and deduplicate findings
8. **Approval** - Wait for human review (Workflow pause)
9. **Remediation** - Generate fixes for approved findings

## Try It Out

### Option 1: Use Deployed Version

1. Open [Cloudflare AI Playground](https://playground.ai.cloudflare.com/)
2. Click "Configure MCP" and add this URL:
   ```
   https://secpipe.chrismdemian.workers.dev/mcp
   ```
3. Authenticate with GitHub when prompted
4. Try: "Review this code for security issues: [paste code]"

### Option 2: Run Locally

**Prerequisites:** Node.js 18+, Cloudflare account

```bash
# Clone the repository
git clone https://github.com/chrismdemian/cf_ai_SecPipe.git
cd cf_ai_SecPipe

# Install dependencies
npm install

# Create KV namespace
npx wrangler kv namespace create OAUTH_KV
# Update wrangler.jsonc with the returned ID

# Set up GitHub OAuth app at https://github.com/settings/developers
# - Homepage URL: http://localhost:8787
# - Callback URL: http://localhost:8787/callback

# Set secrets
echo "your-client-id" | npx wrangler secret put GITHUB_CLIENT_ID
echo "your-client-secret" | npx wrangler secret put GITHUB_CLIENT_SECRET

# Run locally
npx wrangler dev

# MCP endpoint available at: http://localhost:8787/mcp
```

### Option 3: Deploy Your Own

```bash
# After local setup, deploy to Cloudflare
npx wrangler deploy

# Your MCP server will be at: https://secpipe.<your-subdomain>.workers.dev/mcp
```

## Project Structure

```
src/
├── index.ts              # Worker entry, routing
├── secpipe-agent.ts      # MCP Agent with 7 tools
├── pipeline-workflow.ts  # Durable async pipeline
├── github-handler.ts     # OAuth authentication
├── types.ts              # TypeScript interfaces
├── schema.ts             # SQL schema
├── prompts/              # AI system prompts (9 files)
│   ├── triage.ts
│   ├── dependency.ts
│   ├── auth.ts
│   ├── injection.ts
│   ├── secrets.ts
│   ├── reachability.ts   # Key differentiator
│   ├── synthesis.ts
│   └── remediation.ts
└── stages/               # Pipeline implementations (10 files)
    ├── triage.ts
    ├── dependency.ts
    ├── auth-analyzer.ts
    ├── injection.ts
    ├── secrets.ts
    ├── reachability.ts   # Filters false positives
    ├── synthesis.ts
    ├── remediation.ts
    └── utils.ts          # AI helper functions
```

## Example Usage

```
User: Review this code for security issues:

app.get('/user', (req, res) => {
  const id = req.query.id;
  db.query(`SELECT * FROM users WHERE id = ${id}`);
});

SecPipe: Starting security review...
  ✓ Triage: Mapped 1 source (req.query.id) → 1 sink (db.query)
  ✓ Injection: Found SQL injection vulnerability
  ✓ Reachability: EXPLOITABLE - direct path from user input to query

Results: 1 exploitable finding (no false positives filtered)

Finding: SQL Injection
  Severity: Critical
  Path: req.query.id → db.query()
  No sanitization detected in path.
```

## License

MIT
