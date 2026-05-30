const express = require('express');
const router = express.Router();
const { getCommodityPrice, getAllCommodities } = require('../services/alphaVantage');
const NodeCache = require('node-cache');

const contextCache = new NodeCache({ stdTTL: 3600, maxKeys: 50 });

async function getMacroContext(commodity) {
  const cacheKey = `context_${commodity}`;
  const cached = contextCache.get(cacheKey);
  if (cached) return cached;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: [
        {
          type: 'text',
          text: 'You are a financial intelligence assistant. Return only valid JSON. Never use markdown fences.',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Briefly explain in 1 sentence what is driving ${commodity} prices right now for a non-expert investor. Return JSON: { "context": "your one sentence here" }`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const result = parsed.context || null;
    contextCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(`Macro context error for ${commodity}:`, err.message);
    return null;
  }
}

// GET /api/commodities
router.get('/', async (req, res, next) => {
  try {
    const commodities = await getAllCommodities();

    // Attach AI context with concurrency capped at 3 to avoid Claude rate limits
    const withContext = [];
    for (let i = 0; i < commodities.length; i += 3) {
      const batch = commodities.slice(i, i + 3);
      const results = await Promise.all(batch.map(async (c) => {
        const macroContext = await getMacroContext(c.commodity);
        return { ...c, macroContext };
      }));
      withContext.push(...results);
    }

    res.json({ commodities: withContext });
  } catch (err) {
    next(err);
  }
});

// GET /api/commodities/:symbol
router.get('/:symbol', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const commodity = await getCommodityPrice(symbol.toUpperCase());

    if (!commodity) {
      return res.status(404).json({ error: `Commodity not found: ${symbol}` });
    }

    const macroContext = await getMacroContext(commodity.commodity);

    res.json({ ...commodity, macroContext });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
