import { MAX_AI_PAYLOAD_CHARS, type Row } from "./types";

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren as at be because been before being below between both but by can could couldn did didn do does doesn doing don down during each few for from further get gets getting got had hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just ll m me more most mustn my myself no nor not now of off on once only or other our ours ourselves out over own re really s same shan she should shouldn so some such t than that the their theirs them themselves then there these they this those through to too under until up ve very was wasn we were weren what when where which while who whom why will with won would wouldn you your yours yourself yourselves`.split(
    /\s+/,
  ),
);

export function getTopNgrams(data: Row[], limit = 15): { phrase: string; frequency: number }[] {
  const counter = new Map<string, number>();
  const bump = (key: string) => counter.set(key, (counter.get(key) ?? 0) + 1);
  for (const row of data) {
    const text = `${row.Title} ${row.Body}`.toLowerCase();
    const words = (text.match(/[a-z0-9]+(?:['’-][a-z0-9]+)?/g) ?? [])
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      .map((w) => w.replace("’", "'"));
    words.forEach(bump);
    for (let i = 0; i < words.length - 1; i++) bump(`${words[i]} ${words[i + 1]}`);
  }
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase, frequency]) => ({ phrase, frequency }));
}

export function buildAiPayload(data: Row[], maxChars = MAX_AI_PAYLOAD_CHARS): string {
  const sections: string[] = [];
  let total = 0;
  data.forEach((row, index) => {
    const remaining = maxChars - total;
    if (remaining <= 0) return;
    const section =
      `POST ${index + 1}\n` +
      `SUBREDDIT: r/${row.Subreddit}\n` +
      `TITLE: ${row.Title}\n` +
      `SCORE: ${row.Score} | COMMENTS: ${row["Comments Count"]} | UPVOTE RATIO: ${row["Upvote Ratio"].toFixed(2)}\n` +
      `BODY:\n${row.Body || "[No post body]"}\n` +
      `EXTRACTED COMMENTS:\n${row["Extracted Comments"] || "[No extracted comments]"}\n` +
      `---\n`;
    sections.push(section.slice(0, remaining));
    total += Math.min(section.length, remaining);
  });
  return sections.join("");
}

const CSV_COLUMNS: (keyof Row)[] = [
  "Title",
  "Body",
  "Subreddit",
  "Score",
  "Comments Count",
  "Upvote Ratio",
  "URL",
  "Extracted Comments",
  "Extracted Comments Count",
  "Author",
  "Created UTC",
];

export function toCsv(data: Row[]): string {
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of data) lines.push(CSV_COLUMNS.map((c) => escape(row[c])).join(","));
  return lines.join("\n") + "\n";
}
