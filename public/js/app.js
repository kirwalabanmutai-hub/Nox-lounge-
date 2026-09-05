/* ============================================================
   Liquor POS - front-end SPA (vanilla JS, hash routing)
   ============================================================ */

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'sell', label: 'Sell', icon: '🛒' },
  { id: 'products', label: 'Products', icon: '📦' },
  { id: 'inventory', label: 'Inventory', icon: '🔄' },
  { id: 'sales', label: 'Sales', icon: '🧾' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const content = () => document.getElementById('content');
const cart = []; // { product, quantity }

/* ---------------------------------------------------------- boot */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', onLogin);
  document.getElementById('logout').addEventListener('click', () => { API.clearSession(); location.reload(); });
  window.addEventListener('hashchange', route);

  if (API.token && API.user) showApp();
  else showLogin();
});

async function onLogin(e) {
  e.preventDefault();
  const f = e.target;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const { token, user } = await API.post('/auth/login', {
      username: f.username.value, password: f.password.value,
    });
    API.setSession(token, user);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('app-view').classList.add('hidden');
}

async function showApp() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');
  document.getElementById('who').textContent = API.user.name;
  document.getElementById('who-role').textContent = API.user.role;

  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map((n) =>
    `<a class="nav-link" href="#${n.id}"><span>${n.icon}</span><span class="hidden md:inline">${n.label}</span></a>`
  ).join('');

  try { const s = await API.get('/settings'); if (s && s.currency) CURRENCY = s.currency; } catch { /* ignore */ }

  if (!location.hash) location.hash = '#dashboard';
  route();
}

function route() {
  const id = (location.hash.replace('#', '') || 'dashboard').split('?')[0];
  document.querySelectorAll('.nav-link').forEach((a) =>
    a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
  const view = VIEWS[id] || VIEWS.dashboard;
  content().innerHTML = `<div class="text-slate-400 text-sm">Loading…</div>`;
  view().catch((err) => {
    content().innerHTML = `<div class="card p-6 text-red-600">${esc(err.message)}</div>`;
  });
}

/* ---------------------------------------------------------- helpers */
function pageHead(title, sub, actions = '') {
  return `<div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div><h1 class="text-2xl font-bold">${esc(title)}</h1>
    ${sub ? `<p class="text-sm text-slate-500 mt-1">${esc(sub)}</p>` : ''}</div>
    <div class="flex gap-2">${actions}</div></div>`;
}
const stockBadge = (p) => p.stock_quantity <= 0
  ? '<span class="badge badge-red">Out</span>'
  : p.stock_quantity <= p.reorder_level
    ? '<span class="badge badge-amber">Low</span>'
    : '<span class="badge badge-green">OK</span>';
const canManage = () => ['admin', 'manager'].includes(API.user.role);
const PAYMENT_LABELS = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', bank: 'Bank', credit: 'Credit' };
const paymentLabel = (m) => PAYMENT_LABELS[m] || (m ? m[0].toUpperCase() + m.slice(1) : m);

/* ========================================================== VIEWS */
const VIEWS = {};

/* -------------------------------------------------- Dashboard */
VIEWS.dashboard = async () => {
  const d = await API.get('/dashboard/summary');
  const maxSales = Math.max(1, ...d.last7.map((r) => r.sales));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const row = d.last7.find((r) => r.day === key);
    days.push({ key, sales: row ? row.sales : 0 });
  }

  const stat = (label, value, extra = '') =>
    `<div class="card p-4"><p class="text-xs uppercase tracking-wide text-slate-400">${label}</p>
     <p class="text-xl font-bold mt-1">${value}</p>
     ${extra ? `<p class="text-xs text-slate-400 mt-1">${extra}</p>` : ''}</div>`;

  content().innerHTML = pageHead('Dashboard', `Welcome back, ${API.user.name}`) + `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      ${stat("Today's Sales", money(d.today.sales), `${d.today.receipts} receipts`)}
      ${stat("Today's Profit", money(d.today.gross_profit), `Discounts ${money(d.today.discount)}`)}
      ${stat('This Month', money(d.month.sales), `${d.month.receipts} receipts`)}
      ${stat('Stock Value', money(d.inventory.stock_value), `${d.inventory.products} products`)}
    </div>

    <div class="grid lg:grid-cols-3 gap-4 mt-4">
      <div class="card p-5 lg:col-span-2">
        <p class="font-semibold mb-3">Last 7 days</p>
        <div class="spark">${days.map((x) =>
          `<span title="${x.key}: ${money(x.sales)}" style="height:${Math.max(3, (x.sales / maxSales) * 100)}%"></span>`).join('')}</div>
        <div class="flex justify-between text-[10px] text-slate-400 mt-1">
          ${days.map((x) => `<span>${x.key.slice(5)}</span>`).join('')}
        </div>
      </div>
      <div class="card p-5">
        <p class="font-semibold mb-3">Low stock ${d.inventory.low_stock ? `<span class="badge badge-amber">${d.inventory.low_stock}</span>` : ''}</p>
        <div id="lowbox" class="text-sm text-slate-500">—</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-4 mt-4">
      <div class="card p-5">
        <p class="font-semibold mb-3">Top products (30 days)</p>
        <table class="data"><thead><tr><th>Product</th><th>Qty</th><th class="text-right">Revenue</th></tr></thead>
        <tbody>${d.topProducts.map((p) =>
          `<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td class="text-right">${money(p.revenue)}</td></tr>`).join('') ||
          '<tr><td colspan="3" class="text-slate-400">No sales yet</td></tr>'}</tbody></table>
      </div>
      <div class="card p-5">
        <p class="font-semibold mb-3">Recent sales</p>
        <table class="data"><thead><tr><th>Receipt</th><th>Cashier</th><th class="text-right">Total</th></tr></thead>
        <tbody>${d.recentSales.map((s) =>
          `<tr><td><a class="text-brand hover:underline" href="#sales">${esc(s.receipt_number)}</a></td>
           <td>${esc(s.cashier_name)}</td><td class="text-right">${money(s.total_amount)}</td></tr>`).join('') ||
          '<tr><td colspan="3" class="text-slate-400">No sales yet</td></tr>'}</tbody></table>
      </div>
    </div>`;

  const low = await API.get('/inventory/low-stock');
  document.getElementById('lowbox').innerHTML = low.length
    ? low.map((p) => `<div class="flex justify-between py-1 border-b border-slate-100 last:border-0">
        <span>${esc(p.name)} <span class="text-slate-400">${esc(p.size || '')}</span></span>
        <span class="font-semibold ${p.stock_quantity <= 0 ? 'text-red-600' : 'text-amber-600'}">${p.stock_quantity}</span></div>`).join('')
    : '<span class="text-green-600">Everything well stocked ✔</span>';
};

