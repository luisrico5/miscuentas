// format.js — Formateo de números fiel al Excel (locale es-CO: miles con punto, decimales con coma)
(function (global) {
  const copInt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const cop2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd2 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const plain2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

  function toNum(x) {
    if (typeof x === 'number') return x;
    if (x === true) return 1;
    if (x === false || x === null || x === undefined || x === '') return 0;
    const n = parseFloat(String(x).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  const F = {
    num: toNum,
    // "$ 3.788.230"
    cop(x) { return '$ ' + copInt.format(Math.round(toNum(x))); },
    // "$ 3.788.229,97"
    cop2(x) { return '$ ' + cop2.format(toNum(x)); },
    // "USD 40,00"
    usd(x) { return 'USD ' + usd2.format(toNum(x)); },
    // "14,1%" (1 decimal)
    pct1(x) { return plain2Fixed(toNum(x) * 100, 1) + '%'; },
    // "26%"
    pct0(x) { return Math.round(toNum(x) * 100) + '%'; },
    // "16"  / "4,75"
    qty(x) { return plain2.format(toNum(x)); },
    int(x) { return plain0.format(Math.round(toNum(x))); },
  };

  function plain2Fixed(n, dec) {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  }

  global.F = F;
})(window);
