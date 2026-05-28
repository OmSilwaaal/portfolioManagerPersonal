const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { getClient, getConnection, saveConnection, deleteConnection } = require('../services/snaptrade');

// GET /api/snaptrade/status — check if this user has a connected brokerage
router.get('/status', async (req, res) => {
  try {
    const conn = getConnection(req.user.id);
    if (!conn) return res.json({ connected: false });

    const st = getClient();
    const auths = (await st.connections.listBrokerageAuthorizations({
      userId: conn.snaptrade_user_id,
      userSecret: conn.snaptrade_user_secret,
    })).data;

    const hasAuth = Array.isArray(auths) && auths.length > 0;
    res.json({ connected: hasAuth, brokerages: hasAuth ? auths.map((a) => a.brokerage?.name).filter(Boolean) : [] });
  } catch (err) {
    console.error('snaptrade status error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to check connection status' });
  }
});

// POST /api/snaptrade/register — register user with SnapTrade and return login link
router.post('/register', async (req, res) => {
  try {
    const st = getClient();
    let conn = getConnection(req.user.id);
    let snaptradeUserId, snaptradeUserSecret;

    if (conn) {
      snaptradeUserId = conn.snaptrade_user_id;
      snaptradeUserSecret = conn.snaptrade_user_secret;
    } else {
      snaptradeUserId = randomUUID();
      const reg = (await st.authentication.registerSnapTradeUser({ userId: snaptradeUserId })).data;
      snaptradeUserSecret = reg.userSecret;
      saveConnection(req.user.id, snaptradeUserId, snaptradeUserSecret);
    }

    const loginRes = (await st.authentication.loginSnapTradeUser({
      userId: snaptradeUserId,
      userSecret: snaptradeUserSecret,
    })).data;

    res.json({ redirectURI: loginRes.redirectURI ?? loginRes });
  } catch (err) {
    console.error('snaptrade register error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to create SnapTrade session' });
  }
});

// GET /api/snaptrade/accounts — list connected brokerage accounts
router.get('/accounts', async (req, res) => {
  try {
    const conn = getConnection(req.user.id);
    if (!conn) return res.status(404).json({ error: true, message: 'No brokerage connection found' });

    const st = getClient();
    const accounts = (await st.accountInformation.listUserAccounts({
      userId: conn.snaptrade_user_id,
      userSecret: conn.snaptrade_user_secret,
    })).data;

    res.json({ accounts: Array.isArray(accounts) ? accounts : [] });
  } catch (err) {
    console.error('snaptrade accounts error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to fetch accounts' });
  }
});

// GET /api/snaptrade/holdings — all positions across all accounts
router.get('/holdings', async (req, res) => {
  try {
    const conn = getConnection(req.user.id);
    if (!conn) return res.status(404).json({ error: true, message: 'No brokerage connection found' });

    const st = getClient();
    const holdings = (await st.accountInformation.getAllUserHoldings({
      userId: conn.snaptrade_user_id,
      userSecret: conn.snaptrade_user_secret,
    })).data;

    res.json({ holdings: Array.isArray(holdings) ? holdings : [] });
  } catch (err) {
    console.error('snaptrade holdings error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to fetch holdings' });
  }
});

// DELETE /api/snaptrade/disconnect — remove brokerage connection and SnapTrade user
router.delete('/disconnect', async (req, res) => {
  try {
    const conn = getConnection(req.user.id);
    if (!conn) return res.json({ success: true });

    const st = getClient();
    try {
      await st.authentication.deleteSnapTradeUser({ userId: conn.snaptrade_user_id });
    } catch (deleteErr) {
      console.warn('snaptrade delete user warning:', deleteErr.message);
    }

    deleteConnection(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('snaptrade disconnect error:', err.message);
    res.status(500).json({ error: true, message: 'Failed to disconnect' });
  }
});

module.exports = router;
