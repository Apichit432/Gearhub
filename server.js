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

// ---------- API: ออกจากระบบ ----------
app.post('/api/logout', (req, res) => {
  res.clearCookie('gearhub_token');
  res.json({ ok: true });
});

// ---------- API: รายชื่อสมาชิกทั้งหมด (เฉพาะแอดมิน) ----------
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
  );
  res.json({ users: result.rows });
});

app.listen(PORT, () => {
  console.log(`GEARHUB server running on http://localhost:${PORT}`);
});
