import { fail, rateLimitOk, SECURITY_HEADERS } from './_utils.js';

const SESSION_DAYS = 7;
// Prefix __Host- (butuh Secure, Path=/, tanpa Domain) mencegah cookie
// ditanam/disetel oleh host lain di bawah domain yang sama.
const COOKIE_NAME = '__Host-ss_admin';

// ===== Helper JSON dengan header tambahan =====
function json(data, status = 200, extraHeaders) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...(extraHeaders || {}),
  };
  return new Response(JSON.stringify(data), { status, headers });
}

// ===== Kriptografi =====
async function hmacKey(secret) {
  return await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
}
async function signHmac(secret, value) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return b64url(new Uint8Array(sig));
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encodeStr(str) {
  const bytes = new TextEncoder().encode(str);
  return b64url(bytes);
}
function b64decodeStr(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}
function constantTimeEq(a, b) {
  // Bandingkan dalam waktu konstan agar tidak bocor lewat timing
  let n = Math.max(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < n; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

// Fallback constant-time untuk buffer (dipakai bila runtime tidak punya timingSafeEqual)
function constantTimeEqBuf(x, y) {
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ===== Session token =====
async function makeToken(env) {
  const payload = b64encodeStr(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 86_400_000 }));
  const sig = await signHmac(env.SESSION_SECRET, payload);
  return payload + '.' + sig;
}
async function verifyToken(env, token) {
  if (typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i <= 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = await signHmac(env.SESSION_SECRET, payload);
  if (!constantTimeEq(sig, expected)) return false;
  try {
    const obj = JSON.parse(b64decodeStr(payload));
    return obj.exp > Date.now();
  } catch {
    return false;
  }
}

// ===== Cookie =====
function sessionCookie(token, clear) {
  const maxAge = clear ? 0 : SESSION_DAYS * 86_400;
  const expires = clear ? 'Thu, 01 Jan 1970 00:00:00 GMT'
    : new Date(Date.now() + SESSION_DAYS * 86_400_000).toUTCString();
  return `${COOKIE_NAME}=${token ? token : ''}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=${maxAge}; Expires=${expires}`;
}

// ===== Ekstrak & verifikasi session =====
export async function getValidSession(context) {
  const env = context.env;
  if (!env || !env.SESSION_SECRET) return null;
  const cookieHeader = context.request.headers.get('Cookie') || '';
  for (const raw of cookieHeader.split(';')) {
    // Trim dulu: cookie setelah yang pertama selalu diawali spasi.
    const part = raw.trim();
    if (!part.startsWith(COOKIE_NAME + '=')) continue;
    const token = part.slice(COOKIE_NAME.length + 1).trim();
    if (token && (await verifyToken(env, token))) return { token };
  }
  return null;
}

// ===== Login =====
async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  try {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return 'sha256_' + b64url(new Uint8Array(buf)).slice(0, 16);
  } catch {
    return 'k_' + b64url(data).slice(0, 16);
  }
}

export async function handleAdminLogin(context) {
  const env = context.env;
  const db = env.DB;
  if (!db) return fail('Database belum terhubung.', 500);
  if (!env.ADMIN_PASSWORD) return fail('Password admin belum diset di environment.', 500);

  const ip = (context.request.headers.get('CF-Connecting-IP') || 'unknown').split(',')[0].trim();
  const key = 'login_' + await shortHash(ip);
  if (!(await rateLimitOk(db, key, 5, 300_000))) {
    return fail('Terlalu banyak percobaan. Coba lagi 5 menit lagi.', 429);
  }

  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const pw = String(body.password || '');

  // Bandingkan constant-time bila runtime menyediakan crypto.subtle.timingSafeEqual
  // (Cloudflare Workers/Pages). Fallback: XOR-akumulasi agar tetap deterministik.
  const a = new TextEncoder().encode(pw);
  const b = new TextEncoder().encode(env.ADMIN_PASSWORD);
  let ok;
  if (a.length === b.length) {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.timingSafeEqual) {
      ok = await crypto.subtle.timingSafeEqual(a, b);
    } else {
      ok = constantTimeEqBuf(a, b);
    }
  } else {
    // Panjang berbeda: tidak bisa cocok. Tetap bandingkan terhadap diri sendiri
    // (atau fallback) agar tidak bocor informasi lewat timing.
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.timingSafeEqual) {
      ok = !(await crypto.subtle.timingSafeEqual(a, a));
    } else {
      ok = constantTimeEqBuf(a, b); // panjang berbeda => pasti false
    }
  }
  if (!ok) return fail('Kata sandi salah.', 401);

  const token = await makeToken(env);
  return json({ ok: true, message: 'Masuk berhasil.' }, 200, { 'Set-Cookie': sessionCookie(token, false) });
}

// ===== Logout =====
export async function handleAdminLogout(context) {
  // Clear-Site-Data: buang cookie sesi + storage + cache browser
  return json({ ok: true, message: 'Keluar.' }, 200, {
    'Set-Cookie': sessionCookie('', true),
    'Clear-Site-Data': '"cookies", "storage", "cache"',
  });
}

export { json };
