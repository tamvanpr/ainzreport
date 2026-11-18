/* Halaman setoran staff — vanilla JS, tanpa framework */
(() => {
  'use strict';

  // ===== Utilitas =====
  const $ = (sel, root = document) => root.querySelector(sel);

  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // Trusted Types policy khusus template buatan sendiri. Nilai dinamis sudah
  // melewati escapeHtml() sebelum masuk ke sini; tag asli tetap jadi elemen.
  const htmlPolicy = (typeof trustedTypes !== 'undefined' && trustedTypes && trustedTypes.createPolicy)
    ? trustedTypes.createPolicy('setoran-template', {
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
    else el.innerHTML = html;
  };

  const api = async (url, options) => {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch { /* respons non-JSON */ }
    if (!res.ok) throw new Error((data && (data.message || data.error)) || 'Terjadi kesalahan. Coba lagi.');
    return data;
  };

  const formatDate = (isoUtc) => {
    if (!isoUtc) return '';
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return String(isoUtc);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(d);
  };

  const monthNow = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // ===== Elemen =====
  const form = $('#form');
  const chapterInput = $('#chapter');
  const dialog = $('#konfirmasi');
  const ringkas = $('#konfirmasi-ringkas');
  const btnKonfirmasi = $('#btn-konfirmasi');
  const btnKembali = $('#btn-kembali');
  const flash = $('#flash');
  const riwayatCard = $('#riwayat-card');
  const riwayatHeading = $('#riwayat-heading');
  const riwayatList = $('#riwayat-list');
  const rekapBulan = $('#rekap-bulan');
  const rekapStaffSel = $('#rekap-staff');
  const rekapSummaryWrap = $('#rekap-summary-wrap');
  const rekapDetailWrap = $('#rekap-detail-wrap');

  let staffList = [];
  let titleList = [];
  let taskList = [];
  let currentData = null;
  let onNicknameSelect = () => {};

  // ===== Flash =====
  let flashTimer;
  const showFlash = (msg, type) => {
    flash.textContent = msg;
    flash.className = 'flash is-' + type;
    clearTimeout(flashTimer);
    if (type === 'success') {
      flashTimer = setTimeout(() => { flash.textContent = ''; flash.className = 'flash'; }, 6000);
    }
  };

  // ===== Combobox: bisa diketik + saran dari daftar =====
  const setupCombo = (inputSel, idSel, listSel, onSelect) => {
    const input = $(inputSel);
    const hidden = $(idSel);
    const list = $(listSel);
    let items = [];
    let active = -1;

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    };
    const setActive = (opts, i) => {
      active = i;
      opts.forEach((o, n) => {
        o.classList.toggle('is-active', n === i);
        o.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      if (i >= 0 && opts[i]) input.setAttribute('aria-activedescendant', opts[i].id);
      else input.removeAttribute('aria-activedescendant');
    };
    const paint = (query = '') => {
      const q = String(query).trim().toLocaleLowerCase('id-ID');
      const shown = items.filter(i => i.nama.toLocaleLowerCase('id-ID').includes(q)).slice(0, 40);
      if (!shown.length) {
        setHtml(list, '<li class="combo-empty" role="presentation">Tidak ada hasil.</li>');
      } else {
        setHtml(list, shown.map((o, idx) =>
          `<li id="${listSel.slice(1)}-opt-${idx}" role="option" data-id="${o.id}" ` +
          `data-nama="${escapeHtml(o.nama)}" aria-selected="false">` +
          `<span>${escapeHtml(o.nama)}</span>${o.grup ? `<small>${escapeHtml(o.grup)}</small>` : ''}</li>`
        ).join(''));
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    };
    const choose = (id, nama) => {
      hidden.value = String(id);
      input.value = nama;
      close();
      if (onSelect) onSelect(id);
    };

    input.addEventListener('focus', () => paint(input.value));
    input.addEventListener('input', () => { hidden.value = ''; paint(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      const opts = [...list.querySelectorAll('li[role="option"]')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) { paint(input.value); return; }
        if (!opts.length) return;
        const next = e.key === 'ArrowDown'
          ? (active + 1) % opts.length
          : (active - 1 + opts.length) % opts.length;
        setActive(opts, next);
        opts[next].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && !list.hidden && active >= 0 && opts[active]) {
        e.preventDefault();
        choose(opts[active].dataset.id, opts[active].dataset.nama);
      }
    });
    // Cegah input blur sebelum klik opsi sempat diproses
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('li[role="option"]');
      if (opt) choose(opt.dataset.id, opt.dataset.nama);
    });
    input.addEventListener('blur', () => {
      const typed = input.value.trim().toLocaleLowerCase('id-ID');
      const exact = items.find(i => i.nama.toLocaleLowerCase('id-ID') === typed);
      if (exact) choose(exact.id, exact.nama);
      setTimeout(close, 100);
    });

    return {
      value: () => hidden.value,
      setItems(next) { items = next; },
      setValue(id) {
        const found = items.find(i => i.id === Number(id));
        if (found) choose(found.id, found.nama);
        else { hidden.value = ''; input.value = ''; }
      },
      clear() { hidden.value = ''; input.value = ''; close(); },
    };
  };

  const nickname = setupCombo('#nickname', '#nickname-id', '#nickname-list', (id) => onNicknameSelect(id));
  const judul = setupCombo('#judul', '#judul-id', '#judul-list');
  const tugas = setupCombo('#tugas', '#tugas-id', '#tugas-list');

  // ===== Muat data master =====
  const loadOptions = async () => {
    try {
      const [s, t, k] = await Promise.all([
        api('/api/staff').then(d => d.staff),
        api('/api/titles').then(d => d.titles),
        api('/api/tasks').then(d => d.tasks),
      ]);
      staffList = s; titleList = t; taskList = k;
      nickname.setItems(s); judul.setItems(t); tugas.setItems(k);
      setHtml(rekapStaffSel, '<option value="">Pilih staff…</option>' +
        s.map(x => `<option value="${x.id}">${escapeHtml(x.nama)}</option>`).join(''));
    } catch (e) {
      showFlash(e.message, 'error');
    }
  };

  // ===== Riwayat staff =====
  const loadHistory = async (staffId) => {
    if (!staffId) { riwayatCard.hidden = true; return; }
    try {
      const d = await api(`/api/staff/${staffId}/riwayat`);
      const staff = staffList.find(s => s.id === Number(staffId));
      riwayatHeading.textContent = `Riwayat 20 setoran terakhir — ${staff ? staff.nama : ''}`;
      if (!d.items.length) {
        setHtml(riwayatList, '<li class="empty-note">Belum ada setoran.</li>');
      } else {
        setHtml(riwayatList, d.items.map(it => `
          <li>
            <span class="riwayat-ch">${escapeHtml(it.title_name)} · ch ${escapeHtml(it.chapter)}</span>
            <span class="riwayat-meta">${escapeHtml(it.task_name)}<br>${escapeHtml(formatDate(it.created_at))}</span>
          </li>`).join(''));
      }
      riwayatCard.hidden = false;
    } catch (e) {
      showFlash(e.message, 'error');
    }
  };
  onNicknameSelect = (id) => loadHistory(id);

  // ===== Rekap publik =====
  const loadRekapSummary = async () => {
    const bulan = rekapBulan.value || monthNow();
    try {
      const d = await api('/api/rekap?bulan=' + encodeURIComponent(bulan));
      let html = '<thead><tr><th>Staff</th>';
      d.roles.forEach(r => { html += `<th>${escapeHtml(r.nama)}</th>`; });
      html += '<th>Total</th></tr></thead><tbody>';
      if (!d.rows.length) {
        html += `<tr><td colspan="${d.roles.length + 2}" class="empty-note">Belum ada setoran bulan ini.</td></tr>`;
      }
      d.rows.forEach(r => {
        html += `<tr><td>${escapeHtml(r.staff_name)}</td>`;
        d.roles.forEach(role => { html += `<td>${r.counts[role.id] || 0}</td>`; });
        html += `<td class="row-total">${r.total}</td></tr>`;
      });
      html += '</tbody>';
      setHtml($('#rekap-staff-table'), html);
      rekapSummaryWrap.hidden = false;
    } catch (e) { showFlash(e.message, 'error'); }
  };

  const loadRekapDetail = async (staffId) => {
    if (!staffId) { rekapDetailWrap.hidden = true; return; }
    const bulan = rekapBulan.value || monthNow();
    try {
      const d = await api(`/api/rekap/detail?staff_id=${staffId}&bulan=${encodeURIComponent(bulan)}`);
      let html = `<thead><tr><th>Judul</th><th>Chapter</th><th>Role</th><th>Jml</th><th>Terakhir</th></tr></thead><tbody>`;
      if (!d.items.length) {
        html += '<tr><td colspan="5" class="empty-note">Belum ada setoran bulan ini.</td></tr>';
      }
      d.items.forEach(it => {
        html += `<tr><td>${escapeHtml(it.judul)}</td><td>${escapeHtml(it.chapter)}</td>` +
          `<td>${escapeHtml(it.role_name)}</td><td>${it.n}</td>` +
          `<td>${escapeHtml(formatDate(it.last_seen))}</td></tr>`;
      });
      html += '</tbody>';
      setHtml($('#rekap-detail-table'), html);
      rekapDetailWrap.hidden = false;
    } catch (e) { showFlash(e.message, 'error'); }
  };

  $('#btn-rekap').addEventListener('click', () => {
    loadRekapSummary();
    loadRekapDetail(rekapStaffSel.value);
  });
  rekapStaffSel.addEventListener('change', () => loadRekapDetail(rekapStaffSel.value));

  // ===== Alur form → konfirmasi =====
  const collectPayload = () => ({
    staff_id: Number(nickname.value()),
    title_id: Number(judul.value()),
    chapter: chapterInput.value.trim(),
    task_ids: [Number(tugas.value())],
  });

  const buildRingkasan = (data) => {
    const staff = staffList.find(s => s.id === data.staff_id);
    const title = titleList.find(t => t.id === data.title_id);
    const role = taskList.find(t => t.id === data.task_ids[0]);
    const rows = [
      ['Nickname', staff ? staff.nama : ''],
      ['Judul', title ? title.nama : ''],
      ['Chapter', data.chapter],
      ['Role', role ? role.nama : ''],
    ];
    setHtml(ringkas, rows.map(([k, v]) =>
      `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join(''));
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nickname.value() || !judul.value() || !chapterInput.value.trim() || !tugas.value()) {
      showFlash('Lengkapi nickname, judul, chapter, dan role. Pilih dari daftar yang tersedia.', 'error');
      return;
    }
    currentData = collectPayload();
    buildRingkasan(currentData);
    dialog.showModal();
  });

  const openDialog = () => { if (!dialog.open) dialog.showModal(); };
  const closeDialog = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(); });

  const triggerDialogClose = (value) => {
    dialog.returnValue = value;
    const closeForm = dialog.querySelector('form[method="dialog"]');
    if (closeForm) closeForm.requestSubmit();
    else closeDialog();
  };

  dialog.addEventListener('close', () => {
    const chosen = dialog.returnValue;
    dialog.returnValue = '';
    if (chosen !== 'confirm') $('#nickname').focus();
  });

  btnKembali.addEventListener('click', () => triggerDialogClose('kembali'));

  btnKonfirmasi.addEventListener('click', async () => {
    if (!currentData) return;
    btnKonfirmasi.disabled = true;
    try {
      const res = await api('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentData),
      });
      // Kosongkan form kecuali nickname
      judul.clear();
      chapterInput.value = '';
      tugas.clear();
      currentData = null;

      const newCount = res.saved || 0;
      const skipped = res.skipped || [];
      let msg = `Berhasil menyimpan ${newCount} setoran.`;
      if (skipped.length > 0) {
        const names = taskList.filter(t => skipped.includes(t.id)).map(t => t.nama).join(', ');
        msg += ` Sudah tercatat sebelumnya (${names}).`;
      }
      showFlash(msg, 'success');
      triggerDialogClose('confirm');
      loadHistory(nickname.value());
      if (!rekapSummaryWrap.hidden) { loadRekapSummary(); loadRekapDetail(rekapStaffSel.value); }
    } catch (e) {
      showFlash(e.message, 'error');
      openDialog();
    } finally {
      btnKonfirmasi.disabled = false;
    }
  });

  // ===== Init =====
  rekapBulan.value = monthNow();
  loadOptions();
})();