/* -------------------------------------------------- Sell (POS terminal) */
VIEWS.sell = async () => {
  const [products, cats] = await Promise.all([API.get('/products'), API.get('/categories')]);
  let mpesaConfigured = false;
  try { mpesaConfigured = (await API.get('/mpesa/config')).configured; } catch { /* endpoint optional */ }

  content().innerHTML = pageHead('Sell', 'Add products to the cart and check out') + `
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 card p-4">
        <div class="flex gap-2 mb-3">
          <input id="psearch" class="input" autofocus placeholder="Search name / brand — or scan a barcode + Enter" />
          <select id="pcat" class="input" style="max-width:160px">
            <option value="">All categories</option>
            ${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div id="pgrid" class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[65vh] overflow-y-auto"></div>
      </div>

      <div class="card p-4 flex flex-col">
        <p class="font-semibold mb-2">Cart</p>
        <div id="cartbox" class="flex-1 overflow-y-auto divide-y divide-slate-100 text-sm"></div>
        <div class="border-t border-slate-200 mt-2 pt-3 space-y-1 text-sm">
          <div class="flex justify-between"><span>Subtotal</span><span id="c-sub">—</span></div>
          <label class="flex justify-between items-center gap-2"><span>Discount</span>
            <input id="c-disc" type="number" min="0" value="0" class="input text-right" style="max-width:110px"></label>
          <div class="flex justify-between text-slate-500"><span>Tax</span><span id="c-tax">—</span></div>
          <div class="flex justify-between text-lg font-bold"><span>Total</span><span id="c-total">—</span></div>
        </div>
        <button id="checkout" class="btn btn-primary w-full justify-center mt-3" disabled>Checkout</button>
      </div>
    </div>`;

  let allProducts = products;
  const settings = await API.get('/settings');

  const renderGrid = () => {
    const q = document.getElementById('psearch').value.toLowerCase().trim();
    const cat = document.getElementById('pcat').value;
    const list = allProducts.filter((p) =>
      (!cat || String(p.category_id) === cat) &&
      (!q || p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || p.barcode === q || p.sku === q));
    document.getElementById('pgrid').innerHTML = list.map((p) => `
      <button data-id="${p.id}" class="text-left border border-slate-200 rounded-lg p-2 hover:border-brand hover:bg-brand/5 transition ${p.stock_quantity <= 0 ? 'opacity-40 pointer-events-none' : ''}">
        <p class="font-semibold text-sm leading-tight">${esc(p.name)}</p>
        <p class="text-xs text-slate-400">${esc(p.brand || '')} ${esc(p.size || '')}</p>
        <p class="text-sm mt-1 font-bold text-brand">${money(p.selling_price)}</p>
        <p class="text-[11px] text-slate-400">Stock: ${p.stock_quantity}</p>
      </button>`).join('') || '<p class="text-slate-400 text-sm col-span-full">No products match.</p>';
    document.querySelectorAll('#pgrid button').forEach((b) =>
      b.addEventListener('click', () => addToCart(Number(b.dataset.id))));
  };

  const addToCart = (id) => {
    const product = allProducts.find((p) => p.id === id);
    const line = cart.find((l) => l.product.id === id);
    const inCart = line ? line.quantity : 0;
    if (inCart + 1 > product.stock_quantity) return toast('Not enough stock', 'error');
    if (line) line.quantity++;
    else cart.push({ product, quantity: 1 });
    renderCart();
  };

  const renderCart = () => {
    const box = document.getElementById('cartbox');
    box.innerHTML = cart.map((l, i) => `
      <div class="py-2 flex items-center gap-2">
        <div class="flex-1">
          <p class="font-medium">${esc(l.product.name)}</p>
          <p class="text-xs text-slate-400">${money(l.product.selling_price)} each</p>
        </div>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost !px-2 !py-0.5" data-act="dec" data-i="${i}">−</button>
          <span class="w-6 text-center">${l.quantity}</span>
          <button class="btn btn-ghost !px-2 !py-0.5" data-act="inc" data-i="${i}">+</button>
        </div>
        <span class="w-20 text-right font-semibold">${money(l.product.selling_price * l.quantity)}</span>
        <button class="text-red-400 hover:text-red-600" data-act="rm" data-i="${i}">✕</button>
      </div>`).join('') || '<p class="text-slate-400 py-4 text-center">Cart is empty</p>';

    box.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      if (b.dataset.act === 'inc') addToCart(cart[i].product.id);
      else if (b.dataset.act === 'dec') { cart[i].quantity--; if (cart[i].quantity <= 0) cart.splice(i, 1); renderCart(); }
      else if (b.dataset.act === 'rm') { cart.splice(i, 1); renderCart(); }
    }));

    const sub = cart.reduce((s, l) => s + l.product.selling_price * l.quantity, 0);
    const disc = Math.min(Number(document.getElementById('c-disc').value) || 0, sub);
    const taxable = Math.max(sub - disc, 0);
    const tax = settings.tax_enabled ? taxable * (settings.tax_rate / 100) : 0;
    document.getElementById('c-sub').textContent = money(sub);
    document.getElementById('c-tax').textContent = money(tax);
    document.getElementById('c-total').textContent = money(taxable + tax);
    document.getElementById('checkout').disabled = cart.length === 0;
  };

  const searchEl = document.getElementById('psearch');
  searchEl.addEventListener('input', renderGrid);
  // Barcode scanners act as a keyboard and send Enter at the end of the code.
  searchEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = searchEl.value.trim();
    if (!raw) return;
    const q = raw.toLowerCase();
    const exact = allProducts.find((p) => p.barcode === raw || p.sku === raw);
    const matches = allProducts.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q));
    const hit = exact || (matches.length === 1 ? matches[0] : null);
    if (hit) {
      addToCart(hit.id);
      searchEl.value = '';
      renderGrid();
    } else {
      toast(matches.length ? 'Multiple matches — pick one' : 'No product for that code', 'error');
    }
    searchEl.focus();
  });
  document.getElementById('pcat').addEventListener('change', renderGrid);
  document.getElementById('c-disc').addEventListener('input', renderCart);
  document.getElementById('checkout').addEventListener('click', () => openCheckout(settings, mpesaConfigured));

  renderGrid();
  renderCart();
};

