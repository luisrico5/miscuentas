// crypto.js — Cifrado de extremo a extremo con Web Crypto (PBKDF2 + AES-GCM).
// Los datos se cifran en el navegador con una clave derivada de tu contraseña.
// En Firebase sólo se guarda { v, salt, iv, ct } (texto ilegible). Sin la contraseña no se puede descifrar.
(function (global) {
  const ITER = 200000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    // Convertir por bloques: un spread de un array grande desborda la pila ("Maximum call stack size exceeded")
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }
  function unb64(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); }

  function assertCrypto() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error('El cifrado requiere HTTPS (o localhost). Abre el dashboard desde su enlace de GitHub Pages, no como archivo local.');
    }
  }

  async function deriveKey(password, salt) {
    assertCrypto();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptJSON(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const data = enc.encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }

  async function decryptJSON(payload, password) {
    if (!payload || !payload.ct) throw new Error('No hay datos cifrados.');
    const salt = unb64(payload.salt);
    const iv = unb64(payload.iv);
    const key = await deriveKey(password, salt);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(payload.ct));
    } catch (e) {
      throw new Error('Contraseña incorrecta o datos corruptos.');
    }
    return JSON.parse(dec.decode(plain));
  }

  global.CRYPTOX = { encryptJSON, decryptJSON };
})(window);
