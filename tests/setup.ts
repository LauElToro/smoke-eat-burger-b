import { beforeAll } from "vitest";
import { pool } from "../src/db";

export async function resetDb() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    await conn.query("DROP TABLE IF EXISTS reward_redemptions");
    await conn.query("DROP TABLE IF EXISTS reward_events");
    await conn.query("DROP TABLE IF EXISTS email_verification_tokens");
    await conn.query("DROP TABLE IF EXISTS users");

    await conn.query(`
      CREATE TABLE users (
        id CHAR(36) NOT NULL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(120) NULL,
        role ENUM('user','admin') NOT NULL DEFAULT 'user',
        referral_code VARCHAR(32) UNIQUE,
        referred_by_id CHAR(36) NULL,
        points INT NOT NULL DEFAULT 0,
        points_remainder_cents INT NOT NULL DEFAULT 0,
        email_verified_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (referred_by_id),
        CONSTRAINT fk_users_ref
          FOREIGN KEY (referred_by_id) REFERENCES users(id)
          ON DELETE SET NULL
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE email_verification_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        token CHAR(64) NOT NULL UNIQUE,
        user_id CHAR(36) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        CONSTRAINT fk_evt_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE reward_events (
        id CHAR(36) NOT NULL PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        kind ENUM('purchase','referral_bonus','redeem') NOT NULL,
        points INT NOT NULL,
        meta JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        CONSTRAINT fk_re_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE reward_redemptions (
        id CHAR(36) NOT NULL PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        reward_code VARCHAR(64) NOT NULL,
        points_cost INT NOT NULL,
        status ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
        voucher_code VARCHAR(32) UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (user_id),
        CONSTRAINT fk_rr_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

beforeAll(async () => {
  await resetDb();
});
