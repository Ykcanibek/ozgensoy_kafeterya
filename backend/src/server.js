import { APP_TIMEZONE } from './config/timezone.js'; // İlk sırada kalmalı: saat dilimini diğer modüller yüklenmeden ayarlar
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase } from './models/initDb.js';
import { ensureThumbnails } from './config/upload.js';
import { startDailyClosingScheduler } from './services/dailyClosing.js';
import { startBackupScheduler } from './services/backup.js';
import { pool } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import wasteRoutes from './routes/wasteRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import qrOrderRoutes from './routes/qrOrderRoutes.js';
import cashBookRoutes from './routes/cashBookRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import { findTable } from './controllers/publicMenuController.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config/auth.js';
import { requireAuth, loadUserProfile, canAny, isTokenCurrent } from './middleware/auth.js';

dotenv.config();

const app = express();

// Nginx gibi bir proxy arkasında gerçek istemci IP'si (QR sipariş hız sınırı IP'ye göre çalışır)
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
const server = http.createServer(app);

// CORS: .env içindeki CORS_ORIGIN (virgülle ayrılmış adresler) ile kısıtlanır; boşsa her adrese izin verilir (geliştirme)
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOrigin = CORS_ORIGINS.length ? CORS_ORIGINS : '*';
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));

// Tarayıcı güvenlik başlıkları. Menü sayfası sipariş ve canlı bağlantı için panel adresine bağlanır (CORS_ORIGIN).
app.disable('x-powered-by');
const CONNECT_SOURCES = ["'self'", ...CORS_ORIGINS, ...CORS_ORIGINS.map(origin => origin.replace(/^http/, 'ws'))];
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Bileşenlerdeki satır içi stiller
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${CONNECT_SOURCES.join(' ')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.use(express.json());

// Sunucu hatalarında (5xx) veritabanı/iç hata ayrıntısı kullanıcıya gönderilmez; ayrıntı sunucu konsoluna yazılır.
// Denetleyicilerdeki 'X yapılamadı: <iç hata>' mesajlarından yalnızca ilk kısım kalır.
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body.message === 'string') {
      const head = body.message.split(':')[0].trim();
      body = { ...body, message: `${head || 'Sunucu hatası'}. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.` };
    }
    return json(body);
  };
  next();
});

// Statik Görsel Dosya Servisi (Kategori & Ürün WebP görselleri)
// Her yüklemede dosya adı benzersizdir ve dosya hiç değiştirilmez (yeni görsel = yeni ad);
// bu yüzden tarayıcı görseli 1 yıl boyunca sunucuya hiç sormadan önbellekten gösterebilir.
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), {
  maxAge: '365d',
  immutable: true,
  etag: true
}));

// Socket.io yapılandırması
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});

// Socket.io: yalnızca geçerli oturumu olan aktif kullanıcılar canlı güncellemelere bağlanabilir
io.use(async (socket, next) => {
  try {
    const decoded = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET);
    const user = await loadUserProfile(decoded.id);
    if (!user || !user.is_active || !isTokenCurrent(decoded, user)) return next(new Error('UNAUTHENTICATED'));
    socket.data.user = user;
    socket.data.tokenExp = decoded.exp;
    socket.data.tokenVersion = user.token_version;
    next();
  } catch (error) {
    next(new Error('UNAUTHENTICATED'));
  }
});

// Bağlı kullanıcıların yetkileri düzenli olarak tazelenir: rolü değişen personel yeni yetkileriyle olay alır,
// pasife alınan, şifresi değişen veya oturum süresi dolan bağlantı kesilir (istemci yeni token ile yeniden bağlanır).
const SOCKET_REFRESH_MS = 60 * 1000;
setInterval(async () => {
  const nowSec = Date.now() / 1000;
  for (const socket of io.sockets.sockets.values()) {
    try {
      if (socket.data.tokenExp && socket.data.tokenExp < nowSec) { socket.disconnect(true); continue; }
      const user = await loadUserProfile(socket.data.user.id);
      if (!user || !user.is_active || user.token_version !== socket.data.tokenVersion) { socket.disconnect(true); continue; }
      socket.data.user = user;
    } catch (error) {
      console.error('[Socket.io] Yetki tazeleme hatası:', error.message);
    }
  }
}, SOCKET_REFRESH_MS).unref();

// Müşteri QR menüsü için oturumsuz kanal: bağlantı yalnızca geçerli masa QR anahtarıyla kabul edilir
// ve o masanın odasına katılır. Bu kanaldan veri gönderilmez; yalnızca "siparişler değişti" sinyali gider,
// müşteri ekranı da kendi siparişlerini her zamanki public API'den yeniden çeker.
const menuIo = io.of('/menu');
menuIo.use(async (socket, next) => {
  try {
    const table = await findTable(socket.handshake.auth?.token);
    if (!table) return next(new Error('INVALID_QR'));
    socket.join(`table:${table.id}`);
    next();
  } catch (error) {
    next(new Error('INVALID_QR'));
  }
});

// Bir masanın siparişlerini etkileyen olaylar (onay/red, mutfak durumu, ödeme, masa taşıma…)
const MENU_SIGNAL_EVENTS = new Set(['table:updated', 'order:updated', 'order:created', 'order:completed', 'qr:request']);

