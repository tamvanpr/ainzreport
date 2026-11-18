import { getValidSession, json } from '../../_admin_session.js';
import { fail, isValidChapter, cleanStr, monthRangeUtc } from '../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/submissions?bulan=&staff_id=&title_id=&task_type_id=
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const q = context.request.url.split('?')[1];
  const params = new URLSearchParams(q);

  const clauses = [];
  const binds = [];
  const bulan = params.get('bulan');
  if (bulan) {
    const range = monthRangeUtc(bulan);
    if (range) {
      clauses.push('s.created_at >= ?');
      clauses.push('s.created_at < ?');
      binds.push(range.fromUtc, range.toUtc);
    }
  }
  const staffId = params.get('staff_id');
  if (staffId) { clauses.push('s.staff_id = ?'); binds.push(Number(staffId)); }
  const titleId = params.get('title_id');
  if (titleId) { clauses.push('s.title_id = ?'); binds.push(Number(titleId)); }
  const taskId = params.get('task_type_id');
  if (taskId) { clauses.push('s.task_type_id = ?'); binds.push(Number(taskId)); }

  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  try {
    const { results } = await db.prepare(`
      SELECT s.id, s.chapter, s.created_at,
             st.nama AS staff_name,
             t.nama AS title_name,
             k.nama AS task_name
      FROM submissions s
      JOIN staff st ON st.id = s.staff_id
      JOIN titles t ON t.id = s.title_id
      JOIN task_types k ON k.id = s.task_type_id
      ${where}
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 500
    `).bind(...binds).all();
    return json({ items: results });
  } catch {
    return fail('Gagal memuat daftar setoran.', 500);
  }
};

// POST /api/admin/submissions -> tambah setoran { staff_id, title_id, chapter, task_type_id }
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
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
    await db.prepare('INSERT INTO submissions (staff_id, title_id, chapter, task_type_id) VALUES (?, ?, ?, ?)')
      .bind(staffId, titleId, chapter, taskId).run();
    return json({ ok: true, message: 'Setoran ditambahkan.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Setoran dengan kombinasi itu sudah ada.', 400);
    return fail('Gagal menambah setoran.', 500);
  }
};