function openCheckout(settings, mpesaConfigured) {
  const sub = cart.reduce((s, l) => s + l.product.selling_price * l.quantity, 0);
  const disc = Math.min(Number(document.getElementById('c-disc').value) || 0, sub);
  const taxable = Math.max(sub - disc, 0);
  const tax = settings.tax_enabled ? taxable * (settings.tax_rate / 100) : 0;
  const total = taxable + tax;
  let stkPoll = null;

  modal(`
    <h2 class="text-lg font-bold mb-1">Checkout</h2>
    <p class="text-sm text-slate-500 mb-4">Amount due <span class="font-bold text-slate-800">${money(total)}</span></p>
    <form id="pay-form" class="space-y-3">
      <label class="block text-sm font-medium">Payment method
        <select name="method" class="input mt-1">
          <option value="cash">Cash</option><option value="mpesa">M-Pesa</option>
          <option value="card">Card</option><option value="bank">Bank</option>
        </select></label>

      <div data-block="manual" class="space-y-3">
        <label class="block text-sm font-medium">Amount received
          <input name="received" type="number" min="0" step="0.01" value="${total.toFixed(2)}" class="input mt-1"></label>
        <label class="block text-sm font-medium" data-ref hidden>Reference
          <input name="reference" class="input mt-1"></label>
      </div>

      <div data-block="mpesa" hidden class="space-y-2">
        ${mpesaConfigured ? `
          <label class="block text-sm font-medium">Customer phone
            <input name="phone" placeholder="07XXXXXXXX" class="input mt-1"></label>
          <button type="button" id="send-stk" class="btn btn-primary w-full justify-center">
            📲 Send prompt to customer's phone
          </button>
          <p id="stk-status" class="text-sm text-slate-500 min-h-[1.5em]"></p>
        ` : `<p class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              M-Pesa phone prompts aren't set up on this till yet (see INSTALL.md).
              Choose Cash, Card or Bank instead.</p>`}
      </div>

      <label class="block text-sm font-medium">Customer name (optional)
        <input name="customer" class="input mt-1"></label>
      <p id="change-line" class="text-sm text-slate-500"></p>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button id="submit-btn" class="btn btn-primary">Complete sale</button>
      </div>
    </form>`);

  const form = document.getElementById('pay-form');
  const refWrap = form.querySelector('[data-ref]');
  const manualBlock = form.querySelector('[data-block="manual"]');
  const mpesaBlock = form.querySelector('[data-block="mpesa"]');
  const submitBtn = document.getElementById('submit-btn');
  const stkBtn = document.getElementById('send-stk');
  const stkStatus = document.getElementById('stk-status');

  const stopPoll = () => { if (stkPoll) { clearInterval(stkPoll); stkPoll = null; } };
  const modalGone = () => !document.getElementById('modal');

  const syncMethod = () => {
    stopPoll();
    const isMpesa = form.method.value === 'mpesa';
    manualBlock.hidden = isMpesa;
    mpesaBlock.hidden = !isMpesa;
    refWrap.hidden = form.method.value === 'cash';
    submitBtn.hidden = isMpesa;                 // M-Pesa completes itself once confirmed
    if (isMpesa && stkStatus) stkStatus.textContent = '';
    if (isMpesa && stkBtn) stkBtn.disabled = false;
  };
  form.method.addEventListener('change', syncMethod);
  syncMethod();

  const updateChange = () => {
    const rec = Number(form.received.value) || 0;
    document.getElementById('change-line').textContent =
      rec >= total ? `Change: ${money(rec - total)}` : `Balance: ${money(total - rec)}`;
  };
  form.received.addEventListener('input', updateChange);
  updateChange();

  async function finalizeSale(payment) {
    const sale = await API.post('/sales', {
      customer_name: form.customer.value || null,
      discount: disc,
      items: cart.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      payments: [payment],
    });
    closeModal();
    cart.length = 0;
    toast(`Sale ${sale.receipt_number} recorded`, 'success');
    route();              // rebuild the Sell view with fresh stock + empty cart
    showReceipt(sale.id);
  }

  // ---- Cash / Card / Bank: cashier confirms once money is in hand ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.method.value === 'mpesa') return; // handled by the STK flow below
    submitBtn.disabled = true;
    try {
      const received = Number(form.received.value) || 0;
      await finalizeSale({
        payment_method: form.method.value,
        amount: Math.min(received, total) || total,
        amount_received: received,
        change_amount: Math.max(received - total, 0),
        transaction_reference: form.reference ? form.reference.value || null : null,
      });
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
    }
  });

  // ---- M-Pesa: push a PIN prompt to the customer's phone, no code to type ----
  if (stkBtn) {
    stkBtn.addEventListener('click', async () => {
      stkBtn.disabled = true;
      stkStatus.className = 'text-sm text-slate-500 min-h-[1.5em]';
      stkStatus.textContent = 'Sending prompt…';
      try {
        const req = await API.post('/mpesa/stkpush', { phone: form.phone.value, amount: total });
        stkStatus.textContent = '📲 Ask the customer to check their phone and enter their M-Pesa PIN…';

        const startedAt = Date.now();
        stkPoll = setInterval(async () => {
          if (modalGone()) return stopPoll();
          try {
            const status = await API.get(`/mpesa/status/${req.checkout_request_id}`);
            if (status.status === 'success') {
              stopPoll();
              stkStatus.className = 'text-sm text-green-600 min-h-[1.5em]';
              stkStatus.textContent = `✅ Payment confirmed${status.mpesa_receipt ? ` (${status.mpesa_receipt})` : ''} — saving sale…`;
              await finalizeSale({
                payment_method: 'mpesa',
                amount: total,
                amount_received: total,
                change_amount: 0,
                transaction_reference: status.mpesa_receipt || req.checkout_request_id,
                mpesa_phone: req.phone,
              });
            } else if (['failed', 'cancelled', 'timeout'].includes(status.status)) {
              stopPoll();
              stkBtn.disabled = false;
              stkStatus.className = 'text-sm text-red-600 min-h-[1.5em]';
              stkStatus.textContent = `❌ ${status.status === 'cancelled' ? 'Customer cancelled the prompt' : status.status === 'timeout' ? 'No response from the phone — try again' : (status.result_desc || 'Payment failed')}.`;
            } else if (Date.now() - startedAt > 125000) {
              stopPoll();
              stkBtn.disabled = false;
              stkStatus.className = 'text-sm text-red-600 min-h-[1.5em]';
              stkStatus.textContent = '⏱ No response yet — ask the customer to check their M-Pesa menu, or try again.';
            }
          } catch { /* transient - next tick retries */ }
        }, 3000);
      } catch (err) {
        stkBtn.disabled = false;
        stkStatus.className = 'text-sm text-red-600 min-h-[1.5em]';
        stkStatus.textContent = err.message;
      }
    });
  }
}

