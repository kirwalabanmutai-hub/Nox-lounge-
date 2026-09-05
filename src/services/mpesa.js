'use strict';

/**
 * Safaricom Daraja (M-Pesa) STK Push integration.
 *
 * Uses the platform's built-in `fetch` (Node >= 18) - no extra dependency.
 * Requires internet access to reach Safaricom's API; everything else in the
 * app keeps working offline, this feature simply won't be available.
 *
 * Credentials come from .env - see .env.example. Sandbox keys are free from
 * https://developer.safaricom.co.ke ("Lipa Na M-Pesa Sandbox" app).
 */

const ENV = process.env.MPESA_ENV || 'sandbox';
const BASE_URL = ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || '';
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || '';
const SHORTCODE = process.env.MPESA_SHORTCODE || '';
const PASSKEY = process.env.MPESA_PASSKEY || '';
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL || '';

function isConfigured() {
  return Boolean(CONSUMER_KEY && CONSUMER_SECRET && SHORTCODE && PASSKEY);
}

/** "2547XXXXXXXX" from 07.., 7.., 2547.., +2547.. */
function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  if (digits.startsWith('1') && digits.length === 9) return `254${digits}`;
  return null;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

let cachedToken = null; // { token, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) return cachedToken.token;

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

/**
 * Initiate an STK push - sends a PIN prompt to the customer's phone.
 * @returns {{ checkoutRequestId, merchantRequestId, phone }}
 */
async function stkPush({ phone, amount, accountReference = 'Nox Lounge', description = 'POS sale' }) {
  if (!isConfigured()) {
    throw Object.assign(new Error('M-Pesa is not configured (missing Daraja credentials in .env)'), { status: 501 });
  }
  const msisdn = normalizePhone(phone);
  if (!msisdn) throw Object.assign(new Error('Enter a valid Safaricom phone number, e.g. 07XXXXXXXX'), { status: 400 });
  const amt = Math.round(Number(amount));
  if (!(amt > 0)) throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });

  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${ts}`).toString('base64');

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amt,
      PartyA: msisdn,
      PartyB: SHORTCODE,
      PhoneNumber: msisdn,
      CallBackURL: CALLBACK_URL || 'https://example.invalid/callback',
      AccountReference: String(accountReference).slice(0, 12),
      TransactionDesc: String(description).slice(0, 13),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'STK push was rejected by Safaricom');
  }
  return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID, phone: msisdn };
}

/** Poll Safaricom directly for the outcome of a push (fallback when the callback can't reach us, e.g. no public URL). */
async function stkQuery(checkoutRequestId) {
  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${ts}`).toString('base64');

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  // ResultCode: 0 = success, 1032 = cancelled by user, 1037 = timeout, others = failed.
  // Safaricom returns errorCode "500.001.1001" while the request is still pending.
  if (data.errorCode) return { pending: true };
  return {
    pending: false,
    resultCode: Number(data.ResultCode),
    resultDesc: data.ResultDesc,
  };
}

module.exports = { isConfigured, normalizePhone, stkPush, stkQuery, ENV };
