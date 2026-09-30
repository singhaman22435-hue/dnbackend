require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth');
const customerAuthRouter = require('./routes/customerAuth');
const ordersRouter = require('./routes/orders');
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const inventoryRouter = require('./routes/inventory');
const usersRouter = require('./routes/users');
const dashboardRouter = require('./routes/dashboard');
const promosRouter = require('./routes/promos');
const uploadRouter = require('./routes/upload');
const liveRouter = require('./routes/live');
const downloadsRouter = require('./routes/downloads');
const settingsRouter = require('./routes/settings');
const staffRouter = require('./routes/staff');
const app = express();
const PORT = process.env.PORT || 3001;

// Trust the first proxy (Render/Cloudflare) for rate limiting and IP
app.set('trust proxy', 1);

// ─── Middleware ───────────────────────────────────────────────
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://dnshoppy.onrender.com', 'https://dnshoppyfrontend.pages.dev', 'https://dnshoppy.in', 'https://www.dnshoppy.in']
  : ['http://localhost:5173', 'http://localhost:3000', 'https://dnshoppy.onrender.com', 'https://dnshoppyfrontend.pages.dev', 'https://dnshoppy.in', 'https://www.dnshoppy.in'];

app.use(cors({ 
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.pages.dev')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Security Middleware ───────────────────────────────────────
// Set security HTTP headers (helmet) with CSP configured for images
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https://dnshoppy.onrender.com"]
    }
  },
  crossOriginEmbedderPolicy: false, // disabled to allow external images
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Prevent XSS attacks
app.use(xss());

// Prevent HTTP param pollution
app.use(hpp());

// Rate limiting: Higher limits for browsing, strict for mutations
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 500, // Up from 200 — supports ~10k daily users browsing
  message: { status: 'error', message: 'Too many requests from this IP, please try again after 15 minutes.' },
  skip: (req) => req.method === 'GET' && req.path.startsWith('/api/products') // Don't rate limit product browsing
});
app.use('/api', limiter);

// The /api/orders route has its own internal strict rate limiting for order creation (3 per day)
// so we don't need a blanket limiter here which blocks Admin operations.

// Strict Rate Limiting for Auth Routes to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: { status: 'error', message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/customerAuth/login', authLimiter);

// Serve uploaded files statically
// Serve uploaded images with strong caching (30 days) to save bandwidth and improve performance
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  immutable: true
}));

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth',         authRouter);
app.use('/api/customerAuth', customerAuthRouter);
app.use('/api/orders',       ordersRouter);
app.use('/api/products',   productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/inventory',  inventoryRouter);
app.use('/api/users',      usersRouter);
app.use('/api/dashboard',  dashboardRouter);
app.use('/api/promos',     promosRouter);
app.use('/api/upload',     uploadRouter);
app.use('/api/live',       liveRouter);
app.use('/api/downloads',  downloadsRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/staff',      staffRouter);
// ─── Simple Subscribe Endpoint ───────────────────────────────────
const { addDoc } = require('./middleware/db');
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    await addDoc('subscribers', {
      email,
      subscribedAt: new Date().toISOString()
    });
    
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'DN Shoppy API running', timestamp: new Date().toISOString() });
});

// ─── Root Route ──────────────────────────────
app.get('/', (req, res) => {
  res.send('DN Shoppy API is running properly! 🚀');
});

// ─── Start ───────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🟢 DN Shoppy API running on http://localhost:${PORT}`);
  console.log(`📦 Admin Login: dnshoppy_admin / DN@Admin2026\n`);
});

// ─── Anti-Crash & Graceful Shutdown ──────────────────────────
// Prevent Node from crashing on unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  // We log the error but DO NOT exit the process, keeping the API alive.
});

// Prevent Node from crashing on uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception thrown:', err);
  // Log the error but keep the server running (use with caution in prod, but meets the 'never crash' requirement)
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('🛑 Received shutdown signal, closing server gracefully...');
  server.close(() => {
    console.log('🛑 HTTP server closed.');
    process.exit(0);
  });
  
  // Force close after 10 seconds if connections are lingering
  setTimeout(() => {
    console.error('🛑 Forcing server shutdown after 10s timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = app;
