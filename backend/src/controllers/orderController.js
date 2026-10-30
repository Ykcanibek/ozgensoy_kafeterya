import crypto from 'crypto';
import { pool } from '../config/db.js';
import { getUserFromReq, logActivity } from '../config/auditLogger.js';
import { formatTitleCase } from './customerController.js';

/**
 * Kullanıcının Kuralı: Masada ödenmiş olan aynı ürünler tek satırda birleştirilsin!
 * (Aynı üründen daha önce ödenen ile sonra ödenen aynı siparişte tek satır haline getirilir)
 */
export const mergePaidOrderItems = async (connectionOrPool, orderId = null) => {
  const query = `
    SELECT order_id, product_id, COUNT(*) as cnt, MIN(id) as keep_id, 
           SUM(quantity) as total_qty, SUM(total_price) as total_sum,
           GROUP_CONCAT(DISTINCT NULLIF(TRIM(note), '') SEPARATOR ', ') as combined_notes
    FROM order_items
    WHERE is_paid = 1 ${orderId ? 'AND order_id = ?' : ''}
    GROUP BY order_id, product_id
    HAVING cnt > 1
  `;
  const [duplicatePaid] = await connectionOrPool.query(query, orderId ? [orderId] : []);

  for (const dup of duplicatePaid) {
    await connectionOrPool.query(
      'UPDATE order_items SET quantity = ?, total_price = ?, item_status = "delivered", note = ? WHERE id = ?',
      [dup.total_qty, dup.total_sum, dup.combined_notes || null, dup.keep_id]
    );
    await connectionOrPool.query(
      'DELETE FROM order_items WHERE order_id = ? AND product_id = ? AND is_paid = 1 AND id != ?',
      [dup.order_id, dup.product_id, dup.keep_id]
    );
  }
};

/**
 * Belirli bir masanın aktif sipariş ve adisyon detaylarını getir
 */
