# Tutti Frutti — plan de implementación incremental

## Objetivo y estado de este plan

Introducir Tutti Frutti como segundo juego jugable de Juegos Familiares, desde
selección de juego hasta revancha en la misma Room, con estado autoritativo,
recuperación y privacidad por actor, sin alterar las reglas ni el cierre actual
de Impostor. Este documento organiza los cortes y registra su progreso; los
cortes futuros no describen funcionalidades ya implementadas ni autorizan por
sí mismos migrations remotas, deploys o cambios de producto.

**Estado del Incremento 0:** implementado y commiteado en
`codex/tutti-frutti-increment-0` (`9cbe941`). La regresión automatizada pasó
y el usuario confirmó el smoke manual de Impostor con tres identidades.

**Estado del Incremento 1 en `codex/tutti-frutti-increment-1`:** create/join
con tipo y ruteo mínimo implementados en la rama y aplicados sólo a Supabase
local. Los tests automáticos y validadores focales pasan. La suite DB agregada
requiere una base vacía y no corrió más allá de su precondición porque la DB
local contiene fixtures previos; no se reseteó. El usuario confirmó que completó
el smoke manual indicado para este corte. No se hizo push, deploy ni migration
remota. Producción mantiene su baseline anterior.

**Estado del Incremento 2 en `codex/tutti-frutti-increment-2`:** lobby
Tutti Frutti implementado en la rama y validado con Supabase local. Muestra
host y miembros desde `get_my_active_room()`, Presence sólo como indicador,
refetch al reconectar y acciones de salir/cerrar. El tópico Presence propio
comprueba membresía, juego y estado. Pasaron tests y validadores focales;
el usuario confirmó el smoke visual con dos identidades aisladas. No se aplicó
ninguna migration remota ni se agregó gameplay.

Las decisiones de producto vigentes están en `product-decisions.md`; fases en
`game-state-model.md`; límites en `room-session-boundary.md`; requisitos en
`technical-requirements.md`; el esquema de `physical-data-model.md` es una
**recomendación pendiente de validación contra datos reales**, no un contrato
SQL aplicado. Cada corte debe distinguir esas categorías antes de fijar una
migration. La baseline productiva registrada en `sources/project-status.md` es
Impostor en `main@7431605`; el estado de una DB remota no se inspeccionó para
este plan. La política de sucesión en `playing` está **CONFIRMED** en
`product-decisions.md`; la RPC Impostor versionada la implementa con
`session_players`, pero su despliegue no fue verificado.

## Baseline técnica comprobada en el repositorio

- `rooms` conserva Group, host, miembros y `lobby | playing | closed`; en la
  rama del Incremento 0 incorpora `game_type` inmutable.
  `player_active_room_slots` impone una Room activa por Player en
  toda la plataforma; `lobby` y `playing` son activos. Al volver de `playing`
  a `lobby`, el slot debe permanecer.
- Las firmas antiguas `create_room()` y `join_room_by_code(text)` permanecen
  exclusivas de Impostor. Las nuevas firmas reciben intención de juego y
  verifican tipo, Group, lobby y slot global; `get_my_active_room()` devuelve
  el tipo y las rutas actuales recuperan el juego correspondiente. Tutti
  Frutti aún no tiene lobby completo ni gameplay.
- `game_sessions` tiene `unique(room_id)` y fases de Impostor;
  `session_players` incluye datos propios de ese juego. `start_session()` crea
  roster, estado y primera ronda de Impostor; `end_session()` termina la
  sesión y cierra la Room. Esas tablas y RPCs siguen siendo de Impostor.
- Presence usa tópicos separados `impostor-room-presence:` y
  `tutti-frutti-room-presence:`, autorizados por juego y membresía, y liveness
  persistida en `room_participants.last_seen_at`. La UI relee estado autorizado al cargar,
  volver al foreground, recuperar red y recibir cambios; Realtime invalida,
  no autoriza. El RPC de sucesión tiene rama `playing` ligada al roster de
  `session_players`; esto es evidencia de código versionado, no de despliegue.
- Las migrations y validadores cercanos incluyen `create_rooms.test.ts`,
  `room_lifecycle_playing_6_2.test.ts`, `start_session_6_3.test.ts`,
  `supabase/tests/validate-4-1.mjs`, `validate-4-3.mjs`, `validate-5-2.mjs`,
  `validate-6-3.mjs`, `validate-12-5.mjs` y los tests de entrada, Room y
  recuperación en `app/impostor/` y `lib/supabase/impostor-rooms.test.ts`.

## Principios, corte y método

Room coordina juego inmutable, Group, host, membership, lifecycle y
conectividad. Cada juego posee fases, secretos, respuestas, votos y puntajes.
Presence no es participación: el roster se congela al iniciar cada sesión y
no cambia por desconexión. Una sesión terminada jamás se reutiliza. Tutti
Frutti termina su sesión y devuelve la Room a `lobby` en una operación;
Impostor conserva cierre de Room. No crear `GenericGame`, `GameEngine` ni
modelos de gameplay comunes. El servidor deriva actor de `auth.uid()`, aplica
RLS/grants/RPCs y comprueba Group, Room, tipo de juego, roster, ownership,
fase y host. El cliente envía intenciones y reconstruye lecturas autorizadas.

