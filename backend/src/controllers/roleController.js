import { pool } from '../config/db.js';
import { ALL_PERMISSIONS, PERMISSION_MODULES, normalizePermissions } from '../config/permissions.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';

// Yönetici rolü her zaman tam yetkilidir; yetkileri kısıtlanamaz (işletme sahibinin kendini kilitlemesini önler)
const ADMIN_SLUG = 'admin';
const PERMISSION_LABELS = new Map(ALL_PERMISSIONS.map(p => [p.key, p.label]));

// Yönetici olmayan kullanıcı, kendisinde bulunmayan yetkileri içeren bir rolü oluşturamaz / düzenleyemez / silemez
const grantsBeyondActor = (actor, keys) => actor.role !== ADMIN_SLUG && keys.some(k => !actor.permissions.includes(k));
const ESCALATION_MESSAGE = 'Kendinizde olmayan bir yetkiyi başka bir role veremezsiniz.';
const SUPERIOR_ROLE_MESSAGE = 'Sizden daha geniş yetkilere sahip bir rol üzerinde bu işlemi yapamazsınız.';
const forbid = (res, message) => res.status(403).json({ success: false, code: 'FORBIDDEN', message });

const formatRole = (r) => ({
  ...r,
  is_system: Boolean(r.is_system),
  is_locked: r.slug === ADMIN_SLUG,
  max_discount_percent: r.max_discount_percent === null || r.max_discount_percent === undefined
    ? null
    : parseFloat(r.max_discount_percent)
});

// Türkçe karakterleri sadeleştirip rol kodu (slug) üretir
const toSlug = (text) => String(text)
  .toLocaleLowerCase('tr-TR')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 45) || 'rol';

// Benzersiz slug üret (çakışırsa _2, _3 ... ekler)
const uniqueSlug = async (base) => {
  const [rows] = await pool.query('SELECT slug FROM roles WHERE slug = ? OR slug LIKE ?', [base, `${base}\\_%`]);
  const taken = new Set(rows.map(r => r.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
};

// Form alanlarını doğrula; hata varsa mesaj döner
const validateRoleInput = async ({ name, color, max_discount_percent }, excludeId = null) => {
  if (name !== undefined) {
    if (!name || !String(name).trim()) return 'Rol adı zorunludur.';
    if (String(name).trim().length > 100) return 'Rol adı en fazla 100 karakter olabilir.';
    const [dup] = await pool.query(
      'SELECT id FROM roles WHERE LOWER(name) = LOWER(?) AND id <> ?',
      [String(name).trim(), excludeId || 0]
    );
    if (dup.length > 0) return 'Bu isimde bir rol zaten mevcut.';
  }
  if (color !== undefined && color !== null && !/^#[0-9a-f]{6}$/i.test(color)) {
    return 'Geçersiz renk kodu.';
  }
  if (max_discount_percent !== undefined && max_discount_percent !== null && max_discount_percent !== '') {
    const v = Number(max_discount_percent);
    if (!Number.isFinite(v) || v < 0 || v > 100) return 'İndirim üst sınırı 0 ile 100 arasında olmalıdır.';
  }
  return null;
};

const parseDiscount = (v) => (v === undefined || v === null || v === '' ? null : Math.round(Number(v) * 100) / 100);

const replacePermissions = async (connection, roleId, keys) => {
  await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  if (keys.length > 0) {
    await connection.query(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?',
      [keys.map(k => [roleId, k])]
    );
  }
};

// 1. Tüm Rolleri ve İstatistiklerini Getir
export const getRoles = async (req, res) => {
  try {
    const [roles] = await pool.query(`
      SELECT
        r.id, r.name, r.slug, r.description, r.color, r.max_discount_percent, r.is_system, r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions_count,
        (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.is_hidden = 0) AS users_count,
        (SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ') FROM users u WHERE u.role_id = r.id AND u.is_hidden = 0) AS user_names
      FROM roles r
      ORDER BY (r.slug = 'admin') DESC, r.is_system DESC, r.id ASC
    `);

    res.json({
      success: true,
      roles: roles.map(r => ({
        ...formatRole(r),
        permissions_count: parseInt(r.permissions_count || 0, 10),
        users_count: parseInt(r.users_count || 0, 10),
        user_names: r.user_names ? r.user_names.split(', ') : []
      }))
    });
  } catch (error) {
    console.error('getRoles Hatası:', error);
    res.status(500).json({ success: false, message: 'Roller yüklenirken hata oluştu: ' + error.message });
  }
};

// 2. Tek Bir Rolün Detayını ve İzin Listesini Getir
export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    const [roles] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);

    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol bulunamadı.' });
    }

    const [perms] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [id]);

    res.json({
      success: true,
      role: {
        ...formatRole(roles[0]),
        permissions: perms.map(p => p.permission_key)
      }
    });
  } catch (error) {
    console.error('getRoleById Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol detayı yüklenemedi: ' + error.message });
  }
};

// 3. İzinler Kataloğunu ve Modülleri Getir
export const getPermissionsCatalog = async (req, res) => {
  res.json({
    success: true,
    modules: PERMISSION_MODULES,
    permissions: ALL_PERMISSIONS
  });
};

