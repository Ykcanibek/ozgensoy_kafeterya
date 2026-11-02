import express from 'express';
import { getWasteRecords, getWasteOptions, createWasteRecord, deleteWasteRecord } from '../controllers/wasteController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Fire & Zayi kayıtları ve özeti
router.get('/', requirePermission('waste.view'), getWasteRecords);

// Kayıt formu seçenekleri (menü ürünleri, nedenler, birimler)
router.get('/options', requirePermission('waste.create'), getWasteOptions);

router.post('/', requirePermission('waste.create'), createWasteRecord);
router.delete('/:id', requirePermission('waste.delete'), deleteWasteRecord);

export default router;
