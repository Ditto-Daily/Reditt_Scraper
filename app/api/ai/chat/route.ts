import { getGeminiApiKey, runAiChatTurn } from "@/lib/gemini";
import { badRequest, streamJson } from "@/lib/http";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    history?: ChatMessage[];
    payload?: string;
    additionalContext?: string;
  };
  if (!getGeminiApiKey()) return badRequest("GEMINI_API_KEY is missing from the environment variables.");
  if (!body.question?.trim()) return badRequest("Ask a question.");
  return streamJson(
    async () => ({
      text: await runAiChatTurn(
        body.question!,
        Array.isArray(body.history) ? body.history : [],
        String(body.payload ?? ""),
        String(body.additionalContext ?? ""),
      ),
    }),
    "Gemini chat failed",
  );
}
