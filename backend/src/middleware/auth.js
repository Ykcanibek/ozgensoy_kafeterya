import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { JWT_SECRET } from '../config/auth.js';
import { ALL_PERMISSIONS } from '../config/permissions.js';

const PERMISSION_LABELS = new Map(ALL_PERMISSIONS.map(p => [p.key, p.label]));
export const ADMIN_SLUG = 'admin';

/**
 * Kullanıcıyı rol bilgisi ve güncel yetki listesiyle birlikte getirir.
 * Her istekte veritabanından okunur; böylece rol/yetki değişiklikleri ve pasife alma anında etkili olur.
 */
export const loadUserProfile = async (userId) => {
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.name, u.role, u.role_id, u.is_active, u.token_version,
            r.name AS role_name, r.slug AS role_slug, r.color AS role_color, r.max_discount_percent
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [userId]
  );
  if (users.length === 0) return null;
  const u = users[0];
  const [perms] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [u.role_id]);
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role_slug || u.role,
    role_id: u.role_id,
    role_name: u.role_name,
    role_color: u.role_color,
    is_active: Boolean(u.is_active),
    token_version: Number(u.token_version) || 0,
    max_discount_percent: u.max_discount_percent === null ? null : parseFloat(u.max_discount_percent),
    permissions: perms.map(p => p.permission_key)
  };
};

/** Kullanıcı bu yetkiye sahip mi? (Yönetici rolü her zaman tam yetkilidir) */
export const can = (user, key) => Boolean(user) && (user.role === ADMIN_SLUG || user.permissions.includes(key));
export const canAny = (user, keys) => keys.some(k => can(user, k));

/** 403 yanıtı: hangi yetkinin eksik olduğunu Türkçe olarak bildirir */
export const deny = (res, keys) => {
  const list = [].concat(keys);
  const labels = list.map(k => PERMISSION_LABELS.get(k) || k).join(' veya ');
  return res.status(403).json({
    success: false,
    code: 'FORBIDDEN',
    missingPermissions: list,
    message: `Bu işlem için yetkiniz yok: ${labels}.`
  });
};

/** Oturum, kullanıcının son şifre değişikliğinden önce açıldıysa geçersizdir */
export const isTokenCurrent = (decoded, user) => (Number(decoded.tv) || 0) === user.token_version;

/** Geçerli oturum ister; req.user'a güncel profil ve yetkileri ekler */
export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' });
    }
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await loadUserProfile(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Kullanıcı bulunamadı.' });
    }
    if (!user.is_active) {
      return res.status(401).json({ success: false, code: 'ACCOUNT_DISABLED', message: 'Bu hesap pasife alınmış.' });
    }
    if (!isTokenCurrent(decoded, user)) {
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Şifre değiştiği için oturum kapandı. Lütfen yeniden giriş yapın.' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Geçersiz veya süresi dolmuş oturum.' });
  }
};

/** Verilen yetkilerden en az birini ister */
export const requirePermission = (...keys) => (req, res, next) =>
  canAny(req.user, keys) ? next() : deny(res, keys);
