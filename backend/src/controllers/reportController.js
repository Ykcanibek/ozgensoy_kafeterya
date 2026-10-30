import { pool } from '../config/db.js';

/**
 * Personel Performans ve Satış / İkram / İptal Karnesi
 * Tarih Aralığı: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export const getStaffPerformance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilterPayment = '';
    let dateFilterAudit = '';
    const paramsPayment = [];
    const paramsAudit = [];

    if (startDate) {
      dateFilterPayment += ' AND p.created_at >= ?';
      paramsPayment.push(`${startDate} 00:00:00`);
      dateFilterAudit += ' AND a.created_at >= ?';
      paramsAudit.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      dateFilterPayment += ' AND p.created_at <= ?';
      paramsPayment.push(`${endDate} 23:59:59`);
      dateFilterAudit += ' AND a.created_at <= ?';
      paramsAudit.push(`${endDate} 23:59:59`);
    }

    // 1. Tüm sistem kullanıcılarını getir
    const [users] = await pool.query('SELECT id, name, username, role FROM users ORDER BY name ASC');

    // 2. Personel bazlı ödeme ve ciro verileri
    const [payments] = await pool.query(`
      SELECT 
        p.closed_by_user_id AS user_id,
        COUNT(p.id) AS total_payments_count,
        SUM(p.total_amount) AS total_revenue,
        SUM(CASE WHEN p.payment_method = 'cash' THEN p.total_amount ELSE 0 END) AS cash_revenue,
        SUM(CASE WHEN p.payment_method = 'credit_card' THEN p.total_amount ELSE 0 END) AS credit_revenue,
        SUM(CASE WHEN p.payment_method = 'mixed' THEN p.total_amount ELSE 0 END) AS mixed_revenue,
        SUM(COALESCE(p.discount, 0)) AS total_discount,
        SUM(COALESCE(p.tip, 0)) AS total_tip
      FROM payments p
      WHERE p.closed_by_user_id IS NOT NULL ${dateFilterPayment}
      GROUP BY p.closed_by_user_id
    `, paramsPayment);

    // 3. Personel bazlı İkram, İade, İptal ve Sipariş Giriş verileri (audit_logs üzerinden)
    const [actions] = await pool.query(`
      SELECT 
        a.user_id,
        SUM(CASE WHEN a.action_type = 'item_complimentary' THEN a.quantity ELSE 0 END) AS complimentary_count,
        SUM(CASE WHEN a.action_type = 'item_complimentary' THEN a.amount ELSE 0 END) AS complimentary_total,
        SUM(CASE WHEN a.action_type = 'item_returned' THEN a.quantity ELSE 0 END) AS return_count,
        SUM(CASE WHEN a.action_type = 'item_returned' THEN a.amount ELSE 0 END) AS return_total,
        SUM(CASE WHEN a.action_type = 'item_cancelled' THEN a.quantity ELSE 0 END) AS cancel_count,
        SUM(CASE WHEN a.action_type = 'item_cancelled' THEN a.amount ELSE 0 END) AS cancel_total,
        SUM(CASE WHEN a.action_type = 'item_delivered' THEN a.quantity ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN a.action_type = 'order_created' THEN 1 ELSE 0 END) AS orders_created_count
      FROM audit_logs a
      WHERE a.user_id IS NOT NULL ${dateFilterAudit}
      GROUP BY a.user_id
    `, paramsAudit);

    const paymentMap = new Map(payments.map(p => [p.user_id, p]));
    const actionMap = new Map(actions.map(a => [a.user_id, a]));

    const report = users.map(u => {
      const p = paymentMap.get(u.id) || {};
      const a = actionMap.get(u.id) || {};

      return {
        user_id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        // Ciro & Ödeme
        total_payments_count: parseInt(p.total_payments_count || 0, 10),
        total_revenue: parseFloat(p.total_revenue || 0),
        cash_revenue: parseFloat(p.cash_revenue || 0),
        credit_revenue: parseFloat(p.credit_revenue || 0),
        mixed_revenue: parseFloat(p.mixed_revenue || 0),
        total_discount: parseFloat(p.total_discount || 0),
        total_tip: parseFloat(p.total_tip || 0),
        // Özel Durumlar
        complimentary_count: parseInt(a.complimentary_count || 0, 10),
        complimentary_total: parseFloat(a.complimentary_total || 0),
        return_count: parseInt(a.return_count || 0, 10),
        return_total: parseFloat(a.return_total || 0),
        cancel_count: parseInt(a.cancel_count || 0, 10),
        cancel_total: parseFloat(a.cancel_total || 0),
        delivered_count: parseInt(a.delivered_count || 0, 10),
        orders_created_count: parseInt(a.orders_created_count || 0, 10)
      };
    });

    // Toplam ciroya göre azalan sırala (en çok ciro yapan en başta)
    report.sort((a, b) => b.total_revenue - a.total_revenue || b.total_payments_count - a.total_payments_count);

    res.json({ success: true, report });
  } catch (error) {
    console.error('Personel performans raporu hatası:', error);
    res.status(500).json({ success: false, message: 'Rapor alınamadı: ' + error.message });
  }
};

/**
 * Genel Denetim İzi & Canlı Hareket Günlüğü
 * Filtreler: ?entityType=...&actionType=...&userId=...&startDate=...&endDate=...&limit=100
 */
