import express from 'express';
import {
  getCustomers,
  createCustomer,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  createCustomerPayment,
  resetCustomerDebt
} from '../controllers/customerController.js';
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();

// 1. Müşteri listesi ve istatistikler (POS veresiye seçimi de kullanır)
router.get('/', requirePermission('customers.view'), getCustomers);

// 2. Yeni müşteri oluştur
router.post('/', requirePermission('customers.create'), createCustomer);

// 3. Müşteri detayı ve hesap hareketleri
router.get('/:id', requirePermission('customers.view'), getCustomerById);

// 4. Müşteri bilgilerini güncelle
router.put('/:id', requirePermission('customers.edit'), updateCustomer);

// 5. Müşteriyi sil veya arşivle
router.delete('/:id', requirePermission('customers.delete'), deleteCustomer);

// 6. Müşteriden doğrudan borç tahsilatı yap
router.post('/:id/payments', requirePermission('customers.collect'), createCustomerPayment);

// 7. Müşteri borcunu sıfırla (İşletme inisiyatifi)
router.post('/:id/reset-debt', requirePermission('customers.debt_reset'), resetCustomerDebt);

export default router;