Cada incremento se implementará en una rama corta, con test focalizado y
validación proporcional en Supabase **local controlado**. Antes de su cierre:
auditoría del cambio, smoke indicado, documentación contractual que haya
cambiado y regresión de Impostor en todo corte compartido. Después podrán
seguir commit, push, PR y merge sólo con autorizaciones aplicables y revisión;
este plan no ejecuta esos pasos. No reescribir migrations históricas. Ningún
corte agrega persistencia legible/escribible por clientes antes de diseñar y
probar su RLS, grants, RPCs y privacidad. Los nombres SQL propuestos se
revalidan contra las migrations y datos del destino antes de ejecutarse.

## Mapa de dependencias

```text
0 tipo/descubrimiento → 1 create/join/rutas → 2 lobby
                    └→ 3 identidad/backfill → 4 espejo Impostor → 5 sucesión
2 → 6 configuración ────────────────────────────────┐
4, 5, 6 → 7 inicio/candidata → 8 skip → 9 respuestas
9 → 10 countdown/lock → 11 review → 12 desafíos → 13 score
13 → 14 siguiente ronda → 15 final/retorno → 16 revancha
2, 7–16 → 17 recuperación y cierre MVP
```

El corte 6 puede avanzar mientras se valida el backfill del 3. La política de
sucesión en `playing` ya está confirmada; el 5 requiere aún implementar y
validar el roster compartido, así como comprobar el deploy actual antes de
atribuirle comportamiento. El 7 no se libera como flujo jugable sin ese guard.
Los cortes 8 y 9 pueden diseñarse en paralelo después del 7, pero sólo se
integran respetando las fases. El 17 completa la verificación de una
recuperación construida desde cada corte.

## Incrementos

### 0. Identidad de juego y descubrimiento de Room

- **Goal:** una Room existente o nueva expresa inequívocamente su juego en
  lecturas autorizadas, sin abrir todavía creación Tutti Frutti.
- **Scope:** preflight sobre datos locales representativos y, antes de una
  migration de destino, conteos/invariantes del destino confirmado; agregar
  `rooms.game_type` restringido, backfill explícito de Rooms Impostor y
  `get_my_active_room()` con tipo. Mantener temporalmente el create sin
  argumentos y su compatibilidad; no convertir una Room ya creada.
- **Explicitly out of scope:** rutas Tutti, nuevas sesiones y cambio de
  `start_session()`/`end_session()`.
- **Likely files / areas:** nueva migration y test, validadores DB de Rooms,
  `lib/supabase/impostor-rooms.ts`, hook de Room activa.
- **Database impact:** columna, CHECK/no-null y backfill seguros; verificar
  grants de la lectura y compatibilidad de la firma/resultado RPC. Ninguna
  migration histórica se edita.
- **Application impact:** interpretar el tipo en el read model sin afectar
  navegación Impostor actual.
- **Security requirements:** tipo asignado por servidor; cliente no puede
  cambiarlo; descubrimiento sólo de la Room autorizada.
- **Concurrency / idempotency:** migration repetible en entorno controlado;
  create concurrente conserva un solo slot global y no cambia tipo.
- **Automated verification:** migration sobre Rooms abiertas/cerradas y
  sesiones Impostor existentes; CHECK rechaza valores ajenos; test de lectura
  y suite cercana de create/active room; **Impostor regression = PASS**.
- **Manual smoke:** crear/entrar a Impostor, refrescar, iniciar, reconectar y
  terminar; discovery sigue enviando a Impostor.
- **Documentation update:** arquitectura de plataforma y contrato de Room
  sólo cuando el cambio esté aplicado, con baseline/validación en status.
- **Exit criteria:** toda Room local tiene tipo inmutable y lecturas correctas;
  Impostor completa el smoke sin cambio de conducta.
- **Depends on:** contratos actuales y preflight de datos.
- **Does not depend on:** esquema de sesión común ni UI Tutti.

### 1. Create, join y ruteo conscientes del juego

- **Goal:** elegir juego antes de crear/entrar y recuperar la ruta correcta;
  todavía no hay partida Tutti.
- **Scope:** intención validada de juego en create/join, compatibilidad de
  llamadas Impostor existentes, conflicto explícito si el Player ya ocupa
  Room activa del otro juego; Game → create/join → ruta del juego.
- **Explicitly out of scope:** lobby Tutti completo, configuración, gameplay.
- **Likely files / areas:** migration RPC nueva, adaptadores Supabase,
  `app/page`, entrada `app/impostor/` y ruta Tutti mínima.
- **Database impact:** guards de tipo/Group/código/slot en create/join; RLS y
  grants existentes no se amplían sin pruebas; nueva firma si corresponde.
- **Application impact:** ruteo desde selección y active-room recovery por
  tipo, incluido código directo y conflicto visible.
- **Security requirements:** código de otro Group indistinguible de uno
  inexistente; no join cruzado por ruta manipulada ni segundo slot global.
- **Concurrency / idempotency:** create/join simultáneos entre juegos no
  producen dos Rooms; retry mismo juego converge, otro juego da conflicto.
- **Automated verification:** DB cross-group/cross-game, lobby-only join,
  carreras de slot; tests de ruteo/entrada y **Impostor regression = PASS**.
- **Manual smoke:** dos dispositivos crean Impostor/Tutti por separado,
  prueban código correcto/equivocado y refresh de Room activa; completar
  smoke Impostor de 0.
- **Documentation update:** flujo de entrada y contrato de Room si cambian.
- **Exit criteria:** ninguna ruta ni RPC confunde los tipos; Impostor sigue
  pudiendo crear, entrar y terminar como antes.
- **Depends on:** 0.
- **Does not depend on:** identidad compartida de sesión.

### 2. Lobby Tutti Frutti

- **Goal:** dos jugadores pueden compartir una Room Tutti y recuperar su
  coordinación, sin iniciar sesión.
