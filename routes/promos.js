const router = require('express').Router();
const { getCollection, addDoc, setDoc, deleteDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// Seed default promos
const seedPromos = async () => {
  const existing = await getCollection('promos');
  if (existing.length > 0) return;
  const sample = [
    { id: 'promo_1', code: 'DNSAVE10', discountPercent: 10, status: 'active', createdAt: new Date().toISOString() },
    { id: 'promo_2', code: 'WELCOME20', discountPercent: 20, status: 'active', createdAt: new Date().toISOString() },
    { id: 'promo_3', code: 'FIRST15', discountPercent: 15, status: 'active', createdAt: new Date().toISOString() },
  ];
  for (const p of sample) {
    await addDoc('promos', p, p.id);
  }
};
setTimeout(seedPromos, 1000);

// GET all promos (Admin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    res.json(await getCollection('promos'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST validate promo (Public)
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    
    const promos = await getCollection('promos');
    const promo = promos.find(p => p.code.toUpperCase() === code.toUpperCase() && p.status === 'active');
    
    if (!promo) return res.status(404).json({ error: 'Invalid or expired promo code' });
    
    res.json({ valid: true, discountPercent: promo.discountPercent, code: promo.code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create promo (Admin)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const promos = await getCollection('promos');
    const { code, discountPercent, status } = req.body;
    
    if (promos.some(p => p.code.toUpperCase() === code.toUpperCase())) {
      return res.status(400).json({ error: 'Promo code already exists' });
    }
    
    const newPromo = {
      code: code.toUpperCase(),
      discountPercent: Number(discountPercent),
      status: status || 'active',
      createdAt: new Date().toISOString()
    };
    
    const id = `promo_${Date.now()}`;
    const saved = await addDoc('promos', newPromo, id);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update promo (Admin)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updated = await setDoc('promos', req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE promo (Admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await deleteDoc('promos', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
