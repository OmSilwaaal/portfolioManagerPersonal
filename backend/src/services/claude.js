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
  upside: null,
};

const BUDGET_FALLBACK = {
  summary: 'Daily AI budget reached. Analysis will resume tomorrow.',
  urgency: 'Low',
  reasoning: 'Token budget exceeded',
  upside: null,
};

// Urgency criteria grounded in real market impact events
const URGENCY_CRITERIA = `
URGENCY CRITERIA — apply these strictly:

ACT NOW (use sparingly — only genuine market-moving events):
- Earnings surprise >5% above or below expectations
- FDA approval or rejection of a major drug
- Merger, acquisition, or buyout announced or collapsed
- Federal Reserve rate decision or surprise policy change
- CEO/CFO departure under negative circumstances, or fraud allegation
- Bankruptcy filing or imminent default
- Major product recall or safety investigation with financial exposure
- Geopolitical event directly disrupting a company's supply chain or market (war, sanctions, trade ban)
- Exchange trading halt on a stock

WATCH (important but not immediately actionable):
- Analyst upgrade or downgrade with new price target
- Company issues guidance revision (up or down)
- Earnings report in the next 1–3 days
- Congressional insider trade disclosed (especially large amounts)
- Regulatory investigation opened
- Sector-wide news affecting multiple holdings (e.g. rate speculation, commodity price spike)
- Product launch or partnership announcement with meaningful revenue potential

LOW (background information, no immediate action required):
- Earnings within consensus expectations (no surprise)
- General market commentary or opinion pieces
- Minor analyst mentions with no rating change
- Scheduled macro data releases that came in roughly as expected
- Company reaffirms existing guidance
- Routine dividend announcement
`;

