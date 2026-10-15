export const ANALYSIS_TEMPLATES: Record<string, string> = {
  "📈 Executive Sentiment & Summary": `
Create an executive summary of the Reddit sample and analyze its overall sentiment.
- Summarize the most important discussion themes and audience concerns.
- Classify sentiment as positive, negative, mixed, or neutral by theme.
- Explain the evidence behind each classification using concise excerpts.
- Highlight notable shifts, contradictions, and high-engagement opinions.
- End with three prioritized, evidence-based marketing actions.
Use a Markdown table for the theme-level sentiment breakdown.
`,
  "🔑 Keyword Density & High-Intent Phrases": `
Analyze the Reddit data for keyword density and high-intent phrases.
- Identify recurring single keywords and multi-word phrases.
- Classify likely search intent (informational, commercial, transactional, or navigational).
- Estimate relative intent strength as High, Medium, or Low; do not invent numeric search volume.
- Recommend SEO topics, ad-group themes, and specific copy angles.
Present the core findings in a Markdown table, followed by prioritized copy suggestions.
`,
  "💢 Customer Pain Points & Objections": `
Identify customer pain points, unmet needs, common complaints, purchase objections,
and emotional triggers in the Reddit data. Separate explicit evidence from reasonable
inference, include short verbatim excerpts where useful, and rank themes by prevalence
and marketing importance. Finish with messaging recommendations that address each theme.
`,
  "⚔️ Competitor Mentions & Sentiment": `
Find brands, products, and competitors mentioned in the Reddit data. For each, summarize
positive, negative, mixed, or neutral sentiment and the reasons behind it. Do not infer a
brand when none is named. Present results in a Markdown table and identify positioning
gaps and ethical opportunities for differentiation.
`,
  "💡 Feature & Product Ideas": `
Extract explicit feature requests, workarounds, wishes, and product ideas from the Reddit
data. Distinguish direct user requests from inferred opportunities. Group similar ideas,
estimate evidence strength, describe the user outcome, and recommend a prioritized
validation plan. Use a Markdown table where appropriate.
`,
};

export const CUSTOM_TEMPLATE = "✍️ Custom Marketing Query";
