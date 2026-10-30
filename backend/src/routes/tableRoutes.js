import express from 'express';
import { getTables, createTable, updateTable, deleteTable, reorderTables } from '../controllers/tableController.js';

const router = express.Router();

router.get('/', getTables);
router.post('/', createTable);
router.post('/reorder', reorderTables);
router.put('/:id', updateTable);
router.delete('/:id', deleteTable);

export default router;
