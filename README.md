# Dashboard de Extras

Réplica web del dashboard financiero de Excel (`EXTRAS.xltm`), **editable con recálculo**,
alojada en **GitHub Pages sin datos**. La información vive **cifrada** en **Firebase** y sólo
aparece tras iniciar sesión. El cifrado es **de extremo a extremo**: los montos se cifran en tu
navegador con una clave derivada de tu contraseña (PBKDF2 + AES-GCM), así que en Firebase sólo hay
texto ilegible.

> ⚠️ **Importante:** la contraseña **es** la llave del cifrado. Si la olvidas, los datos guardados
> **no se pueden recuperar**. Guárdala en un lugar seguro.

---

## Arquitectura

| Pieza | Archivo | Qué hace |
|---|---|---|
| Datos de muestra (privado) | `assets/sample_data.js` | Tus datos actuales, para sembrar Firebase. **No se sube a GitHub** (ver `.gitignore`). |
| Motor de recálculo | `assets/calc.js` | Réplica de las fórmulas del Excel (divisor 210, primas por semestre, etc.). |
| Render del dashboard | `assets/dashboard.js` | KPIs, tablas, semáforos y gráficos. |
| Cifrado | `assets/crypto.js` | PBKDF2 (200k) + AES-GCM 256. |
| Firebase | `assets/firebase.js` | Auth (correo/contraseña) + Firestore (guarda el blob cifrado). |
| Orquestador | `assets/app.js` | Pantalla de acceso, login, descifrado y arranque. |

Los datos se guardan en Firestore en `dashboards/{tu-uid}` como `{ payload: <cifrado>, updatedAt }`.

---

## Configuración de Firebase (una sola vez)

1. En [console.firebase.google.com](https://console.firebase.google.com) crea (o usa) un proyecto.
2. **Authentication → Sign-in method →** activa **Correo electrónico/contraseña**. En la pestaña
   **Users**, crea tu usuario (correo + contraseña).
3. **Firestore Database →** crea una base de datos (modo producción).
4. **Firestore → Rules:** pega el contenido de [`firestore.rules`](firestore.rules) y publica.
5. **Project settings → General → Tus apps →** crea una app **Web** y copia el objeto
   `firebaseConfig` (apiKey, authDomain, projectId, appId…).
6. **Authentication → Settings → Authorized domains:** agrega el dominio de tu GitHub Pages
   (p. ej. `tuusuario.github.io`). `localhost` ya viene autorizado.

## Sembrar tus datos (una sola vez, en local seguro)

El cifrado y Firebase requieren un contexto seguro (**https** o **localhost**), no `file://`.

1. En esta carpeta ejecuta un servidor local:
   ```bash
   python -m http.server 8000
   ```
2. Abre `http://localhost:8000`, despliega **Configuración de Firebase**, pega tu `firebaseConfig`,
   ingresa tu correo/contraseña y pulsa **Entrar**.
3. Como aún no hay datos, aceptará **importar los datos de muestra** y los guardará **cifrados**.

## Publicar en GitHub Pages (sin datos)

1. Sube esta carpeta a un repo. El `.gitignore` ya excluye `assets/sample_data.js`, así que
   **el repo queda sin información**.
2. En el repo: **Settings → Pages →** rama `main`, carpeta `/root` (o `/dashboard`).
3. Abre tu URL `https://tuusuario.github.io/...`, inicia sesión y verás tus datos (descargados de
   Firebase y descifrados en tu dispositivo). Edita y pulsa **💾 Guardar** para volver a subirlos cifrados.

El mismo dashboard sirve para **otros proyectos**: sólo pega otra `firebaseConfig` y credenciales.
