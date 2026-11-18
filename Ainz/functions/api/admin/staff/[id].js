import { getValidSession, json } from '../../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// PUT /api/admin/staff/:id -> ubah nama { nama }
export const onRequestPut = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Staff tidak ditemukan.', 404);
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 50);
  if (!isValidName(nama, 50)) return fail('Nama staff tidak valid (maksimal 50 karakter).', 400);
  try {
    await db.prepare('UPDATE staff SET nama = ? WHERE id = ?').bind(nama, id).run();
    return json({ ok: true, message: 'Nama staff diperbarui.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Nama staff sudah dipakai staff lain.', 400);
    return fail('Gagal memperbarui staff.', 500);
  }
};