export const getAuditLogs = async (req, res) => {
  try {
    const { entityType, actionType, userId, startDate, endDate, search, limit = 150 } = req.query;

    let whereConditions = [];
    const params = [];

    if (entityType) {
      whereConditions.push('a.entity_type = ?');
      params.push(entityType);
    }
    if (actionType) {
      whereConditions.push('a.action_type = ?');
      params.push(actionType);
    }
    if (userId) {
      whereConditions.push('a.user_id = ?');
      params.push(parseInt(userId, 10));
    }
    if (startDate) {
      whereConditions.push('a.created_at >= ?');
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      whereConditions.push('a.created_at <= ?');
      params.push(`${endDate} 23:59:59`);
    }
    if (search && search.trim()) {
      whereConditions.push('(a.title LIKE ? OR a.details LIKE ? OR a.user_name LIKE ? OR a.table_title LIKE ?)');
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        a.*,
        u.role AS user_role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.id DESC
      LIMIT ?
    `;
    params.push(parseInt(limit, 10));

    const [logs] = await pool.query(query, params);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('Denetim günlüğü hatası:', error);
    res.status(500).json({ success: false, message: 'Hareket günlüğü alınamadı: ' + error.message });
  }
};

/**
 * Tek Bir Ürün veya Kategorinin İşlem Geçmişi (Timeline)
 * GET /api/reports/history/:entityType/:entityId
 */
export const getEntityHistory = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const [history] = await pool.query(`
      SELECT 
        a.*,
        u.role AS user_role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.entity_type = ? AND a.entity_id = ?
      ORDER BY a.id DESC
    `, [entityType, entityId]);

    res.json({ success: true, history });
  } catch (error) {
    console.error('Geçmiş getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Geçmiş alınamadı: ' + error.message });
  }
};

/**
 * Gün Sonu & Genel Finansal Özet (KPI'lar, Kategori ve Ürün Dağılımı, Saatlik Yoğunluk)
 */
export const getSummaryStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilterPayment = '';
    let dateFilterAudit = '';
    const paramsPayment = [];
    const paramsAudit = [];

    if (startDate) {
      dateFilterPayment += ' AND p.created_at >= ?';
      paramsPayment.push(`${startDate} 00:00:00`);
      dateFilterAudit += ' AND a.created_at >= ?';
      paramsAudit.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      dateFilterPayment += ' AND p.created_at <= ?';
      paramsPayment.push(`${endDate} 23:59:59`);
      dateFilterAudit += ' AND a.created_at <= ?';
      paramsAudit.push(`${endDate} 23:59:59`);
    }

    // 1. Finansal Ödeme Metrikleri (Nakit, Kart, Veresiye, İndirim, Bahşiş)
    const [paymentStats] = await pool.query(`
      SELECT 
        COUNT(p.id) AS total_orders_paid,
        COALESCE(SUM(CASE 
          WHEN p.payment_method = 'cash' THEN p.total_amount 
          WHEN p.payment_method = 'mixed' THEN COALESCE(p.cash_amount, 0)
          ELSE 0 
        END), 0) AS total_cash,
        COALESCE(SUM(CASE 
          WHEN p.payment_method = 'credit_card' THEN p.total_amount 
          WHEN p.payment_method = 'mixed' THEN COALESCE(p.card_amount, 0)
          ELSE 0 
        END), 0) AS total_credit,
        COALESCE(SUM(CASE 
          WHEN p.payment_method = 'veresiye' THEN p.total_amount 
          WHEN p.payment_method = 'mixed' THEN COALESCE(p.veresiye_amount, 0)
          ELSE 0 
        END), 0) AS total_veresiye,
        COALESCE(SUM(p.discount), 0) AS total_discount,
        COALESCE(SUM(p.tip), 0) AS total_tip,
        COALESCE(SUM(CASE 
          WHEN p.order_id IS NULL AND p.customer_id IS NOT NULL THEN (
            CASE 
              WHEN p.payment_method = 'cash' THEN p.total_amount 
              WHEN p.payment_method = 'mixed' THEN COALESCE(p.cash_amount, 0)
              ELSE 0 
            END +
            CASE 
              WHEN p.payment_method = 'credit_card' THEN p.total_amount 
              WHEN p.payment_method = 'mixed' THEN COALESCE(p.card_amount, 0)
              ELSE 0 
            END
          )
          ELSE 0 
        END), 0) AS total_veresiye_collected
      FROM payments p
      WHERE 1=1 ${dateFilterPayment}
    `, paramsPayment);

    // 2. Denetim İzi & Zaiyat Metrikleri (İkram, İade, İptal)
    const [auditStats] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN a.action_type = 'item_complimentary' THEN a.amount ELSE 0 END), 0) AS total_complimentary,
        COALESCE(SUM(CASE WHEN a.action_type = 'item_complimentary' THEN a.quantity ELSE 0 END), 0) AS complimentary_count,
        COALESCE(SUM(CASE WHEN a.action_type = 'item_returned' THEN a.amount ELSE 0 END), 0) AS total_returned,
        COALESCE(SUM(CASE WHEN a.action_type = 'item_returned' THEN a.quantity ELSE 0 END), 0) AS return_count,
        COALESCE(SUM(CASE WHEN a.action_type = 'item_cancelled' THEN a.amount ELSE 0 END), 0) AS total_cancelled,
        COALESCE(SUM(CASE WHEN a.action_type = 'item_cancelled' THEN a.quantity ELSE 0 END), 0) AS cancel_count
      FROM audit_logs a
      WHERE 1=1 ${dateFilterAudit}
    `, paramsAudit);

    // 3. Kategori Bazlı Satış Dağılımı
    const [categoryBreakdown] = await pool.query(`
      SELECT 
        c.id AS category_id,
        COALESCE(c.name, 'Kategorisiz') AS category_name,
        COALESCE(c.icon, 'Coffee') AS category_icon,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.total_price) AS total_amount
      FROM order_items oi
      JOIN products pr ON oi.product_id = pr.id
      LEFT JOIN categories c ON pr.category_id = c.id
      WHERE oi.order_id IN (SELECT p.order_id FROM payments p WHERE 1=1 ${dateFilterPayment})
      GROUP BY c.id, c.name, c.icon
      ORDER BY total_amount DESC
    `, paramsPayment);

    // 4. En Çok Satan Ürünler (Tüm satılan ürünler sıralı)
    const [topProducts] = await pool.query(`
      SELECT 
        pr.id AS product_id,
        pr.name AS product_name,
        COALESCE(c.name, 'Genel') AS category_name,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.total_price) AS total_amount
      FROM order_items oi
      JOIN products pr ON oi.product_id = pr.id
      LEFT JOIN categories c ON pr.category_id = c.id
      WHERE oi.order_id IN (SELECT p.order_id FROM payments p WHERE 1=1 ${dateFilterPayment})
      GROUP BY pr.id, pr.name, c.name
      ORDER BY total_amount DESC
    `, paramsPayment);

    // 5. Saatlik Satış ve Sipariş Yoğunluğu (00 - 23 saatleri)
    const [hourlyDistribution] = await pool.query(`
      SELECT 
        HOUR(p.created_at) AS hour,
        COUNT(p.id) AS order_count,
        SUM(p.total_amount) AS revenue
      FROM payments p
      WHERE 1=1 ${dateFilterPayment}
      GROUP BY HOUR(p.created_at)
      ORDER BY hour ASC
    `, paramsPayment);

    const pRow = paymentStats[0] || {};
    const aRow = auditStats[0] || {};

    const totalOrdersPaid = parseInt(pRow.total_orders_paid || 0, 10);
    const totalCash = parseFloat(pRow.total_cash || 0);
    const totalCredit = parseFloat(pRow.total_credit || 0);
    const totalVeresiye = parseFloat(pRow.total_veresiye || 0);
    const totalVeresiyeCollected = parseFloat(pRow.total_veresiye_collected || 0);
    const totalDiscount = parseFloat(pRow.total_discount || 0);
    const totalTip = parseFloat(pRow.total_tip || 0);

    // Kullanıcı isteği: Toplam ciro o gün kasaya fiilen giren tutardır (Nakit + Kart)!
    // Veresiye ve ikram/iptal ciroya eklenmez; sadece tahsilat olduğunda kasaya yansır.
    const netCashFlow = totalCash + totalCredit;
    const totalRevenue = netCashFlow;
    const averageTicket = totalOrdersPaid > 0 ? (totalRevenue / totalOrdersPaid) : 0;

    res.json({
      success: true,
      summary: {
        total_orders_paid: totalOrdersPaid,
        total_revenue: totalRevenue,
        total_cash: totalCash,
        total_credit: totalCredit,
        total_veresiye: totalVeresiye,
        total_veresiye_collected: totalVeresiyeCollected,
        total_discount: totalDiscount,
        total_tip: totalTip,
        net_cash_flow: netCashFlow,
        average_ticket: averageTicket,
        total_complimentary: parseFloat(aRow.total_complimentary || 0),
        complimentary_count: parseInt(aRow.complimentary_count || 0, 10),
        total_returned: parseFloat(aRow.total_returned || 0),
        return_count: parseInt(aRow.return_count || 0, 10),
        total_cancelled: parseFloat(aRow.total_cancelled || 0),
        cancel_count: parseInt(aRow.cancel_count || 0, 10),
        categoryBreakdown: categoryBreakdown.map(c => ({
          ...c,
          total_quantity: parseInt(c.total_quantity || 0, 10),
          total_amount: parseFloat(c.total_amount || 0)
        })),
        topProducts: topProducts.map(tp => ({
          ...tp,
          total_quantity: parseInt(tp.total_quantity || 0, 10),
          total_amount: parseFloat(tp.total_amount || 0)
        })),
        hourlyDistribution: hourlyDistribution.map(h => ({
          hour: parseInt(h.hour, 10),
          order_count: parseInt(h.order_count || 0, 10),
          revenue: parseFloat(h.revenue || 0)
        }))
      }
    });
  } catch (error) {
    console.error('Özet rapor hatası:', error);
    res.status(500).json({ success: false, message: 'Özet rapor alınamadı: ' + error.message });
  }
};

