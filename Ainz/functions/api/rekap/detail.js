import { json, fail, monthRangeUtc } from '../../_utils.js';

// GET /api/rekap/detail?staff_id=&bulan=YYYY-MM  -> rincian setoran satu staff (publik)
export const onRequestGet = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);

  const url = new URL(context.request.url);
  const staffId = Number(url.searchParams.get('staff_id'));
  const bulan = url.searchParams.get('bulan');
  if (!Number.isInteger(staffId) || staffId <= 0) return fail('Pilih staff yang valid.', 400);
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid. Gunakan format YYYY-MM.', 400);
  const range = monthRangeUtc(bulan);

  try {
    const staff = await db.prepare('SELECT id, nama FROM staff WHERE id = ?').bind(staffId).first();
    if (!staff) return fail('Staff tidak ditemukan.', 404);

    const { results: items } = await db.prepare(`
      SELECT t.nama AS judul, s.chapter, k.nama AS role_name,
             COUNT(*) AS n, MAX(s.created_at) AS last_seen
      FROM submissions s
      JOIN titles t ON t.id = s.title_id
      JOIN task_types k ON k.id = s.task_type_id
      WHERE s.staff_id = ? AND s.created_at >= ? AND s.created_at < ?
      GROUP BY t.id, s.chapter, k.id
      ORDER BY t.nama, s.chapter, k.nama
    `).bind(staffId, range.fromUtc, range.toUtc).all();

    return json({ bulan, staff_id: staffId, staff_name: staff.nama, items });
  } catch {
    return fail('Gagal memuat rincian rekap.', 500);
  }
};
