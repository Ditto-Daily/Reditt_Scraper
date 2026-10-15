import {
  MAX_KEYWORD_SEARCH_PAGES,
  MAX_POST_SEARCH_PAGES,
  POST_SEARCH_PAGE_SIZE,
  type CommentMode,
  type FetchResult,
  type MatchMode,
  type Row,
  type Sorting,
  type TimeFilter,
} from "./types";

const REDDIT_BASE_URL = "https://www.reddit.com";
const ARCTIC_SHIFT_BASE_URL = "https://arctic-shift.photon-reddit.com/api";
const PULLPUSH_BASE_URL = "https://api.pullpush.io/reddit/search";
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const COMMENT_CONCURRENCY = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; DITTO-Reddit-Intelligence/1.0; +https://dittodaily.com)";

type Json = Record<string, any>;

export class RedditDataError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const toInt = (value: unknown): number => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
};
const toFloat = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeSubreddit(value: string): string {
  let cleaned = value.trim().replace(/\/+$/, "");
  cleaned = cleaned.replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "");
  cleaned = cleaned.replace(/^\/?r\//i, "");
  return cleaned.split("/")[0].trim();
}

export function parseKeywords(value: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of value.split(/[,\n]+/)) {
    const keyword = item.trim();
    const normalized = keyword.toLowerCase();
    if (keyword && !seen.has(normalized)) {
      seen.add(normalized);
      keywords.push(keyword);
    }
  }
  return keywords;
}

