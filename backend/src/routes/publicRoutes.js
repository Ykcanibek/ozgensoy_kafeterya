import express from 'express';
import { getPublicMenu, createPublicOrder, getPublicOrders } from '../controllers/publicMenuController.js';

// QR menü: oturum gerektirmez. Yalnızca menüyü gösterir, o masaya sipariş isteği alır ve sipariş durumunu verir.
const router = express.Router();

router.get('/menu/:token', getPublicMenu);
router.get('/menu/:token/orders', getPublicOrders);
router.post('/menu/:token/orders', createPublicOrder);

export default router;
