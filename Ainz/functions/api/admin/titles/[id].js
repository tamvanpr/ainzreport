import { getValidSession, json } from '../../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// PUT /api/admin/titles/:id -> ubah nama { nama }
export const onRequestPut = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Judul tidak ditemukan.', 404);
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 80);
  if (!isValidName(nama, 80)) return fail('Nama judul tidak valid (maksimal 80 karakter).', 400);
  try {
    await db.prepare('UPDATE titles SET nama = ? WHERE id = ?').bind(nama, id).run();
    return json({ ok: true, message: 'Judul diperbarui.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Nama judul sudah dipakai judul lain.', 400);
    return fail('Gagal memperbarui judul.', 500);
  }
};