- **Scope:** miembros, host, Presence/liveness, leave/close, carga directa,
  refetch en reconexión; tópico propio o adaptación autorizada del actual.
- **Explicitly out of scope:** configuración y sucesión en `playing`.
- **Likely files / areas:** `app/tutti-frutti/`, adaptador Tutti acotado,
  rutas/lecturas Room y tests; RPC de coordinación sólo si guard lo exige.
- **Database impact:** reutilizar `rooms`, `room_participants` y slots; si se
  toca Presence/RPC, preservar RLS y membership del tópico.
- **Application impact:** lobby mobile-first, host/participantes y recovery
  desde estado remoto; Presence sólo indicador visual.
- **Security requirements:** sólo miembros autorizados ven lobby/tópico;
  no heredar secretos ni payloads de Impostor.
- **Concurrency / idempotency:** leave/close repetidos y sucesión de lobby
  simultánea conservan un host válido o cierre consistente.
- **Automated verification:** acceso de outsider, close/leave, slot liberado
  sólo al cierre/salida permitida, navegación y reconexión; **Impostor
  regression = PASS** por tocar coordinación compartida.
- **Manual smoke:** crear, unir, ver host, desconectar/reconectar, salir y
  cerrar en dos identidades aisladas.
- **Documentation update:** flujo y requisitos de lobby según implementación.
- **Exit criteria:** lobby Tutti estable y Room activa se recupera por tipo.
- **Depends on:** 1.
- **Does not depend on:** identidad de sesión, categorías o juego iniciado.

### 3. Identidad mínima de sesión y backfill

- **Goal:** representar una sesión activa/histórica por Room y un roster
  neutral, sin modificar aún gameplay Impostor.
- **Scope:** validar alternativa recomendada A frente a datos reales;
  introducir `room_sessions` y `room_session_participants`, mapear sesiones
  Impostor históricas usando el mismo ID, verificar cardinalidad y tiempos.
- **Explicitly out of scope:** convertir fases, roles, votos o puntajes de
  Impostor; crear sesión Tutti; activar constraints que rompan un escritor
  todavía no adaptado.
- **Likely files / areas:** migration nueva, tests de contenido y DB,
  consultas de preflight/backfill; sin reemplazo de `game_sessions`.
- **Database impact:** FKs de Room/Group/tipo, unicidad de sesión no
  finalizada y roster; introducir restricciones de forma compatible,
  endurecerlas sólo después del corte 4 y validación de consistencia.
- **Application impact:** ninguno visible; la lectura de Impostor continúa
  en sus tablas existentes.
- **Security requirements:** nuevas tablas sin grants de cliente amplios,
  RLS desde su creación; roster histórico no expuesto a otro Group.
- **Concurrency / idempotency:** backfill estable por ID, sin duplicados;
  verificar escritura concurrente con Impostor durante rollout y plan de
  despliegue que evite sesiones huérfanas.
- **Automated verification:** fixture con sesiones abiertas/cerradas y datos
  inconsistentes; prueba de backfill, unicidad y accesos; **Impostor
  regression = PASS**.
- **Manual smoke:** Impostor abierto y terminado sigue legible; preflight y
  conteos coinciden antes/después en DB local controlada.
- **Documentation update:** modelo físico y status reflejan la decisión A
  sólo tras validarla; documentar desviaciones si el preflight la invalida.
- **Exit criteria:** mapeo uno a uno sin pérdida; las constraints compatibles
  y la ausencia de acceso no autorizado están demostradas.
- **Depends on:** 0 y preflight del destino concreto.
- **Does not depend on:** lobby Tutti (2), configuración ni gameplay.

### 4. Espejo transaccional de inicio/fin Impostor

- **Goal:** los nuevos starts/ends de Impostor mantienen el registro mínimo
  compartido sin cambiar la experiencia del juego.
- **Scope:** adaptar `start_session()` y `end_session()` para crear/finalizar
  `room_sessions` y roster junto con sus tablas actuales; endurecer los
  invariantes activos cuando todas las rutas de escritura estén cubiertas.
- **Explicitly out of scope:** reescribir `game_sessions`, nueva máquina de
  estados Impostor o cambiar `end_session()` a retorno lobby.
- **Likely files / areas:** migrations nuevas para RPCs, tests
  `start_session_6_3`/`end_session` y validadores 6.x/12.x.
- **Database impact:** mismo ID recomendado, FK/consistencia Room-Group-tipo,
  una sesión no terminada por Room; sin añadir gameplay a tabla común.
- **Application impact:** contrato de lectura Impostor idéntico.
- **Security requirements:** host y roster derivados del estado remoto;
  secretos y votos permanecen en tablas Impostor con sus permisos.
- **Concurrency / idempotency:** start concurrente produce un solo par de
  registros; end repetido finaliza ambos una vez y cierra Room en la misma
  transacción.
- **Automated verification:** DB start/finish/error rollback, igualdad de
  IDs/rosters, sin sesión huérfana y **Impostor regression = PASS** con suite
  de juego y privacidad.
- **Manual smoke:** Impostor completo de tres jugadores: iniciar, avanzar,
  reconectar, puntuar, finalizar; Room cerrada y slot liberado.
- **Documentation update:** contratos de arquitectura/estado sólo para el
  ownership compartido comprobado, nunca reglas Impostor.
- **Exit criteria:** ningún camino Impostor deja Room y sesión común
  divergentes; juego y cierre siguen iguales.
- **Depends on:** 3.
- **Does not depend on:** lobby/configuración Tutti.

### 5. Sucesión del host con roster neutral

