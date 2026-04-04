const { Anthropic } = require("@anthropic-ai/sdk");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { query } = req.body;

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-3-7-sonnet-latest",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Search biomedical engineering opportunities related to: ${query}.`
        }
      ]
    });

    return res.status(200).json({
      results: response.content[0].text
    });

  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
};
