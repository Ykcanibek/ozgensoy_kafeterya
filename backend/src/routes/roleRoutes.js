import express from 'express';
import {
  getRoles,
  getRoleById,
  getPermissionsCatalog,
  createRole,
  updateRole,
  deleteRole
} from '../controllers/roleController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Rol listesi personel sayfasındaki rol seçimi için de kullanılır
router.get('/', requirePermission('roles.view', 'staff.view'), getRoles);
router.get('/permissions-catalog', requirePermission('roles.view'), getPermissionsCatalog);
router.get('/:id', requirePermission('roles.view'), getRoleById);
router.post('/', requirePermission('roles.create'), createRole);
router.put('/:id', requirePermission('roles.edit'), updateRole);
router.delete('/:id', requirePermission('roles.delete'), deleteRole);

export default router;
