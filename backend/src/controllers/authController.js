import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_kafe_2026';

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı!' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '1d' } // Tam 1 gün (24 saat) boyunca geçerli
    );

    res.json({
      success: true,
      message: 'Giriş başarılı!',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Hatası:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Yetkisiz erişim.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const [users] = await pool.query('SELECT id, username, name, role FROM users WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    res.json({ success: true, user: users[0] });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş oturum.' });
  }
};

// Hızlı kullanıcı geçişi için kullanıcı listesi
export const getUsersList = async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, username, name, role FROM users ORDER BY id ASC');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kullanıcılar alınamadı: ' + error.message });
  }
};
