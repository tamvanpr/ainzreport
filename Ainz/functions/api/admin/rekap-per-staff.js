import { getValidSession, json } from '../../_admin_session.js';
import { fail, monthRangeUtc } from '../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/rekap-per-staff?staff_id=&bulan=YYYY-MM
// Return: { staff_id, staff_name, bulan, items: [ { title_id, title_name, chapter, task_id, task_name, n, last_seen } ] }
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const q = context.request.url.split('?')[1];
  const params = new URLSearchParams(q);
  const staffId = Number(params.get('staff_id'));
  const bulan = params.get('bulan');
  if (!Number.isInteger(staffId) || staffId <= 0) return fail('Pilih staff yang valid.', 400);
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid. Gunakan format YYYY-MM.', 400);
  const range = monthRangeUtc(bulan);

  try {
    const s = await db.prepare('SELECT id, nama FROM staff WHERE id = ?').bind(staffId).first();
    if (!s) return fail('Staff tidak ditemukan.', 404);

    const { results: items } = await db.prepare(`
      SELECT t.nama AS title_name, s.chapter, k.nama AS task_name, k.id AS task_id,
             COUNT(*) AS n, MAX(s.created_at) AS last_seen
      FROM submissions s
      JOIN titles t ON t.id = s.title_id
      JOIN task_types k ON k.id = s.task_type_id
      WHERE s.staff_id = ? AND s.created_at >= ? AND s.created_at < ?
      GROUP BY t.id, s.chapter, k.id
      ORDER BY t.nama, s.chapter, k.nama
    `).bind(staffId, range.fromUtc, range.toUtc).all();

    return json({
      staff_id: staffId,
      staff_name: s.nama,
      bulan,
      items,
    });
  } catch {
    return fail('Gagal membuat rekap per staff.', 500);
  }
};
