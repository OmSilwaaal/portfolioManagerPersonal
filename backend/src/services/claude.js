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

// ── Daily token budget ────────────────────────────────────────────────────────
const DAILY_BUDGET = parseInt(process.env.DAILY_TOKEN_BUDGET ?? '100000', 10);
let budget = { date: '', used: 0 };

function checkBudget() {
  const today = new Date().toDateString();
  if (budget.date !== today) budget = { date: today, used: 0 };
  return budget.used < DAILY_BUDGET;
}

function recordUsage(usage) {
  if (usage) budget.used += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

function getBudgetStatus() {
  const today = new Date().toDateString();
  if (budget.date !== today) return { used: 0, limit: DAILY_BUDGET, remaining: DAILY_BUDGET };
  return { used: budget.used, limit: DAILY_BUDGET, remaining: Math.max(0, DAILY_BUDGET - budget.used) };
}
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_RESPONSE = {
  summary: 'Summary unavailable',
  urgency: 'Low',
  reasoning: 'AI service temporarily unavailable',
};

const BUDGET_FALLBACK = {
  summary: 'Daily AI budget reached. Analysis will resume tomorrow.',
  urgency: 'Low',
  reasoning: 'Token budget exceeded',
};

async function summarizeNewsItem(headline, content) {
  if (!checkBudget()) return BUDGET_FALLBACK;
  try {
    const anthropic = getClient();

    const prompt = `Summarize this financial news in 2 sentences for someone with no finance background. Then rate the urgency for a retail investor as one of: Low, Watch, or Act Now. Return ONLY valid JSON with no markdown: { "summary": string, "urgency": "Low" | "Watch" | "Act Now", "reasoning": string }

News headline: ${headline}
News content: ${content || headline}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: 'You are a financial intelligence assistant. Return only valid JSON. Never use markdown fences.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const validUrgencies = ['Low', 'Watch', 'Act Now'];
    if (!validUrgencies.includes(parsed.urgency)) parsed.urgency = 'Low';

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
  if (!checkBudget()) return {
    overallImpact: 'Low',
    summary: BUDGET_FALLBACK.summary,
    tickerBreakdown: holdings.map((h) => ({ ticker: h.ticker, impact: 'Neutral', reason: 'Budget exceeded' })),
    recommendation: 'AI analysis will resume tomorrow.',
  };
  try {
    const anthropic = getClient();

    const holdingsText = holdings.map((h) => `${h.ticker}: ${h.quantity} shares/units`).join('\n');
    const newsText = newsItems.slice(0, 5).map((n) => `- ${n.headline}`).join('\n');

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

    recordUsage(message.usage);
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.log('Claude portfolio analysis error:', err.message);
    return {
      overallImpact: 'Low',
      summary: 'Portfolio analysis temporarily unavailable.',
      tickerBreakdown: holdings.map((h) => ({ ticker: h.ticker, impact: 'Neutral', reason: 'Analysis unavailable' })),
      recommendation: 'Check back later for AI-powered portfolio analysis.',
    };
  }
}

async function summarizeGovTrade(tradeData, investorContext = null) {
  if (!checkBudget()) return {
    summary: BUDGET_FALLBACK.summary,
    urgency: 'Low',
    reasoning: BUDGET_FALLBACK.reasoning,
    sentiment: 'Neutral',
    time_sensitive: false,
  };
  try {
    const anthropic = getClient();

    const action = /purchase/i.test(tradeData.transactionType) ? 'purchased' : 'sold';
    const lagDesc =
      tradeData.disclosureLagDays > 0
        ? `${tradeData.disclosureLagDays} days after the trade`
        : 'on the day of the trade';
    const contextNote = investorContext
      ? `\nInvestor profile: ${investorContext.investorType}, ${investorContext.riskTolerance} risk tolerance.`
      : '';

    const prompt = `${tradeData.title} ${tradeData.officialName} (${tradeData.party}) ${action} ${tradeData.amountRange} of ${tradeData.ticker} on ${tradeData.tradeDate}. The disclosure was made ${lagDesc}.${contextNote}

Analyze the significance of this trade for a retail investor. Consider the official's committee roles, the disclosure timing, and market implications.

Return ONLY valid JSON with no markdown:
{
  "summary": "2 sentence plain-English explanation of this trade and why it might matter",
  "urgency": "Low" | "Watch" | "Act Now",
  "reasoning": "1 sentence explaining the urgency rating",
  "sentiment": "Bullish" | "Bearish" | "Neutral",
  "time_sensitive": true | false
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const validUrgencies = ['Low', 'Watch', 'Act Now'];
    if (!validUrgencies.includes(parsed.urgency)) parsed.urgency = 'Low';
    const validSentiments = ['Bullish', 'Bearish', 'Neutral'];
    if (!validSentiments.includes(parsed.sentiment)) parsed.sentiment = 'Neutral';

    return parsed;
  } catch (err) {
    console.log('Claude gov trade summary error:', err.message);
    return {
      summary: 'Analysis temporarily unavailable.',
      urgency: tradeData.urgency || 'Low',
      reasoning: 'AI service temporarily unavailable.',
      sentiment: 'Neutral',
      time_sensitive: false,
    };
  }
}

async function summarizeNewsItemWithContext(headline, content, userProfile = null) {
  if (!checkBudget()) return BUDGET_FALLBACK;
  try {
    const anthropic = getClient();

    let profileNote = '';
    if (userProfile) {
      profileNote = `\nUser profile: ${userProfile.investorType || 'retail'} investor with ${userProfile.riskTolerance || 'moderate'} risk tolerance. Tailor urgency and framing to this profile.`;
    }

    const prompt = `Summarize this financial news in 2 sentences for someone with no finance background. Then rate the urgency for this specific investor as one of: Low, Watch, or Act Now. Return ONLY valid JSON with no markdown: { "summary": string, "urgency": "Low" | "Watch" | "Act Now", "reasoning": string }${profileNote}

News headline: ${headline}
News content: ${content || headline}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: 'You are a financial intelligence assistant. Return only valid JSON. Never use markdown fences.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const validUrgencies = ['Low', 'Watch', 'Act Now'];
    if (!validUrgencies.includes(parsed.urgency)) parsed.urgency = 'Low';

    return {
      summary: parsed.summary || FALLBACK_RESPONSE.summary,
      urgency: parsed.urgency,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.log('Claude contextual news summary error:', err.message);
    return FALLBACK_RESPONSE;
  }
}

async function generateWeeklyBrief(headlines) {
  if (!checkBudget()) return { brief: BUDGET_FALLBACK.summary, bullets: [] };
  try {
    const anthropic = getClient();
    const headlineText = headlines.slice(0, 12).map((h, i) => `${i + 1}. ${h}`).join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [{
        type: 'text',
        text: 'You are a financial analyst writing a weekly market brief for retail investors. Return only valid JSON, no markdown.',
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Based on these current market headlines, write a brief market outlook for this week in plain English.\n\nHeadlines:\n${headlineText}\n\nReturn ONLY valid JSON:\n{\n  "brief": "2-3 sentence overview of what to expect this week",\n  "bullets": ["Watch: one thing", "Risk: one thing", "Opportunity: one thing", "Trend: one thing"]\n}`,
      }],
    });

    recordUsage(message.usage);
    const cleaned = message.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.log('Claude weekly brief error:', err.message);
    return { brief: 'Market analysis temporarily unavailable.', bullets: [] };
  }
}

module.exports = { summarizeNewsItem, analyzePortfolioImpact, summarizeGovTrade, summarizeNewsItemWithContext, getBudgetStatus, generateWeeklyBrief };
