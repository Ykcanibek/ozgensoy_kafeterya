import { pool } from '../config/db.js';
import { ALL_PERMISSIONS, PERMISSION_MODULES } from '../config/permissions.js';

// 1. Tüm Rolleri ve İstatistiklerini Getir
export const getRoles = async (req, res) => {
  try {
    const [roles] = await pool.query(`
      SELECT 
        r.id,
        r.name,
        r.slug,
        r.description,
        r.color,
        r.is_system,
        r.created_at,
        r.updated_at,
        COUNT(DISTINCT rp.permission_key) AS permissions_count,
        COUNT(DISTINCT u.id) AS users_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN users u ON r.id = u.role_id
      GROUP BY r.id
      ORDER BY r.is_system DESC, r.id ASC
    `);

    res.json({
      success: true,
      roles: roles.map(r => ({
        ...r,
        is_system: Boolean(r.is_system),
        permissions_count: parseInt(r.permissions_count || 0),
        users_count: parseInt(r.users_count || 0)
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

    const role = roles[0];
    const [perms] = await pool.query('SELECT permission_key FROM role_permissions WHERE role_id = ?', [id]);
    const permissionKeys = perms.map(p => p.permission_key);

    res.json({
      success: true,
      role: {
        ...role,
        is_system: Boolean(role.is_system),
        permissions: permissionKeys
      }
    });
  } catch (error) {
    console.error('getRoleById Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol detayı yüklenemedi: ' + error.message });
  }
};

// 3. İzinler Kataloğunu ve Modülleri Getir
export const getPermissionsCatalog = async (req, res) => {
  try {
    res.json({
      success: true,
      modules: PERMISSION_MODULES,
      permissions: ALL_PERMISSIONS
    });
  } catch (error) {
    console.error('getPermissionsCatalog Hatası:', error);
    res.status(500).json({ success: false, message: 'İzin kataloğu alınamadı.' });
  }
};

// 4. Yeni Rol Oluştur
export const createRole = async (req, res) => {
  try {
    const { name, slug, description, color, permissions } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Rol adı zorunludur.' });
    }

    // Slug oluştur veya normalize et
    const cleanSlug = (slug || name)
      .toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 45);

    // Slug benzersiz mi kontrol et
    const [existing] = await pool.query('SELECT id FROM roles WHERE slug = ?', [cleanSlug]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Bu rol kodu (slug) zaten kullanımda.' });
    }

    const [result] = await pool.query(
      `INSERT INTO roles (name, slug, description, color, is_system) VALUES (?, ?, ?, ?, 0)`,
      [name.trim(), cleanSlug, description?.trim() || null, color || '#346c80']
    );

    const newRoleId = result.insertId;

    // Seçilen yetkileri ekle
    if (Array.isArray(permissions) && permissions.length > 0) {
      const validPermKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
      const filteredPerms = permissions.filter(k => validPermKeys.has(k));

      if (filteredPerms.length > 0) {
        const insertValues = filteredPerms.map(p => [newRoleId, p]);
        await pool.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?`,
          [insertValues]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Yetki rolü başarıyla oluşturuldu.',
      roleId: newRoleId
    });
  } catch (error) {
    console.error('createRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol oluşturulamadı: ' + error.message });
  }
};

// 5. Rolü Güncelle (Bilgiler ve Yetkiler)
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, permissions } = req.body;

    const [roles] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Güncellenecek rol bulunamadı.' });
    }

    const role = roles[0];

    // Rol bilgilerini güncelle
    await pool.query(
      `UPDATE roles SET name = ?, description = ?, color = ? WHERE id = ?`,
      [
        name?.trim() || role.name,
        description !== undefined ? description.trim() : role.description,
        color || role.color,
        id
      ]
    );

    // İzinleri güncelle (eski izinleri temizle ve yenilerini ekle)
    if (Array.isArray(permissions)) {
      await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);

      const validPermKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
      const filteredPerms = permissions.filter(k => validPermKeys.has(k));

      if (filteredPerms.length > 0) {
        const insertValues = filteredPerms.map(p => [id, p]);
        await pool.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?`,
          [insertValues]
        );
      }
    }

    res.json({
      success: true,
      message: 'Rol ve yetkileri başarıyla güncellendi.'
    });
  } catch (error) {
    console.error('updateRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol güncellenemedi: ' + error.message });
  }
};

// 6. Rolü Sil
export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const [roles] = await pool.query('SELECT * FROM roles WHERE id = ?', [id]);
    if (roles.length === 0) {
      return res.status(404).json({ success: false, message: 'Silinecek rol bulunamadı.' });
    }

    const role = roles[0];

    // Sistem rolleri silinemez
    if (role.is_system) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sistem varsayılan rolleri (Yönetici, Kasa, Garson, Mutfak) güvenlik nedeniyle silinemez.' 
      });
    }

    // Role atanmış personel var mı kontrol et
    const [assignedUsers] = await pool.query('SELECT id, name FROM users WHERE role_id = ? LIMIT 5', [id]);
    if (assignedUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Bu role atanmış ${assignedUsers.length} personel bulunuyor. Önce personellerin rollerini değiştiriniz.`
      });
    }

    // Rolü sil (CASCADE ile role_permissions otomatik silinir)
    await pool.query('DELETE FROM roles WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Rol başarıyla silindi.'
    });
  } catch (error) {
    console.error('deleteRole Hatası:', error);
    res.status(500).json({ success: false, message: 'Rol silinirken hata oluştu: ' + error.message });
  }
};