/**
 * Adisyon & Fiş Listesi (Z-Raporu Detay Dökümü)
 * GET /api/reports/receipts?startDate=...&endDate=...&paymentMethod=...&limit=150
 */
export const getReceiptsList = async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, limit = 150 } = req.query;
    let dateFilter = '';
    const params = [];

    if (startDate) {
      dateFilter += ' AND p.created_at >= ?';
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      dateFilter += ' AND p.created_at <= ?';
      params.push(`${endDate} 23:59:59`);
    }
    if (paymentMethod && paymentMethod !== 'all') {
      dateFilter += ' AND p.payment_method = ?';
      params.push(paymentMethod);
    }

    const query = `
      SELECT 
        p.id,
        p.table_id,
        p.order_id,
        o.order_number,
        p.total_amount,
        p.cash_amount,
        p.card_amount,
        p.veresiye_amount,
        p.discount,
        p.tip,
        p.payment_method,
        p.customer_id,
        p.customer_name,
        p.notes,
        p.created_at,
        t.title AS table_title,
        t.table_number,
        u.name AS closed_by_user_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = p.order_id) AS item_count
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN restaurant_tables t ON p.table_id = t.id
      LEFT JOIN users u ON p.closed_by_user_id = u.id
      WHERE 1=1 ${dateFilter}
      ORDER BY p.id DESC
      LIMIT ?
    `;
    params.push(parseInt(limit, 10));

    const [receipts] = await pool.query(query, params);
    res.json({ success: true, receipts });
  } catch (error) {
    console.error('Fiş listesi getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Fiş listesi alınamadı: ' + error.message });
  }
};

