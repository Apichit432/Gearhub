-- รันไฟล์นี้ใน Neon SQL editor ครั้งเดียวตอนตั้งฐานข้อมูล

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'member',
  is_online     BOOLEAN NOT NULL DEFAULT false,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ถ้าตาราง users มีอยู่แล้วจากก่อนหน้านี้ (ยังไม่มีคอลัมน์พวกนี้) ให้รันบรรทัดพวกนี้แยกเพิ่ม:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
-- หมายเหตุ: server.js รันคำสั่ง ALTER TABLE ... ADD COLUMN IF NOT EXISTS พวกนี้ให้อัตโนมัติทุกครั้งที่เซิร์ฟเวอร์เริ่มทำงานอยู่แล้ว
-- จึงไม่จำเป็นต้องรันเองก็ได้ (รันไว้เผื่อไว้ก็ไม่มีผลเสีย เพราะมี IF NOT EXISTS กันซ้ำ)

-- ตั้งให้บัญชีที่สมัครไว้แล้วเป็นแอดมิน (แก้อีเมลให้ตรงกับบัญชีจริงที่ต้องการ):
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
