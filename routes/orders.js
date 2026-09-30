const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { getCollection, getDoc, addDoc, setDoc, deleteDoc, pgPool } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// Simple in-memory rate limiter to prevent fake order spam (3 orders per 24hrs per IP)
const orderRateLimits = new Map();

// No seed orders

// ─── GET all orders ───────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    let orders = await getCollection('orders');
    const { search, status, date, page = 1, limit = 50 } = req.query;

    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.customer?.name && o.customer.name.toLowerCase().includes(q)) ||
        (o.customer?.phone && o.customer.phone.includes(q)) ||
        (o.customer?.pincode && o.customer.pincode.includes(q))
      );
    }
    if (status && status !== 'all') orders = orders.filter(o => o.orderStatus === status);
    if (date) orders = orders.filter(o => o.date === date);

    // Sort newest first
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = orders.length;
    const start = (page - 1) * limit;
    const paginated = orders.slice(start, start + Number(limit));

    res.json({ orders: paginated, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET logged-in user's orders ──────────────────────────────
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user.email ? req.user.email.toLowerCase() : req.user.id.toLowerCase();
    
    // Use DB-level filtering when Postgres is available (avoids full table scan)
    let myOrders;
    
    if (pgPool) {
      const result = await pgPool.query(
        `SELECT id, data FROM dn_store WHERE collection = 'orders' AND (data->'customer'->>'email') ILIKE $1 ORDER BY (data->>'createdAt') DESC`,
        [userEmail]
      );
      myOrders = result.rows.map(r => ({ id: r.id, ...r.data }));
    } else {
      let orders = await getCollection('orders');
      myOrders = orders.filter(o => o.customer?.email?.toLowerCase() === userEmail);
      myOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    res.json(myOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET single order (public - for user invoice after checkout) ──
router.get('/:id', async (req, res) => {
  try {
    const order = await getDoc('orders', req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST create order (from frontend checkout) ──────────────
router.post('/', async (req, res) => {
  try {
    const { customer, items, subtotal, discount, delivery, total, paymentMethod, paymentStatus, promoCode } = req.body;

    // Validate mandatory customer fields
    const required = ['name', 'phone', 'address', 'pincode'];
    for (const f of required) {
      if (!customer?.[f]) return res.status(400).json({ error: `Customer ${f} is required` });
    }

    // Validate phone and pincode strictly
    const phoneStr = (customer.phone || '').toString().replace(/\D/g, '');
    if (phoneStr.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
    }
    
    const pinStr = (customer.pincode || '').toString().trim();
    if (!/^\d{6}$/.test(pinStr)) {
      return res.status(400).json({ error: 'Please enter a valid 6-digit Pincode.' });
    }

    // Basic IP Rate Limiting (Prevent bot spam/fake orders)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const nowMs = Date.now();
    const limitWindow = 24 * 60 * 60 * 1000; // 24 hours
    
    if (orderRateLimits.has(ip)) {
      const history = orderRateLimits.get(ip).filter(t => nowMs - t < limitWindow);
      if (history.length >= 3) {
        return res.status(429).json({ error: 'Too many orders placed today. Please try again tomorrow.' });
      }
      history.push(nowMs);
      orderRateLimits.set(ip, history);
    } else {
      orderRateLimits.set(ip, [nowMs]);
    }

    const now = new Date();
    const id = `ORD-${Date.now()}`;
    const orderData = {
      createdAt: now.toISOString(),
      date: now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
      time: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
      customer,
      items,
      subtotal,
      discount: discount || 0,
      delivery: delivery || 0,
      total,
      paymentMethod: paymentMethod || 'Razorpay',
      paymentStatus: paymentStatus || 'Pending',
      orderStatus: 'Pending',
      promoCode: promoCode || null,
      notes: '',
    };

    const newOrder = await addDoc('orders', orderData, id);

    // Automatically decrement stock for purchased items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.productId) {
          try {
            const product = await getDoc('products', item.productId);
            if (product) {
              const updates = {};
              const qty = item.quantity || 1;
              
              // Decrement specific size stock if applicable
              if (item.selectedSize && product.sizeStock && product.sizeStock[item.selectedSize] !== undefined) {
                updates.sizeStock = { ...product.sizeStock };
                updates.sizeStock[item.selectedSize] = Math.max(0, parseInt(updates.sizeStock[item.selectedSize] || 0) - qty);
              }
              
              // Always decrement global stock as fallback/total
              if (product.stock !== undefined && product.stock !== null && product.stock !== '') {
                const currentStock = parseInt(product.stock) || 0;
                updates.stock = Math.max(0, currentStock - qty);
              }
              
              if (Object.keys(updates).length > 0) {
                await setDoc('products', item.productId, { ...product, ...updates });
              }
            }
          } catch (e) {
            console.error(`Failed to update stock for ${item.productId}:`, e);
          }
        }
      }
    }

    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT update order ────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updated = await setDoc('orders', req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE order ────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await deleteDoc('orders', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST bulk actions ───────────────────────────────────────
router.post('/bulk/action', authMiddleware, async (req, res) => {
  try {
    const { action, ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No order IDs provided' });
    }

    if (action === 'delete') {
      for (const id of ids) {
        await deleteDoc('orders', id);
      }
    } else if (action === 'updateStatus') {
      for (const id of ids) {
        const order = await getDoc('orders', id);
        if (order) {
          await setDoc('orders', id, { ...order, orderStatus: status });
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET Excel export ────────────────────────────────────────
router.get('/export/excel', authMiddleware, async (req, res) => {
  try {
    const orders = await getCollection('orders');
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const rows = orders.map(o => ({
      'Order ID': o.id,
      'Date': o.date,
      'Time': o.time,
      'Customer Name': o.customer?.name || '',
      'Phone': o.customer?.phone || '',
      'Email': o.customer?.email || '',
      'Address': o.customer?.address || '',
      'City': o.customer?.city || '',
      'Pincode': o.customer?.pincode || '',
      'Products': o.items?.map(i => `${i.productName} (x${i.quantity})`).join(', ') || '',
      'Quantity': o.items?.reduce((s, i) => s + i.quantity, 0) || 0,
      'Subtotal (₹)': o.subtotal || 0,
      'Discount (₹)': o.discount || 0,
      'Delivery (₹)': o.delivery || 0,
      'Total (₹)': o.total || 0,
      'Payment Method': o.paymentMethod || '',
      'Payment Status': o.paymentStatus || '',
      'Order Status': o.orderStatus || '',
      'Promo Code': o.promoCode || '',
      'Notes': o.notes || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Style header row width
    ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length + 2, 15) }));

    XLSX.utils.book_append_sheet(wb, ws, 'DN Shoppy Orders');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `DN_Shoppy_Orders_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST submit UTR for UPI payment verification ────────────
// This is called from the frontend AFTER user has paid & returned
router.post('/:id/verify-utr', async (req, res) => {
  try {
    const { utrNumber, paymentScreenshot } = req.body;
    
    if (utrNumber && (!/^\d{12}$/.test(utrNumber))) {
      return res.status(400).json({ error: 'If provided, UTR must be exactly 12 digits' });
    }
    
    if (!paymentScreenshot) {
      return res.status(400).json({ error: 'Payment screenshot is required' });
    }

    const order = await getDoc('orders', req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.paymentStatus === 'Paid') {
      return res.status(400).json({ error: 'Order already marked as paid' });
    }

    const updated = await setDoc('orders', req.params.id, {
      ...order,
      utrNumber: utrNumber,
      paymentScreenshot: paymentScreenshot,
      paymentMethod: 'UPI',
      paymentStatus: 'Pending Verification',
      orderStatus: order.orderStatus === 'Pending' ? 'Processing' : order.orderStatus
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
