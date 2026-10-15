export type Sorting = "Hot" | "New" | "Top" | "Rising" | "Most Discussed";
export type TimeFilter = "all" | "year" | "month" | "week" | "day";
export type CommentMode = "Top 5" | "Full thread";
export type MatchMode = "All keywords (AND)" | "Any keyword (OR)";

export const SORTINGS: Sorting[] = ["Hot", "New", "Top", "Rising", "Most Discussed"];
export const TIME_FILTERS: TimeFilter[] = ["all", "year", "month", "week", "day"];

export const MAX_KEYWORDS = 5;
export const POST_SEARCH_PAGE_SIZE = 100;
export const MAX_POST_SEARCH_PAGES = 50;
export const MAX_KEYWORD_SEARCH_PAGES = 10;
export const MAX_AI_PAYLOAD_CHARS = 30_000;
export const MAX_ADDITIONAL_CONTEXT_CHARS = 10_000;
export const MAX_CHAT_HISTORY_MESSAGES = 12;

export interface Row {
  Title: string;
  Body: string;
  Subreddit: string;
  Score: number;
  "Comments Count": number;
  "Upvote Ratio": number;
  URL: string;
  "Extracted Comments": string;
  "Extracted Comments Count": number;
  Author: string;
  "Created UTC": string;
}

export interface FetchResult {
  records: Row[];
  commentWarning: string | null;
  searchedPostCount: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
