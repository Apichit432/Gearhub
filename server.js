require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ถือว่า "ออนไลน์" ถ้ามี heartbeat เข้ามาภายในช่วงเวลานี้ ไม่งั้นแม้ is_online จะยังเป็น true
// (เช่น ปิดแท็บไปเลยโดยไม่ได้กดออกจากระบบ) หน้าแอดมินก็จะขึ้นว่าออฟไลน์ให้อัตโนมัติ
const ONLINE_THRESHOLD_SECONDS = 90;

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env — copy .env.example to .env and fill it in.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

app.use(express.json());
app.use(cookieParser());

// เสิร์ฟไฟล์หน้าเว็บ static ทั้งหมดจากโฟลเดอร์ "New Gearhub"
const STATIC_DIR = path.join(__dirname, 'New Gearhub');

// ---------- ด่านตรวจก่อนเข้าเว็บ: ต้องล็อกอิน/สมัครสมาชิกก่อนถึงจะดูหน้าเว็บอื่นได้ ----------
// หน้าเพจ (.html) ที่เข้าได้โดยไม่ต้องล็อกอิน มีแค่หน้าเข้าสู่ระบบกับสมัครสมาชิก
const PUBLIC_PAGES = new Set(['login.html', 'register.html']);

function getVerifiedUser(req) {
  const token = req.cookies?.gearhub_token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

app.get('/', (req, res) => {
  const user = getVerifiedUser(req);
  res.redirect(user ? '/Mainsite.html' : '/Login.html');
});

function pageGate(req, res, next) {
  let decodedPath;
  try { decodedPath = decodeURIComponent(req.path); } catch { decodedPath = req.path; }

  const ext = path.extname(decodedPath).toLowerCase();
  // ไม่ใช่ไฟล์หน้าเว็บ (รูปภาพ/ฟอนต์/ไฟล์ .js ฯลฯ) ปล่อยผ่านตามปกติ — หน้า login/register เองก็ต้องโหลดไฟล์พวกนี้ได้
  if (ext !== '.html') return next();

  const base = path.basename(decodedPath).toLowerCase();
  if (PUBLIC_PAGES.has(base)) return next();

  const user = getVerifiedUser(req);
  if (!user) return res.redirect('/Login.html');

  req.gearhubUser = user;
  next();
}

app.use(pageGate);
app.use(express.static(STATIC_DIR));

// ---------- Helpers ----------
function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role || 'member' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('gearhub_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function authMiddleware(req, res, next) {
  const token = req.cookies.gearhub_token;
  if (!token) return res.status(401).json({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'ต้องเป็นแอดมินเท่านั้นถึงเข้าถึงส่วนนี้ได้' });
  }
  next();
}

// ---------- เตรียม/อัปเดตโครงตาราง (เผื่อฐานข้อมูลเก่ายังไม่มีคอลัมน์สถานะออนไลน์) ----------
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          VARCHAR(150) NOT NULL,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          VARCHAR(20) NOT NULL DEFAULT 'member',
      is_online     BOOLEAN NOT NULL DEFAULT false,
      last_seen_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
}

// ---------- API: สมัครสมาชิก ----------
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'อีเมลนี้ถูกใช้สมัครสมาชิกไปแล้ว' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role, created_at',
      [name.trim(), email.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    await pool.query('UPDATE users SET is_online = true, last_seen_at = NOW() WHERE id = $1', [user.id]);
    setAuthCookie(res, user);
    res.status(201).json({ user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ กรุณาลองใหม่' });
  }
});

// ---------- API: เข้าสู่ระบบ ----------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });

    const result = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'ไม่พบบัญชีนี้ในระบบ' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

    await pool.query('UPDATE users SET is_online = true, last_seen_at = NOW() WHERE id = $1', [user.id]);
    setAuthCookie(res, user);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดฝั่งเซิร์ฟเวอร์ กรุณาลองใหม่' });
  }
});

// ---------- API: ผู้ใช้ปัจจุบัน ----------
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ---------- API: heartbeat — หน้าเว็บเรียกเป็นระยะขณะเปิดอยู่ เพื่อบอกว่ายังใช้งานอยู่ ----------
app.post('/api/heartbeat', authMiddleware, async (req, res) => {
  await pool.query('UPDATE users SET is_online = true, last_seen_at = NOW() WHERE id = $1', [req.user.id]);
  res.json({ ok: true });
});

// ---------- API: ออกจากระบบ ----------
app.post('/api/logout', async (req, res) => {
  const user = getVerifiedUser(req);
  if (user) {
    await pool.query('UPDATE users SET is_online = false WHERE id = $1', [user.id]).catch(() => {});
  }
  res.clearCookie('gearhub_token');
  res.json({ ok: true });
});

// ---------- API: รายชื่อสมาชิกทั้งหมด พร้อมสถานะออนไลน์/ออฟไลน์ (เฉพาะแอดมิน) ----------
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await pool.query(`
    SELECT id, name, email, role, created_at, last_seen_at,
           (is_online AND last_seen_at > NOW() - INTERVAL '${ONLINE_THRESHOLD_SECONDS} seconds') AS online
    FROM users
    ORDER BY online DESC, last_seen_at DESC NULLS LAST, created_at DESC
  `);
  res.json({ users: result.rows });
});

// ---------- API: ลบสมาชิก (เฉพาะแอดมิน) ----------
app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

  // กันไม่ให้แอดมินลบบัญชีตัวเองพลาด (เผื่อเหลือแอดมินคนเดียวจะได้ไม่ล็อกตัวเองออกจากระบบ)
  if (id === req.user.id) {
    return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });
  }

  const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'ไม่พบสมาชิกนี้ในระบบ' });
  res.json({ deleted: true });
});

migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GEARHUB server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('เตรียมฐานข้อมูลไม่สำเร็จ:', err);
    process.exit(1);
  });
