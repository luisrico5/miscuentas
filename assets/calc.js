// calc.js — Motor de recálculo (réplica de las fórmulas del Excel, con correcciones autorizadas)
// Reglas corregidas por el usuario:
//   - Todos los divisores de horas extras = 210 (los /220 y /235 del Excel eran errores).
//   - Prima base D21 = (suma de los totales mensuales D20 de los 6 meses del semestre + X) / 6,
//     donde X es un valor que el usuario coloca por semestre. Prima pagada D22 = (D21/2) - deducción.
(function (global) {
  const num = (window.F ? F.num : (x) => (typeof x === 'number' ? x : parseFloat(x) || 0));

  // Parámetros ajustables (luego editables / desde Firebase)
  const DEFAULT_PARAMS = {
    semX: { 1: 3697884, 2: 0 },        // "valor X" por semestre
    deduccion: { 1: 1264086, 2: 1202172 }, // deducción de la prima por semestre
    tasaDolar: 3600,                   // Q5 = Q3 + Q4 * tasaDolar
    metaMensualAhorro: 3697884 / 10,   // base de A21 = 3697884/10*12
  };

  // Coeficientes de valor/hora (divisor fijo 210)
  const HORA_FACTOR = { 5: 1.25, 6: 1.75, 7: 2.25, 8: 2.75, 9: 2.0, 10: 0.1 * 8, 11: 1.0, 12: 0.35, 13: 8.0 };

  function V(WB, m, coord) {
    const c = WB.months[m] && WB.months[m][coord];
    return c ? c.v : null;
  }
  function isFormula(WB, m, coord) {
    const c = WB.months[m] && WB.months[m][coord];
    return !!(c && c.f);
  }

  // ---- Cálculo por mes (sin dependencias entre meses) ----
  function computeMonthBase(WB, m, P) {
    const C3 = num(V(WB, m, 'C3'));          // salario básico (constante)
    const div = C3 / 210;

    const D = {}, F = {};
    let F14 = 0;
    for (let r = 5; r <= 13; r++) {
      D[r] = div * HORA_FACTOR[r];
      const E = num(V(WB, m, 'E' + r));
      F[r] = E * D[r];
      F14 += F[r];
    }

    const hoursRows = [];
    for (let r = 5; r <= 13; r++) {
      hoursRows.push({
        label: V(WB, m, 'B' + r) || '',
        cantidad: num(V(WB, m, 'E' + r)),
        valorHora: D[r],
        total: F[r],
      });
    }

    const Q3 = num(V(WB, m, 'Q3'));
    const Q4 = num(V(WB, m, 'Q4'));
    const Q5 = Q3 + Q4 * P.tasaDolar;

    // Descuentos del 30 (I5:I20): fórmulas recalculadas, resto literal
    const I = {};
    for (let r = 5; r <= 20; r++) I[r] = num(V(WB, m, 'I' + r));
    I[5] = (C3 + F14) * 0.04;   // Salud
    I[6] = (C3 + F14) * 0.04;   // Pensión
    I[10] = C3 * 0.01;          // aporte sindical
    if (isFormula(WB, m, 'I15')) I[15] = 5410 + 9688; // pólizas (por defecto; editable si hay override)
    // solidaridad sindical: (salario / 30) × cantidad (control +/-). La cantidad se guarda en I19q.
    I[19] = (C3 / 30) * num(V(WB, m, 'I19q'));
    let sumI = 0;
    for (let r = 5; r <= 20; r++) sumI += I[r] || 0;

    // Descuentos del 15 (M5:M13)
    let sumM = 0;
    for (let r = 5; r <= 13; r++) sumM += num(V(WB, m, 'M' + r));

    // Conceptos EXTRA agregados por el usuario (mismo comportamiento que los del Excel)
    const ex = (P.extra && P.extra[m]) || {};
    (ex.d30 || []).forEach((x) => { sumI += num(x.value); });
    (ex.d15 || []).forEach((x) => { sumM += num(x.value); });

    const C16 = C3 * 0.266666637785683;   // pago del 15 (bruto)
    const D16 = sumM;
    const E16 = C16 - D16;                // a favor del 15

    const C17 = C3 * (1 - 0.267);         // pago del 30 (bruto)
    const D17 = sumI;
    const E17 = (C17 + F14) - D17;        // a favor del 30

    const D20 = C3 + F14;                 // TOTAL del mes (salario + horas extras)
    const I28 = E16 + E17;                // FLUJO LIBRE

    // Deudas (L17:M22)  — se muestran tal cual; el total de deuda se toma de I29 (ver nota)
    const deudas = [];
    for (let r = 17; r <= 22; r++) {
      const label = V(WB, m, 'L' + r);
      if (label === null || label === undefined || label === '') continue;
      deudas.push({ label: label, valor: num(V(WB, m, 'M' + r)) });
    }
    const I29 = num(V(WB, m, 'I29'));     // "deuda" mostrada en distribución

    return {
      C3, D, F, F14, hoursRows, Q3, Q4, Q5,
      I, sumI, C16, D16, E16, C17, D17, E17, D20, I26: sumI, I28, I29, deudas,
    };
  }

  // ---- Cálculo global (dependencias entre meses: promedio semestral, total USD, total ahorro) ----
  function computeAll(WB, params) {
    const P = Object.assign({}, DEFAULT_PARAMS, params || {});
    const months = WB.monthsOrder;
    const base = {};
    months.forEach((m) => { base[m] = computeMonthBase(WB, m, P); });

    // Totales anuales
    let totalQ5 = 0, totalQ4 = 0;
    months.forEach((m) => { totalQ5 += base[m].Q5; totalQ4 += base[m].Q4; });
    months.forEach((m) => { base[m].I27 = totalQ5; }); // ahorro e inversión (∑ Q5 del año)

    // Prima por semestre: D21 = (∑ D20 de los 6 meses + X) / 6 ; D22 = (D21/2) - deducción
    const sem1 = months.slice(0, 6), sem2 = months.slice(6, 12);
    const sum1 = sem1.reduce((a, m) => a + base[m].D20, 0);
    const sum2 = sem2.reduce((a, m) => a + base[m].D20, 0);
    const D21s1 = (sum1 + P.semX[1]) / 6;
    const D21s2 = (sum2 + P.semX[2]) / 6;
    sem1.forEach((m) => { base[m].D21 = D21s1; base[m].D22 = (D21s1 / 2) - P.deduccion[1]; });
    sem2.forEach((m) => { base[m].D21 = D21s2; base[m].D22 = (D21s2 / 2) - P.deduccion[2]; });

    base.__meta = { totalUSD: totalQ4, totalAhorroAnual: totalQ5, params: P };
    return base;
  }

  // ---- Vista RESUMEN para un mes (réplica de las fórmulas + macros del dashboard) ----
  function resumen(WB, base, m) {
    const months = WB.monthsOrder;
    const idx = months.indexOf(m);
    const prev = idx > 0 ? months[idx - 1] : null;
    const b = base[m];
    const P = base.__meta.params;

    const A4 = b.D20;                       // ingreso total
    const G9 = b.I26;                       // gastos y descuentos
    const G10 = b.I27;                      // ahorro e inversión
    const G11 = b.I28;                      // flujo libre
    const G12 = b.I29;                      // deuda

    // Variación vs mes anterior
    function varPct(actual, ant) {
      if (prev === null) return { txt: 'Sin mes anterior', dir: 'flat', pct: null };
      if (actual === 0 && ant === 0) return { txt: '▬ No ahorraste', dir: 'flat', pct: 0 };
      if (actual === 0) return { txt: '▬ No ahorraste', dir: 'flat', pct: 0 };
      const v = ant === 0 ? 1 : (actual - ant) / ant;
      const dir = actual >= ant ? 'up' : 'down';
      const arrow = dir === 'up' ? '▲ ' : '▼ ';
      return { txt: arrow + F.pct1(Math.abs(v)) + ' vs mes anterior', dir, pct: v };
    }
    const ingresoVar = varPct(b.D20, prev ? base[prev].D20 : 0);
    const ahorroPesVar = varPct(b.Q3, prev ? base[prev].Q3 : 0);
    const ahorroDolVar = varPct(b.Q4, prev ? base[prev].Q4 : 0);

    // Meta anual de ahorro
    const metaAnual = P.metaMensualAhorro * 12; // A21
    const metaCumplido = G10;                    // W19
    const metaRestante = Math.max(0, metaAnual - metaCumplido); // W20
    const metaPct = metaAnual ? metaCumplido / metaAnual : 0;

    // Mensajes automáticos (K1..K3, L1)
    const msgCamino = G11 >= 100000 ? 'Vas por buen camino' : 'Debes reducir tus gastos';
    const msgEndeud = G12 > 40000000 ? 'Considera reducir tu nivel de endeudamiento'
                                     : 'Tu endeudamiento es Sostenible, sigue así';
    const msgFlujo = G11 >= 100000 ? 'Tu flujo libre es positivo 👍' : 'Para aumentar tu flujo de caja';
    const ahorroSaludable = b.Q5 >= b.C3 * 0.1;
    const msgAhorro = ahorroSaludable ? 'Tu ahorro del mes es saludable' : 'Tu ahorro este mes no es saludable';

    // Semáforos (de las macros VBA)
    const sem = {
      ahorroSaludable,
      flujoPositivo: G11 > 100000,
      endeudamientoAlto: G12 > 40000000,
      tienePrimaExtra: !!(V(WB, m, 'C23')),
    };

    return {
      month: m, prev,
      ingresoTotal: A4, ingresoVar,
      ahorroPesos: b.Q3, ahorroDolares: b.Q4, ahorroPesVar, ahorroDolVar,
      pctIngresos: A4 ? G11 / A4 : 0,          // C6
      primaValor: b.D22, primaLabel: V(WB, m, 'C22') || 'Prima',
      primaExtraLabel: V(WB, m, 'C23') || '', primaExtraValor: num(V(WB, m, 'D23')),
      gastosDescuentos: G9, ahorroInversion: G10, flujoLibre: G11, deuda: G12,
      hoursRows: b.hoursRows, totalHoras: b.F14,
      pctSalarioBasico: (A4 - b.F14) ? b.F14 / (A4 - b.F14) : 0, // C20
      deudas: b.deudas,
      distribucion: [
        { label: 'Gastos y descuentos', value: G9 },
        { label: 'Ahorro e inversión', value: G10 },
        { label: 'Flujo libre', value: G11 },
        { label: 'Deuda', value: G12 },
      ],
      metaAnual, metaCumplido, metaRestante, metaPct,
      totalUSD: base.__meta.totalUSD,
      msgCamino, msgEndeud, msgFlujo, msgAhorro,
      sem,
    };
  }

  global.CALC = { computeAll, resumen, DEFAULT_PARAMS };
})(window);