- **Goal:** la sucesión en `playing` elige sólo miembros de la sesión activa
  sin depender de `session_players`.
- **Scope:** verificar la definición desplegada del RPC en el destino
  confirmado; adaptar el guard de sucesión al roster común, manteniendo lobby
  y la política CONFIRMED de `playing`; probar que sólo cambia host, nunca
  estado jugable.
- **Explicitly out of scope:** abandono definitivo, expulsión o cambio de
  roster por ausencia.
- **Likely files / areas:** migration RPC de sucesión, validador 5.x,
  `sources/project-status.md` para registrar la evidencia del deploy.
- **Database impact:** locks y elegibilidad por Room/member/roster; RLS y
  grants de RPC no se ensanchan.
- **Application impact:** refetch de host en Impostor y, luego, Tutti.
- **Security requirements:** no sucesor outsider, otro juego o no roster;
  Presence/`last_seen_at` sólo prueban liveness, no participación.
- **Concurrency / idempotency:** dos llamadas concurrentes eligen un único
  host según orden determinista y no reinician la sesión.
- **Automated verification:** host stale en lobby/playing, no-roster,
  outsider y carrera; **Impostor regression = PASS**.
- **Manual smoke:** host desaparece en lobby y durante Impostor; sucesor
  continúa; tras 7 repetir en Tutti.
- **Documentation update:** registrar el comportamiento desplegado sólo tras
  verificarlo; actualizar requisitos si la implementación difiere.
- **Exit criteria:** elegibilidad común probada, deploy verificado para el
  destino declarado e Impostor intacto.
- **Depends on:** 4 y verificación técnica del deploy/destino; la decisión de
  producto ya está confirmada.
- **Does not depend on:** configuración Tutti (6).

### 6. Configuración de lobby Tutti

- **Goal:** host guarda un borrador válido de rondas y categorías que todos
  pueden reconocer antes de iniciar.
- **Scope:** preset/custom, orden, cantidad de rondas, validación autoritativa
  y UI; el snapshot se hará en 7.
- **Explicitly out of scope:** sorteo, respuestas, preselección de revancha.
- **Likely files / areas:** `tutti_frutti_room_setup` o alternativa validada,
  RPC/lectura y UI de lobby, tests.
- **Database impact:** una configuración por Room, sólo editable en lobby;
  constraints de límites y nombres conforme decisión de producto.
- **Application impact:** formulario mobile-first con lectura recuperable.
- **Security requirements:** escritura host-only, lectura a miembros Tutti;
  otro juego, Group o Room no accede.
- **Concurrency / idempotency:** ediciones concurrentes con versión/guard;
  inicio posterior congela una versión completa, no mezcla campos.
- **Automated verification:** catálogo/límites/duplicados, host/no host,
  cross-room y reintento de guardado.
- **Manual smoke:** host edita, invitado ve cambios, refresh conserva draft;
  invitado no puede editar.
- **Documentation update:** catálogo, límites y UX realmente elegidos en
  producto/flujo; propuesta física si varía.
- **Exit criteria:** draft válido y estable; decisiones de catálogo/límites
  cerradas antes de la migration.
- **Depends on:** 2 y decisiones de categorías/rondas.
- **Does not depend on:** 3–5; puede avanzarse mientras se validan.

### 7. Inicio Tutti y primera letra candidata

- **Goal:** host inicia una sesión con mínimo dos jugadores y primera letra
  preparada, sin saltar ni responder aún.
- **Scope:** freeze transaccional de roster/configuración/pool, nueva sesión
  específica, primera ronda/candidata, `lobby → playing`; loader autorizado
  reconstruye fase y letra.
- **Explicitly out of scope:** voto de skip, entrada de respuestas y cierre.
- **Likely files / areas:** `tutti_frutti_sessions`, categorías, rondas y
  candidatas; RPC start, loader y UI de espera.
- **Database impact:** FK a sesión común, snapshot inmutable, restricciones
  de ronda/candidata y pool; migración local validada.
- **Application impact:** host start, otros reciben fase por refetch, ruta
  directa restaura sesión.
- **Security requirements:** host-only, tipo Tutti, roster Room vigente;
  configuración/pool no controlados por IDs del cliente.
- **Concurrency / idempotency:** lock Room; dos starts crean una sesión y
  una candidata, sin Room `playing` huérfana.
- **Automated verification:** mínimo 2, 1 jugador rechazado, tipo/host/Group,
  start doble, rollback y snapshot; Impostor regression = PASS por lifecycle.
- **Manual smoke:** dos jugadores inician, ven misma candidata y recargan;
  host sucesor del 5 conserva partida.
- **Documentation update:** flujo/estado físico si el inicio concreto difiere.
- **Exit criteria:** una Room playing tiene una sesión Tutti no finalizada,
  roster y snapshot inmutables.
- **Depends on:** 4, 5, 6 y decisión del pool de letras.
- **Does not depend on:** desafíos, puntuación o revancha.

### 8. Ventana y voto para saltar letra

- **Goal:** jugadores saltan una candidata por mayoría antes de comenzar la
  ronda; si no se alcanza, la misma candidata queda aceptada.
- **Scope:** ventana autoritativa, votos por candidata, dos jugadores ambos;
  siguiente candidata sin incrementar número de ronda; agotamiento de pool.
- **Explicitly out of scope:** respuestas y scoring.
- **Likely files / areas:** votos/candidatas, RPC de voto/avance, loader/UI.
- **Database impact:** unicidad candidato-letra por sesión y voto por
  candidato/jugador; reglas de fase y vencimiento en DB.
