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
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Kategorileri listele (?active_only=true destekler) — POS menüsü ve ürün sayfası da kullanır
router.get('/', requirePermission('pos.view', 'categories.view', 'products.view'), getCategories);

// Yeni kategori ekle (Tekil görsel yükleme destekler: 'image' alanı)
router.post('/', requirePermission('categories.create'), uploadMiddleware.single('image'), createCategory);

// Sürükle bırak ile kategorileri toplu sırala
router.post('/reorder', requirePermission('categories.edit'), reorderCategories);

// Kategori güncelle (Tekil görsel yükleme destekler: 'image' alanı)
router.put('/:id', requirePermission('categories.edit'), uploadMiddleware.single('image'), updateCategory);

// Aktif / Pasif toggle
router.patch('/:id/status', requirePermission('categories.edit'), toggleCategoryStatus);

// QR Menü Açık / Kapalı toggle (Yeşil / Kırmızı)
router.patch('/:id/qr-status', requirePermission('categories.edit'), toggleCategoryQrStatus);

// Belirli bir kategorinin değişiklik geçmişi
router.get('/:id/history', requirePermission('categories.view'), getCategoryHistory);

// Soft delete (status = -1, ürün varsa engeller)
router.delete('/:id', requirePermission('categories.delete'), deleteCategory);

export default router;
