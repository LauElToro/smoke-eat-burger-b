import * as path from "node:path";
import * as fs from "node:fs";
import dotenv from "dotenv";
import { pool } from "../db/index.js";

// Cargar .env.test
const envPath = path.resolve(process.cwd(), ".env.test");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Helpers DB
export async function resetDb() {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("CREATE TABLE IF NOT EXISTS users ( \
      id CHAR(36) NOT NULL PRIMARY KEY, \
      email VARCHAR(191) NOT NULL UNIQUE, \
      password_hash VARCHAR(191) NOT NULL, \
      role VARCHAR(10) NOT NULL DEFAULT 'USER', \
      points INT NOT NULL DEFAULT 0, \
      spend_remainder INT NOT NULL DEFAULT 0, \
      referral_code VARCHAR(32) NULL UNIQUE, \
      referred_by_id CHAR(36) NULL, \
      email_verified_at DATETIME NULL, \
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, \
      INDEX ix_users_referred_by (referred_by_id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    await conn.query("CREATE TABLE IF NOT EXISTS email_verification_tokens ( \
      id CHAR(36) NOT NULL PRIMARY KEY, \
      user_id CHAR(36) NOT NULL, \
      token VARCHAR(191) NOT NULL UNIQUE, \
      expires_at DATETIME NOT NULL, \
      used_at DATETIME NULL, \
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      INDEX idx_evt_user (user_id), \
      CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    await conn.query("CREATE TABLE IF NOT EXISTS password_reset_tokens ( \
      id CHAR(36) NOT NULL PRIMARY KEY, \
      user_id CHAR(36) NOT NULL, \
      token VARCHAR(191) NOT NULL UNIQUE, \
      expires_at DATETIME NOT NULL, \
      used_at DATETIME NULL, \
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      INDEX idx_prt_user (user_id), \
      CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    await conn.query("CREATE TABLE IF NOT EXISTS reward_events ( \
      id CHAR(36) NOT NULL PRIMARY KEY, \
      user_id CHAR(36) NOT NULL, \
      type VARCHAR(32) NOT NULL, \
      amount_pesos INT NULL, \
      points INT NOT NULL, \
      meta_json TEXT NULL, \
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      INDEX idx_re_user (user_id), \
      INDEX idx_re_type (type), \
      CONSTRAINT fk_re_user FOREIGN KEY (user_id) REFERENCES users(id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    await conn.query("CREATE TABLE IF NOT EXISTS reward_redemptions ( \
      id CHAR(36) NOT NULL PRIMARY KEY, \
      user_id CHAR(36) NOT NULL, \
      tier_code VARCHAR(64) NOT NULL, \
      points_cost INT NOT NULL, \
      voucher_code VARCHAR(32) NOT NULL UNIQUE, \
      status ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING', \
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      completed_at DATETIME NULL, \
      INDEX idx_rr_user (user_id), \
      INDEX idx_rr_status (status), \
      CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id) \
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Limpiar tablas en orden seguro
    await conn.query("TRUNCATE TABLE reward_events");
    await conn.query("TRUNCATE TABLE reward_redemptions");
    await conn.query("TRUNCATE TABLE email_verification_tokens");
    await conn.query("TRUNCATE TABLE password_reset_tokens");
    await conn.query("TRUNCATE TABLE users");

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}
