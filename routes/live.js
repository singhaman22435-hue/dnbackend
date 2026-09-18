const express = require('express');
const router = express.Router();
const db = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// Default live state
const DEFAULT_LIVE_STATE = {
  isLive: false,
  instaUrl: 'https://instagram.com/dn.shoppy.sangrul/live',
  productIds: [],
  message: 'Special Live Sale is ON! Shop these exclusive items before they sell out.',
  liveStartTime: '',
  updatedAt: new Date().toISOString()
};

// GET /api/live - Get current live status
router.get('/', async (req, res) => {
  try {
    let liveState = await db.getDoc('settings', 'live');
    if (!liveState) {
      liveState = DEFAULT_LIVE_STATE;
    }
    res.json(liveState);
  } catch (err) {
    console.error("Live API Error:", err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch live status' });
  }
});

// POST /api/live - Update live status (Admin only)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { isLive, instaUrl, productIds, message, liveStartTime } = req.body;
    const newState = {
      isLive: Boolean(isLive),
      instaUrl: instaUrl || DEFAULT_LIVE_STATE.instaUrl,
      productIds: Array.isArray(productIds) ? productIds : [],
      message: message || DEFAULT_LIVE_STATE.message,
      liveStartTime: liveStartTime || '',
      updatedAt: new Date().toISOString()
    };
    
    await db.setDoc('settings', 'live', newState);
    res.json({ status: 'success', data: newState });
  } catch (err) {
    console.error("Live API Error:", err);
    res.status(500).json({ status: 'error', message: 'Failed to update live status' });
  }
});

module.exports = router;
