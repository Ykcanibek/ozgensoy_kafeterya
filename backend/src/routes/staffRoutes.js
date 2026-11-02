import express from 'express';
import {
  getStaffList,
  createStaff,
  updateStaff,
  toggleStaffStatus,
  resetStaffPassword,
  deleteStaff
} from '../controllers/staffController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Rol atama/değiştirme ayrıca staff.assign_role ister (controller içinde)
router.get('/', requirePermission('staff.view'), getStaffList);
router.post('/', requirePermission('staff.create'), createStaff);
router.put('/:id', requirePermission('staff.edit'), updateStaff);
router.patch('/:id/status', requirePermission('staff.edit'), toggleStaffStatus);
router.put('/:id/password', requirePermission('staff.edit'), resetStaffPassword);
router.delete('/:id', requirePermission('staff.delete'), deleteStaff);

export default router;