/**
 * Tek Bir Adisyon Fişinin Detayları ve Ürün Kalemleri
 * GET /api/reports/receipt/:paymentId
 */
export const getReceiptDetail = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const [payments] = await pool.query(`
      SELECT 
        p.*,
        t.title AS table_title,
        t.table_number,
        u.name AS closed_by_user_name,
        o.order_number
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN restaurant_tables t ON p.table_id = t.id
      LEFT JOIN users u ON p.closed_by_user_id = u.id
      WHERE p.id = ?
    `, [paymentId]);

    if (payments.length === 0) {
      return res.status(404).json({ success: false, message: 'Ödeme fişi bulunamadı.' });
    }

    const payment = payments[0];
    let items = [];

    if (payment.order_id) {
      const [orderItems] = await pool.query(`
        SELECT 
          oi.id,
          oi.product_id,
          pr.name AS product_name,
          COALESCE(c.name, 'Genel') AS category_name,
          oi.quantity,
          oi.unit_price,
          oi.total_price,
          oi.note
        FROM order_items oi
        JOIN products pr ON oi.product_id = pr.id
        LEFT JOIN categories c ON pr.category_id = c.id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `, [payment.order_id]);
      items = orderItems;
    }

    res.json({ success: true, payment, items });
  } catch (error) {
    console.error('Fiş detayı hatası:', error);
    res.status(500).json({ success: false, message: 'Fiş detayı alınamadı: ' + error.message });
  }
};
