import { getValidSession, json } from '../../../../_admin_session.js';
import { fail } from '../../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// POST /api/admin/tasks/:id/toggle -> nonaktif/aktifkan
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Tugas tidak ditemukan.', 404);
  try {
    await db.prepare('UPDATE task_types SET aktif = 1 - aktif WHERE id = ?').bind(id).run();
    const t = await db.prepare('SELECT aktif FROM task_types WHERE id = ?').bind(id).first();
    return json({ ok: true, aktif: t.aktif, message: t.aktif ? 'Tugas diaktifkan.' : 'Tugas dinonaktifkan.' });
  } catch {
    return fail('Gagal mengubah status tugas.', 500);
  }
};
