import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { can, deny } from '../middleware/auth.js';

const ADMIN_SLUG = 'admin';
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const MIN_PASSWORD_LENGTH = 6;

const STAFF_SELECT = `
  SELECT
    u.id, u.username, u.name, u.phone, u.is_active, u.role_id, u.last_login_at, u.created_at,
    r.name AS role_name, r.slug AS role_slug, r.color AS role_color,
    (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = u.role_id) AS permissions_count
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
`;

const formatStaff = (u) => ({
  ...u,
  is_active: Boolean(u.is_active),
  permissions_count: parseInt(u.permissions_count || 0, 10)
});

// Kullanıcı adını sadeleştir (küçük harf, Türkçe karakterler -> ASCII)
const normalizeUsername = (v) => String(v || '')
  .trim()
  .toLocaleLowerCase('tr-TR')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');

const normalizePhone = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length > 1 ? digits.slice(0, 11) : null;
};

const getStaff = async (id) => {
  const [rows] = await pool.query(`${STAFF_SELECT} WHERE u.id = ? AND u.is_hidden = 0`, [id]);
  return rows[0] ? formatStaff(rows[0]) : null;
};

const getRole = async (roleId) => {
  const [rows] = await pool.query('SELECT id, name, slug FROM roles WHERE id = ?', [roleId]);
  return rows[0] || null;
};