- **Application impact:** ventana visible y refresh desde reloj del servidor.
- **Security requirements:** voto sólo del roster Tutti; no votar candidato
  vencido ni elegir letra propia desde cliente.
- **Concurrency / idempotency:** mayoría y timeout simultáneos resuelven una
  sola vez; skip repetido nunca reutiliza letra jugada/saltada.
- **Automated verification:** umbrales 2/3/4, carreras, pool agotado, actor
  ajeno y candidato antiguo.
- **Manual smoke:** dos votan y salta; falta voto y arranca; recarga durante
  ventana muestra tiempo/candidata correctos.
- **Documentation update:** duración final elegida y política de elegibles.
- **Exit criteria:** ronda entra a respuesta con letra aceptada única.
- **Depends on:** 7 y decisión del tiempo de ventana/elegibilidad de skip.
- **Does not depend on:** respuestas, countdown o review.

### 9. Respuestas privadas y persistentes

- **Goal:** cada integrante del roster edita sus respuestas por categoría y
  las recupera antes del lock.
- **Scope:** texto original, valor normalizado determinista, upsert por
  ronda/Player/categoría, lectura sólo propia en fase de entrada.
- **Explicitly out of scope:** ver respuestas ajenas, lock y puntaje.
- **Likely files / areas:** `tutti_frutti_answers`, RPCs/lecturas privadas,
  formulario y tests de privacidad.
- **Database impact:** unicidad de clave, FK cruzadas de sesión/ronda/
  categoría/roster, RLS/grants deny-by-default.
- **Application impact:** guardado con error/retry explícito; refresh recupera
  último valor aceptado por servidor.
- **Security requirements:** autor único; ni select directo, RPC amplia ni
  Realtime filtran respuestas ajenas durante PLAYING.
- **Concurrency / idempotency:** último write aceptado bajo orden/versionado
  definido; duplicado de petición no crea segunda respuesta.
- **Automated verification:** actor propio/ajeno, no-roster, cross-room/game,
  privacidad de lecturas y payloads; unicidad y reconnect.
- **Manual smoke:** dos dispositivos escriben; ninguno ve respuestas del
  otro; reconexión restaura sólo las propias.
- **Documentation update:** privacidad y normalización decidida, con versión
  de regla de sesión.
- **Exit criteria:** aislamiento comprobado también en DB, no sólo en UI.
- **Depends on:** 8 y decisión de normalización mínima a persistir.
- **Does not depend on:** votación de desafíos ni scoring.

### 10. Llamada, countdown y lock

- **Goal:** la primera llamada válida fija un deadline irreversible; al
  vencer, todas las respuestas quedan bloqueadas una sola vez.
- **Scope:** elegibilidad de llamada, deadline servidor, edición hasta lock,
  proceso de vencimiento que progresa aun sin cliente conectado, lectura de
  tiempo restante y transición a review.
- **Explicitly out of scope:** cierre temprano por completitud/presencia si
  su política sigue abierta; desafíos y score.
- **Likely files / areas:** columnas de ronda, RPC call/lock, scheduler o
  avance autoritativo seguro, UI countdown, tests de carreras.
- **Database impact:** un deadline/trigger por ronda; guard de fase y locks
  de fila compartidos con writes; no confiar en temporizador del navegador.
- **Application impact:** contador calculado desde deadline remoto; refresh
  y foreground reconstruyen, incluido timeout ocurrido offline.
- **Security requirements:** caller del roster; nadie propone deadline o
  lock arbitrario; respuestas no se revelan hasta fase de review.
- **Concurrency / idempotency:** dos callers preservan primer deadline;
  edición vs lock se serializa; lock retry no cambia respuestas.
- **Automated verification:** doble llamada, caller incompleto según regla
  aprobada, deadline fijo, edición antes/después, vencimiento sin clientes,
  rollback y privacidad.
- **Manual smoke:** ambos editan durante countdown, recargan y observan
  mismo fin; write tardío rechazado.
- **Documentation update:** elegibilidad validada (todos los campos es aún
  hipótesis preferida), duración final y mecanismo de avance.
- **Exit criteria:** deadline y lock son únicos; progreso no depende de
  Presence ni de que el host mantenga abierta la página.
- **Depends on:** 9 y decisión sobre elegibilidad/duración de llamada.
- **Does not depend on:** política de cierre temprano; puede quedar fuera
  del primer MVP si se acuerda explícitamente ese alcance.

### 11. Lectura de review y duplicados provisionales

- **Goal:** tras lock, el roster ve respuestas de la ronda y posibles
  duplicados normalizados sin juicio semántico automático.
- **Scope:** lectura autorizada de respuestas ajenas sólo en REVIEWING,
  vacías/no vacías y grupos de coincidencia provisionales; UX de excepciones.
- **Explicitly out of scope:** invalidar respuestas, otorgar puntos.
- **Likely files / areas:** RPC/read model review, UI y tests de fase.
- **Database impact:** ninguna tabla de scores; lectura protegida por roster,
  fase y Room/tipo; evitar broad SELECT.
- **Application impact:** vista mobile de revisión y recarga idempotente.
- **Security requirements:** antes de review el mismo endpoint no revela
  datos; nuevo miembro de Room no hereda acceso a roster histórico.
- **Concurrency / idempotency:** lock y apertura de lectura tienen un orden
  único; lecturas repetidas no mutan estado.
- **Automated verification:** matriz de actores/fases, normalización básica y
  duplicados por categoría/ronda; cero fuga previa.
