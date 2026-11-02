import express from 'express';
import {
  getProducts,
  createProduct,
  updateProduct,
  toggleProductStatus,
  toggleProductQrStatus,
  deleteProduct,
  reorderProducts,
  exportProductsToExcel,
  getProductHistory
} from '../controllers/productController.js';
import { uploadMiddleware } from '../config/upload.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Ürünleri listele (?category_id=X ve ?active_only=true filtreleri destekler) — POS menüsü de kullanır.
// Maliyet fiyatı yalnızca products.view_cost yetkisi olanlara gönderilir (controller içinde).
router.get('/', requirePermission('pos.view', 'products.view'), getProducts);

// Şık Excel (.xlsx) Olarak Dışa Aktar (GET ve POST destekler)
router.get('/export-excel', requirePermission('products.export'), exportProductsToExcel);
router.post('/export-excel', requirePermission('products.export'), exportProductsToExcel);

// Belirli bir ürünün değişiklik geçmişi (Timeline)
router.get('/:id/history', requirePermission('products.view'), getProductHistory);

// Yeni ürün ekle (Görsel opsiyonel: 'image' alanı)
router.post('/', requirePermission('products.create'), uploadMiddleware.single('image'), createProduct);

// Sürükle bırak ile ürünleri toplu sırala
router.post('/reorder', requirePermission('products.edit'), reorderProducts);

// Ürün güncelle (Görsel opsiyonel: 'image' alanı); fiyat değişikliği ayrıca products.price ister
router.put('/:id', requirePermission('products.edit'), uploadMiddleware.single('image'), updateProduct);

// Aktif / Pasif durum toggle
router.patch('/:id/status', requirePermission('products.edit'), toggleProductStatus);

// QR Menü Açık / Kapalı durum toggle
router.patch('/:id/qr-status', requirePermission('products.edit'), toggleProductQrStatus);

// Soft delete (status = -1)
router.delete('/:id', requirePermission('products.delete'), deleteProduct);

export default router;
