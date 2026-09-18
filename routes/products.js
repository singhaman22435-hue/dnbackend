const router = require('express').Router();
const { getCollection, addDoc, setDoc, deleteDoc, getDoc } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');
const { deleteImage } = require('../utils/storage');
const apicache = require('apicache');
const cache = apicache.middleware;

// ─── Auto-description templates ──────────────────────────────
const autoDescriptions = {
  'silk': 'Handwoven pure silk fabric with a naturally lustrous sheen and smooth texture. This premium silk piece drapes beautifully, making it perfect for festive occasions and special events. The rich color and fine weave reflect exceptional craftsmanship and tradition.',
  'cotton': 'Crafted from 100% breathable cotton fabric, this piece offers exceptional comfort for all-day wear. The soft, skin-friendly texture makes it ideal for everyday styling. Easy to care for and maintain, it retains its color and shape even after multiple washes.',
  'georgette': 'Made from lightweight, flowing georgette fabric with a gentle crinkled texture. This elegant piece drapes gracefully and moves beautifully with every step. Perfect for parties, functions, and semi-formal occasions where you want to look effortlessly chic.',
  'net': 'Crafted from delicate net fabric with an intricate weave pattern. This sheer, airy piece adds a touch of romance and elegance to your look. The fine netting creates a beautiful layered effect, making it ideal for festive and bridal occasions.',
  'velvet': 'Luxurious velvet fabric with a deep, rich pile that catches light beautifully. This premium piece exudes sophistication and royalty. The smooth, plush texture feels incredibly soft against the skin and is perfect for winter festive wear and grand occasions.',
  'chiffon': 'Lightweight, sheer chiffon fabric that flows and flutters effortlessly. This piece has a romantic, ethereal quality perfect for parties and casual outings. The delicate drape creates a feminine silhouette that is both elegant and comfortable.',
  'rayon': 'Premium rayon fabric with a silky smooth texture and beautiful drape. This versatile piece combines comfort with style, making it perfect for both casual and semi-formal occasions. The fabric breathes well and maintains its shape throughout the day.',
  'linen': 'Natural linen fabric with a distinctive texture and excellent breathability. This eco-friendly piece is perfect for warm weather and daily wear. The fabric gets softer with each wash while maintaining its classic, refined look.',
  'denim': 'Premium quality denim fabric with excellent stretch and durability. This piece features a classic weave with modern finishing for a perfect fit. Sturdy yet comfortable, ideal for everyday casual wear that keeps you looking stylish.',
  'crepe': 'Fine crepe fabric with a subtly crinkled texture that drapes beautifully. This elegant piece falls smoothly against the body, creating a flattering silhouette. Perfect for formal occasions and office wear where a polished appearance is essential.',
  'brocade': 'Rich brocade fabric with intricate woven patterns in metallic threads. This opulent piece features traditional motifs that speak of heritage and artistry. The heavy weave and golden accents make it perfect for weddings and grand celebrations.',
  'organza': 'Crisp, sheer organza fabric with a beautiful stiffness that holds its shape. This glamorous piece creates stunning volume and structure. The shimmering quality of organza adds a touch of luxury perfect for festive and bridal occasions.',
  'jacquard': 'Elegant jacquard fabric with self-woven patterns that add depth and texture. This sophisticated piece features intricate designs woven directly into the fabric. The rich texture and dimensional patterns make it suitable for festive and formal wear.',
  'embroidery': 'Beautifully embroidered fabric featuring intricate hand or machine embroidery work. This exquisite piece showcases fine needlework with detailed patterns and motifs. The embellishments add a premium touch that elevates any occasion.',
  'printed': 'Vibrant printed fabric featuring unique, eye-catching patterns and colors. This lively piece uses high-quality printing techniques for sharp, long-lasting designs. The prints are inspired by contemporary trends and traditional Indian motifs.',
  'saree': 'Elegant and timeless, this saree features exquisite craftsmanship and a beautiful drape. Perfect for weddings, festivals, and special occasions. Pair it with your favorite jewelry to complete the traditional look.',
  'dress': 'Step out in style with this beautiful dress, designed for both comfort and elegance. The flattering silhouette and premium fabric make it perfect for parties, casual outings, or special events.',
  'gowns': 'Make a statement in this stunning evening gown. Featuring a graceful sweeping silhouette and luxurious fabric, it is designed to make you the center of attention at any formal event or party.',
  'blouse': 'A beautifully tailored blouse that combines traditional elegance with modern design. Made from comfortable, breathable fabric, it pairs perfectly with sarees or ethnic skirts for a complete look.',
  'mens-wear': 'Elevate your wardrobe with this classic menswear piece. Tailored for a perfect fit and made from high-quality fabric, it offers exceptional comfort and a sharp, sophisticated appearance for any occasion.',
  'jewellery': 'Add a touch of sparkle to your ensemble with this exquisite piece of jewelry. Crafted with precision and attention to detail, its elegant design ensures it stands out, whether worn daily or on special occasions.',
  'pant': 'Comfortable and stylish, these pants are tailored for a perfect fit. Made from premium, durable fabric, they are versatile enough for both formal office wear and casual outings.',
  'shirt': 'A versatile and stylish shirt designed for everyday comfort. Featuring a crisp finish and breathable fabric, it easily transitions from a professional work setting to a relaxed weekend look.',
  'jeans': 'Classic, durable jeans with a modern fit. Designed for all-day comfort and style, they are a must-have staple for your casual wardrobe, pairing effortlessly with any top or shirt.',
  'womans-jeans': 'Flattering and comfortable women\'s jeans designed to hug your curves perfectly. Made with stretchable, high-quality denim for a stylish look that lasts all day.',
  'default': 'Premium quality product with excellent finish and craftsmanship. This beautifully designed piece combines style with comfort, making it suitable for various occasions. The careful attention to detail ensures it meets the highest standards of fashion.',
};

