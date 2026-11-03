# Diccionario — Implementación, despliegue y validación

## Estado de entrega

Primera versión integrada mediante [PR #48](https://github.com/RadikeCosa/juegos-familiares/pull/48)
y desplegada en Vercel Production el 2 de noviembre de 2026. El contrato aprobado
está en [planning.md](planning.md). La primera publicación dejó el flag apagado.
La revisión y los gates de activación se describen a continuación; el usuario
autorizó explícitamente publicación y habilitación productiva.

Incluye entrada y lobby, configuración, inicio, reservas, escritura, votación,
resultados, finalización, vencimiento, recuperación y revancha. Se conserva la
sucesión compartida sobre participantes de sesión neutrales.

La implementación agrega operaciones específicas de Diccionario; extiende el
tipo y la recuperación de Room y protege su ruta de sala ante una actualización
PWA. La señal Realtime contiene sólo una revisión opaca, con RLS por membresía.

## Evidencia automatizada

- Suite de aplicación sobre la baseline integrada: 819 tests aprobados.
- TypeScript: aprobado.
- ESLint: sin errores. La suite de tests conserva un aviso previo de una
  aserción no esperada con `await` en Tutti Frutti.
- Build de producción con Webpack: aprobado. La ejecución restringida devolvía
  salida vacía por `EPERM` al iniciar TypeScript; con permisos para ese proceso
  completó sin cambios de configuración.
- Migration ejecutada en una base descartable con copia del esquema local,
  sin copiar filas de usuarios ni modificar la base Supabase original.
- Validador DB: ciclo completo de tres rondas con envíos/votos simultáneos y
  duplicados, puntuación única, recovery y orden compartido estable.
- Privacidad: rechazo de lectura directa cliente de catálogo, definiciones,
  opciones, votos, reservas y settings; acceso por actor/grupo; señal filtrada
  por membresía y contenido autorizado por fase.
- Gate: 299 entradas sintéticas revisadas no habilitan; 300 válidas habilitan.
  Estos fixtures no representan revisión humana ni contenido editorial real.
- Reservas: salas concurrentes de un mismo grupo, agotamiento, liberación de
  palabras no mostradas y consumo de la primera palabra aunque se abandone.
- Regresión DB focalizada: create/join, recuperación de sala activa y cierre
  de Impostor y Tutti Frutti, además de entrada/salida propia de Diccionario.
- Lifecycle: límites 24/72 horas, heartbeat que no revive una sala vencida,
  sucesión sin candidato, regreso de un candidato y retorno del antiguo host.
- Resultados parciales e históricos protegidos después de revancha.

## Evidencia de navegador

Se recorrió el juego con tres contextos Chromium aislados a 390 × 844:
crear/unir, lobby, tres rondas, confirmaciones, auto-voto deshabilitado, orden
compartido, recarga durante votación y después del resultado, clasificación,
revancha y finalización anticipada sin rondas resueltas.

Se interrumpió el acceso REST de un cliente y se verificó su recuperación.
Las solicitudes tienen un límite de espera de 10 segundos; el polling visible
no acumula solicitudes propias y el mensaje de conexión se limpia al recuperar
estado. Los reintentos de escrituras conservan su intención original.

No se observaron errores de ejecución de página ni desborde horizontal en ese
recorrido. Se inspeccionaron capturas de escritura, votación y resultado.

La prueba usa sesiones JWT sintéticas firmadas para una API PostgREST y una DB
locales descartables. Comprueba autorización real por rol/actor y flujo de UI;
no sustituye el onboarding de Supabase Auth. La API de prueba no incluye
Realtime: la continuidad observada usa el polling de respaldo.

## Repetir validaciones DB

Con Supabase local ya iniciado, dependencias, Docker, `psql` y `pg_dump`:

```bash
node supabase/scripts/dictionary-test-db.mjs start
npm run test:db:dictionary
node supabase/scripts/dictionary-test-db.mjs stop
```

El preparador usa la imagen local existente, crea un contenedor descartable
identificado y copia exclusivamente esquema y permisos. No copia filas ni
resetea la instancia original. Si el nombre o puerto están ocupados, falla.
La eliminación exige el marcador del contenedor creado por este preparador.
El validador exige conexión loopback, puerto 55432 y marcador de base descartable.

La migration se instala sólo en esa base. Los fixtures y el flag se manipulan
allí; el validador restaura el flag apagado al salir.

`smoke-dictionary-browser.mjs` conserva el recorrido automatizado. Requiere un
runtime Playwright mediante `PLAYWRIGHT_MODULE`, aplicación local en 3107 y una
API REST de prueba en 55430 apuntando a la base descartable. Sus identidades y
firma son exclusivamente fixtures; nunca dirigirlo a una instancia real.

## Gates de habilitación — revisión asistida autorizada

El usuario autorizó expresamente sustituir revisión humana por revisión asistida
con fuentes, y dispositivo físico por navegador móvil emulado. No se presenta
esta evidencia como revisión humana ni prueba en un teléfono físico.

- Catálogo: 300 entradas contrastadas individualmente con DLE/RAE-ASALE;
  55 cambios, incluidas 20 sustituciones. Definiciones propias, estado `reviewed`,
  responsable Codex, modalidad asistida, fecha y referencias en cada registro.
  [Registro editorial](catalog/review.json) y [procedimiento](catalog/README.md).
- Integridad: prueba de 300 palabras únicas, normalización uniforme, límites,
  evidencias editoriales y coincidencia exacta entre JSON y migration generada.
- Aplicación: 821 tests aprobados; lint sin errores y cinco avisos preexistentes;
  build de producción Webpack y TypeScript aprobados.
- DB descartable: 50 aserciones y ciclo concurrente completo de tres rondas,
  incluyendo roles, lecturas directas, privacidad, reintentos, reservas,
  puntuación única, abandono y gate de 299/300 entradas.
- Integración local completa: Supabase separado en 55421/55422, con Auth, REST
  y Realtime reales. Tres identidades anónimas reales, contextos Chromium
  aislados a 390 × 844, usando el build de producción.
- Realtime: recepción directa y posterior resuscripción, verificadas sin depender
  del polling; payload limitado a `room_id` y `revision`. El recorrido también
  observó 78 eventos reales en las conexiones WebSocket de los navegadores.
  El observador admite los formatos objeto y array del protocolo.
- Navegador: tres rondas, orden estable tras recarga, desconexión total de red y
  recuperación, clasificación, revancha, sucesión visible y regreso del antiguo
  anfitrión tras finalización anticipada sin rondas resueltas.
- PWA: service worker de producción controlando la página y caché estática
  ejercitada, sin REST/RPC ni estado privado en caché. La visibilidad oculta
  se simuló durante 31 segundos: sin heartbeat; al volver, se recuperó actividad.
  No equivale a suspensión real de un sistema operativo móvil ni a instalación
  física de una PWA. Se inspeccionaron capturas y no hubo desborde horizontal
  ni errores de ejecución de página.
- Producción antes de activar: destino `auytacgoahmqpgrkcdga`, flag apagado,
  cero entradas y salas de Diccionario; barrido activo cada 15 minutos.
  Dry-run: sólo las dos migrations nuevas, sin seeds, roles ni Vault.

El smoke reproducible es `supabase/tests/smoke-dictionary-local-integration.mjs`.
Exige `DICTIONARY_LOCAL_ENV_FILE` obtenido de `supabase status -o env` en una
instancia separada, API loopback 55421, DB loopback 55422 y comentario de base
`dictionary-real-local-validation`. Exige catálogo cargado, flag activo y build
productivo conectado a esa API, servido en 3107. Usa `PLAYWRIGHT_MODULE` cuando
Playwright se proporciona desde un runtime externo. Crea exclusivamente fixtures
locales; nunca dirigirlo al Supabase habitual ni a producción.

La revisión asistida puede contener errores editoriales y conserva cierto sesgo
hacia objetos tradicionales. La dificultad deberá contrastarse con uso real.
No se amplió el alcance a los cambios pendientes de Tutti Frutti.

No se ejecutó `npm run test:db` completo: apunta al Supabase habitual y algunas
pruebas exigen fixtures iniciales. Se usó un entorno descartable para preservar
los datos locales. Las regresiones de aplicación sí se ejecutaron completas.

## Control de cambios

Se preservaron los archivos preexistentes del workspace original, incluidos
los cambios de Tutti Frutti y las decisiones de archivo documental de esta
tarea. La implementación vive en un worktree separado. La publicación posterior fue autorizada por el usuario y se ejecutó mediante
commit, push, PR #48, merge y despliegue Git de Vercel. Se aplicó exclusivamente
la migration de Diccionario al destino remoto confirmado. No se incluyeron seeds
ni se modificaron los datos de grupos o partidas existentes.

## Revisión previa a publicación — 2026-11-02

Se integró `origin/main@4e9c339` para conservar los códigos legibles y las fuentes
locales ya productivas. La revisión encontró una copia anterior de las RPCs de
entrada dentro de la migration de Diccionario: se reemplazó por la baseline de
códigos legibles, manteniendo normalización de acentos y separadores y el error
de agotamiento del generador. La entrada de Diccionario admite códigos largos.

Se añadieron regresiones de creación con códigos legibles y recuperación por
variantes normalizadas. La disponibilidad del juego es un booleano público,
sin datos de catálogo, y falla cerrada si falta su fila de configuración.
La migration tiene límites de espera para no retener locks de producción.

El destino se confirmó contrastando el Supabase vinculado con el origen usado
por los bundles públicos de `juegos-familiares.vercel.app`.

## Evidencia de publicación

- Fecha: 2026-11-02.
- Proyecto Vercel: `juegos-familiares`, equipo `radikecosas-projects`.
- URL pública: https://juegos-familiares.vercel.app
- Commit funcional: `9f0d97cb3bcfdb0570c7e42d81058d50b768fce5` (`main`, PR #48).
- Deploy productivo verificado: `dpl_Gjbed2HU8NT29wMo4W2gdLMVPJGq`, `READY`.
- URL del build: https://juegos-familiares-26znd9mdx-radikecosas-projects.vercel.app
- Preview validada: `dpl_FPAU4kdNBJWusbcWh1aD1j3f7v8T`, `READY`.
- Supabase: `auytacgoahmqpgrkcdga`, confirmado contra el origen de los bundles
  públicos del sitio, no sólo por el vínculo local de la CLI.
- Migration aplicada: `20261102205137_dictionary_v1`. El dry-run mostró sólo esa
  migration; la ejecución no incluyó seeds, roles ni cambios de Vault.
- Estado posterior: flag `false`, cero cartas, cero salas de Diccionario.
- RLS habilitada en todas las tablas privadas; clientes sin lectura directa de
  catálogo/opciones, sin ejecución anónima de estado y sin activación del flag.
- Normalización de códigos legibles conservada y comprobada remotamente.
- Cron `dictionary-expire-rooms` activo con `*/15 * * * *`. Primera ejecución
  programada: `2026-11-02T23:45:00.063129Z` a `23:45:00.121532Z`, estado
  `succeeded`. No había salas de Diccionario; esto comprueba el runner y la
  llamada real, no un cierre de partida con participantes en producción.

La API pública devolvió `200 / false` para disponibilidad, `401` al intentar
leer estado sin sesión y `406` al intentar seleccionar el esquema privado.
La fuente del catálogo no es accesible por URL (`404`). No se crearon usuarios,
grupos ni partidas de prueba en producción.

La preview protegida se probó con la autenticación existente de Vercel, sin
retirar su protección. `/`, `/impostor`, `/tutti-frutti` y `/diccionario`
devolvieron 200. En producción se recorrieron esas rutas con un contexto móvil
nuevo a 390 × 844: sin errores de página ni desborde horizontal, sin creación
de identidades y con Diccionario oculto en la portada. El escaneo de errores
runtime del despliegue en la ventana consultada devolvió cero registros; no
constituye monitorización continua.

### Avisos de seguridad y límites

Los advisors tenían 109 avisos antes y 122 después. Los 13 nuevos son WARN de
funciones `SECURITY DEFINER` ejecutables por los roles previstos y de políticas
compatibles con identidades anónimas autenticadas. La disponibilidad pública
sólo devuelve el booleano; las acciones sensibles derivan actor y pertenencia y
las lecturas privadas están protegidas. Las pruebas de grants y RLS pasaron.
No se detectaron nuevos ERROR. No se modificaron avisos preexistentes fuera de
alcance, incluida la configuración de contraseñas filtradas.

La publicación inicial incluyó código deshabilitado; la evidencia de esa
publicación no equivalía a aprobar el catálogo ni a cerrar los gates. La nueva
revisión asistida autorizada y los gates se registran arriba. Un rollback de aplicación puede usar el
build previo `dpl_5zJPN2JbHnKPTU8jHmXaPRKHBrNa`; la estructura nueva puede quedar
instalada y el flag apagado. No ejecutar un rollback destructivo de DB como
parte de una reversión de frontend.

## Activación productiva

Migrations nuevas y separadas:

1. `20261102235851_dictionary_reviewed_catalog`: carga las 300 entradas revisadas.
2. `20261102235852_dictionary_enable`: invoca la función interna con el gate
   autoritativo de 300 entradas. No modifica directamente el flag ni sus permisos.

La aplicación de estas migrations al destino autorizado y el estado posterior
se registrarán después de verificar la ejecución real.
