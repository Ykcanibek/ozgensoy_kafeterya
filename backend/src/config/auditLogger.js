import { pool } from './db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_kafe_2026';

/**
 * Request'ten kullanıcı bilgisini (JWT token veya fallback body) çıkarır
 */
export const getUserFromReq = (req) => {
  try {
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      return {
        id: decoded.id,
        name: decoded.name || decoded.username,
        role: decoded.role
      };
    }
  } catch (e) {
    // Token geçersizse veya yoksa devam et
  }

  // Fallback: body veya query üzerinden gelen user bilgisi
  if (req.body?.user_id || req.body?.user_name) {
    return {
      id: req.body.user_id ? parseInt(req.body.user_id, 10) : null,
      name: req.body.user_name || 'Personel',
      role: req.body.user_role || 'staff'
    };
  }

  return { id: null, name: 'Sistem / Anonim', role: 'system' };
};

/**
 * Denetim İzi (Audit Log) kaydı ekler
 */
export const logActivity = async ({
  userId = null,
  userName = null,
  entityType,
  entityId = null,
  actionType,
  title,
  details = null,
  oldValue = null,
  newValue = null,
  amount = 0.00,
  quantity = 0,
  tableTitle = null
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
        user_id, user_name, entity_type, entity_id, action_type, 
        title, details, old_value, new_value, amount, quantity, table_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userName,
        entityType,
        entityId,
        actionType,
        title,
        typeof details === 'object' && details !== null ? JSON.stringify(details) : details,
        typeof oldValue === 'object' && oldValue !== null ? JSON.stringify(oldValue) : oldValue,
        typeof newValue === 'object' && newValue !== null ? JSON.stringify(newValue) : newValue,
        parseFloat(amount || 0),
        parseInt(quantity || 0, 10),
        tableTitle
      ]
    );
  } catch (err) {
    console.error('[AuditLog] Kayıt hatası:', err.message);
  }
};
