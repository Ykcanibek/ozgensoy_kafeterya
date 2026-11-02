import express from 'express';
import { getAuditLogs, getEntityHistory } from '../controllers/reportController.js';
import {
  getSalesSummary,
  getProductSales,
  getClosedOrders,
  getOrderDetail,
  getStaffReport,
  getAdjustments,
  getTablePerformance,
  getReceivables
} from '../controllers/salesReportController.js';
import { requirePermission, can, deny } from '../middleware/auth.js';

const router = express.Router();

// Bugün dışındaki tarih aralıkları (dün, hafta, ay, özel, tümü) reports.history yetkisi ister
const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (sunucu yerel saati)
const requireTodayOrHistory = (req, res, next) => {
  const { startDate, endDate } = req.query;
  const today = todayStr();
  const isTodayOnly = startDate === today && endDate === today;
  if (isTodayOnly || can(req.user, 'reports.history')) return next();
  return deny(res, 'reports.history');
};

// Özet: satış (brüt → net), tahsilat, önceki dönem karşılaştırması, trend, kategori, en çok satanlar
router.get('/sales-summary', requirePermission('reports.view'), requireTodayOrHistory, getSalesSummary);

// Ürün satışları (maliyet/kâr yalnızca products.view_cost ile)
router.get('/products', requirePermission('reports.view'), requireTodayOrHistory, getProductSales);

// Kapanan adisyonlar ve adisyon detayı
router.get('/orders', requirePermission('reports.receipts'), requireTodayOrHistory, getClosedOrders);
router.get('/orders/:orderId', requirePermission('reports.receipts'), getOrderDetail);

// Personel karnesi
router.get('/staff', requirePermission('reports.staff'), requireTodayOrHistory, getStaffReport);

// İkram / iade / iptal / indirim / borç silme kayıtları
router.get('/adjustments', requirePermission('reports.treats'), requireTodayOrHistory, getAdjustments);

// Masa performansı
router.get('/tables', requirePermission('reports.view'), requireTodayOrHistory, getTablePerformance);

// Cari hesaplar (açık alacak listesi müşteri görme yetkisi de ister)
router.get('/receivables', requirePermission('reports.view'), requirePermission('customers.view'), requireTodayOrHistory, getReceivables);

// Genel denetim izi & canlı hareket günlüğü
router.get('/audit-logs', requirePermission('reports.audit'), requireTodayOrHistory, getAuditLogs);

// Tek bir varlık için (ürün, kategori vb.) değişiklik geçmişi
router.get('/history/:entityType/:entityId', requirePermission('products.view', 'categories.view', 'reports.audit'), getEntityHistory);

export default router;