// Para/müşteri bilgisi taşıyan olaylar yalnızca ilgili yetkiye sahip bağlantılara gönderilir
// (ör. mutfak ekranı tahsilat tutarlarını ve müşteri bakiyelerini almaz). Listede olmayan olaylar herkese gider.
const EVENT_PERMISSIONS = {
  'payment:completed': ['payment.view', 'reports.view', 'customers.view'],
  'customer:updated': ['customers.view'],
  'order:completed': ['pos.view', 'reports.view'],
  'waste:changed': ['waste.view'],
  'cashbook:changed': ['cashbook.view'],
  'qr:request': ['pos.view']
};
const socketEmitter = {
  emit(event, data) {
    const tableId = Number(data?.tableId);
    if (MENU_SIGNAL_EVENTS.has(event) && tableId) menuIo.to(`table:${tableId}`).emit('menu:orders-changed');
    if (event === 'qr:settings') menuIo.emit('menu:settings-changed'); // açık menüler sipariş açık/kapalı bilgisini yeniler

    const perms = EVENT_PERMISSIONS[event];
    if (!perms) return io.emit(event, data);
    for (const socket of io.sockets.sockets.values()) {
      if (canAny(socket.data.user, perms)) socket.emit(event, data);
    }
    return true;
  }
};

// Yayıncıyı express req nesnesine ekle
app.use((req, res, next) => {
  req.io = socketEmitter;
  next();
});

// Sağlık kontrolü (oturum gerektirmez). Saat bilgisi, sunucunun işletme saatinde çalıştığını doğrulamak içindir.
app.get('/api/health', async (req, res) => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  let dbTime = null;
  try {
    const [[row]] = await pool.query("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') AS t");
    dbTime = row.t;
  } catch { /* veritabanına ulaşılamıyor */ }
  res.json({
    status: 'ok',
    time: d,
    timezone: APP_TIMEZONE,
    local_time: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    db_time: dbTime
  });
});

// Müşteri menüsü alan adı (MENU_HOST, ör. ozgensoykafeterya.com): bu adresten yalnızca QR menü ve onun herkese açık
// API'si kullanılabilir; personel girişi ve personel API'si yalnızca panel adresinden (ör. panel.ozgensoykafeterya.com) açılır.
const MENU_HOSTS = (process.env.MENU_HOST || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
const isMenuHost = (req) => MENU_HOSTS.includes(String(req.hostname || '').toLowerCase());
app.use('/api', (req, res, next) => {
  if (isMenuHost(req) && !req.path.startsWith('/public') && req.path !== '/health') {
    return res.status(404).json({ success: false, message: 'Bulunamadı' });
  }
  next();
});

// Giriş rotaları (login herkese açık; diğerleri kendi içinde oturum ister)
app.use('/api/auth', authRoutes);

// QR menü (müşteri): oturum gerektirmez; yalnızca menü, masaya sipariş isteği ve sipariş durumu
app.use('/api/public', publicRoutes);

// Buradan sonraki tüm API rotaları geçerli oturum ister; yetki kontrolleri rota dosyalarındadır
app.use('/api', requireAuth);

// Rotalar
app.use('/api/tables', tableRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/qr-orders', qrOrderRoutes);
app.use('/api/cashbook', cashBookRoutes);
app.use('/api/backups', backupRoutes);

// Canlı kurulum: derlenmiş arayüz (frontend/dist) aynı sunucudan, aynı porttan sunulur (ayrıca web sunucusu gerekmez).
//  /m/<masa-anahtarı> → müşteri QR menüsü (menu.html) · diğer tüm adresler → personel paneli (index.html)
// Menü alan adında panel sayfaları açılmaz; kök adres de menüyü (QR okutun mesajı) gösterir.
const DIST_DIR = path.resolve(__dirname, '../../frontend/dist');
if (process.env.SERVE_FRONTEND !== 'false' && fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  // Dosya adları içerik özetli (assets/*-<hash>.js) olduğundan uzun süre önbelleklenir; HTML her zaman tazelenir
  app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), { maxAge: '365d', immutable: true }));
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  const sendPage = (file) => (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, file));
  };
  app.get(/^\/m\/[A-Za-z0-9_-]+\/?$/, sendPage('menu.html'));
  app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (req, res, next) =>
    (isMenuHost(req) ? sendPage('menu.html') : sendPage('index.html'))(req, res, next));
  console.log(`[Sunucu] Arayüz bu sunucudan sunuluyor: ${DIST_DIR}`);
}

// Ara katmanlardan fırlayan hatalar (ör. görsel yükleme: dosya türü/boyutu, bozuk JSON) HTML yerine JSON döner
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Görsel en fazla 10 MB olabilir.' : 'Görsel yüklenemedi.';
    return res.status(400).json({ success: false, message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'İstek verisi okunamadı (geçersiz JSON).' });
  }
  if (err?.message?.startsWith('Sadece resim dosyaları')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error('Beklenmeyen sunucu hatası:', err);
  res.status(500).json({ success: false, message: 'Sunucu hatası' });
});

const PORT = process.env.PORT || 5000;

// Veritabanını başlat ve sunucuyu dinlemeye al
async function startServer() {
  try {
    console.log('[Sunucu] Veritabanı başlatılıyor...');
    await initDatabase();
    await ensureThumbnails(); // Eski görsellerin küçük kopyalarını tamamla
    startDailyClosingScheduler(socketEmitter); // Gece 00:00'dan sonra önceki günün cirosu kasa defterine işlenir
    startBackupScheduler(); // Günde bir veritabanı yedeği
    server.listen(PORT, () => {
      console.log(`🚀 Kafe Otomasyon Backend çalışıyor: ${/^\d+$/.test(String(PORT)) ? `http://localhost:${PORT}` : PORT}`);
    });
  } catch (error) {
    console.error('Sunucu başlatılamadı:', error.message);
    // Yarım açık (istek kabul etmeyen) süreç bırakma; nodemon/pm2 hatayı görsün
    process.exit(1);
  }
}

startServer();
