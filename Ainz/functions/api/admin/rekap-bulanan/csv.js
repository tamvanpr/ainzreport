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

// GET /api/admin/rekap-bulanan/csv?bulan=YYYY-MM
export const onRequestGet = async (context) => {
  const { error } = await guard(context);
  if (error) return error;
  const db = context.env.DB;
  const q = context.request.url.split('?')[1];
  const params = new URLSearchParams(q);
  const bulan = params.get('bulan');
  if (!bulan || !monthRangeUtc(bulan)) return fail('Bulan tidak valid.', 400);
  const range = monthRangeUtc(bulan);

  const { results: agg } = await db.prepare(`
    SELECT s.staff_id, s.task_type_id, COUNT(*) AS n
    FROM submissions s
    WHERE s.created_at >= ? AND s.created_at < ?
    GROUP BY s.staff_id, s.task_type_id
  `).bind(range.fromUtc, range.toUtc).all();

  const { results: taskRows } = await db
    .prepare('SELECT id, nama FROM task_types WHERE aktif = 1 ORDER BY urutan ASC, id ASC').all();

  const byStaff = {};
  agg.forEach(r => {
    byStaff[r.staff_id] = byStaff[r.staff_id] || { total: 0, counts: {} };
    byStaff[r.staff_id].total += r.n;
    byStaff[r.staff_id].counts[r.task_type_id] = r.n;
  });

  // Nama staff
  const { results: staffNames } = await db.prepare(
    'SELECT id, nama FROM staff WHERE id IN (' + Object.keys(byStaff).join(', ') + ')'
  ).all();
  const nameMap = {};
  staffNames.forEach(s => { nameMap[s.id] = s.nama; });

  const headers = ['Staff', ...taskRows.map(t => t.nama), 'Total'];
  const rows = Object.keys(byStaff).map(sid => {
    const c = byStaff[sid].counts;
    return [
      nameMap[sid] || 'Staff #' + sid,
      ...taskRows.map(t => c[t.id] || 0),
      byStaff[sid].total,
    ];
  });
  // Baris total keseluruhan
  const totals = taskRows.map(t => agg.reduce((sum, r) => sum + (r.task_type_id === t.id ? r.n : 0), 0));
  rows.push(['TOTAL', ...totals, totals.reduce((a, b) => a + b, 0)]);

  return csvResponse(headers, rows, 'rekap-bulanan-' + bulan + '.csv');
};
