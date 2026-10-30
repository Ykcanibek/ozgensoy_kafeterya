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

const router = express.Router();

// 1. Müşteri listesi ve istatistikler
router.get('/', getCustomers);

// 2. Yeni müşteri oluştur
router.post('/', createCustomer);

// 3. Müşteri detayı ve hesap hareketleri
router.get('/:id', getCustomerById);

// 4. Müşteri bilgilerini güncelle
router.put('/:id', updateCustomer);

// 5. Müşteriyi sil veya arşivle
router.delete('/:id', deleteCustomer);

// 6. Müşteriden doğrudan borç tahsilatı yap
router.post('/:id/payments', createCustomerPayment);

// 7. Müşteri borcunu sıfırla (İşletme inisiyatifi)
router.post('/:id/reset-debt', resetCustomerDebt);

export default router;
