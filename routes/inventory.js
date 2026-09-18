const router = require('express').Router();
const { getCollection, setDoc, getDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// GET inventory (products with stock info)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const products = await getCollection('products');
    const inventory = products.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type,
      price: p.price,
      stock: p.stock || 0,
      status: p.status || 'active',
      image: p.images?.[0] || '',
      lowStock: (p.stock || 0) <= 5,
      outOfStock: (p.stock || 0) === 0,
    }));
    res.json({
      inventory,
      summary: {
        total: inventory.length,
        lowStock: inventory.filter(i => i.lowStock && !i.outOfStock).length,
        outOfStock: inventory.filter(i => i.outOfStock).length,
        inStock: inventory.filter(i => !i.lowStock).length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT update stock
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await getDoc('products', req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    await setDoc('products', req.params.id, { 
      stock: req.body.stock, 
      updatedAt: new Date().toISOString() 
    });
    
    res.json({ id: req.params.id, stock: req.body.stock });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
