# Cadáver exquisito — Validación y publicación

## Estado

Comprobaciones del 3 de noviembre de 2026, hora argentina, sobre la rama
`codex/cadaver-exquisito`, integrada por
[PR #54](https://github.com/RadikeCosa/juegos-familiares/pull/54).
Publicación productiva verificada: baseline funcional
`main@8a5ccbf4d912fdef5eecdd3d5e4b67869e02b80c`, Vercel
`dpl_5dChmp5VmjHWdNUsBxhuG6nxK2VS`, `READY`. Los commits documentales
posteriores no cambian esa baseline funcional.

La referencia productiva previa comprobada es `main@8ef518cee74d467f74b6800941577ec9548fdbff`,
Vercel `dpl_FhUd1Jrnk3unBQVpWvomAj4qWw4J`, `READY`, para
`https://juegos-familiares.vercel.app`. El Supabase vinculado es
`auytacgoahmqpgrkcdga`. En el preflight sólo había Rooms cerradas: 13 Impostor,
7 Tutti Frutti y 3 Diccionario; el esquema nuevo todavía no existía.

## Evidencia

- 845 tests de aplicación y contratos aprobados; TypeScript y build Webpack
  productivo aprobados. ESLint sin errores, con cinco avisos preexistentes.
- 116 controles de DB: 3/5/7 rondas, límites, fixtures Unicode compartidos,
  privacidad por actor/grupo, rechazo de `anon` y de identidades sin Player,
  grants, `search_path`, reintentos, pistas, abandono/regreso, sucesión,
  eliminación, vencimiento y cron.
- Carreras: envíos duplicados, envío/cancelación, abandono/envío, regresos
  simultáneos y barridos concurrentes con cierre y regreso. Un cierre
  completado conserva su historia; cancelar o vencer no retiene aportes.
- Migration completa aplicada desde una copia limpia del esquema local en
  una DB desechable adicional. Lint de `cadaver_private` y `public` con nivel
  `error` terminó con código 0, sin incidencias emitidas.
- Regresión DB de Diccionario: validador existente adaptado sólo al puerto y
  marcador desechables; 50 comprobaciones y ciclo concurrente de tres rondas.
  Impostor y Tutti Frutti conservan comprobaciones de entrada, recuperación,
  cierre y, para Impostor, inicio y espejo de sesión neutral.
- Realtime real: entrega a ocupantes, payload limitado a `room_id` y `version`,
  exclusión de quien sólo conoce el código, revocación en una suscripción ya
  abierta al abandonar y restauración al regresar.
- Chromium aislado a 390 × 844 con Auth real, alta anónima, creación de Group
  e incorporación por invitación; tres escritores y un lector del mismo grupo.
  Siete rondas, 21 aportes de 50 palabras, borrador tras reload, descarte al
  abandonar, regreso, revelación e historial para quien no escribió.
- Pérdida completa de red y recuperación; visibilidad oculta simulada durante
  31 segundos sin heartbeat y recuperación al volver. Invalidaciones Realtime
  observadas en las conexiones de los navegadores.
- Build productivo: service worker controlando la página y caché estática
  ejercitada, sin REST, RPC ni Auth en caché. Las rutas de sala aplazan la
  actualización PWA explícita igual que los juegos existentes.
- Portada inspeccionada a 390 y 1024 px: cuatro ilustraciones del mismo tamaño,
  fondo y paleta; hoja y lápiz para Cadáver exquisito. Sin errores de página ni
  desborde horizontal. El ícono es decorativo; el nombre y el enlace dan la
  información accesible.

No se ejecutó la suite DB global contra la instancia habitual, para preservar
sus datos y sus fixtures preexistentes. No se comprobó instalación en teléfono
físico ni suspensión real del sistema operativo. La emulación y los tests no
sustituyen uso real.

## Repetir las comprobaciones locales

Requiere Supabase local ya disponible, Docker, `psql`, `pg_dump` y las
dependencias instaladas. El preparador copia esquema y versiones internas de
Auth/Realtime, sin filas de usuarios, tenants, grupos ni partidas.

```bash
node supabase/scripts/cadaver-test-db.mjs start
npm run test:db:cadaver
node supabase/scripts/cadaver-test-services.mjs start
```

En procesos separados, iniciar el gateway y construir/servir con su configuración:

```bash
node supabase/scripts/cadaver-test-services.mjs gateway
node supabase/scripts/cadaver-test-services.mjs build
node supabase/scripts/cadaver-test-services.mjs serve
```

`smoke-cadaver-browser.mjs` acepta `CADAVER_REAL_AUTH=1` para alta y onboarding
reales; sin esa opción usa sesiones firmadas sintéticas. `PLAYWRIGHT_MODULE`
permite usar un runtime externo sin añadir una dependencia al producto.

```bash
CADAVER_REAL_AUTH=1 \
CADAVER_TEST_DB_URL=postgresql://postgres:cadaver-local-test@127.0.0.1:55433/postgres \
node supabase/tests/smoke-cadaver-browser.mjs

CADAVER_TEST_DB_URL=postgresql://postgres:cadaver-local-test@127.0.0.1:55433/postgres \
node supabase/tests/smoke-cadaver-realtime.mjs
```

Para ver las cuatro tarjetas en ese entorno, Diccionario debe estar habilitado
con un catálogo de prueba válido dentro de la DB desechable. Este smoke no
habilita juegos ni inserta contenido en instancias existentes.

Los validadores exigen loopback, puerto y marcador de DB; los servicios usan
nombres y etiquetas propios. Al terminar los procesos gateway/serve:

```bash
node supabase/scripts/cadaver-test-services.mjs stop
node supabase/scripts/cadaver-test-db.mjs stop
```

## Control de publicación y reversión

La entrega excluye los tres archivos pendientes de Tutti Frutti existentes al
comenzar; sus hashes se conservaron para comprobar integridad. No se modifican
migrations históricas, seeds, roles ni Vault. La única migration nueva del juego
es `20261103152511_cadaver_exquisito_v1.sql`.

Aplicar primero la migration autorizada, verificar esquema, permisos, cron y
advisors, y después publicar la aplicación del mismo alcance. Las comprobaciones
productivas deben ser de lectura y navegación sin crear fixtures de usuarios,
grupos o partidas.

Un rollback de frontend al build previo es viable mientras no haya Rooms activas
de Cadáver exquisito: ese frontend todavía no reconoce el nuevo `game_type`.
Con Rooms activas, preferir una corrección compatible; cualquier cierre o
eliminación requiere alcance y autorización específicos. No ejecutar rollback
destructivo de DB ni borrar historias para revertir una aplicación.

## Publicación productiva verificada

El usuario confirmó explícitamente commit, push, PR, merge, migration en
`auytacgoahmqpgrkcdga` y publicación de `juegos-familiares.vercel.app`.
El dry-run aislado y la aplicación incluyeron exclusivamente
`20261103152511_cadaver_exquisito_v1.sql`, sin seeds, roles ni Vault. No se
aplicó la migration pendiente de puntos finales de Tutti Frutti.

La última revisión previa al commit reemplazó caracteres de control literales
del SQL por escapes Unicode explícitos y añadió el caso CR/CRLF a los fixtures
compartidos. La repetición pasó con 845 tests y 116 controles DB. El contenido
staged pasó `git diff --cached --check`.

Verificación posterior a la migration:

- RLS activa en todas las tablas privadas; cero grants cliente sobre ellas.
- Ninguna RPC nueva ejecutable por `anon`; las diez RPCs previstas conservan
  ejecución autenticada, `SECURITY DEFINER` y `search_path` fijo.
- Señal publicada con sólo `room_id` y `version`; cron activo cada 15 minutos.
  La ejecución de las 16:30 UTC (13:30 Argentina) terminó `succeeded`.
- Cero Rooms del juego al aplicar; los conteos previos de los otros tres juegos
  se conservaron. Diccionario siguió habilitado con 300 entradas revisadas.
- Advisors de seguridad: 122 WARN antes y 130 después, sin ERROR. Aparecieron
  doce WARN relativos a las diez RPCs autoritativas y al modelo de identidad
  anónima autenticada; se revisaron contra grants, `auth.uid()` y pruebas de
  privacidad. Dejaron de aparecer cuatro avisos de ejecución `anon` sobre
  RPCs compartidas cuyo grant fue restringido. No se alteraron otros avisos.

La preview `dpl_FzEbikKmzuF74qwLzpdKpSdDyMNy` quedó `READY` para
`942a7793a1eafa627b4b34a2ead9c889584cd0e0`. Sus cinco rutas se comprobaron
bajo la protección de Vercel existente. GitGuardian y Vercel aprobaron la PR.

El merge funcional produjo el deployment
[de producción](https://juegos-familiares-awuoxsgy8-radikecosas-projects.vercel.app),
`dpl_5dChmp5VmjHWdNUsBxhuG6nxK2VS`, `READY`, con alias
[principal](https://juegos-familiares.vercel.app). Se comprobó la coincidencia
entre `main@8a5ccbf4d912fdef5eecdd3d5e4b67869e02b80c` y su metadata Git.

El smoke público con un navegador nuevo a 390 y 1024 px verificó `/`,
`/impostor`, `/tutti-frutti`, `/diccionario` y `/cadaver-exquisito`: HTTP 200,
sin errores de página ni desborde horizontal. La tarjeta y su ícono aparecen.
Las RPCs de estado, historial y lectura de historia devuelven 401 sin identidad;
la tabla de señales también rechaza lectura anónima. El documento fuente por
URL pública devuelve 404. Se bloquearon mutaciones Auth durante el smoke y no
se crearon identidades, grupos ni partidas productivas.

La consulta de logs del deployment, filtrada a `error`/`fatal` en los últimos
15 minutos, no devolvió registros. Esta ventana no constituye monitorización
continua ni verifica una partida completa en producción: ese flujo se probó en
el entorno local aislado con Auth y Realtime reales.

Los hashes de los tres archivos preexistentes de Tutti Frutti se conservaron.
Los servicios desechables se retiraron al terminar las comprobaciones.
