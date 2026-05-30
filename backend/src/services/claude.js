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

const FALLBACK_ITEM = {
  relevant: true,
  summary: 'Summary unavailable',
  urgency: 'Low',
  reasoning: 'AI service temporarily unavailable',
  upside: null,
};

const BUDGET_FALLBACK = {
  relevant: true,
  summary: 'Daily AI budget reached. Analysis will resume tomorrow.',
  urgency: 'Low',
  reasoning: 'Token budget exceeded',
  upside: null,
};

// Kept in system prompt so it is cached after the first request in each window.
// Prompt cache saves ~90% on repeated tokens within 5 minutes.
const SYSTEM_PROMPT = `You are a financial intelligence assistant for retail investors. Return only valid JSON, never markdown fences.

URGENCY CRITERIA — apply these strictly and conservatively. Default to Low when uncertain.

ACT NOW (genuine market-moving events only):
- Earnings surprise >5% above or below expectations
- FDA approval or rejection of a major drug
- Merger, acquisition, or buyout announced or collapsed
- Federal Reserve rate decision or surprise policy change
- CEO/CFO departure under negative circumstances, or fraud allegation
- Bankruptcy filing or imminent default
- Major product recall or safety investigation
- Geopolitical event directly disrupting a company's supply chain (war, sanctions, trade ban)

WATCH (important but not immediately actionable):
- Analyst upgrade or downgrade with new price target
- Company issues guidance revision
- Earnings report in the next 1–3 days
- Congressional insider trade disclosed (large amount)
- Regulatory investigation opened
- Sector-wide event affecting multiple stocks

LOW (background noise — default):
- Earnings within consensus expectations
- General commentary or opinion
- Minor analyst mentions with no rating change
- Scheduled data releases with no surprise
- Company reaffirms existing guidance`;

// ── Batch scoring: one API call for all articles ──────────────────────────────
// Replaces 20 individual summarizeNewsItem calls with a single request.
// Reduces input tokens by ~6× and eliminates per-call API overhead.
async function batchSummarizeNews(articles) {
  if (!articles.length) return [];
  if (!checkBudget()) return articles.map(() => ({ ...BUDGET_FALLBACK }));

  try {
    const anthropic = getClient();

    const truncated = articles.map((a, i) => ({
      i,
      headline: a.headline,
      // Truncate content — 300 chars is enough to score urgency
      content: (a.description || '').slice(0, 300),
      sentiment: a.sentiment != null ? a.sentiment.toFixed(2) : null,
    }));

    const prompt = `Score each of these ${truncated.length} financial news articles.

For each article:
1. Is it genuinely about financial markets, stocks, crypto, commodities, or economic policy? If not, set relevant:false and urgency:"Low".
2. Write a 2-sentence plain-English summary (no jargon).
3. Rate urgency using the criteria in your system prompt.
4. If it's a strong bullish catalyst for a specific purchasable stock (upside opportunity), set upside. Otherwise null.

Articles JSON:
${JSON.stringify(truncated)}

Return a JSON array in the SAME order with exactly ${truncated.length} objects:
[{"i":0,"relevant":bool,"summary":string,"urgency":"Low"|"Watch"|"Act Now","reasoning":string,"upside":{"ticker":string,"reason":string}|null},...]`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // ~150 tokens per article output × N articles
      max_tokens: Math.min(150 * truncated.length + 200, 4096),
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const raw = message.content[0]?.text || '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const results = JSON.parse(cleaned);

    // Map back by index, fall back to FALLBACK_ITEM for any missing
    const byIndex = {};
    for (const r of results) byIndex[r.i] = r;

    return articles.map((_, i) => {
      const r = byIndex[i];
      if (!r) return { ...FALLBACK_ITEM };
      const validUrgencies = ['Low', 'Watch', 'Act Now'];
      return {
        relevant: r.relevant !== false,
        summary: r.summary || FALLBACK_ITEM.summary,
        urgency: validUrgencies.includes(r.urgency) ? r.urgency : 'Low',
        reasoning: r.reasoning || '',
        upside: r.upside || null,
      };
    });
  } catch (err) {
    console.log('Claude batch scoring error:', err.message);
    return articles.map(() => ({ ...FALLBACK_ITEM }));
  }
}

// ── Single-item scoring (used for individual lookups outside the main feed) ───
async function summarizeNewsItem(headline, content, sentimentScore = null) {
  if (!checkBudget()) return BUDGET_FALLBACK;
  try {
    const results = await batchSummarizeNews([{ headline, description: content, sentiment: sentimentScore }]);
    return results[0] || FALLBACK_ITEM;
  } catch (err) {
    console.log('Claude summarization error:', err.message);
    return FALLBACK_ITEM;
  }
}

