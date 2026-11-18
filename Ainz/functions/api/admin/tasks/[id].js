import { getValidSession, json } from '../../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// PUT /api/admin/tasks/:id -> ubah nama & grup { nama, grup?, urutan? }
export const onRequestPut = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Tugas tidak ditemukan.', 404);
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 30);
  if (!isValidName(nama, 30)) return fail('Nama tugas tidak valid (maksimal 30 karakter).', 400);
  const grup = body.grup === null || body.grup === '' ? null : cleanStr(body.grup, 20) || null;
  if (grup && !isValidName(grup, 20)) return fail('Nama grup tidak valid.', 400);
  let urutan = Number(body.urutan);
  if (body.urutan === undefined) {
    const cur = await db.prepare('SELECT urutan FROM task_types WHERE id = ?').bind(id).first();
    urutan = cur ? Number(cur.urutan) : 0;
  } else if (!Number.isInteger(urutan) || urutan < 0 || urutan > 99) {
    urutan = 0;
  }
  try {
    await db.prepare('UPDATE task_types SET nama = ?, grup = ?, urutan = ? WHERE id = ?').bind(nama, grup, urutan, id).run();
    return json({ ok: true, message: 'Tugas diperbarui.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Nama tugas sudah dipakai tugas lain.', 400);
    return fail('Gagal memperbarui tugas.', 500);
  }
};