/** GET with retries on 429/5xx and network failures, mirroring the old urllib3 policy. */
async function getJson(
  baseUrl: string,
  path: string,
  params: Record<string, string | number>,
  label: "Reddit archive" | "keyword archive",
): Promise<Json> {
  const url = new URL(`${baseUrl}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let response: Response | null = null;
  let lastNetworkError: unknown = null;
  let timedOut = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const retryAfter = Number(response?.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1000 * 2 ** (attempt - 1));
    }
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      lastNetworkError = null;
      timedOut = false;
    } catch (error) {
      response = null;
      lastNetworkError = error;
      timedOut = error instanceof DOMException && error.name === "TimeoutError";
      continue;
    }
    if (!RETRY_STATUSES.has(response.status)) break;
  }

  if (!response) {
    if (timedOut) throw new RedditDataError(`The ${label} timed out. Please try again.`);
    throw new RedditDataError(`Could not connect to the ${label}: ${String(lastNetworkError)}`);
  }
  if (response.status === 404 && label === "Reddit archive") {
    throw new RedditDataError("No matching Reddit archive endpoint was found.");
  }
  if (response.status === 429) {
    throw new RedditDataError(`The ${label} rate limit was reached. Wait and retry.`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    throw new RedditDataError(
      `The ${label} returned HTTP ${response.status}. Try again later.${response.status === 403 ? ` The archive may be blocking this server. ${detail}` : ""}`,
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new RedditDataError(`The ${label} returned an invalid response.`);
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new RedditDataError(`The ${label} returned an unexpected data format.`);
  }
  return result as Json;
}

const arcticShift = (endpoint: string, params: Record<string, string | number>) =>
  getJson(ARCTIC_SHIFT_BASE_URL, endpoint.replace(/^\/+/, ""), params, "Reddit archive");
const pullPush = (endpoint: string, params: Record<string, string | number>) =>
  getJson(PULLPUSH_BASE_URL, `${endpoint.replace(/^\/+|\/+$/g, "")}/`, params, "keyword archive");

const REMOVED = new Set(["[deleted]", "[removed]"]);

function flattenCommentTree(nodes: Json[], maximum: number, collected: string[] = []): string[] {
  for (const node of nodes) {
    if (collected.length >= maximum) break;
    if (!node || typeof node !== "object" || node.kind !== "t1") continue;
    const comment = node.data ?? {};
    const body = String(comment.body ?? "").trim();
    if (body && !REMOVED.has(body)) collected.push(body);
    const children = comment.replies?.data?.children;
    if (comment.replies && typeof comment.replies === "object" && Array.isArray(children)) {
      flattenCommentTree(children, maximum, collected);
    }
  }
  return collected;
}

async function getComments(postId: string, mode: CommentMode, limit: number): Promise<string[]> {
  const id = postId.replace(/^t3_/, "");
  if (mode === "Full thread") {
    const response = await arcticShift("comments/tree", {
      link_id: `t3_${id}`,
      limit,
      start_breadth: limit,
      start_depth: limit,
    });
    return Array.isArray(response.data) ? flattenCommentTree(response.data, limit) : [];
  }
  const response = await arcticShift("comments/search", {
    link_id: id,
    parent_id: "",
    limit: 25,
    sort: "desc",
    fields: "body,score,parent_id,created_utc",
  });
  const comments: Json[] = Array.isArray(response.data) ? response.data : [];
  return comments
    .filter((c) => c && typeof c === "object" && String(c.body ?? "").trim() && !REMOVED.has(String(c.body).trim()))
    .sort((a, b) => toInt(b.score) - toInt(a.score))
    .slice(0, 5)
    .map((c) => String(c.body).trim());
}

const PERIODS_MS: Record<string, number> = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

function timeCutoffSeconds(filter: TimeFilter): number | null {
  const period = PERIODS_MS[filter];
  return period === undefined ? null : Math.floor((Date.now() - period) / 1000);
}

function rankPosts(posts: Json[], sorting: Sorting): Json[] {
  const now = Date.now() / 1000;
  const ageHours = (p: Json) => Math.max((now - (Number(p.created_utc) || now)) / 3600, 0);
  const score = (p: Json) => toInt(p.score);
  const comments = (p: Json) => toInt(p.num_comments);
  const sorted = [...posts];
  if (sorting === "New") return sorted.sort((a, b) => toFloat(b.created_utc) - toFloat(a.created_utc));
  if (sorting === "Top") return sorted.sort((a, b) => score(b) - score(a));
  if (sorting === "Most Discussed") {
    return sorted.sort((a, b) => comments(b) - comments(a) || score(b) - score(a));
  }
  if (sorting === "Rising") {
    const key = (p: Json) => (score(p) + 2 * comments(p)) / (ageHours(p) + 1.5) ** 1.6;
    return sorted.sort((a, b) => key(b) - key(a));
  }
  const key = (p: Json) =>
    Math.log1p(Math.max(score(p), 0) + 2 * Math.max(comments(p), 0)) / (ageHours(p) + 2.0) ** 1.1;
  return sorted.sort((a, b) => key(b) - key(a));
}

function formatCreated(epochSeconds: unknown): string {
  const date = new Date(toFloat(epochSeconds) * 1000);
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "+00:00");
}

async function buildRows(
  selected: Json[],
  fallbackSubreddit: string,
  mode: CommentMode,
  limit: number,
): Promise<{ rows: Row[]; commentWarning: string | null }> {
  let commentWarning: string | null = null;
  let fetchComments = true;
  const commentsByIndex: string[][] = selected.map(() => []);
  let next = 0;

  // Small worker pool: faster than one-by-one, and stops once the archive starts failing.
  const worker = async () => {
    while (fetchComments && next < selected.length) {
      const index = next++;
      const postId = String(selected[index].id ?? "");
      if (!postId) continue;
      try {
        commentsByIndex[index] = await getComments(postId, mode, limit);
      } catch (error) {
        if (!(error instanceof RedditDataError)) throw error;
        commentWarning = error.message;
        fetchComments = false;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(COMMENT_CONCURRENCY, selected.length) }, worker));

  const rows = selected.map((post, index): Row => {
    const permalink = String(post.permalink ?? "");
    const postId = String(post.id ?? "");
    const comments = commentsByIndex[index];
    return {
      Title: post.title ?? "",
      Body: post.selftext || "",
      Subreddit: post.subreddit || fallbackSubreddit,
      Score: toInt(post.score),
      "Comments Count": toInt(post.num_comments),
      "Upvote Ratio": toFloat(post.upvote_ratio),
      URL: permalink ? `${REDDIT_BASE_URL}${permalink}` : `${REDDIT_BASE_URL}/comments/${postId}/`,
      "Extracted Comments": comments.join("\n\n"),
      "Extracted Comments Count": comments.length,
      Author: post.author || "[deleted]",
      "Created UTC": formatCreated(post.created_utc),
    };
  });
  return { rows, commentWarning };
}

export async function fetchRedditPosts(opts: {
  subreddit: string;
  threadCount: number;
  sorting: Sorting;
  timeFilter: TimeFilter;
  minimumComments: number;
  minimumScore: number;
  commentMode: CommentMode;
  commentLimit: number;
}): Promise<FetchResult> {
  const params: Record<string, string | number> = {
    subreddit: opts.subreddit,
    limit: POST_SEARCH_PAGE_SIZE,
    sort: "desc",
  };
  if (opts.sorting === "Top") {
    const cutoff = timeCutoffSeconds(opts.timeFilter);
    if (cutoff) params.after = new Date(cutoff * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  }

  const eligible = (p: Json) =>
    toInt(p.num_comments) >= opts.minimumComments && toInt(p.score) >= opts.minimumScore;
  const posts: Json[] = [];
  const seen = new Set<string>();
  let eligibleCount = 0;
  let before: number | null = null;

  for (let page = 0; page < MAX_POST_SEARCH_PAGES; page++) {
    const pageParams = before !== null ? { ...params, before } : params;
    const response = await arcticShift("posts/search", pageParams);
    const pagePosts: Json[] = (Array.isArray(response.data) ? response.data : []).filter(
      (p: unknown) => p && typeof p === "object",
    );
    if (!pagePosts.length) break;

    const fresh: Json[] = [];
    for (const post of pagePosts) {
      const id = String(post.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      fresh.push(post);
    }
    if (!fresh.length) break;

    posts.push(...fresh);
    eligibleCount += fresh.filter(eligible).length;
    if (eligibleCount >= opts.threadCount) break;

    const oldest = Math.min(...fresh.map((p) => toInt(p.created_utc)));
    if (oldest <= 0) break;
    before = oldest;
  }

  const selected = rankPosts(posts.filter(eligible), opts.sorting).slice(0, opts.threadCount);
  const { rows, commentWarning } = await buildRows(selected, opts.subreddit, opts.commentMode, opts.commentLimit);
  return { records: rows, commentWarning, searchedPostCount: posts.length };
}

function postMatchesKeywords(post: Json, keywords: string[], mode: MatchMode): boolean {
  const text = `${post.title ?? ""} ${post.selftext ?? ""}`.toLowerCase();
  const matches = keywords.map((k) => text.includes(k.toLowerCase()));
  return mode === "All keywords (AND)" ? matches.every(Boolean) : matches.some(Boolean);
}

export async function fetchKeywordPosts(opts: {
  keywords: string[];
  matchMode: MatchMode;
  threadCount: number;
  sorting: Sorting;
  timeFilter: TimeFilter;
  minimumComments: number;
  minimumScore: number;
  commentMode: CommentMode;
  commentLimit: number;
}): Promise<FetchResult> {
  const cutoff = timeCutoffSeconds(opts.timeFilter);
  const queries =
    opts.matchMode === "All keywords (AND)" && opts.keywords.length > 1
      ? [opts.keywords.join(" ")]
      : opts.keywords;
  const beforeByQuery = new Map<string, number | null>(queries.map((q) => [q, null]));
  const active = new Set(queries);
  const postsById = new Map<string, Json>();
  let eligiblePosts: Json[] = [];

  for (let page = 0; page < MAX_KEYWORD_SEARCH_PAGES; page++) {
    for (const query of [...active]) {
      const params: Record<string, string | number> = {
        q: query,
        size: POST_SEARCH_PAGE_SIZE,
        sort: "desc",
        sort_type: "created_utc",
      };
      if (cutoff !== null) params.after = cutoff;
      const before = beforeByQuery.get(query);
      if (before !== null && before !== undefined) params.before = before;

      const response = await pullPush("submission", params);
      const pagePosts: Json[] = (Array.isArray(response.data) ? response.data : []).filter(
        (p: unknown) => p && typeof p === "object",
      );
      if (!pagePosts.length) {
        active.delete(query);
        continue;
      }
      const stamps = pagePosts.map((p) => toInt(p.created_utc)).filter((t) => t > 0);
      if (stamps.length) beforeByQuery.set(query, Math.min(...stamps));
      else active.delete(query);

      for (const post of pagePosts) {
        const id = String(post.id ?? "");
        if (id) postsById.set(id, post);
      }
    }

    eligiblePosts = [...postsById.values()].filter(
      (p) =>
        postMatchesKeywords(p, opts.keywords, opts.matchMode) &&
        toInt(p.num_comments) >= opts.minimumComments &&
        toInt(p.score) >= opts.minimumScore,
    );
    if (eligiblePosts.length >= opts.threadCount || active.size === 0) break;
  }

  const selected = rankPosts(eligiblePosts, opts.sorting).slice(0, opts.threadCount);
  const { rows, commentWarning } = await buildRows(selected, "", opts.commentMode, opts.commentLimit);
  return { records: rows, commentWarning, searchedPostCount: postsById.size };
}
