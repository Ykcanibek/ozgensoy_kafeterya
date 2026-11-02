import express from 'express';
import {
  getQrRequests, approveQrRequest, rejectQrRequest, regenerateTableQr, getQrSettings, updateQrSettings
} from '../controllers/qrOrderController.js';
import { requirePermission } from '../middleware/auth.js';

// QR menü siparişleri (personel tarafı)
const router = express.Router();

// QR'dan sipariş alma açık/kapalı (görmek: masalar; değiştirmek: salon düzeni yetkisi)
router.get('/settings', requirePermission('pos.view'), getQrSettings);
router.put('/settings', requirePermission('tables.edit'), updateQrSettings);

router.get('/', requirePermission('pos.view'), getQrRequests);
router.post('/:id/approve', requirePermission('pos.order'), approveQrRequest);
router.post('/:id/reject', requirePermission('pos.order'), rejectQrRequest);

// Masanın QR kodunu yenileme (eski basılı kod geçersiz olur)
router.post('/tables/:tableId/regenerate', requirePermission('tables.edit'), regenerateTableQr);

export default router;
