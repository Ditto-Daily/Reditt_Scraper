import { badRequest, streamJson } from "@/lib/http";
import { fetchKeywordPosts, parseKeywords } from "@/lib/reddit";
import {
  MAX_KEYWORDS,
  SORTINGS,
  TIME_FILTERS,
  type CommentMode,
  type MatchMode,
  type Sorting,
  type TimeFilter,
} from "@/lib/types";

export const maxDuration = 300;

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const keywords = parseKeywords(String(body.keywords ?? ""));
  if (!keywords.length) return badRequest("Enter at least one keyword.");
  if (keywords.length > MAX_KEYWORDS) return badRequest(`Enter no more than ${MAX_KEYWORDS} keywords.`);
  if (keywords.some((k) => k.length > 100)) return badRequest("Each keyword must be 100 characters or fewer.");

  const matchMode: MatchMode =
    keywords.length > 1 && body.matchMode === "All keywords (AND)" ? "All keywords (AND)" : "Any keyword (OR)";
  const sorting = SORTINGS.includes(body.sorting as Sorting) ? (body.sorting as Sorting) : "Hot";
  const timeFilter = TIME_FILTERS.includes(body.timeFilter as TimeFilter) ? (body.timeFilter as TimeFilter) : "all";
  const commentMode: CommentMode = body.commentMode === "Full thread" ? "Full thread" : "Top 5";

  return streamJson(
    () =>
      fetchKeywordPosts({
        keywords,
        matchMode,
        threadCount: clamp(body.threadCount, 5, 100, 20),
        sorting,
        timeFilter,
        minimumComments: clamp(body.minimumComments, 0, 500, 0),
        minimumScore: clamp(body.minimumScore, 0, 500, 0),
        commentMode,
        commentLimit: clamp(body.commentLimit, 25, 500, 100),
      }),
    "Could not complete the keyword search",
  );
}