export const getTableOrder = async (req, res) => {
  try {
    const { tableId } = req.params;

    // 1. Masa Bilgisini Getir
    const [tableRows] = await pool.query(
      'SELECT id, table_number, title, status FROM restaurant_tables WHERE id = ? AND is_active = TRUE',
      [tableId]
    );

    if (tableRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Masa bulunamadı.' });
    }

    const table = tableRows[0];

    // 2. Masanın Açık Siparişini Getir (completed veya cancelled olmayan)
    const [orderRows] = await pool.query(
      `SELECT * FROM orders 
       WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') 
       ORDER BY id DESC LIMIT 1`,
      [tableId]
    );

    if (orderRows.length === 0) {
      return res.json({
        success: true,
        table,
        order: null,
        items: [],
        payments: []
      });
    }

    const order = orderRows[0];

    // 3. Kullanıcının kuralı: Masadaki ödenmiş aynı ürünler tek satırda birleştirilsin
    await mergePaidOrderItems(pool, order.id);

    // 4. Siparişe Ait Kalemleri (Ürünleri) Getir (Önce ödenmemişler, sonra ödenmişler)
    const [items] = await pool.query(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.item_status,
        COALESCE(oi.is_paid, 0) AS is_paid,
        oi.note,
        oi.created_at,
        p.name AS product_name,
        p.image_url,
        c.name AS category_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE oi.order_id = ?
       ORDER BY oi.is_paid ASC, oi.id ASC`,
      [order.id]
    );

    // 5. Siparişe ait daha önce yapılmış kısmi veya tamamlanmış tahsilat kayıtlarını getir
    const [payments] = await pool.query(
      `SELECT 
        p.id,
        p.table_id,
        p.order_id,
        p.total_amount,
        p.cash_amount,
        p.card_amount,
        p.veresiye_amount,
        p.discount,
        p.tip,
        p.payment_method,
        p.customer_id,
        p.customer_name,
        p.notes,
        p.created_at,
        u.name AS closed_by_name
       FROM payments p
       LEFT JOIN users u ON p.closed_by_user_id = u.id
       WHERE p.order_id = ? OR (p.order_id IS NULL AND p.table_id = ? AND p.created_at >= ?)
       ORDER BY p.id ASC`,
      [order.id, tableId, order.created_at]
    );

    res.json({
      success: true,
      table,
      order,
      items,
      payments: payments || []
    });
  } catch (error) {
    console.error('Masa siparişi getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş detayları alınamadı: ' + error.message });
  }
};

/**
 * Masaya Yeni Sipariş / Ek Ürünler Ekle (Kaydet / Mutfağa Gönder)
 */
export const saveTableOrder = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;
    const { items, note } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'En az bir ürün eklenmelidir.' });
    }

    await connection.beginTransaction();

    // 1. Masa kontrolü
    const [tableRows] = await connection.query(
      'SELECT id, title, status FROM restaurant_tables WHERE id = ? AND is_active = TRUE FOR UPDATE',
      [tableId]
    );

    if (tableRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Masa bulunamadı.' });
    }

    // 2. Masada açık sipariş var mı?
    const [activeOrders] = await connection.query(
      `SELECT id, total_price FROM orders 
       WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') 
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [tableId]
    );

    let orderId;
    if (activeOrders.length > 0) {
      orderId = activeOrders[0].id;
      if (note) {
        await connection.query('UPDATE orders SET note = ? WHERE id = ?', [note, orderId]);
      }
    } else {
      // Yeni sipariş oluştur
      const [orderResult] = await connection.query(
        `INSERT INTO orders (table_id, status, source, total_price, note, created_by_user_id) 
         VALUES (?, 'approved', 'pos', 0.00, ?, ?)`,
        [tableId, note || null, user.id]
      );
      orderId = orderResult.insertId;

      // Benzersiz Sipariş GUID (UUID v4) ata
      const orderNumber = crypto.randomUUID();
      await connection.query('UPDATE orders SET order_number = ? WHERE id = ?', [orderNumber, orderId]);
    }

    // 3. Kalemleri (Ürünleri) Ekle veya Miktarlarını Artır
    for (const item of items) {
      const quantity = parseInt(item.quantity, 10) || 1;
      let unitPrice = parseFloat(item.unit_price) || 0;
      if (unitPrice <= 0) {
        const [pRows] = await connection.query('SELECT price FROM products WHERE id = ?', [item.product_id]);
        if (pRows.length > 0) {
          unitPrice = parseFloat(pRows[0].price) || 0;
        }
      }
      const itemNote = item.note?.trim() || null;

      // Kullanıcının kuralı: SADECE durumu MUTFAKTA ('pending') olan, ÖDENMEMİŞ ve aynı nota sahip satırları birleştir!
      // Eğer mevcut satır 'delivered' (teslim edilmiş), hazır veya ödenmişse asla birleştirilmez; yeni satır olarak eklenir!
      const [existingItems] = await connection.query(
        `SELECT id, quantity, unit_price FROM order_items 
         WHERE order_id = ? AND product_id = ? AND item_status = 'pending' AND COALESCE(is_paid, 0) = 0 AND (note = ? OR (note IS NULL AND ? IS NULL))
         ORDER BY id ASC LIMIT 1`,
        [orderId, item.product_id, itemNote, itemNote]
      );

      if (existingItems.length > 0) {
        const existingItem = existingItems[0];
        const newQty = existingItem.quantity + quantity;
        const newTotal = newQty * unitPrice;
        await connection.query(
          'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
          [newQty, newTotal, existingItem.id]
        );
      } else {
        const totalPrice = quantity * unitPrice;
        await connection.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note, created_by_user_id) 
           VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
          [orderId, item.product_id, quantity, unitPrice, totalPrice, itemNote, user.id]
        );
      }
    }

    // 4. Siparişin Açık / Ödenmemiş Toplamını Yeniden Hesapla (İptal, İade, İkram hariç)
    const [sumResult] = await connection.query(
      `SELECT COALESCE(SUM(total_price), 0.00) as new_total FROM order_items 
       WHERE order_id = ? AND COALESCE(is_paid, 0) = 0 AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
      [orderId]
    );
    const newTotal = sumResult[0].new_total;

    await connection.query(
      'UPDATE orders SET total_price = ? WHERE id = ?',
      [newTotal, orderId]
    );

    // 5. Masayı Dolu (Occupied) Durumuna Getir
    await connection.query(
      "UPDATE restaurant_tables SET status = 'occupied' WHERE id = ?",
      [tableId]
    );

    await connection.commit();

    // Denetim İzi Kaydı
    const totalOrderQty = items.reduce((s, it) => s + (parseInt(it.quantity, 10) || 1), 0);
    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order',
      entityId: orderId,
      actionType: 'order_created',
      title: `Sipariş Eklendi: ${tableRows[0]?.title || 'Masa'}`,
      details: `${user.name} tarafından ${items.length} çeşit (${totalOrderQty} adet) sipariş girildi.`,
      tableTitle: tableRows[0]?.title,
      quantity: totalOrderQty
    });

    // Ödenmiş kalemleri birleştir
    await mergePaidOrderItems(pool, orderId);

    // 6. Güncel Siparişi ve Kalemleri Al
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    const [allOrderItems] = await pool.query(
      `SELECT 
        oi.*,
        COALESCE(oi.is_paid, 0) AS is_paid,
        p.name AS product_name,
        p.image_url,
        c.name AS category_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [orderId]
    );

    // 7. Socket.io Bildirimleri Gönder (Gerçek Zamanlı POS & Mutfak Senkronizasyonu)
    req.io?.emit('table:updated', {
      tableId: parseInt(tableId, 10),
      status: 'occupied',
      active_total: newTotal
    });

    req.io?.emit('order:created', {
      orderId,
      tableId: parseInt(tableId, 10),
      order: orderRows[0],
      items: allOrderItems
    });

    res.json({
      success: true,
      message: 'Siparişler başarıyla kaydedildi ve mutfağa iletildi.',
      order: orderRows[0],
      items: allOrderItems
    });
  } catch (error) {
    await connection.rollback();
    console.error('Sipariş kaydetme hatası:', error);
    res.status(500).json({ success: false, message: 'Sipariş kaydedilemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Tek Bir Sipariş Kaleminin Adetini veya Notunu Güncelle
 */
export const updateOrderItem = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { itemId } = req.params;
    const { quantity, note } = req.body;

    await connection.beginTransaction();

    const [itemRows] = await connection.query(
      'SELECT id, order_id, unit_price FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const item = itemRows[0];
    const newQty = parseInt(quantity, 10);

    if (newQty <= 0) {
      // 0 veya daha az ise kalemi sil
      await connection.query('DELETE FROM order_items WHERE id = ?', [itemId]);
    } else {
      const newTotal = newQty * parseFloat(item.unit_price);
      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ?, note = COALESCE(?, note) WHERE id = ?',
        [newQty, newTotal, note !== undefined ? note : null, itemId]
      );
    }

    // Siparişin toplamını güncelle
    const [sumResult] = await connection.query(
      'SELECT COALESCE(SUM(total_price), 0.00) as new_total, COUNT(id) as count FROM order_items WHERE order_id = ?',
      [item.order_id]
    );

    const newOrderTotal = sumResult[0].new_total;
    const itemsCount = sumResult[0].count;

    await connection.query(
      'UPDATE orders SET total_price = ? WHERE id = ?',
      [newOrderTotal, item.order_id]
    );

    // Eğer hiç kalem kalmadıysa masayı boş yapabiliriz
    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [item.order_id]);
    const tableId = orderInfo[0]?.table_id;

    if (itemsCount === 0 && tableId) {
      await connection.query("UPDATE restaurant_tables SET status = 'empty' WHERE id = ?", [tableId]);
      await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [item.order_id]);
    }

    await connection.commit();

    req.io?.emit('table:updated', {
      tableId,
      status: itemsCount === 0 ? 'empty' : 'occupied',
      active_total: newOrderTotal
    });

    res.json({
      success: true,
      message: 'Sipariş kalemi güncellendi.',
      newTotal: newOrderTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Sipariş kalemi güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Sipariş Kalemini Sil
 */
export const deleteOrderItem = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { itemId } = req.params;

    await connection.beginTransaction();

    const [itemRows] = await connection.query(
      'SELECT id, order_id, is_paid FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const item = itemRows[0];
    if (item.is_paid) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Ödenmiş bir ürün masadan silinemez.' });
    }

    await connection.query('DELETE FROM order_items WHERE id = ?', [itemId]);

    // Siparişin açık / ödenmemiş toplamını güncelle (İptal, İade, İkram hariç)
    const [sumResult] = await connection.query(
      `SELECT COALESCE(SUM(total_price), 0.00) as new_total, COUNT(id) as count FROM order_items 
       WHERE order_id = ? AND COALESCE(is_paid, 0) = 0 AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
      [item.order_id]
    );

    const newOrderTotal = sumResult[0].new_total;
    const unpaidItemsCount = sumResult[0].count;

    await connection.query(
      'UPDATE orders SET total_price = ? WHERE id = ?',
      [newOrderTotal, item.order_id]
    );

    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [item.order_id]);
    const tableId = orderInfo[0]?.table_id;

    // Masadaki tüm kalemler (ödenmiş ve ödenmemiş toplam)
    const [allCountResult] = await connection.query(
      'SELECT COUNT(id) as total_count FROM order_items WHERE order_id = ?',
      [item.order_id]
    );
    const totalCount = allCountResult[0]?.total_count || 0;

    if (totalCount === 0 && tableId) {
      await connection.query("UPDATE restaurant_tables SET status = 'empty' WHERE id = ?", [tableId]);
      await connection.query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [item.order_id]);
    }

    await connection.commit();

    req.io?.emit('table:updated', {
      tableId,
      status: itemsCount === 0 ? 'empty' : 'occupied',
      active_total: newOrderTotal
    });

    res.json({
      success: true,
      message: 'Sipariş kalemi silindi.',
      newTotal: newOrderTotal
    });
  } catch (error) {
    await connection.rollback();
    console.error('Kalem silme hatası:', error);
    res.status(500).json({ success: false, message: 'Kalem silinemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Ödeme Alma & Masayı Kapatma (Nakit / Kredi Kartı / Parçalı / Veresiye / Tutar Bazlı)
 */
export const closeTablePayment = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;
    const { 
      payment_method = 'cash', 
      amount_paid, 
      discount = 0, 
      tip = 0, 
      cash_amount = 0,
      card_amount = 0,
      veresiye_amount = 0,
      customer_id,
      customer_name,
      notes,
      closed_by_user_id,
      paid_items 
    } = req.body;

    await connection.beginTransaction();

    // Masanın adını/başlığını al
    const [tableRow] = await connection.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
    const tableTitle = tableRow[0]?.title || `Masa ${tableId}`;

    // 1. Masanın açık siparişlerini bul
    const [activeOrders] = await connection.query(
      `SELECT id, total_price, created_at FROM orders 
       WHERE table_id = ? AND status NOT IN ('completed', 'cancelled') 
       ORDER BY id DESC FOR UPDATE`,
      [tableId]
    );

    if (activeOrders.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bu masada ödenecek açık bir sipariş bulunmuyor.' });
    }

    const primaryOrder = activeOrders[0];
    const discountVal = Math.max(0, parseFloat(discount || 0));
    const tipVal = Math.max(0, parseFloat(tip || 0));

    // Ödeme yöntemi doğrulama
    const allowedMethods = ['cash', 'credit_card', 'mixed', 'veresiye'];
    const validMethod = allowedMethods.includes(payment_method) ? payment_method : 'cash';

    let customerName = customer_name ? String(customer_name).trim() : null;
    const notesVal = notes ? String(notes).trim() : null;
    const veresiyeInputVal = parseFloat(veresiye_amount || 0);

    if ((validMethod === 'veresiye' || (validMethod === 'mixed' && veresiyeInputVal > 0)) && !customerName && !customer_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Veresiye tutarı için lütfen müşteri seçiniz veya müşteri adı giriniz.' });
    }

    // 2. Masadaki tüm sipariş kalemlerinin toplam tutarını ve daha önce ödenenleri hesapla
    const orderIds = activeOrders.map(o => o.id);
    const [itemSumRows] = await connection.query(
      `SELECT COALESCE(SUM(total_price), 0.00) as items_sum FROM order_items 
       WHERE order_id IN (${orderIds.map(() => '?').join(',')}) 
         AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
      orderIds
    );
    const orderItemsTotal = parseFloat(itemSumRows[0].items_sum || 0);

    const [prevPaidRows] = await connection.query(
      `SELECT COALESCE(SUM(total_amount), 0.00) as paid_sum,
              COALESCE(SUM(discount), 0.00) as discount_sum,
              COALESCE(SUM(tip), 0.00) as tip_sum
       FROM payments 
       WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds
    );
    const previousPaidTotal = parseFloat(prevPaidRows[0].paid_sum || 0);
    const previousDiscountTotal = parseFloat(prevPaidRows[0].discount_sum || 0);
    const previousTipTotal = parseFloat(prevPaidRows[0].tip_sum || 0);
    // Masadan düşen ürün borcu = Ödenen tutar - Bahşiş + İndirim
    const previousSettled = Math.max(0, previousPaidTotal - previousTipTotal + previousDiscountTotal);
    const remainingBefore = Math.max(0, orderItemsTotal - previousSettled);

    // 3. Kalem Bazlı veya Tutar Bazlı Tahsilat Belirleme
    const hasItemSelection = Array.isArray(paid_items) && paid_items.length > 0;
    let computedPaidAmount = 0;

    if (hasItemSelection) {
      // Kalem bazlı ödeme: Seçilen ürünleri ve adetlerini işle
      for (const pItem of paid_items) {
        const [itemRows] = await connection.query(
          'SELECT id, order_id, product_id, quantity, unit_price, item_status, note FROM order_items WHERE id = ? AND COALESCE(is_paid, 0) = 0 FOR UPDATE',
          [pItem.id]
        );
        if (itemRows.length > 0) {
          const item = itemRows[0];
          const payQty = Math.min(item.quantity, parseInt(pItem.quantity, 10) || 1);
          const lineTotal = payQty * parseFloat(item.unit_price);
          computedPaidAmount += lineTotal;

          if (payQty >= item.quantity) {
            // Kalemin tamamı ödendi
            await connection.query('UPDATE order_items SET is_paid = 1 WHERE id = ?', [item.id]);
          } else {
            // Kısmi adet ödendi
            const remQty = item.quantity - payQty;
            const remTotal = remQty * parseFloat(item.unit_price);
            await connection.query(
              'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
              [remQty, remTotal, item.id]
            );

            // Ödenen kısım için is_paid = 1 olan yeni satır aç
            await connection.query(
              `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note) 
               VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
              [item.order_id, item.product_id, payQty, item.unit_price, lineTotal, item.item_status, item.note]
            );
          }
        }
      }
    }

    // Eğer amount_paid açıkça verildiyse onu kullan, yoksa kalem toplamını veya kalan bakiyeyi al
    let paidAmount = 0;
    if (amount_paid !== undefined && amount_paid !== null && parseFloat(amount_paid) > 0) {
      paidAmount = parseFloat(amount_paid);
    } else if (hasItemSelection && computedPaidAmount > 0) {
      paidAmount = computedPaidAmount;
    } else {
      paidAmount = remainingBefore;
    }

    if (paidAmount <= 0) {
      // Masada gerçekten ödenecek bakiye kalmamışsa (örneğin tüm ürünler ikram/iade ise), masayı doğrudan kapatmaya izin ver!
      if (remainingBefore <= 0.05) {
        for (const ordId of orderIds) {
          await connection.query(
            'UPDATE order_items SET is_paid = 1 WHERE order_id = ? AND COALESCE(is_paid, 0) = 0',
            [ordId]
          );
          await mergePaidOrderItems(connection, ordId);
        }

        await connection.query(
          `UPDATE orders SET total_price = 0.00, status = 'completed' WHERE id IN (${orderIds.map(() => '?').join(',')})`,
          orderIds
        );

        await connection.query(
          "UPDATE restaurant_tables SET status = 'empty' WHERE id = ?",
          [tableId]
        );

        await connection.commit();

        if (req.io) {
          req.io.emit('table_updated', { id: parseInt(tableId), status: 'empty' });
          req.io.emit('table:updated', { tableId: parseInt(tableId), active_total: 0.00, status: 'empty' });
          req.io.emit('order:completed', { tableId: parseInt(tableId), orderIds });
        }

        return res.json({
          success: true,
          message: 'Masada ödenecek bakiye kalmadığı için masa 0.00 ₺ ile başarıyla kapatıldı.',
          is_closed: true
        });
      }

      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Tahsil edilecek tutar 0₺ den büyük olmalıdır.' });
    }

    // Nakit, Kart ve Veresiye Dağılımını Hesapla
    let cashPortion = 0;
    let cardPortion = 0;
    let veresiyePortion = 0;
    if (validMethod === 'cash') {
      cashPortion = paidAmount;
      cardPortion = 0;
      veresiyePortion = 0;
    } else if (validMethod === 'credit_card') {
      cardPortion = paidAmount;
      cashPortion = 0;
      veresiyePortion = 0;
    } else if (validMethod === 'veresiye') {
      veresiyePortion = paidAmount;
      cashPortion = 0;
      cardPortion = 0;
    } else if (validMethod === 'mixed') {
      cashPortion = parseFloat(cash_amount || 0);
      cardPortion = parseFloat(card_amount || 0);
      veresiyePortion = parseFloat(veresiye_amount || 0);
      if (cashPortion === 0 && cardPortion === 0 && veresiyePortion === 0) {
        cashPortion = paidAmount;
      }
    }

    const closedUserId = closed_by_user_id || user.id;

    // 4. Müşteri (Cari) Bilgisini Çözümle
    let resolvedCustomerId = customer_id ? parseInt(customer_id, 10) : null;
    if (!resolvedCustomerId && customerName) {
      const [existingCust] = await connection.query('SELECT id, name FROM customers WHERE name = ? LIMIT 1', [customerName]);
      if (existingCust.length > 0) {
        resolvedCustomerId = existingCust[0].id;
        customerName = existingCust[0].name;
      } else {
        const formattedCustName = formatTitleCase(customerName);
        const [newCustRes] = await connection.query(
          `INSERT INTO customers (name, phone, notes, created_by_user_id) VALUES (?, '0', 'Masadan veresiye açıldı', ?)`,
          [formattedCustName, user.id]
        );
        resolvedCustomerId = newCustRes.insertId;
        customerName = formattedCustName;
      }
    } else if (resolvedCustomerId && !customerName) {
      const [existingCust] = await connection.query('SELECT name FROM customers WHERE id = ?', [resolvedCustomerId]);
      if (existingCust.length > 0) {
        customerName = existingCust[0].name;
      }
    }

    // Veresiye tutarı varsa müşteriye borç kaydet
    if (veresiyePortion > 0 && resolvedCustomerId) {
      await connection.query(
        'UPDATE customers SET total_debt = total_debt + ?, current_balance = current_balance + ? WHERE id = ?',
        [veresiyePortion, veresiyePortion, resolvedCustomerId]
      );

      await connection.query(
        `INSERT INTO customer_transactions (
          customer_id, transaction_type, amount, order_id, table_id, table_title,
          payment_method, cash_amount, card_amount, veresiye_amount, discount, tip, notes,
          created_by_user_id, created_by_user_name
        ) VALUES (?, 'debt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resolvedCustomerId,
          veresiyePortion,
          primaryOrder.id,
          tableId,
          tableTitle,
          validMethod,
          cashPortion,
          cardPortion,
          veresiyePortion,
          discountVal,
          tipVal,
          notesVal || (validMethod === 'mixed' ? `${tableTitle} masasından parçalı veresiye hesaba yazıldı.` : `${tableTitle} masasından veresiye hesaba yazıldı.`),
          user.id,
          user.name
        ]
      );
    }

    // 5. Ödeme Fişi / Tahsilat Kaydını Oluştur (order_id, cash_amount, card_amount, veresiye_amount ve müşteri adı/id ile)
    const [payResult] = await connection.query(
      `INSERT INTO payments (table_id, order_id, total_amount, cash_amount, card_amount, veresiye_amount, discount, tip, payment_method, customer_id, customer_name, notes, closed_by_user_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tableId, primaryOrder.id, paidAmount, cashPortion, cardPortion, veresiyePortion, discountVal, tipVal, validMethod, resolvedCustomerId, customerName, notesVal, closedUserId]
    );

    // 5. Masada Kalan Toplam Borcu ve Kapanış Durumunu Kontrol Et
    // Masadan düşen ürün tutarı = (Tahsil Edilen Tutar - Bahşiş + İndirim)
    const currentSettled = Math.max(0, paidAmount - tipVal + discountVal);
    const newTotalSettled = previousSettled + currentSettled;
    const newRemainingBalance = Math.max(0, orderItemsTotal - newTotalSettled);

    // Bakiye 0.05 TL ve altı kaldıysa masa tamamen ödenmiş kabul edilir
    const isFullSettlement = newRemainingBalance <= 0.05;

    if (isFullSettlement) {
      // Masadaki tüm kalemleri is_paid = 1 yap ve birleştir
      for (const ordId of orderIds) {
        await connection.query(
          'UPDATE order_items SET is_paid = 1 WHERE order_id = ? AND COALESCE(is_paid, 0) = 0',
          [ordId]
        );
        await mergePaidOrderItems(connection, ordId);
      }

      // Siparişi completed yap ve masayı boşalt
      await connection.query(
        `UPDATE orders SET total_price = ?, status = 'completed' WHERE id IN (${orderIds.map(() => '?').join(',')})`,
        [orderItemsTotal, ...orderIds]
      );

      await connection.query(
        "UPDATE restaurant_tables SET status = 'empty' WHERE id = ?",
        [tableId]
      );
    } else {
      // Kısmi ödeme yapıldı: Kalan borç tutarını sipariş üzerinde güncelle
      await connection.query('UPDATE orders SET total_price = ? WHERE id = ?', [newRemainingBalance, primaryOrder.id]);
      if (hasItemSelection) {
        for (const ordId of orderIds) {
          await mergePaidOrderItems(connection, ordId);
        }
      }
    }

    await connection.commit();

    // 6. Denetim İzi Kaydı (Audit Log)
    let methodDesc = 'Nakit';
    if (validMethod === 'credit_card') {
      methodDesc = 'Kredi Kartı';
    } else if (validMethod === 'mixed') {
      methodDesc = `Parçalı / Karma (₺${cashPortion.toFixed(2)} Nakit + ₺${cardPortion.toFixed(2)} Kart)`;
    } else if (validMethod === 'veresiye') {
      methodDesc = `Veresiye / Açık Hesap (Cari: ${customerName || 'Belirtilmedi'})`;
    }

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'payment',
      entityId: payResult.insertId,
      actionType: 'payment_received',
      title: `Tahsilat Alındı: ${tableTitle} (₺${paidAmount.toFixed(2)})`,
      details: `${user.name} tarafından ${methodDesc} tahsilat yapıldı. ${isFullSettlement ? 'Hesap tamamen kapatıldı ve masa boşaltıldı.' : `Kalan Masa Borcu: ₺${newRemainingBalance.toFixed(2)}`}${discountVal > 0 ? `, İndirim: ₺${discountVal.toFixed(2)}` : ''}${tipVal > 0 ? `, Bahşiş: ₺${tipVal.toFixed(2)}` : ''}`,
      amount: paidAmount,
      discount: discountVal,
      tip: tipVal,
      tableTitle
    });

    // 7. Socket.io Bildirimleri
    if (isFullSettlement) {
      req.io?.emit('table:updated', {
        tableId: parseInt(tableId, 10),
        status: 'empty',
        active_total: 0.00
      });
      req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });
    } else {
      req.io?.emit('table:updated', { 
        tableId: parseInt(tableId, 10), 
        status: 'occupied',
        active_total: newRemainingBalance 
      });
      req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });
    }

    req.io?.emit('payment:completed', {
      tableId: parseInt(tableId, 10),
      totalAmount: paidAmount,
      discount: discountVal,
      tip: tipVal,
      isPartial: !isFullSettlement,
      method: validMethod,
      customerName: customerName || null,
      customerId: resolvedCustomerId || null
    });

    if (resolvedCustomerId) {
      req.io?.emit('customer:updated', { customerId: resolvedCustomerId });
    }

    res.json({
      success: true,
      isPartial: !isFullSettlement,
      message: isFullSettlement 
        ? 'Hesap başarıyla kapatıldı ve masa boşaltıldı!' 
        : `₺${paidAmount.toFixed(2)} tutarında kısmi ödeme alındı. Kalan masa borcu: ₺${newRemainingBalance.toFixed(2)}`,
      totalAmount: paidAmount,
      remainingBalance: newRemainingBalance,
      paymentMethod: validMethod
    });
  } catch (error) {
    await connection.rollback();
    console.error('Ödeme alma hatası:', error);
    res.status(500).json({ success: false, message: 'Ödeme tamamlanamadı: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Sipariş Kaleminin Durumunu Güncelle (Mutfakta, Hazır, Teslim Edildi)
 * Kullanıcının Kuralı: Durumu aynı olan ürünler birleştirilir!
 * Bir ürün 'delivered' (teslim edildi) yapıldığında, masada aynı ürün ve aynı durumdaki kalemle birleştirilir.
 */
export const updateOrderItemStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { itemId } = req.params;
    const { status, quantity } = req.body; 
    // 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'returned' | 'complimentary'

    const validStatuses = ['pending', 'preparing', 'ready', 'delivered', 'cancelled', 'returned', 'complimentary'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Geçersiz ürün durumu.' });
    }

    await connection.beginTransaction();

    // 1. Güncellenecek kalemi al
    const [targetRows] = await connection.query(
      'SELECT id, order_id, product_id, quantity, unit_price, item_status, is_paid, note, created_by_user_id FROM order_items WHERE id = ? FOR UPDATE',
      [itemId]
    );

    if (targetRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Sipariş kalemi bulunamadı.' });
    }

    const currentItem = targetRows[0];
    if (currentItem.is_paid) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Ödenmiş bir ürünün durumu değiştirilemez.' });
    }

    const currentQty = parseInt(currentItem.quantity, 10);
    const splitQty = quantity ? Math.min(parseInt(quantity, 10), currentQty) : currentQty;

    let targetItemId = itemId;

    if (splitQty < currentQty && splitQty > 0) {
      // Kısmi adet değişimi: Mevcut satırın adedini düşür
      const remainingQty = currentQty - splitQty;
      const remTotal = remainingQty * parseFloat(currentItem.unit_price);
      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?',
        [remainingQty, remTotal, itemId]
      );

      // Yeni durum için yeni satır ekle
      const newTotal = splitQty * parseFloat(currentItem.unit_price);
      const [insertRes] = await connection.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, item_status, is_paid, note, created_by_user_id, status_updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [currentItem.order_id, currentItem.product_id, splitQty, currentItem.unit_price, newTotal, status, currentItem.note, currentItem.created_by_user_id, user.id]
      );
      targetItemId = insertRes.insertId;
    } else {
      // Tüm adedin durumu güncelleniyor
      await connection.query('UPDATE order_items SET item_status = ?, status_updated_by_user_id = ? WHERE id = ?', [status, user.id, itemId]);
    }

    // 3. Durumu aynı olan, aynı ürün, aynı is_paid (ödenmemiş) ve aynı nota sahip başka bir satır var mı kontrol et (birleştir)
    const [matchingRows] = await connection.query(
      `SELECT id, quantity, total_price FROM order_items 
       WHERE order_id = ? 
         AND product_id = ? 
         AND item_status = ? 
         AND COALESCE(is_paid, 0) = 0 
         AND (note <=> ?)
         AND id != ?
       ORDER BY id ASC LIMIT 1 FOR UPDATE`,
      [
        currentItem.order_id,
        currentItem.product_id,
        status,
        currentItem.note,
        targetItemId
      ]
    );

    let merged = false;
    let targetKeepId = targetItemId;

    if (matchingRows.length > 0) {
      const existingMatch = matchingRows[0];
      const mergedQty = existingMatch.quantity + splitQty;
      const mergedTotal = mergedQty * parseFloat(currentItem.unit_price);

      await connection.query(
        'UPDATE order_items SET quantity = ?, total_price = ?, status_updated_by_user_id = ? WHERE id = ?',
        [mergedQty, mergedTotal, user.id, existingMatch.id]
      );

      await connection.query('DELETE FROM order_items WHERE id = ?', [targetItemId]);

      merged = true;
      targetKeepId = existingMatch.id;
    }

    // 4. Siparişin toplam açık borcunu yeniden hesapla (cancelled, returned, complimentary hariç)
    const [sumResult] = await connection.query(
      `SELECT COALESCE(SUM(total_price), 0.00) as new_total, COUNT(id) as count 
       FROM order_items 
       WHERE order_id = ? 
         AND COALESCE(is_paid, 0) = 0 
         AND item_status NOT IN ('cancelled', 'returned', 'complimentary')`,
      [currentItem.order_id]
    );

    const newOrderTotal = sumResult[0].new_total;
    await connection.query('UPDATE orders SET total_price = ? WHERE id = ?', [newOrderTotal, currentItem.order_id]);

    // 5. Siparişin bağlı olduğu masayı bul
    const [orderInfo] = await connection.query('SELECT table_id FROM orders WHERE id = ?', [currentItem.order_id]);
    const tableId = orderInfo[0]?.table_id;

    let tableEmptied = false;

    if (tableId) {
      // Masadaki tüm açık siparişlerin kalemlerini kontrol et
      const [tableItems] = await connection.query(
        `SELECT oi.id, oi.item_status, oi.is_paid 
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.table_id = ? AND o.status NOT IN ('completed', 'cancelled')`,
        [tableId]
      );

      // Masada henüz ödenmemiş ve faturalandırılabilir aktif borçlu kalem var mı?
      const hasUnpaidBillable = tableItems.some(
        i => !i.is_paid && !['cancelled', 'returned', 'complimentary'].includes(i.item_status)
      );

      // Eğer ödenecek hiçbir ürün kalmadıysa ve masadaki TÜM ürünler iade/iptal edildiyse:
      if (!hasUnpaidBillable && tableItems.length > 0) {
        const allCancelledOrReturned = tableItems.every(
          i => !i.is_paid && ['cancelled', 'returned'].includes(i.item_status)
        );

        if (allCancelledOrReturned) {
          await connection.query(
            "UPDATE orders SET status = 'cancelled', total_price = 0.00 WHERE table_id = ? AND status NOT IN ('completed', 'cancelled')",
            [tableId]
          );
          await connection.query(
            "UPDATE restaurant_tables SET status = 'empty' WHERE id = ?",
            [tableId]
          );
          tableEmptied = true;
        }
      }
    }

    await connection.commit();

    // Ürün adı ve masa adını alıp Denetim İzi Kaydı ekle
    const [prodInfo] = await pool.query('SELECT name FROM products WHERE id = ?', [currentItem.product_id]);
    const [tableInfo] = await pool.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
    const productName = prodInfo[0]?.name || 'Ürün';
    const tableTitle = tableInfo[0]?.title || `Masa ${tableId}`;
    const splitAmount = splitQty * parseFloat(currentItem.unit_price);

    const statusActionMap = {
      delivered: { action: 'item_delivered', title: `Ürün Teslim Edildi: ${productName} (${splitQty} Adet)` },
      complimentary: { action: 'item_complimentary', title: `İkram Yapıldı: ${productName} (${splitQty} Adet)` },
      returned: { action: 'item_returned', title: `İade Alındı: ${productName} (${splitQty} Adet)` },
      cancelled: { action: 'item_cancelled', title: `Sipariş İptal Edildi: ${productName} (${splitQty} Adet)` },
      pending: { action: 'item_pending', title: `Mutfağa Geri Alındı: ${productName} (${splitQty} Adet)` },
      preparing: { action: 'item_preparing', title: `Hazırlanıyor: ${productName} (${splitQty} Adet)` },
      ready: { action: 'item_ready', title: `Hazır: ${productName} (${splitQty} Adet)` }
    };

    const statusLabels = {
      pending: 'Mutfakta',
      preparing: 'Hazırlanıyor',
      ready: 'Hazır',
      delivered: 'Teslim Edildi',
      cancelled: 'İptal',
      returned: 'İade',
      complimentary: 'İkram'
    };

    const actInfo = statusActionMap[status] || { action: 'item_status_changed', title: `Durum Değiştirildi: ${productName}` };

    await logActivity({
      userId: user.id,
      userName: user.name,
      entityType: 'order_item',
      entityId: targetItemId,
      actionType: actInfo.action,
      title: `${actInfo.title} (${tableTitle})`,
      details: `${user.name} tarafından durumu "${statusLabels[status] || status}" yapıldı. Tutar: ₺${splitAmount.toFixed(2)}`,
      amount: splitAmount,
      quantity: splitQty,
      tableTitle
    });

    // 6. Socket.io Bildirimleri
    req.io?.emit('order:item_status_updated', {
      itemId: parseInt(itemId, 10),
      status,
      merged,
      targetKeepId
    });

    if (tableId) {
      if (tableEmptied) {
        req.io?.emit('table_updated', { id: parseInt(tableId, 10), status: 'empty' });
        req.io?.emit('table:updated', { tableId: parseInt(tableId, 10), active_total: 0.00, status: 'empty' });
      } else {
        req.io?.emit('table:updated', {
          tableId: parseInt(tableId, 10),
          active_total: newOrderTotal
        });
      }
      req.io?.emit('order:updated', { tableId });
    }

    res.json({
      success: true,
      message: tableEmptied
        ? `Ürün "${statusLabels[status] || status}" yapıldı. Masada başka ürün kalmadığı için masa otomatik kapatıldı ve boşaltıldı.`
        : `Ürün durumu "${statusLabels[status] || status}" olarak güncellendi.`,
      status,
      merged,
      targetKeepId,
      newOrderTotal,
      tableEmptied
    });
  } catch (error) {
    await connection.rollback();
    console.error('Ürün durumu güncelleme hatası:', error);
    res.status(500).json({ success: false, message: 'Durum güncellenemedi: ' + error.message });
  } finally {
    connection.release();
  }
};

