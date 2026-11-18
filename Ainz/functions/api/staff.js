import { json, fail } from '../_utils.js';

// GET /api/staff  -> daftar staff aktif
export const onRequestGet = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);
  try {
    const { results } = await db.prepare('SELECT id, nama FROM staff WHERE aktif = 1 ORDER BY nama').all();
    return json({ staff: results });
  } catch (e) {
    return fail('Gagal memuat daftar staff.', 500);
  }
};
