import { getGeminiApiKey, runAiAnalysis } from "@/lib/gemini";
import { badRequest, streamJson } from "@/lib/http";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { prompt, payload } = (await request.json().catch(() => ({}))) as { prompt?: string; payload?: string };
  if (!getGeminiApiKey()) return badRequest("GEMINI_API_KEY is missing from the environment variables.");
  if (!prompt?.trim()) return badRequest("Enter a custom marketing question.");
  return streamJson(async () => ({ text: await runAiAnalysis(prompt, String(payload ?? "")) }), "Gemini analysis failed");
}
