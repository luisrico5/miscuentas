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

  function wireAppButtons(loggedIn) {
    $('logoutBtn').hidden = !loggedIn;
    $('saveBtn').hidden = !loggedIn;
    if (loggedIn) {
      $('logoutBtn').onclick = () => { location.reload(); };
      $('saveBtn').onclick = doSave;
    }
  }

  async function doSave() {
    const btn = $('saveBtn');
    try {
      btn.disabled = true; btn.textContent = '💾 Guardando…';
      const snap = window.DASH.snapshot();
      const enc = await window.CRYPTOX.encryptJSON(snap, sessionPassword);
      await window.FB.savePayload(enc);
      btn.textContent = '✅ Guardado';
      setTimeout(() => { btn.textContent = '💾 Guardar'; btn.disabled = false; }, 1500);
    } catch (e) {
      btn.textContent = '💾 Guardar'; btn.disabled = false;
      alert('No se pudo guardar: ' + e.message);
    }
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
    window.DASH.start({
      wb: { monthsOrder: data.monthsOrder || (window.WB && window.WB.monthsOrder) || (window.TEMPLATE && window.TEMPLATE.monthsOrder), months: data.months },
      params: data.params || {},
      overrides: data.overrides || {},
      extra: data.extra || {},
    });
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
  window.addEventListener('DOMContentLoaded', boot);
})();
