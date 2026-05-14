const Anthropic = require('@anthropic-ai/sdk');

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    client = new Anthropic({ apiKey });
  }
  return client;
}

const FALLBACK_RESPONSE = {
  summary: 'Summary unavailable',
  urgency: 'Low',
  reasoning: 'AI service temporarily unavailable',
};

async function summarizeNewsItem(headline, content) {
  try {
    const anthropic = getClient();

    const prompt = `Summarize this financial news in 2 sentences for someone with no finance background. Then rate the urgency for a retail investor as one of: Low, Watch, or Act Now. Return ONLY valid JSON with no markdown: { "summary": string, "urgency": "Low" | "Watch" | "Act Now", "reasoning": string }

News headline: ${headline}
News content: ${content || headline}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip any accidental markdown fences
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Validate urgency value
    const validUrgencies = ['Low', 'Watch', 'Act Now'];
    if (!validUrgencies.includes(parsed.urgency)) {
      parsed.urgency = 'Low';
    }

    return {
      summary: parsed.summary || FALLBACK_RESPONSE.summary,
      urgency: parsed.urgency,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.log('Claude summarization error:', err.message);
    return FALLBACK_RESPONSE;
  }
}

async function analyzePortfolioImpact(holdings, newsItems) {
  try {
    const anthropic = getClient();

    const holdingsText = holdings
      .map((h) => `${h.ticker}: ${h.quantity} shares/units`)
      .join('\n');

    const newsText = newsItems
      .slice(0, 5)
      .map((n) => `- ${n.headline}`)
      .join('\n');

    const prompt = `A retail investor holds the following assets:
${holdingsText}

Recent market news:
${newsText}

Analyze how this news might impact their portfolio. Return ONLY valid JSON with no markdown:
{
  "overallImpact": "Low" | "Watch" | "Act Now",
  "summary": "2-3 sentence plain-English summary of portfolio impact",
  "tickerBreakdown": [
    { "ticker": string, "impact": "Positive" | "Negative" | "Neutral", "reason": string }
  ],
  "recommendation": "One actionable sentence for this investor"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.log('Claude portfolio analysis error:', err.message);
    return {
      overallImpact: 'Low',
      summary: 'Portfolio analysis temporarily unavailable.',
      tickerBreakdown: holdings.map((h) => ({
        ticker: h.ticker,
        impact: 'Neutral',
        reason: 'Analysis unavailable',
      })),
      recommendation: 'Check back later for AI-powered portfolio analysis.',
    };
  }
}

module.exports = { summarizeNewsItem, analyzePortfolioImpact };