// Hedef kişi dışında aktif (görünür) yönetici kalıyor mu? Gizli hesaplar sayılmaz (son yöneticinin kaldırılmasını engeller)
const hasOtherActiveAdmin = async (excludeUserId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.slug = ? AND u.is_active = 1 AND u.is_hidden = 0 AND u.id <> ?`,
    [ADMIN_SLUG, excludeUserId]
  );
  return rows[0].cnt > 0;
};

// Yönetici olmayan kullanıcı, kendisinde bulunmayan bir yetkiyi içeren rolü atayamaz ve o roldeki personeli yönetemez
const exceedsActor = async (actor, roleId) => {
  if (actor.role === ADMIN_SLUG || !roleId) return false;
  const [rows] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [roleId]);
  return rows.some(r => !actor.permissions.includes(r.permission_key));
};
const SUPERIOR_MESSAGE = 'Sizden daha geniş yetkilere sahip bir personel üzerinde bu işlemi yapamazsınız.';
const ESCALATION_MESSAGE = 'Kendi yetkilerinizi aşan bir rol atayamazsınız.';
const forbid = (res, message) => res.status(403).json({ success: false, code: 'FORBIDDEN', message });

const LAST_ADMIN_MESSAGE = 'Sistemde en az bir aktif yönetici kalmalıdır. Önce başka bir personeli yönetici yapın.';

// Ad, kullanıcı adı, telefon ve rol alanlarını doğrular; hata varsa mesaj döner
const validateStaffInput = async ({ name, username, role_id }, excludeId = 0) => {
  if (!name || !String(name).trim()) return 'Ad soyad zorunludur.';
  if (String(name).trim().length > 100) return 'Ad soyad en fazla 100 karakter olabilir.';
  if (!USERNAME_RE.test(username)) {
    return 'Kullanıcı adı 3-30 karakter olmalı; yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.';
  }
  const [dup] = await pool.query('SELECT id FROM users WHERE username = ? AND id <> ?', [username, excludeId]);
  if (dup.length > 0) return 'Bu kullanıcı adı başka bir personel tarafından kullanılıyor.';
  if (!role_id || !(await getRole(role_id))) return 'Lütfen geçerli bir rol seçin.';
  return null;
};

// 1. Personel listesi ve özet istatistikler
export const getStaffList = async (req, res) => {
  try {
    const [rows] = await pool.query(`${STAFF_SELECT} WHERE u.is_hidden = 0 ORDER BY u.is_active DESC, u.name ASC`);
    const staff = rows.map(formatStaff);
    res.json({
      success: true,
      staff,
      stats: {
        total: staff.length,
        active: staff.filter(s => s.is_active).length,
        passive: staff.filter(s => !s.is_active).length
      }
    });
  } catch (error) {
    console.error('Personel listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Personel listesi alınamadı: ' + error.message });
  }
};

// 2. Yeni personel oluştur
export const createStaff = async (req, res) => {
  try {
    const actor = getUserFromReq(req);
    const { name, phone, role_id, password, is_active = true } = req.body;
    const username = normalizeUsername(req.body.username);

    const error = await validateStaffInput({ name, username, role_id });
    if (error) return res.status(400).json({ success: false, message: error });
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.` });
    }

    if (await exceedsActor(req.user, role_id)) return forbid(res, ESCALATION_MESSAGE);

    const role = await getRole(role_id);
    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await pool.query(
      `INSERT INTO users (username, password, name, phone, role, role_id, is_active, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, hash, name.trim(), normalizePhone(phone), role.slug, role.id, is_active ? 1 : 0, actor.id]
    );

    await logActivity({
      userId: actor.id,
      userName: actor.name,
      entityType: 'staff',
      entityId: result.insertId,
      actionType: 'staff_created',
      title: `Yeni Personel: ${name.trim()}`,
      details: `${actor.name} tarafından @${username} kullanıcı adıyla "${role.name}" rolünde personel hesabı açıldı.`
    });

    res.status(201).json({ success: true, message: 'Personel hesabı oluşturuldu.', staff: await getStaff(result.insertId) });
  } catch (error) {
    console.error('Personel oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Personel oluşturulamadı: ' + error.message });
  }
};

// 3. Personel bilgilerini güncelle (ad, kullanıcı adı, telefon, rol, durum)
export const updateStaff = async (req, res) => {
  try {
    const actor = getUserFromReq(req);
    const { id } = req.params;
    const existing = await getStaff(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });

    const { name, phone } = req.body;
    const username = normalizeUsername(req.body.username ?? existing.username);
    const role_id = req.body.role_id ?? existing.role_id;
    const is_active = req.body.is_active === undefined ? existing.is_active : Boolean(req.body.is_active);
    const isSelf = actor.id === existing.id;

    const error = await validateStaffInput({ name, username, role_id }, existing.id);
    if (error) return res.status(400).json({ success: false, message: error });

    const role = await getRole(role_id);
    const roleChanged = role.id !== existing.role_id;

    if (!isSelf && await exceedsActor(req.user, existing.role_id)) return forbid(res, SUPERIOR_MESSAGE);
    if (roleChanged && !can(req.user, 'staff.assign_role')) return deny(res, 'staff.assign_role');
    if (roleChanged && await exceedsActor(req.user, role.id)) return forbid(res, ESCALATION_MESSAGE);

    if (isSelf && roleChanged) {
      return res.status(400).json({ success: false, message: 'Kendi rolünüzü değiştiremezsiniz.' });
    }
    if (isSelf && !is_active) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı pasife alamazsınız.' });
    }
    const losesAdmin = existing.role_slug === ADMIN_SLUG && existing.is_active && (role.slug !== ADMIN_SLUG || !is_active);
    if (losesAdmin && !(await hasOtherActiveAdmin(existing.id))) {
      return res.status(400).json({ success: false, message: LAST_ADMIN_MESSAGE });
    }

    await pool.query(
      'UPDATE users SET name = ?, username = ?, phone = ?, role = ?, role_id = ?, is_active = ? WHERE id = ?',
      [name.trim(), username, normalizePhone(phone), role.slug, role.id, is_active ? 1 : 0, existing.id]
    );

    const changes = [];
    if (existing.name !== name.trim()) changes.push(`Ad: ${existing.name} → ${name.trim()}`);
    if (existing.username !== username) changes.push(`Kullanıcı adı: @${existing.username} → @${username}`);
    if (roleChanged) changes.push(`Rol: ${existing.role_name || '-'} → ${role.name}`);
    if (existing.is_active !== is_active) changes.push(`Durum: ${is_active ? 'Aktif' : 'Pasif'}`);

    await logActivity({
      userId: actor.id,
      userName: actor.name,
      entityType: 'staff',
      entityId: existing.id,
      actionType: roleChanged ? 'staff_role_changed' : 'staff_updated',
      title: `Personel Güncellendi: ${name.trim()}`,
      details: `${actor.name} tarafından güncellendi. ${changes.length ? changes.join(' | ') : 'İletişim bilgisi güncellendi.'}`
    });

    res.json({ success: true, message: 'Personel bilgileri güncellendi.', staff: await getStaff(existing.id) });
  } catch (error) {
    console.error('Personel güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Personel güncellenemedi: ' + error.message });
  }
};

// 4. Aktif / pasif durumunu değiştir
export const toggleStaffStatus = async (req, res) => {
  try {
    const actor = getUserFromReq(req);
    const existing = await getStaff(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });

    if (actor.id !== existing.id && await exceedsActor(req.user, existing.role_id)) return forbid(res, SUPERIOR_MESSAGE);

    const nextActive = !existing.is_active;
    if (!nextActive && actor.id === existing.id) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı pasife alamazsınız.' });
    }
    if (!nextActive && existing.role_slug === ADMIN_SLUG && !(await hasOtherActiveAdmin(existing.id))) {
      return res.status(400).json({ success: false, message: LAST_ADMIN_MESSAGE });
    }

    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [nextActive ? 1 : 0, existing.id]);

    await logActivity({
      userId: actor.id,
      userName: actor.name,
      entityType: 'staff',
      entityId: existing.id,
      actionType: nextActive ? 'staff_activated' : 'staff_deactivated',
      title: `Personel ${nextActive ? 'Aktif Edildi' : 'Pasife Alındı'}: ${existing.name}`,
      details: `${actor.name} tarafından @${existing.username} hesabı ${nextActive ? 'aktif edildi' : 'pasife alındı; artık giriş yapamaz'}.`
    });

    res.json({
      success: true,
      message: nextActive ? 'Personel hesabı aktif edildi.' : 'Personel hesabı pasife alındı. Artık giriş yapamaz.',
      staff: await getStaff(existing.id)
    });
  } catch (error) {
    console.error('Personel durum hatası:', error);
    res.status(500).json({ success: false, message: 'Durum değiştirilemedi: ' + error.message });
  }
};

// 5. Şifre sıfırla
export const resetStaffPassword = async (req, res) => {
  try {
    const actor = getUserFromReq(req);
    const existing = await getStaff(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });

    if (actor.id !== existing.id && await exceedsActor(req.user, existing.role_id)) return forbid(res, SUPERIOR_MESSAGE);

    const { password } = req.body;
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.` });
    }

    const hash = await bcrypt.hash(String(password), 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, existing.id]);

    await logActivity({
      userId: actor.id,
      userName: actor.name,
      entityType: 'staff',
      entityId: existing.id,
      actionType: 'staff_password_reset',
      title: `Şifre Sıfırlandı: ${existing.name}`,
      details: `${actor.name} tarafından @${existing.username} hesabının şifresi değiştirildi.`
    });

    res.json({ success: true, message: 'Şifre başarıyla değiştirildi.' });
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ success: false, message: 'Şifre değiştirilemedi: ' + error.message });
  }
};

