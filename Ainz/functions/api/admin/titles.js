import { getValidSession, json } from '../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/titles -> semua judul (termasuk nonaktif)
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  try {
    const { results } = await db.prepare('SELECT id, nama, aktif FROM titles ORDER BY nama').all();
    return json({ titles: results });
  } catch {
    return fail('Gagal memuat judul.', 500);
  }
};

// POST /api/admin/titles -> tambah judul { nama }
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 80);
  if (!isValidName(nama, 80)) return fail('Nama judul tidak valid (maksimal 80 karakter).', 400);
  try {
    await db.prepare('INSERT INTO titles (nama, aktif) VALUES (?, 1)').bind(nama).run();
    return json({ ok: true, message: 'Judul ditambahkan.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Judul dengan nama itu sudah ada.', 400);
    return fail('Gagal menambah judul.', 500);
  }
};
