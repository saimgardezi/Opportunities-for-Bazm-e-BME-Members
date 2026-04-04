import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { query } = req.body;

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `Search biomedical engineering opportunities related to: ${query}.`
        }
      ]
    });

    res.status(200).json({
      results: response.content[0].text
    });

  } catch (error) {
    console.error("API ERROR:", error);
    res.status(500).json({ error: error.message });
  }
}
