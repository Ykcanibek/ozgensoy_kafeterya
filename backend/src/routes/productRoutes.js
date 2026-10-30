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

const router = express.Router();

// Ürünleri listele (?category_id=X ve ?active_only=true filtreleri destekler)
router.get('/', getProducts);

// Şık Excel (.xlsx) Olarak Dışa Aktar (GET ve POST destekler)
router.get('/export-excel', exportProductsToExcel);
router.post('/export-excel', exportProductsToExcel);

// Belirli bir ürünün değişiklik geçmişi (Timeline)
router.get('/:id/history', getProductHistory);

// Yeni ürün ekle (Görsel opsiyonel: 'image' alanı)
router.post('/', uploadMiddleware.single('image'), createProduct);

// Sürükle bırak ile ürünleri toplu sırala
router.post('/reorder', reorderProducts);

// Ürün güncelle (Görsel opsiyonel: 'image' alanı)
router.put('/:id', uploadMiddleware.single('image'), updateProduct);

// Aktif / Pasif durum toggle
router.patch('/:id/status', toggleProductStatus);

// QR Menü Açık / Kapalı durum toggle
router.patch('/:id/qr-status', toggleProductQrStatus);

// Soft delete (status = -1)
router.delete('/:id', deleteProduct);

export default router;
