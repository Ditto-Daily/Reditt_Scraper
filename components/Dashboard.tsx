"use client";

import { useMemo, useState } from "react";

import { buildAiPayload, getTopNgrams, toCsv } from "@/lib/analytics";
import { ANALYSIS_TEMPLATES, CUSTOM_TEMPLATE } from "@/lib/templates";
import {
  MAX_ADDITIONAL_CONTEXT_CHARS,
  MAX_KEYWORDS,
  MAX_POST_SEARCH_PAGES,
  POST_SEARCH_PAGE_SIZE,
  SORTINGS,
  TIME_FILTERS,
  type ChatMessage,
  type FetchResult,
  type MatchMode,
  type Row,
} from "@/lib/types";
import { Markdown } from "./Markdown";

type Msg = { kind: "success" | "warning" | "error" | "info"; text: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Your session has expired.");
  }
  const text = await response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      response.status === 504 || response.status === 502
        ? "The request timed out. Try fewer threads or Top 5 comments."
        : `Unexpected server response (HTTP ${response.status}).`,
    );
  }
  if (parsed?.error) throw new Error(parsed.error);
  return parsed as T;
}

function Messages({ items }: { items: Msg[] }) {
  return (
    <>
      {items.map((m, i) => (
        <div key={i} className={`msg ${m.kind}`}>{m.text}</div>
      ))}
    </>
  );
}

function Slider(props: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; disabled?: boolean; help?: string;
}) {
  return (
    <div className={`field ${props.disabled ? "disabled" : ""}`} title={props.help}>
      <label>{props.label}</label>
      <span className="value">{props.value}</span>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value}
        disabled={props.disabled} onChange={(e) => props.onChange(Number(e.target.value))} />
    </div>
  );
}

