import express from 'express';
import { 
  getCategories, 
  createCategory, 
  updateCategory, 
  toggleCategoryStatus, 
  toggleCategoryQrStatus,
  deleteCategory, 
  reorderCategories,
  getCategoryHistory
} from '../controllers/categoryController.js';
import { uploadMiddleware } from '../config/upload.js';

const router = express.Router();

// Kategorileri listele (?active_only=true destekler)
router.get('/', getCategories);

// Yeni kategori ekle (Tekil görsel yükleme destekler: 'image' alanı)
router.post('/', uploadMiddleware.single('image'), createCategory);

// Sürükle bırak ile kategorileri toplu sırala
router.post('/reorder', reorderCategories);

// Kategori güncelle (Tekil görsel yükleme destekler: 'image' alanı)
router.put('/:id', uploadMiddleware.single('image'), updateCategory);

// Aktif / Pasif toggle
router.patch('/:id/status', toggleCategoryStatus);

// QR Menü Açık / Kapalı toggle (Yeşil / Kırmızı)
router.patch('/:id/qr-status', toggleCategoryQrStatus);

// Belirli bir kategorinin değişiklik geçmişi
router.get('/:id/history', getCategoryHistory);

// Soft delete (status = -1, ürün varsa engeller)
router.delete('/:id', deleteCategory);

export default router;
