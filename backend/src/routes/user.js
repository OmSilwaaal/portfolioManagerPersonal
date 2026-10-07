const express = require('express');
const router = express.Router();
const { supabase: adminSupabase } = require('../services/supabaseAdmin');
const { getDb } = require('../db/schema');
const { getClient, getConnection, deleteConnection } = require('../services/snaptrade');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Best-effort step: a failure is logged but never blocks the rest of the cleanup
async function step(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`[delete-user] ${label} failed:`, err?.message ?? err);
  }
}

// DELETE /api/user  — permanently deletes the authenticated user's account and personal data
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: true, message: 'Not authenticated.' });

    const stripeCustomerId = req.user.app_metadata?.stripeCustomerId;
    const snap = (() => { try { return getConnection(userId); } catch { return null; } })();

    // 1. Remove the login first — this is what actually cuts off access
    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Delete user error:', error.message);
      return res.status(500).json({ error: true, message: 'Failed to delete account. Please try again.' });
    }

    // 2. Third parties: stop billing, disconnect brokerage
    if (stripe && stripeCustomerId) {
      await step('stripe subscriptions', async () => {
        const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 20 });
        for (const sub of subs.data) await stripe.subscriptions.cancel(sub.id);
      });
    }
    if (snap) {
      await step('snaptrade user', () => getClient().authentication.deleteSnapTradeUser({ userId: snap.snaptrade_user_id }));
    }

    // 3. Local (SQLite) data
    await step('sqlite data', async () => {
      const db = getDb();
      deleteConnection(userId);
      db.prepare('DELETE FROM csv_positions WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM alerts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM user_preferences WHERE sessionId = ?').run(userId);
    });

    // 4. Supabase data (service role bypasses RLS)
    for (const table of ['paper_transactions', 'paper_cash_purchases', 'paper_positions', 'paper_portfolios']) {
      await step(table, async () => {
        const { error: e } = await adminSupabase.from(table).delete().eq('user_id', userId);
        if (e) throw e;
      });
    }
    await step('group posts', async () => {
      const { error: e } = await adminSupabase.from('group_posts').delete().eq('author_id', userId);
      if (e) throw e;
    });
    await step('group memberships', async () => {
      const { error: e } = await adminSupabase.from('group_members').delete().eq('user_id', userId);
      if (e) throw e;
    });
    await step('profile', async () => {
      const { error: e } = await adminSupabase.from('profiles').delete().eq('user_id', userId);
      if (e) throw e;
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
