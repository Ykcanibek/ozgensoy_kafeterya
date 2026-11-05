import express from 'express';
import { getBackups, runBackup, downloadBackup, downloadUploads } from '../controllers/backupController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(requirePermission('reports.backup'));
router.get('/', getBackups);
router.post('/', runBackup);
router.get('/uploads/download', downloadUploads);
router.get('/:name/download', downloadBackup);

export default router;
