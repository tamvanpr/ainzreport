/* Halaman setoran staff — vanilla JS, tanpa framework */
(() => {
  'use strict';

  // ===== Utilitas =====
  const $ = (sel, root = document) => root.querySelector(sel);

  // Escape HTML untuk mencegah XSS (seluruh output dinamis memakai fungsi ini)
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // Trusted Types policy khusus TEMPLATE buatan sendiri. Semua nilai dinamis
  // sudah melewati escapeHtml() sebelum masuk ke sini. createHTML mengembalikan
  // template apa adanya — JANGAN di-escape di sini, karena tag <option>/<input>
  // harus tetap menjadi elemen (bukan teks). Guard di bawah menolak pola berbahaya.
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
    else el.innerHTML = html; // fallback: browser tanpa Trusted Types
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

  // ===== Elemen =====
  const form = $('#form');
  const nicknameSel = $('#nickname');
  const judulSel = $('#judul');
  const chapterInput = $('#chapter');
  const tugasSel = $('#tugas');
  const dialog = $('#konfirmasi');
  const ringkas = $('#konfirmasi-ringkas');
  const btnKonfirmasi = $('#btn-konfirmasi');
  const btnKembali = $('#btn-kembali');
  const flash = $('#flash');
  const riwayatCard = $('#riwayat-card');
  const riwayatHeading = $('#riwayat-heading');
  const riwayatList = $('#riwayat-list');

  let staffList = [];
  let titleList = [];
  let taskList = [];
  let currentData = null; // data yang akan dikirim setelah Konfirmasi

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

  // ===== Muat data =====
  const loadOptions = async () => {
    try {
      const [staff, titles, tasks] = await Promise.all([
        api('/api/staff').then(d => d.staff),
        api('/api/titles').then(d => d.titles),
        api('/api/tasks').then(d => d.tasks),
      ]);
      staffList = staff; titleList = titles; taskList = tasks;

      setHtml(nicknameSel, '<option value="" selected disabled>Pilih nickname…</option>' +
        staff.map(s => `<option value="${s.id}">${escapeHtml(s.nama)}</option>`).join(''));

      setHtml(judulSel, '<option value="" selected disabled>Pilih judul…</option>' +
        titles.map(t => `<option value="${t.id}">${escapeHtml(t.nama)}</option>`).join(''));

      renderTaskOptions();
    } catch (e) {
      showFlash(e.message, 'error');
    }
  };

  // Tugas dipilih satu dari dropdown, dikelompokkan menurut `grup` (TL dulu,
  // lalu tugas tanpa grup seperti TS/Solo) sesuai urutan dari database.
  const renderTaskOptions = () => {
    // Endpoint /api/tasks sudah hanya mengembalikan tugas aktif (WHERE aktif = 1)
    // dan tidak menyertakan field `aktif`, jadi jangan difilter ulang di sini.
    const active = taskList;
    if (active.length === 0) {
      setHtml(tugasSel, '<option value="" selected>Belum ada tugas. Hubungi admin.</option>');
      return;
    }
    const groups = [];
    active.forEach((t) => {
      const name = t.grup || '';
      let g = groups.find(x => x.name === name);
      if (!g) { g = { name, items: [] }; groups.push(g); }
      g.items.push(t);
    });
    let html = '<option value="" selected>Pilih tugas…</option>';
    groups.forEach((g) => {
      const options = g.items.map(t => `<option value="${t.id}">${escapeHtml(t.nama)}</option>`).join('');
      html += g.name
        ? `<optgroup label="${escapeHtml(g.name)}">${options}</optgroup>`
        : options;
    });
    setHtml(tugasSel, html);
  };

  // ===== Riwayat =====
  const loadHistory = async (staffId) => {
    if (!staffId) { riwayatCard.hidden = true; return; }
    try {
      const d = await api(`/api/staff/${staffId}/riwayat`);
      const staff = staffList.find(s => s.id === Number(staffId));
      riwayatHeading.textContent = `Riwayat 20 setoran terakhir — ${staff ? staff.nama : ''}`;
      if (d.items.length === 0) {
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

  nicknameSel.addEventListener('change', () => loadHistory(nicknameSel.value));

  // ===== Alur form → konfirmasi =====
  const collectPayload = () => {
    return {
      staff_id: Number(nicknameSel.value),
      title_id: Number(judulSel.value),
      chapter: chapterInput.value.trim(),
      task_ids: [Number(tugasSel.value)],
    };
  };

  const buildRingkasan = (data) => {
    const staff = staffList.find(s => s.id === data.staff_id);
    const title = titleList.find(t => t.id === data.title_id);
    const task = taskList.find(t => t.id === data.task_ids[0]);
    const rows = [
      ['Nickname', staff ? staff.nama : ''],
      ['Judul', title ? title.nama : ''],
      ['Chapter', data.chapter],
      ['Tugas', task ? task.nama : ''],
    ];
    setHtml(ringkas, rows.map(([k, v]) =>
      `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join(''));
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nicknameSel.value || !judulSel.value || !chapterInput.value.trim()) {
      showFlash('Lengkapi nickname, judul, dan chapter terlebih dahulu.', 'error');
      return;
    }
    if (!tugasSel.value) {
      showFlash('Pilih tugas terlebih dahulu.', 'error');
      return;
    }
    currentData = collectPayload();
    buildRingkasan(currentData);
    dialog.showModal();
  });

  const openDialog = () => { if (!dialog.open) dialog.showModal(); };
  const closeDialog = () => { if (dialog.open) dialog.close(); };

  // Tutup tanpa memilih: batalkan pengiriman
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });

  const triggerDialogClose = (value) => {
    // Letuskan close dengan returnValue yang sesuai tombol yang ditekan
    dialog.returnValue = value;
    const closeForm = dialog.querySelector('form[method="dialog"]');
    if (closeForm) closeForm.requestSubmit();
    else closeDialog();
  };

  // Listener close: baca returnValue SEBELUM mereset (nilai stale bisa bocor antar dialog),
  // lalu fokus kembali ke form bila pengguna tidak menekan Konfirmasi.
  dialog.addEventListener('close', () => {
    const chosen = dialog.returnValue;
    dialog.returnValue = '';
    if (chosen !== 'confirm') nicknameSel.focus();
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
      // Kosongkan form kecuali nickname (sesuai spesifikasi)
      judulSel.value = '';
      chapterInput.value = '';
      tugasSel.value = '';
      currentData = null;

      const newCount = res.saved || 0;
      const skipped = res.skipped || [];
      let msg = `Berhasil menyimpan ${newCount} setoran.`;
      if (skipped.length > 0) {
        const skippedNames = taskList.filter(t => skipped.includes(t.id)).map(t => t.nama).join(', ');
        msg += ` Sudah tercatat sebelumnya (${skippedNames}).`;
      }
      showFlash(msg, 'success');
      triggerDialogClose('confirm');
      const staffId = nicknameSel.value;
      loadHistory(staffId);
    } catch (e) {
      showFlash(e.message, 'error');
      openDialog();
    } finally {
      btnKonfirmasi.disabled = false;
    }
  });

  // ===== Init =====
  loadOptions();
})();
