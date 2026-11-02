import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { can, deny } from '../middleware/auth.js';

/**
 * Baş harfleri Türkçe kurallarına uygun şekilde büyük harfe dönüştürür (Title Case)
 * Örn: "ahmet can yılmaz" -> "Ahmet Can Yılmaz"
 */
export const formatTitleCase = (str) => {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1).toLocaleLowerCase('tr-TR');
    })
    .join(' ');
};

/**
 * Telefon numarasını temizler ve başının '0' ile başlamasını garanti eder
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return '0';
  let cleaned = phone.replace(/[^\d]/g, '');
  if (!cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
};

/**
 * 1. Tüm Müşterileri Listele (Arama, Bakiye, İstatistikler)
 * Query: ?search=...&status=active|all
 */
export const getCustomers = async (req, res) => {
  try {
    const { search, status = 'active' } = req.query;

    let whereClause = status === 'all' ? '1=1' : 'c.is_active = TRUE';
    const params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClause += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.notes LIKE ?)';
      params.push(q, q, q);
    }

    const query = `
      SELECT 
        c.*,
        u.name AS created_by_user_name,
        (SELECT MAX(created_at) FROM customer_transactions WHERE customer_id = c.id) AS last_transaction_at,
        (SELECT COUNT(id) FROM customer_transactions WHERE customer_id = c.id) AS total_transactions_count
      FROM customers c
      LEFT JOIN users u ON c.created_by_user_id = u.id
      WHERE ${whereClause}
      ORDER BY c.current_balance DESC, c.name ASC
    `;

    const [customers] = await pool.query(query, params);

    // Genel Cari İstatistikleri
    const [statsResult] = await pool.query(`
      SELECT 
        COUNT(id) AS total_customers_count,
        COALESCE(SUM(current_balance), 0.00) AS total_receivables,
        COALESCE(SUM(total_debt), 0.00) AS total_debt_accumulated,
        COALESCE(SUM(total_paid), 0.00) AS total_collected
      FROM customers
      WHERE is_active = TRUE
    `);

    res.json({
      success: true,
      customers,
      stats: statsResult[0] || {
        total_customers_count: 0,
        total_receivables: 0,
        total_debt_accumulated: 0,
        total_collected: 0
      }
    });
  } catch (error) {
    console.error('Müşteri listesi hatası:', error);
    res.status(500).json({ success: false, message: 'Müşteriler alınamadı: ' + error.message });
  }
};

/**
 * 2. Yeni Müşteri Oluştur
 * Body: { name, phone, notes }
 */
export const createCustomer = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { name, phone, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Müşteri adı zorunludur.' });
    }

    const formattedName = formatTitleCase(name);
    let formattedPhone = phone ? formatPhoneNumber(phone) : '0';
    if (formattedPhone === '0' || formattedPhone.length <= 1) {
      formattedPhone = null; // Sadece boş 0 ise null kaydet
    }

    const cleanNotes = notes ? notes.trim() : null;

    // Aynı isimde aktif müşteri kontrolü
    const [existing] = await pool.query(
      'SELECT id, name FROM customers WHERE name = ? AND is_active = TRUE LIMIT 1',
      [formattedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `"${formattedName}" adında bir müşteri zaten mevcut.` 
      });
    }

    const [result] = await pool.query(
      `INSERT INTO customers (name, phone, notes, created_by_user_id) 
       VALUES (?, ?, ?, ?)`,
      [formattedName, formattedPhone, cleanNotes, user.id]
    );

    const newCustomerId = result.insertId;

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'customer',
      entityId: newCustomerId,
      actionType: 'customer_created',
      title: `Yeni Müşteri Eklendi: ${formattedName}`,
      details: `${user.name} tarafından yeni cari/müşteri kartı açıldı.${formattedPhone ? ` Telefon: ${formattedPhone}` : ''}${cleanNotes ? ` Not: ${cleanNotes}` : ''}`
    });

    const [newCustomerRows] = await pool.query('SELECT * FROM customers WHERE id = ?', [newCustomerId]);

    res.status(201).json({
      success: true,
      message: 'Müşteri başarıyla eklendi.',
      customer: newCustomerRows[0]
    });
  } catch (error) {
    console.error('Müşteri ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Müşteri eklenemedi: ' + error.message });
  }
};

