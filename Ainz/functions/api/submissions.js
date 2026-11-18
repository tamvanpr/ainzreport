import { json, fail, isValidChapter, rateLimitOk, cleanStr } from '../_utils.js';

const MAX_TASKS = 6;

// Hash SHA-256 singkat (dipakai untuk key rate-limit agar tidak menumpuk IP mentah)
async function shortHash(input) {
  const data = new TextEncoder().encode(input);
  try {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return 'sha256_' + new Uint8Array(buf).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '').slice(0, 16);
  } catch {
    return 'k_' + btoa(encodeURIComponent(input)).replace(/[+/=]/g, '');
  }
}

// POST /api/submissions  -> catat setoran (bisa beberapa tugas sekaligus)
export const onRequestPost = async (context) => {
  const db = context.env.DB;
  if (!db) return fail('Database belum terhubung.', 500);

  // Rate limit berdasarkan IP (di-hash)
  const ip = (context.request.headers.get('CF-Connecting-IP') ||
    context.request.headers.get('x-forwarded-for') ||
    'unknown').split(',')[0].trim();
  const key = 'sub_' + await shortHash(ip);
  if (!(await rateLimitOk(db, key, 10, 60_000))) {
    return fail('Terlalu banyak permintaan. Coba lagi beberapa saat.', 429);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return fail('Format permintaan tidak valid.', 400);
  }

  const staffId = Number(body.staff_id);
  const titleId = Number(body.title_id);
  const chapter = cleanStr(body.chapter, 50);
  let taskIds = Array.isArray(body.task_ids)
    ? [...new Set(body.task_ids.map(Number).filter(Number.isInteger))]
    : [];

  // Validasi server
  if (!Number.isInteger(staffId) || staffId <= 0) return fail('Pilih nickname yang valid.', 400);
  if (!Number.isInteger(titleId) || titleId <= 0) return fail('Pilih judul yang valid.', 400);
  if (!isValidChapter(chapter)) return fail('Chapter maksimal 20 karakter, hanya angka/titik/huruf sederhana.', 400);
  if (taskIds.length === 0) return fail('Pilih minimal satu tugas.', 400);
  if (taskIds.length > MAX_TASKS) return fail(`Maksimal ${MAX_TASKS} tugas per submit.`, 400);

  try {
    // Verifikasi staff aktif
    const staff = await db.prepare('SELECT id FROM staff WHERE id = ? AND aktif = 1').bind(staffId).first();
    if (!staff) return fail('Nickname tidak aktif. Gunakan nickname yang sama dengan biasanya.', 400);

    // Verifikasi judul aktif
    const title = await db.prepare('SELECT id FROM titles WHERE id = ? AND aktif = 1').bind(titleId).first();
    if (!title) return fail('Judul tidak aktif atau tidak ditemukan.', 400);

    // Verifikasi tugas aktif
    const ph = taskIds.map(() => '?').join(', ');
    const found = await db
      .prepare(`SELECT id FROM task_types WHERE id IN (${ph}) AND aktif = 1`)
      .bind(...taskIds).all();
    const validSet = new Set(found.results.map(r => r.id));
    const activeTaskIds = taskIds.filter(id => validSet.has(id));
    if (activeTaskIds.length === 0) return fail('Tugas yang dipilih tidak aktif.', 400);

    // Cek duplikat per tugas
    const dup = await db
      .prepare(`SELECT task_type_id FROM submissions WHERE staff_id = ? AND title_id = ? AND chapter = ? AND task_type_id IN (${ph})`)
      .bind(staffId, titleId, chapter, ...activeTaskIds).all();
    const dupSet = new Set(dup.results.map(r => r.task_type_id));

    const toInsert = activeTaskIds.filter(id => !dupSet.has(id));
    const skipped = activeTaskIds.filter(id => dupSet.has(id));

    if (toInsert.length > 0) {
      for (const tid of toInsert) {
        await db
          .prepare('INSERT INTO submissions (staff_id, title_id, chapter, task_type_id) VALUES (?, ?, ?, ?)')
          .bind(staffId, titleId, chapter, tid).run();
      }
    }

    return json({
      ok: true,
      saved: toInsert.length,
      skipped,
      message: skipped.length
        ? `${skipped.length} tugas sudah tercatat sebelumnya dan tidak dimasukkan.`
        : 'Setoran berhasil disimpan.',
    });
  } catch (e) {
    return fail('Gagal menyimpan setoran. Coba lagi.', 500);
  }
};
