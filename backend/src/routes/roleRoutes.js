import express from 'express';
import {
  getRoles,
  getRoleById,
  getPermissionsCatalog,
  createRole,
  updateRole,
  deleteRole
} from '../controllers/roleController.js';

const router = express.Router();

router.get('/', getRoles);
router.get('/permissions-catalog', getPermissionsCatalog);
router.get('/:id', getRoleById);
router.post('/', createRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

export default router;
