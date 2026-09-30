const router = require('express').Router();
const { getCollection } = require('../middleware/db');
const { authMiddleware } = require('../middleware/auth');

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const orders = await getCollection('orders');
    const products = await getCollection('products');
    
    // We derive users dynamically in users route, so let's derive count here too
    const userMap = {};
    orders.forEach(o => {
      if (o.customer?.phone) userMap[o.customer.phone] = true;
    });
    const usersCount = Object.keys(userMap).length;

    const today = new Date().toLocaleDateString('en-IN');
    const todayOrders = orders.filter(o => o.date === today);

    const thisMonth = orders.filter(o => {
      const d = new Date(o.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    // Revenue by day (last 7 days)
    const revenueByDay = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
      const dateStr = d.toLocaleDateString('en-IN');
      const dayOrders = orders.filter(o => o.date === dateStr);
      revenueByDay.push({ label, revenue: dayOrders.reduce((s, o) => s + (o.total || 0), 0), orders: dayOrders.length });
    }

    // Order status breakdown
    const statusCounts = {};
    orders.forEach(o => {
      statusCounts[o.orderStatus] = (statusCounts[o.orderStatus] || 0) + 1;
    });

    // Top products
    const productSales = {};
    orders.forEach(o => {
      o.items?.forEach(item => {
        if (!productSales[item.productName]) productSales[item.productName] = { name: item.productName, qty: 0, revenue: 0 };
        productSales[item.productName].qty += item.quantity || 1;
        productSales[item.productName].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

    const lowStock = products.filter(p => (p.stock || 0) <= 5);

    res.json({
      overview: {
        totalOrders: orders.length,
        todayOrders: todayOrders.length,
        monthOrders: thisMonth.length,
        totalRevenue: orders.reduce((s, o) => s + (o.total || 0), 0),
        todayRevenue: todayOrders.reduce((s, o) => s + (o.total || 0), 0),
        monthRevenue: thisMonth.reduce((s, o) => s + (o.total || 0), 0),
        totalProducts: products.length,
        totalUsers: usersCount,
        pendingOrders: orders.filter(o => o.orderStatus === 'Pending').length,
        lowStockCount: lowStock.length,
      },
      revenueByDay,
      statusCounts,
      topProducts,
      lowStock: lowStock.slice(0, 10),
      recentOrders: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
