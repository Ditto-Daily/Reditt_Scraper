import { badRequest, streamJson } from "@/lib/http";
import { fetchRedditPosts, normalizeSubreddit } from "@/lib/reddit";
import { SORTINGS, TIME_FILTERS, type CommentMode, type Sorting, type TimeFilter } from "@/lib/types";

export const maxDuration = 300;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subreddit = normalizeSubreddit(String(body.subreddit ?? ""));
  if (!subreddit) return badRequest("Enter a subreddit name.");
  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) {
    return badRequest("Enter a valid subreddit name (for example, marketing or smallbusiness).");
  }
  const sorting = SORTINGS.includes(body.sorting as Sorting) ? (body.sorting as Sorting) : "Hot";
  const timeFilter = TIME_FILTERS.includes(body.timeFilter as TimeFilter) ? (body.timeFilter as TimeFilter) : "all";
  const commentMode: CommentMode = body.commentMode === "Full thread" ? "Full thread" : "Top 5";

  return streamJson(
    () =>
      fetchRedditPosts({
        subreddit,
        threadCount: clamp(body.threadCount, 5, 100, 20),
        sorting,
        timeFilter,
        minimumComments: clamp(body.minimumComments, 0, 500, 0),
        minimumScore: clamp(body.minimumScore, 0, 500, 0),
        commentMode,
        commentLimit: clamp(body.commentLimit, 25, 500, 100),
      }).then((result) => ({ ...result, subreddit })),
    "Could not extract Reddit data",
  );
}
