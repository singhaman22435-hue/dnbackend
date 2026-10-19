const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { getCollection, getDoc, addDoc, setDoc, deleteDoc, pgPool } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// Simple in-memory rate limiter to prevent fake order spam (3 orders per 24hrs per IP)
const orderRateLimits = new Map();

// Permanent Live Razorpay Credentials
const PERMANENT_RAZORPAY_KEY_ID = 'rzp_live_ToavHwGofVYh11';
const PERMANENT_RAZORPAY_KEY_SECRET = 'uJ9S2ETCYApXxET691Cmpixk';

// Helper to get Razorpay configuration
async function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || PERMANENT_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || PERMANENT_RAZORPAY_KEY_SECRET;
  return { keyId: keyId.trim(), keySecret: keySecret.trim() };
}

async function getRazorpayInstance() {
  const { keyId, keySecret } = await getRazorpayConfig();
  return {
    razorpay: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret
  };
}


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

// ─── GET Razorpay public Key ID (public) ─────────────────────
router.get('/razorpay/key', async (req, res) => {
  try {
    const { keyId } = await getRazorpayConfig();
    res.json({ keyId: keyId || null, isConfigured: Boolean(keyId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST Razorpay Webhook ───────────────────────────────────
router.post('/razorpay/webhook', async (req, res) => {
  try {
    const { keySecret } = await getRazorpayConfig();
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || keySecret;
    const signature = req.headers['x-razorpay-signature'];

    if (webhookSecret && signature) {
      const shasum = crypto.createHmac('sha256', webhookSecret);
      shasum.update(JSON.stringify(req.body));
      const digest = shasum.digest('hex');
      if (digest !== signature) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = req.body.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = req.body.payload?.payment?.entity;
      const orderRzpId = payment?.order_id;
      const receipt = payment?.notes?.orderId || payment?.receipt;

      if (receipt) {
        const order = await getDoc('orders', receipt);
        if (order && order.paymentStatus !== 'Paid') {
          await setDoc('orders', receipt, {
            ...order,
            paymentStatus: 'Paid',
            paymentMethod: 'Razorpay',
            razorpayPaymentId: payment.id,
            razorpayOrderId: orderRzpId || order.razorpayOrderId,
            orderStatus: order.orderStatus === 'Pending' ? 'Processing' : order.orderStatus,
            paidAt: new Date().toISOString()
          });
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET track orders by Order ID or Phone number (public) ───
router.get('/track/lookup', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Order ID or phone number is required' });
    }
    const rawQ = query.trim();
    const qLower = rawQ.toLowerCase();
    const cleanPhone = rawQ.replace(/\D/g, '');

    // 1. Check direct match by doc ID
    const direct = await getDoc('orders', rawQ);
    if (direct) {
      return res.json([direct]);
    }

    // 2. Search through orders collection
    const orders = await getCollection('orders');
    const matches = orders.filter(o => {
      const idMatch = o.id && o.id.toLowerCase() === qLower;
      const phoneDigits = o.customer?.phone ? o.customer.phone.toString().replace(/\D/g, '') : '';
      const phoneMatch = cleanPhone.length >= 10 && phoneDigits.endsWith(cleanPhone.slice(-10));
      return idMatch || phoneMatch;
    });

    matches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(matches);
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

// ─── POST create Razorpay order for an existing order ─────────
router.post('/:id/razorpay-order', async (req, res) => {
  try {
    const order = await getDoc('orders', req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.paymentStatus === 'Paid') {
      return res.status(400).json({ error: 'Order is already marked as paid' });
    }

    const { razorpay, keyId } = await getRazorpayInstance();
    const amountPaise = Math.round(Number(order.total) * 100);

    if (isNaN(amountPaise) || amountPaise <= 0) {
      return res.status(400).json({ error: 'Invalid order total' });
    }

    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: String(order.id).slice(0, 40),
      notes: {
        orderId: String(order.id),
        customerName: String(order.customer?.name || ''),
        customerPhone: String(order.customer?.phone || '')
      }
    };

    const rzpOrder = await razorpay.orders.create(options);

    await setDoc('orders', req.params.id, {
      ...order,
      razorpayOrderId: rzpOrder.id
    });

    res.json({
      success: true,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: keyId,
      orderId: order.id
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ error: err.message || 'Failed to create Razorpay order' });
  }
});

// ─── POST verify Razorpay payment ────────────────────────────
router.post('/:id/verify-razorpay', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment verification details' });
    }

    const order = await getDoc('orders', req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { keySecret } = await getRazorpayConfig();
    if (!keySecret) {
      return res.status(500).json({ error: 'Razorpay secret is not configured' });
    }

    // Verify HMAC-SHA256 signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed: Invalid signature' });
    }

    // Mark as Paid
    const updated = await setDoc('orders', req.params.id, {
      ...order,
      paymentMethod: 'Razorpay',
      paymentStatus: 'Paid',
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      orderStatus: order.orderStatus === 'Pending' ? 'Processing' : order.orderStatus,
      paidAt: new Date().toISOString()
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Error verifying Razorpay payment:', err);
    res.status(500).json({ error: err.message || 'Payment verification failed' });
  }
});

module.exports = router;