async function summarizeNewsItem(headline, content, sentimentScore = null) {
  if (!checkBudget()) return BUDGET_FALLBACK;
  try {
    const anthropic = getClient();

    const sentimentHint = sentimentScore != null
      ? `\nMarket sentiment signal: ${sentimentScore > 0.3 ? 'Positive' : sentimentScore < -0.3 ? 'Negative' : 'Neutral'} (score: ${sentimentScore.toFixed(2)}). Use this as supporting evidence but rely on your own judgment for urgency.`
      : '';

    const prompt = `${URGENCY_CRITERIA}

News headline: ${headline}
News content: ${content || headline}${sentimentHint}

Task:
1. Write a 2-sentence plain-English summary — no jargon, no acronyms, explain it as if to a friend with no finance background.
2. Rate urgency using the criteria above.
3. If this news is a strong bullish catalyst for a specific stock that someone might want to BUY (upside opportunity), identify it. Otherwise set upside to null.

Return ONLY valid JSON, no markdown:
{
  "summary": string,
  "urgency": "Low" | "Watch" | "Act Now",
  "reasoning": "one sentence citing which specific criterion was met",
  "upside": { "ticker": string, "reason": string } | null
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 380,
      system: [
        {
          type: 'text',
          text: 'You are a financial intelligence assistant that scores news for retail investors. Be conservative: default to Low unless a clear criterion is met. Return only valid JSON. Never use markdown fences.',
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
      upside: parsed.upside || null,
    };
  } catch (err) {
    console.log('Claude summarization error:', err.message);
    return FALLBACK_RESPONSE;
  }
}

async function analyzePortfolioImpact(holdingsWithPrices, scoredNewsItems) {
  if (!checkBudget()) return {
    overallImpact: 'Low',
    summary: BUDGET_FALLBACK.summary,
    tickerBreakdown: holdingsWithPrices.map((h) => ({ ticker: h.ticker, impact: 'Neutral', estimatedDollarChange: null, reason: 'Budget exceeded' })),
    recommendation: 'AI analysis will resume tomorrow.',
  };
  try {
    const anthropic = getClient();

    // Build holdings text with actual dollar values
    const holdingsText = holdingsWithPrices
      .filter((h) => h.quantity > 0)
      .map((h) => {
        const value = h.value ? `$${h.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'value unknown';
        const change = h.changePercent != null ? ` (today: ${h.changePercent > 0 ? '+' : ''}${h.changePercent.toFixed(2)}%)` : '';
        return `${h.ticker}: ${h.quantity} units @ $${h.price ?? '?'} = ${value}${change}`;
      })
      .join('\n');

    const totalValue = holdingsWithPrices.reduce((s, h) => s + (h.value || 0), 0);

    // Use AI-scored summaries, prioritising Act Now and Watch items
    const relevantNews = (scoredNewsItems || [])
      .filter((n) => n.urgency !== 'Low')
      .slice(0, 8)
      .concat((scoredNewsItems || []).filter((n) => n.urgency === 'Low').slice(0, 2));

    const newsText = relevantNews
      .map((n) => `[${n.urgency}] ${n.ticker ? `${n.ticker}: ` : ''}${n.summary || n.headline}`)
      .join('\n');

    const prompt = `A retail investor's portfolio (total value ~$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}):

${holdingsText}

Most relevant recent news (pre-scored by urgency):
${newsText}

For each holding, estimate the likely dollar impact of this news (e.g. "+$120 to +$340" or "-$200 to -$500" or "minimal impact"). Base estimates on typical stock move sizes for this type of news event and the position size shown above. Be honest when impact is unclear.

Return ONLY valid JSON, no markdown:
{
  "overallImpact": "Low" | "Watch" | "Act Now",
  "summary": "2-3 sentence plain-English explanation of what this news means for this specific portfolio — use dollar amounts",
  "tickerBreakdown": [
    {
      "ticker": string,
      "impact": "Positive" | "Negative" | "Neutral",
      "estimatedDollarChange": string,
      "reason": string
    }
  ],
  "recommendation": "One plain-English action sentence — what should this investor consider doing today?"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: [{
        type: 'text',
        text: 'You are a financial intelligence assistant. Translate market news into plain-English dollar impacts for a retail investor\'s specific holdings. Be concrete about dollar ranges. Return only valid JSON. Never use markdown fences.',
        cache_control: { type: 'ephemeral' },
      }],
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
      tickerBreakdown: holdingsWithPrices.map((h) => ({ ticker: h.ticker, impact: 'Neutral', estimatedDollarChange: null, reason: 'Analysis unavailable' })),
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

Analyze the significance of this trade for a retail investor. Consider:
- The official's committee roles and likely access to non-public information
- The disclosure timing (faster = more time-sensitive signal)
- Whether this is a purchase (bullish signal) or sale (less signal — could be diversification)
- The amount relative to typical congressional trades

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

async function summarizeNewsItemWithContext(headline, content, userProfile = null, sentimentScore = null) {
  if (!checkBudget()) return BUDGET_FALLBACK;
  try {
    const anthropic = getClient();

    const profileNote = userProfile
      ? `\nInvestor profile: ${userProfile.investorType || 'retail'} investor with ${userProfile.riskTolerance || 'moderate'} risk tolerance. Tailor urgency framing to this profile.`
      : '';

    const sentimentHint = sentimentScore != null
      ? `\nSentiment signal: ${sentimentScore > 0.3 ? 'Positive' : sentimentScore < -0.3 ? 'Negative' : 'Neutral'} (score: ${sentimentScore.toFixed(2)}).`
      : '';

    const prompt = `${URGENCY_CRITERIA}

News headline: ${headline}
News content: ${content || headline}${sentimentHint}${profileNote}

Task:
1. Write a 2-sentence plain-English summary — no jargon.
2. Rate urgency using the criteria above, adjusted for this investor's profile.
3. If this is a bullish buying opportunity for a specific stock, set upside. Otherwise null.

Return ONLY valid JSON, no markdown:
{
  "summary": string,
  "urgency": "Low" | "Watch" | "Act Now",
  "reasoning": "one sentence citing which specific criterion was met",
  "upside": { "ticker": string, "reason": string } | null
}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 380,
      system: [
        {
          type: 'text',
          text: 'You are a financial intelligence assistant that scores news for retail investors. Be conservative: default to Low unless a clear criterion is met. Return only valid JSON. Never use markdown fences.',
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
      upside: parsed.upside || null,
    };
  } catch (err) {
    console.log('Claude contextual news summary error:', err.message);
    return FALLBACK_RESPONSE;
  }
}

async function generateWeeklyBrief(scoredItems) {
  if (!checkBudget()) return { brief: BUDGET_FALLBACK.summary, bullets: [] };
  try {
    const anthropic = getClient();

    // Build a richer input using the already-scored items
    const actNow = scoredItems.filter((i) => i.urgency === 'Act Now').slice(0, 4);
    const watch = scoredItems.filter((i) => i.urgency === 'Watch').slice(0, 4);
    const upside = scoredItems.filter((i) => i.upside).slice(0, 3);

    const lines = [
      actNow.length ? `ACT NOW:\n${actNow.map((i) => `- ${i.summary || i.headline}`).join('\n')}` : '',
      watch.length ? `WATCH:\n${watch.map((i) => `- ${i.summary || i.headline}`).join('\n')}` : '',
      upside.length ? `UPSIDE OPPORTUNITIES:\n${upside.map((i) => `- ${i.upside.ticker}: ${i.upside.reason}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: [{
        type: 'text',
        text: 'You are a financial analyst writing a concise weekly market brief for retail investors with no finance background. Plain English only — no jargon. Return only valid JSON, no markdown.',
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role: 'user',
        content: `Based on this week's pre-scored market intelligence:\n\n${lines}\n\nWrite a brief market outlook in plain English.\n\nReturn ONLY valid JSON:\n{\n  "brief": "2-3 sentence overview of what matters most this week",\n  "bullets": [\n    "Watch: [specific thing]",\n    "Risk: [specific risk]",\n    "Opportunity: [specific stock or sector with upside]",\n    "Trend: [dominant market theme]"\n  ]\n}`,
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
