import { json, fail } from '../../../_utils.js';

// GET /api/staff/:id/riwayat  -> 20 setoran terakhir milik staff tertentu
export const onRequestGet = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);

  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return fail('Staff tidak ditemukan.', 404);

  try {
    // Verifikasi staff ada
    const staff = await db.prepare('SELECT id, nama FROM staff WHERE id = ?').bind(id).first();
    if (!staff) return fail('Staff tidak ditemukan.', 404);

    const { results } = await db
      .prepare(`
        SELECT s.chapter, s.created_at,
               t.nama AS task_name,
               ti.nama AS title_name
        FROM submissions s
        JOIN task_types t   ON t.id = s.task_type_id
        JOIN titles ti      ON ti.id = s.title_id
        WHERE s.staff_id = ?
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 20
      `)
      .bind(id)
      .all();

    return json({
      staff_id: id,
      staff_name: staff.nama,
      items: results,
    });
  } catch (e) {
    return fail('Gagal memuat riwayat.', 500);
  }
};
