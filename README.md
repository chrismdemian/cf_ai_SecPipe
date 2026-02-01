# cf_ai_SecPipe

An AI-powered security code review application built on Cloudflare's developer platform. Uses **Llama 3.3 70B** to analyze code for vulnerabilities, with intelligent **reachability filtering** to eliminate false positives.

## Live Demo

**Deployed URL:** https://secpipe.chrismdemian.workers.dev/mcp

Try it in the [Cloudflare AI Playground](https://playground.ai.cloudflare.com/) - see [Try It Out](#try-it-out) section below.

## Key Features

- **AI-Powered Analysis**: Uses Llama 3.3 70B to detect SQL injection, XSS, auth issues, secrets, and more
- **Reachability Filtering**: Traces data flow paths to filter out false positives (typically 40-70% noise reduction)
- **Human-in-the-Loop**: Workflow pauses for approval before generating remediation code
- **Auto-Generated Fixes**: AI generates production-ready code fixes for approved vulnerabilities
- **MCP Integration**: Works with Claude Desktop, Cursor, and other MCP-compatible clients

## Cloudflare Components Used

| Component | Service | Purpose |
|-----------|---------|---------|
| **LLM** | Workers AI (Llama 3.3 70B) | Security analysis across 6 specialized stages |
| **Workflow/Coordination** | Workflows + Durable Objects | 9-stage async pipeline with human approval checkpoint |
| **User Input** | MCP Protocol (HTTP) | 7 tools for submitting code, checking status, getting results |
| **Memory/State** | KV Namespace | Persistent storage for reviews, findings, and remediations |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Clients                                │
│           (Claude Desktop, Cursor, AI Playground)               │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP (/mcp)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Cloudflare Worker                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              GitHub OAuth Authentication                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │            SecPipeAgent (Durable Object)                   │ │
│  │  • 7 MCP Tools for security review                        │ │
│  │  • Session management and state                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           SecurityPipelineWorkflow                         │ │
│  │  triage → dependency → auth → injection → secrets          │ │
│  │       → REACHABILITY FILTER → synthesis → remediation      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Workers AI                              │ │
│  │           @cf/meta/llama-3.3-70b-instruct-fp8-fast         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                      │                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   KV Namespace                             │ │
│  │  • Reviews, Findings, Remediations storage                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

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

## Try It Out

### Option 1: Use Deployed Version (Recommended)

1. Open [Cloudflare AI Playground](https://playground.ai.cloudflare.com/)
2. Paste this URL into the MCP Servers section:
   ```
   https://secpipe.chrismdemian.workers.dev/mcp
   ```
3. Authenticate with GitHub when prompted
4. Use the tools with these prompts:

**Step 1 - Submit code for review:**
```
Call submit_review with this code:

app.get('/user', (req, res) => {
  const id = req.query.id;
  db.query(`SELECT * FROM users WHERE id = ${id}`);
});
```

**Step 2 - Check progress (wait 30-60 seconds):**
```
Call check_status with reviewId "<id-from-step-1>"
```

**Step 3 - Get findings (when status is "awaiting_approval"):**
```
Call get_findings with reviewId "<id-from-step-1>"
```

**Step 4 - Approve findings for remediation:**
```
Call approve_findings with reviewId "<id>" and findingIds from step 3
```

**Step 5 - Get generated fixes (wait 10-20 seconds):**
```
Call get_remediation with reviewId "<id>"
```

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
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

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

## Example Output

```
Input Code:
  app.get('/user', (req, res) => {
    const id = req.query.id;
    db.query(`SELECT * FROM users WHERE id = ${id}`);
  });

Pipeline Results:
  ✓ Triage: Mapped 1 source (req.query.id) → 1 sink (db.query)
  ✓ Injection: Found SQL injection vulnerability
  ✓ Auth: Missing authentication middleware detected
  ✓ Reachability: EXPLOITABLE - direct path from user input

Findings: 7 total, 7 exploitable (0% false positives filtered)

Critical Finding: SQL Injection
  Category: injection
  Severity: critical
  Path: req.query.id → template string → db.query()

Remediation Generated:
  Original: db.query(`SELECT * FROM users WHERE id = ${id}`)
  Fixed:    db.query('SELECT * FROM users WHERE id = ?', [id])
  Explanation: Replaced string concatenation with parameterized query.
```

## Project Structure

```
src/
├── index.ts              # Worker entry, routing
├── secpipe-agent.ts      # MCP Agent with 7 tools
├── pipeline-workflow.ts  # Durable async pipeline
├── github-handler.ts     # OAuth authentication
├── types.ts              # TypeScript interfaces
├── prompts/              # AI system prompts
│   ├── triage.ts
│   ├── dependency.ts
│   ├── auth.ts
│   ├── injection.ts
│   ├── secrets.ts
│   ├── reachability.ts   # Key differentiator
│   ├── synthesis.ts
│   └── remediation.ts
└── stages/               # Pipeline stage implementations
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

## License

MIT
