// firebase.js — Integración con Firebase (Auth + Firestore) cargando el SDK modular desde CDN.
// Guarda/lee un único documento por usuario con el blob cifrado. No hay datos en claro en el servidor.
(function (global) {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
  let mods = null, app = null, auth = null, db = null;

  async function loadSDK() {
    if (mods) return mods;
    const [appM, authM, fsM] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    mods = { appM, authM, fsM };
    return mods;
  }

  // config: objeto de configuración de Firebase (apiKey, authDomain, projectId, ...)
  async function init(config) {
    const { appM, authM, fsM } = await loadSDK();
    app = appM.initializeApp(config);
    auth = authM.getAuth(app);
    db = fsM.getFirestore(app);
    return true;
  }

  async function login(email, password) {
    const { authM } = mods;
    const cred = await authM.signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }

  async function logout() {
    const { authM } = mods;
    await authM.signOut(auth);
  }

  function currentUid() { return auth && auth.currentUser ? auth.currentUser.uid : null; }

  // Documento del usuario: colección "dashboards", id = uid
  function docRef() {
    const { fsM } = mods;
    return fsM.doc(db, 'dashboards', currentUid());
  }

  async function loadPayload() {
    const { fsM } = mods;
    const snap = await fsM.getDoc(docRef());
    return snap.exists() ? snap.data() : null; // { payload: {...cifrado...}, updatedAt }
  }

  async function savePayload(encPayload) {
    const { fsM } = mods;
    await fsM.setDoc(docRef(), { payload: encPayload, updatedAt: Date.now() });
  }

  global.FB = { init, login, logout, currentUid, loadPayload, savePayload };
})(window);