/**
 * 3. Müşteri Detayı ve Cari Ekstresi (Borçlar + Ürün Kalemleri + Tahsilatlar)
 */
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const [customerRows] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (customerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    const customer = customerRows[0];

    // Müşterinin cari hareketleri
    const [transactions] = await pool.query(`
      SELECT 
        t.*,
        o.order_number,
        o.created_at AS order_created_at
      FROM customer_transactions t
      LEFT JOIN orders o ON t.order_id = o.id
      WHERE t.customer_id = ?
      ORDER BY t.created_at DESC, t.id DESC
    `, [id]);

    // Eğer veresiye borcu olan bir işlemde sipariş varsa, o siparişin kalemlerini de getir
    const orderIds = transactions.filter(t => t.order_id).map(t => t.order_id);
    let itemsByOrderId = {};

    if (orderIds.length > 0) {
      const [orderItemRows] = await pool.query(`
        SELECT 
          oi.id,
          oi.order_id,
          oi.quantity,
          oi.unit_price,
          oi.total_price,
          oi.item_status,
          oi.note,
          p.name AS product_name
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
        ORDER BY oi.id ASC
      `, orderIds);

      orderItemRows.forEach(item => {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }
        itemsByOrderId[item.order_id].push(item);
      });
    }

    // Her harekete ilgili ürünleri iliştir
    const populatedTransactions = transactions.map(t => ({
      ...t,
      order_items: t.order_id ? (itemsByOrderId[t.order_id] || []) : []
    }));

    res.json({
      success: true,
      customer,
      transactions: populatedTransactions
    });
  } catch (error) {
    console.error('Müşteri detay hatası:', error);
    res.status(500).json({ success: false, message: 'Müşteri detayları alınamadı: ' + error.message });
  }
};

/**
 * 4. Müşteri Bilgilerini Güncelle
 */
export const updateCustomer = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { name, phone, notes } = req.body;

    const [customerRows] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (customerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    const currentCustomer = customerRows[0];
    const formattedName = name ? formatTitleCase(name) : currentCustomer.name;
    let formattedPhone = phone ? formatPhoneNumber(phone) : currentCustomer.phone;
    if (formattedPhone === '0' || formattedPhone.length <= 1) {
      formattedPhone = null;
    }
    const cleanNotes = notes !== undefined ? (notes ? notes.trim() : null) : currentCustomer.notes;

    await pool.query(
      `UPDATE customers 
       SET name = ?, phone = ?, notes = ? 
       WHERE id = ?`,
      [formattedName, formattedPhone, cleanNotes, id]
    );

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'customer',
      entityId: id,
      actionType: 'customer_updated',
      title: `Müşteri Bilgileri Güncellendi: ${formattedName}`,
      details: `${user.name} tarafından ${currentCustomer.name} müşterisinin bilgileri güncellendi.`
    });

    const [updatedRows] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Müşteri bilgileri güncellendi.',
      customer: updatedRows[0]
    });
  } catch (error) {
    console.error('Müşteri güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Güncellenemedi: ' + error.message });
  }
};

/**
 * 5. Müşteriyi Sil veya Pasife Al
 */
export const deleteCustomer = async (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;

    const [customerRows] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
    if (customerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    const customer = customerRows[0];
    const balance = parseFloat(customer.current_balance || 0);

    if (balance > 0.05) {
      return res.status(400).json({
        success: false,
        message: `Bu müşterinin ₺${balance.toFixed(2)} tutarında açık borcu bulunmaktadır. Borcu kapatılmadan müşteri silinemez.`
      });
    }

    // Veritabanından kesinlikle silinmez, soft-delete yapılarak is_active = FALSE ve deleted_at güncellenir
    await pool.query(
      `UPDATE customers 
       SET is_active = FALSE, deleted_at = NOW(), deleted_by_user_id = ? 
       WHERE id = ?`,
      [user.id || null, id]
    );

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'customer',
      entityId: id,
      actionType: 'customer_archived',
      title: `Müşteri Pasife Alındı / Arşivlendi: ${customer.name}`,
      details: `${user.name} tarafından ${customer.name} müşterisi pasife alındı (veritabanından silinmedi).`
    });

    res.json({
      success: true,
      message: 'Müşteri başarıyla pasife alındı / arşivlendi.'
    });
  } catch (error) {
    console.error('Müşteri silme hatası:', error);
    res.status(500).json({ success: false, message: 'Silinemedi: ' + error.message });
  }
};

/**
 * 6. Müşteriden Doğrudan Borç Tahsilatı Yap (Nakit, Kredi Kartı, Parçalı; Bahşiş & İndirim)
 * Body: { amount, payment_method, cash_amount, card_amount, discount, tip, notes }
 */
