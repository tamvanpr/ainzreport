import { getValidSession, json } from '../../../_admin_session.js';
import { fail, isValidChapter, cleanStr, monthRangeUtc } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/submissions/:id -> detail satu setoran
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Setoran tidak ditemukan.', 404);
  try {
    const s = await db.prepare(`
      SELECT s.id, s.staff_id, s.title_id, s.chapter, s.task_type_id, s.created_at
      FROM submissions s WHERE s.id = ?
    `).bind(id).first();
    if (!s) return fail('Setoran tidak ditemukan.', 404);
    return json(s);
  } catch {
    return fail('Gagal memuat setoran.', 500);
  }
};

// PUT /api/admin/submissions/:id -> edit { staff_id, title_id, chapter, task_type_id }
export const onRequestPut = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Setoran tidak ditemukan.', 404);
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const staffId = Number(body.staff_id);
  const titleId = Number(body.title_id);
  const chapter = cleanStr(body.chapter, 50);
  const taskId = Number(body.task_type_id);
  if (!Number.isInteger(staffId) || staffId <= 0) return fail('Pilih staff yang valid.', 400);
  if (!Number.isInteger(titleId) || titleId <= 0) return fail('Pilih judul yang valid.', 400);
  if (!isValidChapter(chapter)) return fail('Chapter tidak valid.', 400);
  if (!Number.isInteger(taskId) || taskId <= 0) return fail('Pilih tugas yang valid.', 400);
  try {
    const r = await db.prepare('UPDATE submissions SET staff_id = ?, title_id = ?, chapter = ?, task_type_id = ? WHERE id = ?')
      .bind(staffId, titleId, chapter, taskId, id).run();
    if (r.changes === 0) return fail('Setoran tidak ditemukan.', 404);
    return json({ ok: true, message: 'Setoran diperbarui.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Kombinasi itu sudah ada di setoran lain.', 400);
    return fail('Gagal memperbarui setoran.', 500);
  }
};

// DELETE /api/admin/submissions/:id -> hapus
export const onRequestDelete = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Setoran tidak ditemukan.', 404);
  try {
    const r = await db.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
    if (r.changes === 0) return fail('Setoran tidak ditemukan.', 404);
    return json({ ok: true, message: 'Setoran dihapus.' });
  } catch {
    return fail('Gagal menghapus setoran.', 500);
  }
};
