# CLAUDE.md

Guía para trabajar en este proyecto. Léela antes de editar.

## Qué es

App web estática (HTML/CSS/JS puro, **sin framework, sin build**) que replica el dashboard
financiero de Excel `..\EXTRAS.xltm`. Se aloja en **GitHub Pages sin datos**; los datos van
**cifrados en Firebase** (Firestore) y se descifran en el navegador tras el login.

- Repo: https://github.com/luisrico5/miscuentas (público) · Sitio: https://luisrico5.github.io/miscuentas/
- El Excel original está en `c:\HE\EXTRAS.xltm` (fuente de verdad de la lógica y formatos).

## Estructura

```
index.html            gate de login + carga de scripts (orden importa)
assets/
  format.js    -> window.F     formato es-CO ($ #.###, %, etc.)
  template.js  -> window.TEMPLATE  plantilla EN BLANCO (sin datos). SÍ va al repo.
  sample_data.js -> window.WB   datos reales del dueño. GITIGNORED, NO va al repo.
  calc.js      -> window.CALC   motor de recálculo (réplica de fórmulas del Excel)
  dashboard.js -> window.DASH   render de vistas "Resumen" y "Editar mes" + gráficos SVG
  crypto.js    -> window.CRYPTOX  PBKDF2 + AES-GCM (Web Crypto)
  firebase.js  -> window.FB     Firebase Auth + Firestore (SDK modular por CDN)
  app.js       -> orquestador: login, descifrado, arranque (DASH.start), guardado
  styles.css   paleta del Excel + modo oscuro (data-theme)
firestore.rules   reglas: cada uid solo su doc en /dashboards/{uid}
```

Flujo: `app.js` (login) → descifra payload de Firestore → `DASH.start({wb, params, overrides, extra})`.
Sin datos remotos: usa `sample_data` (local) o `TEMPLATE` (GitHub). Guardar = `DASH.snapshot()` →
`CRYPTOX.encryptJSON` → `FB.savePayload`.

## Modelo de datos

- `wb.months[MES][COORD] = { v, f, nf }` — imita las celdas del Excel (v=valor, f=fórmula, nf=formato).
- La app lee celdas por coordenada, igual que el `INDIRECT` del Excel (ej. `D20`, `I28`, `Q4`).
- **Ediciones** = `state.overrides[MES][COORD] = valor` (convierte la celda en literal). `applyOverrides()`
  clona `wb` y aplica overrides antes de recalcular.
- **Conceptos extra** (botón +) = `state.extra[MES].d30 / .d15 = [{label,value,checked}]`.
- Pseudo-celda `I19q` = cantidad de "solidaridad sindical" (valor = C3/30 × I19q).
- **Multi-año**: `state.byYear[año] = {monthsOrder, months}` (años 2026-2028; los que faltan se generan en blanco con `blankYear(yy)` remapeando el sufijo, ej. "ENE 26"→"ENE 28"). `state.year` es el activo; `WB` apunta a `byYear[year]`. `paramsByYear[año]` guarda semX/deducción por año. Las claves de mes incluyen el año, así que `overrides`/`extra` quedan aisladas por año.
- `snapshot()` persiste `{ version:2, byYear, overrides, extra, paramsByYear }` cifrado. Compatibilidad: el formato antiguo `{months, monthsOrder, params, overrides, extra}` se carga como año 2026.

## Reglas de negocio (del Excel, con correcciones autorizadas)

- Valor/hora: `C3/210 × factor` (divisor **210** siempre; /220 y /235 eran errores).
- `D20` (ingreso mes) = C3 + Σ(F5:F13); `I28` flujo = E16 + E17.
- Quincenas (solo lectura en Editar mes): pago del 15 = C16 (C3×0.2667) − D16 (desc. 15) = E16; pago del 30 = C17 (C3×0.733) + F14 (horas extras) − D17 (desc. 30) = E17.
- Salud/Pensión = (C3+F14)×0.04; aporte sindical = C3×0.01; pólizas por defecto 15098 (editable).
- Prima: `D21 = (Σ D20 del semestre + X)/6`; `D22 = D21/2 − deducción`. X y deducción en `params`.
- Descuentos: total completo alimenta el Resumen; las casillas ✔ dan el **pendiente** (total − marcados).
- Deuda: total (I29) = Σ(saldo M17:M22 − abono ABr) recalculado en vivo (baja al abonar/editar). El "abono del mes" se guarda como override en pseudo-celda `AB{fila}`.
- Prima extralegal = D21/30*26 (fórmula del Excel D23); D21 = promedio semestral, así que se actualiza con salario/horas/X. Solo se muestra en el **2º semestre** (índice de mes ≥ 6), debajo de "Prima del semestre", junto a la Meta anual.

