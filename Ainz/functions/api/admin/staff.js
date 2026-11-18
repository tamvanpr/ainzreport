import { getValidSession, json } from '../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../_utils.js';

// Helper: pastikan session valid, selain itu balas 401
function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/staff -> semua staff (termasuk nonaktif)
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  try {
    const { results } = await db.prepare('SELECT id, nama, aktif FROM staff ORDER BY nama').all();
    return json({ staff: results });
  } catch {
    return fail('Gagal memuat staff.', 500);
  }
};

// POST /api/admin/staff -> tambah staff { nama }
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 50);
  if (!isValidName(nama, 50)) return fail('Nama staff tidak valid (maksimal 50 karakter).', 400);
  try {
    await db.prepare('INSERT INTO staff (nama, aktif) VALUES (?, 1)').bind(nama).run();
    return json({ ok: true, message: 'Staff ditambahkan.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Staff dengan nama itu sudah ada.', 400);
    return fail('Gagal menambah staff.', 500);
  }
};