// ── Portfolio impact — Haiku instead of Sonnet (4× cheaper, adequate quality) ─
async function analyzePortfolioImpact(holdingsWithPrices, scoredNewsItems) {
  if (!checkBudget()) return {
    overallImpact: 'Low',
    summary: BUDGET_FALLBACK.summary,
    tickerBreakdown: holdingsWithPrices.map((h) => ({ ticker: h.ticker, impact: 'Neutral', estimatedDollarChange: null, reason: 'Budget exceeded' })),
    recommendation: 'AI analysis will resume tomorrow.',
  };
  try {
    const anthropic = getClient();

    const holdingsText = holdingsWithPrices
      .filter((h) => h.quantity > 0)
      .map((h) => {
        const value = h.value ? `$${h.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'unknown value';
        const change = h.changePercent != null ? ` (today ${h.changePercent > 0 ? '+' : ''}${h.changePercent.toFixed(2)}%)` : '';
        return `${h.ticker}: ${h.quantity} units @ $${h.price ?? '?'} = ${value}${change}`;
      })
      .join('\n');

    const totalValue = holdingsWithPrices.reduce((s, h) => s + (h.value || 0), 0);

    // Prioritise high-urgency and ticker-relevant news, cap at 6 items to save tokens
    const tickers = new Set(holdingsWithPrices.map((h) => h.ticker));
    const relevant = (scoredNewsItems || [])
      .filter((n) => n.urgency !== 'Low' || tickers.has(n.ticker))
      .slice(0, 6);
    const newsText = relevant
      .map((n) => `[${n.urgency}]${n.ticker ? ` ${n.ticker}:` : ''} ${(n.summary || n.headline || '').slice(0, 120)}`)
      .join('\n');

    const prompt = `Portfolio (~$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} total):\n${holdingsText}\n\nTop news:\n${newsText}\n\nFor each holding estimate the dollar impact of this news. Return ONLY JSON:\n{"overallImpact":"Low"|"Watch"|"Act Now","summary":"2-3 sentence plain-English impact using dollar amounts","tickerBreakdown":[{"ticker":string,"impact":"Positive"|"Negative"|"Neutral","estimatedDollarChange":string,"reason":string}],"recommendation":"one plain-English action sentence"}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const raw = message.content[0]?.text || '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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

// ── Gov trade analysis — keep Sonnet for nuanced insider-trade context ─────────
async function summarizeGovTrade(tradeData, investorContext = null) {
  if (!checkBudget()) return {
    summary: BUDGET_FALLBACK.summary, urgency: 'Low',
    reasoning: BUDGET_FALLBACK.reasoning, sentiment: 'Neutral', time_sensitive: false,
  };
  try {
    const anthropic = getClient();

    const action = /purchase/i.test(tradeData.transactionType) ? 'purchased' : 'sold';
    const lagDesc = tradeData.disclosureLagDays > 0 ? `${tradeData.disclosureLagDays} days after the trade` : 'on the day of the trade';
    const contextNote = investorContext ? `\nInvestor: ${investorContext.investorType}, ${investorContext.riskTolerance} risk.` : '';

    const prompt = `${tradeData.title} ${tradeData.officialName} (${tradeData.party}) ${action} ${tradeData.amountRange} of ${tradeData.ticker} on ${tradeData.tradeDate}. Disclosed ${lagDesc}.${contextNote}\n\nAnalyze significance for a retail investor. Consider committee roles, disclosure timing, purchase vs sale.\n\nReturn ONLY JSON:\n{"summary":"2 sentence plain-English explanation","urgency":"Low"|"Watch"|"Act Now","reasoning":"1 sentence","sentiment":"Bullish"|"Bearish"|"Neutral","time_sensitive":true|false}`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    recordUsage(message.usage);
    const raw = message.content[0]?.text || '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const validUrgencies = ['Low', 'Watch', 'Act Now'];
    if (!validUrgencies.includes(parsed.urgency)) parsed.urgency = 'Low';
    const validSentiments = ['Bullish', 'Bearish', 'Neutral'];
    if (!validSentiments.includes(parsed.sentiment)) parsed.sentiment = 'Neutral';

    return parsed;
  } catch (err) {
    console.log('Claude gov trade summary error:', err.message);
    return { summary: 'Analysis temporarily unavailable.', urgency: tradeData.urgency || 'Low', reasoning: 'AI unavailable.', sentiment: 'Neutral', time_sensitive: false };
  }
}

async function summarizeNewsItemWithContext(headline, content, userProfile = null, sentimentScore = null) {
  // Thin wrapper — reuses single-item path; profile note added if present
  if (!checkBudget()) return BUDGET_FALLBACK;
  const results = await batchSummarizeNews([{
    headline: userProfile ? `[${userProfile.investorType || 'retail'} investor, ${userProfile.riskTolerance || 'moderate'} risk] ${headline}` : headline,
    description: content,
    sentiment: sentimentScore,
  }]);
  return results[0] || FALLBACK_ITEM;
}

async function generateWeeklyBrief(scoredItems) {
  if (!checkBudget()) return { brief: BUDGET_FALLBACK.summary, bullets: [] };
  try {
    const anthropic = getClient();

    const actNow = scoredItems.filter((i) => i.urgency === 'Act Now').slice(0, 3);
    const watch = scoredItems.filter((i) => i.urgency === 'Watch').slice(0, 3);
    const upside = scoredItems.filter((i) => i.upside).slice(0, 2);

    const lines = [
      actNow.length ? `ACT NOW:\n${actNow.map((i) => `- ${(i.summary || i.headline || '').slice(0, 100)}`).join('\n')}` : '',
      watch.length ? `WATCH:\n${watch.map((i) => `- ${(i.summary || i.headline || '').slice(0, 100)}`).join('\n')}` : '',
      upside.length ? `UPSIDE:\n${upside.map((i) => `- ${i.upside.ticker}: ${i.upside.reason}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: `Write a brief weekly market outlook in plain English based on:\n\n${lines}\n\nReturn ONLY JSON:\n{"brief":"2-3 sentence overview","bullets":["Watch: X","Risk: X","Opportunity: X","Trend: X"]}`,
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

module.exports = { batchSummarizeNews, summarizeNewsItem, analyzePortfolioImpact, summarizeGovTrade, summarizeNewsItemWithContext, getBudgetStatus, generateWeeklyBrief };
