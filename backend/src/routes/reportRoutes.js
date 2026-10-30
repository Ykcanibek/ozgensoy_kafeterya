import express from 'express';
import {
  getStaffPerformance,
  getAuditLogs,
  getEntityHistory,
  getSummaryStats,
  getReceiptsList,
  getReceiptDetail
} from '../controllers/reportController.js';

const router = express.Router();

// Personel Satış, Tahsilat, İkram, İade, İptal Karnesi
router.get('/staff-performance', getStaffPerformance);

// Genel Denetim İzi & Canlı Hareket Günlüğü
router.get('/audit-logs', getAuditLogs);

// Tek Bir Varlık İçin (Ürün, Kategori vb.) Değişiklik Geçmişi
router.get('/history/:entityType/:entityId', getEntityHistory);

// Gün Sonu & Finansal Özet (KPI'lar, Kategoriler, Çok Satanlar, Saatlik)
router.get('/summary', getSummaryStats);

// Adisyon / Fiş Listesi
router.get('/receipts', getReceiptsList);

// Tek Fiş Detayı ve Ürün Kalemleri
router.get('/receipt/:paymentId', getReceiptDetail);

export default router;
