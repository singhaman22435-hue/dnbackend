const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const { getDoc, setDoc, getCollection } = require('../middleware/db');

// Default Admin credentials (fallback)
const DEFAULT_ADMIN = {
  id: 'admin_001',
  username: 'dnshoppy_admin',
  passwordHash: bcrypt.hashSync('DN@Admin2026', 10),
  name: 'DN Shoppy Admin',
  role: 'super_admin',
};

// Helper to get all admins, ensuring default admin is present
const getAllAdmins = async () => {
  try {
    const dbAdmins = await getCollection('admins');
    // Combine dbAdmins with DEFAULT_ADMIN if admin_001 isn't in DB yet
    const hasDefault = dbAdmins.find(a => a.id === 'admin_001');
    if (!hasDefault) {
      dbAdmins.push(DEFAULT_ADMIN);
    }
    return dbAdmins;
  } catch (err) {
    console.error("Error fetching admins from DB:", err);
    return [DEFAULT_ADMIN];
  }
};

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const admins = await getAllAdmins();
    const adminUser = admins.find(a => (a.username || '').trim() === (username || '').trim());

    if (!adminUser)
      return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, adminUser.passwordHash);
    if (!match)
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { 
        id: adminUser.id, 
        username: adminUser.username, 
        role: adminUser.role,
        permissions: adminUser.permissions || []
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('dn_admin_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      token, // Kept for backwards compatibility just in case
      admin: { 
        id: adminUser.id, 
        username: adminUser.username, 
        name: adminUser.name, 
        role: adminUser.role,
        permissions: adminUser.permissions || []
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('dn_admin_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const token = req.cookies?.dn_admin_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ valid: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, admin: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // Allow any admin to change their OWN password
    const adminId = req.user.id;
    const admins = await getAllAdmins();
    const adminUser = admins.find(a => a.id === adminId);
    
    if (!adminUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const match = await bcrypt.compare(currentPassword, adminUser.passwordHash);
    
    if (!match) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updatedAdmin = { ...adminUser, passwordHash: newHash };
    
    await setDoc('admins', adminUser.id, updatedAdmin);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
