import { json, fail } from '../_utils.js';

// GET /api/tasks  -> daftar tugas aktif (termasuk grup), urut sesuai `urutan`
export const onRequestGet = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);
  try {
    const { results } = await db
      .prepare('SELECT id, nama, grup FROM task_types WHERE aktif = 1 ORDER BY urutan ASC, id ASC')
      .all();
    return json({ tasks: results });
  } catch (e) {
    return fail('Gagal memuat daftar tugas.', 500);
  }
};
