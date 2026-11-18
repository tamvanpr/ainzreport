import { json, fail, monthRangeUtc } from '../_utils.js';

// GET /api/rekap?bulan=YYYY-MM  -> rekap publik (bisa dilihat staff)
// Mengembalikan total per staff per role + daftar role aktif.
export const onRequestGet = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);

  const url = new URL(context.request.url);
  const bulan = url.searchParams.get('bulan');
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid. Gunakan format YYYY-MM.', 400);
  const range = monthRangeUtc(bulan);

  try {
    const { results: agg } = await db.prepare(`
      SELECT s.staff_id, s.task_type_id, COUNT(*) AS n
      FROM submissions s
      WHERE s.created_at >= ? AND s.created_at < ?
      GROUP BY s.staff_id, s.task_type_id
    `).bind(range.fromUtc, range.toUtc).all();

    const { results: roles } = await db
      .prepare('SELECT id, nama FROM task_types WHERE aktif = 1 ORDER BY urutan ASC, id ASC').all();
    const { results: staffRows } = await db.prepare('SELECT id, nama FROM staff ORDER BY nama').all();

    const byStaff = {};
    agg.forEach(r => {
      byStaff[r.staff_id] = byStaff[r.staff_id] || { total: 0, counts: {} };
      byStaff[r.staff_id].total += r.n;
      byStaff[r.staff_id].counts[r.task_type_id] = r.n;
    });

    const rows = staffRows.map(s => ({
      staff_id: s.id,
      staff_name: s.nama,
      total: byStaff[s.id] ? byStaff[s.id].total : 0,
      counts: byStaff[s.id] ? byStaff[s.id].counts : {},
    })).filter(r => r.total > 0);

    return json({
      bulan,
      roles: roles.map(r => ({ id: r.id, nama: r.nama })),
      rows,
      grand_total: rows.reduce((sum, r) => sum + r.total, 0),
    });
  } catch {
    return fail('Gagal membuat rekap.', 500);
  }
};