export const createCustomerPayment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { 
      amount, 
      payment_method = 'cash', 
      cash_amount = 0, 
      card_amount = 0, 
      discount = 0, 
      tip = 0, 
      notes 
    } = req.body;

    await connection.beginTransaction();

    const [customerRows] = await connection.query('SELECT * FROM customers WHERE id = ? FOR UPDATE', [id]);
    if (customerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    const customer = customerRows[0];
    const currentBalance = parseFloat(customer.current_balance || 0);

    if (currentBalance <= 0.05) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bu müşterinin ödenecek borcu bulunmuyor.' });
    }

    // settle_amount: Borçtan kapatılacak toplam tutar
    // discount: Yapılan indirim (kapatılacak tutardan düşer)
    // paidAmount: Kasaya fiilen giren net para = settle_amount - discount
    const discountVal = Math.max(0, parseFloat(discount || 0));
    const tipVal = 0.00; // Bahşiş veresiye tahsilatından kaldırıldı

    let settleAmount = parseFloat(req.body.settle_amount || 0);
    let paidAmount = 0;

    if (settleAmount > 0) {
      if (discountVal > settleAmount) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'İndirim tutarı kapatılacak borçtan fazla olamaz.' });
      }
      paidAmount = Math.max(0, settleAmount - discountVal);
    } else {
      // Geriye dönük uyumluluk
      const rawAmount = parseFloat(amount || 0);
      if (discountVal > 0 && rawAmount <= currentBalance) {
        settleAmount = rawAmount;
        paidAmount = Math.max(0, settleAmount - discountVal);
      } else {
        paidAmount = rawAmount;
        settleAmount = paidAmount + discountVal;
      }
    }

    if (settleAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Kapatılacak borç tutarı 0₺ den büyük olmalıdır.' });
    }

    if (settleAmount > currentBalance + 0.05) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Kapatılacak borç tutarı müşterinin mevcut borcundan (₺${currentBalance.toFixed(2)}) fazla olamaz.`
      });
    }

    // İndirim, masadaki tahsilatla aynı kurallara tabidir: indirim yetkisi ve rolün indirim üst sınırı.
    // (Aksi halde borcun tamamı "indirim" girilerek borç silme yetkisi olmadan sıfırlanabilirdi.)
    if (discountVal > 0) {
      if (!can(req.user, 'payment.discount')) {
        await connection.rollback();
        return deny(res, 'payment.discount');
      }
      const limit = req.user.role === 'admin' ? null : req.user.max_discount_percent;
      const maxDiscount = limit === null ? Infinity : Math.round(settleAmount * limit) / 100;
      if (discountVal > maxDiscount + 0.01) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          code: 'DISCOUNT_LIMIT',
          message: `İndirim sınırınızı aşıyor: rolünüz en fazla %${limit} (₺${maxDiscount.toFixed(2)}) indirim yapabilir. Borcun tamamını kapatmak için borç silme yetkisi gerekir.`
        });
      }
    }

    if (paidAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Tahsil edilecek tutar 0₺ den büyük olmalıdır.' });
    }

    // Nakit ve Kart Dağılımı (Fiilen tahsil edilecek net tutar üzerinden)
    if (!['cash', 'credit_card', 'mixed'].includes(payment_method)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Geçersiz ödeme yöntemi.' });
    }
    let cashPortion = 0;
    let cardPortion = 0;
    if (payment_method === 'cash') {
      cashPortion = paidAmount;
    } else if (payment_method === 'credit_card') {
      cardPortion = paidAmount;
    } else if (payment_method === 'mixed') {
      cashPortion = parseFloat(cash_amount || 0);
      cardPortion = parseFloat(card_amount || 0);
      if (cashPortion === 0 && cardPortion === 0) {
        cashPortion = paidAmount;
      }
      // Parçalar negatif olamaz ve toplamı tahsil edilen tutara eşit olmalı (kasa raporu bozulmasın)
      if (cashPortion < 0 || cardPortion < 0 || Math.abs(cashPortion + cardPortion - paidAmount) > 0.01) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Nakit ve kart tutarlarının toplamı tahsil edilen tutara (₺${paidAmount.toFixed(2)}) eşit olmalıdır.` });
      }
    }

    const cleanNotes = notes ? notes.trim() : null;

    // 1. payments tablosuna tahsilat kaydı at
    const [payResult] = await connection.query(
      `INSERT INTO payments (table_id, order_id, customer_id, total_amount, cash_amount, card_amount, discount, tip, payment_method, customer_name, notes, closed_by_user_id) 
       VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, paidAmount, cashPortion, cardPortion, discountVal, tipVal, payment_method, customer.name, cleanNotes, user.id]
    );

    // 2. customer_transactions tablosuna tahsilat hareketi at
    const [txResult] = await connection.query(
      `INSERT INTO customer_transactions (customer_id, transaction_type, amount, payment_method, cash_amount, card_amount, discount, tip, notes, created_by_user_id, created_by_user_name) 
       VALUES (?, 'payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, paidAmount, payment_method, cashPortion, cardPortion, discountVal, tipVal, cleanNotes, user.id, user.name]
    );

    // 3. Müşterinin toplam ödenen ve kalan bakiyesini güncelle
    const newBalance = Math.max(0, currentBalance - settleAmount);
    const newTotalPaid = parseFloat(customer.total_paid || 0) + paidAmount;

    await connection.query(
      `UPDATE customers 
       SET current_balance = ?, total_paid = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newBalance, newTotalPaid, customer.id]
    );

    await connection.commit();

    let methodDesc = payment_method === 'cash' ? 'Nakit' : payment_method === 'credit_card' ? 'Kredi Kartı' : 'Parçalı';

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'customer',
      entityId: customer.id,
      actionType: 'customer_payment_received',
      title: `Cari Tahsilat: ${customer.name} (₺${paidAmount.toFixed(2)})`,
      details: `${user.name} tarafından ${customer.name} müşterisinden ${methodDesc} tahsilat alındı. Kapatılan Borç: ₺${settleAmount.toFixed(2)}, Alınan Net: ₺${paidAmount.toFixed(2)}, Kalan Borç: ₺${newBalance.toFixed(2)}${discountVal > 0 ? `, İndirim: ₺${discountVal.toFixed(2)}` : ''}`
    });

    const [updatedCustomer] = await pool.query('SELECT * FROM customers WHERE id = ?', [customer.id]);

    req.io?.emit('customer:updated', { customerId: customer.id, customer: updatedCustomer[0] });
    req.io?.emit('payment:completed', {
      customerId: customer.id,
      customerName: customer.name,
      totalAmount: paidAmount,
      discount: discountVal,
      tip: tipVal,
      method: payment_method
    });

    res.json({
      success: true,
      message: `₺${paidAmount.toFixed(2)} tutarında tahsilat başarıyla kaydedildi.`,
      customer: updatedCustomer[0],
      transaction_id: txResult.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error('Cari tahsilat hatası:', error);
    res.status(500).json({ success: false, message: 'Tahsilat kaydedilemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * 7. Müşteri Borcunu Sıfırla (İşletme İnisiyatifi / Borç Silme)
 * Body: { notes }
 */
export const resetCustomerDebt = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { id } = req.params;
    const { notes } = req.body;

    await connection.beginTransaction();

    const [customerRows] = await connection.query(
      'SELECT * FROM customers WHERE id = ? FOR UPDATE',
      [id]
    );

    if (customerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Müşteri bulunamadı.' });
    }

    const customer = customerRows[0];
    const currentBalance = parseFloat(customer.current_balance || 0);

    if (currentBalance <= 0.05) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Bu müşterinin zaten açık bir borcu bulunmamaktadır.'
      });
    }

    const cleanNotes = notes && notes.trim() 
      ? notes.trim() 
      : 'İşletme inisiyatifi ile borç sıfırlandı / silindi.';

    // 1. customer_transactions tablosuna "debt_reset" hareketi kaydet
    const [txResult] = await connection.query(
      `INSERT INTO customer_transactions (
        customer_id, 
        transaction_type, 
        amount, 
        notes, 
        created_by_user_id, 
        created_by_user_name
      ) VALUES (?, 'debt_reset', ?, ?, ?, ?)`,
      [customer.id, currentBalance, cleanNotes, user.id, user.name]
    );

    // 2. Müşterinin borcunu 0'a çek
    await connection.query(
      `UPDATE customers 
       SET current_balance = 0.00, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [customer.id]
    );

    await connection.commit();

    // 3. Etkinlik günlüğü (Audit Log)
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'customer',
      entityId: customer.id,
      actionType: 'customer_debt_reset',
      title: `Borç Sıfırlandı: ${customer.name} (₺${currentBalance.toFixed(2)})`,
      details: `${user.name} tarafından ${customer.name} müşterisinin ₺${currentBalance.toFixed(2)} tutarındaki açık borcu sıfırlandı. Not: ${cleanNotes}`
    });

    const [updatedCustomer] = await pool.query('SELECT * FROM customers WHERE id = ?', [customer.id]);

    req.io?.emit('customer:updated', { customerId: customer.id, customer: updatedCustomer[0] });

    res.json({
      success: true,
      message: `₺${currentBalance.toFixed(2)} tutarındaki borç başarıyla sıfırlandı.`,
      customer: updatedCustomer[0],
      transaction_id: txResult.insertId,
      cleared_amount: currentBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Borç sıfırlama hatası:', error);
    res.status(500).json({ success: false, message: 'Borç sıfırlanamadı: ' + error.message });
  } finally {
    connection.release();
  }
};
