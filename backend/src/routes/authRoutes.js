import express from 'express';
import { login, getMe, getUsersList, changeOwnPassword } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', requireAuth, getMe);
router.get('/users', requireAuth, getUsersList);
router.put('/password', requireAuth, changeOwnPassword);

export default router;
