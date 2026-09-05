'use strict';

const express = require('express');
const { query, get } = require('../db');
const { authRequired } = require('../auth');
const ah = require('../asyncHandler');

const router = express.Router();
router.use(authRequired);

// GET /api/dashboard/summary
router.get('/summary', ah(async (req, res) => {
  const [today, month, profitToday, inventory, last7, topProducts, recentSales] = await Promise.all([
    get(`
      SELECT COALESCE(SUM(total_amount), 0) AS sales,
             COALESCE(SUM(discount), 0)     AS discount,
             COUNT(*)                       AS receipts
      FROM sales
      WHERE sale_status = 'completed' AND date(created_at) = date('now')`),

    get(`
      SELECT COALESCE(SUM(total_amount), 0) AS sales, COUNT(*) AS receipts
      FROM sales
      WHERE sale_status = 'completed' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`),

    get(`
      SELECT COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0) AS gross_profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.sale_status = 'completed' AND date(s.created_at) = date('now')`),

    get(`
      SELECT COUNT(*) AS products,
             COALESCE(SUM(stock_quantity * buying_price), 0) AS stock_value,
             SUM(CASE WHEN stock_quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock
      FROM products WHERE is_active = 1`),

    query(`
      SELECT date(created_at) AS day,
             COALESCE(SUM(total_amount), 0) AS sales,
             COUNT(*) AS receipts
      FROM sales
      WHERE sale_status = 'completed' AND created_at >= date('now', '-6 days')
      GROUP BY date(created_at)
      ORDER BY day`),

    query(`
      SELECT si.product_name AS name,
             SUM(si.quantity)   AS qty,
             SUM(si.line_total) AS revenue
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.sale_status = 'completed' AND s.created_at >= date('now', '-30 days')
      GROUP BY si.product_name
      ORDER BY revenue DESC
      LIMIT 5`),

    query(`
      SELECT s.id, s.receipt_number, s.total_amount, s.payment_status, s.created_at,
             u.name AS cashier_name
      FROM sales s JOIN users u ON u.id = s.user_id
      ORDER BY s.id DESC LIMIT 8`),
  ]);

  res.json({
    today: { ...today, gross_profit: profitToday.gross_profit },
    month,
    inventory,
    last7,
    topProducts,
    recentSales,
  });
}));

module.exports = router;
