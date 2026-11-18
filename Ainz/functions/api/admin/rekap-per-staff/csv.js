import { getValidSession } from '../../../_admin_session.js';
import { fail, monthRangeUtc, SECURITY_HEADERS } from '../../../_utils.js';

function guard(context) {
  return getValidSession(context).then((session) => {
    if (!session) return { error: fail('Sesi tidak valid atau berakhir.', 401) };
    return { session, error: null };
  });
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvResponse(headers, rows, filename) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
  const text = '\uFEFF' + lines.join('\r\n');
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
    },
  });
}

// GET /api/admin/rekap-per-staff/csv?staff_id=&bulan=YYYY-MM
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const q = context.request.url.split('?')[1];
  const params = new URLSearchParams(q);
  const staffId = Number(params.get('staff_id'));
  const bulan = params.get('bulan');
  if (!Number.isInteger(staffId) || staffId <= 0) return fail('Pilih staff yang valid.', 400);
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid.', 400);
  const range = monthRangeUtc(bulan);

  const s = await db.prepare('SELECT id, nama FROM staff WHERE id = ?').bind(staffId).first();
  if (!s) return fail('Staff tidak ditemukan.', 404);

  const { results: items } = await db.prepare(`
    SELECT t.nama AS title_name, s.chapter, k.nama AS task_name,
           COUNT(*) AS n, MAX(s.created_at) AS last_seen
    FROM submissions s
    JOIN titles t ON t.id = s.title_id
    JOIN task_types k ON k.id = s.task_type_id
    WHERE s.staff_id = ? AND s.created_at >= ? AND s.created_at < ?
    GROUP BY t.id, s.chapter, k.id
    ORDER BY t.nama, s.chapter, k.nama
  `).bind(staffId, range.fromUtc, range.toUtc).all();

  return csvResponse(
    ['Judul', 'Chapter', 'Tugas', 'Jumlah', 'Terakhir tercatat'],
    items.map(r => [
      r.title_name, r.chapter, r.task_name, r.n,
      new Date(r.last_seen).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
    ]),
    'rekap-staff-' + staffId + '-' + bulan + '.csv',
  );
};
