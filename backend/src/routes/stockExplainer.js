const express = require('express')
const router = express.Router()
const { requireAuth } = require('../middleware/auth')
const { supabase } = require('../services/supabaseAdmin')

const CACHE_DAYS = 7

router.get('/:ticker', requireAuth, async (req, res) => {
  const ticker = req.params.ticker.toUpperCase()

  try {
    // Check Supabase cache first
    const { data: cached, error: fetchError } = await supabase
      .from('stock_explanations')
      .select('ticker, explanation, created_at')
      .eq('ticker', ticker)
      .maybeSingle()

    if (!fetchError && cached) {
      const age = Date.now() - new Date(cached.created_at).getTime()
      const maxAge = CACHE_DAYS * 24 * 60 * 60 * 1000
      if (age < maxAge) {
        const remainingSecs = Math.floor((maxAge - age) / 1000);
        res.set('Cache-Control', `public, max-age=${remainingSecs}`);
        return res.json({ ticker: cached.ticker, explanation: cached.explanation })
      }
    }

    // Generate via Anthropic
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({
        ticker,
        explanation: `We couldn't load an explanation right now. Try searching for '${ticker} company' to learn more.`,
        fallback: true,
      })
    }

    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `In 2-3 sentences, explain what ${ticker} the company does in plain English for someone who has never invested before. No financial jargon. Be specific about what they actually sell or make. End with one sentence about what typically makes their stock go up or down.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const explanation = response.content[0].text

    // Upsert into Supabase cache
    await supabase
      .from('stock_explanations')
      .upsert({ ticker, explanation, created_at: new Date().toISOString() }, { onConflict: 'ticker' })

    return res.json({ ticker, explanation })
  } catch (err) {
    console.error('[stockExplainer] error:', err)
    return res.json({
      ticker,
      explanation: `We couldn't load an explanation right now. Try searching for '${ticker} company' to learn more.`,
      fallback: true,
    })
  }
})

module.exports = { router }
