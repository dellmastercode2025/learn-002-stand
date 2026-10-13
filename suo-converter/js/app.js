/* app.js — интерфейс конвертера ТТ → формы СУО: загрузка, предпросмотр/правки, история, аналитика, выгрузка Excel. */
(function () {
  'use strict';
  const S = window.SUO;
  const $ = (id) => document.getElementById(id);
  const fmt = S.fmt;
  const LS_SET = 'suo.settings.v1', LS_HIST = 'suo.history.v1';

  const DEFAULT_SETTINGS = {
    useColumn: 'total', defaultCountry: 'КАЗАХСТАН', receivablesByRevenue: true, leaseCurrency: 'KZT',
    blankR3: true, blankR4: true, normLimit: '', usdRate: '', company: '',
    sens: Object.assign({}, S.DEFAULT_SENS), bankCountry: {}, countryLimits: {}, countryRatings: {},
    headPos: '', headName: '', execPos: '', execName: '', theme: '',
  };

  let settings = loadJSON(LS_SET, null) || clone(DEFAULT_SETTINGS);
  settings = Object.assign(clone(DEFAULT_SETTINGS), settings, { sens: Object.assign({}, S.DEFAULT_SENS, (settings && settings.sens) || {}) });
  let history = loadJSON(LS_HIST, null) || { periods: {} };
  const state = { tt: null, fileName: '', result: null, period: null, prevKey: '', overrides: { r3: {}, r2: {}, r4: {} }, comments: { assets: '', liab: '', nfp: '', r4: '' }, commentsEdited: {}, templateCountries: [], charts: {} };

  // ---------------------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------------------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadJSON(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Не удалось сохранить в localStorage: ' + e.message); return false; } }
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), ms || 3200); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function parseNum(s) { const t = String(s).replace(/[\s ]/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, ''); const n = parseFloat(t); return isNaN(n) ? 0 : n; }
  function pct(a, b) { return b ? (a / b * 100) : 0; }
  function sign(n) { return n > 0 ? '+' : ''; }
  function periodKey(label) { const p = S.periodFromLabel(label); return p ? `${p.year}Q${p.quarter}` : label.replace(/\s+/g, '_'); }
  function periodSort(label) { const p = S.periodFromLabel(label); return p ? p.year * 10 + p.quarter : 0; }
  function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function download(buf, name, mime) { const blob = new Blob([buf], { type: mime || 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function setStatus() {
    const st = $('status'); const parts = [];
    if (state.result) parts.push(`<span class="pill ok">ТТ: ${esc(state.fileName)}</span><span class="pill">Период: ${esc(state.period)}</span>`);
    else parts.push('<span class="pill">Файл ТТ не загружен</span>');
    const n = Object.keys(history.periods).length; parts.push(`<span class="pill">В истории: ${n}</span>`);
    st.innerHTML = parts.join('');
    $('badge-history').textContent = n;
  }

  // ---------------------------------------------------------------------------
  // Вкладки
  // ---------------------------------------------------------------------------
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'analytics') renderAnalytics();
    try { localStorage.setItem('suo.tab', name); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Загрузка файла ТТ
  // ---------------------------------------------------------------------------
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  $('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });

  async function loadFile(file) {
    $('dropText').innerHTML = `<span class="spinner"></span> Читаю «${esc(file.name)}» (${(file.size / 1048576).toFixed(1)} МБ)…`;
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const tt = S.parseTT(wb, { useColumn: settings.useColumn });
      state.tt = tt; state.fileName = file.name;
      state.overrides = { r3: {}, r2: {}, r4: {} }; state.commentsEdited = {};
      state.period = tt.info.period ? tt.info.period.label : '';
      $('period').value = state.period;
      if (!settings.company && tt.info.company) settings.company = normalizeCompany(tt.info.company);
      $('company').value = settings.company || tt.info.company || '';
      recompute();
      $('fileInfo').innerHTML = `Лист «${esc(tt.info.sheet)}», строк: ${tt.rows.length}, колонка сумм: «${esc(tt.info.valueColumn)}», период ТТ: ${esc(tt.info.dp)}, компания по титулу: ${esc(tt.info.company)}`;
      $('dropText').innerHTML = `<strong>${esc(file.name)}</strong> загружен. Перетащите другой файл, чтобы заменить.`;
      toast('Файл ТТ разобран, формы заполнены');
      if (!settings.usdRate) toast('Укажите курс USD/KZT на отчётную дату — он нужен для порога по форме R3', 5000);
    } catch (e) {
      console.error(e);
      $('dropText').innerHTML = `<strong style="color:var(--critical)">Ошибка:</strong> ${esc(e.message)}`;
      toast('Ошибка чтения файла: ' + e.message, 6000);
    }
  }
  function normalizeCompany(s) { if (/казмортрансфлот/i.test(s)) return 'ТОО «НМСК «Казмортрансфлот»'; return s; }

  function recompute() {
    if (!state.tt) return;
    if (settings.useColumn !== (state.tt.info.valueColumn === 'Package sum' ? 'pkg' : 'total') && state.tt._wb) { /* колонка меняется только при повторной загрузке */ }
    state.result = S.compute(state.tt, settings);
    pickPrev();
    renderAll();
  }
  function pickPrev() {
    const cur = periodSort(state.period || '');
    const keys = Object.keys(history.periods).filter(k => periodSort(history.periods[k].label) < cur).sort((a, b) => periodSort(history.periods[b].label) - periodSort(history.periods[a].label));
    if (!state.prevKey || !history.periods[state.prevKey]) state.prevKey = keys[0] || '';
    const sel = $('prevSel'); sel.innerHTML = '<option value="">— нет —</option>' + Object.keys(history.periods).sort((a, b) => periodSort(history.periods[b].label) - periodSort(history.periods[a].label)).map(k => `<option value="${esc(k)}" ${k === state.prevKey ? 'selected' : ''}>${esc(history.periods[k].label)}</option>`).join('');
  }
  function prevRec() { return state.prevKey && history.periods[state.prevKey] ? history.periods[state.prevKey] : null; }

  $('period').addEventListener('change', () => { state.period = $('period').value.trim(); pickPrev(); renderAll(); });
  $('company').addEventListener('change', () => { settings.company = $('company').value.trim(); saveSettings(); });
  $('usdRate').addEventListener('change', () => { settings.usdRate = $('usdRate').value; saveSettings(); renderAll(); });
  $('prevSel').addEventListener('change', () => { state.prevKey = $('prevSel').value; renderAll(); });
  $('btnRecalc').addEventListener('click', () => { if (!state.tt) return; state.overrides = { r3: {}, r2: {}, r4: {} }; recompute(); toast('Формы пересчитаны из ТТ, ручные правки сброшены'); });

  // ---------------------------------------------------------------------------
  // Эффективные значения форм (расчёт + ручные правки)
  // ---------------------------------------------------------------------------
  function effective() {
    const res = state.result; if (!res) return null;
    const r3lines = {};
    for (const L of S.R3_LINES) {
      const base = res.r3.lines[L.row]; const cur = Object.assign({}, base.cur);
      for (const c of S.R3_CURS) { const k = `${L.row}:${c}`; if (state.overrides.r3[k] !== undefined) cur[c] = state.overrides.r3[k]; }
      let total = 0; S.R3_CURS.forEach(c => (total += cur[c] || 0));
      r3lines[L.row] = { cur, total, control: base.control, diff: Math.round((total - base.control) * 100) / 100 };
    }
    const r3tot = S.r3Totals(r3lines);
    const countries = {};
    for (const [name, v] of Object.entries(res.r2.countries)) countries[name] = Object.fromEntries(S.R2_COLS.map(c => [c, v[c]]));
    for (const [k, v] of Object.entries(state.overrides.r2)) { const [name, col] = k.split('|'); if (!countries[name]) countries[name] = Object.fromEntries(S.R2_COLS.map(c => [c, 0])); countries[name][col] = v; }
    for (const name in countries) countries[name].J = S.R2_COLS.reduce((s, c) => s + (countries[name][c] || 0), 0);
    const r4cells = {};
    for (const [row, b] of Object.entries(res.r4.cells)) { r4cells[row] = Object.assign({}, b); for (const k of S.R4_BUCKETS) { const ok = `${row}:${k}`; if (state.overrides.r4[ok] !== undefined) r4cells[row][k] = state.overrides.r4[ok]; } }
    const r4tot = S.r4Totals(r4cells);
    const sensSum = r4tot.assetsTotal + r4tot.liabilitiesTotal;
    const r4share = res.r4.base ? sensSum / res.r4.base : 0;
    return { r3: { lines: r3lines, totals: r3tot, equity: res.r3.equity, bs: res.r3.bs }, r2: { countries }, r4: { cells: r4cells, totals: r4tot, share: r4share, blank: r4share < 0.05, equity: res.r3.equity } };
  }

  /** Запись периода для истории/выгрузки. */
  function buildRecord() {
    const eff = effective(); if (!eff) return null;
    const usd = parseFloat(settings.usdRate) || 0;
    return {
      key: periodKey(state.period), label: state.period, sortKey: periodSort(state.period), savedAt: new Date().toISOString(), file: state.fileName, company: $('company').value.trim(), usdRate: usd,
      r3: { lines: Object.fromEntries(Object.entries(eff.r3.lines).map(([r, l]) => [r, { cur: l.cur, total: l.total }])), equity: eff.r3.equity, bs: eff.r3.bs, nfp: eff.r3.totals.nfp.cur, assets: eff.r3.totals.assets.total, liabilities: eff.r3.totals.liabilities.total },
      r2: { countries: eff.r2.countries },
      r4: { cells: eff.r4.cells, share: eff.r4.share, blank: eff.r4.blank, equity: eff.r4.equity, factors: state.result.r4.factors, reason: state.result.r4.reason, gap: eff.r4.totals.gap },
      comments: currentComments(eff), log: state.result.log, overrides: clone(state.overrides),
    };
  }

  // ---------------------------------------------------------------------------
  // Рендер
  // ---------------------------------------------------------------------------
  function renderAll() {
    setStatus();
    const has = !!state.result;
    ['btnExport', 'btnSave', 'btnRecalc'].forEach(id => ($(id).disabled = !has));
    if (!has) return;
    renderR3(); renderR2(); renderR4(); renderCheck(); renderLoadSummary(); renderComments();
    if ($('panel-analytics').classList.contains('active')) renderAnalytics();
  }

  function numCell(v, opts) { const o = opts || {}; const cls = ['num']; if (v < 0) cls.push('neg'); if (o.edited) cls.push('edited'); return `<td class="${cls.join(' ')}" ${o.edit ? `contenteditable="true" data-form="${o.form}" data-key="${esc(o.key)}"` : ''} title="${o.title ? esc(o.title) : ''}">${v === 0 && !o.edit ? '' : fmt(v)}</td>`; }
  function bindEdits(table, onEdit) {
    table.querySelectorAll('td[contenteditable]').forEach(td => {
      td.addEventListener('focus', () => { td.dataset.orig = td.textContent; td.textContent = td.textContent.replace(/\u00a0/g, ''); try { const r = document.createRange(); r.selectNodeContents(td); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ } });
      td.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } if (e.key === 'Escape') { td.textContent = td.dataset.orig || ''; td.blur(); } });
      td.addEventListener('blur', () => onEdit(td.dataset.key, parseNum(td.textContent)));
    });
  }

  // ---- R3 ----
  function renderR3() {
    const eff = effective(); const prev = prevRec(); const res = state.result;
    const usd = parseFloat(settings.usdRate) || 0;
    const fx = eff.r3.totals.nfp.fx; const thr = usd * 1000;
    let th = '';
    if (usd) th = Math.abs(fx) > thr ? `<div class="okbox">Открытая валютная позиция ${fmt(fx)} тыс. тенге (${fmt(fx / usd)} тыс. USD) превышает эквивалент 1 млн долл. США (${fmt(thr)} тыс. тенге) — форма заполняется.</div>` : `<div class="warnbox">Открытая валютная позиция ${fmt(fx)} тыс. тенге (${fmt(fx / usd)} тыс. USD) не превышает эквивалент 1 млн долл. США — по инструкции высылается пустографка с указанием причины${settings.blankR3 ? ' (режим выгрузки: пустографка)' : ' (режим выгрузки: заполнять суммы)'}.</div>`;
    else th = '<div class="warnbox">Курс USD/KZT не задан — проверка порога 1 млн долл. США не выполнена.</div>';
    $('r3Threshold').innerHTML = th;
    const curs = S.R3_CURS;
    let h = `<thead><tr><th>Показатели</th>${curs.map(c => `<th>${S.CUR_LABEL[c]}</th>`).join('')}<th>Все валюты (без тенге)</th><th>Все валюты</th><th>Прошлый период${prev ? ' (' + esc(prev.label) + ')' : ''}</th><th>Разница</th><th>Баланс ТТ</th></tr></thead><tbody>`;
    const rowHtml = (label, lineOrAgg, cls, row) => {
      const cur = lineOrAgg.cur; let total = 0, fxs = 0; curs.forEach(c => { total += cur[c] || 0; if (c !== 'KZT') fxs += cur[c] || 0; });
      const p = prev && row && prev.r3.lines[row] ? prev.r3.lines[row].total : (prev && lineOrAgg.prevTotal != null ? lineOrAgg.prevTotal : null);
      const ctrl = row && res.r3.lines[row] ? res.r3.lines[row].control : null;
      return `<tr class="${cls || ''}"><td>${esc(label)}</td>${curs.map(c => numCell(cur[c] || 0, row ? { edit: true, form: 'r3', key: `${row}:${c}`, edited: state.overrides.r3[`${row}:${c}`] !== undefined } : {})).join('')}${numCell(fxs)}${numCell(total)}${p == null ? '<td></td>' : numCell(p)}${p == null ? '<td></td>' : numCell(total - p)}${ctrl == null ? '<td></td>' : `<td class="${Math.abs(total - ctrl) > 1 ? 'diff-bad' : ''}">${fmt(ctrl)}</td>`}</tr>`;
    };
    const t = eff.r3.totals;
    const prevAgg = (rows) => prev ? rows.reduce((s, r) => s + ((prev.r3.lines[r] || {}).total || 0), 0) : null;
    h += rowHtml('АКТИВЫ', Object.assign({}, t.assets, { prevTotal: prevAgg([25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38]) }), 'group');
    h += rowHtml('КРАТКОСРОЧНЫЕ АКТИВЫ', Object.assign({}, t.stA, { prevTotal: prevAgg([25, 26, 27, 28, 29, 30, 31]) }), 'group');
    S.R3_LINES.filter(L => L.side === 'A' && L.group === 'ST').forEach(L => (h += rowHtml(L.name, eff.r3.lines[L.row], '', L.row)));
    h += rowHtml('ДОЛГОСРОЧНЫЕ АКТИВЫ', Object.assign({}, t.ltA, { prevTotal: prevAgg([33, 34, 35, 36, 37, 38]) }), 'group');
    S.R3_LINES.filter(L => L.side === 'A' && L.group === 'LT').forEach(L => (h += rowHtml(L.name, eff.r3.lines[L.row], '', L.row)));
    h += rowHtml('ОБЯЗАТЕЛЬСТВА', Object.assign({}, t.liabilities, { prevTotal: prevAgg([41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57]) }), 'group');
    h += rowHtml('КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА', Object.assign({}, t.stL, { prevTotal: prevAgg([41, 42, 43, 44, 45, 46, 47, 48]) }), 'group');
    S.R3_LINES.filter(L => L.side === 'L' && L.group === 'ST').forEach(L => (h += rowHtml(L.name, eff.r3.lines[L.row], '', L.row)));
    h += rowHtml('ДОЛГОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА', Object.assign({}, t.ltL, { prevTotal: prevAgg([50, 51, 52, 53, 54, 55, 56, 57]) }), 'group');
    S.R3_LINES.filter(L => L.side === 'L' && L.group === 'LT').forEach(L => (h += rowHtml(L.name, eff.r3.lines[L.row], '', L.row)));
    const prevNfp = prev ? Object.values(prev.r3.nfp || {}).reduce((a, b) => a + b, 0) : null;
    h += rowHtml('Чистая валютная позиция', Object.assign({}, t.nfp, { prevTotal: prevNfp }), 'total');
    const eq = eff.r3.equity; const eqCur = S.emptyCur(); eqCur.KZT = eq;
    h += `<tr><td>Собственный капитал</td>${curs.map(c => numCell(eqCur[c])).join('')}<td></td>${numCell(eq)}${prev ? numCell(prev.r3.equity || 0) : '<td></td>'}${prev ? numCell(eq - (prev.r3.equity || 0)) : '<td></td>'}<td></td></tr>`;
    h += `<tr><td>Чистая валютная позиция / собственный капитал</td>${curs.map(c => `<td>${eq ? pct(t.nfp.cur[c], eq).toFixed(2) + '%' : ''}</td>`).join('')}<td>${eq ? pct(t.nfp.fx, eq).toFixed(2) + '%' : ''}</td><td>${eq ? pct(t.nfp.total, eq).toFixed(2) + '%' : ''}</td><td></td><td></td><td></td></tr>`;
    h += `<tr><td>Внутреннее нормативное значение (при наличии)</td><td colspan="${curs.length + 5}" style="text-align:left">${esc(settings.normLimit || '—')}</td></tr>`;
    h += '</tbody>';
    const tbl = $('r3Table'); tbl.innerHTML = h;
    bindEdits(tbl, (key, v) => { const [row, c] = key.split(':'); const base = res.r3.lines[row].cur[c] || 0; if (Math.abs(v - base) < 0.005) delete state.overrides.r3[key]; else state.overrides.r3[key] = v; renderR3(); renderR2(); renderR4(); renderCheck(); renderComments(); });
  }
  $('btnResetR3').addEventListener('click', () => { state.overrides.r3 = {}; renderAll(); });

  // ---- 2R ----
  function renderR2() {
    const eff = effective(); const prev = prevRec(); const res = state.result;
    const names = Object.keys(eff.r2.countries).sort((a, b) => eff.r2.countries[b].J - eff.r2.countries[a].J);
    const eq = eff.r3.equity; const ceiling = eq * 0.5;
    let h = `<thead><tr><th>Страна</th>${S.R2_COLS.map(c => `<th>${S.R2_COL_LABEL[c]}</th>`).join('')}<th>Итого</th><th>Доля</th><th>Лимит</th><th>Использование</th><th>Рейтинг</th>${prev ? `<th>Прошлый период</th><th>Откл.</th>` : ''}</tr></thead><tbody>`;
    const grand = names.reduce((s, n) => s + eff.r2.countries[n].J, 0);
    for (const n of names) {
      const v = eff.r2.countries[n]; const lim = parseFloat(settings.countryLimits[n]) || 0; const use = lim ? v.J / lim : 0;
      const pv = prev && prev.r2.countries[n] ? (prev.r2.countries[n].J != null ? prev.r2.countries[n].J : S.R2_COLS.reduce((s, c) => s + (prev.r2.countries[n][c] || 0), 0)) : (prev ? 0 : null);
      h += `<tr><td>${esc(n)}${state.templateCountries.length && !state.templateCountries.includes(n) ? ' <span class="pill warn" title="Нет в справочнике формы">нет в справочнике</span>' : ''}</td>${S.R2_COLS.map(c => numCell(v[c] || 0, { edit: true, form: 'r2', key: `${n}|${c}`, edited: state.overrides.r2[`${n}|${c}`] !== undefined })).join('')}${numCell(v.J)}<td>${grand ? pct(v.J, grand).toFixed(1) + '%' : ''}</td>${lim ? numCell(lim) : '<td class="muted">—</td>'}<td class="${use > 1 ? 'diff-bad' : ''}">${lim ? (use * 100).toFixed(0) + '%' : ''}${lim && lim > ceiling && ceiling ? ' <span class="pill warn" title="Лимит выше потолка 50% СК">&gt;50% СК</span>' : ''}</td><td>${esc(settings.countryRatings[n] || '')}</td>${prev ? `${numCell(pv)}${numCell(v.J - pv)}` : ''}</tr>`;
    }
    h += `<tr class="total"><td>Общий результат</td>${S.R2_COLS.map(c => numCell(names.reduce((s, n) => s + (eff.r2.countries[n][c] || 0), 0))).join('')}${numCell(grand)}<td>100%</td><td></td><td></td><td></td>${prev ? '<td></td><td></td>' : ''}</tr>`;
    const kzShare = grand ? pct((eff.r2.countries['КАЗАХСТАН'] || { J: 0 }).J, grand) : 0;
    h += `<tr><td colspan="${S.R2_COLS.length + 6 + (prev ? 2 : 0)}" class="hint" style="text-align:left;white-space:normal">Собственный капитал ${fmt(eq)} тыс. тенге; потолок странового лимита (50% СК по СТП КМТФ.033/.034) — ${fmt(ceiling)} тыс. тенге. Доля Казахстана ${kzShare.toFixed(1)}%, зарубежные страны ${(100 - kzShare).toFixed(1)}%.</td></tr></tbody>`;
    const tbl = $('r2Table'); tbl.innerHTML = h;
    bindEdits(tbl, (key, v) => { const [n, c] = key.split('|'); const base = res.r2.countries[n] ? (res.r2.countries[n][c] || 0) : 0; if (Math.abs(v - base) < 0.005 && res.r2.countries[n]) delete state.overrides.r2[key]; else state.overrides.r2[key] = v; renderR2(); renderComments(); });
    // банки
    $('r2Banks').innerHTML = `<thead><tr><th>Банк</th><th>Статья</th><th>Страна</th><th>Как определена</th><th>Сумма</th></tr></thead><tbody>${res.r2.banks.map(b => `<tr><td>${esc(b.bank)}</td><td style="text-align:left">${esc(b.what)}</td><td style="text-align:left">${esc(b.country)}</td><td style="text-align:left">${{ paren: 'по стране в скобках', name: 'по названию банка', override: 'справочник (настройки)', unknown: '<span class="pill warn">не определена → страна по умолчанию</span>' }[b.how]}</td>${numCell(b.value)}</tr>`).join('') || '<tr><td colspan="5" class="muted">В ТТ нет остатков по банкам</td></tr>'}</tbody>`;
    const rev = res.r2.revenue || []; const rs = rev.reduce((s, e) => s + (e.country && e.value > 0 ? e.value : 0), 0);
    $('r2Revenue').innerHTML = `<thead><tr><th>Строка ТТ</th><th>Страна формы</th><th>Выручка</th><th>Вес</th></tr></thead><tbody>${rev.filter(e => e.value).map(e => `<tr><td>${esc(e.name)}</td><td style="text-align:left">${e.country ? esc(e.country) : '<span class="muted">агрегат, не используется</span>'}</td>${numCell(e.value)}<td>${e.country && rs ? pct(e.value, rs).toFixed(1) + '%' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">нет данных</td></tr>'}</tbody>`;
    // добавление страны
    const sel = $('r2AddSel'); const have = new Set(names);
    sel.innerHTML = '<option value="">+ добавить страну…</option>' + state.templateCountries.filter(c => !have.has(c)).map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }
  $('r2AddSel').addEventListener('change', () => { const n = $('r2AddSel').value; if (!n) return; state.overrides.r2[`${n}|E`] = 0; renderR2(); });
  $('btnResetR2').addEventListener('click', () => { state.overrides.r2 = {}; renderAll(); });

  // ---- 4R ----
  function renderR4() {
    const eff = effective(); const prev = prevRec(); const res = state.result; const r4 = res.r4;
    $('r4Threshold').innerHTML = eff.r4.blank
      ? `<div class="warnbox">Доля чувствительных активов и обязательств ${(eff.r4.share * 100).toFixed(2)}% от суммы активов и обязательств (порог 5%) — по инструкции высылается пустографка с причиной${settings.blankR4 ? ' (режим выгрузки: пустографка)' : ' (режим выгрузки: заполнять суммы)'}. Доля займов с плавающей ставкой по ТТ: ${(r4.floatShareLoans * 100).toFixed(1)}%.</div>`
      : `<div class="okbox">Доля чувствительных активов и обязательств ${(eff.r4.share * 100).toFixed(2)}% ≥ 5% — форма заполняется.</div>`;
    const B = S.R4_BUCKETS;
    let h = `<thead><tr><th>Показатели</th>${B.map(b => `<th>${S.R4_BUCKET_LABEL[b]}</th>`).join('')}<th>Итого</th><th>Прошлый период</th><th>Разница</th><th>Коэфф.</th></tr></thead><tbody>`;
    const sumB = (o) => B.reduce((s, b) => s + (o[b] || 0), 0);
    const prevRow = (row) => prev && prev.r4 && prev.r4.cells && prev.r4.cells[row] ? sumB(prev.r4.cells[row]) : (prev ? 0 : null);
    const line = (label, cells, cls, row, factor) => { const tot = sumB(cells); const p = row ? prevRow(row) : null; return `<tr class="${cls || ''}"><td>${esc(label)}</td>${B.map(b => numCell(cells[b] || 0, row ? { edit: true, form: 'r4', key: `${row}:${b}`, edited: state.overrides.r4[`${row}:${b}`] !== undefined } : {})).join('')}${numCell(tot)}${p == null ? '<td></td>' : numCell(p)}${p == null ? '<td></td>' : numCell(tot - p)}<td>${factor != null ? (factor * 100).toFixed(0) + '%' : ''}</td></tr>`; };
    const groupCells = (c) => { const o = S.emptyBuckets(); S.R4_CURS.forEach(cur => B.forEach(b => (o[b] += eff.r4.cells[c.rows[cur]][b] || 0))); return o; };
    const CURL = { KZT: 'тенге', USD: 'Доллар США', OTHER: 'Прочие виды валют' };
    h += `<tr class="group"><td>ЧУВСТВИТЕЛЬНЫЕ АКТИВЫ</td><td colspan="${B.length + 4}"></td></tr>`;
    S.R4_CATS.filter(c => c.side === 'A').forEach(c => { h += line(c.name + ' - все валюты', groupCells(c), 'group'); S.R4_CURS.forEach(cur => (h += line('   ' + c.name + ' - ' + CURL[cur], eff.r4.cells[c.rows[cur]], '', c.rows[cur], r4.factors[c.key]))); });
    h += line('ИТОГО ЧУВСТВИТЕЛЬНЫЕ АКТИВЫ', eff.r4.totals.assets, 'total');
    h += `<tr class="group"><td>ЧУВСТВИТЕЛЬНЫЕ ОБЯЗАТЕЛЬСТВА</td><td colspan="${B.length + 4}"></td></tr>`;
    S.R4_CATS.filter(c => c.side === 'L').forEach(c => { h += line(c.name + ' - все валюты', groupCells(c), 'group'); S.R4_CURS.forEach(cur => (h += line('   ' + c.name + ' - ' + CURL[cur], eff.r4.cells[c.rows[cur]], '', c.rows[cur], r4.factors[c.key]))); });
    h += line('ИТОГО ЧУВСТВИТЕЛЬНЫЕ ОБЯЗАТЕЛЬСТВА', eff.r4.totals.liabilities, 'total');
    h += line('Разрыв', eff.r4.totals.gap, 'total');
    S.R4_CURS.forEach(cur => (h += line('   Разрыв - ' + CURL[cur], eff.r4.totals.byCur[cur], '')));
    h += `<tr><td>Собственный капитал (тенге)</td><td colspan="${B.length}"></td>${numCell(eff.r4.equity)}${prev ? numCell(prev.r4.equity || 0) : '<td></td>'}${prev ? numCell(eff.r4.equity - (prev.r4.equity || 0)) : '<td></td>'}<td></td></tr>`;
    h += '</tbody>';
    const tbl = $('r4Table'); tbl.innerHTML = h;
    bindEdits(tbl, (key, v) => { const [row, b] = key.split(':'); const base = res.r4.cells[row][b] || 0; if (Math.abs(v - base) < 0.005) delete state.overrides.r4[key]; else state.overrides.r4[key] = v; renderR4(); renderComments(); });
    // валовые
    let g = `<thead><tr><th>Категория</th><th>Валюта</th>${B.map(b => `<th>${S.R4_BUCKET_LABEL[b]}</th>`).join('')}<th>Итого</th><th>Коэфф. чувств.</th></tr></thead><tbody>`;
    for (const c of S.R4_CATS) { const gr = r4.gross[c.key]; if (!gr) continue; for (const cur of S.R4_CURS) { const tot = sumB(gr[cur]); if (!tot) continue; g += `<tr><td>${esc(c.name)}</td><td style="text-align:left">${CURL[cur]}</td>${B.map(b => numCell(gr[cur][b])).join('')}${numCell(tot)}<td>${(r4.factors[c.key] * 100).toFixed(0)}%</td></tr>`; } }
    $('r4Gross').innerHTML = g + '</tbody>';
  }
  $('btnResetR4').addEventListener('click', () => { state.overrides.r4 = {}; renderAll(); });

  // ---- Контроль ----
  function renderCheck() {
    const eff = effective(); const res = state.result;
    let h = `<thead><tr><th>Строка формы R3</th><th>Сумма по валютам</th><th>Строка баланса ТТ</th><th>Расхождение</th><th>Статус</th></tr></thead><tbody>`;
    for (const L of S.R3_LINES) { const l = eff.r3.lines[L.row]; const ok = Math.abs(l.diff) <= 1; h += `<tr><td>${esc(L.name)}</td>${numCell(l.total)}${numCell(l.control)}${numCell(l.diff)}<td class="${ok ? 'diff-ok' : 'diff-bad'}">${ok ? '✓' : 'расхождение'}</td></tr>`; }
    const t = eff.r3.totals;
    h += `<tr class="total"><td>Итого активы</td>${numCell(t.assets.total)}${numCell(res.r3.bs.assets)}${numCell(t.assets.total - res.r3.bs.assets)}<td class="${Math.abs(t.assets.total - res.r3.bs.assets) <= 1 ? 'diff-ok' : 'diff-bad'}">${Math.abs(t.assets.total - res.r3.bs.assets) <= 1 ? '✓' : 'расхождение'}</td></tr>`;
    h += `<tr class="total"><td>Итого обязательства</td>${numCell(t.liabilities.total)}${numCell(res.r3.bs.liabilities)}${numCell(t.liabilities.total - res.r3.bs.liabilities)}<td class="${Math.abs(t.liabilities.total - res.r3.bs.liabilities) <= 1 ? 'diff-ok' : 'diff-bad'}">${Math.abs(t.liabilities.total - res.r3.bs.liabilities) <= 1 ? '✓' : 'расхождение'}</td></tr>`;
    h += `<tr class="total"><td>Собственный капитал (ТТ)</td><td></td>${numCell(res.r3.bs.equity)}<td></td><td></td></tr></tbody>`;
    $('checkTable').innerHTML = h;
    const warns = res.log.filter(l => l.level === 'warn').length;
    const badge = $('badge-check'); badge.textContent = warns; badge.classList.toggle('warn', warns > 0);
    $('log').innerHTML = res.log.map(l => `<li class="${l.level}"><b>${l.level}</b><b>${l.form}${l.row ? ' стр. ' + l.row : ''}</b>${esc(l.msg)}</li>`).join('');
  }

  function renderLoadSummary() {
    const eff = effective(); const usd = parseFloat(settings.usdRate) || 0; const t = eff.r3.totals;
    $('summaryCard').style.display = '';
    const names = Object.keys(eff.r2.countries).sort((a, b) => eff.r2.countries[b].J - eff.r2.countries[a].J);
    const grand = names.reduce((s, n) => s + eff.r2.countries[n].J, 0);
    const foreign = names.filter(n => n !== 'КАЗАХСТАН').reduce((s, n) => s + eff.r2.countries[n].J, 0);
    $('kpisLoad').innerHTML = kpi('Итого активы (ТТ)', fmt(t.assets.total), 'тыс. тенге') + kpi('Открытая валютная позиция', fmt(t.nfp.fx), usd ? fmt(t.nfp.fx / usd) + ' тыс. USD' : 'тыс. тенге') + kpi('ОВП / собственный капитал', eff.r3.equity ? pct(t.nfp.fx, eff.r3.equity).toFixed(1) + '%' : '—', 'СК ' + fmt(eff.r3.equity)) + kpi('Зарубежный страновой риск', fmt(foreign), grand ? pct(foreign, grand).toFixed(1) + '% активов формы 2R' : '') + kpi('Чувствительные к ставке', (eff.r4.share * 100).toFixed(2) + '%', eff.r4.blank ? '4R: пустографка' : '4R: заполняется');
  }
  function kpi(l, v, d, cls) { return `<div class="kpi"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="d ${cls || ''}">${esc(d || '')}</div></div>`; }

  // ---- Комментарии ----
  function currentComments(eff) {
    const auto = genComments(eff || effective(), prevRec());
    return { assets: state.commentsEdited.assets ? state.comments.assets : auto.assets, liab: state.commentsEdited.liab ? state.comments.liab : auto.liab, nfp: state.commentsEdited.nfp ? state.comments.nfp : auto.nfp, r4: state.commentsEdited.r4 ? state.comments.r4 : auto.r4 };
  }
  function genComments(eff, prev) {
    const t = eff.r3.totals; const usd = parseFloat(settings.usdRate) || 0;
    const lineName = (r) => S.R3_LINES.find(L => L.row === r).name;
    const chg = (cur, prv) => { const d = cur - prv; return `${sign(d)}${fmt(d)} тыс. тенге (${prv ? sign(d) + pct(d, Math.abs(prv)).toFixed(1) + '%' : 'н/д'})`; };
    const drivers = (rows, side) => { if (!prev) return ''; const ds = rows.map(r => ({ n: lineName(r), d: eff.r3.lines[r].total - ((prev.r3.lines[r] || {}).total || 0) })).filter(x => Math.abs(x.d) > 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3); return ds.length ? ' Основные факторы: ' + ds.map(x => `${x.n.toLowerCase()} ${sign(x.d)}${fmt(x.d)}`).join('; ') + '.' : ''; };
    const aRows = [25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38], lRows = [41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57];
    const fxA = t.assets.fx, fxL = t.liabilities.fx;
    const topCur = S.R3_CURS.filter(c => c !== 'KZT').map(c => ({ c, v: t.nfp.cur[c] })).filter(x => x.v).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    let assets = `Активы в иностранной валюте ${fmt(fxA)} тыс. тенге (${pct(fxA, t.assets.total).toFixed(1)}% активов), в т.ч. в долларах США ${fmt(t.assets.cur.USD)}.`;
    let liab = `Обязательства в иностранной валюте ${fmt(fxL)} тыс. тенге (${pct(fxL, t.liabilities.total).toFixed(1)}% обязательств), в т.ч. в долларах США ${fmt(t.liabilities.cur.USD)}.`;
    let nfp = `Чистая валютная позиция (без тенге) ${fmt(t.nfp.fx)} тыс. тенге${usd ? ` (${fmt(t.nfp.fx / usd)} тыс. долл. США по курсу ${usd})` : ''}, ${t.nfp.fx >= 0 ? 'длинная' : 'короткая'}; ${eff.r3.equity ? pct(t.nfp.fx, eff.r3.equity).toFixed(1) + '% собственного капитала' : ''}.${topCur.length ? ' По валютам: ' + topCur.map(x => `${S.CUR_LABEL[x.c]} ${fmt(x.v)}`).join(', ') + '.' : ''}`;
    if (prev) {
      const pa = aRows.reduce((s, r) => s + ((prev.r3.lines[r] || {}).total || 0), 0), pl = lRows.reduce((s, r) => s + ((prev.r3.lines[r] || {}).total || 0), 0);
      const pn = Object.entries(prev.r3.nfp || {}).reduce((s, [k, v]) => s + (k === 'KZT' ? 0 : v), 0);
      assets += ` Изменение к ${prev.label}: ${chg(t.assets.total, pa)}.${drivers(aRows)}`;
      liab += ` Изменение к ${prev.label}: ${chg(t.liabilities.total, pl)}.${drivers(lRows)}`;
      nfp += ` Изменение ОВП к ${prev.label}: ${chg(t.nfp.fx, pn)}.`;
    }
    if (usd && Math.abs(t.nfp.fx) <= usd * 1000) nfp += ' Открытая валютная позиция не превышает эквивалент 1 млн долл. США — отчёт представляется пустографкой.';
    const g = eff.r4.totals; const gb = S.R4_BUCKETS.map(b => ({ b, v: g.gap[b] })).filter(x => Math.abs(x.v) > 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    let r4 = eff.r4.blank
      ? `Форма 4R не заполняется: доля активов и обязательств, чувствительных к изменению процентных ставок (с плавающей ставкой), составляет ${(eff.r4.share * 100).toFixed(2)}% от суммы активов и обязательств, что ниже порога 5%. Процентные займы с плавающей ставкой у компании отсутствуют или несущественны.`
      : `Совокупный процентный разрыв в отчётном периоде по всем видам валют составил ${fmt(g.gapTotal)} тыс. тенге и преимущественно сложился за счёт интервала «${gb.length ? S.R4_BUCKET_LABEL[gb[0].b] : '—'}» (${gb.length ? fmt(gb[0].v) : ''} тыс. тенге). Чувствительные активы ${fmt(g.assetsTotal)}, обязательства ${fmt(g.liabilitiesTotal)} тыс. тенге.`;
    if (prev && prev.r4 && prev.r4.gap) { const pg = Object.values(prev.r4.gap).reduce((a, b) => a + b, 0); r4 += ` Изменение разрыва к ${prev.label}: ${sign(g.gapTotal - pg)}${fmt(g.gapTotal - pg)} тыс. тенге.`; }
    return { assets, liab, nfp, r4 };
  }
  function renderComments() {
    const c = currentComments();
    $('cmtAssets').value = c.assets; $('cmtLiab').value = c.liab; $('cmtNfp').value = c.nfp; $('cmtR4').value = c.r4;
  }
  [['cmtAssets', 'assets'], ['cmtLiab', 'liab'], ['cmtNfp', 'nfp'], ['cmtR4', 'r4']].forEach(([id, k]) => $(id).addEventListener('input', () => { state.comments[k] = $(id).value; state.commentsEdited[k] = true; }));

  // ---------------------------------------------------------------------------
  // Аналитика
  // ---------------------------------------------------------------------------
  const PALETTE = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
  const SHORT_COUNTRY = { 'СОЕДИНЕННОЕ КОРОЛЕВСТВО ВЕЛИКОБРИТАНИИ': 'ВЕЛИКОБРИТАНИЯ', 'ОБЪЕДИНЕННЫЕ АРАБСКИЕ ЭМИРАТЫ': 'ОАЭ', 'МОЛДОВА, РЕСПУБЛИКА': 'МОЛДОВА', 'КОРЕЯ, РЕСПУБЛИКА': 'КОРЕЯ', 'ИРАН, ИСЛАМСКАЯ РЕСПУБЛИКА': 'ИРАН', 'СОЕДИНЕННЫЕ ШТАТЫ': 'США', 'ВИРГИНСКИЕ ОСТРОВА, БРИТАНСКИЕ': 'БРИТ. ВИРГИНСКИЕ О-ВА', 'КАЗАХСТАНСКИЕ ФИЛИАЛЫ НЕРЕЗИДЕНТОВ РК': 'ФИЛИАЛЫ НЕРЕЗИДЕНТОВ' };
  const shortC = (n) => SHORT_COUNTRY[n] || (n.length > 18 ? n.slice(0, 17) + '…' : n);
  function chartDefaults() {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = cssVar('--ink-2');
    Chart.defaults.borderColor = cssVar('--grid');
  }
  function mkChart(id, cfg) { if (state.charts[id]) state.charts[id].destroy(); const ctx = $(id).getContext('2d'); state.charts[id] = new Chart(ctx, cfg); }
  function tick(v) { const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(1) + ' млрд'; if (a >= 1e6) return (v / 1e6).toFixed(1) + ' млн'; if (a >= 1e3) return (v / 1e3).toFixed(0) + ' тыс.'; return String(v); }
  function seriesRecords() {
    const recs = Object.values(history.periods).slice();
    const cur = state.result ? buildRecord() : null;
    if (cur) { const i = recs.findIndex(r => r.key === cur.key); if (i >= 0) recs[i] = cur; else recs.push(cur); }
    recs.sort((a, b) => a.sortKey - b.sortKey);
    return recs;
  }
  function renderAnalytics() {
    chartDefaults();
    const recs = seriesRecords();
    const cur = state.result ? buildRecord() : recs[recs.length - 1];
    if (!cur) { $('kpis').innerHTML = '<div class="hint">Загрузите ТТ или импортируйте историю.</div>'; return; }
    const prev = prevRec() || recs.filter(r => r.sortKey < cur.sortKey).slice(-1)[0] || null;
    const fx = Object.entries(cur.r3.nfp).reduce((s, [k, v]) => s + (k === 'KZT' ? 0 : v), 0);
    const pfx = prev ? Object.entries(prev.r3.nfp).reduce((s, [k, v]) => s + (k === 'KZT' ? 0 : v), 0) : null;
    const usd = cur.usdRate || parseFloat(settings.usdRate) || 0;
    const names = Object.keys(cur.r2.countries).sort((a, b) => cur.r2.countries[b].J - cur.r2.countries[a].J);
    const grand = names.reduce((s, n) => s + cur.r2.countries[n].J, 0);
    const top = names.find(n => n !== 'КАЗАХСТАН');
    const gap = Object.values(cur.r4.gap || {}).reduce((a, b) => a + b, 0);
    const d = (c, p) => p == null ? '' : `${sign(c - p)}${fmt(c - p)} к ${prev.label}`;
    const dc = (c, p) => p == null ? '' : (c - p >= 0 ? 'up' : 'down');
    $('kpis').innerHTML =
      kpi('Открытая валютная позиция', fmt(fx), usd ? `${fmt(fx / usd)} тыс. USD · ${d(fx, pfx)}` : d(fx, pfx), dc(fx, pfx)) +
      kpi('ОВП / собственный капитал', cur.r3.equity ? pct(fx, cur.r3.equity).toFixed(1) + '%' : '—', prev && prev.r3.equity ? `было ${pct(pfx, prev.r3.equity).toFixed(1)}%` : '') +
      kpi('Позиция в USD', fmt(cur.r3.nfp.USD || 0), prev ? d(cur.r3.nfp.USD || 0, prev.r3.nfp.USD || 0) : 'тыс. тенге', prev ? dc(cur.r3.nfp.USD || 0, prev.r3.nfp.USD || 0) : '') +
      kpi('Крупнейший зарубежный риск', top ? top : '—', top ? `${fmt(cur.r2.countries[top].J)} · ${pct(cur.r2.countries[top].J, grand).toFixed(1)}% активов 2R` : '') +
      kpi('Стран в отчёте 2R', String(names.filter(n => cur.r2.countries[n].J).length), `зарубежных: ${names.filter(n => n !== 'КАЗАХСТАН' && cur.r2.countries[n].J).length}`) +
      kpi('Процентный разрыв (4R)', fmt(gap), `чувствительные ${(cur.r4.share * 100).toFixed(2)}% · ${cur.r4.blank ? 'пустографка' : 'заполняется'}`);

    const colors = PALETTE.map(cssVar);
    // 1. Динамика ЧВП по валютам
    const curs = S.R3_CURS.filter(c => c !== 'KZT' && recs.some(r => Math.abs(r.r3.nfp[c] || 0) > 0)).slice(0, 8);
    mkChart('chNfp', { type: 'line', data: { labels: recs.map(r => r.label), datasets: curs.map((c, i) => ({ label: S.CUR_LABEL[c], data: recs.map(r => r.r3.nfp[c] || 0), borderColor: colors[i], backgroundColor: colors[i], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0 })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: curs.length > 1, position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)} тыс. тенге` } } }, scales: { y: { ticks: { callback: tick }, grid: { color: cssVar('--grid') } }, x: { grid: { display: false } } } } });
    // 2. Активы/обязательства по валютам (текущий период)
    const fxCurs = S.R3_CURS.filter(c => c !== 'KZT');
    const sumLines = (rows, c) => rows.reduce((s, r) => s + ((cur.r3.lines[r] || { cur: {} }).cur[c] || 0), 0);
    const aRows = [25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 37, 38], lRows = [41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 55, 56, 57];
    const used = fxCurs.filter(c => sumLines(aRows, c) || sumLines(lRows, c));
    mkChart('chStruct', { type: 'bar', data: { labels: used.map(c => S.CUR_LABEL[c]), datasets: [{ label: 'Активы', data: used.map(c => sumLines(aRows, c)), backgroundColor: colors[0], borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 36 }, { label: 'Обязательства', data: used.map(c => sumLines(lRows, c)), backgroundColor: colors[1], borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 36 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)} тыс. тенге` } } }, scales: { y: { ticks: { callback: tick }, grid: { color: cssVar('--grid') } }, x: { grid: { display: false } } } } });
    // 3. Страны
    const topN = names.filter(n => cur.r2.countries[n].J).slice(0, 8);
    mkChart('chCountry', { type: 'bar', data: { labels: topN.map(shortC), datasets: [{ label: 'Итого по стране', data: topN.map(n => cur.r2.countries[n].J), backgroundColor: colors[0], borderRadius: 4, borderSkipped: 'left', maxBarThickness: 26 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => topN[items[0].dataIndex], label: (c) => `${fmt(c.parsed.x)} тыс. тенге (${pct(c.parsed.x, grand).toFixed(1)}%)` } } }, scales: { x: { ticks: { callback: tick }, grid: { color: cssVar('--grid') } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } } });
    // 4. Разрыв по срокам
    const gapNow = S.R4_BUCKETS.map(b => (cur.r4.gap || {})[b] || 0);
    const ds = [{ label: cur.label, data: gapNow, backgroundColor: colors[0], borderRadius: 4, borderSkipped: false, maxBarThickness: 36 }];
    if (prev && prev.r4 && prev.r4.gap) ds.push({ label: prev.label, data: S.R4_BUCKETS.map(b => prev.r4.gap[b] || 0), backgroundColor: colors[1], borderRadius: 4, borderSkipped: false, maxBarThickness: 36 });
    mkChart('chGap', { type: 'bar', data: { labels: S.R4_BUCKETS.map(b => S.R4_BUCKET_LABEL[b]), datasets: ds },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: ds.length > 1, position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y)} тыс. тенге` } } }, scales: { y: { ticks: { callback: tick }, grid: { color: cssVar('--grid') } }, x: { grid: { display: false } } } } });
    // таблица изменений
    if (prev) {
      $('deltaInfo').textContent = `Сравнение ${cur.label} с ${prev.label} (тыс. тенге).`;
      let h = `<thead><tr><th>Показатель</th><th>${esc(prev.label)}</th><th>${esc(cur.label)}</th><th>Изменение</th><th>%</th></tr></thead><tbody>`;
      const row = (n, p, c) => `<tr><td>${esc(n)}</td>${numCell(p)}${numCell(c)}${numCell(c - p)}<td class="${c - p < 0 ? 'neg' : ''}">${p ? sign(c - p) + pct(c - p, Math.abs(p)).toFixed(1) + '%' : ''}</td></tr>`;
      h += row('Итого активы', prev.r3.assets, cur.r3.assets) + row('Итого обязательства', prev.r3.liabilities, cur.r3.liabilities) + row('Собственный капитал', prev.r3.equity, cur.r3.equity) + row('Открытая валютная позиция (без тенге)', pfx, fx);
      fxCurs.forEach(c => { if ((cur.r3.nfp[c] || 0) || (prev.r3.nfp[c] || 0)) h += row('ЧВП: ' + S.CUR_LABEL[c], prev.r3.nfp[c] || 0, cur.r3.nfp[c] || 0); });
      for (const L of S.R3_LINES) { const c = (cur.r3.lines[L.row] || {}).total || 0, p = (prev.r3.lines[L.row] || {}).total || 0; if (Math.abs(c - p) > 0) h += row('R3: ' + L.name, p, c); }
      const allC = new Set([...Object.keys(cur.r2.countries), ...Object.keys(prev.r2.countries)]);
      [...allC].sort().forEach(n => { const c = cur.r2.countries[n] ? cur.r2.countries[n].J : 0, p = prev.r2.countries[n] ? (prev.r2.countries[n].J != null ? prev.r2.countries[n].J : S.R2_COLS.reduce((s, k) => s + (prev.r2.countries[n][k] || 0), 0)) : 0; if (c || p) h += row('2R: ' + n, p, c); });
      h += row('4R: процентный разрыв', Object.values(prev.r4.gap || {}).reduce((a, b) => a + b, 0), gap);
      $('deltaTable').innerHTML = h + '</tbody>';
    } else { $('deltaInfo').textContent = 'Нет предыдущего периода в истории — сохраните несколько периодов, чтобы видеть динамику.'; $('deltaTable').innerHTML = ''; }
  }

  // ---------------------------------------------------------------------------
  // История
  // ---------------------------------------------------------------------------
  function saveHistory() { saveJSON(LS_HIST, history); }
  $('btnSave').addEventListener('click', () => {
    const rec = buildRecord(); if (!rec) return;
    if (!rec.label) { toast('Укажите отчётный период'); return; }
    if (history.periods[rec.key] && !confirm(`Период ${rec.label} уже есть в истории. Заменить?`)) return;
    history.periods[rec.key] = rec; saveHistory(); pickPrev(); renderHistory(); setStatus(); toast(`Период ${rec.label} сохранён в историю`);
  });
  function renderHistory() {
    const recs = Object.values(history.periods).sort((a, b) => b.sortKey - a.sortKey);
    let h = `<thead><tr><th>Период</th><th>Сохранён</th><th>Файл ТТ</th><th>Активы</th><th>Обязательства</th><th>ОВП (без тенге)</th><th>Стран</th><th>Разрыв 4R</th><th></th></tr></thead><tbody>`;
    for (const r of recs) {
      const fx = Object.entries(r.r3.nfp || {}).reduce((s, [k, v]) => s + (k === 'KZT' ? 0 : v), 0);
      h += `<tr><td><b>${esc(r.label)}</b></td><td>${esc(new Date(r.savedAt).toLocaleString('ru-RU'))}</td><td style="text-align:left">${esc(r.file)}</td>${numCell(r.r3.assets)}${numCell(r.r3.liabilities)}${numCell(fx)}<td>${Object.keys(r.r2.countries).length}</td>${numCell(Object.values(r.r4.gap || {}).reduce((a, b) => a + b, 0))}<td class="nowrap"><button class="btn" data-act="xlsx" data-key="${esc(r.key)}">Excel</button> <button class="btn" data-act="json" data-key="${esc(r.key)}">JSON</button> <button class="btn danger" data-act="del" data-key="${esc(r.key)}">Удалить</button></td></tr>`;
    }
    if (!recs.length) h += '<tr><td colspan="9" class="muted">История пуста. Загрузите ТТ и нажмите «Сохранить период в историю».</td></tr>';
    $('histTable').innerHTML = h + '</tbody>';
  }
  $('histTable').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const rec = history.periods[b.dataset.key]; if (!rec) return;
    if (b.dataset.act === 'del') { if (confirm(`Удалить период ${rec.label} из истории?`)) { delete history.periods[b.dataset.key]; saveHistory(); pickPrev(); renderHistory(); setStatus(); renderAll(); } }
    if (b.dataset.act === 'json') download(JSON.stringify(rec, null, 2), `SUO_${rec.key}.json`, 'application/json');
    if (b.dataset.act === 'xlsx') { const prev = Object.values(history.periods).filter(r => r.sortKey < rec.sortKey).sort((a, b2) => b2.sortKey - a.sortKey)[0] || null; await exportXlsx(rec, prev); }
  });
  $('btnExportHist').addEventListener('click', () => download(JSON.stringify({ exportedAt: new Date().toISOString(), settings, history }, null, 2), `SUO_history_${new Date().toISOString().slice(0, 10)}.json`, 'application/json'));
  $('histImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try {
      const data = JSON.parse(await f.text());
      const periods = data.history ? data.history.periods : (data.periods || (data.key ? { [data.key]: data } : null));
      if (!periods) throw new Error('Не распознан формат файла истории');
      let n = 0; for (const [k, v] of Object.entries(periods)) { if (v && v.r3 && v.label) { history.periods[k] = v; n++; } }
      if (data.settings && confirm('В файле есть настройки. Импортировать их тоже?')) { settings = Object.assign(clone(DEFAULT_SETTINGS), data.settings); saveSettings(); renderSettings(); }
      saveHistory(); pickPrev(); renderHistory(); setStatus(); renderAll(); toast(`Импортировано периодов: ${n}`);
    } catch (err) { toast('Ошибка импорта: ' + err.message, 6000); }
  });

  // ---------------------------------------------------------------------------
  // Выгрузка Excel
  // ---------------------------------------------------------------------------
  $('btnExport').addEventListener('click', async () => { const rec = buildRecord(); if (rec) await exportXlsx(rec, prevRec()); });

  async function exportXlsx(rec, prev) {
    try {
      toast('Формирую файл Excel…');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(b64ToBuf(window.SUO_TEMPLATE_B64));
      const warnings = [];
      for (const name of ['R3', 'R3 (каз)']) { const ws = wb.getWorksheet(name); if (ws) fillR3(ws, rec, prev, warnings); }
      for (const name of ['2R', '2R (каз)']) { const ws = wb.getWorksheet(name); if (ws) fillR2(ws, rec, prev, warnings); }
      for (const name of ['4R', '4R (каз)']) { const ws = wb.getWorksheet(name); if (ws) fillR4(ws, rec, prev, warnings); }
      wb.calcProperties.fullCalcOnLoad = true;
      const buf = await wb.xlsx.writeBuffer();
      download(buf, `SUO_2R_R3_4R_${rec.key}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(warnings.length ? 'Файл сформирован с замечаниями: ' + warnings.join('; ') : 'Файл Excel сформирован', warnings.length ? 8000 : 3000);
    } catch (e) { console.error(e); toast('Ошибка формирования Excel: ' + e.message, 8000); }
  }
  function setV(ws, addr, v) { const c = ws.getCell(addr); c.value = v; }
  function setF(ws, addr, f) { ws.getCell(addr).value = { formula: f }; }
  function setSignatures(ws, rec) {
    const map = [[/^Дож?лжность руководителя$/i, settings.headPos], [/^ФИО руководителя$/i, settings.headName], [/^Должность исполнителя$/i, settings.execPos], [/^ФИО исполнителя$/i, settings.execName], [/^Басшының міндеттемесі$/i, settings.headPos], [/^Орындаушының лауазымы$/i, settings.execPos], [/^Басшының аты-жөні$/i, settings.headName], [/^Орындаушының аты-жөні$/i, settings.execName]];
    ws.eachRow((row) => row.eachCell((c) => { const v = S.cellVal(c); if (typeof v !== 'string') return; for (const [re, val] of map) if (re.test(v.trim()) && val) c.value = val; }));
  }
  function r3Blank(rec) { const usd = rec.usdRate || 0; const fx = Object.entries(rec.r3.nfp).reduce((s, [k, v]) => s + (k === 'KZT' ? 0 : v), 0); return !!(settings.blankR3 && usd && Math.abs(fx) <= usd * 1000); }

  function fillR3(ws, rec, prev, warnings) {
    setV(ws, 'E15', rec.label); setV(ws, 'E16', rec.company);
    for (let r = 1; r <= 12; r++) { const row = ws.getRow(r); row.hidden = true; if (!row.hasValues) row.height = 15; }
    const blank = r3Blank(rec);
    for (const L of S.R3_LINES) {
      const l = rec.r3.lines[L.row] || { cur: {} }; const p = prev && prev.r3.lines[L.row] ? prev.r3.lines[L.row].cur : null;
      for (const c of S.R3_CURS) {
        setV(ws, S.R3_CUR_COL[c] + L.row, blank ? null : (l.cur[c] || 0));
        if (p) setV(ws, S.R3_PREV_COL[c] + L.row, p[c] || 0);
      }
      setF(ws, 'M' + L.row, `K${L.row}+L${L.row}`);
    }
    'CDEFGHIJKLM'.split('').forEach(col => setF(ws, col + '58', `${col}23-${col}39`));
    if (!blank) { setV(ws, 'L59', rec.r3.equity || 0); setV(ws, 'M59', rec.r3.equity || 0); }
    if (prev) { setV(ws, 'Y59', prev.r3.equity || 0); setV(ws, 'Z59', prev.r3.equity || 0); }
    'CDEFGHIJKLM'.split('').forEach(col => setF(ws, col + '60', `IF($M$59=0,0,${col}58/$M$59)`));
    ws.getCell('C60').numFmt = '0.00%'; 'DEFGHIJKLM'.split('').forEach(col => (ws.getCell(col + '60').numFmt = '0.00%'));
    if (settings.normLimit) setV(ws, 'C61', settings.normLimit);
    const cm = rec.comments || {};
    setV(ws, 'AQ23', blank ? `Пустографка: открытая валютная позиция не превышает эквивалент 1 млн долл. США. ${cm.nfp || ''}`.trim() : (cm.assets || null));
    setV(ws, 'AQ39', blank ? null : (cm.liab || null));
    setV(ws, 'AQ58', blank ? null : (cm.nfp || null));
    if (prev) {
      for (const L of S.R3_LINES) { const c = (rec.r3.lines[L.row] || {}).total || 0, p = (prev.r3.lines[L.row] || {}).total || 0; const d = c - p; if (Math.abs(d) >= 1000 && Math.abs(d) >= 0.1 * Math.max(Math.abs(p), 1)) setV(ws, 'AQ' + L.row, `Изменение к ${prev.label}: ${sign(d)}${fmt(d)} тыс. тенге${p ? ` (${sign(d)}${pct(d, Math.abs(p)).toFixed(1)}%)` : ''}`); }
    }
    setSignatures(ws, rec);
  }

  function fillR2(ws, rec, prev, warnings) {
    setV(ws, 'F3', rec.label); setV(ws, 'F4', rec.company);
    const rowOf = {}; for (let r = 12; r <= 261; r++) { const v = S.cellVal(ws.getCell('B' + r)); if (typeof v === 'string' && v.trim()) rowOf[v.trim().toUpperCase()] = r; }
    const kzName = Object.keys(rowOf).find(k => /^КАЗАХСТАН$/.test(k)) || 'КАЗАХСТАН';
    const eq = rec.r3.equity || 0;
    for (const [name, v] of Object.entries(rec.r2.countries)) {
      let r = rowOf[name.toUpperCase()];
      if (!r) { warnings.push(`2R: страна «${name}» отсутствует в справочнике формы — отнесена на Казахстан`); r = rowOf[kzName]; }
      if (!r) continue;
      for (const c of S.R2_COLS) { const cell = ws.getCell(c + r); const cur = typeof cell.value === 'number' ? cell.value : 0; cell.value = cur + (v[c] || 0); }
      const lim = parseFloat(settings.countryLimits[name]); if (lim) setV(ws, 'K' + r, lim);
    }
    // предыдущий период: 5 крупнейших стран
    const prevC = prev ? prev.r2.countries : {};
    const tot = (o) => o.J != null ? o.J : S.R2_COLS.reduce((s, c) => s + (o[c] || 0), 0);
    const names = Object.keys(prevC).sort((a, b) => tot(prevC[b]) - tot(prevC[a])).slice(0, 5);
    setV(ws, 'B267', prev ? `за предыдущий отчетный период (${prev.label})` : 'за предыдущий отчетный период');
    for (let i = 0; i < 5; i++) {
      const r = 271 + i, rd = 282 + i; const n = names[i];
      setV(ws, 'B' + r, n || null); setV(ws, 'B' + rd, n || null);
      for (const c of S.R2_COLS) { setV(ws, c + r, n ? (prevC[n][c] || 0) : null); setV(ws, c + rd, n ? ((rec.r2.countries[n] || {})[c] || 0) - (prevC[n][c] || 0) : null); }
      if (n) { const lim = parseFloat(settings.countryLimits[n]); setV(ws, 'K' + r, lim || null); setV(ws, 'L' + r, settings.countryRatings[n] || null); setV(ws, 'K' + rd, lim || null); setV(ws, 'L' + rd, settings.countryRatings[n] || null); }
    }
    if (eq) setV(ws, 'D292', `Собственный капитал ${fmt(eq)} тыс. тенге; потолок странового лимита (50% СК) ${fmt(eq * 0.5)} тыс. тенге.`);
    setSignatures(ws, rec);
  }

  function fillR4(ws, rec, prev, warnings) {
    setV(ws, 'C3', rec.label); setV(ws, 'C4', rec.company);
    const blank = !!(settings.blankR4 && rec.r4.blank);
    for (const c of S.R4_CATS) for (const cur of S.R4_CURS) {
      const row = c.rows[cur]; const cells = rec.r4.cells[row] || {};
      for (const b of S.R4_BUCKETS) setV(ws, S.R4_BUCKET_COL[b] + row, blank ? null : (cells[b] || 0));
      const p = prev && prev.r4.cells && prev.r4.cells[row] ? S.R4_BUCKETS.reduce((s, b) => s + (prev.r4.cells[row][b] || 0), 0) : null;
      setV(ws, 'J' + row, p == null ? null : p);
    }
    setV(ws, 'I71', blank ? null : (rec.r4.equity || 0)); if (prev) setV(ws, 'J71', prev.r4.equity || 0);
    setV(ws, 'A79', prev ? prev.label.replace(/^Q(\d)\s*(\d{4})$/, '$1Q\n$2Y') : 'пред. период');
    const cm = (rec.comments || {}).r4 || rec.r4.reason || '';
    setV(ws, 'C96', cm); setV(ws, 'L10', blank ? cm : null);
    setSignatures(ws, rec);
  }

  // ---------------------------------------------------------------------------
  // Настройки
  // ---------------------------------------------------------------------------
  function saveSettings() { saveJSON(LS_SET, settings); }
  function renderSettings() {
    $('sUseColumn').value = settings.useColumn; $('sDefaultCountry').value = settings.defaultCountry; $('sRecByRevenue').value = settings.receivablesByRevenue ? '1' : '0'; $('sLeaseCur').value = settings.leaseCurrency;
    $('sBlankR3').value = settings.blankR3 ? '1' : '0'; $('sBlankR4').value = settings.blankR4 ? '1' : '0'; $('sNormLimit').value = settings.normLimit || '';
    $('sHeadPos').value = settings.headPos || ''; $('sHeadName').value = settings.headName || ''; $('sExecPos').value = settings.execPos || ''; $('sExecName').value = settings.execName || '';
    $('usdRate').value = settings.usdRate || ''; if (!$('company').value) $('company').value = settings.company || '';
    $('sensTable').innerHTML = `<thead><tr><th>Категория</th><th>Сторона</th><th>Коэффициент (0–1 или auto)</th></tr></thead><tbody>${S.R4_CATS.map(c => `<tr><td>${esc(c.name)}</td><td>${c.side === 'A' ? 'активы' : 'обязательства'}</td><td><input type="text" data-sens="${c.key}" value="${esc(settings.sens[c.key])}" style="width:90px;text-align:right"></td></tr>`).join('')}</tbody>`;
    $('sensTable').querySelectorAll('input[data-sens]').forEach(inp => inp.addEventListener('change', () => { const v = inp.value.trim(); settings.sens[inp.dataset.sens] = v === 'auto' ? 'auto' : Math.max(0, Math.min(1, parseNum(v))); inp.value = settings.sens[inp.dataset.sens]; saveSettings(); recompute(); }));
    const cs = state.templateCountries.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('bankNewCountry').innerHTML = cs; $('limitNewCountry').innerHTML = cs;
    $('bankTable').innerHTML = `<thead><tr><th>Банк (как в ТТ)</th><th>Страна</th><th></th></tr></thead><tbody>${Object.entries(settings.bankCountry).map(([b, c]) => `<tr><td>${esc(b)}</td><td style="text-align:left">${esc(c)}</td><td><button class="btn" data-bank="${esc(b)}">✕</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Нет записей</td></tr>'}</tbody>`;
    $('bankTable').querySelectorAll('button[data-bank]').forEach(b => b.addEventListener('click', () => { delete settings.bankCountry[b.dataset.bank]; saveSettings(); renderSettings(); recompute(); }));
    $('limitTable').innerHTML = `<thead><tr><th>Страна</th><th>Лимит, тыс. тенге</th><th>Рейтинг</th><th></th></tr></thead><tbody>${[...new Set([...Object.keys(settings.countryLimits), ...Object.keys(settings.countryRatings)])].map(c => `<tr><td>${esc(c)}</td>${numCell(parseFloat(settings.countryLimits[c]) || 0)}<td>${esc(settings.countryRatings[c] || '')}</td><td><button class="btn" data-lim="${esc(c)}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Нет записей</td></tr>'}</tbody>`;
    $('limitTable').querySelectorAll('button[data-lim]').forEach(b => b.addEventListener('click', () => { delete settings.countryLimits[b.dataset.lim]; delete settings.countryRatings[b.dataset.lim]; saveSettings(); renderSettings(); if (state.result) renderR2(); }));
  }
  $('sUseColumn').addEventListener('change', () => { settings.useColumn = $('sUseColumn').value; saveSettings(); if (state.tt) toast('Колонка сумм изменится после повторной загрузки файла ТТ', 5000); });
  $('sDefaultCountry').addEventListener('change', () => { settings.defaultCountry = $('sDefaultCountry').value.trim().toUpperCase() || 'КАЗАХСТАН'; saveSettings(); recompute(); });
  $('sRecByRevenue').addEventListener('change', () => { settings.receivablesByRevenue = $('sRecByRevenue').value === '1'; saveSettings(); recompute(); });
  $('sLeaseCur').addEventListener('change', () => { settings.leaseCurrency = $('sLeaseCur').value; saveSettings(); recompute(); });
  $('sBlankR3').addEventListener('change', () => { settings.blankR3 = $('sBlankR3').value === '1'; saveSettings(); renderAll(); });
  $('sBlankR4').addEventListener('change', () => { settings.blankR4 = $('sBlankR4').value === '1'; saveSettings(); renderAll(); });
  $('sNormLimit').addEventListener('change', () => { settings.normLimit = $('sNormLimit').value; saveSettings(); renderAll(); });
  [['sHeadPos', 'headPos'], ['sHeadName', 'headName'], ['sExecPos', 'execPos'], ['sExecName', 'execName']].forEach(([id, k]) => $(id).addEventListener('change', () => { settings[k] = $(id).value.trim(); saveSettings(); }));
  $('bankAdd').addEventListener('click', () => { const b = $('bankNew').value.trim(); if (!b) return; settings.bankCountry[b] = $('bankNewCountry').value; $('bankNew').value = ''; saveSettings(); renderSettings(); recompute(); });
  $('limitAdd').addEventListener('click', () => { const c = $('limitNewCountry').value; if (!c) return; const l = parseNum($('limitNew').value); if (l) settings.countryLimits[c] = l; const r = $('ratingNew').value.trim(); if (r) settings.countryRatings[c] = r; $('limitNew').value = ''; $('ratingNew').value = ''; saveSettings(); renderSettings(); if (state.result) renderR2(); });
  $('btnSettingsReset').addEventListener('click', () => { if (confirm('Сбросить настройки к значениям по умолчанию?')) { settings = clone(DEFAULT_SETTINGS); saveSettings(); renderSettings(); recompute(); } });
  $('btnWipe').addEventListener('click', () => { if (confirm('Удалить ВСЕ сохранённые периоды? Действие необратимо (сначала сделайте экспорт JSON).')) { history = { periods: {} }; saveHistory(); pickPrev(); renderHistory(); setStatus(); renderAll(); } });
  $('btnTheme').addEventListener('click', () => { const cur = document.documentElement.dataset.theme; const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark'; if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme; settings.theme = next; saveSettings(); if ($('panel-analytics').classList.contains('active')) renderAnalytics(); });

  // ---------------------------------------------------------------------------
  // Инициализация
  // ---------------------------------------------------------------------------
  async function loadTemplateCountries() {
    try {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b64ToBuf(window.SUO_TEMPLATE_B64));
      const ws = wb.getWorksheet('2R'); const list = [];
      for (let r = 12; r <= 261; r++) { const v = S.cellVal(ws.getCell('B' + r)); if (typeof v === 'string' && v.trim()) list.push(v.trim()); }
      state.templateCountries = list.sort((a, b) => a.localeCompare(b, 'ru'));
    } catch (e) { console.error('template', e); toast('Не удалось прочитать встроенный шаблон формы: ' + e.message, 8000); }
    renderSettings();
  }
  if (settings.theme) document.documentElement.dataset.theme = settings.theme;
  renderSettings(); renderHistory(); setStatus(); pickPrev();
  loadTemplateCountries();
  try { const t = localStorage.getItem('suo.tab'); if (t && t !== 'load' && document.querySelector(`#tabs button[data-tab="${t}"]`)) showTab(t); } catch (e) { /* ignore */ }
  window.SUO_APP = { state, settings: () => settings, history: () => history, effective, buildRecord, exportXlsx, loadFile };
})();