// 6. Personeli sil (yalnızca hiç işlem kaydı yoksa; aksi halde pasife alınması istenir)
export const deleteStaff = async (req, res) => {
  try {
    const actor = getUserFromReq(req);
    const existing = await getStaff(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });

    if (actor.id === existing.id) {
      return res.status(400).json({ success: false, message: 'Kendi hesabınızı silemezsiniz.' });
    }
    if (await exceedsActor(req.user, existing.role_id)) return forbid(res, SUPERIOR_MESSAGE);
    if (existing.role_slug === ADMIN_SLUG && existing.is_active && !(await hasOtherActiveAdmin(existing.id))) {
      return res.status(400).json({ success: false, message: LAST_ADMIN_MESSAGE });
    }

    const [[history]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM orders WHERE created_by_user_id = ?) +
        (SELECT COUNT(*) FROM order_items WHERE created_by_user_id = ? OR status_updated_by_user_id = ?) +
        (SELECT COUNT(*) FROM payments WHERE closed_by_user_id = ?) +
        (SELECT COUNT(*) FROM customer_transactions WHERE created_by_user_id = ?) +
        (SELECT COUNT(*) FROM audit_logs WHERE user_id = ?) AS cnt`,
      Array(6).fill(existing.id)
    );
    if (history.cnt > 0) {
      return res.status(400).json({
        success: false,
        hasHistory: true,
        message: 'Bu personelin sistemde işlem geçmişi var; raporların bozulmaması için silinemez. Bunun yerine hesabı pasife alın.'
      });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [existing.id]);

    await logActivity({
      userId: actor.id,
      userName: actor.name,
      entityType: 'staff',
      entityId: existing.id,
      actionType: 'staff_deleted',
      title: `Personel Silindi: ${existing.name}`,
      details: `${actor.name} tarafından @${existing.username} hesabı kalıcı olarak silindi.`
    });

    res.json({ success: true, message: 'Personel hesabı silindi.' });
  } catch (error) {
    console.error('Personel silme hatası:', error);
    res.status(500).json({ success: false, message: 'Personel silinemedi: ' + error.message });
  }
};
