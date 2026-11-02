import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/auth.js';
import { loadUserProfile } from '../middleware/auth.js';
import { logActivity } from '../config/auditLogger.js';

// Kaba kuvvet (şifre deneme) koruması: aynı kullanıcı adı + adres için kısa sürede çok fazla hatalı denemede geçici kilit.
// Bellekte tutulur; sunucu yeniden başlarsa sıfırlanır.
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const failedLogins = new Map(); // anahtar -> hatalı deneme zamanları

// Oturum token'ı 1 gün geçerlidir; açık ekranlar /api/auth/me ile düzenli olarak yeniler
const signToken = (user) => jwt.sign(
  { id: user.id, username: user.username, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: '1d' }
);

const recentFailures = (key, now) => {
  const list = (failedLogins.get(key) || []).filter(t => now - t < ATTEMPT_WINDOW_MS);
  if (list.length) failedLogins.set(key, list); else failedLogins.delete(key);
  return list;
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const attemptKey = `${req.ip}|${normalizedUsername}`;
    const now = Date.now();
    const failures = recentFailures(attemptKey, now);
    if (failures.length >= MAX_FAILED_ATTEMPTS) {
      const waitMin = Math.ceil((ATTEMPT_WINDOW_MS - (now - failures[0])) / 60000);
      return res.status(429).json({
        success: false,
        code: 'TOO_MANY_ATTEMPTS',
        message: `Çok fazla hatalı giriş denemesi. Lütfen ${waitMin} dakika sonra tekrar deneyin.`
      });
    }

    const [users] = await pool.query('SELECT id, password, is_active FROM users WHERE username = ?', [normalizedUsername]);

    if (users.length === 0 || !(await bcrypt.compare(String(password), users[0].password))) {
      failures.push(now);
      failedLogins.set(attemptKey, failures);
      // Eski kayıtları ara sıra temizle (bellek büyümesin)
      if (failedLogins.size > 1000) for (const k of failedLogins.keys()) recentFailures(k, now);
      const left = MAX_FAILED_ATTEMPTS - failures.length;
      return res.status(401).json({
        success: false,
        message: left > 0 && left <= 2
          ? `Kullanıcı adı veya şifre hatalı! (Kalan deneme hakkı: ${left})`
          : 'Kullanıcı adı veya şifre hatalı!'
      });
    }
    failedLogins.delete(attemptKey);

    if (!users[0].is_active) {
      return res.status(403).json({ success: false, message: 'Bu hesap pasife alınmış. Lütfen işletme yöneticisiyle görüşün.' });
    }

    const user = await loadUserProfile(users[0].id);
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const token = signToken(user);

    res.json({
      success: true,
      message: 'Giriş başarılı!',
      token,
      user
    });
  } catch (error) {
    console.error('Login Hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
  }
};

// Oturumdaki kullanıcının güncel profili ve yetkileri (requireAuth doğrular).
// Her çağrıda süresi yenilenmiş bir token da döner: açık kalan kasa/mutfak ekranı vardiya ortasında oturumdan düşmez.
export const getMe = (req, res) => {
  res.json({ success: true, user: req.user, token: signToken(req.user) });
};

// Kullanıcının kendi şifresini değiştirmesi (mevcut şifre doğrulanır; personel yönetimi yetkisi gerekmez)
const MIN_PASSWORD_LENGTH = 6;
export const changeOwnPassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Mevcut ve yeni şifre gereklidir.' });
    }
    if (String(new_password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.` });
    }
    if (String(new_password) === String(current_password)) {
      return res.status(400).json({ success: false, message: 'Yeni şifre mevcut şifreyle aynı olamaz.' });
    }

    // Oturumu açık bırakılmış cihazda şifre tahmin edilmesin: hatalı mevcut şifre denemeleri de sınırlanır
    const attemptKey = `password-change|${req.user.id}`;
    const now = Date.now();
    const failures = recentFailures(attemptKey, now);
    if (failures.length >= MAX_FAILED_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Çok fazla hatalı deneme. Lütfen birkaç dakika sonra tekrar deneyin.' });
    }

    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0 || !(await bcrypt.compare(String(current_password), rows[0].password))) {
      failures.push(now);
      failedLogins.set(attemptKey, failures);
      return res.status(400).json({ success: false, message: 'Mevcut şifreniz hatalı.' });
    }
    failedLogins.delete(attemptKey);

    const hash = await bcrypt.hash(String(new_password), 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id]);
    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      entityType: 'staff',
      entityId: req.user.id,
      actionType: 'own_password_changed',
      title: `Şifre Değiştirildi: ${req.user.name}`,
      details: `${req.user.name} kendi şifresini değiştirdi.`
    });
    res.json({ success: true, message: 'Şifreniz değiştirildi.' });
  } catch (error) {
    console.error('Şifre değiştirme hatası:', error);
    res.status(500).json({ success: false, message: 'Şifre değiştirilemedi: ' + error.message });
  }
};

// Hızlı kullanıcı geçişi için aktif kullanıcı listesi
export const getUsersList = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.username, u.name, COALESCE(r.slug, u.role) AS role, r.name AS role_name, r.color AS role_color
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = 1 AND u.is_hidden = 0
       ORDER BY u.id ASC`
    );
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kullanıcılar alınamadı: ' + error.message });
  }
};
