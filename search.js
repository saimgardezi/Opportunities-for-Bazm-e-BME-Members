// api/search.js  –  Vercel Serverless Function
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
      error:
        "ANTHROPIC_API_KEY is not set. Go to Vercel → Settings → Environment Variables, add it, then Redeploy.",
    });
  }

  // ── Parse request body ────────────────────────────────────────────────────
  const { query, type, region, funded } = req.body || {};

  if (!query || !type) {
    return res.status(400).json({ error: "Missing query or type in request body." });
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  const regionClause =
    region && region !== "All regions" ? ` in ${region}` : " worldwide";

  const fundingClause =
    funded === "funded"
      ? " Only include fully funded / paid positions. Skip unfunded ones."
      : "";

  const systemPrompt = `You are an expert academic opportunity finder specialising in Biomedical Engineering.
Your job is to search the web for REAL, CURRENT open positions and return structured results.
Always search multiple sources: university websites, EURAXESS, Nature Careers, FindAPhD, LinkedIn, ResearchGate, and institutional job boards.
Return ONLY positions that are currently open or accepting applications.
Do NOT invent positions. If you cannot find enough, say so honestly.`;

  const userPrompt = `Search for up to 8 open ${type} opportunities in Biomedical Engineering${regionClause}.
Search query hint: "${query}"
${fundingClause}

For EACH opportunity you find, return a JSON object inside a markdown code block with this exact structure:

\`\`\`json
[
  {
    "title": "Position title",
    "institution": "University or company name",
    "location": "City, Country",
    "deadline": "YYYY-MM-DD or 'Open until filled' or 'Unknown'",
    "funding": "Fully funded / Stipend: €XXXX/month / Unpaid / Unknown",
    "description": "2-3 sentence summary of the project and requirements.",
    "link": "https://direct-link-to-the-posting",
    "source": "Where you found it, e.g. EURAXESS, FindAPhD"
  }
]
\`\`\`

If fewer than 8 results are found, return what you have. Do not pad with fake results.`;

  // ── Call Anthropic API ────────────────────────────────────────────────────
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5-20251101",
        max_tokens: 4096,
        system: systemPrompt,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    // ── Handle HTTP-level errors ──────────────────────────────────────────
    if (!anthropicRes.ok) {
      let errBody;
      try {
        errBody = await anthropicRes.json();
      } catch (_) {
        errBody = { error: { message: `HTTP ${anthropicRes.status}` } };
      }

      const msg = errBody?.error?.message || `HTTP ${anthropicRes.status}`;

      // Friendly messages for common errors
      if (anthropicRes.status === 401)
        return res.status(401).json({ error: `Invalid API key. ${msg}` });
      if (anthropicRes.status === 429)
        return res.status(429).json({ error: `Rate limit reached. Please wait a moment and try again. ${msg}` });
      if (anthropicRes.status === 400)
        return res.status(400).json({ error: `Bad request to Anthropic API: ${msg}` });

      return res.status(anthropicRes.status).json({ error: msg });
    }

    // ── Parse response ────────────────────────────────────────────────────
    const data = await anthropicRes.json();

    // Extract all text blocks (Claude may interleave tool use and text)
    const textContent = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");

    if (!textContent) {
      return res.status(200).json({
        result: "No text response returned by Claude. The model may have used the search tool but produced no output. Please try again.",
        raw: data,
      });
    }

    return res.status(200).json({ result: textContent });

  } catch (err) {
    console.error("search.js error:", err);
    return res.status(500).json({
      error: `Server error: ${err.message}. Check Vercel function logs for details.`,
    });
  }
};
