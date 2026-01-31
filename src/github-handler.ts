// GitHub OAuth Handler for SecPipe
// This handler is used by OAuthProvider for non-MCP routes

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface OAuthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_KV: KVNamespace;
}

// Handler for OAuth and landing page
export default {
  async fetch(
    request: Request,
    env: OAuthEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle OAuth callback
    if (url.pathname === "/callback") {
      return handleCallback(request, env);
    }

    // Handle OAuth authorization redirect
    if (url.pathname === "/authorize") {
      return handleAuthorize(request, env);
    }

    // Serve landing page
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(getLandingPage(), {
        headers: { "Content-Type": "text/html" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<OAuthEnv>;

async function handleAuthorize(
  request: Request,
  env: OAuthEnv
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || crypto.randomUUID();

  // Store state for CSRF protection
  await env.OAUTH_KV.put(`oauth_state:${state}`, "pending", {
    expirationTtl: 600 // 10 minutes
  });

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", `${url.origin}/callback`);
  githubAuthUrl.searchParams.set("scope", "read:user user:email");
  githubAuthUrl.searchParams.set("state", state);

  return Response.redirect(githubAuthUrl.toString(), 302);
}

async function handleCallback(
  request: Request,
  env: OAuthEnv
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`OAuth Error: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Verify state
  const storedState = await env.OAUTH_KV.get(`oauth_state:${state}`);
  if (!storedState) {
    return new Response("Invalid or expired state", { status: 400 });
  }
  await env.OAUTH_KV.delete(`oauth_state:${state}`);

  // Exchange code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code
      })
    }
  );

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    return new Response(
      `Token Error: ${tokenData.error_description || tokenData.error}`,
      { status: 400 }
    );
  }

  // Get user info from GitHub
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "SecPipe-OAuth",
      Accept: "application/vnd.github.v3+json"
    }
  });

  const githubUser = (await userResponse.json()) as GitHubUser;

  // For MCP OAuth flow, we redirect back with the user info encoded
  // The actual token completion happens via the OAuthProvider
  const successUrl = new URL("/", url.origin);
  successUrl.searchParams.set("auth", "success");
  successUrl.searchParams.set("user", githubUser.login);

  return Response.redirect(successUrl.toString(), 302);
}

function getLandingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SecPipe - Security Review Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #e0e0e0;
    }
    .container {
      max-width: 600px;
      padding: 2rem;
      text-align: center;
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .tagline {
      font-size: 1.2rem;
      color: #a0a0a0;
      margin-bottom: 2rem;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: #f5576c;
    }
    .stat-label {
      font-size: 0.9rem;
      color: #888;
    }
    .mcp-url {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 2rem;
    }
    .mcp-url code {
      font-family: 'Fira Code', monospace;
      color: #f093fb;
      word-break: break-all;
    }
    .features {
      text-align: left;
      margin-top: 2rem;
    }
    .feature {
      padding: 0.5rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .feature:last-child { border-bottom: none; }
    .check { color: #4ade80; margin-right: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SecPipe</h1>
    <p class="tagline">AI-Powered Security Review with Reachability Filtering</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">60-80%</div>
        <div class="stat-label">Noise Reduction</div>
      </div>
      <div class="stat">
        <div class="stat-value">3-5</div>
        <div class="stat-label">Real Findings</div>
      </div>
    </div>

    <div class="mcp-url">
      <p style="margin-bottom: 0.5rem; color: #888;">MCP Server URL:</p>
      <code id="mcp-url"></code>
    </div>

    <div class="features">
      <div class="feature"><span class="check">+</span> Data flow-aware reachability analysis</div>
      <div class="feature"><span class="check">+</span> Filters false positives automatically</div>
      <div class="feature"><span class="check">+</span> Human-in-the-loop approval workflow</div>
      <div class="feature"><span class="check">+</span> Generated remediation code</div>
      <div class="feature"><span class="check">+</span> Works with Claude Desktop, Cursor, AI Playground</div>
    </div>
  </div>

  <script>
    document.getElementById('mcp-url').textContent = window.location.origin + '/mcp';
  </script>
</body>
</html>`;
}
