# GEARHUB — ระบบสมัครสมาชิก / เข้าสู่ระบบ

โปรเจกต์นี้เพิ่มเซิร์ฟเวอร์ Node.js (Express) เข้าไปในเว็บ GEARHUB เดิม
เพื่อเชื่อมต่อฐานข้อมูล Neon (PostgreSQL) และทำระบบสมัครสมาชิก/เข้าสู่ระบบจริง

## โครงสร้าง
- `server.js` — เซิร์ฟเวอร์หลัก มี API: `/api/register`, `/api/login`, `/api/me`, `/api/logout`, `/api/heartbeat`, `/api/users`
- `New Gearhub/` — ไฟล์หน้าเว็บเดิมทั้งหมด (เสิร์ฟเป็น static ไฟล์)
- `schema.sql` — คำสั่งสร้างตาราง `users` บน Neon
- `.env.example` — ตัวอย่างตัวแปรที่ต้องตั้งค่า

## ฟีเจอร์ที่เพิ่มเข้ามา
1. **ต้องล็อกอิน/สมัครสมาชิกก่อนถึงจะดูหน้าเว็บได้** — ทุกหน้า `.html` ยกเว้น `Login.html` และ `register.html`
   จะถูกเช็คสิทธิ์บนเซิร์ฟเวอร์ก่อนเสมอ (ไม่ใช่แค่ซ่อนปุ่มด้วย JavaScript) ถ้ายังไม่ได้ล็อกอินจะเด้งไปหน้า
   `Login.html` ให้อัตโนมัติ
2. **หน้าแอดมิน (`admin.html`) เห็นได้ว่าใครออนไลน์อยู่ตอนนี้ / ใครออฟไลน์ไปแล้ว** — ทุกหน้าเว็บที่ล็อกอินแล้ว
   จะส่ง "heartbeat" ไปเซิร์ฟเวอร์ทุก 30 วินาทีขณะเปิดหน้าอยู่ ถ้าไม่มี heartbeat เข้ามาเกิน 90 วินาที
   (เช่น ปิดแท็บไปเลยโดยไม่ได้กดออกจากระบบ) ระบบจะถือว่าออฟไลน์ให้อัตโนมัติ หน้าแอดมินจะรีเฟรชสถานะเองทุก 15 วินาที

## 1) ตั้งค่า Neon
1. สมัคร/ล็อกอินที่ https://neon.tech แล้วสร้างโปรเจกต์ใหม่
2. ไปที่ SQL editor ของ Neon แล้วรันคำสั่งในไฟล์ `schema.sql`
3. ไปที่ Connection Details คัดลอก connection string (ขึ้นต้นด้วย `postgres://...?sslmode=require`)

## 2) รันบนเครื่องตัวเอง (VS Code)
```bash
npm install
cp .env.example .env
# แก้ .env ใส่ DATABASE_URL จาก Neon และตั้ง JWT_SECRET เป็นข้อความสุ่มยาวๆ
npm run dev
```
เปิด http://localhost:3000/Login.html และ http://localhost:3000/register.html ทดสอบสมัคร/เข้าสู่ระบบ
แล้วเช็คว่าแถวใหม่เข้าไปอยู่ในตาราง `users` บน Neon dashboard จริง

## 3) ขึ้น GitHub
```bash
git init
git add .
git commit -m "init: gearhub with login/register backend"
git branch -M main
git remote add origin <URL ของ repo บน GitHub>
git push -u origin main
```
`.env` จะไม่ถูก push ขึ้นไป (มี `.gitignore` กันไว้แล้ว) — ต้องตั้งค่าตัวแปรแยกบน Render

## 4) Deploy บน Render
1. เข้า https://render.com → New → Web Service → เชื่อม repo GitHub นี้
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. ไปที่แท็บ Environment เพิ่มตัวแปร:
   - `DATABASE_URL` = connection string จาก Neon
   - `JWT_SECRET` = ค่าเดียวกับที่ตั้งในเครื่อง (หรือค่าใหม่ก็ได้)
5. กด Deploy รอจนสถานะ Live แล้วเปิด URL ที่ Render ให้มา ทดสอบ `/Login.html` และ `/register.html`

## หมายเหตุ
- รหัสผ่านถูกแฮชด้วย bcrypt ก่อนเก็บลงฐานข้อมูล ไม่เก็บ plain text
- การเข้าสู่ระบบใช้ JWT เก็บใน httpOnly cookie ชื่อ `gearhub_token`
- `/api/users` ใช้ดูรายชื่อสมาชิกทั้งหมดพร้อมสถานะออนไลน์ (เฉพาะแอดมิน — เซิร์ฟเวอร์เช็คสิทธิ์ role อีกชั้นเสมอ)
- ตารางฐานข้อมูลจะถูกสร้าง/อัปเดตคอลัมน์ใหม่ให้อัตโนมัติทุกครั้งที่เซิร์ฟเวอร์เริ่มทำงาน (ใช้ `ADD COLUMN IF NOT EXISTS`)
  ดังนั้นถ้าฐานข้อมูลเดิมมีตาราง `users` อยู่แล้วก็ไม่ต้องรัน `schema.sql` ซ้ำ — deploy ทับได้เลย
- ถ้าต้องการตั้งบัญชีใดบัญชีหนึ่งเป็นแอดมิน ให้ไปรันคำสั่งนี้ใน Neon SQL editor:
  `UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';`