- **Manual smoke:** dos jugadores dejan un duplicado y un vacío; sólo tras
  lock ambos ven lo necesario para revisar.
- **Documentation update:** elección de presentación de review y regla de
  comparación aplicada.
- **Exit criteria:** excepción visible sin filtrar datos en fase anterior.
- **Depends on:** 10 y decisión de UX de review.
- **Does not depend on:** challenges ni score definitivo.

### 12. Desafíos y decisión social

- **Goal:** una respuesta no vacía puede impugnarse y resolverse con la
  regla de 3+ o acuerdo mutuo de 2, sin bloquear indefinidamente la ronda.
- **Scope:** creación, voto/acuerdo, quórum, empate válido, resolución;
  política explícita de elegibilidad/ausencia y orden de desafíos.
- **Explicitly out of scope:** diccionarios, IA y árbitro host.
- **Likely files / areas:** `tutti_frutti_challenges`, votos, RPCs, UI y
  tests de concurrencia.
- **Database impact:** claves únicas por desafío/votante, FK a answer y
  roster, estado final inmutable, RLS/grants privados.
- **Application impact:** sólo actores elegibles votan; UI reconstruye
  estado y resultado autorizado.
- **Security requirements:** autor excluido con 3+, acuerdo explícito de
  ambos con 2; outsider/no-roster no impugna ni vota; no publicar voto ajeno
  si la política de visibilidad no lo autoriza.
- **Concurrency / idempotency:** doble challenge/voto, último voto y timeout
  resuelven una sola vez; cambios de Presence no alteran quórum sin regla
  acordada.
- **Automated verification:** mayoría 3+, empate válido, 2 sin acuerdo
  válido, autor/no-roster/otro Group, desconexión y retries simultáneos.
- **Manual smoke:** disputa con tres jugadores y con dos; refresh durante
  votación; desconexión según política aprobada.
- **Documentation update:** elegibles, timeout/abstención, mecanismo de
  acuerdo de dos y secuencia UX elegidos.
- **Exit criteria:** todo desafío llega a resolución determinista; política
  de ausencia cerrada antes de implementar sus guards.
- **Depends on:** 11 y decisiones de elegibilidad/timeout/orden.
- **Does not depend on:** score o ronda siguiente.

### 13. Puntuación inmutable de ronda

- **Goal:** calcular 10/5/0 después de resolver desafíos y ofrecer totales
  reproducibles sin doble adjudicación.
- **Scope:** duplicados entre respuestas finalmente válidas, puntos por
  respuesta, marcador de ronda puntuada; totales/ranking derivados.
- **Explicitly out of scope:** tabla adicional de round scores, estadísticas
  históricas globales o siguiente ronda.
- **Likely files / areas:** RPC score, puntos en answers/ronda, read model
  result, tests de reglas.
- **Database impact:** snapshot de puntos y `scored_at` atómicos;
  inmutabilidad tras puntuación.
- **Application impact:** resultado explicable por respuesta y total.
- **Security requirements:** cliente no envía puntos/validez/duplicados;
  sólo roster autorizado ve resultados.
- **Concurrency / idempotency:** score concurrente o repetido devuelve
  mismos puntos; desafíos abiertos impiden score.
- **Automated verification:** único 10, duplicado 5, inválido/vacío 0;
  invalidar un duplicado vuelve único al restante; doble score sin suma.
- **Manual smoke:** revisar, resolver y ver resultado idéntico en dos
  dispositivos tras refresh.
- **Documentation update:** persistencia final de puntos si difiere del
  modelo propuesto.
- **Exit criteria:** historial de una ronda puntuada permanece estable.
- **Depends on:** 12.
- **Does not depend on:** segunda ronda ni final de sesión.

### 14. Siguiente ronda y agotamiento de letras

- **Goal:** continuar hasta la cantidad configurada con mismo snapshot de
  categorías y una letra nueva no usada.
- **Scope:** desde resultado de ronda, crear siguiente número/candidata;
  mantener letras jugadas y saltadas excluidas.
- **Explicitly out of scope:** resultado final y revancha.
- **Likely files / areas:** RPC de avance, rondas/candidatas, UI de transición.
- **Database impact:** unicidad número y letra por sesión; guard de máximo
  configurado y pool suficiente.
- **Application impact:** navegación/loader reanuda ronda actual.
- **Security requirements:** avance autorizado por regla acordada; cliente
  no elige letra ni altera snapshot.
- **Concurrency / idempotency:** dos avances crean una sola ronda; no saltar
  número ni duplicar letra.
- **Automated verification:** dos rondas, categorías iguales, letra no
  repetida, pool insuficiente y carrera de avance.
- **Manual smoke:** completar una ronda, iniciar otra y recargar; no cambia
  configuración ni historial.
- **Documentation update:** autoridad de avance si se define al implementar.
- **Exit criteria:** segunda ronda jugable y primera inmutable.
- **Depends on:** 13 y decisión de autoridad de avance si UI la requiere.
- **Does not depend on:** retorno lobby/rematch.

### 15. Resultado final y retorno a lobby

- **Goal:** después de la última ronda puntuada, la sesión queda FINISHED
  y la misma Room vuelve a `lobby` de forma indivisible.
- **Scope:** cierre autoritativo, read model de resultado final para roster
  histórico, conservación de RoomParticipants/slots; close Room separado.
- **Explicitly out of scope:** iniciar otra sesión y rediseñar cierre Impostor.
- **Likely files / areas:** RPC de cierre Tutti, sesiones/Rooms, pantalla
  final y read model de historial autorizado.
