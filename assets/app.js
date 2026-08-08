// app.js — Orquestador: puerta de acceso, login Firebase, descifrado y arranque del dashboard.
(function () {
  const $ = (id) => document.getElementById(id);
  const LS_CFG = 'extras.fbConfig';
  let sessionPassword = null; // se mantiene en memoria para poder guardar (re-cifrar)
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function showMsg(text, kind) {
    const m = $('gateMsg');
    m.textContent = text || '';
    m.className = 'gate-msg' + (kind ? ' ' + kind : '');
  }

  function parseConfig(raw) {
    raw = (raw || '').trim();
    if (!raw) throw new Error('Pega tu configuración de Firebase.');
    // admite pegar "const firebaseConfig = { ... };" o solo el objeto/JSON
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No encontré un objeto de configuración válido.');
    let obj;
    try { obj = JSON.parse(m[0]); }
    catch (e) { try { obj = (new Function('return (' + m[0] + ')'))(); } catch (e2) { throw new Error('La configuración no es válida.'); } }
    if (!obj.apiKey || !obj.projectId) throw new Error('Falta apiKey o projectId en la configuración.');
    return obj;
  }

  function enterApp(banner) {
    $('gate').hidden = true;
    $('appWrap').hidden = false;
    const mb = $('modeBanner');
    if (banner) { mb.innerHTML = banner; mb.hidden = false; }
    else { mb.innerHTML = ''; mb.hidden = true; }
  }

  let saveTimer = null, saving = false;
  function setSaveStatus(txt) { const b = $('saveBtn'); if (b) b.innerHTML = txt; }

  function wireAppButtons(loggedIn) {
    $('logoutBtn').hidden = !loggedIn;
    $('saveBtn').hidden = !loggedIn;
    if (loggedIn) {
      $('logoutBtn').onclick = () => {
        if ((saveTimer || saving) && !confirm('Hay cambios guardándose. ¿Salir de todas formas?')) return;
        location.reload();
      };
      $('saveBtn').onclick = () => saveNow(false);
      window.__onDirty = scheduleAutoSave;   // AUTOGUARDADO al editar
      window.addEventListener('beforeunload', (e) => { if (saveTimer || saving) { e.preventDefault(); e.returnValue = ''; } });
    }
    // Herramientas (respaldo / CSV) para la vista Ajustes
    window.APP = { exportBackup, importBackup, exportCSV };
  }

  function scheduleAutoSave() {
    setSaveStatus('✏️ Sin guardar…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(true), 1800);   // guarda 1.8s después del último cambio
  }

  async function saveNow(auto) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!sessionPassword) { if (!auto) alert('Inicia sesión para guardar.'); return; }
    if (saving) return;
    saving = true;
    setSaveStatus('💾 Guardando…');
    try {
      const snap = window.DASH.snapshot();
      const enc = await window.CRYPTOX.encryptJSON(snap, sessionPassword);
      await window.FB.savePayload(enc);
      setSaveStatus('✅ Guardado');
      setTimeout(() => { if (!saving && !saveTimer) setSaveStatus('💾 Guardar'); }, 1500);
    } catch (e) {
      setSaveStatus('⚠️ Reintentar');
      if (!auto) alert('No se pudo guardar: ' + e.message);
    } finally { saving = false; }
  }
  async function doSave() { return saveNow(false); }

  // ---------- Herramientas: respaldo cifrado, CSV ----------
  function download(name, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }
  const hoyISO = () => new Date().toISOString().slice(0, 10);

  async function exportBackup() {
    if (!sessionPassword) { alert('Inicia sesión para exportar un respaldo cifrado.'); return; }
    try {
      const snap = window.DASH.snapshot();
      const enc = await window.CRYPTOX.encryptJSON(snap, sessionPassword);
      download('respaldo-extras-' + hoyISO() + '.json', JSON.stringify({ tipo: 'extras-backup', cifrado: true, payload: enc }, null, 0), 'application/json');
    } catch (e) { alert('No se pudo exportar: ' + e.message); }
  }

  function importBackup() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      try {
        const obj = JSON.parse(await file.text());
        let data;
        if (obj.cifrado && obj.payload) {
          const pass = prompt('Contraseña del respaldo (la que usaste al exportarlo):');
          if (!pass) return;
          data = await window.CRYPTOX.decryptJSON(obj.payload, pass);
        } else if (obj.data) { data = obj.data; }
        else if (obj.byYear || obj.months) { data = obj; }
        else throw new Error('Archivo de respaldo no reconocido.');
        if (!confirm('Esto REEMPLAZARÁ tus datos actuales con el respaldo. ¿Continuar?')) return;
        window.DASH.loadState(data);
        if (sessionPassword) await saveNow(false);
        alert('Respaldo importado correctamente.');
      } catch (e) { alert('No se pudo importar: ' + e.message); }
    };
    inp.click();
  }

  function exportCSV() {
    const info = window.DASH.exportRows();
    const csv = info.rows.map((r) => r.map((c) => {
      const s = String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    download('extras-' + info.year + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  }

  async function doLogin() {
    const btn = $('loginBtn');
    try {
      showMsg('');
      const cfg = parseConfig($('fbConfig').value);
      lsSet(LS_CFG, JSON.stringify(cfg));
      const email = $('email').value.trim();
      const pass = $('password').value;
      if (!email || !pass) throw new Error('Ingresa correo y contraseña.');

      btn.disabled = true; btn.textContent = 'Conectando…';
      await window.FB.init(cfg);
      await window.FB.login(email, pass);
      sessionPassword = pass;

      showMsg('Descargando datos…');
      const remote = await window.FB.loadPayload();

      if (remote && remote.payload) {
        const data = await window.CRYPTOX.decryptJSON(remote.payload, pass);
        startWith(data, true);
        enterApp('');   // sesión normal: sin banner
      } else if (window.WB && !window.__noSeed) {
        // Uso local del dueño: sembrar con los datos de muestra.
        if (confirm('No hay datos en Firebase para esta cuenta.\n\n¿Importar los datos actuales (de muestra) y guardarlos cifrados ahora?')) {
          startWith({ months: window.WB.months, monthsOrder: window.WB.monthsOrder, params: {}, overrides: {} }, true);
          await doSave();
          enterApp('🔒 Datos importados y cifrados en Firebase. Ya puedes editar y <strong>Guardar</strong>.');
        } else {
          startWith({ months: window.WB.months, monthsOrder: window.WB.monthsOrder, params: {}, overrides: {} }, true);
          enterApp('🔒 Sesión iniciada (datos aún no guardados en Firebase). Pulsa <strong>Guardar</strong> para subirlos cifrados.');
        }
      } else if (window.TEMPLATE) {
        // Cuenta NUEVA sin datos: empezar con una plantilla en blanco.
        startWith({ months: window.TEMPLATE.months, monthsOrder: window.TEMPLATE.monthsOrder, params: { semX: { 1: 0, 2: 0 }, deduccion: { 1: 0, 2: 0 } }, overrides: {}, extra: {} }, true);
        enterApp('🆕 <strong>Cuenta nueva</strong> — empiezas con una plantilla en blanco. Ve a <strong>✏️ Editar mes</strong>, ingresa tus datos y pulsa <strong>💾 Guardar</strong> para conservarlos cifrados.');
      } else {
        throw new Error('No hay datos guardados para esta cuenta.');
      }
      wireAppButtons(true);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Entrar';
      showMsg(traducirError(e), 'err');
    }
  }

  function startWith(data, loggedIn) {
    if (data && data.byYear) {
      // formato multi-año (nuevo)
      window.DASH.start({ byYear: data.byYear, overrides: data.overrides || {}, extra: data.extra || {}, paramsByYear: data.paramsByYear || {} });
    } else {
      // formato antiguo (un solo año = 2026)
      window.DASH.start({
        wb: { monthsOrder: data.monthsOrder || (window.WB && window.WB.monthsOrder) || (window.TEMPLATE && window.TEMPLATE.monthsOrder), months: data.months },
        params: data.params || {},
        overrides: data.overrides || {},
        extra: data.extra || {},
      });
    }
  }

  function traducirError(e) {
    const m = String(e && e.message || e);
    if (m.includes('auth/invalid-credential') || m.includes('auth/wrong-password') || m.includes('auth/user-not-found'))
      return 'Correo o contraseña incorrectos.';
    if (m.includes('auth/invalid-email')) return 'El correo no es válido.';
    if (m.includes('auth/network-request-failed')) return 'Sin conexión con Firebase.';
    if (m.includes('permission') || m.includes('insufficient')) return 'Permisos insuficientes: revisa las reglas de Firestore.';
    if (m.includes('Contraseña incorrecta')) return 'La contraseña no descifra tus datos (¿es la misma con la que se guardaron?).';
    return m;
  }

  function boot() {
    // Mostrar CUALQUIER error en pantalla (para no quedar con botones "muertos" sin explicación)
    window.addEventListener('error', (e) => showMsg('Error: ' + (e.message || e.error), 'err'));
    window.addEventListener('unhandledrejection', (e) => showMsg('Error: ' + (e.reason && e.reason.message || e.reason), 'err'));

    // Aviso SOLO si el entorno no permite cifrado seguro (ej. abrir como archivo local)
    const secure = window.isSecureContext;
    const hasCrypto = !!(window.crypto && window.crypto.subtle);
    if (!secure || !hasCrypto) {
      const warn = document.createElement('div');
      warn.className = 'gate-msg err';
      warn.style.marginTop = '12px';
      warn.innerHTML = '⚠️ Este entorno no permite cifrado seguro. Abre el dashboard desde su enlace <strong>https</strong> (GitHub Pages) o <strong>localhost</strong>, no como archivo local.';
      document.querySelector('.gate-card').appendChild(warn);
    }

    // precargar config guardada
    const saved = lsGet(LS_CFG);
    if (saved) { try { $('fbConfig').value = JSON.stringify(JSON.parse(saved), null, 2); } catch (e) {} }
    else { $('cfgDetails').open = true; }

    $('loginBtn').addEventListener('click', doLogin);
    $('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

    // Demo local (sin login) — solo si existen datos de muestra
    const demo = $('demoBtn');
    if (window.WB && !window.__noSeed) {
      demo.addEventListener('click', () => {
        try {
          startWith({ months: window.WB.months, monthsOrder: window.WB.monthsOrder, params: {}, overrides: {} }, false);
          enterApp('🔓 <strong>Modo demo local</strong> — datos de muestra, sin cifrado ni guardado. Para uso real, inicia sesión.');
          wireAppButtons(false);
        } catch (err) {
          showMsg('No se pudo abrir el demo: ' + (err && err.message || err), 'err');
        }
      });
    } else {
      demo.hidden = true; // en producción (GitHub) no hay datos de muestra: es lo esperado
    }
  }
  // Los scripts se cargan de forma dinámica, así que DOMContentLoaded pudo dispararse ya.
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
