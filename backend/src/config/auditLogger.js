import { pool } from './db.js';

/**
 * İşlemi yapan kullanıcıyı döndürür. requireAuth ara katmanının doğruladığı req.user kullanılır;
 * istek gövdesindeki user_id / user_name gibi alanlara güvenilmez (başkası adına kayıt atılmasını önler).
 */
export const getUserFromReq = (req) => {
  if (req.user) {
    return { id: req.user.id, name: req.user.name, role: req.user.role };
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
