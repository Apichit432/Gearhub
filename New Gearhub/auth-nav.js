// auth-nav.js — เช็คสถานะล็อกอินแล้วอัปเดตปุ่ม "เข้าสู่ระบบ" บน header อัตโนมัติ
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .user-menu{ position:relative; }
    .user-menu-btn{
      display:flex; align-items:center; gap:8px;
      font-size:14.5px; font-weight:500; color:var(--ink);
      background:transparent; border:none; cursor:pointer; font-family:inherit;
      padding:0;
    }
    .user-menu-dropdown{
      position:absolute; top:calc(100% + 10px); right:0;
      background:#fff; border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.18);
      min-width:170px; padding:8px; display:none; z-index:50;
    }
    .user-menu.open .user-menu-dropdown{ display:block; }
    .user-menu-dropdown a, .user-menu-dropdown button{
      display:block; width:100%; text-align:left; padding:9px 12px;
      border-radius:8px; border:none; background:transparent; cursor:pointer;
      font-family:inherit; font-size:14px; color:var(--ink,#111);
    }
    .user-menu-dropdown a:hover, .user-menu-dropdown button:hover{ background:#f2f3f5; }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.querySelector('.login-btn');
    if (!loginBtn) return;

    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) return; // ยังไม่ได้ล็อกอิน ปล่อยปุ่มเดิมไว้

      const { user } = await res.json();

      const wrap = document.createElement('div');
      wrap.className = 'user-menu';
      wrap.innerHTML = `
        <button type="button" class="user-menu-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${user.name}
        </button>
        <div class="user-menu-dropdown">
          <button type="button" data-action="logout">ออกจากระบบ</button>
        </div>
      `;
      loginBtn.replaceWith(wrap);

      const btn = wrap.querySelector('.user-menu-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('open');
      });
      document.addEventListener('click', () => wrap.classList.remove('open'));

      wrap.querySelector('[data-action="logout"]').addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = 'Mainsite.html';
      });
    } catch (err) {
      // เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ก็ปล่อยปุ่มเดิมไว้เฉยๆ ไม่ต้องแจ้งเตือน
    }
  });
})();
