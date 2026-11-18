// Helper bersama untuk Pages Functions.
// Semua fungsi bekerja di runtime Cloudflare (Node + Web Crypto).

const JKT_TZ = 'Asia/Jakarta';

// ===== Security headers (CSP + companion policies) =====
// Dipakai di semua respons API. Header ini juga di-set via file `_headers`
// di `public/` untuk aset statis (HTML/CSS/JS).
export const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// ===== Respons JSON =====
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
    },
  });
}

// ===== Error ramah (tanpa bocorkan detail internal) =====
export function fail(message, status = 400) {
  return json({ message }, status);
}

// ===== Validasi input =====
// chapter: maksimal 20 karakter, hanya angka, titik, dan huruf sederhana
export const CHAPTER_RE = /^[\d.A-Za-z]{1,20}$/;
// Nama master (staff/judul/tugas): teks sederhana, non-kosong
export const NAME_RE = /^[\p{L}\p{M} ._'&-]+$/u;

export function isValidChapter(ch) {
  if (typeof ch !== 'string') return false;
  const t = ch.trim();
  return t.length > 0 && t.length <= 20 && CHAPTER_RE.test(t);
}

export function isValidName(n, max = 80) {
  if (typeof n !== 'string') return false;
  const t = n.trim();
  return t.length > 0 && t.length <= max && NAME_RE.test(t);
}

// ===== Bulan (zona Asia/Jakarta, UTC+7 sepanjang tahun) =====
// Kolom created_at menyimpan string ISO UTC "YYYY-MM-DDTHH:MM:SSZ", jadi
// perbandingan string leksikal == perbandingan kronologis. Kita menjepit
// rentang [dariUtc, sampaiUtc) yang merepresentasikan bulan JKT.
export function monthRangeUtc(bulan) {
  const ym = String(bulan || '').match(/^(\d{4})-(\d{2})$/);
  if (!ym) return null;
  const y = Number(ym[1]);
  const m = Number(ym[2]);
  // Batas bulan dalam JKT: (y,m,1) T00:00 +07:00  ->  UTC = T00:00 - 7 jam
  // Mulai = hari-1 bulan ke-m, Selesai = hari-1 bulan ke-(m+1)
  const startJkt = new Date(Date.UTC(y, m - 1, 1));
  const endJkt = new Date(Date.UTC(y, m, 1));
  const fromUtc = new Date(startJkt.getTime() - 7 * 3600 * 1000).toISOString();
  const toUtc = new Date(endJkt.getTime() - 7 * 3600 * 1000).toISOString();
  return { fromUtc, toUtc };
}

// ===== Rate limit (D1) =====
// key + limit jumlah request dalam windowMs. Return true bila diizinkan.
export async function rateLimitOk(db, key, limit, windowMs = 60_000) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const before = now - Math.floor(windowMs / 1000);
    await db
      .prepare('DELETE FROM rate_limits WHERE key = ? AND created_at < ?')
      .bind(key, new Date(before * 1000).toISOString())
      .run();
    const cnt = await db
      .prepare('SELECT COUNT(*) AS c FROM rate_limits WHERE key = ? AND created_at >= ?')
      .bind(key, new Date(before * 1000).toISOString())
      .first();
    if ((cnt?.c ?? 0) >= limit) return false;
    await db.prepare('INSERT INTO rate_limits (key, created_at) VALUES (?, ?)').bind(key, new Date(now * 1000).toISOString()).run();
    return true;
  } catch {
    // Jika rate-limit DB gagal, tetap izinkan (graceful) agar tidak blokir semua
    return true;
  }
}

// ===== Util string =====
export function cleanStr(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}
