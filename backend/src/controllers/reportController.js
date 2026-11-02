import { pool } from '../config/db.js';

// Satış, tahsilat, ürün, adisyon, personel ve ikram/iade/iptal raporları: salesReportController.js

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