- **Database impact:** `finished_at` e invariantes de Room en una
  transacción; cero sesión no finalizada en lobby.
- **Application impact:** resultado visible, Room activa descubre lobby y
  puede mostrar acceso al resultado según UX aprobada.
- **Security requirements:** historial sólo a participantes autorizados de
  esa sesión, no a nuevos miembros o sólo por código.
- **Concurrency / idempotency:** final doble no cierra Room ni libera slots;
  fallo intermedio revierte sesión y Room; slot permanece al volver lobby.
- **Automated verification:** invariantes commit/rollback/retry, acceso a
  historia, slot persistente y **Impostor regression = PASS** en end/close.
- **Manual smoke:** última ronda → resultado → lobby; dos clientes recargan,
  host cierra Room aparte; completar también smoke fin Impostor.
- **Documentation update:** contrato de lifecycle y flujo de resultado
  implementado.
- **Exit criteria:** ninguna combinación `finished+playing` ni
  `unfinished+lobby`; Room conserva identidad y miembros.
- **Depends on:** 14 y decisión mínima de exposición de resultado/lobby.
- **Does not depend on:** política de revancha.

### 16. Revancha como sesión nueva

- **Goal:** desde la misma Room en lobby comenzar otra partida Tutti sin
  reusar estado, puntos o roster anterior.
- **Scope:** autoridad de inicio, draft/preselección aprobados, altas/bajas
  permitidas entre partidas, nuevo ID/roster/snapshot; historial anterior.
- **Explicitly out of scope:** cambiar juego de la Room, reabrir Room cerrada
  o migrar Impostor a varias partidas por Room.
- **Likely files / areas:** UI postgame/lobby, RPC start Tutti, draft,
  loaders de sesión reciente y tests.
- **Database impact:** múltiples sesiones finalizadas por Room y máximo una
  activa; slots existentes siguen globales.
- **Application impact:** lobby distingue nueva partida de resultado previo;
  recovery abre sólo la sesión activa.
- **Security requirements:** actor/host según política, roster nuevo desde
  Room actual; participante nuevo no lee datos privados previos.
- **Concurrency / idempotency:** dos rematches crean una sola sesión nueva;
  nunca resetean filas de la anterior.
- **Automated verification:** IDs distintos, roster cambiado según regla,
  snapshots/historial intactos, carrera y aislamiento histórico.
- **Manual smoke:** terminar partida, unirse/salir según política, jugar otra
  en misma Room y comprobar resultado anterior.
- **Documentation update:** autoridad, preselección, salidas y lobby final
  decididos en producto/flujo/estado.
- **Exit criteria:** segunda partida inicia en misma Room y primera es
  inmutable y accesible sólo a quien corresponde.
- **Depends on:** 15 y decisiones postgame indicadas abajo.
- **Does not depend on:** cambios al lifecycle Impostor.

### 17. Recovery, seguridad y cierre MVP

- **Goal:** demostrar el ciclo entero bajo fallos de red, concurrencia y
  permisos reales, sin introducir nuevas reglas.
- **Scope:** matriz de refresh, foreground, carga directa, pérdida de red y
  evento Realtime perdido en lobby, candidata, respuesta, countdown, review,
  desafío, score, resultado y revancha; sucesión de host en ambos juegos,
  incluido cambio durante countdown/review, retorno del host anterior y
  ausencia de sucesor; revisión mobile/PWA progresiva.
- **Explicitly out of scope:** offline completo para partidas sincronizadas,
  nuevas abstracciones generales y backlog UX no observado.
- **Likely files / areas:** tests focalizados faltantes, smokes DB/browser,
  adaptadores y UI sólo donde fallen los escenarios.
- **Database impact:** validar RLS/grants/RPCs y consistencia local completa;
  cambiar esquema sólo ante defecto concreto en su propio corte.
- **Application impact:** todos los loaders reconstruyen desde servidor;
  caché/Realtime son pistas, no estado autoritativo.
- **Security requirements:** matriz actor × juego × Group × Room × roster ×
  fase, especialmente respuesta ajena antes de review, votos y secretos
  Impostor; verificar payloads y acceso directo.
- **Concurrency / idempotency:** repetir create/start/skip/call/lock/vote/
  score/finish/rematch en clientes aislados y verificar unicidad e invariantes.
- **Automated verification:** tests DB de migrations y permisos, `npm test`,
  lint/build según cierre, validadores locales relevantes y regresión plena
  Impostor; reportar los no ejecutados.
- **Manual smoke:** ciclo completo Tutti de dos y de tres jugadores,
  interrupciones en fases críticas, sucesión, final/rematch; ciclo completo
  Impostor sin regresión; revisar tamaño mobile, lifecycle PWA y red.
- **Documentation update:** status, contratos específicos y limitaciones
  observadas; no convertir hipótesis no validadas en decisiones.
- **Exit criteria:** definición MVP siguiente satisfecha con evidencia;
  riesgos residuales documentados y auditoría cerrada.
- **Depends on:** 2 y 7–16; cada corte previo ya debe tener recovery básica.
- **Does not depend on:** features diferidas ni deploy a producción.

## Checkpoints de validación

