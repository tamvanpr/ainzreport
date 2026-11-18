import { getValidSession, json } from '../../_admin_session.js';
import { fail, isValidName, cleanStr } from '../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

// GET /api/admin/tasks -> semua tugas (termasuk nonaktif)
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  try {
    const { results } = await db
      .prepare('SELECT id, nama, grup, aktif, urutan FROM task_types ORDER BY urutan ASC, id ASC')
      .all();
    return json({ tasks: results });
  } catch {
    return fail('Gagal memuat tugas.', 500);
  }
};

// POST /api/admin/tasks -> tambah tugas { nama, grup?, urutan? }
export const onRequestPost = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return fail('Format tidak valid.', 400); }
  const nama = cleanStr(body.nama, 30);
  if (!isValidName(nama, 30)) return fail('Nama tugas tidak valid (maksimal 30 karakter).', 400);
  const grup = body.grup === null || body.grup === '' ? null : cleanStr(body.grup, 20) || null;
  if (grup && !isValidName(grup, 20)) return fail('Nama grup tidak valid.', 400);
  let urutan = Number(body.urutan);
  if (!Number.isInteger(urutan) || urutan < 0 || urutan > 99) urutan = 0;
  try {
    await db.prepare('INSERT INTO task_types (nama, grup, urutan) VALUES (?, ?, ?)').bind(nama, grup, urutan).run();
    return json({ ok: true, message: 'Tugas ditambahkan.' });
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes('unique')) return fail('Tugas dengan nama itu sudah ada.', 400);
    return fail('Gagal menambah tugas.', 500);
  }
};
