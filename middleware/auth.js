const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dn_shoppy_secret_2026_secure';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: Using fallback JWT_SECRET. Set JWT_SECRET in production env for maximum security.');
}

// ─── Strict Admin/Staff Auth Middleware ──────────────────────────
// Prevents customers or guests from accessing administrative APIs
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.dn_admin_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No admin token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Explicit Role Check: Must be super_admin, admin, or staff
    const validAdminRoles = ['super_admin', 'admin', 'staff'];
    if (!validAdminRoles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
    }

    req.admin = decoded;
    req.user = decoded;
    
    // Role-Based Access Control (RBAC) Logic for staff members
    if (decoded.role === 'staff') {
      const permissions = decoded.permissions || [];
      const moduleMap = {
        '/api/orders': 'orders',
        '/api/products': 'products',
        '/api/categories': 'categories',
        '/api/promos': 'promotions',
        '/api/live': 'live',
        '/api/inventory': 'inventory',
        '/api/reviews': 'reviews',
        '/api/users': 'users',
        '/api/settings': 'settings'
      };

      for (const [route, requiredPerm] of Object.entries(moduleMap)) {
        if (req.originalUrl.startsWith(route)) {
          if (!permissions.includes(requiredPerm)) {
            return res.status(403).json({ error: `Access denied: Missing '${requiredPerm}' permission.` });
          }
          break;
        }
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
};

// ─── Customer Auth Middleware ────────────────────────────────────
// For customer endpoints like order tracking and profile history
const customerAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.dn_customer_token || req.cookies?.dn_admin_token;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
};

module.exports = { authMiddleware, customerAuthMiddleware, JWT_SECRET };