function Select<T extends string>(props: {
  label: string; value: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; help?: string;
}) {
  return (
    <div className={`field ${props.disabled ? "disabled" : ""}`} title={props.help}>
      <label>{props.label}</label>
      <select value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (v: number) => void; help?: string }) {
  return (
    <div className="field" title={props.help}>
      <label>{props.label}</label>
      <input type="number" min={0} max={500} step={1} value={props.value}
        onChange={(e) => props.onChange(Math.min(500, Math.max(0, Math.trunc(Number(e.target.value)) || 0)))} />
    </div>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input type="text" value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

const COMMENT_MODES = ["Top 5 comments", "Full thread"] as const;
const MATCH_MODES: readonly MatchMode[] = ["All keywords (AND)", "Any keyword (OR)"];

function parseKeywordPreview(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[,\n]+/).map((k) => k.trim()).filter((k) => {
    const n = k.toLowerCase();
    if (!k || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
}

export function Dashboard({ aiConfigured }: { aiConfigured: boolean }) {
  // Community search
  const [subreddit, setSubreddit] = useState("");
  const [threadCount, setThreadCount] = useState(20);
  const [sorting, setSorting] = useState<(typeof SORTINGS)[number]>("Hot");
  const [timeFilter, setTimeFilter] = useState<(typeof TIME_FILTERS)[number]>("all");
  const [minComments, setMinComments] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [commentMode, setCommentMode] = useState<(typeof COMMENT_MODES)[number]>("Top 5 comments");
  const [commentLimit, setCommentLimit] = useState(100);
  const [subMsgs, setSubMsgs] = useState<Msg[]>([]);
  const [subLoading, setSubLoading] = useState<string | null>(null);

  // Keyword search
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<MatchMode>("All keywords (AND)");
  const [kwThreadCount, setKwThreadCount] = useState(20);
  const [kwSorting, setKwSorting] = useState<(typeof SORTINGS)[number]>("Hot");
  const [kwTimeFilter, setKwTimeFilter] = useState<(typeof TIME_FILTERS)[number]>("all");
  const [kwMinComments, setKwMinComments] = useState(0);
  const [kwMinScore, setKwMinScore] = useState(0);
  const [kwCommentMode, setKwCommentMode] = useState<(typeof COMMENT_MODES)[number]>("Top 5 comments");
  const [kwCommentLimit, setKwCommentLimit] = useState(100);
  const [kwMsgs, setKwMsgs] = useState<Msg[]>([]);
  const [kwLoading, setKwLoading] = useState<string | null>(null);

  // Results + AI
  const [data, setData] = useState<Row[]>([]);
  const [template, setTemplate] = useState(Object.keys(ANALYSIS_TEMPLATES)[0]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisMsgs, setAnalysisMsgs] = useState<Msg[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatMsgs, setChatMsgs] = useState<Msg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const keywordPreview = useMemo(() => parseKeywordPreview(keywords), [keywords]);
  const ngrams = useMemo(() => getTopNgrams(data), [data]);
  const csvHref = useMemo(
    () => (data.length ? URL.createObjectURL(new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" })) : ""),
    [data],
  );

  function loadResults(result: FetchResult) {
    setData(result.records);
    setAnalysis("");
    setChat([]);
    setChatMsgs([]);
    setAnalysisMsgs([]);
  }

  async function extractSubreddit() {
    setSubMsgs([]);
    setSubLoading(`Extracting r/${subreddit.trim()} conversations...`);
    try {
      const result = await post<FetchResult & { subreddit: string }>("/api/subreddit", {
        subreddit, threadCount, sorting, timeFilter,
        minimumComments: minComments, minimumScore: minScore,
        commentMode: commentMode === "Full thread" ? "Full thread" : "Top 5", commentLimit,
      });
      const msgs: Msg[] = [];
      if (result.records.length) {
        loadResults(result);
        msgs.push({ kind: "success", text: `Extracted ${result.records.length} threads from r/${result.subreddit} after searching ${result.searchedPostCount.toLocaleString()} archived posts.` });
        if (result.records.length < threadCount) {
          msgs.push({ kind: "warning", text: `Only ${result.records.length} of ${threadCount} requested threads matched within the ${result.searchedPostCount.toLocaleString()} archived posts searched.` });
        }
        if (result.commentWarning) {
          msgs.push({ kind: "warning", text: `Posts were extracted, but some archived comments could not be loaded. Some top comments may be missing. ${result.commentWarning}` });
        }
      } else {
        msgs.push({ kind: "warning", text: `No threads matched these filters in the ${result.searchedPostCount.toLocaleString()} archived posts searched. Try lowering the minimum score or comment count.` });
      }
      setSubMsgs(msgs);
    } catch (error) {
      setSubMsgs([{ kind: "error", text: (error as Error).message }]);
    } finally {
      setSubLoading(null);
    }
  }

  async function searchKeywords() {
    setKwMsgs([]);
    setKwLoading(`Searching archived Reddit posts for ${keywordPreview.join(", ")}...`);
    try {
      const result = await post<FetchResult>("/api/keywords", {
        keywords, matchMode, threadCount: kwThreadCount, sorting: kwSorting, timeFilter: kwTimeFilter,
        minimumComments: kwMinComments, minimumScore: kwMinScore,
        commentMode: kwCommentMode === "Full thread" ? "Full thread" : "Top 5", commentLimit: kwCommentLimit,
      });
      const msgs: Msg[] = [];
      if (result.records.length) {
        loadResults(result);
        msgs.push({ kind: "success", text: `Extracted ${result.records.length} keyword-matched threads after searching ${result.searchedPostCount.toLocaleString()} unique archived posts.` });
        if (result.records.length < kwThreadCount) {
          msgs.push({ kind: "warning", text: `Only ${result.records.length} of ${kwThreadCount} requested threads matched within the keyword search limit.` });
        }
        if (result.commentWarning) {
          msgs.push({ kind: "warning", text: `Posts were extracted, but some archived comments could not be loaded. Some top comments may be missing. ${result.commentWarning}` });
        }
      } else {
        msgs.push({ kind: "warning", text: `No posts matched within the ${result.searchedPostCount.toLocaleString()} unique archived posts searched. Try fewer keywords, OR matching, a wider time range, or lower engagement filters.` });
      }
      setKwMsgs(msgs);
    } catch (error) {
      setKwMsgs([{ kind: "error", text: (error as Error).message }]);
    } finally {
      setKwLoading(null);
    }
  }

  async function runAnalysis() {
    const prompt = template === CUSTOM_TEMPLATE ? customPrompt : ANALYSIS_TEMPLATES[template];
    setAnalysisMsgs([]);
    if (!aiConfigured) return setAnalysisMsgs([{ kind: "error", text: "GEMINI_API_KEY is missing from the environment variables." }]);
    if (!prompt.trim()) return setAnalysisMsgs([{ kind: "error", text: "Enter a custom marketing question." }]);
    setAnalysisLoading(true);
    try {
      const result = await post<{ text: string }>("/api/ai/analyze", { prompt, payload: buildAiPayload(data) });
      setAnalysis(result.text);
    } catch (error) {
      setAnalysisMsgs([{ kind: "error", text: (error as Error).message }]);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    setChatMsgs([]);
    if (!aiConfigured) return setChatMsgs([{ kind: "error", text: "GEMINI_API_KEY is missing from the environment variables." }]);
    const previous = chat;
    setChat([...previous, { role: "user", content: question }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const result = await post<{ text: string }>("/api/ai/chat", {
        question, history: previous, payload: buildAiPayload(data), additionalContext: extraContext,
      });
      setChat((current) => [...current, { role: "assistant", content: result.text }]);
    } catch (error) {
      setChatMsgs([{ kind: "error", text: (error as Error).message }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const totalUpvotes = data.reduce((sum, r) => sum + r.Score, 0);
  const totalComments = data.reduce((sum, r) => sum + r["Comments Count"], 0);
  const avgEngagement = data.length ? data.reduce((s, r) => s + r.Score + r["Comments Count"], 0) / data.length : 0;
  const maxFreq = Math.max(1, ...ngrams.map((n) => n.frequency));

  return (
    <div className="layout">
      <aside className="sidebar">
        <button onClick={logout}>Log out</button>
        <h3 style={{ marginTop: "2rem" }}>🌐 Reddit Data Source</h3>
        <div className="msg info">Powered by Arctic Shift and PullPush public Reddit archives. No Reddit API key required.</div>
        <p className="caption">Archive availability and freshness depend on the community-maintained data provider.</p>
        <hr />
        <h3>Optional AI Analysis</h3>
        {aiConfigured ? (
          <p className="caption">Gemini key loaded from app secrets.</p>
        ) : (
          <div className="msg warning">Add GEMINI_API_KEY to this app&apos;s environment variables to enable AI.</div>
        )}
      </aside>

      <main className="main">
        <h1>📊 Reddit Market Intelligence</h1>
        <p className="caption">Extract audience language, identify market themes, and turn Reddit conversations into evidence-based marketing insights.</p>

        <h2>Community Search</h2>
        <p className="caption">Search archived posts from one specific subreddit.</p>
        <div className="row" style={{ gridTemplateColumns: "2.2fr 1.4fr 1.4fr 1.4fr" }}>
          <TextField label="Subreddit" value={subreddit} onChange={setSubreddit} placeholder="SaaS, marketing, or smallbusiness" />
          <Slider label="Thread count" value={threadCount} min={5} max={100} onChange={setThreadCount} />
          <Select label="Sort by" value={sorting} options={SORTINGS} onChange={setSorting}
            help="New uses archive timestamps. Most Discussed ranks by comment count. Hot, Top, and Rising are locally ranked approximations." />
          <Select label="Top time filter" value={timeFilter} options={TIME_FILTERS} onChange={setTimeFilter}
            disabled={sorting !== "Top"} help="Applied only when sorting by Top." />
        </div>
        <div className="row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <NumberField label="Minimum comments" value={minComments} onChange={setMinComments} help="Exclude threads with fewer archived comments." />
          <NumberField label="Minimum score/upvotes" value={minScore} onChange={setMinScore} help="Exclude threads with a lower archived Reddit score." />
          <Select label="Comment extraction" value={commentMode} options={COMMENT_MODES} onChange={setCommentMode}
            help="Full thread includes nested replies and can take longer." />
          <Slider label="Maximum comments per thread" value={commentLimit} min={25} max={500} step={25} onChange={setCommentLimit}
            disabled={commentMode !== "Full thread"} help="Safety limit used only for full-thread extraction." />
        </div>
        <p className="caption">
          The archive search keeps paging into older posts until it finds the requested number of matching threads, up to{" "}
          {(POST_SEARCH_PAGE_SIZE * MAX_POST_SEARCH_PAGES).toLocaleString()} candidate posts.
        </p>
        <button className="primary" disabled={subLoading !== null || kwLoading !== null} onClick={extractSubreddit}>🚀 Extract Reddit Intelligence</button>
        {subLoading && <div className="status"><span className="spinner" />{subLoading}</div>}
        <Messages items={subMsgs} />

        <hr />
        <h2>Keyword Search</h2>
        <p className="caption">
          Search archived posts across Reddit communities. Enter one keyword or up to {MAX_KEYWORDS} comma-separated keywords, such as <code>PMDD, mom</code>.
        </p>
        <div className="row" style={{ gridTemplateColumns: "2.4fr 1.4fr 1.2fr" }}>
          <TextField label="Keywords" value={keywords} onChange={setKeywords} placeholder="PMDD, mom" />
          <Select label="Match behavior" value={matchMode} options={MATCH_MODES} onChange={setMatchMode}
            disabled={keywordPreview.length < 2}
            help="AND requires every keyword in the title or post body. OR accepts a post containing any keyword." />
          <Slider label="Thread count" value={kwThreadCount} min={5} max={100} onChange={setKwThreadCount} />
        </div>
        <div className="row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <Select label="Sort keyword results by" value={kwSorting} options={SORTINGS} onChange={setKwSorting}
            help="Ranking is applied locally to the matching archived posts." />
          <Select label="Keyword time range" value={kwTimeFilter} options={TIME_FILTERS} onChange={setKwTimeFilter} />
          <NumberField label="Keyword minimum comments" value={kwMinComments} onChange={setKwMinComments} />
          <NumberField label="Keyword minimum score/upvotes" value={kwMinScore} onChange={setKwMinScore} />
        </div>
        <div className="row" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Select label="Keyword result comment extraction" value={kwCommentMode} options={COMMENT_MODES} onChange={setKwCommentMode}
            help="Full thread includes nested replies and can take longer." />
          <Slider label="Keyword maximum comments per thread" value={kwCommentLimit} min={25} max={500} step={25} onChange={setKwCommentLimit}
            disabled={kwCommentMode !== "Full thread"} />
        </div>
        <p className="caption">Keyword results are collected from a separate public archive and then filtered and ranked locally. Search terms are sent to that archive provider.</p>
        <button className="primary" disabled={subLoading !== null || kwLoading !== null} onClick={() => {
          if (!keywordPreview.length) return setKwMsgs([{ kind: "error", text: "Enter at least one keyword." }]);
          if (keywordPreview.length > MAX_KEYWORDS) return setKwMsgs([{ kind: "error", text: `Enter no more than ${MAX_KEYWORDS} keywords.` }]);
          if (keywordPreview.some((k) => k.length > 100)) return setKwMsgs([{ kind: "error", text: "Each keyword must be 100 characters or fewer." }]);
          searchKeywords();
        }}>🔎 Search Reddit by Keyword</button>
        {kwLoading && <div className="status"><span className="spinner" />{kwLoading}</div>}
        <Messages items={kwMsgs} />

        {data.length === 0 ? (
          <div className="msg info" style={{ marginTop: "2rem" }}>Choose a subreddit and extract live public Reddit threads to begin.</div>
        ) : (
          <>
            <hr />
            <h2>Extracted Data</h2>
            <p className="caption">Engagement metrics reflect archived values and may lag the values currently shown on Reddit.</p>
            <div className="metrics">
              <div className="metric"><div className="label">Total Threads</div><div className="num">{data.length.toLocaleString()}</div></div>
              <div className="metric"><div className="label">Total Upvotes</div><div className="num">{totalUpvotes.toLocaleString()}</div></div>
              <div className="metric"><div className="label">Total Comments</div><div className="num">{totalComments.toLocaleString()}</div></div>
              <div className="metric"><div className="label">Average Engagement</div><div className="num">{avgEngagement.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Subreddit</th><th>Title</th><th>Score</th><th>Comments Count</th><th>Upvote Ratio</th><th>URL</th></tr></thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i}>
                      <td>{r.Subreddit}</td><td>{r.Title}</td><td>{r.Score}</td><td>{r["Comments Count"]}</td>
                      <td>{r["Upvote Ratio"].toFixed(2)}</td>
                      <td><a href={r.URL} target="_blank" rel="noreferrer">Open thread ↗</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <a href={csvHref} download="reddit_market_intelligence.csv"><button type="button" style={{ marginTop: "1rem" }}>⬇️ Download raw data as CSV</button></a>
            </p>

            <hr />
            <h2>Keyword &amp; Text Analytics</h2>
            {ngrams.length === 0 ? (
              <div className="msg info">There is not enough text to calculate keyword frequencies.</div>
            ) : (
              <>
                <p className="caption">Top 15 Non-Stopword Keywords and Phrases</p>
                <div className="bars">
                  {[...ngrams].reverse().map((n) => (
                    <div className="bar-row" key={n.phrase}>
                      <div className="bar-label" title={n.phrase}>{n.phrase}</div>
                      <div className="bar-track">
                        <div className="bar" style={{ width: `${(n.frequency / maxFreq) * 100}%`, background: `rgba(77,142,255,${0.35 + 0.65 * (n.frequency / maxFreq)})` }}>{n.frequency}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="caption" style={{ textAlign: "center" }}>Occurrences</p>
              </>
            )}

            <hr />
            <h2>🧠 AI Marketing Strategist</h2>
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label>Analysis template</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                {[...Object.keys(ANALYSIS_TEMPLATES), CUSTOM_TEMPLATE].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {template === CUSTOM_TEMPLATE && (
              <div className="field" style={{ marginBottom: "1rem" }}>
                <label>Custom marketing question</label>
                <textarea rows={5} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Example: Which audience segments appear in these discussions, and how should our landing page address each segment?" />
              </div>
            )}
            <button className="primary" disabled={analysisLoading} onClick={runAnalysis}>🧠 Run AI Analysis</button>
            {analysisLoading && <div className="status"><span className="spinner" />The AI strategist is analyzing the Reddit sample...</div>}
            <Messages items={analysisMsgs} />
            {analysis && <Markdown>{analysis}</Markdown>}

            <hr />
            <h2>💬 Chat with Your Reddit Research</h2>
            <p className="caption">The chat automatically uses the currently extracted posts and comments. Add campaign, product, audience, or brand context below when helpful.</p>
            <div className="field" style={{ marginBottom: "1rem" }}>
              <label>Additional context for this conversation</label>
              <textarea rows={4} maxLength={MAX_ADDITIONAL_CONTEXT_CHARS} value={extraContext} onChange={(e) => setExtraContext(e.target.value)}
                placeholder="Example: We sell an affordable mental-health benefits platform to HR leaders at companies with 50–500 employees. Avoid medical claims." />
            </div>
            <button disabled={chat.length === 0} onClick={() => { setChat([]); setChatMsgs([]); }}>🗑️ Clear chat</button>
            {chat.map((m, i) => (
              <div className="chat-msg" key={i}>
                <div className="avatar">{m.role === "user" ? "🧑" : "🤖"}</div>
                <div style={{ minWidth: 0 }}>{m.role === "assistant" ? <Markdown>{m.content}</Markdown> : m.content}</div>
              </div>
            ))}
            {chatLoading && <div className="status"><span className="spinner" />Analyzing the Reddit research...</div>}
            <Messages items={chatMsgs} />
            <form className="chat-bar" onSubmit={sendChat}>
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask a question about these Reddit conversations..." />
              <button className="primary" type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