async function showReceipt(id) {
  const s = await API.get(`/sales/${id}`);
  const settings = await API.get('/settings');
  modal(`
    <div id="receipt-print">
      <div class="text-center mb-3">
        <p class="font-bold text-lg">${esc(settings.business_name)}</p>
        <p class="text-xs text-slate-500">${esc(settings.address || '')} ${settings.phone ? '· ' + esc(settings.phone) : ''}</p>
        ${settings.kra_pin ? `<p class="text-xs text-slate-500">PIN: ${esc(settings.kra_pin)}</p>` : ''}
      </div>
      <div class="text-xs text-slate-500 flex justify-between">
        <span>${esc(s.receipt_number)}</span><span>${fmtDate(s.created_at)}</span></div>
      <div class="text-xs text-slate-500">Served by ${esc(s.cashier_name || '')}</div>
      <table class="data mt-2"><tbody>
        ${s.items.map((it) => `<tr><td>${esc(it.product_name)}<br><span class="text-xs text-slate-400">${it.quantity} × ${money(it.unit_price)}</span></td>
          <td class="text-right align-top">${money(it.line_total)}</td></tr>`).join('')}
      </tbody></table>
      <div class="text-sm mt-2 space-y-0.5">
        <div class="flex justify-between"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
        <div class="flex justify-between"><span>Discount</span><span>${money(s.discount)}</span></div>
        <div class="flex justify-between"><span>Tax</span><span>${money(s.tax)}</span></div>
        <div class="flex justify-between font-bold text-base"><span>Total</span><span>${money(s.total_amount)}</span></div>
        ${s.payments.map((p) => `<div class="flex justify-between"><span>${esc(paymentLabel(p.payment_method))}${p.transaction_reference ? ` (${esc(p.transaction_reference)})` : ''}</span><span>${money(p.amount)}</span></div>`).join('')}
        <div class="flex justify-between"><span>Change</span><span>${money(s.change_due)}</span></div>
      </div>
      <p class="text-center text-xs text-slate-500 mt-3">${esc(settings.receipt_footer || '')}</p>
    </div>
    <div class="flex gap-2 justify-end mt-4 no-print">
      <button class="btn btn-ghost" id="print-receipt">🖨 Print</button>
      <button class="btn btn-primary" data-close>Done</button>
    </div>`);
  document.getElementById('print-receipt').addEventListener('click', () => window.print());
}

