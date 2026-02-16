-- Schema for MariaDB/MySQL migration
-- Run this in your database management tool (e.g. PHPMyAdmin)

CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id VARCHAR(255),
    hex_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(255) NOT NULL UNIQUE,
    quantity INT DEFAULT 1,
    category VARCHAR(255),
    category_details VARCHAR(255),
    image VARCHAR(255),
    scanned_code VARCHAR(255),
    created_at DATETIME NOT NULL,
    last_updated DATETIME NOT NULL,
    details TEXT,
    status VARCHAR(50),
    item_type VARCHAR(50),
    brand VARCHAR(100),
    model VARCHAR(100),
    rental_end_date DATETIME,
    current_rental_id INT,
    custom_data JSON,
    parent_id INT,
    display_order INT
);

CREATE TABLE IF NOT EXISTS custom_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    field_key VARCHAR(255) NOT NULL UNIQUE,
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',
    options TEXT,
    required TINYINT(1) DEFAULT 0,
    display_order INT DEFAULT 0,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS deleted_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    deleted_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message TEXT,
    type VARCHAR(50),
    item_serial_number VARCHAR(255),
    item_hex_id VARCHAR(255),
    created_at DATETIME NOT NULL
);

-- Initial categories
INSERT IGNORE INTO custom_categories (name, created_at) VALUES 
('ordinateur', NOW()),
('casque_vr', NOW()),
('camera', NOW()),
('eclairage', NOW()),
('accessoire', NOW());
