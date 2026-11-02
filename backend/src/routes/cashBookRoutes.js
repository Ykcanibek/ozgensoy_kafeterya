import express from 'express';
import {
  getCashBook, getCashBookOptions, createEntry, updateEntry, deleteEntry,
  createCategory, updateCategory, exportCashBook, getClosing, runPendingClosings, recalculateClosing
} from '../controllers/cashBookController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Defter (filtreli liste + özetler) ve form/filtre seçenekleri
router.get('/', requirePermission('cashbook.view'), getCashBook);
router.get('/options', requirePermission('cashbook.view'), getCashBookOptions);
router.get('/export', requirePermission('cashbook.export'), exportCashBook);

// Gün sonu ciro kayıtları (gece otomatik oluşur; rapor görüntüleme, eksik günleri şimdi işleme, yeniden hesaplama)
router.get('/closings/:date', requirePermission('cashbook.view'), getClosing);
router.post('/closings/run', requirePermission('cashbook.edit'), runPendingClosings);
router.post('/closings/:date/recalculate', requirePermission('cashbook.edit'), recalculateClosing);

// Kategoriler (ekleme / yeniden adlandırma / pasife alma)
router.post('/categories', requirePermission('cashbook.edit'), createCategory);
router.put('/categories/:id', requirePermission('cashbook.edit'), updateCategory);

// Kayıtlar — düzenleme/silme: ilgili yetki ya da kaydı girenin aynı gün kendi kaydı (controller içinde)
router.post('/', requirePermission('cashbook.create'), createEntry);
router.put('/:id', requirePermission('cashbook.create', 'cashbook.edit'), updateEntry);
router.delete('/:id', requirePermission('cashbook.create', 'cashbook.delete'), deleteEntry);

export default router;