/* -------------------------------------------------- Products */
VIEWS.products = async () => {
  const [products, cats, suppliers] = await Promise.all([
    API.get('/products'), API.get('/categories'), API.get('/suppliers'),
  ]);
  const actions = canManage()
    ? `<button class="btn btn-primary" id="add-product">+ New product</button>` : '';

  content().innerHTML = pageHead('Products', `${products.length} active products`, actions) + `
    <div class="card overflow-x-auto">
      <table class="data">
        <thead><tr><th>Name</th><th>Category</th><th>Size</th>
          <th class="text-right">Buy</th><th class="text-right">Sell</th>
          <th class="text-right">Stock</th><th></th>${canManage() ? '<th></th>' : ''}</tr></thead>
        <tbody>${products.map((p) => `
          <tr>
            <td class="font-medium">${esc(p.name)}<div class="text-xs text-slate-400">${esc(p.brand || '')} ${esc(p.sku || '')}</div></td>
            <td>${esc(p.category_name)}</td><td>${esc(p.size || '')}</td>
            <td class="text-right">${money(p.buying_price)}</td>
            <td class="text-right font-semibold">${money(p.selling_price)}</td>
            <td class="text-right">${p.stock_quantity}</td>
            <td>${stockBadge(p)}</td>
            ${canManage() ? `<td class="text-right"><button class="text-brand hover:underline text-xs" data-edit="${p.id}">Edit</button></td>` : ''}
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

  const openForm = (p) => productForm(p, cats, suppliers);
  const addBtn = document.getElementById('add-product');
  if (addBtn) addBtn.addEventListener('click', () => openForm(null));
  document.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(products.find((x) => x.id === Number(b.dataset.edit)))));
};