// 4. Yeni Rol Oluştur
export const createRole = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { name, description, color, permissions, max_discount_percent } = req.body;

    const error = await validateRoleInput({ name, color, max_discount_percent });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const slug = await uniqueSlug(toSlug(name));
    const permKeys = normalizePermissions(Array.isArray(permissions) ? permissions : []);
    if (grantsBeyondActor(req.user, permKeys)) return forbid(res, ESCALATION_MESSAGE);
    const discount = permKeys.includes('payment.discount') ? parseDiscount(max_discount_percent) : null;

    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO roles (name, slug, description, color, max_discount_percent, is_system) VALUES (?, ?, ?, ?, ?, 0)`,
      [name.trim(), slug, description?.trim() || null, color || '#346c80', discount]
    );
    await replacePermissions(connection, result.insertId, permKeys);
    await connection.commit();

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'role',
      entityId: result.insertId,
      actionType: 'role_created',
      title: `Yeni Rol Oluşturuldu: ${name.trim()}`,
      details: `${user.name} tarafından ${permKeys.length} yetkiyle "${name.trim()}" rolü oluşturuldu.`,
      newValue: { permissions: permKeys, max_discount_percent: discount }
    });

    res.status(201).json({
      success: true,
      message: 'Yetki rolü başarıyla oluşturuldu.',
      roleId: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error('createRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol oluşturulamadı: ' + error.message });
  } finally {
    connection.release();
  }
};

// 5. Rolü Güncelle (Bilgiler, Yetkiler ve Limitler)
export const updateRole = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { name, description, color, permissions, max_discount_percent } = req.body;

    const [roles] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Güncellenecek rol bulunamadı.' });
    }
    const role = roles[0];
    const isLocked = role.slug === ADMIN_SLUG;

    const error = await validateRoleInput({ name, color, max_discount_percent }, role.id);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const [oldPermRows] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [id]);
    const oldPerms = oldPermRows.map(p => p.permission_key);

    // Yönetici rolünün yetkileri değiştirilemez; diğer rollerde ön koşullar otomatik tamamlanır
    const newPerms = isLocked || !Array.isArray(permissions)
      ? oldPerms
      : normalizePermissions(permissions);

    // Yetki yükseltme koruması (yönetici hariç): kendi rolünü düzenleyemez, kendinden geniş rolü değiştiremez,
    // sahip olmadığı yetkiyi veremez
    if (req.user.role !== ADMIN_SLUG) {
      if (role.id === req.user.role_id) return forbid(res, 'Kendi rolünüzün yetkilerini değiştiremezsiniz.');
      if (grantsBeyondActor(req.user, oldPerms)) return forbid(res, SUPERIOR_ROLE_MESSAGE);
      if (grantsBeyondActor(req.user, newPerms)) return forbid(res, ESCALATION_MESSAGE);
    }

    const discount = isLocked
      ? null
      : max_discount_percent === undefined
        ? role.max_discount_percent
        : (newPerms.includes('payment.discount') ? parseDiscount(max_discount_percent) : null);

    await connection.beginTransaction();
    await connection.query(
      `UPDATE roles SET name = ?, description = ?, color = ?, max_discount_percent = ? WHERE id = ?`,
      [
        name?.trim() || role.name,
        description !== undefined ? (description?.trim() || null) : role.description,
        color || role.color,
        discount,
        id
      ]
    );
    if (!isLocked) {
      await replacePermissions(connection, id, newPerms);
    }
    await connection.commit();

    // Denetim kaydı: hangi yetkiler eklendi / kaldırıldı
    const added = newPerms.filter(k => !oldPerms.includes(k));
    const removed = oldPerms.filter(k => !newPerms.includes(k));
    const oldDiscount = role.max_discount_percent === null ? null : parseFloat(role.max_discount_percent);
    const changes = [];
    if (added.length) changes.push(`Eklenen: ${added.map(k => PERMISSION_LABELS.get(k) || k).join(', ')}`);
    if (removed.length) changes.push(`Kaldırılan: ${removed.map(k => PERMISSION_LABELS.get(k) || k).join(', ')}`);
    if (oldDiscount !== discount) changes.push(`İndirim sınırı: ${oldDiscount ?? 'Sınırsız'} → ${discount ?? 'Sınırsız'}`);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'role',
      entityId: role.id,
      actionType: 'role_updated',
      title: `Rol Güncellendi: ${name?.trim() || role.name}`,
      details: `${user.name} tarafından güncellendi. ${changes.length ? changes.join(' | ') : 'Yetkilerde değişiklik yok.'}`,
      oldValue: { permissions: oldPerms, max_discount_percent: oldDiscount },
      newValue: { permissions: newPerms, max_discount_percent: discount }
    });

    res.json({
      success: true,
      message: isLocked
        ? 'Rol bilgileri güncellendi. Yönetici rolünün yetkileri her zaman tamdır.'
        : 'Rol ve yetkileri başarıyla güncellendi.'
    });
  } catch (error) {
    await connection.rollback();
    console.error('updateRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

// 6. Rolü Sil
export const deleteRole = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;

    const [roles] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Silinecek rol bulunamadı.' });
    }

    const role = roles[0];

    const [rolePermRows] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [id]);
    if (grantsBeyondActor(req.user, rolePermRows.map(r => r.permission_key))) {
      return forbid(res, SUPERIOR_ROLE_MESSAGE);
    }

    if (role.is_system) {
      return res.status(400).json({
        success: false,
        message: 'Sistem varsayılan rolleri güvenlik nedeniyle silinemez.'
      });
    }

    const [assignedUsers] = await pool.query('SELECT name FROM users WHERE role_id = ? AND is_hidden = 0', [id]);
    if (assignedUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu role atanmış ${assignedUsers.length} personel var (${assignedUsers.map(u => u.name).join(', ')}). Önce personellerin rolünü değiştirin.`
      });
    }

    await pool.query('DELETE FROM roles WHERE id = ?', [id]);

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'role',
      entityId: role.id,
      actionType: 'role_deleted',
      title: `Rol Silindi: ${role.name}`,
      details: `${user.name} tarafından "${role.name}" rolü silindi.`
    });

    res.json({ success: true, message: 'Rol başarıyla silindi.' });
  } catch (error) {
    console.error('deleteRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol silinirken hata oluştu: ' + error.message });
  }
};
