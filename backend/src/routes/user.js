const express = require('express');
const router = express.Router();
const { supabase: adminSupabase } = require('../services/supabaseAdmin');

// DELETE /api/user  — permanently deletes the authenticated user's account
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: true, message: 'Not authenticated.' });

    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Delete user error:', error.message);
      return res.status(500).json({ error: true, message: 'Failed to delete account. Please try again.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