function productForm(p, cats, suppliers) {
  const v = p || {};
  modal(`
    <h2 class="text-lg font-bold mb-4">${p ? 'Edit' : 'New'} product</h2>
    <form id="pf" class="grid grid-cols-2 gap-3 text-sm">
      <label class="col-span-2">Name<input name="name" required class="input mt-1" value="${esc(v.name || '')}"></label>
      <label>Category<select name="category_id" class="input mt-1">
        ${cats.map((c) => `<option value="${c.id}" ${c.id === v.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></label>
      <label>Supplier<select name="supplier_id" class="input mt-1">
        <option value="">—</option>
        ${suppliers.map((s) => `<option value="${s.id}" ${s.id === v.supplier_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select></label>
      <label>Brand<input name="brand" class="input mt-1" value="${esc(v.brand || '')}"></label>
      <label>Size<input name="size" class="input mt-1" value="${esc(v.size || '')}"></label>
      <label>SKU<input name="sku" class="input mt-1" value="${esc(v.sku || '')}"></label>
      <label>Barcode<input name="barcode" class="input mt-1" value="${esc(v.barcode || '')}"></label>
      <label>Buying price<input name="buying_price" type="number" step="0.01" min="0" class="input mt-1" value="${v.buying_price ?? 0}"></label>
      <label>Selling price<input name="selling_price" type="number" step="0.01" min="0" class="input mt-1" value="${v.selling_price ?? 0}"></label>
      <label>Reorder level<input name="reorder_level" type="number" step="1" min="0" class="input mt-1" value="${v.reorder_level ?? 5}"></label>
      ${p ? '' : `<label>Opening stock<input name="stock_quantity" type="number" step="1" min="0" class="input mt-1" value="0"></label>`}
      <div class="col-span-2 flex justify-end gap-2 mt-2">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary">${p ? 'Save' : 'Create'}</button>
      </div>
    </form>`);

  document.getElementById('pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (p) await API.put(`/products/${p.id}`, fd);
      else await API.post('/products', fd);
      closeModal();
      toast('Product saved', 'success');
      route();
    } catch (err) { toast(err.message, 'error'); }
  });
}

/* -------------------------------------------------- Inventory */
VIEWS.inventory = async () => {
  const [txns, low, products] = await Promise.all([
    API.get('/inventory/transactions?limit=60'),
    API.get('/inventory/low-stock'),
    API.get('/products'),
  ]);
  const actions = canManage() ? `<button class="btn btn-primary" id="adjust">+ Stock movement</button>` : '';

  content().innerHTML = pageHead('Inventory', 'Stock ledger and adjustments', actions) + `
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="card p-4">
        <p class="font-semibold mb-2">Low stock (${low.length})</p>
        <div class="text-sm divide-y divide-slate-100">
          ${low.map((p) => `<div class="flex justify-between py-1.5"><span>${esc(p.name)} ${esc(p.size || '')}</span>
            <span class="font-semibold ${p.stock_quantity <= 0 ? 'text-red-600' : 'text-amber-600'}">${p.stock_quantity} / ${p.reorder_level}</span></div>`).join('')
            || '<p class="text-green-600 py-2">All good ✔</p>'}
        </div>
      </div>
      <div class="card p-4 lg:col-span-2 overflow-x-auto">
        <p class="font-semibold mb-2">Recent movements</p>
        <table class="data"><thead><tr><th>When</th><th>Product</th><th>Type</th>
          <th class="text-right">Change</th><th class="text-right">After</th><th>By</th></tr></thead>
          <tbody>${txns.map((t) => `<tr>
            <td class="text-xs text-slate-400">${fmtDate(t.created_at)}</td>
            <td>${esc(t.product_name)}</td>
            <td><span class="badge badge-slate">${t.transaction_type}</span></td>
            <td class="text-right ${t.quantity_change < 0 ? 'text-red-600' : 'text-green-600'}">${t.quantity_change > 0 ? '+' : ''}${t.quantity_change}</td>
            <td class="text-right">${t.stock_after}</td>
            <td class="text-xs">${esc(t.user_name)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;

  const btn = document.getElementById('adjust');
  if (btn) btn.addEventListener('click', () => {
    modal(`
      <h2 class="text-lg font-bold mb-4">Stock movement</h2>
      <form id="adj" class="space-y-3 text-sm">
        <label class="block">Product<select name="product_id" class="input mt-1">
          ${products.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.stock_quantity})</option>`).join('')}
        </select></label>
        <label class="block">Type<select name="transaction_type" class="input mt-1">
          <option value="stock_in">Stock in (received)</option>
          <option value="return">Customer return</option>
          <option value="damage">Damage / breakage</option>
          <option value="adjustment">Manual adjustment (+/-)</option>
        </select></label>
        <label class="block">Quantity<input name="quantity" type="number" step="1" value="1" class="input mt-1"></label>
        <label class="block">Notes<input name="notes" class="input mt-1"></label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button class="btn btn-primary">Apply</button>
        </div>
      </form>`);
    document.getElementById('adj').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.quantity = Number(fd.quantity);
      try {
        await API.post('/inventory/adjust', fd);
        closeModal(); toast('Stock updated', 'success'); route();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
};

/* -------------------------------------------------- Sales history */
VIEWS.sales = async () => {
  const sales = await API.get('/sales?limit=100');
  content().innerHTML = pageHead('Sales', `${sales.length} most recent`) + `
    <div class="card overflow-x-auto"><table class="data">
      <thead><tr><th>Receipt</th><th>When</th><th>Cashier</th><th>Items</th>
        <th>Status</th><th class="text-right">Total</th></tr></thead>
      <tbody>${sales.map((s) => `<tr class="cursor-pointer" data-id="${s.id}">
        <td class="font-medium text-brand">${esc(s.receipt_number)}</td>
        <td class="text-xs text-slate-400">${fmtDate(s.created_at)}</td>
        <td>${esc(s.cashier_name)}</td><td>${s.item_count}</td>
        <td><span class="badge ${s.payment_status === 'paid' ? 'badge-green' : s.payment_status === 'partial' ? 'badge-amber' : 'badge-slate'}">${s.payment_status}</span></td>
        <td class="text-right font-semibold">${money(s.total_amount)}</td></tr>`).join('') ||
        '<tr><td colspan="6" class="text-slate-400 text-center py-6">No sales yet</td></tr>'}</tbody>
    </table></div>`;
  document.querySelectorAll('tr[data-id]').forEach((tr) =>
    tr.addEventListener('click', () => showReceipt(Number(tr.dataset.id))));
};

/* -------------------------------------------------- Settings */
VIEWS.settings = async () => {
  const s = await API.get('/settings');
  const readOnly = API.user.role !== 'admin';
  content().innerHTML = pageHead('Settings', readOnly ? 'Read-only (admin required to edit)' : 'Business & receipt configuration') + `
    <form id="sf" class="card p-6 grid md:grid-cols-2 gap-4 text-sm max-w-3xl">
      <label>Business name<input name="business_name" class="input mt-1" value="${esc(s.business_name || '')}"></label>
      <label>Phone<input name="phone" class="input mt-1" value="${esc(s.phone || '')}"></label>
      <label>Email<input name="email" class="input mt-1" value="${esc(s.email || '')}"></label>
      <label>KRA PIN<input name="kra_pin" class="input mt-1" value="${esc(s.kra_pin || '')}"></label>
      <label class="md:col-span-2">Address<input name="address" class="input mt-1" value="${esc(s.address || '')}"></label>
      <label class="md:col-span-2">Receipt footer<input name="receipt_footer" class="input mt-1" value="${esc(s.receipt_footer || '')}"></label>
      <label>Currency<input name="currency" class="input mt-1" value="${esc(s.currency || 'KES')}"></label>
      <label>Tax rate (%)<input name="tax_rate" type="number" step="0.01" class="input mt-1" value="${s.tax_rate ?? 0}"></label>
      <label class="flex items-center gap-2 mt-2"><input type="checkbox" name="tax_enabled" ${s.tax_enabled ? 'checked' : ''}> Charge tax on sales</label>
      <div class="md:col-span-2 flex justify-end">
        <button class="btn btn-primary" ${readOnly ? 'disabled' : ''}>Save settings</button>
      </div>
    </form>

    <div class="card p-6 max-w-3xl mt-4">
      <div class="flex items-center justify-between mb-1">
        <p class="font-semibold">Cloud sync / remote reporting</p>
        <button id="sync-now" class="btn btn-ghost text-xs" ${readOnly ? 'disabled' : ''}>🔄 Sync now</button>
      </div>
      <div id="sync-box" class="text-sm text-slate-500">Loading…</div>
    </div>`;

  document.getElementById('sf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.tax_enabled = fd.get('tax_enabled') ? 1 : 0;
    body.tax_rate = Number(body.tax_rate) || 0;
    try {
      await API.put('/settings', body);
      CURRENCY = body.currency || CURRENCY;
      toast('Settings saved', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  const syncBox = document.getElementById('sync-box');
  const syncBtn = document.getElementById('sync-now');
  const renderSync = (st) => {
    if (!st.configured) {
      syncBox.innerHTML = `<p>Not set up — sales stay local only. Add <code>SYNC_WEBHOOK_URL</code>
        in <code>.env</code> to push completed sales to a remote sheet the owner can check
        from anywhere (see INSTALL.md → "Remote reporting"). This never blocks selling.</p>`;
      syncBtn.disabled = true;
      return;
    }
    const badge = { ok: 'badge-green', offline: 'badge-amber', error: 'badge-red', never: 'badge-slate' }[st.last_status] || 'badge-slate';
    const label = { ok: 'Synced', offline: 'Waiting for internet', error: 'Error', never: 'Never synced' }[st.last_status] || st.last_status;
    syncBox.innerHTML = `
      <div class="flex items-center gap-2 mb-1"><span class="badge ${badge}">${label}</span>
        ${st.pending ? `<span class="text-slate-500">${st.pending} sale${st.pending === 1 ? '' : 's'} waiting to sync</span>` : '<span class="text-green-600">Up to date</span>'}</div>
      ${st.last_synced_at ? `<p class="text-xs text-slate-400">Last synced: ${fmtDate(st.last_synced_at)}</p>` : ''}
      ${st.last_status === 'error' && st.last_error ? `<p class="text-xs text-red-500 mt-1">${esc(st.last_error)}</p>` : ''}
      ${st.last_status === 'offline' ? `<p class="text-xs text-amber-600 mt-1">Will retry automatically once the internet connection is back.</p>` : ''}`;
  };
  try { renderSync(await API.get('/sync/status')); } catch { syncBox.textContent = 'Unavailable'; }
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    try { renderSync(await API.post('/sync/run')); }
    catch (err) { toast(err.message, 'error'); }
    finally { syncBtn.disabled = readOnly; }
  });
};

/* ---------------------------------------------------------- modal */
function modal(html) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal';
  wrap.className = 'fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4';
  wrap.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.hasAttribute('data-close')) closeModal(); });
  document.body.appendChild(wrap);
}
function closeModal() { const m = document.getElementById('modal'); if (m) m.remove(); }
