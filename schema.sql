-- รันไฟล์นี้ใน Neon SQL editor ครั้งเดียวตอนตั้งฐานข้อมูล

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'member',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ถ้าตาราง users มีอยู่แล้วจากก่อนหน้านี้ (ยังไม่มีคอลัมน์ role) ให้รันบรรทัดนี้แยกเพิ่ม:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member';

-- ตั้งให้บัญชีที่สมัครไว้แล้วเป็นแอดมิน (แก้อีเมลให้ตรงกับบัญชีจริงที่ต้องการ):
-- UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
