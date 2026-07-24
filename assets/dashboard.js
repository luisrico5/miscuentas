// dashboard.js — Render del RESUMEN + interacción + gráficos (SVG)
(function () {
  const YEARS = ['2026', '2027', '2028'];
  const YY = { '2026': '26', '2027': '27', '2028': '28' };
  let WB = null; // datos FUENTE del año activo (state.byYear[state.year])
  const state = {
    year: '2026', month: 'JUL 26', view: 'resumen', base: null,
    params: {}, overrides: {}, extra: {}, byYear: {}, paramsByYear: {}, onSave: null, dirty: false,
  };
  const cell = (m, c) => (state.wb.months[m] && state.wb.months[m][c]) || null;
  const cval = (m, c) => { const x = cell(m, c); return x ? x.v : null; };
  const isLiteral = (m, c) => { const x = cell(m, c); return !!x && !x.f; };

  // Genera un año EN BLANCO a partir de la plantilla, remapeando el sufijo de año (ENE 26 -> ENE 28)
  function blankYear(yy) {
    const t = window.TEMPLATE;
    const remap = (k) => k.replace(/\s*\d{2}$/, '') + ' ' + yy;
    const months = {};
    for (const k in t.months) months[remap(k)] = JSON.parse(JSON.stringify(t.months[k]));
    return { monthsOrder: t.monthsOrder.map(remap), months };
  }

  // ---- overrides de edición: overrides[month][coord] = value (la clave del mes incluye el año) ----
  function applyOverrides() {
    const clone = { monthsOrder: WB.monthsOrder, months: {} };
    for (const m of WB.monthsOrder) {
      clone.months[m] = {};
      for (const k in WB.months[m]) clone.months[m][k] = WB.months[m][k];
      const ov = state.overrides[m];
      if (ov) for (const c in ov) clone.months[m][c] = Object.assign({}, clone.months[m][c] || {}, { v: ov[c], f: null });
    }
    return clone;
  }

  function setYear(y) {
    const idx = WB ? Math.max(0, WB.monthsOrder.indexOf(state.month)) : 6;
    state.year = y;
    WB = state.byYear[y];
    if (!state.paramsByYear[y]) state.paramsByYear[y] = {};
    state.params = state.paramsByYear[y];
    state.month = WB.monthsOrder[idx] || WB.monthsOrder[0];
    populateMonths();
  }

  function populateMonths() {
    const sel = document.getElementById('monthSel');
    if (!sel) return;
    sel.innerHTML = '';
    WB.monthsOrder.forEach((m) => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m.replace(/\s*\d{2}$/, '');  // muestra solo el mes
      sel.appendChild(o);
    });
    sel.value = state.month;
  }

  function recompute() {
    const wb = applyOverrides();
    state.base = CALC.computeAll(wb, Object.assign({}, state.params, { extra: state.extra }));
    state.wb = wb;
    render();
  }

  // ---------- Helpers de dibujo ----------
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  // ---------- Inputs editables (nivel módulo, usados por renderMes y descuentosCard) ----------
  const parseMoney = (s) => parseInt(String(s).replace(/[^\d-]/g, ''), 10) || 0;
  function numInput(coord, value, opts) {
    opts = opts || {};
    const inp = el(`<input class="m-input" type="number" step="${opts.step || 'any'}" value="${value}" aria-label="${opts.label || coord}">`);
    inp.addEventListener('change', () => { if (opts.onChange) opts.onChange(parseFloat(inp.value) || 0); else setOv(coord, parseFloat(inp.value) || 0); });
    return inp;
  }
  function moneyInput(coord, value, opts) {
    opts = opts || {};
    const fmt = (n) => '$ ' + F.int(n);
    const inp = el(`<input class="m-input money" type="text" inputmode="numeric" value="${fmt(value)}" aria-label="${opts.label || coord}">`);
    inp.addEventListener('focus', () => { inp.value = String(parseMoney(inp.value)); inp.select(); });
    inp.addEventListener('blur', () => { inp.value = fmt(parseMoney(inp.value)); });
    inp.addEventListener('change', () => { if (opts.onChange) opts.onChange(parseMoney(inp.value)); else setOv(coord, parseMoney(inp.value)); });
    return inp;
  }

  // Input de porcentaje editable de la quincena (period = 15 | 30). Guarda la fracción en params.quincena.
  function pctInput(period, frac) {
    const wrap = el(`<span class="pct-wrap"></span>`);
    const inp = el(`<input class="pct-input" type="number" step="0.01" value="${(frac * 100).toFixed(2)}" aria-label="porcentaje quincena ${period}">`);
    inp.addEventListener('change', () => {
      const f = (parseFloat(inp.value) || 0) / 100;
      state.params.quincena = Object.assign({}, CALC.DEFAULT_PARAMS.quincena, state.params.quincena, { [period]: f });
      markDirty(); recompute();
    });
    wrap.appendChild(inp);
    wrap.appendChild(document.createTextNode('%'));
    return wrap;
  }

  function donut(slices, opts) {
    opts = opts || {};
    const size = opts.size || 150, sw = opts.stroke || 24, r = (size - sw) / 2, C = 2 * Math.PI * r;
    const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
    let off = 0;
    const segs = slices.map((s) => {
      const frac = Math.max(0, s.value) / total;
      const len = frac * C;
      const seg = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${Math.max(0,len-2)} ${C-Math.max(0,len-2)}" stroke-dashoffset="${-off}" stroke-linecap="butt" transform="rotate(-90 ${size/2} ${size/2})"><title>${s.label}: ${F.cop(s.value)}</title></circle>`;
      off += len; return seg;
    }).join('');
    const center = opts.center ? `<text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central" class="donut-center" fill="var(--text-1)" font-size="${opts.centerSize||18}">${opts.center}</text>` : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${opts.aria||'gráfico'}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--grid)" stroke-width="${sw}"/>${segs}${center}</svg>`;
  }

  // Medio círculo (gauge) como la dona de ahorro del Excel
  function gauge(pct, opts) {
    opts = opts || {};
    const W = opts.size || 240, sw = opts.stroke || 28, pad = 6;
    const r = (W - sw) / 2 - pad, cx = W / 2, cy = r + sw / 2 + pad;
    const H = cy + sw / 2 + pad + 22; // espacio para el texto
    const P = Math.max(0, Math.min(1, pct));
    const rad = (a) => a * Math.PI / 180;
    const pt = (a) => [cx + r * Math.cos(rad(a)), cy - r * Math.sin(rad(a))];
    const arc = (a0, a1) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    const endAngle = 180 - 180 * P;
    const track = `<path d="${arc(180, 0)}" fill="none" stroke="${opts.trackColor || 'var(--grid)'}" stroke-width="${sw}" stroke-linecap="round"/>`;
    const val = P > 0 ? `<path d="${arc(180, endAngle)}" fill="none" stroke="${opts.color || 'var(--s-ahorro)'}" stroke-width="${sw}" stroke-linecap="round"/>` : '';
    const label = `<text x="${cx}" y="${cy - r * 0.28}" text-anchor="middle" class="donut-center" fill="var(--text-1)" font-size="${opts.centerSize || 30}">${opts.center || ''}</text>`;
    const sub = opts.sub ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--muted)" font-size="12">${opts.sub}</text>` : '';
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.aria || 'medidor'}">${track}${val}${label}${sub}</svg>`;
  }

  function deltaHtml(v) {
    if (!v || v.pct === null) return `<span class="delta flat">${v ? v.txt : ''}</span>`;
    const cls = v.dir === 'up' ? 'up' : v.dir === 'down' ? 'down' : 'flat';
    return `<span class="delta ${cls}">${v.txt}</span>`;
  }

  // ---------- Render (dispatcher por vista) ----------
  function render() {
    document.getElementById('monthSel').value = state.month;
    const ySel = document.getElementById('yearSel');
    if (ySel) ySel.value = state.year;
    const btnR = document.getElementById('viewResumenBtn');
    const btnM = document.getElementById('viewMesBtn');
    if (btnR && btnM) {
      btnR.classList.toggle('active', state.view !== 'mes');
      btnM.classList.toggle('active', state.view === 'mes');
    }
    if (state.view === 'mes') renderMes();
    else renderResumen();
  }

  // ---------- Vista RESUMEN (solo lectura) ----------
  function renderResumen() {
    const R = CALC.resumen(state.wb, state.base, state.month);
    const app = document.getElementById('app');
    app.innerHTML = '';

    // KPIs — cada uno con su ícono del Excel y su leyenda de estado debajo
    const IMG = 'assets/img/';
    const statusLine = (msg, cls) => `<div class="status ${cls}">${msg}</div>`;
    const kpis = el(`<div class="grid cols-4"></div>`);

    const caminoGood = R.msgCamino.includes('buen');
    kpis.appendChild(el(`<div class="card kpi">
      <img class="kpi-ico" src="${IMG}image1.png" alt="">
      <div class="label">Ingreso total del mes</div>
      <div class="value">${F.cop(R.ingresoTotal)}</div>
      <div class="sub">${deltaHtml(R.ingresoVar)}</div>
      ${statusLine(R.msgCamino, caminoGood ? 'good' : 'bad')}
    </div>`));

    kpis.appendChild(el(`<div class="card kpi">
      <img class="kpi-ico" src="${IMG}image2.png" alt="">
      <div class="label">Ahorro del mes</div>
      <div class="value">${F.usd(R.ahorroDolares)}</div>
      <div class="sub">${F.cop(R.ahorroPesos)} en pesos · <span class="badge ${R.sem.ahorroSaludable ? 'ok' : 'no'}">${R.sem.ahorroSaludable ? 'Saludable' : 'Bajo'}</span></div>
      ${statusLine(R.msgAhorro, R.sem.ahorroSaludable ? 'good' : 'warn')}
    </div>`));

    kpis.appendChild(el(`<div class="card kpi">
      <img class="kpi-ico" src="${IMG}image4.png" alt="">
      <div class="label">Flujo libre</div>
      <div class="value">${F.cop(R.flujoLibre)}</div>
      <div class="sub">${F.pct1(R.pctIngresos)} de los ingresos</div>
      ${statusLine(R.msgFlujo, R.sem.flujoPositivo ? 'good' : 'warn')}
    </div>`));

    kpis.appendChild(el(`<div class="card kpi">
      <img class="kpi-ico" src="${IMG}image7.png" alt="">
      <div class="label">Ahorrado en dólares (año)</div>
      <div class="value">${R.totalUSD} USD</div>
      <div class="sub">Meta anual: ${F.pct0(R.metaPct)} cumplido</div>
    </div>`));
    app.appendChild(kpis);

    // -- Horas extras (compacto: una fila por concepto, sin barra)
    const he = el(`<div class="card"><h3>Horas extras — ${state.month}</h3></div>`);
    const rows = el(`<div class="rows"></div>`);
    R.hoursRows.forEach((r, i) => {
      const coord = 'E' + (i + 5);
      const rowEl = el(`<div class="row he-row">
        <div class="name">${r.label || '—'}</div>
        <span class="qty">${F.qty(r.cantidad)} h × ${F.cop(r.valorHora)}</span>
        <div class="amt">${F.cop(r.total)}</div>
      </div>`);
      // El input es SOLO LECTURA: la cantidad de horas proviene de la hoja del mes.
      const inp = el(`<input class="qty-input" type="number" value="${r.cantidad}" readonly tabindex="-1" aria-label="cantidad ${r.label} (bloqueado, proviene de la hoja del mes)" title="Este valor proviene de la hoja del mes; aquí es de solo lectura.">`);
      rowEl.insertBefore(inp, rowEl.querySelector('.amt'));
      rows.appendChild(rowEl);
    });
    he.appendChild(rows);
    he.appendChild(el(`<div class="total-row"><span>Total horas extras</span><span>${F.cop(R.totalHoras)}</span></div>`));
    he.appendChild(el(`<div class="note">🔒 ${F.pct1(R.pctSalarioBasico)} del salario básico · divisor 210. Las cantidades provienen de la hoja del mes (solo lectura aquí).</div>`));

    // -- Distribución del dinero (dona)
    const dcolors = ['var(--s-gastos)', 'var(--s-ahorro)', 'var(--s-flujo)', 'var(--s-deuda)'];
    const dslices = R.distribucion.map((s, i) => ({ label: s.label, value: s.value, color: dcolors[i] }));
    const dtotal = dslices.reduce((a, s) => a + s.value, 0);
    const dist = el(`<div class="card"><h3>Distribución del dinero</h3></div>`);
    const dflex = el(`<div class="chart-flex"></div>`);
    dflex.appendChild(el(donut(dslices, { center: '', aria: 'distribución del dinero', size: 190, stroke: 30 })));
    const leg = el(`<div class="legend"></div>`);
    dslices.forEach((s) => {
      const pctTxt = dtotal ? ' · ' + F.pct1(s.value / dtotal) : '';
      leg.appendChild(el(`<div class="li"><span class="sw" style="background:${s.color}"></span><span class="name">${s.label}${pctTxt}</span><span class="lv">${F.cop(s.value)}</span></div>`));
    });
    dflex.appendChild(leg);
    dist.appendChild(dflex);
    dist.appendChild(el(`<div class="note">Nota: la "Deuda" (${F.cop(R.deuda)}) es saldo acumulado; por eso domina la dona. ¿La separamos del gasto mensual en la versión final?</div>`));

    // -- Deudas
    const deu = el(`<div class="card"><h3>Deudas</h3></div>`);
    const drows = el(`<div class="rows"></div>`);
    const deudasList = R.deudas.filter((d) => !/total/i.test(String(d.label)));
    const maxDeuda = Math.max(1, ...deudasList.map((d) => d.valor));
    deudasList.forEach((d) => {
      drows.appendChild(el(`<div class="row">
        <div class="name">${d.label}</div>
        <div class="amt">${F.cop(d.valor)}</div>
        <div class="bar-wrap"><div class="bar debt" style="width:${(d.valor / maxDeuda * 100).toFixed(1)}%"></div></div>
      </div>`));
    });
    deu.appendChild(drows);
    const totDeuda = deudasList.reduce((a, d) => a + d.valor, 0);
    deu.appendChild(el(`<div class="total-row"><span>Total deudas</span><span>${F.cop(totDeuda)}</span></div>`));
    deu.appendChild(el(`<div class="status ${R.sem.endeudamientoAlto ? 'bad' : 'good'}"><img class="status-ico" src="${IMG}image5.png" alt="">${R.msgEndeud}</div>`));

    // -- Meta anual de ahorro (medio círculo compacto) + Prima extralegal al lado
    const meta = el(`<div class="card"><h3>Meta anual de ahorro</h3></div>`);
    const mflex = el(`<div class="chart-flex meta-flex"></div>`);
    mflex.appendChild(el(gauge(R.metaPct, {
      center: F.pct0(R.metaPct), sub: 'cumplido', size: 190, stroke: 26,
      color: 'var(--s-ahorro)', trackColor: 'var(--grid)', aria: 'meta anual de ahorro',
    })));
    const mleg = el(`<div class="legend"></div>`);
    mleg.appendChild(el(`<div class="li"><span class="sw" style="background:var(--s-ahorro)"></span><span class="name">Cumplido</span><span class="lv">${F.cop(R.metaCumplido)}</span></div>`));
    mleg.appendChild(el(`<div class="li"><span class="sw" style="background:var(--grid)"></span><span class="name">Restante</span><span class="lv">${F.cop(R.metaRestante)}</span></div>`));
    mleg.appendChild(el(`<div class="li"><span class="sw" style="background:transparent;border:1px solid var(--border)"></span><span class="name">Meta anual</span><span class="lv">${F.cop(R.metaAnual)}</span></div>`));
    mflex.appendChild(mleg);
    // Bloque de prima al lado de la meta: PRIMA DEL SEMESTRE arriba, y PRIMA EXTRALEGAL debajo (solo 2º semestre)
    const idxMes = state.wb.monthsOrder.indexOf(state.month);
    const esSem2 = idxMes >= 6;
    const mostrarExtra = esSem2 && !!R.primaExtraLabel;
    const primaBlock = el(`<div class="prima-extra">
      <div class="pe-label">Prima del semestre</div>
      <div class="pe-value">${F.cop(R.primaValor)}</div>
      ${mostrarExtra ? `
        <div class="pe-sep"></div>
        <img src="${IMG}image7.png" alt="prima extralegal">
        <div class="pe-label">${R.primaExtraLabel}</div>
        <div class="pe-value">${F.cop(R.primaExtraValor)}</div>` : ''}
    </div>`);
    mflex.appendChild(primaBlock);
    meta.appendChild(mflex);

    // ---- Ensamblado en dos columnas ----
    // Izquierda: Horas extras, Deudas · Derecha: Distribución, Meta anual (+ prima)
    const layout = el(`<div class="two-col"></div>`);
    const colL = el(`<div class="col"></div>`);
    const colR = el(`<div class="col"></div>`);
    colL.appendChild(he); colL.appendChild(deu);
    colR.appendChild(dist); colR.appendChild(meta);
    layout.appendChild(colL); layout.appendChild(colR);
    app.appendChild(layout);
  }

  // ---------- Vista MENSUAL (editable) ----------
  function renderMes() {
    const m = state.month;
    const b = state.base[m];
    const app = document.getElementById('app');
    app.innerHTML = '';

    app.appendChild(el(`<div class="banner">✏️ <strong>Editando ${m}</strong> — cambia los valores y el resumen se recalcula. Pulsa <strong>💾 Guardar</strong> para conservarlos cifrados.</div>`));

    const layout = el(`<div class="two-col"></div>`);
    const colL = el(`<div class="col"></div>`);
    const colR = el(`<div class="col"></div>`);

    // --- Salario base (editable) ---
    const salCard = el(`<div class="card"><h3>Salario base — ${m}</h3></div>`);
    const salRows = el(`<div class="rows"></div>`);
    const salRow = el(`<div class="row m-row"><div class="name">Salario básico mensual</div></div>`);
    salRow.appendChild(moneyInput('C3', Math.round(b.C3), { label: 'salario base' }));
    salRows.appendChild(salRow);
    salCard.appendChild(salRows);
    const applyAll = el(`<button class="btn add-concept">Aplicar este salario a todos los meses</button>`);
    applyAll.addEventListener('click', () => {
      const v = state.base[m].C3;
      state.wb.monthsOrder.forEach((mm) => { state.overrides[mm] = state.overrides[mm] || {}; state.overrides[mm]['C3'] = v; });
      markDirty(); recompute();
    });
    salCard.appendChild(applyAll);
    salCard.appendChild(el(`<div class="note">De este salario dependen las horas extras y los descuentos con fórmula (Salud, Pensión, aporte sindical), que se recalculan solos.</div>`));
    colL.appendChild(salCard);

    // --- Horas extras (editable) ---
    const he = el(`<div class="card"><h3>Horas extras — ${m}</h3></div>`);
    const heRows = el(`<div class="rows"></div>`);
    b.hoursRows.forEach((r, i) => {
      const coord = 'E' + (i + 5);
      const row = el(`<div class="row m-row"><div class="name">${r.label || '—'}<span class="qty"> · ${F.cop(r.valorHora)}/h</span></div></div>`);
      row.appendChild(numInput(coord, r.cantidad, { step: '0.25', label: r.label }));
      row.appendChild(el(`<div class="amt">${F.cop(r.total)}</div>`));
      heRows.appendChild(row);
    });
    he.appendChild(heRows);
    he.appendChild(el(`<div class="total-row"><span>Total horas extras</span><span>${F.cop(b.F14)}</span></div>`));
    colL.appendChild(he);

    // --- Quincenas: pago del 15 y del 30 (% del salario EDITABLE) ---
    const quin = el(`<div class="card"><h3>Quincenas — pago del 15 y del 30</h3></div>`);
    const qrows = el(`<div class="rows"></div>`);
    const qLine = (label, valor, tipo) => el(`<div class="q-row ${tipo || ''}"><div class="name">${label}</div><div class="amt">${F.cop(valor)}</div></div>`);
    const qp = state.params.quincena || {};
    const pct15 = qp[15] != null ? qp[15] : CALC.DEFAULT_PARAMS.quincena[15];
    const pct30 = qp[30] != null ? qp[30] : CALC.DEFAULT_PARAMS.quincena[30];
    // Fila "Valor quincena" con el % editable a la izquierda
    const valorRow = (valor, period, frac) => {
      const row = el(`<div class="q-row"><div class="name">Valor quincena </div><div class="amt">${F.cop(valor)}</div></div>`);
      row.querySelector('.name').appendChild(pctInput(period, frac));
      return row;
    };
    qrows.appendChild(el(`<div class="q-head">Pago del 15 <span class="qty">(% del salario)</span></div>`));
    qrows.appendChild(valorRow(b.C16, 15, pct15));
    qrows.appendChild(qLine('− Descuentos del 15', b.D16));
    qrows.appendChild(qLine('= A favor', b.E16, 'fav'));
    qrows.appendChild(el(`<div class="q-head" style="margin-top:8px">Pago del 30 <span class="qty">(% del salario + horas extras)</span></div>`));
    qrows.appendChild(valorRow(b.C17, 30, pct30));
    qrows.appendChild(qLine('+ Horas extras', b.F14));
    qrows.appendChild(qLine('− Descuentos del 30', b.D17));
    qrows.appendChild(qLine('= A favor', b.E17, 'fav'));
    quin.appendChild(qrows);
    quin.appendChild(el(`<div class="note">Los porcentajes de cada quincena son editables (a veces varían). "A favor" = lo que te queda.</div>`));
    colL.appendChild(quin);

    // --- Ahorro del mes ---
    const ah = el(`<div class="card"><h3>Ahorro del mes</h3></div>`);
    const ahRows = el(`<div class="rows"></div>`);
    const rQ3 = el(`<div class="row m-row"><div class="name">Ahorro en pesos (Q3)</div></div>`); rQ3.appendChild(moneyInput('Q3', b.Q3));
    const rQ4 = el(`<div class="row m-row"><div class="name">Ahorro en dólares (Q4)</div></div>`); rQ4.appendChild(numInput('Q4', b.Q4, { step: '0.01' }));
    ahRows.appendChild(rQ3); ahRows.appendChild(rQ4);
    ah.appendChild(ahRows);
    ah.appendChild(el(`<div class="total-row"><span>Total ahorrado (Q5)</span><span>${F.cop(b.Q5)}</span></div>`));
    ah.appendChild(el(`<div class="note">Saludable si el total ≥ 10% del salario básico (${F.cop(b.C3 * 0.1)}).</div>`));
    colL.appendChild(ah);

    // --- Deudas (editable) ---
    const deu = el(`<div class="card"><h3>Deudas</h3></div>`);
    const deuRows = el(`<div class="rows"></div>`);
    let totDeuda = 0;
    for (let r = 17; r <= 22; r++) {
      const label = cval(m, 'L' + r);
      if (!label || /total/i.test(String(label))) continue;
      const val = F.num(cval(m, 'M' + r));
      totDeuda += val;
      const row = el(`<div class="row m-row"><div class="name">${label}</div></div>`);
      row.appendChild(moneyInput('M' + r, val, { label: label }));
      deuRows.appendChild(row);
    }
    deu.appendChild(deuRows);
    deu.appendChild(el(`<div class="total-row"><span>Total deudas</span><span>${F.cop(totDeuda)}</span></div>`));
    colL.appendChild(deu);

    // --- Descuentos del 30 (I5:I20) ---
    const d30 = descuentosCard('Descuentos del 30', m, 'H', 'I', 'J', 5, 20, 'd30');
    colR.appendChild(d30);

    // --- Descuentos del 15 (M5:M13) ---
    const d15 = descuentosCard('Descuentos del 15', m, 'L', 'M', 'N', 5, 13, 'd15');
    colR.appendChild(d15);

    // --- Prima: valor X del semestre ---
    const semIdx = state.wb.monthsOrder.indexOf(m) < 6 ? 1 : 2;
    const curX = (state.params.semX && state.params.semX[semIdx] !== undefined) ? state.params.semX[semIdx] : CALC.DEFAULT_PARAMS.semX[semIdx];
    const primaC = el(`<div class="card"><h3>Prima — valor X (semestre ${semIdx})</h3></div>`);
    const pRow = el(`<div class="row m-row"><div class="name">Valor X (lo defines tú)</div></div>`);
    const xInp = el(`<input class="m-input" type="number" value="${curX}">`);
    xInp.addEventListener('change', () => {
      state.params.semX = Object.assign({}, CALC.DEFAULT_PARAMS.semX, state.params.semX, { [semIdx]: parseFloat(xInp.value) || 0 });
      markDirty(); recompute();
    });
    pRow.appendChild(xInp);
    primaC.appendChild(el(`<div class="rows"></div>`)).appendChild(pRow);
    primaC.appendChild(el(`<div class="total-row"><span>Prima estimada</span><span>${F.cop(b.D22)}</span></div>`));
    primaC.appendChild(el(`<div class="note">Prima = (suma de los 6 totales mensuales del semestre + X) ÷ 6.</div>`));
    colR.appendChild(primaC);

    layout.appendChild(colL); layout.appendChild(colR);
    app.appendChild(layout);
  }

  function getExtra(m, key) {
    state.extra[m] = state.extra[m] || {};
    state.extra[m][key] = state.extra[m][key] || [];
    return state.extra[m][key];
  }

  // Tarjeta genérica de descuentos: label(colL), valor(colV) editable si es literal, check(colC).
  // El check marca lo que YA se descontó/pagó → se resta del total para ver lo PENDIENTE.
  // key = 'd30' | 'd15' para los conceptos EXTRA que agrega el usuario con el botón +.
  function descuentosCard(title, m, colLab, colV, colC, r0, r1, key) {
    const card = el(`<div class="card"><h3>${title}</h3></div>`);
    const rows = el(`<div class="rows"></div>`);
    let total = 0, pagado = 0;

    // Filas originales del Excel
    for (let r = r0; r <= r1; r++) {
      const label = cval(m, colLab + r);
      if (label === null || label === undefined || String(label).trim() === '') continue;
      const coord = colV + r;
      const isSolid = (colV === 'I' && r === 19);   // solidaridad sindical (control +/-)
      const isPoliza = (colV === 'I' && r === 15);  // pólizas: editable
      const lit = isLiteral(m, coord);
      // valor: fórmulas/solidaridad/pólizas usan el CALCULADO (base.I); literales usan el guardado/editado
      const useCalc = colV === 'I' && state.base[m].I && (!lit || isPoliza || isSolid);
      const val = useCalc ? F.num(state.base[m].I[r]) : F.num(cval(m, coord));
      total += val;
      const chkCoord = colC + r;
      const checked = cval(m, chkCoord) === true;
      if (checked) pagado += val;
      const row = el(`<div class="row m-row ${checked ? 'done' : ''}"></div>`);
      const chk = el(`<input type="checkbox" class="chk" ${checked ? 'checked' : ''} title="márcalo cuando ya se haya descontado/pagado">`);
      chk.addEventListener('change', () => setOv(chkCoord, chk.checked));
      row.appendChild(chk);

      if (isSolid) {
        const qty = F.num(cval(m, 'I19q'));
        row.appendChild(el(`<div class="name">${label}<span class="qty"> · ${F.cop(state.base[m].C3 / 30)} × ${F.qty(qty)}</span></div>`));
        const step = el(`<div class="stepper"></div>`);
        const minus = el(`<button class="stepbtn" title="restar">−</button>`);
        minus.addEventListener('click', () => setOv('I19q', Math.max(0, qty - 1)));
        const plus = el(`<button class="stepbtn" title="sumar">＋</button>`);
        plus.addEventListener('click', () => setOv('I19q', qty + 1));
        step.appendChild(minus); step.appendChild(el(`<span class="stepval">${F.qty(qty)}</span>`)); step.appendChild(plus);
        row.appendChild(step);
        row.appendChild(el(`<div class="amt calc">${F.cop(val)}</div>`));
      } else {
        row.appendChild(el(`<div class="name">${label}</div>`));
        if (isPoliza || lit) {
          row.appendChild(moneyInput(coord, val, { label: label }));
        } else {
          row.appendChild(el(`<div class="amt calc" title="calculado por fórmula">${F.cop(val)}</div>`));
        }
      }
      rows.appendChild(row);
    }

    // Conceptos EXTRA agregados por el usuario
    const extras = getExtra(m, key);
    extras.forEach((item, idx) => {
      const val = F.num(item.value);
      total += val;
      if (item.checked) pagado += val;
      const row = el(`<div class="row m-row extra ${item.checked ? 'done' : ''}"></div>`);
      const chk = el(`<input type="checkbox" class="chk" ${item.checked ? 'checked' : ''} title="márcalo cuando ya se haya descontado/pagado">`);
      chk.addEventListener('change', () => { item.checked = chk.checked; markDirty(); recompute(); });
      const lab = el(`<input class="m-label" type="text" placeholder="Concepto" value="${(item.label || '').replace(/"/g, '&quot;')}">`);
      lab.addEventListener('input', () => { item.label = lab.value; markDirty(); });
      const inp = moneyInput(null, val, { label: 'valor concepto', onChange: (v) => { item.value = v; markDirty(); recompute(); } });
      const del = el(`<button class="del" title="Quitar concepto" aria-label="Quitar">×</button>`);
      del.addEventListener('click', () => { extras.splice(idx, 1); markDirty(); recompute(); });
      row.appendChild(chk); row.appendChild(lab); row.appendChild(inp); row.appendChild(del);
      rows.appendChild(row);
    });

    card.appendChild(rows);

    // Botón + para agregar concepto
    const addBtn = el(`<button class="btn add-concept">＋ Agregar concepto</button>`);
    addBtn.addEventListener('click', () => { getExtra(m, key).push({ label: '', value: 0, checked: false }); markDirty(); recompute(); });
    card.appendChild(addBtn);

    const pendiente = total - pagado;
    const pct = total ? pagado / total : 0;
    card.appendChild(el(`<div class="bar-wrap" style="margin-top:10px"><div class="bar" style="width:${(pct * 100).toFixed(1)}%;background:var(--good)"></div></div>`));
    card.appendChild(el(`<div class="total-row"><span>Pendiente</span><span>${F.cop(pendiente)}</span></div>`));
    card.appendChild(el(`<div class="note">Total ${F.cop(total)} · ya descontado ${F.cop(pagado)} (${F.pct0(pct)}). Marca ✔ lo que ya se pagó.</div>`));
    return card;
  }

  function markDirty() { state.dirty = true; }

  function setOv(coord, val) {
    state.overrides[state.month] = state.overrides[state.month] || {};
    state.overrides[state.month][coord] = val;
    markDirty();
    recompute();
  }

  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    // selector de AÑO
    const ySel = document.getElementById('yearSel');
    YEARS.forEach((y) => { const o = document.createElement('option'); o.value = y; o.textContent = y; ySel.appendChild(o); });
    ySel.value = state.year;
    ySel.addEventListener('change', () => { setYear(ySel.value); recompute(); });

    // selector de MES (poblado según el año)
    populateMonths();
    document.getElementById('monthSel').addEventListener('change', (e) => { state.month = e.target.value; render(); });

    // navegación de vistas
    document.getElementById('viewResumenBtn').addEventListener('click', () => { state.view = 'resumen'; render(); });
    document.getElementById('viewMesBtn').addEventListener('click', () => { state.view = 'mes'; render(); });

    // tema — inicia SIEMPRE en paleta Excel (claro); el botón alterna a oscuro
    const themeBtn = document.getElementById('themeBtn');
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      themeBtn.innerHTML = t === 'dark' ? '☀️ <span class="lbl">Claro</span>' : '🌙 <span class="lbl">Oscuro</span>';
    }
    setTheme('light');
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      setTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  // API pública: arranca el dashboard. Acepta formato multi-año {byYear, overrides, extra, paramsByYear}
  // o el formato antiguo {wb, params, overrides, extra} (se toma como año 2026).
  function start(opts) {
    opts = opts || {};
    state.byYear = {};
    YEARS.forEach((y) => {
      if (opts.byYear && opts.byYear[y]) state.byYear[y] = opts.byYear[y];
      else if (y === '2026' && opts.wb) state.byYear[y] = { monthsOrder: opts.wb.monthsOrder, months: opts.wb.months };
      else state.byYear[y] = blankYear(YY[y]);
    });
    state.overrides = opts.overrides || {};
    state.extra = opts.extra || {};
    state.paramsByYear = opts.paramsByYear || (opts.params ? { '2026': opts.params } : {});
    state.month = 'JUL 26';
    setYear('2026');
    // mes por defecto: JUL del año activo
    state.month = WB.monthsOrder.find((m) => m.indexOf('JUL') === 0) || WB.monthsOrder[0];
    boot();
    recompute();
  }

  // Devuelve el estado a guardar (para cifrar y subir a Firebase) — multi-año
  function snapshot() {
    return { version: 2, byYear: state.byYear, overrides: state.overrides, extra: state.extra, paramsByYear: state.paramsByYear };
  }

  window.DASH = { start, snapshot };
})();