const getAutoDescription = (clothType) => {
  const key = clothType?.toLowerCase().trim();
  return autoDescriptions[key] || autoDescriptions['default'];
};

// ─── Seed products from frontend data if empty ───────────────
const seedProducts = async () => {
  const existing = await getCollection('products');
  if (existing.length > 0) return;

  const sample = [
    { id: 'P001', name: 'Royal Kanjivaram Silk Saree', category: 'saree', type: 'silk-saree', clothType: 'silk', price: 8999, originalPrice: 14999, stock: 12, images: ['https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600&q=80'], colors: ['#8B0000', '#1A237E', '#1B5E20'], colorNames: ['Crimson Red', 'Royal Blue', 'Forest Green'], sizes: ['Free Size'], rating: 4.8, reviews: 234, badge: '40% OFF', isTopSelling: true, isRecommended: true, tags: ['bestseller', 'trending'], description: getAutoDescription('silk'), material: '100% Pure Silk', status: 'active' },
    { id: 'P002', name: 'Banarasi Cotton Silk Saree', category: 'saree', type: 'cotton-saree', clothType: 'cotton', price: 3499, originalPrice: 5999, stock: 25, images: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&q=80'], colors: ['#FF6B35', '#FFC300'], colorNames: ['Mango Orange', 'Golden Yellow'], sizes: ['Free Size'], rating: 4.5, reviews: 156, isTopSelling: false, isRecommended: true, tags: ['new'], description: getAutoDescription('cotton'), material: 'Cotton Silk Blend', status: 'active' },
    { id: 'P005', name: 'Embroidered Anarkali Kurti', category: 'dress', type: 'kurti', clothType: 'rayon', price: 1499, originalPrice: 2999, stock: 45, images: ['https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80'], colors: ['#FF80AB', '#B2EBF2'], colorNames: ['Blush Pink', 'Sky Blue'], sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], rating: 4.4, reviews: 312, isTopSelling: true, isRecommended: true, tags: ['bestseller'], description: getAutoDescription('rayon'), material: 'Rayon', status: 'active' },
    { id: 'P009', name: 'Off-Shoulder Evening Gown', category: 'gowns', type: 'evening-gown', clothType: 'velvet', price: 5999, originalPrice: 9999, stock: 10, images: ['https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=600&q=80'], colors: ['#212121', '#B71C1C'], colorNames: ['Black', 'Red'], sizes: ['XS', 'S', 'M', 'L', 'XL'], rating: 4.8, reviews: 98, isTopSelling: true, isRecommended: true, tags: ['premium'], description: getAutoDescription('velvet'), material: 'Velvet & Satin', status: 'active' },
    { id: 'P019', name: 'Kundan Choker Necklace Set', category: 'jewellery', type: 'necklace', clothType: 'default', price: 2499, originalPrice: 4999, stock: 15, images: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80'], colors: ['#D4AF37'], colorNames: ['Gold Plated'], sizes: ['Free Size'], rating: 4.7, reviews: 267, isTopSelling: true, isRecommended: true, tags: ['bestseller'], description: 'Stunning Kundan choker necklace set with matching earrings.', material: 'Alloy with Kundan', status: 'active' },
  ];
  for (const p of sample) {
    await addDoc('products', p, p.id);
  }
};

setTimeout(seedProducts, 1000);

// ─── GET all products ────────────────────────────────────────
router.get('/', cache('5 minutes'), async (req, res) => {
  try {
    let products = await getCollection('products');
    const { category, search, status } = req.query;
    if (category) products = products.filter(p => p.category === category);
    if (status) products = products.filter(p => p.status === status);
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) || (p.id && p.id.toLowerCase().includes(q))
      );
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET auto-description ────────────────────────────────────
router.get('/auto-desc/:clothType', (req, res) => {
  res.json({ description: getAutoDescription(req.params.clothType) });
});

// ─── GET single product ──────────────────────────────────────
router.get('/:id', cache('5 minutes'), async (req, res) => {
  try {
    const product = await getDoc('products', req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST create product ─────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const id = req.body.id || `P${String(Date.now()).slice(-5)}`;
    const newProduct = {
      ...req.body,
      createdAt: new Date().toISOString(),
      rating: req.body.rating || 4.0,
      reviews: req.body.reviews || 0,
      status: req.body.status || 'active',
    };
    const saved = await addDoc('products', newProduct, id);
    apicache.clear(); // Clear cache on update
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT update product ──────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const oldProduct = await getDoc('products', req.params.id);
    const updateData = { ...req.body, updatedAt: new Date().toISOString() };
    
    // Find removed images and delete them from Cloudinary
    if (oldProduct && oldProduct.images && Array.isArray(oldProduct.images)) {
      const newImages = updateData.images || [];
      const removedImages = oldProduct.images.filter(img => !newImages.includes(img));
      for (const imgUrl of removedImages) {
        await deleteImage(imgUrl);
      }
    }

    const updated = await setDoc('products', req.params.id, updateData);
    apicache.clear(); // Clear cache on update
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE product ──────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await getDoc('products', req.params.id);
    if (product && product.images && Array.isArray(product.images)) {
      for (const imgUrl of product.images) {
        await deleteImage(imgUrl);
      }
    }
    
    await deleteDoc('products', req.params.id);
    apicache.clear(); // Clear cache on update
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST add review ─────────────────────────────────────────
router.post('/:id/reviews', authMiddleware, async (req, res) => {
  try {
    const { rating, comment, userName, image } = req.body;
    if (!rating || !comment) return res.status(400).json({ error: 'Rating and comment are required' });

    const product = await getDoc('products', req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const newReview = {
      id: `REV-${Date.now()}`,
      userId: req.user.id || req.user.email,
      userName: userName || req.user.name || 'Anonymous',
      rating: Number(rating),
      comment,
      image: image || null,
      date: new Date().toLocaleDateString('en-IN')
    };

    const existingReviews = product.reviewList || [];
    const updatedReviews = [newReview, ...existingReviews];
    
    // Calculate new average rating
    const totalRating = updatedReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = (totalRating / updatedReviews.length).toFixed(1);

    const updated = await setDoc('products', req.params.id, {
      ...product,
      reviewList: updatedReviews,
      rating: Number(avgRating),
      reviews: updatedReviews.length
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE review ───────────────────────────────────────────
router.delete('/:id/reviews/:reviewId', authMiddleware, async (req, res) => {
  try {
    const product = await getDoc('products', req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const existingReviews = product.reviewList || [];
    const reviewIndex = existingReviews.findIndex(r => r.id === req.params.reviewId);
    
    if (reviewIndex === -1) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check if the user owns the review or is an admin
    const review = existingReviews[reviewIndex];
    if (review.userId !== (req.user.id || req.user.email) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to delete this review' });
    }

    // Delete image if exists
    if (review.image) {
      await deleteImage(review.image);
    }

    // Remove the review
    existingReviews.splice(reviewIndex, 1);

    // Calculate new average rating
    let avgRating = 0;
    if (existingReviews.length > 0) {
      const totalRating = existingReviews.reduce((sum, r) => sum + r.rating, 0);
      avgRating = (totalRating / existingReviews.length).toFixed(1);
    }

    const updated = await setDoc('products', req.params.id, {
      ...product,
      reviewList: existingReviews,
      rating: Number(avgRating),
      reviews: existingReviews.length
    });

    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