| Punto | Evidencia mínima antes de avanzar |
| --- | --- |
| 0–1, superficie compartida | DB local: backfill/tipo, Group/slot, create/join concurrente; tests de rutas y smoke Impostor create→join→start→reconnect→finish. **Impostor regression = PASS**. |
| 2, lobby | Dos identidades: create/join, host/Presence, leave/close, refresh; outsider rechazado. **Impostor regression = PASS**. |
| 3–5, sesiones/host | Preflight del destino, backfill, espejo start/end y rollback; host stale en lobby/playing, no-roster y carrera. **Impostor regression = PASS** antes de 7. |
| 7–10, entrada | DB: roster/snapshot, letras/votos, escritura propia y privacidad, deadline/lock concurrentes. Browser: dos clientes, refresh y pérdida de red en cada fase. |
| 11–13, juicio | Lectura sólo tras lock; 2 y 3+ jugadores, desafío/voto concurrente, empate/acuerdo y score idempotente. |
| 14–16, ciclo | Rondas sin letra repetida, finish/lobby atómico con slot retenido, rematch nuevo e historial aislado; smoke Impostor end/close. |
| 17, cierre | Suite DB y app pertinente, auditoría de matriz de actores, smokes completos mobile/PWA y reporte de límites reales. |

Las pruebas DB deben ejecutarse contra Supabase local inequívocamente
identificado, incluyendo intentos no autorizados, constraints, RPC guards,
reintentos y carreras, no sólo el caso feliz. Antes de cualquier aplicación
remota, identificar destino, contrastar datos reales con preflight y obtener
autorización explícita separada. Cada incremento con cambios textuales cierra
con `git diff --check`.

## Decisiones abiertas, punto exacto de bloqueo

| Decisión pendiente | Bloquea | No bloquea |
| --- | --- | --- |
| Datos reales del destino, estrategia de backfill y alternativa A de sesión mínima | 3/4 y constraints estrictas | 0–2 con migración local segura; el remoto requiere preflight antes de aplicar |
| Catálogo, cantidad/límites de categorías, nombres duplicados y número permitido de rondas | 6/7 | 0–5 |
| Pool de letras y tratamiento de letras difíciles | 7/8 | 0–6 |
| Duración de ventana de skip (10 s es hipótesis) y elegibilidad si cambia conectividad | 8 | 0–7 |
| Normalización más allá de trim/case | 9/11/13 sólo si se pretende incluirla; si no, declarar versión mínima trim/case en 9 | 0–8 |
| Elegibilidad de llamada con todos los campos (hipótesis preferida) y duración de countdown (45 s hipótesis) | 10 | 0–9 |
| Cierre temprano al completar todos: elegibilidad con Presence cambiante y reversión de completion | Sólo implementación de ese guard; no se añade silenciosamente al 10 | Flujo con deadline como garantía de progreso |
| Presentación de review y desafíos secuenciales/paralelos | 11/12, respectivamente | 0–10 |
| Electores al desconectar, timeout/abstención, visibilidad de votos y acuerdo de dos | 12 y por dependencia 13–17 | 0–11 |
| Autoridad de avance a ronda siguiente | 14 si requiere acción de usuario | 0–13 |
| Acceso a resultado final tras salir y presentación mínima postgame | 15 en el read model/UX respectivo | 0–14 |
| Quién inicia revancha, preselección de configuración, salida entre partidas y lobby postgame | 16 | 0–15 |

La política de sucesión en `playing` está **CONFIRMED** y ya no bloquea 5 ni
el guard requerido por 7. Persisten las dependencias técnicas: 5 necesita 4,
roster común y verificación del deploy/destino; 7 necesita 4, 5, 6 y la
decisión del pool de letras. El 17 debe comprobar recovery y smoke de esa
política en ambos juegos. La comprobación del deploy es evidencia operativa,
no una nueva decisión de producto.

Una pregunta abierta bloquea **su guard o UX concretos**, no todos los
incrementos anteriores. Si el producto decide que el cierre temprano es
imprescindible para el MVP, definir su política antes de cerrar 10; de otro
modo documentar expresamente su exclusión del primer corte y verificar que el
deadline siempre progresa. No asumir que un desconectado deja de integrar el
roster ni que su ausencia concede un voto automático.

## Riesgos y auditoría prioritaria

Los cortes **0–1** son de alto riesgo por backfill de tipo, firmas de
create/join/discovery y slot único global. Los **3–5** son de alto riesgo por
mapeo histórico, doble escritura transaccional de Impostor y sucesión con
deploy no verificado; requieren auditoría de SQL, datos reales y regresión
Impostor antes de proseguir. Los **9–10** requieren auditoría de privacidad y
carreras entre escritura y bloqueo; 12–13, de elegibilidad concurrente y score
duplicado; **15–16**,
de finish/lobby atómico, slots e historia. En todos los casos comprobar
cross-group, cross-room, cross-game y no-roster. Realtime no transporta
respuestas privadas antes de review ni votos/secretos fuera de su lectura
autorizada. La recuperación se verifica al introducir cada fase y se vuelve
a recorrer en 17.

## Tutti Frutti MVP complete

Un jugador elige Tutti Frutti, crea o entra a una Room, reconoce host y
miembros, configura categorías/rondas y comienza con al menos dos jugadores.
Cada sesión congela roster/configuración, prepara letras sin repetir, admite
skip según mayoría, persiste respuestas privadas, fija un solo countdown y
bloquea una vez. Tras el lock, el roster revisa, impugna y decide con reglas
de 3+ y 2 jugadores; el sistema aplica 10/5/0 de forma idempotente, avanza
rondas y muestra un resultado final inmutable. La Room vuelve a lobby sin
perder miembros/slot; una revancha crea otra sesión. Refresh, desconexión,
foreground y eventos perdidos reconstruyen estado autorizado. RLS, grants,
RPCs, privacidad, carreras y smoke mobile están verificados en DB local y
navegadores aislados; la regresión completa de Impostor es PASS. Ninguna
operación de producción queda implícita en esta definición.
