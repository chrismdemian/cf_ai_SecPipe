# SecPipe Development Prompts

A curated collection of prompts used to build the SecPipe AI-powered security code review application.

---

## Phase 0: Initial Project Specification (Megaprompt)

The following megaprompt was used to kickstart the entire project, providing comprehensive specifications for architecture, implementation, and deployment.

---

# SecPipe: Async Security Review Orchestrator via MCP

## A Cloudflare Summer 2026 Software Engineering Internship Project

---

## Table of Contents

1. [What You're Building & Why It Matters](#1-what-youre-building--why-it-matters)
2. [How It Aligns With Cloudflare's Vision](#2-how-it-aligns-with-cloudflares-vision)
3. [Architecture Overview](#3-architecture-overview)
4. [Detailed Pipeline Flow](#4-detailed-pipeline-flow)
5. [Cloudflare Services Used](#5-cloudflare-services-used)
6. [How MCP Client/Server Billing Works](#6-how-mcp-clientserver-billing-works)
7. [Claude Code Setup](#7-claude-code-setup)
8. [Claude Code Prompt (Copy-Paste Ready)](#8-claude-code-prompt-copy-paste-ready)
9. [Deployment & Demo Strategy](#9-deployment--demo-strategy)
10. [README Template for Your Repo](#10-readme-template-for-your-repo)
11. [Interview Talking Points](#11-interview-talking-points)
12. [Your Background & Why You're the Right Candidate](#12-your-background--why-youre-the-right-candidate)

---

## 1. What You're Building & Why It Matters

**SecPipe** is a remote MCP server deployed on Cloudflare's edge that orchestrates multi-stage security analysis of code with **contextual reachability filtering** — meaning it doesn't just find vulnerabilities, it determines which ones are actually exploitable and only reports those. Users connect from any MCP client (Claude Desktop, Claude Code, Cursor, Cloudflare AI Playground) and submit code for review. The server runs an async pipeline of specialized security analysis stages — each powered by Workers AI (Llama 3.3) — that traces data flow from untrusted inputs to vulnerable sinks, filters out non-exploitable findings, and presents only the 3-5 issues that actually matter. Human approval gates via MCP elicitation ensure nobody ships fixes without review. All state persists across sessions via Durable Objects.

### The Industry Problem SecPipe Solves: Vulnerability Fatigue

The #1 complaint in the security tooling industry is **noise.** Tools like Snyk, SonarQube, and traditional SAST scanners dump hundreds of findings on developers — the vast majority of which are non-exploitable. Industry data shows that over 80% of flagged vulnerabilities are irrelevant because the vulnerable code path is never actually reachable from untrusted input. The result is "vulnerability fatigue": developers ignore the alerts entirely, and the real critical issues get buried.

Snyk's own competitors use this as their primary marketing angle. Semgrep, Aikido, Coana, and Wiz all position themselves as "the tool that cuts through Snyk's noise." The industry term for the solution is **reachability analysis** — checking whether untrusted data can actually flow from an entry point to a vulnerable function, rather than just pattern-matching on code.

SecPipe applies this principle using LLM-powered multi-stage analysis: the triage agent maps data flow paths, specialist agents check specific vulnerability categories, and the **reachability filter** agent determines which findings are actually exploitable in context. The synthesis agent then presents only the exploitable findings — typically reducing a raw list of 20-30 potential issues down to 3-5 that genuinely matter.

**The pitch: "Snyk gives you 200 findings and creates alert fatigue. SecPipe gives you 5 that actually matter."**

### Why This Is Not "Just Another AI Code Review Tool"

Tools like CodeRabbit, Greptile, and even Snyk do single-shot analysis: scan code, dump every possible issue. That creates noise, not value. SecPipe is fundamentally different:

| Snyk / CodeRabbit / ChatGPT | SecPipe |
|---|---|
| Dumps 50-200 findings, most non-exploitable | Filters to 3-5 findings that are actually reachable and exploitable |
| No data flow analysis | Traces untrusted input from source to vulnerable sink |
| Single-shot analysis | Multi-stage pipeline where each stage informs the next |
| Stateless — forgets everything | Persistent state — tracks review history across sessions |
| No human approval gates | Elicitation-based approval before remediation |
| Synchronous — blocks until done | Async Tasks — kick off review, come back later for results |
| Closed system | Open MCP server — any client can connect and use it |
| Creates vulnerability fatigue | Eliminates it by only showing what matters |

The value isn't "AI reviews code" — that's commodity. The value is **signal over noise.** SecPipe uses multi-stage orchestration to do what a senior security engineer does: ignore the theoretical issues and focus on what an attacker can actually reach. The async pipeline, persistent state, and human approval gates make this a production-grade security workflow, not a toy demo.

---

## 2. How It Aligns With Cloudflare's Vision

### Primary Source: Cloudflare Blog (March 25, 2025)

Authors: Brendan Irvine-Broque, Dina Kozlov, Glen Maddern
URL: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/

> "Today, the vast majority of MCP servers only expose tools, which are simple remote procedure call (RPC) methods that can be provided by a stateless transport. But more complex human-in-the-loop and agent-to-agent interactions will need prompts and sampling. We expect these types of chatty, two-way interactions will need to be real-time, which will be challenging to do well without a bidirectional transport layer."

> "This opens the door to building stateful MCP servers. Rather than just acting as a stateless layer between a client app and an external API, MCP servers on Cloudflare can themselves be stateful applications — games, a shopping cart plus checkout flow, a persistent knowledge graph, or anything else you can dream up."

### Primary Source: MCP Spec November 2025

URL: https://modelcontextprotocol.io/specification/2025-11-25

The November 2025 spec added **Tasks** (experimental) — async "call-now, fetch-later" primitives — and **sampling with tools** enabling server-side agent loops. These are the two most transformative additions to MCP in its first year, and almost nobody has built real implementations yet.

### Primary Source: Cloudflare Agents SDK Changelog (August 2025)

URL: https://developers.cloudflare.com/changelog/2025-08-05-agents-mcp-update/

Shipped: MCP Elicitation (servers can request user input during tool execution), HTTP Streamable Transport, Task Queues.

### Primary Source: Code Mode Blog Post (September 2025)

URL: https://blog.cloudflare.com/code-mode/

Cloudflare demonstrated that LLMs are better at writing code to call MCP tools than at calling tools directly — cutting token usage by 81%. This shows their continued investment in making MCP the backbone of agent infrastructure.

### The Alignment Map

| Cloudflare's Stated Direction | SecPipe Demonstrates It |
|---|---|
| "Agent-to-agent interactions" | Orchestrator coordinates specialist analysis agents |
| "Sampling" (server asks LLM) | Server-side agent loops for each security stage |
| "Real-time bidirectional" | WebSocket dashboard showing live pipeline progress |
| "Stateful MCP servers" | Durable Objects persist review history across sessions |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              SECPIPE MCP SERVER                                 │
│              (McpAgent on Durable Object)                       │
│                                                                 │
│  Your Cloudflare Account                                        │
│                                                                 │
│  Exposed MCP Tools:                                             │
│  ├─ submit_review(code, language, context)                      │
│  ├─ check_status(review_id)                                     │
│  ├─ get_findings(review_id)                                     │
│  ├─ approve_findings(review_id, approved_ids[])                 │
│  ├─ get_remediation(review_id)                                  │
│  ├─ list_reviews()                                              │
│  └─ compare_reviews(review_id_1, review_id_2)                   │
│                                                                 │
│  State (Durable Object SQL):                                    │
│  ├─ Reviews table (id, code, status, created_at)                │
│  ├─ Findings table (review_id, stage, severity, details)        │
│  ├─ Remediations table (finding_id, fix_code, approved)         │
│  └─ History table (review_id, event, timestamp)                 │
│                                                                 │
│  Pipeline Orchestration:                                        │
│  Parse code → Triage (map data flows) →                         │
│  [Parallel Analysis Stages] → Reachability Filter →             │
│  Synthesize (exploitable only) → Human Approval →               │
│  Remediation → Final Report                                     │
│                                                                 │
│  Analysis Stages:                                               │
│  1. Triage Agent (Data Flow Mapping)                            │
│     → Maps all entry points and data flow paths                 │
│                                                                 │
│  2. Dependency & Supply Chain Scanner                           │
│     → Analyzes imports for known vulnerability patterns         │
│                                                                 │
│  3. Auth & Access Control Analyzer                              │
│     → OAuth flows, JWT, session mgmt, CORS, CSRF                │
│                                                                 │
│  4. Injection & Input Validation Checker                        │
│     → SQLi, XSS, command injection, path traversal              │
│                                                                 │
│  5. Secrets & Configuration Auditor                             │
│     → Hardcoded creds, exposed keys, insecure defaults          │
│                                                                 │
│  6. Reachability Filter (THE KEY DIFFERENTIATOR)                │
│     → Takes ALL raw findings from stages 2-5                    │
│     → Cross-references against triage agent's data flow map     │
│     → Asks: "Can untrusted input actually reach this?"          │
│     → Filters out non-exploitable findings                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Pipeline Flow

### Step 1: User Submits Code

From any MCP client, the user calls the `submit_review` tool:

```json
{
  "tool": "submit_review",
  "arguments": {
    "code": "const app = express();\napp.get('/user/:id', (req, res) => {\n  const query = `SELECT * FROM users WHERE id = ${req.params.id}`;\n  db.query(query, (err, result) => res.json(result));\n});",
    "language": "javascript",
    "context": "Express.js REST API endpoint"
  }
}
```

The server immediately returns a review ID and status. The review runs asynchronously — the user doesn't have to wait.

```json
{
  "review_id": "rev_a1b2c3",
  "status": "running",
  "message": "Security review started. Use check_status('rev_a1b2c3') to monitor progress."
}
```

### Step 2: Triage Agent (Data Flow Mapping)

The orchestrator calls Workers AI (Llama 3.3) with a specialized system prompt. The triage agent does two things: decides which analysis stages to run AND maps data flow paths — identifying where untrusted input enters the code and where it flows to. This data flow map is critical for the reachability filter later.

**System prompt:** "You are a security triage analyst. Given the following code, perform two tasks: (1) Identify which categories of security analysis are needed. (2) Map all data flow paths — identify every entry point where untrusted input enters (HTTP params, request body, query strings, headers, environment variables, file uploads, database reads, etc.) and trace where that input flows to (SQL queries, HTML output, file system operations, shell commands, API calls, etc.). Return a JSON object with: needed_stages (boolean flags), language, framework, entry_points (array of {source, variable, flows_to}), and patterns_detected."

The triage agent analyzes the code and returns:
```json
{
  "needed_stages": {
    "dependency_scan": false,
    "auth_analysis": false,
    "injection_check": true,
    "secrets_audit": true,
    "crypto_review": false
  },
  "language": "javascript",
  "framework": "express",
  "entry_points": [
    {
      "source": "req.params.id",
      "type": "http_route_param",
      "trusted": false,
      "flows_to": ["SQL query string concatenation on line 3"]
    }
  ],
  "patterns_detected": ["raw_sql_query", "user_input_in_query", "no_input_validation"]
}
```

This data flow map is stored in the Durable Object and passed to the reachability filter after all analysis stages complete. This is what allows SecPipe to determine which findings are actually exploitable vs. theoretical.

### Step 3: Parallel Analysis Stages

Based on the triage results, the orchestrator runs the relevant stages. Each stage is a separate Workers AI call with a specialized system prompt.

### Step 4: Reachability Filter (The Key Differentiator)

This is what separates SecPipe from every other security scanning tool. After all specialist agents report their raw findings, the reachability filter agent cross-references them against the triage agent's data flow map.

Example output:
```json
{
  "reachability_results": [
    {
      "finding_id": "F-001",
      "reachable": true,
      "confidence": "high",
      "data_flow_path": "req.params.id → string concatenation → db.query()",
      "reasoning": "User-controlled route parameter is directly concatenated into SQL query with no parameterization, sanitization, or type validation."
    },
    {
      "finding_id": "F-004",
      "reachable": false,
      "confidence": "high",
      "data_flow_path": "N/A",
      "reasoning": "The DEBUG_MODE variable is read from process.env, which is server-side configuration not controllable by external users."
    }
  ],
  "summary": {
    "total_raw_findings": 8,
    "reachable": 3,
    "unreachable": 5,
    "noise_reduction": "62%"
  }
}
```

### Step 5: Synthesis Agent

Aggregates ONLY the reachable/exploitable findings into a focused security report.

### Step 6: Human Approval (Elicitation)

Uses MCP elicitation to present findings to the user and ask for approval before generating remediation code.

### Step 7: Remediation Agent

For each approved finding, generates specific code fixes.

### Step 8: Persistent State

Everything is stored in the Durable Object's SQL database for review history across sessions.

---

## 5. Cloudflare Services Used

| Service | How It's Used | Why It Matters |
|---|---|---|
| **Agents SDK (McpAgent)** | MCP server framework with remote transport | Core of the project |
| **Durable Objects** | Persistent state per user/review session | Shows stateful MCP pattern |
| **Durable Object SQL** | Structured storage for findings, reviews, history | Production-grade data model |
| **Workers AI (Llama 3.3)** | LLM inference for all analysis stages | Required by assignment |
| **Workflows** | Orchestrate multi-step pipeline with retries | Durable execution for long-running analysis |
| **Pages** | Frontend dashboard UI | User input requirement + visual demo |
| **AI Gateway** | Caching, rate limiting, observability on LLM calls | Production awareness |
| **WebSockets** | Real-time status updates to dashboard | Bidirectional comms |
| **OAuth (workers-oauth-provider)** | Authentication for remote MCP server | Security |
| **Task Queues (.queue())** | Background processing of analysis stages | Async execution pattern |

---

## 6. How MCP Client/Server Billing Works

```
┌─────────────────────────────────┐
│  USER'S SIDE                    │
│                                 │
│  Claude Desktop / Cursor / etc  │
│  (Their subscription)           │
│                                 │
│  Pays for:                      │
│  - Understanding user's request │
│  - Deciding to call your tool   │
│  - Formatting results nicely    │
│  - The "outer" conversation     │
└────────────┬────────────────────┘
             │ MCP tool call
             ▼
┌─────────────────────────────────┐
│  YOUR SIDE                      │
│                                 │
│  SecPipe on Cloudflare          │
│  (Your Cloudflare account)      │
│                                 │
│  Pays for:                      │
│  - Workers compute              │
│  - Workers AI inference (Llama) │
│  - Durable Object storage       │
│  - All the security analysis    │
└─────────────────────────────────┘
```

---

## 7. Claude Code Setup

### MCP Servers for Claude Code

Add these to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "command": "npx",
      "args": ["mcp-remote", "https://docs.mcp.cloudflare.com/mcp"]
    },
    "cloudflare-bindings": {
      "command": "npx",
      "args": ["mcp-remote", "https://bindings.mcp.cloudflare.com/mcp"]
    },
    "cloudflare-containers": {
      "command": "npx",
      "args": ["mcp-remote", "https://containers.mcp.cloudflare.com/mcp"]
    }
  }
}
```

### LLM-Friendly Documentation URLs

- **Agents SDK (MAIN):** https://developers.cloudflare.com/agents/llms-full.txt
- **Workers:** https://developers.cloudflare.com/workers/llms-full.txt
- **Workers AI:** https://developers.cloudflare.com/workers-ai/llms-full.txt
- **Durable Objects:** https://developers.cloudflare.com/durable-objects/llms-full.txt
- **Workflows:** https://developers.cloudflare.com/workflows/llms-full.txt
- **AI Gateway:** https://developers.cloudflare.com/ai-gateway/llms-full.txt
- **Pages:** https://developers.cloudflare.com/pages/llms-full.txt

---

## 8. Claude Code Prompt (Copy-Paste Ready)

[Full implementation prompt with context, technical requirements, project structure, MCP tools, analysis stage prompts, state schema, and build steps - see original document for complete details]

---

## 9. Deployment & Demo Strategy

### Your Server URL

```
https://secpipe.<your-subdomain>.workers.dev/mcp
```

### Three Ways a Reviewer Can Test It

**Option A: Cloudflare AI Playground (Zero Setup)**
1. Go to https://playground.ai.cloudflare.com/
2. Click "Add MCP Server"
3. Paste the MCP URL
4. Authenticate via GitHub OAuth
5. Chat: "Review this code for security issues" + paste code

**Option B: Claude Desktop / Claude Code / Cursor**
Add to MCP config and use naturally.

**Option C: Web Dashboard**
Visit the Pages frontend showing live pipeline progress.

---

## 10-12. README Template, Interview Talking Points, Background

[See original document for complete sections on README structure, interview preparation, and candidate positioning]

---

---

## Phase 1: Initial Setup & KV Migration

### Pushing Updates and Migration
> We made some modifications and fixed things with this project, including switching to KV instead of SQL which helped for functionality. The code isn't pushed to my GitHub yet. Before pushing, there are probably other references to SQL that need to be changed to KV - let's get that done.

### Contributor Management
> Remove Claude as a contributor from the repo. Chris Demian should be the only one committing.

---

## Phase 2: Testing & Quality Verification

### Testing the Findings Workflow
> Approve the findings and get the remediation code.

> The remediation count is showing 0. Check the logs - is it still generating or did something go wrong?

### Understanding Output Variations
> It seems like it worked, but why did it give 7 issues this time instead of 2? Was that something we changed or just by chance?

---

## Phase 3: Documentation & README

### README Requirements
> Update the README to make it good and make sure it's up to date. For the MCP configuration, don't say "click configure MCP and add this URL" - just say something like "paste this URL into the MCP Servers section."

> Delete the technical highlights at the bottom.

---

## Phase 4: MCP Integration & Testing

### MCP Configuration
> Add this MCP: https://secpipe.chrismdemian.workers.dev/mcp

### Functional Testing
> My friend sent a request from Cursor to the MCP - check if you can see anything.

> Can you see the security MCP on Claude Code? Are you able to send it requests yourself?

---

## Phase 5: Comprehensive API Testing

### Test Planning
> I want you to plan for testing my API for functionality. Test many different things because you have access to the MCP and understand what it's supposed to do. Everything should work correctly. Find any issues and let me know so we can begin fixing them.

### Fix Implementation
> Fix the issues.

> Did you push the changes?

### Quality Verification
> Test the changes to make sure it didn't break anything. Is the functionality sound? Does it properly work and give tasks to different agents, and does the entire workflow work correctly?

> Is the quality of the outputs good? Does it give legitimate issues and fix them properly using the proper agents, not giving nonsense non-reachable ones?

> Did you commit the changes?

> Test and make sure the entire thing works well with no issues.

---

## Phase 6: UI Redesign Research

### Initial Research Request
> I want to make the UI of https://secpipe.chrismdemian.workers.dev/ better - make it not look vibecoded but a beautiful clean UI with an animated glow outline effect around the MCP Server URL box. Do research to find the best open source frontend UI repos with great designs, MCPs that work well for frontend design with good taste, and Claude skills with similar capabilities. Whatever else you can think of to make a great frontend and frontend workflow.

### Technology Stack Confirmation
> I want what will produce the best results - what's most used in the professional dev community, is simplest to implement for AI, and will look the best.

> Just making sure we're still using React, CSS, Aceternity - what most devs use, right?

### Cloudflare Integration
> If this is a Cloudflare issue, look through the docs and find a solution. I want to be able to build using that setup and have it active at https://secpipe.chrismdemian.workers.dev/. Is that possible without getting too complicated?

---

## Phase 7: UI Implementation & Iteration

### Workflow Improvement Request
> The UI still looks bad. Is there anything like an MCP that takes screenshots of the website so you can iterate visually? Every time you make changes it looks bad. Do some research on other people's frontend workflows with Claude Code.

> Do more research on people's frontend workflows with Claude Code and use the best one or a good combination. I want a professionally designed UI. Look into the frontend skill too.

### Spacing and Layout Adjustments
> Good start. Some issues: the "AI powered security analysis with reachability filtering" text is off-center and on two lines. Everything is too condensed - the noise reduced stats are very close to everything else. The glow border box should be more rectangular with larger height, with the link centered and copy button in the top right.

> Much better now. A few things: add more space between "AI-powered security analysis" and the stats. Add more space between the stats and the MCP server box. The MCP server box should be taller and the link should be centered (it's at the bottom now). The copy button shouldn't have a different colored background - it should just be an icon that turns into a checkmark when clicked. The copy button is overlapping with the border. Add space between the MCP server box and the features below. The "Works with" badges have borders that are too tight.

> The MCP server box is too big now. The link is centered which is good. Remove the "MCP Server" button label. Make the box a bit smaller. Keep the copy button within the borders when you resize.

### Fine-Tuning Spacing
> Great that you figured out how to change spacing. But now it's way too much space. I wanted a little bit of extra space, not that much. The MCP box is too small now - I want it in between with good padding and the link in the middle. The copy button is clipped outside the box - put it back in the top right like before. There's too much space between the box and the features below.

> The box size looks good. The link is at the bottom instead of centered in the middle. The copy button is slightly too big and clipped in the corner - move it inward. Decrease spacing a little bit between "AI powered security analysis" and the stats, and between the stats and the MCP box.

> Basically 90% there, just a few tiny tweaks. Add a little bit of space between "Human-in-the-loop approval" and "Works with". Add a little bit of space between "SecPipe" and "AI-powered security analysis" - move the SecPipe word and logo a little higher.

> You added way too much space between "Works with" and "Human-in-the-loop approval" - I said a little bit, that's a lot. I don't see any space added between the SecPipe logo and the description.

---

## Phase 8: Knowledge Capture

### Saving Learnings
> Now that we finished this UI, I noticed that what we did and what you learned really improved - the first couple UIs you built were really bad, but then you learned a lot along the way. Incorporate your learnings into the CLAUDE.md so that next time I build frontend UIs it'll know what to do and how to do things - not specifically for this project but in general.

> You didn't mention anything about getting real components from libraries.

---

## Phase 9: Documentation & Git Cleanup

### Prompt Export
> For my project I need all the prompts I used to build the entire thing. How would I find these files? Also, did you push the changes to GitHub?

### Git History Cleanup
> Remove Claude as a contributor. Do it for all commits - there are 3 more.

> Just making sure this didn't change any of the pushed code, correct?

### Project Structure
> Is the file structure supposed to look like that? It seems messy with so many files on the main page. Is the project structure in the README updated to reflect what we've changed?

---

## Final Request

### Prompt Compilation
> Look through all the files with our conversations and compile my prompts from the very beginning of this project. Make sure the prompts sound intelligent - like I understand the problem and am just directing you to fix it. Remove prompts that don't add value.
