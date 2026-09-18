const express = require('express');
const router = express.Router();
const db = require('../middleware/db');

// GET /api/downloads - Fetch total downloads
router.get('/', async (req, res) => {
  try {
    let stats = await db.getDoc('settings', 'downloads');
    if (!stats) {
      stats = { count: 0, lastUpdated: new Date().toISOString() };
      await db.setDoc('settings', 'downloads', stats);
    }
    res.json(stats);
  } catch (err) {
    console.error("Downloads API Error:", err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch download stats' });
  }
});

// POST /api/downloads - Increment download counter
router.post('/', async (req, res) => {
  try {
    let stats = await db.getDoc('settings', 'downloads');
    let currentCount = 0;
    if (stats && typeof stats.count === 'number') {
      currentCount = stats.count;
    }
    
    const newStats = {
      count: currentCount + 1,
      lastUpdated: new Date().toISOString()
    };
    
    await db.setDoc('settings', 'downloads', newStats);
    res.json({ status: 'success', data: newStats });
  } catch (err) {
    console.error("Downloads API Error:", err);
    res.status(500).json({ status: 'error', message: 'Failed to increment download stats' });
  }
});

module.exports = router;
