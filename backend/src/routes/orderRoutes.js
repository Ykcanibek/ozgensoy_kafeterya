import express from 'express';
import {
  getTableOrder,
  saveTableOrder,
  updateOrderItem,
  updateOrderItemStatus,
  deleteOrderItem,
  closeTablePayment,
  reversePayment,
  getOrderReceipt,
  getPaymentReceipt,
  getReceiptSettings,
  updateReceiptSettings,
  getClosedReceipts,
  getKitchenOrders,
  deliverAllTableItems,
  transferTable
} from '../controllers/orderController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Mutfak Ekranı (KDS) Aktif Siparişleri
router.get('/kitchen', requirePermission('kitchen.view'), getKitchenOrders);

// Masadaki tüm ürünleri tek tıkla teslim et (Mutfak Ekranı)
router.put('/kitchen/table/:tableId/deliver-all', requirePermission('kitchen.update', 'pos.deliver'), deliverAllTableItems);

// Masanın açık sipariş ve ürünlerini getir
router.get('/table/:tableId', requirePermission('pos.view'), getTableOrder);

// Masaya yeni sipariş ekle (Mutfağa Gönder / Kaydet)
router.post('/table/:tableId', requirePermission('pos.order'), saveTableOrder);

// Sipariş kaleminin durumunu güncelle — gereken yetki hedef duruma göre controller içinde belirlenir
// (teslim / mutfak durumu / iptal / iade / ikram)
router.put('/items/:itemId/status', updateOrderItemStatus);

// Sipariş kaleminin adet veya notunu güncelle
router.put('/items/:itemId', requirePermission('pos.item_edit'), updateOrderItem);

// Sipariş kalemini sil
router.delete('/items/:itemId', requirePermission('pos.item_delete'), deleteOrderItem);

// Masa taşıma / birleştirme (hedef masa boşsa taşır, doluysa adisyonları birleştirir)
router.post('/table/:tableId/transfer', requirePermission('pos.transfer'), transferTable);

// Masanın ödemesini al ve masayı kapat — ödeme türü, indirim ve bahşiş yetkileri controller içinde kontrol edilir
router.post('/table/:tableId/pay', requirePermission('payment.view'), closeTablePayment);

// Açık masada bugün alınan bir tahsilatı nedenini yazarak geri al
router.post('/payments/:paymentId/reverse', requirePermission('payment.void'), reversePayment);

// Otomatik fiş ayarı (hesap kapanınca fiş penceresi açılsın mı)
router.get('/receipt-settings', requirePermission('pos.view'), getReceiptSettings);
router.put('/receipt-settings', requirePermission('payment.print'), updateReceiptSettings);

// Bir günde kapanan hesaplar (unutulan / sonradan istenen fişi yazdırmak için)
router.get('/closed-receipts', requirePermission('payment.print'), getClosedReceipts);

// Müşteri fişleri: masanın tüm hesabı (kapanınca) ve tek bir ara ödeme
router.get('/:orderId/receipt', requirePermission('payment.print'), getOrderReceipt);
router.get('/payments/:paymentId/receipt', requirePermission('payment.print'), getPaymentReceipt);

export default router;
