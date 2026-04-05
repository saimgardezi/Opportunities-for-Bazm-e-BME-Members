// api/search.js  –  Vercel Serverless Function  [FIXED v2]
// Calls Anthropic Claude with the built-in web_search tool

module.exports = async function handler(req, res) {
  // ── CORS preflight ────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // ── Validate API key ──────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set. Go to Vercel → Settings → Environment Variables, add it, then Redeploy.",
    });
  }

  // ── Parse request body (flexible – accept any combination of fields) ──────
  const body = req.body || {};
  const query  = body.query  || body.q      || body.search   || "";
  const type   = body.type   || body.kind   || body.category || "PhD";
  const region = body.region || body.location                || "All regions";
  const funded = body.funded || body.funding                 || "";

  if (!query) {
    return res.status(400).json({ error: "Please provide a search query." });
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  const regionClause  = (region && region !== "All regions") ? ` in ${region}` : " worldwide";
  const fundingClause = (funded === "funded" || funded === "Funded / paid only")
    ? " Only include fully funded or paid positions. Skip unpaid ones."
    : "";

  const systemPrompt = `You are an expert academic opportunity finder specialising in Biomedical Engineering.
Search the web for REAL, CURRENTLY OPEN positions only. Check university websites, EURAXESS, Nature Careers, FindAPhD, LinkedIn, and institutional job boards.
Never invent or hallucinate positions. If you cannot find enough real results, say so.`;

  const userPrompt = `Search for up to 8 open ${type} opportunities in Biomedical Engineering${regionClause}.
Search query: "${query}"${fundingClause}

Return results as a JSON array inside a single markdown code block. Use this exact format:

\`\`\`json
[
  {
    "title": "Full position title",
    "institution": "University or organisation name",
    "location": "City, Country",
    "deadline": "YYYY-MM-DD or 'Open until filled' or 'Unknown'",
    "funding": "Fully funded / Stipend: €X/month / Unpaid / Unknown",
    "description": "2-3 sentence summary of the project, research area, and key requirements.",
    "link": "https://direct-link-to-the-posting",
    "source": "e.g. EURAXESS, FindAPhD, university website"
  }
]
\`\`\`

Return ONLY the JSON code block. Do not add any text before or after it.`;

  // ── Call Anthropic API with a hard 55-second timeout ─────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userPrompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // ── HTTP-level errors ─────────────────────────────────────────────────
    if (!anthropicRes.ok) {
      let errBody = {};
      try { errBody = await anthropicRes.json(); } catch (_) {}
      const msg = errBody?.error?.message || `HTTP ${anthropicRes.status}`;

      if (anthropicRes.status === 401)
        return res.status(401).json({ error: `Invalid API key. Check Vercel environment variables. (${msg})` });
      if (anthropicRes.status === 429)
        return res.status(429).json({ error: `Rate limit hit. Wait a moment and try again. (${msg})` });
      if (anthropicRes.status === 400)
        return res.status(400).json({ error: `Bad request: ${msg}` });

      return res.status(anthropicRes.status).json({ error: msg });
    }

    // ── Parse response ────────────────────────────────────────────────────
    const data = await anthropicRes.json();

    const textContent = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n\n")
      .trim();

    if (!textContent) {
      return res.status(200).json({ error: "Claude returned no text. Please try again." });
    }

    return res.status(200).json({ result: textContent });

  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({
        error: "Search took too long (>55 s). Anthropic web-search may be under load. Please try again.",
      });
    }
    console.error("search.js unhandled error:", err);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
};
