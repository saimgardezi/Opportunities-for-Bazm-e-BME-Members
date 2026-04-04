export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Per-type search instructions for Claude
const TYPE_CONFIG = {
  "PhD Position": {
    searchHint: "PhD doctoral positions open funded studentships grants fellowships",
    sources: "university department pages, findaphd.com, euraxess.ec.europa.eu, jobs.ac.uk, nature.com/naturecareers, academicpositions.com",
    fundedLabel: "funded (stipend/scholarship)",
    extraFields: 'supervisor: string (PI name if available, else "Not specified")',
    contextNote: "Focus on fully-funded or self-funded doctoral research positions at universities and research institutes.",
  },
  "EngD Position": {
    searchHint: "EngD Engineering Doctorate industrial PhD CDT centre for doctoral training",
    sources: "epsrc.ukri.org, findaphd.com, jobs.ac.uk, euraxess, university graduate school pages, CDT programme websites",
    fundedLabel: "funded (stipend/scholarship)",
    extraFields: 'supervisor: string (PI or industrial partner if available, else "Not specified"), industry_partner: string (company name if known, else "")',
    contextNote: "EngD (Engineering Doctorate) positions are industry-focused research degrees, often co-supervised by a company. They are most common in the UK. Include CDT (Centre for Doctoral Training) and similar industry-linked doctoral programmes.",
  },
  "Summer School": {
    searchHint: "summer school programme workshop course intensive training 2025",
    sources: "embl.org, febs.org, university summer school pages, euraxess, nature masterclasses, coursera live events, coursesites, embo.org",
    fundedLabel: "funded (fellowship/waiver available)",
    extraFields: 'supervisor: string (organiser or director name if known, else "Not specified"), duration: string (e.g. "2 weeks", "10 days")',
    contextNote: "Summer schools, intensive courses, and training workshops relevant to biomedical engineering students and early-career researchers. Include both free and paid programmes; flag if fellowships/waivers are available.",
  },
  "Internship": {
    searchHint: "internship placement industrial year student research biomedical 2025 2026",
    sources: "linkedin.com/jobs, glassdoor, indeed, company career pages, euraxess, wellcome.org, embl internships, NIH internships, DAAD, university placement portals",
    fundedLabel: "paid internship",
    extraFields: 'supervisor: string (hiring manager or team lead if known, else "Not specified"), duration: string (e.g. "3 months", "6 months", "1 year")',
    contextNote: "Paid and unpaid internships, industrial placements, and research internships in biomedical engineering at companies, hospitals, and research institutes.",
  },
  "Job": {
    searchHint: "job position role vacancy hire engineer scientist researcher biomedical 2025 2026",
    sources: "linkedin.com/jobs, glassdoor, indeed, jobs.ac.uk, NHS jobs, euraxess, nature careers, company career pages, medtechjobs.com",
    fundedLabel: "paid (salary listed)",
    extraFields: 'supervisor: string (hiring team or department if known, else "Not specified"), salary: string (salary range if mentioned, else "")',
    contextNote: "Full-time and part-time jobs including industry R&D roles, clinical engineering, postdoc positions, regulatory affairs, data science, and research scientist roles in biomedical engineering.",
  },
};

function buildSystemPrompt(opportunityType, region, funding) {
  const cfg = TYPE_CONFIG[opportunityType] || TYPE_CONFIG["PhD Position"];

  return `You are a specialist search assistant for Biomedical Engineering opportunities. 
Your task: search the web and find real, currently open ${opportunityType} opportunities in Biomedical Engineering.
Use these sources especially: ${cfg.sources}.
Search keywords to try: "${cfg.searchHint}".
${cfg.contextNote}

Return ONLY a valid JSON array (no markdown, no preamble, no explanation) with up to 8 results.
Each object must have EXACTLY these fields:
{
  "title": "string — specific position/programme title",
  "university": "string — institution, university, or company name",
  "country": "string — country",
  "region": "string — one of: Europe, North America, Asia, Australia/Oceania, Other",
  "field": "string — specific BME subfield, e.g. Neural Interfaces, Medical Imaging AI, Biomaterials",
  "funded": boolean — true if ${cfg.fundedLabel},
  "deadline": "string — e.g. Rolling, June 2025, December 2025, or Open",
  "description": "string — 2-3 sentences summarising the opportunity and requirements",
  "url": "string — direct link if found, else empty string",
  ${cfg.extraFields}
}
${region !== "all" ? `IMPORTANT: Only include results from the region: ${region}.` : ""}
${funding === "funded" ? `IMPORTANT: Only include ${cfg.fundedLabel} opportunities.` : ""}
Return ONLY the JSON array. No markdown fences. No explanation before or after.`;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "API key not configured on the server." }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { query, region = "all", funding = "all", opportunityType = "PhD Position" } = body;

  if (!query) {
    return json({ error: "Search query is required." }, 400);
  }

  const validTypes = ["PhD Position", "EngD Position", "Summer School", "Internship", "Job"];
  const safeType = validTypes.includes(opportunityType) ? opportunityType : "PhD Position";

  const systemPrompt = buildSystemPrompt(safeType, region, funding);
  const userMsg = `Find current open ${safeType} opportunities in Biomedical Engineering related to: ${query}. Today's date is ${new Date().toISOString().split("T")[0]}. Search thoroughly and return real, specific opportunities.`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Anthropic error:", errText);
      return json({ error: "Search service error. Please try again." }, 500);
    }

    const data = await upstream.json();

    // Extract JSON array from the response content blocks
    let jsonText = "";
    for (const block of data.content || []) {
      if (block.type === "text") {
        const raw = block.text.trim();
        // Direct JSON array
        if (raw.startsWith("[")) { jsonText = raw; break; }
        // Wrapped in markdown fences
        const fenced = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (fenced) { jsonText = fenced[1]; break; }
        // Inline array somewhere in the text
        const inline = raw.match(/\[[\s\S]*\]/);
        if (inline) { jsonText = inline[0]; break; }
      }
    }

    if (!jsonText) {
      return json({ positions: [] });
    }

    let positions;
    try {
      positions = JSON.parse(jsonText);
    } catch {
      return json({ error: "Could not parse results. Please try again." }, 500);
    }

    if (!Array.isArray(positions)) {
      return json({ positions: [] });
    }

    return json({ positions });

  } catch (err) {
    console.error("Handler error:", err);
    return json({ error: "Unexpected error. Please try again." }, 500);
  }
}
