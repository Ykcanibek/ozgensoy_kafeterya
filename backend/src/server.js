import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { initDatabase } from './models/initDb.js';
import authRoutes from './routes/authRoutes.js';
import tableRoutes from './routes/tableRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import roleRoutes from './routes/roleRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS ayarları
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
}));

app.use(express.json());

// Statik Görsel Dosya Servisi (Kategori & Ürün WebP görselleri için yüksek performanslı önbellek)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), {
  maxAge: '7d',
  etag: true
}));

// Socket.io yapılandırması
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
  console.log(`[Socket.io] Yeni istemci bağlandı: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] İstemci ayrıldı: ${socket.id}`);
  });
});

// io örneğini express req nesnesine ekle
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Rotalar
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/roles', roleRoutes);

// Test/Sağlık kontrolü
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

const PORT = process.env.PORT || 5000;

// Veritabanını başlat ve sunucuyu dinlemeye al
async function startServer() {
  try {
    console.log('[Sunucu] Veritabanı başlatılıyor...');
    await initDatabase();
    server.listen(PORT, () => {
      console.log(`🚀 Kafe Otomasyon Backend çalışıyor: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Sunucu başlatılamadı:', error.message);
  }
}

startServer();