/**
 * Mutfak Ekranı (KDS): Aktif Mutfak Siparişlerini ve Kalemlerini Getir
 */
export const getKitchenOrders = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        o.id AS order_id,
        o.order_number,
        o.table_id,
        o.note AS order_note,
        o.created_at AS order_created_at,
        t.title AS table_title,
        t.table_number,
        t.status AS table_status,
        oi.id AS item_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.total_price,
        oi.item_status,
        COALESCE(oi.is_paid, 0) AS is_paid,
        oi.note AS item_note,
        oi.created_at AS item_created_at,
        p.name AS product_name,
        p.image_url,
        c.name AS category_name,
        u.name AS created_by_name
      FROM orders o
      JOIN restaurant_tables t ON o.table_id = t.id
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN users u ON oi.created_by_user_id = u.id
      WHERE o.status NOT IN ('completed', 'cancelled')
        AND (
          oi.item_status IN ('pending', 'preparing', 'ready')
          OR (oi.item_status = 'delivered' AND oi.created_at >= NOW() - INTERVAL 1 HOUR)
        )
      ORDER BY oi.created_at ASC
    `);

    // Masalara göre grupla
    const ordersMap = {};
    const productSummaryMap = {};

    for (const row of rows) {
      if (!ordersMap[row.table_id]) {
        ordersMap[row.table_id] = {
          table_id: row.table_id,
          table_title: row.table_title,
          table_number: row.table_number,
          order_id: row.order_id,
          order_number: row.order_number,
          order_note: row.order_note,
          order_created_at: row.order_created_at,
          created_by_name: row.created_by_name,
          items: [],
          pending_count: 0,
          preparing_count: 0,
          ready_count: 0,
          delivered_count: 0,
          total_active: 0
        };
      }

      const itemObj = {
        id: row.item_id,
        order_id: row.order_id,
        table_id: row.table_id,
        product_id: row.product_id,
        product_name: row.product_name,
        category_name: row.category_name,
        image_url: row.image_url,
        quantity: row.quantity,
        item_status: row.item_status,
        is_paid: row.is_paid,
        note: row.item_note,
        created_at: row.item_created_at,
        created_by_name: row.created_by_name
      };

      ordersMap[row.table_id].items.push(itemObj);

      if (row.item_status === 'pending') {
        ordersMap[row.table_id].pending_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'preparing') {
        ordersMap[row.table_id].preparing_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'ready') {
        ordersMap[row.table_id].ready_count += row.quantity;
        ordersMap[row.table_id].total_active += row.quantity;
      } else if (row.item_status === 'delivered') {
        ordersMap[row.table_id].delivered_count += row.quantity;
      }

      // Mutfak toplu özet için aktif (teslim edilmemiş) kalemleri topla
      if (['pending', 'preparing', 'ready'].includes(row.item_status)) {
        if (!productSummaryMap[row.product_id]) {
          productSummaryMap[row.product_id] = {
            product_id: row.product_id,
            product_name: row.product_name,
            category_name: row.category_name,
            image_url: row.image_url,
            total_quantity: 0,
            pending_quantity: 0,
            preparing_quantity: 0,
            ready_quantity: 0,
            tables: []
          };
        }
        productSummaryMap[row.product_id].total_quantity += row.quantity;
        if (row.item_status === 'pending') productSummaryMap[row.product_id].pending_quantity += row.quantity;
        if (row.item_status === 'preparing') productSummaryMap[row.product_id].preparing_quantity += row.quantity;
        if (row.item_status === 'ready') productSummaryMap[row.product_id].ready_quantity += row.quantity;

        productSummaryMap[row.product_id].tables.push({
          table_title: row.table_title,
          quantity: row.quantity,
          note: row.item_note,
          status: row.item_status
        });
      }
    }

    const orders = Object.values(ordersMap);
    const summary = Object.values(productSummaryMap).sort((a, b) => b.total_quantity - a.total_quantity);

    res.json({
      success: true,
      orders,
      summary,
      total_tables: orders.length,
      total_pending: orders.reduce((acc, o) => acc + o.pending_count, 0),
      total_preparing: orders.reduce((acc, o) => acc + o.preparing_count, 0),
      total_ready: orders.reduce((acc, o) => acc + o.ready_count, 0)
    });
  } catch (error) {
    console.error('Mutfak siparişleri getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Mutfak siparişleri alınamadı: ' + error.message });
  }
};

/**
 * Masadaki Tüm Hazırlanan / Bekleyen Sipariş Kalemlerini Tek Tıkla Teslim Et
 */
export const deliverAllTableItems = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const user = getUserFromReq(req);
    const { tableId } = req.params;

    await connection.beginTransaction();

    const [unfulfilledItems] = await connection.query(`
      SELECT oi.id, oi.product_id, oi.quantity, p.name AS product_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.table_id = ? 
        AND o.status NOT IN ('completed', 'cancelled')
        AND oi.item_status IN ('pending', 'preparing', 'ready')
    `, [tableId]);

    if (unfulfilledItems.length > 0) {
      await connection.query(`
        UPDATE order_items oi
        JOIN orders o ON oi.order_id = o.id
        SET oi.item_status = 'delivered', oi.status_updated_by_user_id = ?
        WHERE o.table_id = ? 
          AND o.status NOT IN ('completed', 'cancelled')
          AND oi.item_status IN ('pending', 'preparing', 'ready')
      `, [user.id, tableId]);

      // Denetim İzi Kaydı
      const [tableRows] = await connection.query('SELECT title FROM restaurant_tables WHERE id = ?', [tableId]);
      const tableTitle = tableRows[0]?.title || `Masa ${tableId}`;
      await logActivity({
        userId: user.id,
        userName: user.name,
        entityType: 'order',
        entityId: tableId,
        actionType: 'item_delivered',
        title: `Tüm Siparişler Teslim Edildi (${tableTitle})`,
        details: `${user.name} tarafından masanın tüm bekleyen ürünleri (${unfulfilledItems.length} çeşit) teslim edildi olarak işaretlendi.`,
        tableTitle
      });
    }

    await connection.commit();

    // Socket.io bildirimleri: POS ve Mutfak anında güncellenir
    req.io?.emit('order:item_status_updated', {
      tableId: parseInt(tableId, 10),
      status: 'delivered',
      bulk: true
    });
    req.io?.emit('order:updated', { tableId: parseInt(tableId, 10) });

    res.json({
      success: true,
      message: 'Masanın tüm siparişleri başarıyla teslim edildi.',
      count: unfulfilledItems.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Tümünü teslim etme hatası:', error);
    res.status(500).json({ success: false, message: 'İşlem gerçekleştirilemedi: ' + error.message });
  } finally {
    connection.release();
  }
};


