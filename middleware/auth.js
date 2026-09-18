const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dn_shoppy_secret_2026_secure';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in production environment.');
  process.exit(1);
}

const authMiddleware = (req, res, next) => {
  // Try to get token from Authorization header first, fallback to cookies
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.dn_admin_token || req.cookies?.dn_customer_token;
  
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    req.user = decoded; // Support both admin and customer routes
    
    // RBAC Logic for admin routes
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
            return res.status(403).json({ error: 'Access denied: Missing permissions.' });
          }
          break;
        }
      }
    }

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authMiddleware, JWT_SECRET };
