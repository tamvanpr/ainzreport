import { getValidSession, json } from '../../../_admin_session.js';
import { fail, monthRangeUtc, SECURITY_HEADERS } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: new Response('Sesi tidak valid.', { status: 401 }) };
    return { session, error: null };
  });
}

// Escape CSV: kutip field yang mengandung koma/kutipan/baris baru
function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvResponse(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
  // BOM + UTF-8 agar rapi di Excel / Sheets
  const text = '\uFEFF' + lines.join('\r\n');
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="setoran.csv"',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
    },
  });
}

// GET /api/admin/submissions/csv?bulan=&staff_id=&title_id=&task_type_id=
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
    if (range) { clauses.push('s.created_at >= ?'); clauses.push('s.created_at < ?'); binds.push(range.fromUtc, range.toUtc); }
  }
  const staffId = params.get('staff_id');
  if (staffId) { clauses.push('s.staff_id = ?'); binds.push(Number(staffId)); }
  const titleId = params.get('title_id');
  if (titleId) { clauses.push('s.title_id = ?'); binds.push(Number(titleId)); }
  const taskId = params.get('task_type_id');
  if (taskId) { clauses.push('s.task_type_id = ?'); binds.push(Number(taskId)); }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';

  const { results } = await db.prepare(`
    SELECT s.created_at, st.nama AS staff_name, t.nama AS title_name, s.chapter, k.nama AS task_name
    FROM submissions s
    JOIN staff st ON st.id = s.staff_id
    JOIN titles t ON t.id = s.title_id
    JOIN task_types k ON k.id = s.task_type_id
    ${where}
    ORDER BY s.created_at ASC, s.id ASC
  `).bind(...binds).all();

  return csvResponse(
    ['Tanggal (Jakarta)', 'Staff', 'Judul', 'Chapter', 'Tugas'],
    results.map(r => [
      new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      r.staff_name, r.title_name, r.chapter, r.task_name,
    ]),
  );
};
