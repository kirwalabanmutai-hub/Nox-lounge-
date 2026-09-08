/* Tiny API client + shared helpers */
const API = {
  token: localStorage.getItem('pos_token') || null,
  user: JSON.parse(localStorage.getItem('pos_user') || 'null'),

  setSession(token, user) {
    this.token = token; this.user = user;
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
  },
  clearSession() {
    this.token = null; this.user = null;
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
  },

  async request(method, path, body) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      // No connection at all (or the local server isn't running). Tagged
      // `.offline` so callers (e.g. checkout) can queue-and-retry instead
      // of just failing.
      setOffline(true);
      const err = new Error('No connection — working offline.');
      err.offline = true;
      throw err;
    }
    setOffline(false);
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (res.status === 401 && this.token) {
      this.clearSession();
      location.reload();
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
  get(p) { return this.request('GET', p); },
  post(p, b) { return this.request('POST', p, b); },
  put(p, b) { return this.request('PUT', p, b); },
  del(p) { return this.request('DELETE', p); },
};

/* connection banner - shown when the local server is unreachable */
function setOffline(on) {
  let el = document.getElementById('offline-bar');
  if (on) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-bar';
      el.textContent = '⚠ No connection - working offline. Sales are saved on this device and will sync automatically.';
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:60;background:#991b1b;color:#fff;' +
        'text-align:center;padding:.4rem;font-size:.85rem;font-weight:600';
      document.body.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

/* formatting helpers */
let CURRENCY = 'KES';
const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'));
  return isNaN(d) ? String(s) : d.toLocaleString();
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast-item ${kind}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
