import { getValidSession, json } from '../../_admin_session.js';
import { fail, monthRangeUtc } from '../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/rekap-bulanan?bulan=YYYY-MM
// Return: { bulan, rows: [ { staff_id, total, counts: { task_id: n } } ], tasks: [id], grand_total }
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const q = context.request.url.split('?')[1];
  const params = new URLSearchParams(q);
  const bulan = params.get('bulan');
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid. Gunakan format YYYY-MM.', 400);
  const range = monthRangeUtc(bulan);

  try {
    // Hitung total per staff dan per tugas
    const { results: agg } = await db.prepare(`
      SELECT s.staff_id, s.task_type_id, COUNT(*) AS n
      FROM submissions s
      WHERE s.created_at >= ? AND s.created_at < ?
      GROUP BY s.staff_id, s.task_type_id
    `).bind(range.fromUtc, range.toUtc).all();

    const { results: taskIds } = await db
      .prepare('SELECT id FROM task_types WHERE aktif = 1 ORDER BY urutan ASC, id ASC').all();

    const byStaff = {};
    agg.forEach(r => {
      const k = r.staff_id;
      byStaff[k] = byStaff[k] || { total: 0, counts: {} };
      byStaff[k].total += r.n;
      byStaff[k].counts[r.task_type_id] = r.n;
    });

    const rows = Object.keys(byStaff).map(sid => ({
      staff_id: Number(sid),
      total: byStaff[sid].total,
      counts: byStaff[sid].counts,
    }));

    return json({
      bulan,
      fromUtc: range.fromUtc,
      toUtc: range.toUtc,
      tasks: taskIds.map(t => t.id),
      rows,
      grand_total: rows.reduce((sum, r) => sum + r.total, 0),
    });
  } catch {
    return fail('Gagal membuat rekap bulanan.', 500);
  }
};
