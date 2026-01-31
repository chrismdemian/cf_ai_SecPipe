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
  const response = await env.AI.run(
    AI_MODEL,
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 8192
    },
    env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined
  );

  // Handle different response formats from Workers AI
  if (typeof response === "string") {
    return response;
  }

  if (response && typeof response === "object") {
    // Standard response format
    if ("response" in response && typeof response.response === "string") {
      return response.response;
    }
    // Streaming response collected
    if ("text" in response && typeof response.text === "string") {
      return response.text;
    }
  }

  throw new Error("Unexpected AI response format");
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
