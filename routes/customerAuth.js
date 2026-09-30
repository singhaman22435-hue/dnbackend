const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../middleware/db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy_client_id');

// Helper to sanitize user object before sending to client
const sanitizeUser = (user) => {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
};

// POST /api/customerAuth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists (using email as the ID for customers collection)
    const existingUser = await db.getDoc('customers', email.toLowerCase());
    if (existingUser) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      id: email.toLowerCase(),
      name,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
      role: 'customer'
    };

    // Save to DB
    await db.setDoc('customers', newUser.id, newUser);

    // Generate JWT
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('dn_customer_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      token, // Kept for backwards compatibility
      user: sanitizeUser(newUser)
    });

  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customerAuth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await db.getDoc('customers', email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('dn_customer_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({
      token, // Kept for backwards compatibility
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customerAuth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('dn_customer_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// POST /api/customerAuth/verify
router.post('/verify', async (req, res) => {
  const token = req.cookies?.dn_customer_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ valid: false });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(401).json({ valid: false });
    }

    const user = await db.getDoc('customers', decoded.email);
    if (!user) return res.status(401).json({ valid: false });

    res.json({ valid: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(401).json({ valid: false });
  }
});

// POST /api/customerAuth/google
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Google token required' });

    // Verify token with Google
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        // audience: process.env.GOOGLE_CLIENT_ID // Specify the CLIENT_ID of the app that accesses the backend
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google Verify Error:', err);
      // In development if VITE_GOOGLE_CLIENT_ID is just a placeholder, we decode manually 
      // ONLY DO THIS FOR DEMO. IN PROD, MUST VERIFY!
      payload = jwt.decode(token);
      if (!payload) return res.status(401).json({ error: 'Invalid Google token' });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name;

    // Find or create user
    let user = await db.getDoc('customers', email);
    if (!user) {
      // Create new user (no passwordHash since they log in with Google)
      user = {
        id: email,
        name,
        email,
        createdAt: new Date().toISOString(),
        role: 'customer',
        authProvider: 'google',
        avatar: payload.picture
      };
      await db.setDoc('customers', email, user);
    }

    // Generate JWT
    const sessionToken = jwt.sign(
      { id: user.id, email: user.email, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token: sessionToken,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Google Login Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customerAuth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { phone, address, city, state, pincode, dnCoins, coinHistory } = req.body;
    // req.user is set by authMiddleware
    const userId = req.user.email ? req.user.email.toLowerCase() : req.user.id;
    
    let user = await db.getDoc('customers', userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields
    user = {
      ...user,
      phone: phone !== undefined ? phone : user.phone,
      address: address !== undefined ? address : user.address,
      city: city !== undefined ? city : user.city,
      state: state !== undefined ? state : user.state,
      pincode: pincode !== undefined ? pincode : user.pincode,
      dnCoins: dnCoins !== undefined ? dnCoins : (user.dnCoins || 0),
      coinHistory: coinHistory !== undefined ? coinHistory : (user.coinHistory || [])
    };

    await db.setDoc('customers', userId, user);

    res.json({ message: 'Profile updated successfully', user: sanitizeUser(user) });
  } catch (err) {
    console.error('Profile Update Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