## Funciones extra (agregadas después del core)

- **Vista "Ajustes"** (`renderAjustes`): metas/alertas personalizables (`state.config` = {metaAnual, topeDeuda, umbralFlujo}, se mergea en los params de `computeAll`), respaldo cifrado (export/import .json) y exportar CSV / imprimir.
- **Autoguardado**: `markDirty()` llama `window.__onDirty` (definido en app.js como debounce de `saveNow`, solo si hay sesión). Aviso `beforeunload` si hay guardado pendiente. El botón "Guardar" muestra el estado.
- **Respaldo/CSV** (app.js → `window.APP`): `exportBackup` (snapshot cifrado con la contraseña), `importBackup` (descifra y `DASH.loadState`), `exportCSV` (usa `DASH.exportRows`).
- **Arrastre de deuda**: botón en Editar mes que copia el saldo actual (saldo−abono) al mes siguiente como `M{fila}` y pone `AB{fila}=0` (overrides).
- **Tendencia anual**: `lineChart()` SVG (un eje). Dos gráficos: ingreso/gastos/flujo y deuda (escala aparte).
- **Comparativa vs mes anterior**: `delta()` en calc → `gastosVar/flujoVar/deudaVar`; `deltaSmall(v, invert)` colorea (gastos/deuda: subir = rojo).
- **Preferencias** (localStorage `extras.pref.*`): tema y última vista. El mes/año sigue abriendo en el actual.
- `snapshot()` ahora incluye `config`. Formato guardado v2: {byYear, overrides, extra, paramsByYear, config}.

## Imágenes / íconos

`assets/img/image{1,2,4,5,7,...}.png` se extrajeron del Excel (`xl/media`) y se mapearon por nombre de shape (Imagen 7=ingreso, 11=ahorro, 49=flujo, 52=deuda, 1028=prima extralegal). Son genéricos (sin datos), SÍ van al repo. Cada KPI del Resumen muestra su ícono + una leyenda de estado con color por semáforo. Los íconos de KPI (`.kpi-ico`) miden 32px en móvil y **38px en computador** (`@media min-width:641px`).

## Ejecutar y probar

- **Local:** `python -m http.server 8000` dentro de `dashboard/`, abrir `http://localhost:8000`.
  Crypto + Firebase Auth requieren **https o localhost** (NO `file://`).
- **Botón "Ver demo local"**: solo aparece si existe `sample_data.js` (para probar sin login).
- **Pruebas headless** (Chrome real): usar `puppeteer-core` con
  `executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'`. Sirve para screenshots y
  para verificar cálculos/DOM. `jsdom` sirve para humo, pero NO detecta problemas de CSS/visibilidad.
  Ejemplo de patrón: cargar la página, click `#demoBtn`, luego evaluar/inspeccionar.
- Para validar el motor contra el Excel: cargar `format.js`+`sample_data.js`+`calc.js` en Node y
  comparar `CALC.computeAll(WB).<mes>` contra los valores cacheados del Excel.

## Gotchas (aprendidos a la mala)

- **Especificidad CSS**: la regla base `.row` (grid) va DESPUÉS en el archivo. Para filas flex usar
  `.row.m-row` / `.row.he-row` (especificidad 0,2,0), no `.m-row` solo, o `.row` gana.
- **`[hidden]`**: `.gate { display:grid }` (autor) le gana al `hidden` (UA). Existe la regla global
  `[hidden]{display:none!important}` — no la quites.
- **Base64 de bloques grandes**: `String.fromCharCode(...arr)` con arrays grandes desborda la pila
  ("Maximum call stack size exceeded"). `crypto.js` convierte por bloques de 0x8000. No revertir.
- **Valores calculados vs. guardados**: para celdas de fórmula (Salud, Pensión…) mostrar el valor
  CALCULADO (`state.base[m].I[r]`), no el `v` guardado (que puede estar en 0 en la plantilla).
- **`sample_data.js` NUNCA se sube.** Está en `.gitignore`. Verificar con `git status` antes de commit.

## Configuración externa

- Firebase: Auth correo/contraseña activo, usuario creado, Firestore con las reglas de
  `firestore.rules`, y `luisrico5.github.io` en **Authorized domains**.
- Publicar cambios: `git add -A && git commit -m "..." && git push` (Pages reconstruye solo).

## Commits

Terminar los mensajes de commit con:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
