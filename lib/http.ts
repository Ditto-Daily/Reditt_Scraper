import { RedditDataError } from "./reddit";

/** Streams JSON so large full-thread results are not capped by the 4.5MB response limit. */
export function streamJson(work: () => Promise<unknown>, errorPrefix: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let body: unknown;
      try {
        body = await work();
      } catch (error) {
        const message =
          error instanceof RedditDataError ? error.message : `${errorPrefix}: ${(error as Error)?.message ?? error}`;
        body = { error: message };
      }
      controller.enqueue(encoder.encode(JSON.stringify(body)));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
