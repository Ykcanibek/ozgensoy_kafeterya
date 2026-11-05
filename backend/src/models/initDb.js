import { pool, createDatabaseIfNotExists } from '../config/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  ALL_PERMISSIONS,
  PERMISSION_KEYS,
  DEFAULT_ROLES,
  LEGACY_PERMISSION_MAP,
  normalizePermissions
} from '../config/permissions.js';

export async function initDatabase() {
  try {
    await createDatabaseIfNotExists();

    // Şema yardımcıları: değişiklik yalnızca veritabanında gerçekten gerekiyorsa yapılır.
    // Gerçek hatalar yutulmaz; sunucu açılmaz ve hatayı söyler (eskiden her açılışta denenip hatalar sessizce geçiliyordu).
    const columnInfo = async (table, column) => {
      const [rows] = await pool.query(
        `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      return rows[0] || null;
    };
    const addColumn = async (table, column, definition) => {
      if (await columnInfo(table, column)) return false;
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      return true;
    };
    const addIndex = async (table, name, columns) => {
      const [rows] = await pool.query(
        'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
        [table, name]
      );
      if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`);
    };
    const modifyColumn = async (table, column, definition, isCurrent) => {
      const info = await columnInfo(table, column);
      if (info && !isCurrent(info)) await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
    };
    // Tek seferlik veri taşımaları (schema_migrations tablosunda adıyla işaretlenir)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    const runOnce = async (name, fn) => {
      const [done] = await pool.query('SELECT 1 FROM schema_migrations WHERE name = ?', [name]);
      if (done.length) return;
      await fn();
      await pool.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
    };

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
    await addColumn('users', 'role_id', `INT NULL AFTER role`);
    await addColumn('users', 'phone', `VARCHAR(20) NULL AFTER name`);
    await addColumn('users', 'is_active', `TINYINT(1) DEFAULT 1 AFTER role_id`);
    await modifyColumn('users', 'role', "VARCHAR(50) NOT NULL DEFAULT 'waiter'", c => c.columnType === 'varchar(50)' && c.nullable === 'NO');
    await addColumn('users', 'last_login_at', `TIMESTAMP NULL AFTER is_active`);
    await addColumn('users', 'created_by_user_id', `INT NULL AFTER last_login_at`);
    // Şifre değişince artar: eski sürümle imzalanmış oturumlar geçersiz olur
    await addColumn('users', 'token_version', `INT NOT NULL DEFAULT 0 AFTER created_by_user_id`);

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
    await addColumn('categories', 'image_url', `VARCHAR(500) DEFAULT NULL`);

    const categoryStatusAdded = await addColumn('categories', 'status', "TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş'");

    await addColumn('categories', 'show_in_qr', `TINYINT DEFAULT 1 COMMENT '1: QR Menüde Göster, 0: Gizle'`);

    // status sütunu ilk kez eklendiyse eski is_active değerinden doldur. Yalnızca o an çalışır: eskiden her açılışta
    // çalıştığı için pasife alınan kategoriler (status = 0, is_active = 1) her yeniden başlatmada aktif oluyordu.
    if (categoryStatusAdded) {
      await pool.query('UPDATE categories SET status = 1 WHERE status IS NULL OR (status = 0 AND is_active = 1)');
    }


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
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Var olan products tablosu için güvenli kolon güncellemeleri
    await addColumn('products', 'cost_price', `DECIMAL(10, 2) DEFAULT NULL COMMENT 'Ürün Maliyeti (Opsiyonel)'`);

    await addColumn('products', 'ingredients', `TEXT DEFAULT NULL COMMENT 'İçindekiler / Malzemeler (Opsiyonel)'`);

    await addColumn('products', 'order_num', `INT DEFAULT 0`);

    const productStatusAdded = await addColumn('products', 'status', "TINYINT DEFAULT 1 COMMENT '1: Aktif, 0: Pasif, -1: Silinmiş'");

    await addColumn('products', 'show_in_qr', `TINYINT DEFAULT 1 COMMENT '1: QR Menüde Göster, 0: Gizle'`);

    if (productStatusAdded) {
      await pool.query('UPDATE products SET status = 1 WHERE status IS NULL OR (status = 0 AND is_available = 1)');
    }



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
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Gerekirse order_number (GUID) sütunu ekle ve kayıtlara benzersiz UUID ata
    await addColumn('orders', 'order_number', 'VARCHAR(50) NULL AFTER id');
    await runOnce('orders_order_number_uuid_v1', () => pool.query(
      "UPDATE orders SET order_number = LOWER(UUID()) WHERE order_number IS NULL OR order_number = '' OR order_number LIKE 'FS-%'"
    ));

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
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await modifyColumn('order_items', 'item_status', "VARCHAR(30) DEFAULT 'pending'", c => c.columnType === 'varchar(30)');
    await addColumn('order_items', 'is_paid', 'TINYINT(1) DEFAULT 0 AFTER item_status');

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

    await modifyColumn('payments', 'payment_method', 'VARCHAR(50) NOT NULL', c => c.columnType === 'varchar(50)');
    await addColumn('payments', 'order_id', `INT NULL AFTER table_id`);
    await addColumn('payments', 'cash_amount', `DECIMAL(10, 2) DEFAULT 0.00 AFTER total_amount`);
    await addColumn('payments', 'card_amount', `DECIMAL(10, 2) DEFAULT 0.00 AFTER cash_amount`);
    await addColumn('payments', 'veresiye_amount', `DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount`);
    await addColumn('payments', 'discount', `DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount`);
    await addColumn('payments', 'tip', `DECIMAL(10, 2) DEFAULT 0.00 AFTER discount`);
    await addColumn('payments', 'customer_name', `VARCHAR(150) NULL AFTER payment_method`);
    await addColumn('payments', 'notes', `TEXT NULL AFTER customer_name`);

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
    await addColumn('categories', 'created_by_user_id', `INT NULL`);
    await addColumn('categories', 'updated_by_user_id', `INT NULL`);
    await addColumn('products', 'created_by_user_id', `INT NULL`);
    await addColumn('products', 'updated_by_user_id', `INT NULL`);

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

    await addColumn('customers', 'deleted_at', `TIMESTAMP NULL AFTER is_active`);
    await addColumn('customers', 'deleted_by_user_id', `INT NULL AFTER deleted_at`);

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
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        INDEX idx_cust (customer_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await modifyColumn('customer_transactions', 'transaction_type', "ENUM('debt', 'payment', 'debt_reset') NOT NULL",
      c => c.columnType === "enum('debt','payment','debt_reset')");
    await addColumn('customer_transactions', 'veresiye_amount', `DECIMAL(10, 2) DEFAULT 0.00 AFTER card_amount`);

    // Payments tablosuna müşteri ve esneklik alanları
    await addColumn('payments', 'customer_id', `INT NULL AFTER order_id`);
    await modifyColumn('payments', 'table_id', 'INT NULL', c => c.nullable === 'YES');
    await addColumn('orders', 'customer_id', `INT NULL AFTER table_id`);

    // Tahsilatlar adisyona ve tarihe göre sorgulanır (masa açma, rapor, kasa defteri)
    await addIndex('payments', 'idx_payments_order', 'order_id');
    await addIndex('payments', 'idx_payments_created', 'created_at');

    // Adisyon kapanış zamanı: satış raporları adisyonun kapandığı güne göre hesaplanır
    await addColumn('orders', 'closed_at', 'DATETIME NULL AFTER created_at');
    await addIndex('orders', 'idx_orders_closed', 'status, closed_at');
    // Eski kapanmış adisyonlar: kapanış zamanı = son tahsilat zamanı (yoksa açılış zamanı)
    await pool.query(`
      UPDATE orders o SET o.closed_at = COALESCE((SELECT MAX(p.created_at) FROM payments p WHERE p.order_id = o.id), o.created_at)
      WHERE o.status IN ('completed', 'cancelled') AND o.closed_at IS NULL
    `);

    // Siparişler ve Kalemler için personel damga sütunları
    await addColumn('orders', 'created_by_user_id', `INT NULL`);
    await addColumn('order_items', 'created_by_user_id', `INT NULL`);
    await addColumn('order_items', 'status_updated_by_user_id', 'INT NULL');
    // Kalemin durumunun son değiştiği an (mutfakta "son teslim edilenler" teslim saatine göre gösterilir)
    await addColumn('order_items', 'status_updated_at', 'DATETIME NULL AFTER status_updated_by_user_id');

    // Ödeme geri alma: ürün seçilerek alınan tahsilatın hangi üründen kaç adet ödediği. Adisyonda aynı ürünün ödenen
    // satırları birleşik görünür; tahsilat geri alınınca bu kayda göre o adetler tekrar ödenmemiş olur.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        item_status VARCHAR(30) NOT NULL,
        qr_request_id INT NULL,
        note VARCHAR(255) NULL,
        quantity INT NOT NULL,
        INDEX idx_pi_payment (payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await addColumn('customer_transactions', 'payment_id', 'INT NULL AFTER order_id');
    // 1: ödenen ürünleri payment_items'ta kayıtlı tahsilat (geri alınabilir). Eski tahsilatlarda boştur.
    await addColumn('payments', 'items_tracked', 'TINYINT(1) NULL AFTER notes');
    // Geri alınan tahsilatlar: ödeme satırı tahsilatlardan çıkarılır (raporlar, gün sonu ve kalan borç kendiliğinden düzelir),
    // kaydın kendisi neden ve yapan kişiyle burada saklanır
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_reversals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL,
        order_id INT NULL,
        table_id INT NULL,
        table_title VARCHAR(100) NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        cash_amount DECIMAL(10, 2) DEFAULT 0.00,
        card_amount DECIMAL(10, 2) DEFAULT 0.00,
        veresiye_amount DECIMAL(10, 2) DEFAULT 0.00,
        discount DECIMAL(10, 2) DEFAULT 0.00,
        tip DECIMAL(10, 2) DEFAULT 0.00,
        payment_method VARCHAR(50) NOT NULL,
        customer_id INT NULL,
        customer_name VARCHAR(150) NULL,
        paid_at DATETIME NOT NULL,
        paid_by_user_id INT NULL,
        items_json LONGTEXT NULL,
        reason VARCHAR(255) NOT NULL,
        reversed_by_user_id INT NULL,
        reversed_by_name VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pr_order (order_id),
        INDEX idx_pr_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Not: Eskiden burada her açılışta tüm adisyonlardaki aynı ürün satırları durum/ödeme ayrımı yapılmadan
    // birleştiriliyordu; bu, ikram/iade/iptal ve ödenmiş/ödenmemiş kalemleri karıştırıp satış geçmişini bozuyordu.
    // Satır birleştirme yalnızca sipariş/ödeme işlemlerinin içinde, aynı durum ve fiyattaki satırlar için yapılır.

    // Rol bazlı limitler: İndirim üst sınırı (% olarak, NULL = sınırsız)
    await addColumn('roles', 'max_discount_percent', `DECIMAL(5,2) NULL AFTER color`);

    // Fire & Zayi kayıtları: SKT geçen, bozulan, dökülen veya işletmede kullanılan ürün/malzeme.
    // Menü ürünü (product_id) ya da serbest malzeme adı (item_name) olabilir. Silme yumuşaktır (deleted_at).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waste_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NULL,
        item_name VARCHAR(150) NOT NULL,
        quantity DECIMAL(12, 3) NOT NULL,
        unit VARCHAR(20) NOT NULL DEFAULT 'adet',
        reason VARCHAR(30) NOT NULL,
        unit_cost DECIMAL(10, 2) NULL,
        total_cost DECIMAL(12, 2) NULL,
        note VARCHAR(500) NULL,
        occurred_at DATETIME NOT NULL,
        created_by_user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        deleted_by_user_id INT NULL,
        INDEX idx_waste_occurred (occurred_at),
        INDEX idx_waste_reason (reason),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Kasa Defteri: dallanmalı gelir/gider kategorileri (ana kategori → alt kategori) ve kayıtları.
    // Kayıtta category_id her zaman ANA kategoridir; subcategory_id doluysa o ana kategorinin alt kategorisidir.
    // Tek seferde birden çok alt kategoriye girilen tutarlar (ör. Faturalar → Elektrik + Su) aynı batch_id'yi taşır.
    // amount KDV dahil tutardır; vat_amount ve net_amount kayıt anında hesaplanıp saklanır. Silme yumuşaktır (deleted_at + gerekçe).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_book_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entry_type ENUM('income', 'expense') NOT NULL,
        parent_id INT NULL,
        name VARCHAR(100) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        order_num INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cb_cat_parent (parent_id),
        FOREIGN KEY (parent_id) REFERENCES cash_book_categories(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_book_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entry_type ENUM('income', 'expense', 'transfer') NOT NULL,
        entry_date DATE NOT NULL,
        category_id INT NULL,
        subcategory_id INT NULL,
        batch_id VARCHAR(36) NULL,
        amount DECIMAL(12, 2) NOT NULL,
        vat_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
        vat_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        net_amount DECIMAL(12, 2) NOT NULL,
        payment_method ENUM('cash', 'card', 'bank', 'company_card', 'other') NOT NULL DEFAULT 'cash',
        transfer_to ENUM('cash', 'card', 'bank', 'company_card', 'other') NULL,
        document_type VARCHAR(20) NOT NULL DEFAULT 'none',
        document_no VARCHAR(60) NULL,
        counterparty VARCHAR(150) NULL,
        tax_number VARCHAR(20) NULL,
        description VARCHAR(500) NULL,
        created_by_user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by_user_id INT NULL,
        updated_at TIMESTAMP NULL,
        deleted_at TIMESTAMP NULL,
        deleted_by_user_id INT NULL,
        delete_reason VARCHAR(255) NULL,
        INDEX idx_cb_date (entry_date),
        INDEX idx_cb_type (entry_type),
        INDEX idx_cb_batch (batch_id),
        FOREIGN KEY (category_id) REFERENCES cash_book_categories(id) ON DELETE RESTRICT,
        FOREIGN KEY (subcategory_id) REFERENCES cash_book_categories(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migration: kasa defterinin ilk sürümü (düz kategoriler + ön/arka muhasebe) dallanmalı kategori yapısına taşınır
    const columnsOf = async (table) => {
      const [cols] = await pool.query(
        'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]
      );
      return new Set(cols.map(c => c.name));
    };
    const catCols = await columnsOf('cash_book_categories');
    if (!catCols.has('parent_id')) {
      await pool.query('ALTER TABLE cash_book_categories ADD COLUMN parent_id INT NULL AFTER entry_type, ADD INDEX idx_cb_cat_parent (parent_id)');
      await pool.query('ALTER TABLE cash_book_categories ADD CONSTRAINT fk_cb_cat_parent FOREIGN KEY (parent_id) REFERENCES cash_book_categories(id) ON DELETE RESTRICT');
    }
    const [oldUnique] = await pool.query(
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cash_book_categories' AND INDEX_NAME = 'uq_cb_cat' LIMIT 1"
    );
    if (oldUnique.length) await pool.query('ALTER TABLE cash_book_categories DROP INDEX uq_cb_cat'); // aynı ad farklı ana kategoride olabilir
    const entryCols = await columnsOf('cash_book_entries');
    if (entryCols.has('ledger')) {
      const [idx] = await pool.query(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cash_book_entries' AND INDEX_NAME = 'idx_cb_type' LIMIT 1"
      );
      if (idx.length) await pool.query('ALTER TABLE cash_book_entries DROP INDEX idx_cb_type');
      await pool.query('ALTER TABLE cash_book_entries DROP COLUMN ledger, ADD INDEX idx_cb_type (entry_type)');
    }
    if (!entryCols.has('subcategory_id')) {
      await pool.query('ALTER TABLE cash_book_entries ADD COLUMN subcategory_id INT NULL AFTER category_id, ADD COLUMN batch_id VARCHAR(36) NULL AFTER subcategory_id, ADD INDEX idx_cb_batch (batch_id)');
      await pool.query('ALTER TABLE cash_book_entries ADD CONSTRAINT fk_cb_entry_sub FOREIGN KEY (subcategory_id) REFERENCES cash_book_categories(id) ON DELETE RESTRICT');
    }
    await modifyColumn('cash_book_entries', 'description', 'VARCHAR(500) NULL', c => c.nullable === 'YES');
    const [treeMig] = await pool.query("SELECT name FROM schema_migrations WHERE name = 'cashbook_category_tree_v1'");
    if (treeMig.length === 0) {
      // Henüz hiç kayıt girilmediyse eski düz kategori listesi yerine dallanmalı varsayılanlar kurulur;
      // kayıt varsa mevcut kategoriler ana kategori olarak kalır (veri kaybı olmaz)
      const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM cash_book_entries');
      if (Number(cnt) === 0) await pool.query('DELETE FROM cash_book_categories');
      await pool.query("INSERT INTO schema_migrations (name) VALUES ('cashbook_category_tree_v1')");
    }

    // Varsayılan dallanmalı kategoriler (ana kategori: [alt kategoriler]); yalnızca hiç kategori yokken kurulur
    const [cbCats] = await pool.query('SELECT id FROM cash_book_categories LIMIT 1');
    if (cbCats.length === 0) {
      const tree = {
        income: [
          ['Satış Gelirleri', ['Kitap Satışı', 'Ürün & Hediyelik Satışı', 'Paket Servis']],
          ['Etkinlik & Atölye', ['Atölye Katılım Ücreti', 'Salon Kiralama', 'Sponsorluk & Bağış']],
          ['Kira Gelirleri', []],
          ['Finansal Gelirler', ['Banka Faizi', 'Kur Farkı']],
          ['Sermaye & Devir', ['Kasa Açılış Bakiyesi', 'Ortak Sermaye Girişi']],
          ['Diğer Gelirler', []]
        ],
        expense: [
          ['Faturalar', ['Elektrik', 'Su', 'Doğalgaz', 'İnternet', 'Telefon']],
          ['Personel Giderleri', ['Maaş', 'SGK Primi', 'Avans', 'Prim & İkramiye', 'Bahşiş Ödemesi', 'Yemek & Yol']],
          ['Hammadde & Malzeme', ['Kahve & Çay', 'Süt & Süt Ürünleri', 'Pastane & Tatlı', 'Meşrubat', 'Ambalaj & Sarf']],
          ['Kira & Aidat', ['Dükkan Kirası', 'Aidat', 'Depo Kirası']],
          ['Vergi & Resmi Ödemeler', ['KDV', 'Stopaj', 'Muhtasar', 'Harç & Ceza']],
          ['Bakım & Onarım', ['Makine & Ekipman', 'Tesisat', 'Tadilat']],
          ['Temizlik & Hijyen', []],
          ['Muhasebe & Danışmanlık', []],
          ['Demirbaş & Ekipman', []],
          ['Reklam & Tanıtım', []],
          ['Banka & POS Komisyonu', []],
          ['Ulaşım & Kargo', []],
          ['Diğer Giderler', []]
        ]
      };
      for (const [entryType, mains] of Object.entries(tree)) {
        for (const [i, [name, subs]] of mains.entries()) {
          const [res] = await pool.query(
            'INSERT INTO cash_book_categories (entry_type, parent_id, name, order_num) VALUES (?, NULL, ?, ?)', [entryType, name, i + 1]
          );
          if (subs.length) {
            await pool.query('INSERT INTO cash_book_categories (entry_type, parent_id, name, order_num) VALUES ?', [
              subs.map((sub, j) => [entryType, res.insertId, sub, j + 1])
            ]);
          }
        }
      }
    }

    // Gün sonu ciro kayıtları: her gece önceki günün POS tahsilatları kasa defterine kalıcı gelir olarak işlenir.
    // details: o günün ayrıntılı ciro raporu (satış kırılımı, tahsilatlar, saatlik dağılım, kategori ve ürün satışları; JSON)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_book_daily_closings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        business_date DATE NOT NULL,
        cash_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        card_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        net_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,
        order_count INT NOT NULL DEFAULT 0,
        details LONGTEXT NOT NULL,
        trigger_type VARCHAR(10) NOT NULL DEFAULT 'auto',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL,
        updated_by_user_id INT NULL,
        UNIQUE KEY uq_cb_closing_date (business_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    const cbCatCols = await columnsOf('cash_book_categories');
    if (!cbCatCols.has('system_key')) {
      await pool.query('ALTER TABLE cash_book_categories ADD COLUMN system_key VARCHAR(30) NULL AFTER name, ADD UNIQUE KEY uq_cb_cat_system (system_key)');
    }
    const cbEntryCols = await columnsOf('cash_book_entries');
    if (!cbEntryCols.has('source')) {
      await pool.query(`ALTER TABLE cash_book_entries
        ADD COLUMN source ENUM('manual', 'pos_daily') NOT NULL DEFAULT 'manual' AFTER entry_type,
        ADD COLUMN closing_id INT NULL AFTER batch_id,
        ADD INDEX idx_cb_closing (closing_id)`);
    }
    // Hesaplar: POS kart tahsilatı (müşteriden gelen, bankaya geçecek) ile şirket kredi kartı (işletmenin harcaması, borç)
    // ayrı hesaplardır. Hesaplar arası transfer (ör. kart borcunu bankadan ödeme) gelir/gider sayılmaz.
    if (!cbEntryCols.has('transfer_to')) {
      await pool.query(`ALTER TABLE cash_book_entries
        MODIFY entry_type ENUM('income', 'expense', 'transfer') NOT NULL,
        MODIFY category_id INT NULL,
        MODIFY payment_method ENUM('cash', 'card', 'bank', 'company_card', 'other') NOT NULL DEFAULT 'cash',
        ADD COLUMN transfer_to ENUM('cash', 'card', 'bank', 'company_card', 'other') NULL AFTER payment_method`);
      // Eski kayıtlarda kartla yapılan giderler işletmenin kendi kartıyla yapılmıştır (POS kartı gider ödeyemez)
      const [moved] = await pool.query(
        "UPDATE cash_book_entries SET payment_method = 'company_card' WHERE source = 'manual' AND entry_type = 'expense' AND payment_method = 'card'"
      );
      if (moved.affectedRows) console.log(`[MySQL] ${moved.affectedRows} kartlı gider kaydı "Şirket Kredi Kartı" hesabına taşındı.`);
    }
    // Gün sonu cirosunun sistem kategorisi (Günlük Ciro (POS) › Nakit / Kart); elle kayıtta seçilemez, pasife alınamaz
    const ensureSystemCategory = async (key, name, parentId, order) => {
      const [[row]] = await pool.query('SELECT id FROM cash_book_categories WHERE system_key = ?', [key]);
      if (row) return row.id;
      const [res] = await pool.query(
        "INSERT INTO cash_book_categories (entry_type, parent_id, name, system_key, order_num) VALUES ('income', ?, ?, ?, ?)",
        [parentId, name, key, order]
      );
      return res.insertId;
    };
    const posMainId = await ensureSystemCategory('pos_daily', 'Günlük Ciro (POS)', null, 0);
    await ensureSystemCategory('pos_daily_cash', 'Nakit Tahsilat', posMainId, 1);
    await ensureSystemCategory('pos_daily_card', 'Kartlı Tahsilat', posMainId, 2);
    // Bahşiş işletmeye kalır; personele dağıtılırsa gider olarak girilir: mevcut kurulumlara alt kategori eklenir
    await runOnce('cashbook_tip_payout_category_v1', async () => {
      const [[parent]] = await pool.query(
        "SELECT id FROM cash_book_categories WHERE entry_type = 'expense' AND parent_id IS NULL AND name = 'Personel Giderleri' LIMIT 1"
      );
      if (!parent) return;
      const [[exists]] = await pool.query("SELECT id FROM cash_book_categories WHERE parent_id = ? AND name = 'Bahşiş Ödemesi'", [parent.id]);
      if (exists) return;
      const [[{ next }]] = await pool.query('SELECT COALESCE(MAX(order_num), 0) + 1 AS next FROM cash_book_categories WHERE parent_id = ?', [parent.id]);
      await pool.query("INSERT INTO cash_book_categories (entry_type, parent_id, name, order_num) VALUES ('expense', ?, 'Bahşiş Ödemesi', ?)", [parent.id, next]);
    });
    // Eski gün sonu açıklamaları ("Gün sonu cirosu — ...") hangi güne ait olduğunu da yazacak şekilde güncellenir
    await runOnce('cashbook_closing_desc_v2', () => pool.query(`
      UPDATE cash_book_entries
      SET description = CONCAT(DATE_FORMAT(entry_date, '%d.%m.%Y'), ' günlük ciro (otomatik kayıt) — ', SUBSTRING(description, 19))
      WHERE source = 'pos_daily' AND description LIKE 'Gün sonu cirosu — %'
    `));

    // QR menü siparişleri: müşterinin masadaki QR ile gönderdiği istek. Personel onaylayınca masanın adisyonuna eklenir.
    // client_session: müşterinin telefonundaki rastgele kimlik (yalnızca kendi siparişlerini görsün diye)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_order_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_id INT NOT NULL,
        client_session VARCHAR(64) NOT NULL,
        items JSON NOT NULL,
        note VARCHAR(500) NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        estimated_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        reject_reason VARCHAR(255) NULL,
        order_id INT NULL,
        client_ip VARCHAR(64) NULL,
        handled_by_user_id INT NULL,
        handled_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_qr_table_status (table_id, status),
        INDEX idx_qr_session (client_session),
        FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    // Onaylanan QR siparişinin kalemleri, müşterinin hazırlık durumunu izleyebilmesi için isteğe bağlanır
    await addColumn('order_items', 'qr_request_id', 'INT NULL');
    await addIndex('order_items', 'idx_order_items_qr', 'qr_request_id');
    // Masa her boşaldığında (ödeme, iptal, taşıma, birleştirme, elle kapatma) yazılır:
    // QR menüdeki "masanın siparişleri" listesi bu andan sonrasını gösterir, önceki müşterilerinki görünmez
    await addColumn('restaurant_tables', 'qr_reset_at', `DATETIME NULL`);

    // İşletme ayarları (anahtar-değer): ör. QR'dan sipariş alma açık/kapalı
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL,
        updated_by_user_id INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Masa QR anahtarları tahmin edilemez olmalı: eski/zayıf anahtarları (ör. "token_table_1") güvenli rastgele anahtarla değiştir.
    // Eski biçimli anahtar taraması yalnızca bir kez yapılır: güvenli rastgele bir anahtar da tesadüfen "qr_" ile başlayabilir
    // ve her açılışta taransaydı masaya yapıştırılmış QR kod bir yeniden başlatmada geçersiz olabilirdi.
    // (Yeni masalar zaten güvenli anahtarla oluşturulur; her açılışta yalnızca anahtarı hiç olmayan masalar tamamlanır.)
    let legacyTokenScan = false;
    await runOnce('qr_tokens_legacy_scan_v1', async () => { legacyTokenScan = true; });
    const [weakTokens] = await pool.query(
      legacyTokenScan
        ? "SELECT id FROM restaurant_tables WHERE qr_code_token IS NULL OR CHAR_LENGTH(qr_code_token) < 20 OR qr_code_token LIKE 'token_table_%' OR qr_code_token LIKE 'qr\\_%'"
        : "SELECT id FROM restaurant_tables WHERE qr_code_token IS NULL OR CHAR_LENGTH(qr_code_token) < 16"
    );
    for (const t of weakTokens) {
      await pool.query('UPDATE restaurant_tables SET qr_code_token = ? WHERE id = ?', [crypto.randomBytes(16).toString('base64url'), t.id]);
    }
    if (weakTokens.length) console.log(`[MySQL] ${weakTokens.length} masanın QR anahtarı güvenli anahtarla yenilendi.`);

    // Tek seferlik veri taşımalarını (migration) takip eden tablo
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Migration: Yetki kataloğu v2 — eski yetki anahtarlarını yeni karşılıklarına taşı (yalnızca bir kez çalışır)
    const [permV2] = await pool.query("SELECT name FROM schema_migrations WHERE name = 'permissions_v2'");
    if (permV2.length === 0) {
      const [rolePermRows] = await pool.query('SELECT role_id, permission_key FROM role_permissions');
      const keysByRole = new Map();
      for (const row of rolePermRows) {
        if (!keysByRole.has(row.role_id)) keysByRole.set(row.role_id, []);
        const mapped = LEGACY_PERMISSION_MAP[row.permission_key];
        keysByRole.get(row.role_id).push(...(mapped ? [row.permission_key, ...mapped] : [row.permission_key]));
      }
      for (const [roleId, keys] of keysByRole) {
        const normalized = normalizePermissions(keys);
        await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        if (normalized.length > 0) {
          await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?', [normalized.map(k => [roleId, k])]);
        }
      }
      await pool.query("INSERT INTO schema_migrations (name) VALUES ('permissions_v2')");
      console.log(`[MySQL] Yetki kataloğu v2'ye taşındı (${keysByRole.size} rol güncellendi).`);
    }

    // Migration: Rol sadeleştirme — sistem rollerinin adları kısaltılır, kullanılmayan "Vardiya Sorumlusu" rolü kaldırılır
    const [rolesV2] = await pool.query("SELECT name FROM schema_migrations WHERE name = 'roles_simplify_v1'");
    if (rolesV2.length === 0) {
      for (const defRole of DEFAULT_ROLES) {
        await pool.query('UPDATE roles SET name = ? WHERE slug = ? AND is_system = TRUE', [defRole.name, defRole.slug]);
      }
      const [managerRole] = await pool.query("SELECT id FROM roles WHERE slug = 'manager' AND is_system = TRUE");
      if (managerRole.length > 0) {
        const [[assigned]] = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE role_id = ?', [managerRole[0].id]);
        if (Number(assigned.cnt) === 0) {
          await pool.query('DELETE FROM roles WHERE id = ?', [managerRole[0].id]); // yetkileri ON DELETE CASCADE ile silinir
          console.log('[MySQL] Kullanılmayan "Vardiya Sorumlusu" rolü kaldırıldı.');
        } else {
          // Personeli olan rol silinmez (personel rolsüz kalmasın); yönetici Yetkiler sayfasından taşıyıp silebilir
          await pool.query("UPDATE roles SET is_system = FALSE WHERE id = ?", [managerRole[0].id]);
          console.warn(`[MySQL] "Vardiya Sorumlusu" rolünde ${assigned.cnt} personel olduğu için silinmedi; Yetkiler sayfasından silinebilir.`);
        }
      }
      await pool.query("INSERT INTO schema_migrations (name) VALUES ('roles_simplify_v1')");
      console.log('[MySQL] Sistem rollerinin adları güncellendi.');
    }

    // Varsayılan Sistem Rollerini Seed Et (eksik olanları ekle)
    const [existingRoles] = await pool.query('SELECT id, slug FROM roles');
    const existingSlugs = new Set(existingRoles.map(r => r.slug));

    for (const defRole of DEFAULT_ROLES) {
      if (!existingSlugs.has(defRole.slug)) {
        const [insertRes] = await pool.query(
          `INSERT INTO roles (name, slug, description, color, max_discount_percent, is_system) VALUES (?, ?, ?, ?, ?, TRUE)`,
          [defRole.name, defRole.slug, defRole.description, defRole.color, defRole.max_discount_percent ?? null]
        );
        const permissions = normalizePermissions(defRole.permissions);
        if (permissions.length > 0) {
          await pool.query(
            `INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?`,
            [permissions.map(p => [insertRes.insertId, p])]
          );
        }
      }
    }

    // Migration: Fire & Zayi yetkileri — mevcut sistem rollerine varsayılan Fire & Zayi yetkilerini bir kez ekle
    const [wasteMig] = await pool.query("SELECT name FROM schema_migrations WHERE name = 'waste_permissions_v1'");
    if (wasteMig.length === 0) {
      for (const defRole of DEFAULT_ROLES) {
        const wasteKeys = defRole.permissions.filter(k => k.startsWith('waste.'));
        if (wasteKeys.length === 0) continue;
        const [roleRow] = await pool.query('SELECT id FROM roles WHERE slug = ?', [defRole.slug]);
        if (roleRow.length === 0) continue;
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?', [wasteKeys.map(k => [roleRow[0].id, k])]);
      }
      await pool.query("INSERT INTO schema_migrations (name) VALUES ('waste_permissions_v1')");
      console.log('[MySQL] Fire & Zayi yetkileri varsayılan rollere eklendi.');
    }

    // Migration: Kasa Defteri yetkileri — mevcut sistem rollerine varsayılan kasa defteri yetkilerini bir kez ekle
    const [cashbookMig] = await pool.query("SELECT name FROM schema_migrations WHERE name = 'cashbook_permissions_v1'");
    if (cashbookMig.length === 0) {
      for (const defRole of DEFAULT_ROLES) {
        const keys = defRole.permissions.filter(k => k.startsWith('cashbook.'));
        if (keys.length === 0) continue;
        const [roleRow] = await pool.query('SELECT id FROM roles WHERE slug = ?', [defRole.slug]);
        if (roleRow.length === 0) continue;
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?', [keys.map(k => [roleRow[0].id, k])]);
      }
      await pool.query("INSERT INTO schema_migrations (name) VALUES ('cashbook_permissions_v1')");
      console.log('[MySQL] Kasa Defteri yetkileri varsayılan rollere eklendi.');
    }

    // Satış geçmişi korunur: ürün/kategori/masa/müşteri veritabanından doğrudan silinse bile bağlı sipariş,
    // ödeme ve cari kayıtları zincirleme silinmez (uygulama zaten pasife alarak siler). Eski kurulumlardaki
    // ON DELETE CASCADE kuralları RESTRICT'e çevrilir; zaten çevrilmişse hiçbir şey yapılmaz.
    const HISTORY_FKS = [
      ['order_items', 'product_id', 'products'],
      ['products', 'category_id', 'categories'],
      ['orders', 'table_id', 'restaurant_tables'],
      ['customer_transactions', 'customer_id', 'customers']
    ];
    for (const [table, column, refTable] of HISTORY_FKS) {
      const [fks] = await pool.query(
        `SELECT k.CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
         WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = ? AND k.COLUMN_NAME = ?
           AND k.REFERENCED_TABLE_NAME = ? AND r.DELETE_RULE = 'CASCADE'`,
        [table, column, refTable]
      );
      for (const fk of fks) {
        // MySQL aynı ALTER içinde aynı adlı kısıtı silip yeniden eklemeye izin vermez; iki adımda yapılır.
        // Mevcut kısıt veri bütünlüğünü zaten garanti ettiği için yeniden ekleme başarısız olmaz.
        await pool.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``);
        await pool.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(id) ON DELETE RESTRICT`
        );
        console.log(`[MySQL] ${table}.${column} silme kuralı RESTRICT yapıldı (satış geçmişi korunur).`);
      }
    }

    // Katalogda artık bulunmayan yetki anahtarlarını temizle
    await pool.query('DELETE FROM role_permissions WHERE permission_key NOT IN (?)', [[...PERMISSION_KEYS]]);

    // Yönetici (admin) rolü her zaman tüm yetkilere sahiptir (kataloğa eklenen yeni yetkiler dahil)
    const [adminRole] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
    if (adminRole.length > 0) {
      await pool.query(
        'INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES ?',
        [ALL_PERMISSIONS.map(p => [adminRole[0].id, p.key])]
      );
    }

    // Gizli hesaplar: personel listesi, sayımlar ve raporlarda görünmez (sistem onları "yok" sayar)
    await addColumn('users', 'is_hidden', `TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`);

    // İlk kurulum: kullanıcı yoksa yalnızca gizli geliştirici hesabı oluşturulur (yönetici yetkisinde).
    // Bilgiler .env'den okunur; şifre koda yazılmaz, veritabanına yalnızca bcrypt özeti kaydedilir.
    const devAccount = {
      name: process.env.DEV_ACCOUNT_NAME?.trim(),
      username: process.env.DEV_ACCOUNT_USERNAME?.trim().toLowerCase(),
      password: process.env.DEV_ACCOUNT_PASSWORD,
      phone: process.env.DEV_ACCOUNT_PHONE?.replace(/\D/g, '') || null
    };
    const [existingUsers] = await pool.query('SELECT id FROM users LIMIT 1');
    if (existingUsers.length === 0) {
      if (devAccount.name && devAccount.username && devAccount.password) {
        const [adminRow] = await pool.query("SELECT id FROM roles WHERE slug = 'admin'");
        const hash = await bcrypt.hash(devAccount.password, 10);
        await pool.query(
          `INSERT INTO users (username, password, name, phone, role, role_id, is_active, is_hidden)
           VALUES (?, ?, ?, ?, 'admin', ?, 1, 1)`,
          [devAccount.username, hash, devAccount.name, devAccount.phone, adminRow[0]?.id || null]
        );
        console.log('[MySQL] Gizli geliştirici hesabı oluşturuldu.');
      } else {
        console.warn('[MySQL] Kullanıcı yok ve .env içinde DEV_ACCOUNT_* bilgileri eksik; hiçbir hesap oluşturulmadı.');
      }
    }
    // Geliştirici hesabı her zaman gizli kalır
    if (devAccount.username) {
      await pool.query('UPDATE users SET is_hidden = 1 WHERE username = ?', [devAccount.username]);
      // Tam yetkili gizli hesap kısa şifreyle kalmasın: canlıya çıkmadan önce uyar
      const [devRows] = await pool.query('SELECT password FROM users WHERE username = ?', [devAccount.username]);
      if (devRows[0] && devAccount.password && devAccount.password.length < 10 &&
          await bcrypt.compare(devAccount.password, devRows[0].password)) {
        console.warn('[Güvenlik] Gizli geliştirici hesabının şifresi çok kısa (10 karakterden az). Canlıya çıkmadan önce uzun bir şifreyle değiştirin.');
      }
    }

    // Eski sürümden kalan, rolü yalnızca metin olarak tutulan kullanıcıların role_id değerlerini eşleştir
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

    // Varsayılan Masalar Kontrolü (Yoksa 12 masa ekle)
    const [existingTables] = await pool.query('SELECT id FROM restaurant_tables LIMIT 1');
    if (existingTables.length === 0) {
      console.log('[MySQL] Varsayılan masalar oluşturuluyor...');
      const tableInserts = [];
      for (let i = 1; i <= 12; i++) {
        tableInserts.push([`M-${i}`, `Masa ${i}`, 'empty', crypto.randomBytes(16).toString('base64url')]);
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
