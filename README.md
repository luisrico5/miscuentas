# Dashboard de Extras

Aplicación web que replica el dashboard financiero de Excel (`EXTRAS.xltm`): horas extras,
descuentos, deudas, ahorro y prima. **Editable con recálculo**, alojada en **GitHub Pages sin
datos**. La información vive **cifrada** en **Firebase** y solo aparece tras iniciar sesión.

- **Sitio:** https://luisrico5.github.io/miscuentas/
- **Repo:** https://github.com/luisrico5/miscuentas (público, sin datos personales)

> ⚠️ **La contraseña es la llave del cifrado.** Si la olvidas, los datos guardados **no se pueden
> recuperar**. Guárdala en un lugar seguro.

---

## Qué hace

- **Pantalla de acceso**: nadie ve nada sin autenticarse. Se pega el `firebaseConfig` + correo +
  contraseña. Reutilizable con otros proyectos de Firebase.
- **Selector de mes y año**: meses ENE–DIC y años **2026, 2027, 2028** (cada año guarda sus datos
  aparte; 2027/2028 arrancan en blanco). Encabezado compacto en móvil (2 filas, botones con ícono).
- **Vista "Resumen"** (solo lectura): réplica del RESUMEN del Excel para el mes seleccionado.
  KPIs con los **íconos del Excel** y su **leyenda de estado debajo** (buen camino / ahorro saludable /
  flujo positivo, y endeudamiento en la tarjeta de Deudas), dona de distribución, medio círculo de
  meta de ahorro, y **prima del semestre** (con **prima extralegal** debajo, solo en 2º semestre).
  Colores fieles al Excel + modo oscuro. Los íconos de KPI son 20% más grandes en computador.
- **Vista "Editar mes"** (editable, recalcula en cascada):
  - **Salario base** editable (con "aplicar a todos los meses").
  - **Horas extras**: cantidades editables; el valor/hora y totales se calculan (divisor 210).
  - **Ahorro** del mes (pesos y dólares).
  - **Deudas** editables.
  - **Descuentos del 30 y del 15**: valores editables, casillas ✔ que restan del total para ver lo
    **pendiente**, y botón **"＋ Agregar concepto"** para añadir filas propias.
  - **Salud / Pensión / aporte sindical / pólizas**: se mantienen como **fórmulas** del Excel y se
    recalculan solos (pólizas es editable).
  - **Solidaridad sindical**: control **−/＋** con valor = salario ÷ 30 × cantidad.
  - **Prima**: valor X del semestre editable.
- **Cuenta nueva sin datos**: arranca con una **plantilla en blanco** (sin datos personales).
- **Cifrado de extremo a extremo**: los montos se cifran en el navegador (PBKDF2 + AES-GCM 256);
  en Firebase solo hay texto ilegible.

## Correcciones respecto al Excel (autorizadas)

- Divisor de valor/hora unificado a **210** (los `/220` y `/235` eran errores).
- **Prima**: base = (suma de los 6 totales mensuales del semestre + valor **X**) ÷ 6; prima =
  (base ÷ 2) − deducción. La X la define el usuario por semestre.
- Formato de **moneda colombiana** (`$ #.###`) en los campos monetarios.

---

## Arquitectura

| Capa | Detalle |
|---|---|
| Frontend | HTML + CSS + JS puro, estático, en **GitHub Pages**. **Sin datos.** |
| Auth + BD | **Firebase** Authentication (correo/contraseña) + **Firestore** |
| Cifrado | **Web Crypto**: PBKDF2 (200k) + AES-GCM 256, clave derivada de la contraseña |

Los datos se guardan en Firestore en `dashboards/{tu-uid}` como `{ payload: <cifrado>, updatedAt }`.

### Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Estructura + pantalla de acceso |
| `assets/format.js` | Formato de números (es-CO: miles con punto) |
| `assets/template.js` | **Plantilla en blanco** (sin datos) — se usa en cuentas nuevas. **Sí va al repo.** |
| `assets/sample_data.js` | Datos reales del dueño para sembrar. **NO va al repo** (ver `.gitignore`). |
| `assets/calc.js` | Motor de recálculo (réplica de las fórmulas del Excel) |
| `assets/dashboard.js` | Render de "Resumen" y "Editar mes", gráficos, interacción |
| `assets/crypto.js` | Cifrado/descifrado AES-GCM |
| `assets/firebase.js` | Init de Firebase + Auth + Firestore (SDK modular por CDN) |
| `assets/app.js` | Orquestador: login, descifrado, arranque, guardado |
| `assets/styles.css` | Estilos (paleta del Excel + modo oscuro + responsive) |
| `assets/img/` | Íconos del Excel (semáforos/prima) extraídos del archivo original. Genéricos, sin datos. |
| `firestore.rules` | Reglas de seguridad de Firestore |

---

## Configuración de Firebase (una sola vez)

1. En [console.firebase.google.com](https://console.firebase.google.com) crea (o usa) un proyecto.
2. **Authentication → Sign-in method →** activa **Correo electrónico/contraseña**. En la pestaña
   **Users**, crea tu usuario (correo + contraseña). Si ya tenías uno, se recomienda **crear otro
   dedicado** para este dashboard.
3. **Firestore Database →** crea la base de datos (modo producción).
4. **Firestore → Rules:** agrega el bloque de [`firestore.rules`](firestore.rules) **dentro** de tu
   `match /databases/{database}/documents { … }` (junto a tus otras reglas, sin duplicar
   `rules_version` ni `service`). Publica.
5. **Project settings → General → Tus apps → Web →** copia el objeto `firebaseConfig`
   (apiKey, authDomain, projectId, appId…).
6. **Authentication → Settings → Authorized domains →** agrega **`luisrico5.github.io`**
   (necesario para que el login funcione en el sitio publicado). `localhost` ya viene autorizado.

## Sembrar tus datos (una sola vez, en local)

El cifrado y Firebase requieren **https** o **localhost** (no `file://`).

```bash
cd dashboard
python -m http.server 8000
```
Abre `http://localhost:8000`, pega tu `firebaseConfig`, ingresa correo/contraseña y **Entrar**. Como
no hay datos, aceptas **importar los de muestra** y se guardan cifrados. (En el sitio de GitHub, al
no existir `sample_data.js`, una cuenta nueva arranca con la **plantilla en blanco**.)

---

## Cómo actualizar el sitio (hacer un commit)

El sitio se reconstruye solo cada vez que haces `push` a la rama `main`.

```bash
cd c:/HE/dashboard
git add -A
git commit -m "Describe tu cambio aquí"
git push
```

Tras el push, GitHub Pages reconstruye en ~1-2 min. Puedes ver el estado en el repo:
**Settings → Pages** o en la pestaña **Actions**.

> `sample_data.js` está en `.gitignore`, así que **nunca** se sube por accidente. Verifica con
> `git status` que no aparezca antes de confirmar.

## Publicar desde cero (si algún día se recrea)

```bash
cd dashboard
git init && git add -A && git commit -m "primer commit"
git branch -M main
gh repo create miscuentas --public --source=. --remote=origin --push
gh api --method POST repos/<usuario>/miscuentas/pages -f "source[branch]=main" -f "source[path]=/"
```

Luego agrega `<usuario>.github.io` a **Authorized domains** en Firebase.

---

## Seguridad

- Cifrado E2E: ni Firebase ni nadie con acceso a la base puede leer tus montos sin la contraseña.
- Las reglas de Firestore permiten a cada usuario leer/escribir **solo su** documento (`uid`).
- El repositorio es público pero **no contiene datos** (estructura y lógica solamente).
- Si cambias la contraseña del usuario en Firebase, deberás **re-cifrar** los datos (la contraseña
  vieja ya no los descifra).
