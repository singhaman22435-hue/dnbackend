const router = require('express').Router();
const { getCollection, addDoc, setDoc, deleteDoc, getDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');
const { deleteImage } = require('../utils/storage');
const apicache = require('apicache');
const cache = apicache.middleware;

const CATEGORY_IMAGES = {
  'saree': 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=85',
  'dress': 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=1200&q=85',
  'jewellery': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=85',
  'gowns': 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=1200&q=85',
  'mens-wear': 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1200&q=85',
  'blouse': 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=1200&q=85',
  'womans-jeans': 'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?auto=format&fit=crop&w=1200&q=85',
  'others': 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=1200&q=85'
};

const TYPE_IMAGES = {
  'anti-tarnish-kada': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'baby-size-kada': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&q=80',
  'bracelets': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'earrings-anti': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'rings-anti': 'https://images.unsplash.com/photo-1605100804763-247f67b2548e?w=600&q=80',
  'chains': 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80',
  'waist-chain': 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=600&q=80',
  'anklet': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'piercings': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'ear-cuffs': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'studs': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'mens-kada': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'mens-chain': 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80',
  'nath': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'zumka': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'manglsutra': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'necklace': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'bangles': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'earrings-indian': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'rings-indian': 'https://images.unsplash.com/photo-1605100804763-247f67b2548e?w=600&q=80',
  'painjan': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
};

const seedCategories = async () => {
  const existing = await getCollection('categories');
  
  if (existing.length > 0) {
    // Migration: Add images to existing categories if missing
    for (const data of existing) {
      let updated = false;
      if (!data.image && CATEGORY_IMAGES[data.slug]) {
        data.image = CATEGORY_IMAGES[data.slug];
        updated = true;
      }
      if (data.types && Array.isArray(data.types)) {
        data.types = data.types.map(type => {
          if (!type.image && TYPE_IMAGES[type.slug]) {
            updated = true;
            return { ...type, image: TYPE_IMAGES[type.slug] };
          }
          return type;
        });
      }
      if (updated) {
        await setDoc('categories', data.id, data);
        console.log(`Updated images for category: ${data.name}`);
      }
    }
    return;
  }
  const defaults = [
    { 
      id: 'saree', name: 'Sarees', slug: 'saree', emoji: '👘', color: '#D4847A', description: "Woman's Saree", status: 'active', 
      types: [{ id: 'cutwork', name: 'Cutwork', slug: 'cutwork' }, { id: 'printed', name: 'Printed', slug: 'printed' }, { id: 'frill', name: 'Frill', slug: 'frill' }, { id: 'party-wear', name: 'Party Wear', slug: 'party-wear' }] 
    },
    { 
      id: 'dress', name: 'Dresses', slug: 'dress', emoji: '👗', color: '#C084A8', description: "Woman's Dress", status: 'active', 
      types: [{ id: '3-piece', name: '3-Piece', slug: '3-piece' }, { id: 'one-piece', name: 'One-Piece', slug: 'one-piece' }, { id: 'cord-set', name: 'Cord Set', slug: 'cord-set' }, { id: 'short-kurti', name: 'Short Kurti', slug: 'short-kurti' }, { id: 'kurti', name: 'Kurti', slug: 'kurti' }, { id: 'crop-top', name: 'Crop Top', slug: 'crop-top' }, { id: 'feeding-dress', name: 'Feeding Dress', slug: 'feeding-dress' }] 
    },
    { 
      id: 'gowns', name: 'Gowns', slug: 'gowns', emoji: '👑', color: '#9B7AB8', description: "Woman's Gown", status: 'active', 
      types: [{ id: 'off-shoulder', name: 'Off-Shoulder', slug: 'off-shoulder' }, { id: 'cotton-gown', name: 'Cotton', slug: 'cotton-gown' }, { id: 'crape', name: 'Crape', slug: 'crape' }, { id: 'fitting', name: 'Fitting', slug: 'fitting' }, { id: 'smocking', name: 'Smocking', slug: 'smocking' }] 
    },
    { 
      id: 'womans-jeans', name: 'Women\'s Jeans', slug: 'womans-jeans', emoji: '👖', color: '#5A7A9A', description: "Woman's Jeans", status: 'active', 
      types: [{ id: 'baggy', name: 'Baggy', slug: 'baggy' }, { id: 'formal-women', name: 'Formal', slug: 'formal-women' }, { id: 'daily-wear', name: 'Daily Wear', slug: 'daily-wear' }] 
    },
    { 
      id: 'blouse', name: 'Blouses', slug: 'blouse', emoji: '👚', color: '#8AAE92', description: "Woman's Blouse", status: 'active', 
      types: [{ id: 'blouse-default', name: 'Blouse', slug: 'blouse-default' }] 
    },
    { 
      id: 'mens-wear', name: "Men's Wear", slug: 'mens-wear', emoji: '👔', color: '#4A6A8A', description: 'Men\'s Collection', status: 'active', 
      types: [{ id: 'jeans-men', name: 'Jeans', slug: 'jeans-men' }, { id: 'shirt', name: 'Shirt', slug: 'shirt' }, { id: 'formal-men', name: 'Formal', slug: 'formal-men' }, { id: 't-shirt', name: 'T-Shirt', slug: 't-shirt' }, { id: 'other-men', name: 'Other', slug: 'other-men' }] 
    },
    { 
      id: 'jewellery', name: 'Jewellery', slug: 'jewellery', emoji: '💍', color: '#D4AF37', description: 'Anti-Tarnish, Men\'s & Indian Wear', status: 'active', 
      types: [
        { id: 'anti-tarnish-kada', name: 'Anti-Tarnish Kada', slug: 'anti-tarnish-kada' }, { id: 'baby-size-kada', name: 'Baby Size Kada', slug: 'baby-size-kada' }, { id: 'bracelets', name: 'Bracelets', slug: 'bracelets' }, { id: 'earrings-anti', name: 'Anti-Tarnish Earrings', slug: 'earrings-anti' }, { id: 'rings-anti', name: 'Anti-Tarnish Rings', slug: 'rings-anti' }, { id: 'chains', name: 'Chains', slug: 'chains' }, { id: 'waist-chain', name: 'Waist Chain', slug: 'waist-chain' }, { id: 'anklet', name: 'Anklet', slug: 'anklet' }, { id: 'piercings', name: 'Piercings', slug: 'piercings' }, { id: 'ear-cuffs', name: 'Ear Cuffs', slug: 'ear-cuffs' }, { id: 'studs', name: 'Studs', slug: 'studs' },
        { id: 'mens-kada', name: 'Men\'s Kada', slug: 'mens-kada' }, { id: 'mens-chain', name: 'Men\'s Chain', slug: 'mens-chain' },
        { id: 'nath', name: 'Nath', slug: 'nath' }, { id: 'zumka', name: 'Zumka', slug: 'zumka' }, { id: 'manglsutra', name: 'Manglsutra', slug: 'manglsutra' }, { id: 'necklace', name: 'Necklace', slug: 'necklace' }, { id: 'bangles', name: 'Bangles', slug: 'bangles' }, { id: 'earrings-indian', name: 'Indian Earrings', slug: 'earrings-indian' }, { id: 'rings-indian', name: 'Indian Rings', slug: 'rings-indian' }, { id: 'painjan', name: 'Painjan', slug: 'painjan' }
      ] 
    },
    { 
      id: 'others', name: 'Others', slug: 'others', emoji: '✨', color: '#A07850', description: 'Bags & Home Accessories', status: 'active', 
      types: [{ id: 'ladies-bag', name: "Ladies Bag", slug: 'ladies-bag' }, { id: 'bag', name: "Bag", slug: 'bag' }, { id: 'hair-accessories', name: 'Hair Accessories', slug: 'hair-accessories' }, { id: 'bed-sheet', name: 'Bed Sheet', slug: 'bed-sheet' }, { id: 'blanket', name: 'Blanket', slug: 'blanket' }] 
    },
  ];
  for (const cat of defaults) {
    await addDoc('categories', cat, cat.id);
  }
};

setTimeout(seedCategories, 1000); // Give time for db to init

const { getCache, setCache, deleteCache } = require('../utils/cache');

// GET all categories
router.get('/', async (req, res) => {
  try {
    const isAdmin = Boolean(req.headers.authorization || req.cookies?.dn_admin_token || req.query._t || req.query.admin);
    if (isAdmin) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    }

    if (!isAdmin) {
      const cached = await getCache('categories_all');
      if (cached) return res.json(cached);
    }

    const categories = await getCollection('categories');
    if (!isAdmin) {
      await setCache('categories_all', categories, 300); // 5 min TTL
    }
    res.json(categories);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const catData = { ...req.body, createdAt: new Date().toISOString() };
    const id = req.body.slug || `cat_${Date.now()}`;
    const saved = await addDoc('categories', catData, id);
    apicache.clear();
    await deleteCache('categories_all');
    await deleteCache('categories');
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const oldCategory = await getDoc('categories', req.params.id);
    const updateData = req.body;

    // Check for removed sub-category images
    if (oldCategory && oldCategory.types && Array.isArray(oldCategory.types)) {
      const newTypes = updateData.types || [];
      const newImages = newTypes.map(t => t.image).filter(Boolean);
      
      const removedImages = oldCategory.types.map(t => t.image).filter(img => img && !newImages.includes(img));
      for (const imgUrl of removedImages) {
        await deleteImage(imgUrl);
      }
    }

    const updated = await setDoc('categories', req.params.id, updateData);
    apicache.clear();
    await deleteCache('categories_all');
    await deleteCache('categories');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const category = await getDoc('categories', req.params.id);
    
    // Delete main category image if exists
    if (category && category.image) {
      await deleteImage(category.image);
    }

    // Delete sub-category images if they exist
    if (category && category.types && Array.isArray(category.types)) {
      for (const type of category.types) {
        if (type.image) {
          await deleteImage(type.image);
        }
      }
    }

    await deleteDoc('categories', req.params.id);
    apicache.clear();
    await deleteCache('categories');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
