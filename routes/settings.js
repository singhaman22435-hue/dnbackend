const router = require('express').Router();
const { getDoc, setDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// GET hero settings (public)
router.get('/hero', async (req, res) => {
  try {
    const heroSettings = await getDoc('settings', 'hero');
    if (heroSettings) {
      res.json(heroSettings.slides || []);
    } else {
      res.json([]);
    }
  } catch (err) {
    console.error("Error fetching hero settings:", err);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
});

// POST update hero settings (admin only)
router.post('/hero', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== undefined) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { slides } = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ error: 'Slides must be an array' });
    }

    await setDoc('settings', 'hero', { slides });
    res.json({ success: true, message: 'Hero settings updated successfully' });
  } catch (err) {
    console.error("Error saving hero settings:", err);
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

// GET lookbook settings (public)
router.get('/lookbook', async (req, res) => {
  try {
    const lookbookSettings = await getDoc('settings', 'lookbook');
    if (lookbookSettings) {
      res.json(lookbookSettings);
    } else {
      res.json({
        image1: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
        image2: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80',
        image3: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&q=80'
      });
    }
  } catch (err) {
    console.error("Error fetching lookbook settings:", err);
    res.status(500).json({ error: 'Server error fetching settings' });
  }
});

// POST update lookbook settings (admin only)
router.post('/lookbook', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== undefined) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { image1, image2, image3 } = req.body;
    
    await setDoc('settings', 'lookbook', { image1, image2, image3 });
    res.json({ success: true, message: 'Lookbook settings updated successfully' });
  } catch (err) {
    console.error("Error saving lookbook settings:", err);
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

// GET UPI settings (public - needed for checkout QR)
router.get('/upi', async (req, res) => {
  try {
    const upiSettings = await getDoc('settings', 'upi');
    if (upiSettings) {
      res.json(upiSettings);
    } else {
      res.json({ upiId: '', businessName: 'DN Shoppy' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST update UPI settings (admin only)
router.post('/upi', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== undefined) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { upiId, businessName } = req.body;
    if (!upiId) return res.status(400).json({ error: 'UPI ID is required' });
    await setDoc('settings', 'upi', { upiId, businessName: businessName || 'DN Shoppy' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

module.exports = router;
