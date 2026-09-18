const router = require('express').Router();
const { getCollection } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

// Derive unique users/customers from orders data
router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await getCollection('orders');
    const userMap = {};

    orders.forEach(order => {
      const phone = order.customer?.phone;
      if (!phone) return;

      if (!userMap[phone]) {
        userMap[phone] = {
          name: order.customer?.name || 'Unknown',
          phone,
          email: order.customer?.email || '',
          address: order.customer?.address || '',
          city: order.customer?.city || '',
          state: order.customer?.state || '',
          pincode: order.customer?.pincode || '',
          orderCount: 0,
          totalSpent: 0,
        };
      }
      userMap[phone].orderCount += 1;
      userMap[phone].totalSpent += (order.total || 0);
    });

    const users = Object.values(userMap).sort((a, b) => b.totalSpent - a.totalSpent);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
