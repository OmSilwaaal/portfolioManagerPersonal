const express = require('express');
const recovery = require('../services/recovery');
const { supabase } = require('../services/supabaseAdmin');
const { requireAuth } = require('../middleware/auth');

// Signed-in: manage your own phrase  (mounted at /api/recovery)
const manage = express.Router();

manage.get('/', requireAuth, (req, res) => {
  res.json({ available: recovery.isAvailable(), ...recovery.getStatus(req.user.id) });
});

// POST { replace?: boolean } — returns the phrase ONCE. 409 if one already exists and replace isn't set.
manage.post('/', requireAuth, (req, res) => {
  if (!recovery.isAvailable()) return res.status(503).json({ error: true, message: 'Recovery phrases are not available yet.' });
  const phrase = recovery.createPhrase(req.user.id, { replace: req.body?.replace === true });
  if (!phrase) {
    return res.status(409).json({ error: true, message: 'You already have a recovery phrase. It can only be shown once — generate a new one to replace it.' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ phrase, words: phrase.split(' ') });
});

// Signed-out: sign in with a phrase  (mounted at /api/recover)
const signIn = express.Router();

// POST { phrase } → { token_hash } which the client exchanges for a session via supabase.auth.verifyOtp
signIn.post('/login', async (req, res) => {
  const fail = () => res.status(401).json({ error: true, message: 'That recovery phrase is not valid.' });
  if (!recovery.isAvailable()) return res.status(503).json({ error: true, message: 'Recovery sign-in is not available yet.' });
  if (typeof req.body?.phrase !== 'string' || req.body.phrase.length > 200) return fail();

  try {
    const userId = recovery.findUserByPhrase(req.body.phrase);
    if (!userId) return fail();

    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) return fail();

    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) throw error || new Error('no token');

    res.set('Cache-Control', 'no-store');
    res.json({ token_hash: tokenHash });
  } catch (err) {
    console.error('[recovery] login failed:', err?.message);
    res.status(500).json({ error: true, message: 'Could not sign you in. Try again.' });
  }
});

module.exports = { manage, signIn };
