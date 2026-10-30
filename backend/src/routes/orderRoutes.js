import express from 'express';
import {
  getTableOrder,
  saveTableOrder,
  updateOrderItem,
  updateOrderItemStatus,
  deleteOrderItem,
  closeTablePayment,
  getKitchenOrders,
  deliverAllTableItems
} from '../controllers/orderController.js';

const router = express.Router();

// Mutfak Ekranı (KDS) Aktif Siparişleri
router.get('/kitchen', getKitchenOrders);

// Masadaki tüm ürünleri tek tıkla teslim et (Mutfak Ekranı)
router.put('/kitchen/table/:tableId/deliver-all', deliverAllTableItems);

// Masanın açık sipariş ve ürünlerini getir
router.get('/table/:tableId', getTableOrder);

// Masaya yeni sipariş ekle (Mutfağa Gönder / Kaydet)
router.post('/table/:tableId', saveTableOrder);

// Sipariş kaleminin durumunu güncelle (pending, preparing, ready, delivered)
router.put('/items/:itemId/status', updateOrderItemStatus);

// Sipariş kaleminin adet veya notunu güncelle
router.put('/items/:itemId', updateOrderItem);

// Sipariş kalemini sil
router.delete('/items/:itemId', deleteOrderItem);

// Masanın ödemesini al ve masayı kapat
router.post('/table/:tableId/pay', closeTablePayment);

export default router;
