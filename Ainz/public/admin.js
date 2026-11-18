/* Halaman admin — vanilla JS */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const htmlPolicy = (typeof trustedTypes !== 'undefined' && trustedTypes && trustedTypes.createPolicy)
    ? trustedTypes.createPolicy('setoran-admin-template', {
        createHTML: (input) => {
          const html = String(input);
          if (/<script\b|javascript:|\son\w+\s*=/i.test(html)) {
            throw new Error('Template HTML tidak aman.');
          }
          return html;
        },
      })
    : null;
  const setHtml = (el, html) => {
    if (htmlPolicy) el.innerHTML = htmlPolicy.createHTML(html);
    else el.innerHTML = html; // fallback: browser tanpa Trusted Types (nilai sudah via escapeHtml)
  };

  const api = async (url, options) => {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (res.status === 401) { onUnauthorized(); throw new Error('Sesi berakhir. Silakan masuk kembali.'); }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Terjadi kesalahan. Coba lagi.');
    return data;
  };

  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const put = (url, body) => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const del = (url) => api(url, { method: 'DELETE' });

  const formatDate = (isoUtc) => {
    if (!isoUtc) return '';
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return String(isoUtc);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  };

  const toMonthValue = (date = new Date()) => {
    const dt = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 12));
    const off = dt.getTimezoneOffset();
    return new Date(dt.getTime() - off * 60000).toISOString().slice(0, 10);
  };

  // ===== Elemen =====
  const loginCard = $('#login-card');
  const adminArea = $('#admin-area');
  const loginForm = $('#login-form');
  const passwordInput = $('#password');
  const flash = $('#flash');
  const editDialog = $('#dialog-edit-setoran');

  let staff = []; let titles = []; let tasks = [];
  let setoranFilters = { bulan: toMonthValue(), staff_id: '', title_id: '', task_type_id: '' };
  let rekapBulanan = { data: null, bulan: toMonthValue() };
  let rekapPerStaff = { data: null, staff_id: 0, bulan: toMonthValue() };

  // ===== Flash =====
  let flashTimer;
  const showFlash = (msg, type) => {
    flash.textContent = msg;
    flash.className = 'flash is-' + type;
    clearTimeout(flashTimer);
    if (type === 'success') flashTimer = setTimeout(() => { flash.textContent = ''; flash.className = 'flash'; }, 6000);
  };

  // ===== Auth =====
  const onUnauthorized = () => {
    adminArea.hidden = true;
    loginCard.hidden = false;
    loginForm.reset();
    showFlash('Anda belum masuk atau sesi sudah berakhir.', 'error');
  };

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#btn-login');
    btn.disabled = true;
    try {
      await post('/api/admin/login', { password: passwordInput.value });
      await enterAdmin();
      showFlash('Masuk berhasil.', 'success');
    } catch (err) {
      showFlash(err.message, 'error');
    } finally {
      btn.disabled = false;
      passwordInput.value = '';
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    try { await post('/api/admin/logout'); } catch { /* abaikan */ }
    onUnauthorized();
  });

  const enterAdmin = async () => {
    loginCard.hidden = true;
    adminArea.hidden = false;
    await loadMasters();
    await populateAddSetoran();
    refreshSetoranFilters();
    refreshRecapControls();
    renderStaff(); renderTitles(); renderTasks();
    await renderSubmissions();
  };

  // Populasi form tambah setoran (master aktif)
  const populateAddSetoran = async () => {
    try {
      const [s, t, k] = await Promise.all([
        api('/api/admin/staff'), api('/api/admin/titles'), api('/api/admin/tasks'),
      ]);
      fillSelectKeep($('#s-staff'), s.staff, 'Pilih staff', '');
      fillSelectKeep($('#s-title'), t.titles, 'Pilih judul', '');
      fillSelectKeep($('#s-task'), k.tasks, 'Pilih role', '');
    } catch { /* ditangani di api() */ }
  };

  // ===== Masters =====
  const loadMasters = async () => {
    const [s, t, k] = await Promise.all([
      api('/api/admin/staff'), api('/api/admin/titles'), api('/api/admin/tasks'),
    ]);
    staff = s.staff; titles = t.titles; tasks = k.tasks;
  };

  const fillSelect = (sel, items, emptyLabel, includeInactive = false) => {
    const keep = sel.dataset.keep;
    setHtml(sel, `<option value="" selected disabled>${emptyLabel}</option>` +
      items.filter(i => includeInactive || i.aktif === 1)
        .map(i => `<option value="${i.id}">${escapeHtml(i.nama)}</option>`).join(''));
    if (keep !== undefined) sel.value = keep;
  };

  const fillSelectKeep = (sel, items, emptyLabel, keepValue) => {
    sel.dataset.keep = '';
    setHtml(sel, `<option value="${emptyLabel}" disabled>${emptyLabel}</option>` +
      items.map(i => `<option value="${i.id}">${escapeHtml(i.nama)}</option>`).join(''));
    sel.value = keepValue;
  };

  const refreshSetoranFilters = () => {
    fillSelect($('#f-staff'), staff, 'Semua staff', true);
    fillSelect($('#f-title'), titles, 'Semua judul', true);
    fillSelectKeep($('#f-task'), tasks, 'Semua role', '');
  };

  const refreshRecapControls = () => {
    fillSelectKeep($('#ps-staff'), staff, 'Pilih staff', '0');
    const monthInput = $('#r-bulan');
    if (!monthInput.value) monthInput.value = toMonthValue();
    const psBulan = $('#ps-bulan');
    if (!psBulan.value) psBulan.value = toMonthValue();
  };

  // ===== Daftar setoran =====
  const renderSubmissions = async () => {
    const qs = new URLSearchParams();
    if (setoranFilters.bulan) qs.set('bulan', setoranFilters.bulan);
    if (setoranFilters.staff_id) qs.set('staff_id', setoranFilters.staff_id);
    if (setoranFilters.title_id) qs.set('title_id', setoranFilters.title_id);
    if (setoranFilters.task_type_id) qs.set('task_type_id', setoranFilters.task_type_id);
    try {
      const d = await api('/api/admin/submissions?' + qs.toString());
      const tbody = $('#tabel-setoran tbody');
      if (!d.items.length) {
        setHtml(tbody, '<tr><td colspan="6" class="empty-note">Belum ada setoran untuk filter ini.</td></tr>');
        return;
      }
      setHtml(tbody, d.items.map(it => `
        <tr>
          <td>${escapeHtml(formatDate(it.created_at))}</td>
          <td>${escapeHtml(it.staff_name)}</td>
          <td>${escapeHtml(it.title_name)}</td>
          <td>${escapeHtml(it.chapter)}</td>
          <td>${escapeHtml(it.task_name)}</td>
          <td class="row-actions">
            <button class="btn btn-sm" data-edit="${it.id}">Edit</button>
            <button class="btn btn-sm btn-danger" data-del="${it.id}">Hapus</button>
          </td>
        </tr>`).join(''));
    } catch (e) { showFlash(e.message, 'error'); }
  };

  $('#btn-apply-filter').addEventListener('click', () => {
    setoranFilters = {
      bulan: $('#f-bulan').value,
      staff_id: $('#f-staff').value,
      title_id: $('#f-title').value,
      task_type_id: $('#f-task').value,
    };
    renderSubmissions();
  });

  $('#btn-reset-filter').addEventListener('click', () => {
    setoranFilters = { bulan: toMonthValue(), staff_id: '', title_id: '', task_type_id: '' };
    $('#f-bulan').value = setoranFilters.bulan;
    refreshSetoranFilters();
    renderSubmissions();
  });

  $('#btn-export-setoran').addEventListener('click', async () => {
    const qs = new URLSearchParams();
    Object.entries(setoranFilters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    try {
      const res = await fetch('/api/admin/submissions/csv?' + qs.toString());
      if (!res.ok) throw new Error('Gagal membuat CSV.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `setoran-${setoranFilters.bulan || 'semua'}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { showFlash(e.message, 'error'); }
  });

  // Tambah setoran
  $('#form-setoran').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/api/admin/submissions', {
        staff_id: Number($('#s-staff').value),
        title_id: Number($('#s-title').value),
        chapter: $('#s-chapter').value.trim(),
        task_type_id: Number($('#s-task').value),
      });
      e.target.reset();
      showFlash('Setoran ditambahkan.', 'success');
      refreshSetoranFilters();
      renderSubmissions();
    } catch (err) { showFlash(err.message, 'error'); }
  });

  // Edit & hapus setoran
  $('#tabel-setoran').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const id = Number(delBtn.dataset.del);
      if (!confirm('Hapus setoran ini?')) return;
      try {
        await del(`/api/admin/submissions/${id}`);
        showFlash('Setoran dihapus.', 'success');
        renderSubmissions();
      } catch (err) { showFlash(err.message, 'error'); }
    }
    if (editBtn) openEditDialog(Number(editBtn.dataset.edit));
  });

  const openEditDialog = async (id) => {
    try {
      const d = await api(`/api/admin/submissions/${id}`);
      fillSelectKeep($('#es-staff'), staff, 'Pilih staff', String(d.staff_id));
      fillSelectKeep($('#es-title'), titles, 'Pilih judul', String(d.title_id));
      $('#es-chapter').value = d.chapter;
      fillSelectKeep($('#es-task'), tasks, 'Pilih role', String(d.task_type_id));
      $('#es-id').value = id;
      editDialog.showModal();
    } catch (e) { showFlash(e.message, 'error'); }
  };

  $$('[data-close="dialog-edit-setoran"]').forEach(b =>
    b.addEventListener('click', () => { editDialog.returnValue = 'batal'; editDialog.close(); }));

  editDialog.addEventListener('close', () => { editDialog.returnValue = ''; });

  $('#form-edit-setoran').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number($('#es-id').value);
    try {
      await put(`/api/admin/submissions/${id}`, {
        staff_id: Number($('#es-staff').value),
        title_id: Number($('#es-title').value),
        chapter: $('#es-chapter').value.trim(),
        task_type_id: Number($('#es-task').value),
      });
      showFlash('Setoran diperbarui.', 'success');
      editDialog.close();
      renderSubmissions();
    } catch (err) { showFlash(err.message, 'error'); }
  });

  // ===== Tabs =====
  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab); });
    $$('.tab-panel').forEach(p => { p.hidden = p.id !== 'tab-' + tab.dataset.tab; });
  }));

  // ===== Rekap =====
  const loadRekapBulanan = async () => {
    try {
      const d = await api('/api/admin/rekap-bulanan?bulan=' + encodeURIComponent(rekapBulanan.bulan));
      // Hitung total per tugas untuk baris foot (total keseluruhan)
      const all = {};
      d.rows.forEach(r => {
        (d.counts[r.staff_id] || {}).forEach((v, k) => {
          all[k] = (all[k] || 0) + v;
        });
      });
      d.counts.__all = all;
      rekapBulanan.data = d;
      renderRekapBulanan();
    } catch (e) { showFlash(e.message, 'error'); }
  };

  const renderRekapBulanan = () => {
    const d = rekapBulanan.data;
    const wrap = $('#rekap-bulanan-wrap');
    const table = $('#rekap-bulanan');
    if (!d) { wrap.hidden = true; return; }
    const tasksActive = tasks.filter(t => d.tasks.includes(t.id));
    const staffRows = staff.filter(s => d.rows.some(r => r.staff_id === s.id));
    let html = '<thead><tr><th>Staff</th>';
    tasksActive.forEach(t => { html += `<th>${escapeHtml(t.nama)}</th>`; });
    html += '<th>Total</th></tr></thead><tbody>';
    d.rows.forEach(r => {
      const s = staff.find(x => x.id === r.staff_id);
      const counts = d.counts[r.staff_id] || {};
      html += `<tr><td>${escapeHtml(s ? s.nama : 'Staff #' + r.staff_id)}</td>`;
      tasksActive.forEach(t => { html += `<td>${counts[t.id] || 0}</td>`; });
      html += `<td class="row-total">${r.total}</td></tr>`;
    });
    html += '</tbody><tfoot><tr><td>Total</td>';
    tasksActive.forEach(t => { html += `<td>${(d.counts.__all && d.counts.__all[t.id]) || 0}</td>`; });
    html += `<td class="row-total">${d.grand_total}</td></tr></tfoot>`;
    setHtml(table, html);
    wrap.hidden = false;
  };

  $('#btn-terapkan-rekap').addEventListener('click', () => {
    rekapBulanan.bulan = $('#r-bulan').value;
    loadRekapBulanan();
  });

  $('#btn-export-rekap').addEventListener('click', async () => {
    const res = await fetch('/api/admin/rekap-bulanan/csv?bulan=' + encodeURIComponent(rekapBulanan.bulan));
    if (!res.ok) { showFlash('Gagal membuat CSV.', 'error'); return; }
    downloadBlob(await res.blob(), `rekap-bulanan-${rekapBulanan.bulan}.csv`);
  });

  const loadRekapPerStaff = async () => {
    const staffId = Number($('#ps-staff').value);
    if (!staffId) { showFlash('Pilih staff terlebih dahulu.', 'error'); return; }
    try {
      const d = await api(`/api/admin/rekap-per-staff?staff_id=${staffId}&bulan=${encodeURIComponent(rekapPerStaff.bulan)}`);
      rekapPerStaff.data = d;
      renderRekapPerStaff(staffId);
    } catch (e) { showFlash(e.message, 'error'); }
  };

  const renderRekapPerStaff = (staffId) => {
    const d = rekapPerStaff.data;
    const wrap = $('#rekap-perstaff-wrap');
    const table = $('#rekap-perstaff');
    if (!d) { wrap.hidden = true; return; }
    const s = staff.find(x => x.id === staffId);
    let html = `<thead><tr><th colspan="4">Rincian ${escapeHtml(s ? s.nama : 'staff')} · bulan ${escapeHtml(rekapPerStaff.bulan)}</th></tr>
      <tr><th>Judul</th><th>Chapter</th><th>Role</th><th>Terakhir tercatat</th></tr></thead><tbody>`;
    if (!d.items.length) html += '<tr><td colspan="4" class="empty-note">Belum ada setoran.</td></tr>';
    d.items.forEach(it => {
      html += `<tr><td>${escapeHtml(it.title_name)}</td><td>${escapeHtml(it.chapter)}</td><td>${escapeHtml(it.task_name)}</td><td>${escapeHtml(formatDate(it.last_seen))}</td></tr>`;
    });
    html += '</tbody>';
    setHtml(table, html);
    wrap.hidden = false;
  };

  $('#btn-terapkan-perstaff').addEventListener('click', () => {
    rekapPerStaff.bulan = $('#ps-bulan').value;
    rekapPerStaff.staff_id = Number($('#ps-staff').value);
    loadRekapPerStaff();
  });

  $('#btn-export-perstaff').addEventListener('click', async () => {
    const staffId = rekapPerStaff.staff_id || Number($('#ps-staff').value);
    if (!staffId) { showFlash('Pilih staff terlebih dahulu.', 'error'); return; }
    const res = await fetch(`/api/admin/rekap-per-staff/csv?staff_id=${staffId}&bulan=${encodeURIComponent(rekapPerStaff.bulan)}`);
    if (!res.ok) { showFlash('Gagal membuat CSV.', 'error'); return; }
    downloadBlob(await res.blob(), `rekap-staff-${staffId}-${rekapPerStaff.bulan}.csv`);
  });

  const downloadBlob = async (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // ===== CRUD staff =====
  const renderStaff = () => {
    const tbody = $('#tabel-staff tbody');
    setHtml(tbody, staff.map(s => `
      <tr class="master-row" data-id="${s.id}">
        <td class="grow"><input type="text" class="master-name" value="${escapeHtml(s.nama)}" maxlength="50" autocapitalize="none"></td>
        <td><span class="badge ${s.aktif ? 'active' : 'inactive'}">${s.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td class="row-actions">
          <button class="btn btn-sm" data-save-staff="${s.id}">Simpan</button>
          <button class="btn btn-sm ${s.aktif ? 'btn-danger' : 'btn-primary'}" data-toggle-staff="${s.id}">${s.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </td>
      </tr>`).join(''));
  };

  $('#form-staff').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#staff-nama').value.trim();
    if (!nama) return;
    try {
      await post('/api/admin/staff', { nama });
      e.target.reset();
      await loadMasters(); renderStaff(); refreshSetoranFilters();
      showFlash('Staff ditambahkan.', 'success');
    } catch (err) { showFlash(err.message, 'error'); }
  });

  $('#tabel-staff').addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-id]');
    const id = row ? Number(row.dataset.id) : null;
    const saveBtn = e.target.closest('[data-save-staff]');
    const togBtn = e.target.closest('[data-toggle-staff]');
    if (saveBtn && id) {
      const nama = row.querySelector('.master-name').value.trim();
      try {
        await put(`/api/admin/staff/${id}`, { nama });
        await loadMasters(); renderStaff(); refreshSetoranFilters();
        showFlash('Nama staff diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
    if (togBtn && id) {
      try {
        await post(`/api/admin/staff/${id}/toggle`);
        await loadMasters(); renderStaff(); refreshSetoranFilters();
        showFlash('Status staff diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
  });

  // ===== CRUD judul =====
  const renderTitles = () => {
    const tbody = $('#tabel-title tbody');
    setHtml(tbody, titles.map(t => `
      <tr class="master-row" data-id="${t.id}">
        <td class="grow"><input type="text" class="master-name" value="${escapeHtml(t.nama)}" maxlength="80" autocapitalize="none"></td>
        <td><span class="badge ${t.aktif ? 'active' : 'inactive'}">${t.aktif ? 'Aktif' : 'Arsip'}</span></td>
        <td class="row-actions">
          <button class="btn btn-sm" data-save-title="${t.id}">Simpan</button>
          <button class="btn btn-sm ${t.aktif ? 'btn-danger' : 'btn-primary'}" data-toggle-title="${t.id}">${t.aktif ? 'Arsipkan' : 'Aktifkan'}</button>
        </td>
      </tr>`).join(''));
  };

  $('#form-title').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#title-nama').value.trim();
    if (!nama) return;
    try {
      await post('/api/admin/titles', { nama });
      e.target.reset();
      await loadMasters(); renderTitles(); refreshSetoranFilters();
      showFlash('Judul ditambahkan.', 'success');
    } catch (err) { showFlash(err.message, 'error'); }
  });

  $('#tabel-title').addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-id]');
    const id = row ? Number(row.dataset.id) : null;
    const saveBtn = e.target.closest('[data-save-title]');
    const togBtn = e.target.closest('[data-toggle-title]');
    if (saveBtn && id) {
      const nama = row.querySelector('.master-name').value.trim();
      try {
        await put(`/api/admin/titles/${id}`, { nama });
        await loadMasters(); renderTitles(); refreshSetoranFilters();
        showFlash('Judul diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
    if (togBtn && id) {
      try {
        await post(`/api/admin/titles/${id}/toggle`);
        await loadMasters(); renderTitles(); refreshSetoranFilters();
        showFlash('Status judul diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
  });

  // ===== CRUD tugas =====
  const renderTasks = () => {
    const tbody = $('#tabel-task tbody');
    setHtml(tbody, tasks.map(t => `
      <tr class="master-row" data-id="${t.id}">
        <td class="grow">
          <input type="text" class="task-name" value="${escapeHtml(t.nama)}" maxlength="30">
          <input type="text" class="task-group" value="${escapeHtml(t.grup || '')}" maxlength="20" placeholder="Grup">
        </td>
        <td>${t.grup ? escapeHtml(t.grup) : '—'}</td>
        <td class="row-actions">
          <button class="btn btn-sm" data-save-task="${t.id}">Simpan</button>
          <button class="btn btn-sm ${t.aktif ? 'btn-danger' : 'btn-primary'}" data-toggle-task="${t.id}">${t.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </td>
      </tr>`).join(''));
  };

  $('#form-task').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = $('#task-nama').value.trim();
    if (!nama) return;
    const grup = $('#task-grup').value.trim() || null;
    const urutan = Number($('#task-urutan').value) || 0;
    try {
      await post('/api/admin/tasks', { nama, grup, urutan });
      e.target.reset();
      await loadMasters(); renderTasks(); refreshSetoranFilters();
      showFlash('Role ditambahkan.', 'success');
    } catch (err) { showFlash(err.message, 'error'); }
  });

  $('#tabel-task').addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-id]');
    const id = row ? Number(row.dataset.id) : null;
    const saveBtn = e.target.closest('[data-save-task]');
    const togBtn = e.target.closest('[data-toggle-task]');
    if (saveBtn && id) {
      const nama = row.querySelector('.task-name').value.trim();
      const grup = row.querySelector('.task-group').value.trim() || null;
      try {
        await put(`/api/admin/tasks/${id}`, { nama, grup });
        await loadMasters(); renderTasks(); refreshSetoranFilters();
        showFlash('Role diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
    if (togBtn && id) {
      try {
        await post(`/api/admin/tasks/${id}/toggle`);
        await loadMasters(); renderTasks(); refreshSetoranFilters();
        showFlash('Status role diperbarui.', 'success');
      } catch (err) { showFlash(err.message, 'error'); }
    }
  });

  // ===== Init =====
  (async () => {
    try {
      await api('/api/admin/me');
      await enterAdmin();
    } catch {
      loginCard.hidden = false;
      adminArea.hidden = true;
    }
  })();
})();
