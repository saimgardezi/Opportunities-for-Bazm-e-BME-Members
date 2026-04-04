export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const TYPE_CONFIG = {
  "PhD Position": {
    searchHint: "PhD doctoral positions open funded studentships grants fellowships",
    sources: "findaphd.com, euraxess.ec.europa.eu, jobs.ac.uk, nature.com/naturecareers, academicpositions.com",
    fundedLabel: "funded with stipend or scholarship",
    extraFields: `"supervisor": "PI name or Not specified"`,
    contextNote: "Focus on funded or self-funded doctoral research positions at universities and research institutes.",
  },
  "EngD Position": {
    searchHint: "EngD Engineering Doctorate CDT centre for doctoral training industrial",
    sources: "findaphd.com, jobs.ac.uk, euraxess, university CDT pages, epsrc.ukri.org",
    fundedLabel: "funded with stipend",
    extraFields: `"supervisor": "PI or industrial partner name, or Not specified"`,
    contextNote: "EngD positions are industry-focused research degrees, mostly in the UK. Include CDT programmes.",
  },
  "Summer School": {
    searchHint: "summer school programme workshop intensive training biomedical 2025 2026",
    sources: "embl.org, embo.org, febs.org, university summer school pages, euraxess",
    fundedLabel: "funded with fellowship or fee waiver",
    extraFields: `"supervisor": "organiser name or Not specified"`,
    contextNote: "Summer schools and training workshops for biomedical engineering students and early-career researchers.",
  },
  "Internship": {
    searchHint: "internship placement student research biomedical 2025 2026",
    sources: "linkedin.com/jobs, glassdoor, indeed, company career pages, euraxess, NIH internships",
    fundedLabel: "paid",
    extraFields: `"supervisor": "hiring manager or team, or Not specified"`,
    contextNote: "Paid and unpaid internships in biomedical engineering at companies, hospitals, and research institutes.",
  },
  "Job": {
    searchHint: "job position vacancy engineer scientist researcher biomedical 2025 2026",
    sources: "linkedin.com/jobs, glassdoor, indeed, jobs.ac.uk, nature careers, company career pages",
    fundedLabel: "salaried",
    extraFields: `"supervisor": "hiring team or department, or Not specified"`,
    contextNote: "Full-time jobs including R&D, clinical engineering, regulatory affairs, data science roles in biomedical engineering.",
  },
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY is not set in environment variables." }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON in request body." }, 400);
  }

  const { query, region = "all", funding = "all", opportunityType = "PhD Position" } = body;

  if (!query || query.trim() === "") {
    return jsonResponse({ error: "Search query is required." }, 400);
  }

  const validTypes = ["PhD Position", "EngD Position", "Summer School", "Internship", "Job"];
  const safeType = validTypes.includes(opportunityType) ? opportunityType : "PhD Position";
  const cfg = TYPE_CONFIG[safeType];

  const systemPrompt = `You are a specialist search assistant for Biomedical Engineering opportunities.
Search the web and find real currently open ${safeType} opportunities in Biomedical Engineering.
Use these sources: ${cfg.sources}.
Search keywords: "${cfg.searchHint}".
${cfg.contextNote}

Return ONLY a valid JSON array with up to 8 results. No markdown, no explanation, just the JSON array.
Each object must have exactly these fields:
{
  "title": "specific position title",
  "university": "institution or company name",
  "country": "country name",
  "region": "one of: Europe, North America, Asia, Australia/Oceania, Other",
  "field": "specific BME subfield e.g. Neural Interfaces, Medical Imaging, Biomaterials",
  "funded": true or false,
  "deadline": "e.g. Rolling, June 2025, Open",
  "description": "2-3 sentence summary of the opportunity and requirements",
  "url": "direct link if found, else empty string",
  ${cfg.extraFields}
}
${region !== "all" ? `Only include results from region: ${region}.` : ""}
${funding === "funded" ? `Only include ${cfg.fundedLabel} opportunities.` : ""}
Output ONLY the JSON array. Nothing else.`;

  const userMessage = `Find current open ${safeType} opportunities in Biomedical Engineering related to: ${query}. Today is ${new Date().toISOString().split("T")[0]}.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return jsonResponse(
        { error: `API error ${response.status}. Check your API key and try again.` },
        500
      );
    }

    const data = await response.json();

    let jsonText = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        const raw = block.text.trim();
        if (raw.startsWith("[")) { jsonText = raw; break; }
        const fenced = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (fenced) { jsonText = fenced[1]; break; }
        const inline = raw.match(/\[[\s\S]*\]/);
        if (inline) { jsonText = inline[0]; break; }
      }
    }

    if (!jsonText) {
      return jsonResponse({ positions: [] });
    }

    let positions;
    try {
      positions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("JSON parse failed:", parseError, "Raw:", jsonText.slice(0, 200));
      return jsonResponse({ error: "Could not parse results. Please try again." }, 500);
    }

    if (!Array.isArray(positions)) {
      return jsonResponse({ positions: [] });
    }

    return jsonResponse({ positions });

  } catch (err) {
    console.error("Unexpected error:", err.message);
    return jsonResponse({ error: "Unexpected server error. Please try again." }, 500);
  }
}
