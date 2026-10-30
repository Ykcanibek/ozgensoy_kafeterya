import express from 'express';
import { login, getMe, getUsersList } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.get('/me', getMe);
router.get('/users', getUsersList);

export default router;
