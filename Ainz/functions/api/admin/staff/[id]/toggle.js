import { getValidSession, json } from '../../../../_admin_session.js';
import { fail } from '../../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// POST /api/admin/staff/:id/toggle -> nonaktif/aktifkan
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Staff tidak ditemukan.', 404);
  try {
    await db.prepare('UPDATE staff SET aktif = 1 - aktif WHERE id = ?').bind(id).run();
    const s = await db.prepare('SELECT aktif FROM staff WHERE id = ?').bind(id).first();
    return json({ ok: true, aktif: s.aktif, message: s.aktif ? 'Staff diaktifkan.' : 'Staff dinonaktifkan.' });
  } catch {
    return fail('Gagal mengubah status staff.', 500);
  }
};
