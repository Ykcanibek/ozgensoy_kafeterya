import express from 'express';
import { getTables, createTable, updateTable, deleteTable, reorderTables } from '../controllers/tableController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requirePermission('pos.view'), getTables);
router.post('/', requirePermission('tables.create'), createTable);
router.post('/reorder', requirePermission('tables.edit'), reorderTables);
// Ad değişikliği tables.edit, masayı boşaltma pos.close_empty ister (controller içinde ayrıştırılır)
router.put('/:id', requirePermission('tables.edit', 'pos.close_empty'), updateTable);
router.delete('/:id', requirePermission('tables.delete'), deleteTable);

export default router;
