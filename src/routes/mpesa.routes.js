'use strict';

const express = require('express');
const { get, run } = require('../db');
const { authRequired } = require('../auth');
const mpesa = require('../services/mpesa');

const router = express.Router();

// GET /api/mpesa/config  - lets the frontend know whether to offer STK push at all
router.get('/config', authRequired, (req, res) => {
  res.json({ configured: mpesa.isConfigured(), environment: mpesa.ENV });
});

// POST /api/mpesa/stkpush  - send a payment prompt to the customer's phone
router.post('/stkpush', authRequired, async (req, res) => {
  const { phone, amount, account_reference } = req.body || {};
  try {
    const result = await mpesa.stkPush({
      phone, amount, accountReference: account_reference || 'Nox Lounge', description: 'POS sale',
    });
    run(
      `INSERT INTO mpesa_requests
         (checkout_request_id, merchant_request_id, phone, amount, account_reference, status, user_id)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [result.checkoutRequestId, result.merchantRequestId, result.phone, Number(amount),
        account_reference || null, req.user.sub]
    );
    res.status(201).json({ checkout_request_id: result.checkoutRequestId, status: 'pending', phone: result.phone });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// GET /api/mpesa/status/:checkoutRequestId  - poll for the outcome
router.get('/status/:checkoutRequestId', authRequired, async (req, res) => {
  const id = req.params.checkoutRequestId;
  let record = get('SELECT * FROM mpesa_requests WHERE checkout_request_id = ?', [id]);
  if (!record) return res.status(404).json({ error: 'Unknown STK push request' });

  // Give the customer up to 2 minutes; after that treat it as timed out.
  const ageMs = Date.now() - new Date(record.created_at.replace(' ', 'T') + 'Z').getTime();

  if (record.status === 'pending') {
    try {
      const outcome = await mpesa.stkQuery(id);
      if (!outcome.pending) {
        applyOutcome(record, outcome.resultCode, outcome.resultDesc);
        record = get('SELECT * FROM mpesa_requests WHERE checkout_request_id = ?', [id]);
      } else if (ageMs > 120000) {
        run(`UPDATE mpesa_requests SET status='timeout', updated_at=datetime('now') WHERE checkout_request_id = ?`, [id]);
        record = get('SELECT * FROM mpesa_requests WHERE checkout_request_id = ?', [id]);
      }
    } catch {
      // Query API hiccup - keep reporting 'pending', the next poll will retry.
    }
  }
  res.json(record);
});

// POST /api/mpesa/callback  - Safaricom calls this (no auth: it's not our user).
// Only reachable if MPESA_CALLBACK_URL is a real public HTTPS URL; the /status
// polling above is the primary path and works without one.
router.post('/callback', express.json(), (req, res) => {
  try {
    const stk = req.body && req.body.Body && req.body.Body.stkCallback;
    if (stk && stk.CheckoutRequestID) {
      const record = get('SELECT * FROM mpesa_requests WHERE checkout_request_id = ?', [stk.CheckoutRequestID]);
      if (record) applyOutcome(record, stk.ResultCode, stk.ResultDesc, stk.CallbackMetadata);
    }
  } catch (err) {
    console.error('M-Pesa callback error:', err);
  }
  // Safaricom expects this exact acknowledgement shape.
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

function applyOutcome(record, resultCode, resultDesc, callbackMetadata) {
  let status = 'failed';
  if (resultCode === 0) status = 'success';
  else if (resultCode === 1032) status = 'cancelled';
  else if (resultCode === 1037) status = 'timeout';

  let receipt = null;
  const items = callbackMetadata && callbackMetadata.Item;
  if (Array.isArray(items)) {
    const found = items.find((i) => i.Name === 'MpesaReceiptNumber');
    if (found) receipt = found.Value;
  }

  run(
    `UPDATE mpesa_requests
       SET status = ?, result_code = ?, result_desc = ?, mpesa_receipt = COALESCE(?, mpesa_receipt),
           updated_at = datetime('now')
     WHERE checkout_request_id = ?`,
    [status, resultCode ?? null, resultDesc || null, receipt, record.checkout_request_id]
  );
}

module.exports = router;
