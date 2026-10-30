import { pool, createDatabaseIfNotExists } from '../config/db.js';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS } from '../config/permissions.js';

export async function initDatabase() {
  try {
    await createDatabaseIfNotExists();

    // 0. Roller Tablosu (Roles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        description VARCHAR(255) NULL,
        color VARCHAR(30) DEFAULT '#346c80',
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 0.1 Rol Yetkileri Tablosu (Role Permissions)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INT NOT NULL,
        permission_key VARCHAR(80) NOT NULL,
        PRIMARY KEY (role_id, permission_key),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 1. Kullanıcılar tablosu (Admin, Garson, Kasa, Mutfak)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'waiter',
        role_id INT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Gerekli kullanıcı sütunlarını güvenle ekle
    try {
      await pool.query('ALTER TABLE users ADD COLUMN role_id INT NULL AFTER role');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER name');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER role_id');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT "waiter"');
    } catch (e) {}

    // 2. Kategoriler tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'Coffee',
        image_url VARCHAR(500) DEFAULT NULL,
        order_num INT DEFAULT 0,
        status TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Var olan tablolar için güvenli kolon güncellemeleri
    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN image_url VARCHAR(500) DEFAULT NULL`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN status TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş'`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE categories ADD COLUMN show_in_qr TINYINT DEFAULT 1 COMMENT '1: QR Menüde Göster, 0: Gizle'`);
    } catch (e) { /* Kolon zaten var */ }

    // Eğer status kolonu yeni eklendiyse NULL olanları 1 yap
    try {
      await pool.query(`UPDATE categories SET status = 1 WHERE status IS NULL OR status = 0 AND is_active = 1`);
    } catch (e) { /* Geç */ }


    // 3. Ürünler tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        description TEXT,
        ingredients TEXT,
        price DECIMAL(10, 2) NOT NULL,
        cost_price DECIMAL(10, 2) DEFAULT NULL,
        image_url VARCHAR(500),
        order_num INT DEFAULT 0,
        status TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş',
        show_in_qr TINYINT DEFAULT 1 COMMENT '1: QR Menüde Göster, 0: Gizle',
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Var olan products tablosu için güvenli kolon güncellemeleri
    try {
      await pool.query(`ALTER TABLE products ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT NULL COMMENT 'Ürün Maliyeti (Opsiyonel)'`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE products ADD COLUMN ingredients TEXT DEFAULT NULL COMMENT 'İçindekiler / Malzemeler (Opsiyonel)'`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE products ADD COLUMN order_num INT DEFAULT 0`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE products ADD COLUMN status TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş'`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`ALTER TABLE products ADD COLUMN show_in_qr TINYINT DEFAULT 1 COMMENT '1: QR Menüde Göster, 0: Gizle'`);
    } catch (e) { /* Kolon zaten var */ }

    try {
      await pool.query(`UPDATE products SET status = 1 WHERE status IS NULL OR (status = 0 AND is_available = 1)`);
    } catch (e) { /* Geç */ }



    // 4. Masalar tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_tables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_number VARCHAR(20) UNIQUE NOT NULL,
        title VARCHAR(50) NOT NULL,
        status ENUM('empty', 'occupied', 'bill_requested') DEFAULT 'empty',
        qr_code_token VARCHAR(100) UNIQUE,
        order_num INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Siparişler tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(50) NULL,
        table_id INT NOT NULL,
        status ENUM('pending_approval', 'approved', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'pending_approval',
        source ENUM('pos', 'qr') DEFAULT 'pos',
        total_price DECIMAL(10, 2) DEFAULT 0.00,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Gerekirse order_number (GUID) sütunu ekle ve kayıtlara benzersiz UUID ata
    try {
      await pool.query('ALTER TABLE orders ADD COLUMN order_number VARCHAR(50) NULL AFTER id');
    } catch (e) {
      // Sütun zaten mevcut olabilir
    }
    try {
      await pool.query("UPDATE orders SET order_number = LOWER(UUID()) WHERE order_number IS NULL OR order_number = '' OR order_number LIKE 'FS-%'");
    } catch (e) {
      // Yoksay
    }

    // 6. Sipariş Detayları (Order Items)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        total_price DECIMAL(10, 2) NOT NULL,
        item_status ENUM('pending', 'preparing', 'ready', 'served', 'delivered') DEFAULT 'pending',
        is_paid TINYINT(1) DEFAULT 0,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query("ALTER TABLE order_items MODIFY COLUMN item_status VARCHAR(30) DEFAULT 'pending'");
    } catch (e) {
      // Sütun zaten güncel olabilir
    }
    try {
      await pool.query('ALTER TABLE order_items ADD COLUMN is_paid TINYINT(1) DEFAULT 0 AFTER item_status');
    } catch (e) {
      // Sütun zaten mevcut olabilir
    }

    // 7. Ödemeler / Fişler (Adisyon Kapanışları)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_id INT NOT NULL,
        order_id INT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        cash_amount DECIMAL(10, 2) DEFAULT 0.00,
        card_amount DECIMAL(10, 2) DEFAULT 0.00,
        discount DECIMAL(10, 2) DEFAULT 0.00,
        tip DECIMAL(10, 2) DEFAULT 0.00,
        payment_method VARCHAR(50) NOT NULL,
        customer_name VARCHAR(150) NULL,
        notes TEXT NULL,
        closed_by_user_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query('ALTER TABLE payments MODIFY COLUMN payment_method VARCHAR(50) NOT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN order_id INT NULL AFTER table_id');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN cash_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER total_amount');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN card_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER cash_amount');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN veresiye_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN discount DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN tip DECIMAL(10, 2) DEFAULT 0.00 AFTER discount');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN customer_name VARCHAR(150) NULL AFTER payment_method');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN notes TEXT NULL AFTER customer_name');
    } catch (e) {}

    // 8. Sistem Denetim İzi & Personel Hareket Günlüğü (Audit Logs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        user_name VARCHAR(100) NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT NULL,
        action_type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        details TEXT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        amount DECIMAL(10, 2) DEFAULT 0.00,
        quantity INT DEFAULT 0,
        table_title VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_entity (entity_type, entity_id),
        INDEX idx_user (user_id),
        INDEX idx_action (action_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Kategoriler ve Ürünler için personel damga sütunları
    try {
      await pool.query('ALTER TABLE categories ADD COLUMN created_by_user_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE categories ADD COLUMN updated_by_user_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE products ADD COLUMN created_by_user_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE products ADD COLUMN updated_by_user_id INT NULL');
    } catch (e) {}

    // 9. Müşteriler / Cariler Tablosu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NULL,
        notes TEXT NULL,
        total_debt DECIMAL(10, 2) DEFAULT 0.00,
        total_paid DECIMAL(10, 2) DEFAULT 0.00,
        current_balance DECIMAL(10, 2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        deleted_at TIMESTAMP NULL,
        deleted_by_user_id INT NULL,
        created_by_user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query('ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE customers ADD COLUMN deleted_by_user_id INT NULL AFTER deleted_at');
    } catch (e) {}

    // 10. Müşteri Cari Hareketleri (Borç / Veresiye, Tahsilat ve Borç Sıfırlama)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        transaction_type ENUM('debt', 'payment', 'debt_reset') NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        order_id INT NULL,
        table_id INT NULL,
        table_title VARCHAR(100) NULL,
        payment_method VARCHAR(50) NULL,
        cash_amount DECIMAL(10, 2) DEFAULT 0.00,
        card_amount DECIMAL(10, 2) DEFAULT 0.00,
        discount DECIMAL(10, 2) DEFAULT 0.00,
        tip DECIMAL(10, 2) DEFAULT 0.00,
        notes TEXT NULL,
        created_by_user_id INT NULL,
        created_by_user_name VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_cust (customer_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await pool.query("ALTER TABLE customer_transactions MODIFY COLUMN transaction_type ENUM('debt', 'payment', 'debt_reset') NOT NULL");
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE customer_transactions ADD COLUMN veresiye_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount');
    } catch (e) {}

    // Payments tablosuna müşteri ve esneklik alanları
    try {
      await pool.query('ALTER TABLE payments ADD COLUMN customer_id INT NULL AFTER order_id');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE payments MODIFY COLUMN table_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE orders ADD COLUMN customer_id INT NULL AFTER table_id');
    } catch (e) {}

    // Siparişler ve Kalemler için personel damga sütunları
    try {
      await pool.query('ALTER TABLE orders ADD COLUMN created_by_user_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE order_items ADD COLUMN created_by_user_id INT NULL');
    } catch (e) {}
    try {
      await pool.query('ALTER TABLE order_items ADD COLUMN status_updated_by_user_id INT NULL');
    } catch (e) {}

    // Mevcut aktif siparişlerdeki mükerrer ürün satırlarını tek satırda birleştir
    try {
      const [duplicates] = await pool.query(`
        SELECT order_id, product_id, COALESCE(note, '') as note_val, COUNT(*) as cnt, MIN(id) as keep_id, SUM(quantity) as total_qty, unit_price
        FROM order_items
        GROUP BY order_id, product_id, COALESCE(note, ''), unit_price
        HAVING cnt > 1
      `);
      for (const dup of duplicates) {
        const newTotal = dup.total_qty * parseFloat(dup.unit_price);
        await pool.query('UPDATE order_items SET quantity = ?, total_price = ? WHERE id = ?', [dup.total_qty, newTotal, dup.keep_id]);
        await pool.query(
          `DELETE FROM order_items 
           WHERE order_id = ? AND product_id = ? AND COALESCE(note, '') = ? AND id != ?`,
          [dup.order_id, dup.product_id, dup.note_val, dup.keep_id]
        );
      }
    } catch (e) {}

    // Varsayılan Rolleri Seed Et (admin, cashier, waiter, kitchen)
    const [existingRoles] = await pool.query('SELECT id, slug FROM roles');
    const existingSlugs = new Set(existingRoles.map(r => r.slug));

    const defaultRoles = [
      {
        name: 'İşletme Sahibi / Yönetici',
        slug: 'admin',
        description: 'Tüm sisteme tam erişim ve yönetim yetkisi (Görüntüleme, Ekleme, Düzenleme, Silme)',
        color: '#b45309',
        is_system: true,
        permissions: ALL_PERMISSIONS.map(p => p.key) // Tüm yetkiler
      },
      {
        name: 'Kasa Görevlisi',
        slug: 'cashier',
        description: 'Hesap kapatma, ödeme alma, fiş dökümü, cari işlemler ve temel raporlama',
        color: '#0284c7',
        is_system: true,
        permissions: [
          'pos.view', 'pos.create', 'pos.edit', 'pos.treat', 'pos.discount',
          'payment.view', 'payment.create', 'payment.veresiye', 'payment.mixed', 'payment.print',
          'customers.view', 'customers.create', 'customers.edit',
          'categories.view', 'products.view',
          'reports.view', 'reports.receipts', 'reports.z_report'
        ]
      },
      {
        name: 'Garson / Salon Personeli',
        slug: 'waiter',
        description: 'Masa siparişi açma, ürün ekleme, masa taşıma ve servis takibi',
        color: '#059669',
        is_system: true,
        permissions: [
          'pos.view', 'pos.create', 'pos.edit',
          'categories.view', 'products.view',
          'customers.view'
        ]
      },
      {
        name: 'Mutfak Ekranı',
        slug: 'kitchen',
        description: 'Mutfak sipariş kuyruğunu görme ve hazırlık durumunu güncelleme',
        color: '#ea580c',
        is_system: true,
        permissions: [
          'kitchen.view', 'kitchen.edit'
        ]
      }
    ];

    for (const defRole of defaultRoles) {
      if (!existingSlugs.has(defRole.slug)) {
        const [insertRes] = await pool.query(
          `INSERT INTO roles (name, slug, description, color, is_system) VALUES (?, ?, ?, ?, ?)`,
          [defRole.name, defRole.slug, defRole.description, defRole.color, defRole.is_system]
        );
        const newRoleId = insertRes.insertId;

        // İzinleri role_permissions tablosuna ekle
        if (defRole.permissions.length > 0) {
          const permValues = defRole.permissions.map(p => [newRoleId, p]);
          await pool.query(
            `INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?`,
            [permValues]
          );
        }
      }
    }

    // Varsayılan Kullanıcılar Kontrolü (Yoksa ekle)
    const [existingUsers] = await pool.query('SELECT id FROM users LIMIT 1');
    if (existingUsers.length === 0) {
      console.log('[MySQL] Varsayılan kullanıcılar oluşturuluyor...');
      const adminPass = await bcrypt.hash('admin123', 10);
      const cashierPass = await bcrypt.hash('kasa123', 10);
      const kitchenPass = await bcrypt.hash('mutfak123', 10);

      await pool.query(`
        INSERT INTO users (username, password, name, role) VALUES
        ('admin', ?, 'Yönetici (Admin)', 'admin'),
        ('kasa', ?, 'Kasa / Garson', 'cashier'),
        ('mutfak', ?, 'Mutfak Ekranı', 'kitchen')
      `, [adminPass, cashierPass, kitchenPass]);
      console.log('[MySQL] Varsayılan kullanıcılar eklendi (admin / kasa / mutfak)');
    }

    // Kullanıcıların role_id değerlerini eşleştir
    try {
      await pool.query(`
        UPDATE users u
        INNER JOIN roles r ON (
          (u.role = 'admin' AND r.slug = 'admin') OR
          (u.role = 'cashier' AND r.slug = 'cashier') OR
          (u.role = 'waiter' AND r.slug = 'waiter') OR
          (u.role = 'kitchen' AND r.slug = 'kitchen')
        )
        SET u.role_id = r.id
        WHERE u.role_id IS NULL
      `);
    } catch (e) {}

    // Varsayılan Masalar Kontrolü (Yoksa 12 masa ekle)
    const [existingTables] = await pool.query('SELECT id FROM restaurant_tables LIMIT 1');
    if (existingTables.length === 0) {
      console.log('[MySQL] Varsayılan masalar oluşturuluyor...');
      const tableInserts = [];
      for (let i = 1; i <= 12; i++) {
        tableInserts.push([`M-${i}`, `Masa ${i}`, 'empty', `token_table_${i}`]);
      }
      await pool.query(`
        INSERT INTO restaurant_tables (table_number, title, status, qr_code_token) VALUES ?
      `, [tableInserts]);
    }

    // Varsayılan Kategoriler & Ürünler Kontrolü
    const [existingCategories] = await pool.query('SELECT id FROM categories LIMIT 1');
    if (existingCategories.length === 0) {
      console.log('[MySQL] Örnek kategoriler ve ürünler ekleniyor...');
      const [catResult] = await pool.query(`
        INSERT INTO categories (name, icon, order_num) VALUES
        ('Sıcak İçecekler', 'Coffee', 1),
        ('Soğuk İçecekler', 'CupSoda', 2),
        ('Tatlılar & Pastalar', 'Cake', 3),
        ('Atıştırmalıklar', 'UtensilsCrossed', 4)
      `);
      const catId = catResult.insertId;

      await pool.query(`
        INSERT INTO products (category_id, name, description, price, is_available) VALUES
        (?, 'Türk Kahvesi', 'Geleneksel közde pişmiş Türk kahvesi, lokum ile', 65.00, 1),
        (?, 'Filtre Kahve', 'Taze çekilmiş kaliteli harman', 85.00, 1),
        (?, 'Latte', 'Espresso ve kadifemsi süt kreması', 95.00, 1),
        (? + 1, 'Ice Americano', 'Buzlu taze espresso', 90.00, 1),
        (? + 1, 'Ev Yapımı Limonata', 'Taze nane ve limon ile ferahlatıcı', 85.00, 1),
        (? + 2, 'San Sebastian Cheesecake', 'Akışkan Belçika çikolatası eşliğinde', 150.00, 1),
        (? + 3, 'Karışık Tost', 'Kaşar peyniri, sucuk ve patates kızartması ile', 130.00, 1)
      `, [catId, catId, catId, catId, catId, catId, catId]);
    }

    console.log('[MySQL] Veritabanı tabloları başarıyla doğrulandı / hazırlandı.');
  } catch (error) {
    console.error('[MySQL] initDatabase hatası:', error);
    throw error;
  }
}
