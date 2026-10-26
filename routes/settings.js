const router = require('express').Router();
const { getDoc, setDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');
const { getCache, setCache, deleteCache } = require('../utils/cache');
const jwt = require('jsonwebtoken');

const defaultHeroSlides = [
  {
    id: 1,
    image: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793024141/dnshoppy_hero/hrfcjnzhwyfpwm5vpcwb.jpg',
    mobileImage: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793030933/dnshoppy_hero/hero_mobile_1_v3.jpg',
    eyebrow: '👑 Direct Store Collection 2026',
    title: 'Grace & Heritage',
    subtitle: "Sangrul, Kolhapur's most trusted destination for handcrafted bridal sarees and festive fashion.",
    cta: 'Explore Sarees',
    link: '/category/saree',
    align: 'left'
  },
  {
    id: 2,
    image: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793024186/dnshoppy_hero/mvykozdqcsexefv0othe.jpg',
    mobileImage: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793030935/dnshoppy_hero/hero_mobile_2_v3.jpg',
    eyebrow: '✨ Royal Kolhapuri Touch',
    title: 'Shine With Elegance',
    subtitle: 'Celebrate special moments in royal Maharashtrian style with our exclusive jewellery and attire.',
    cta: 'View Jewellery',
    link: '/category/jewellery',
    align: 'left'
  },
  {
    id: 3,
    image: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793024189/dnshoppy_hero/ghohmna27iczdxvzkoso.jpg',
    mobileImage: 'https://res.cloudinary.com/uje56pqa/image/upload/v1793030936/dnshoppy_hero/hero_mobile_3_v3.jpg',
    eyebrow: '💎 Premium Jewellery & Sarees',
    title: 'Timeless Celebrations',
    subtitle: '100% authentic anti-tarnish jewellery, designer nauvari and silk sarees made for you.',
    cta: 'Shop Now',
    link: '/products',
    align: 'left'
  }
];

// GET hero settings (public)
router.get('/hero', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    const cached = await getCache('settings_hero');
    if (cached && Array.isArray(cached) && cached.length > 0) return res.json(cached);

    const heroSettings = await getDoc('settings', 'hero');
    let slides = heroSettings && Array.isArray(heroSettings.slides) && heroSettings.slides.length >= 3
      ? heroSettings.slides
      : defaultHeroSlides;
      
    // Guarantee non-empty titles and valid images
    slides = slides.map((s, idx) => {
      const def = defaultHeroSlides[idx % defaultHeroSlides.length];
      const hasBadImage = !s.image || s.image.includes('qddgcjs6pvajdbvunrqm');
      return {
        ...def,
        ...s,
        image: hasBadImage ? def.image : s.image,
        mobileImage: s.mobileImage || def.mobileImage,
        title: s.title || def.title,
        eyebrow: s.eyebrow || def.eyebrow,
        subtitle: s.subtitle || def.subtitle,
        cta: s.cta || def.cta,
        link: s.link || def.link,
      };
    });

    await setCache('settings_hero', slides, 300);
    res.json(slides);
  } catch (err) {
    console.error("Error fetching hero settings:", err);
    res.json(defaultHeroSlides);
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
    await deleteCache('settings_hero');
    res.json({ success: true, message: 'Hero settings updated successfully' });
  } catch (err) {
    console.error("Error saving hero settings:", err);
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

// GET lookbook settings (public)
router.get('/lookbook', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    const cached = await getCache('settings_lookbook');
    if (cached) return res.json(cached);

    const lookbookSettings = await getDoc('settings', 'lookbook');
    const data = lookbookSettings || {
      image1: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
      image2: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80',
      image3: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&q=80'
    };
    await setCache('settings_lookbook', data, 300);
    res.json(data);
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
    await deleteCache('settings_lookbook');
    res.json({ success: true, message: 'Lookbook settings updated successfully' });
  } catch (err) {
    console.error("Error saving lookbook settings:", err);
    res.status(500).json({ error: 'Server error saving settings' });
  }
});

// GET Razorpay status (admin only - permanently configured)
router.get('/razorpay', authMiddleware, async (req, res) => {
  res.json({
    keyId: 'rzp_live_ToavHwGofVYh11',
    hasSecret: true,
    mode: 'live',
    isConfigured: true,
    isPermanent: true
  });
});

// POST update Razorpay settings (disabled as keys are permanently locked)
router.post('/razorpay', authMiddleware, async (req, res) => {
  return res.status(403).json({ error: 'Razorpay keys are permanently configured in the backend and cannot be modified.' });
});

// Deprecated UPI settings endpoint (kept for backward compatibility)
router.get('/upi', async (req, res) => {
  res.json({ upiId: '', businessName: 'DN Shoppy', deprecated: true });
});

module.exports = router;
