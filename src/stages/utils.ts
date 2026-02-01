// Utility functions for AI analysis stages

const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Env interface for stages
export interface StageEnv {
  AI: Ai;
  AI_GATEWAY_ID?: string;
}

export async function runAIAnalysis(
  env: StageEnv,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  console.log("Calling AI with model:", AI_MODEL);

  const response = await env.AI.run(
    AI_MODEL,
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 4096
    },
    env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined
  );

  console.log("AI response type:", typeof response);
  console.log("AI response:", JSON.stringify(response).substring(0, 500));

  // Handle different response formats from Workers AI
  if (typeof response === "string") {
    return response;
  }

  if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;

    // Standard response format
    if ("response" in r && typeof r.response === "string") {
      return r.response;
    }
    // Streaming response collected
    if ("text" in r && typeof r.text === "string") {
      return r.text;
    }
    // Try to stringify the object if nothing else works
    console.log("AI response object keys:", Object.keys(r));
    return JSON.stringify(r);
  }

  // Last resort - return empty for graceful handling
  console.error("Unexpected AI response type:", typeof response);
  return "[]";
}

export function parseJsonResponse<T>(response: string): T {
  // Extract JSON from response - handle markdown code blocks
  let jsonStr = response.trim();

  // Remove markdown code block if present
  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = jsonStr.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch (error) {
    console.error("Failed to parse JSON response:", jsonStr.substring(0, 500));
    throw new Error(`Failed to parse AI response as JSON: ${error}`);
  }
}

export function generateId(prefix: string = ""): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

// Safely extract array from AI response (handles both bare arrays and wrapped objects)
export function extractArrayFromResponse<T>(parsed: unknown, possibleKeys: string[] = ['findings', 'results', 'data', 'items', 'remediations']): T[] {
  if (Array.isArray(parsed)) {
    return parsed as T[];
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Try each possible key
    for (const key of possibleKeys) {
      if (key in obj && Array.isArray(obj[key])) {
        return obj[key] as T[];
      }
    }
    // If it's a single object that looks like a finding, wrap it in an array
    if ('id' in obj || 'title' in obj || 'findingId' in obj) {
      return [parsed as T];
    }
  }

  console.error("Could not extract array from response:", JSON.stringify(parsed).substring(0, 300));
  return [];
}
