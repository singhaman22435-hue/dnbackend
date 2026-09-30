const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { authMiddleware } = require('../middleware/auth');
const { getDoc, setDoc, deleteDoc, getCollection } = require('../middleware/db');

// Middleware to ensure only super_admin can access
const superAdminOnly = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
};

router.use(authMiddleware, superAdminOnly);

// GET all admins
router.get('/', async (req, res) => {
  try {
    const admins = await getCollection('admins');
    
    // Map to remove passwordHash before sending
    const safeAdmins = admins.map(a => ({
      id: a.id,
      name: a.name,
      username: a.username,
      role: a.role,
      permissions: a.permissions || []
    }));
    
    res.json(safeAdmins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new staff
router.post('/', async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const username = req.body.username?.trim();
    const { password, permissions } = req.body;
    
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and password are required' });
    }

    const admins = await getCollection('admins');
    if (admins.find(a => a.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const newId = 'staff_' + Date.now();
    const passwordHash = await bcrypt.hash(password, 10);
    
    const newStaff = {
      id: newId,
      name,
      username,
      passwordHash,
      role: 'staff',
      permissions: permissions || []
    };
    
    await setDoc('admins', newId, newStaff);
    
    res.json({ success: true, message: 'Staff member created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update staff
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const name = req.body.name?.trim();
    const username = req.body.username?.trim();
    const { password, permissions } = req.body;
    
    if (id === 'admin_001') {
      return res.status(400).json({ error: 'Cannot modify default super admin via this route' });
    }

    const adminUser = await getDoc('admins', id);
    if (!adminUser) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    // Check username uniqueness if changed
    if (username !== adminUser.username) {
      const admins = await getCollection('admins');
      if (admins.find(a => a.username === username && a.id !== id)) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updateData = {
      ...adminUser,
      name: name || adminUser.name,
      username: username || adminUser.username,
      permissions: permissions || adminUser.permissions || []
    };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    await setDoc('admins', id, updateData);
    res.json({ success: true, message: 'Staff updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE staff
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === 'admin_001') {
      return res.status(400).json({ error: 'Cannot delete super admin' });
    }

    await deleteDoc('admins', id);
    res.json({ success: true, message: 'Staff deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
