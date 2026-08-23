# Juegos Familiares — Plan de implementación incremental

## Propósito

Este documento convierte el corpus conceptual de `sources/` en un plan de implementación por incrementos verticales.

El objetivo no es definir todo el sistema por adelantado ni construir capas horizontales aisladas. El objetivo es avanzar con pasos pequeños, verificables y jugables, manteniendo la simplicidad del MVP.

El primer juego es `Impostor`.

Juegos Familiares es la aplicación contenedora.

---

# 1. Corpus utilizado

Este plan parte de los documentos vigentes:

```text
sources/
├── project-principles.md
├── architecture.md
├── platform/product-brief.md
└── games/impostor/
    ├── conceptual-data-model.md
    ├── game-rules.md
    ├── game-state-model.md
    ├── product-brief.md
    ├── product-decisions.md
    ├── technical-requirements.md
    └── user-flow.md
```

Se consideran especialmente estables estas decisiones:

* mobile-first;
* PWA progresiva;
* TypeScript;
* Supabase como backend gestionado;
* Supabase Auth para identidad liviana/anónima;
* Postgres como persistencia;
* RLS para autorización;
* Realtime y Presence solamente cuando el producto lo necesite;
* separación entre plataforma compartida e Impostor;
* evitar abstracciones genéricas para juegos futuros.

---

# 2. Estado del proyecto antes de implementar

El proyecto todavía está en etapa documental.

La carpeta raíz del proyecto es:

```text
~/dev/juegos-familia/
```

Esa carpeta debe ser la única raíz para:

* repositorio Git;
* proyecto Node/frontend;
* código;
* tests;
* configuración;
* documentación `sources/`.

No debe crearse una estructura anidada como:

```text
juegos-familia/juegos-familia
```

Tampoco debe moverse ni reemplazarse `sources/`.

---

# 3. Decisiones mínimas para poder empezar

Estas decisiones conviene cerrar antes del Incremento 0.

## Framework frontend

Propuesta: formalizar `Next.js` con TypeScript.

Motivo:

* encaja naturalmente con las rutas conceptuales `/` e `/impostor`;
* permite construir una PWA mobile-first sin backend propio inicial;
* convive bien con Supabase;
* favorece incrementos verticales visibles;
* mantiene React, UI y lógica de cliente en un entorno conocido;
* no obliga a decidir todavía hosting, tablas, RPCs ni estrategia realtime final.

Esta propuesta no implica comparar extensamente frameworks ni reabrir Supabase.

## TypeScript

Decisión: usar TypeScript desde el inicio.

Motivo:

* ya está decidido en arquitectura;
* ayuda a expresar entidades y reglas de dominio;
* permite tests de reglas más claros;
* reduce ambigüedad en transiciones de estado, permisos y resultados.

## Package manager y tooling

Propuesta: usar `npm` al inicio.

Motivo:

* es suficiente para el MVP;
* viene con Node;
* reduce decisiones accesorias;
* permite cambiar más adelante solo si aparece una necesidad real.

Tooling inicial esperado:

* TypeScript;
* lint;
* formateo consistente;
* script de desarrollo local;
* script de build;
* script de test mínimo.

No conviene incorporar tooling de monorepo, generadores complejos ni pipelines avanzados en esta etapa.

## Testing inicial

Propuesta:

* empezar con tests unitarios de dominio usando un runner liviano compatible con TypeScript;
* incorporar tests de componentes cuando existan flujos visuales relevantes;
* incorporar e2e cuando haya interacciones entre pantallas o dispositivos simulables;
* incorporar validaciones manuales en teléfonos reales desde los primeros incrementos mobile.

No todos los incrementos necesitan todos los tipos de test.

El principio es probar la parte riesgosa del incremento, no construir una matriz de testing completa antes de tener producto.

## Estructura mínima del repositorio

La estructura debe aparecer cuando haya código real que la necesite.

Orientación conceptual:

```text
app/
├── page
└── impostor/

domain/
└── impostor/

lib/

components/

sources/
```

Criterios:

* `app/` contiene rutas y composición de experiencia;
* `domain/impostor/` contiene reglas puras del juego;
* `lib/` contiene integración o utilidades concretas cuando existan;
* `components/` contiene UI reutilizada cuando exista reutilización real;
* no crear carpetas vacías para capas futuras;
* no crear `GameEngine`, `GenericGame` ni abstracciones equivalentes.

## Estrategia inicial con Supabase

Supabase no debe incorporarse en el Incremento 0.

Debe entrar cuando exista una necesidad real de:

* identidad compartida;
* persistencia remota;
* autorización;
* sincronización entre dispositivos.

Introducción progresiva esperada:

1. Supabase Auth liviana/anónima para identidad técnica.
2. Postgres para `Group`, `Player` y `GroupWord`.
3. RLS para permisos de grupo, integrante y autor de palabra.
4. Estado operativo de sala y tanda cuando haya lobby real.
5. Realtime para propagación de cambios compartidos.
6. Presence para conexión/desconexión y sucesión de host.

Realtime no debe aplicarse a todo por defecto.

La decisión concreta entre Postgres Changes, Broadcast u otra opción dentro de Supabase se cierra en el incremento donde se necesite sincronizar ese caso.

---

# 4. Workflow Git

El workflow debe ser simple.

## Decisión

* `main` representa estado estable.
* No se trabaja directamente sobre `main` para cambios funcionales.
* Cada incremento se desarrolla en una rama corta y coherente.
* Usar prefijos simples como `feature/`, `fix/` o `docs/`.
* No usar GitFlow completo.
* No crear ramas permanentes `develop`, `release/*` ni `hotfix/*`.

## Incremento 0 y Git

El Incremento 0 debe:

* verificar que `~/dev/juegos-familia/` sea la raíz única;
* inicializar Git ahí si todavía no existe un repositorio válido;
* preservar `sources/`;
* dejar una línea base estable en `main`;
* documentar brevemente el workflow;
* preparar el primer cambio funcional en una rama aislada.

Si aparece una carpeta `.git` inválida o incompleta, debe resolverse explícitamente antes de continuar. No debe borrarse ni reemplazarse nada de forma implícita.

---

# 5. Hitos del plan

## Hito A — Base ejecutable e instalación temprana

La aplicación existe, abre en mobile, muestra la entrada a Juegos Familiares e Impostor y tiene una primera capa PWA instalable/standalone cuando la plataforma lo permita.

Incluye incrementos 0 y 1.

## Hito B — Plataforma mínima compartida

Existe identidad liviana, grupo, jugador y banco de palabras persistente con permisos básicos.

Incluye incrementos 2 y 3.

## Hito C — Sala real

Varios teléfonos pueden entrar a una misma sala, verse en lobby y reconocer host.

Incluye incrementos 4 y 5.

## Hito D — Primera tanda jugable

El grupo puede jugar una tanda completa de Impostor con rondas, votos, desempate, intento final del impostor, marcador, nueva ronda y cierre.

Incluye incrementos 6 a 12.

Este hito marca el:

```text
PRIMER MVP JUGABLE
```

## Hito E — Robustez y PWA

La experiencia se endurece para refresh, reconexión básica, lifecycle móvil, service worker, cache apropiado, actualización, iOS, Android, seguridad, pruebas y pulido UX.

Incluye incrementos 13 a 15.

---

# 6. Incrementos

## Incremento 0 — Fundación del proyecto

### Objetivo

Crear una base ejecutable mínima en la raíz existente del proyecto, sin perder documentación ni crear proyectos anidados.

### Resultado observable

Al abrir la aplicación en desarrollo se ve una primera pantalla simple de Juegos Familiares en un viewport mobile.

La carpeta `sources/` sigue intacta.

Existe una línea base estable del repositorio.

### Dominio involucrado

Plataforma solamente.

No se implementan todavía reglas de Impostor.

### Infraestructura necesaria

* repositorio Git en la raíz única;
* proyecto frontend inicial;
* TypeScript;
* lint;
* test mínimo;
* estructura mínima real;
* base mobile-first compatible con una futura capa PWA.

### Decisiones técnicas a cerrar

* confirmar Next.js como framework inicial;
* confirmar `npm`;
* elegir runner mínimo de tests unitarios;
* definir cómo inicializar Next.js en una carpeta existente sin sobrescribir `sources/`;
* definir estructura inicial mínima sin carpetas especulativas;
* decidir nombre visible inicial: `Juegos Familiares` y juego `Impostor`.

### Tests / validación

* el proyecto instala y arranca localmente;
* el build inicial pasa;
* lint inicial pasa;
* un test mínimo pasa;
* revisión visual manual en viewport mobile;
* comprobar que `sources/` no fue modificada por herramientas de scaffolding.

### Riesgos

* crear accidentalmente un proyecto anidado;
* sobrescribir archivos existentes;
* introducir demasiada estructura vacía;
* configurar PWA completa, service worker o cache antes de tener necesidades reales;
* dejar Git en estado ambiguo si existe una carpeta `.git` inválida.

### Fuera de alcance

* Supabase;
* autenticación;
* base de datos;
* realtime;
* service worker;
* cache;
* pantallas reales de Impostor;
* diseño visual definitivo;
* CI/CD;
* hosting.

### Criterio de terminado

El proyecto tiene una base frontend ejecutable, versionada, mobile-first, con TypeScript, lint y test mínimo, creada en la raíz correcta y sin afectar la documentación.

### Conceptos a aprender

* raíz de repositorio;
* diferencia entre documentación, código y configuración;
* scaffolding seguro en carpeta existente;
* TypeScript mínimo;
* scripts de desarrollo;
* lint y test como red temprana;
* base PWA frente a PWA completa.

---

## Incremento 1 — Portada de plataforma y entrada a Impostor

### Objetivo

Construir la primera navegación real: portada de Juegos Familiares y entrada al juego Impostor, incorporando la primera capa PWA instalable sin adelantar service worker ni cache de partida.

### Resultado observable

Desde `/` se ve Juegos Familiares con Impostor disponible.

Desde `/impostor` se ve una pantalla inicial de Impostor sin flujo jugable todavía.

La aplicación tiene manifest, iconos mínimos, metadatos y configuración básica para comportarse como web app instalada/standalone cuando el navegador o plataforma lo soporte.

### Dominio involucrado

Plataforma:

* navegación;
* shell mobile;
* listado de juegos disponibles.

Impostor:

* entrada conceptual al juego.

### Infraestructura necesaria

Solo frontend local.

No requiere Supabase.

Incluye:

* manifest inicial;
* iconos mínimos;
* metadata de aplicación;
* `start_url`;
* `display`;
* colores básicos de apariencia;
* configuración necesaria para experiencia standalone/mobile sin cache de datos.

### Decisiones técnicas a cerrar

* estructura de rutas;
* layout mobile base;
* primera convención de componentes;
* alcance exacto de la primera capa PWA sin service worker;
* punto de entrada para futura UX de identidad.

### Tests / validación

* prueba de render de portada;
* prueba de navegación a Impostor;
* validación manual en ancho mobile;
* validación inicial de manifest, iconos y metadata;
* validación manual de experiencia standalone/mobile cuando sea técnicamente viable;
* validar que la app pueda instalarse cuando el navegador/plataforma lo soporte sin introducir service worker complejo;
* revisar que Tutti Frutti aparezca, si aparece, solo como futuro y sin dominio propio.

### Riesgos

* convertir la portada en landing page de marketing;
* diseñar navegación genérica para juegos futuros inexistentes;
* sobrediseñar visualmente antes de validar flujo;
* confundir instalación temprana con PWA offline;
* cachear datos antes de modelar identidad, sala, palabra secreta, rol, votos y vistas privadas.

### Fuera de alcance

* crear grupo;
* sala;
* palabras;
* reglas de Impostor;
* service worker;
* estrategia de cache;
* soporte offline;
* diseño visual final;
* Figma.

### Criterio de terminado

Un usuario puede abrir la app, entender que está en Juegos Familiares, entrar a Impostor y probar una primera experiencia web app instalable/standalone cuando su navegador o plataforma lo permita.

### Conceptos a aprender

* rutas de aplicación;
* composición mobile-first;
* separación entre plataforma y juego;
* navegación mínima verificable;
* diferencia entre web mobile-first, web app instalable y PWA con service worker/cache.

---

## Incremento 2 — Identidad liviana, grupo y jugador

### Objetivo

Consolidar la base de plataforma para identidad liviana, grupo y jugador sin cuentas tradicionales, manteniendo seguridad mínima desde el primer dato remoto.

### Modelo conceptual mínimo

Durante este incremento se usa explícitamente:

```text
AuthIdentity
Group
Player
LocalIdentity
```

Relaciones:

```text
Group 1 -> N Player
AuthIdentity 1 -> 1 Player
Player -> Group
```

No se introduce todavía una entidad `Membership` separada.

Para administrador inicial, en este incremento alcanza con:

```text
Group.adminPlayerId
```

No se persiste también `Player.role` para administrador salvo necesidad concreta posterior.

### Regla de seguridad de identidad local

`LocalIdentity` mejora UX, pero no autoriza acciones.

Si existe `LocalIdentity` pero ya no hay `AuthIdentity` válida, no se recupera automáticamente el `Player` anterior usando `playerId`, `groupId`, nickname u otros datos locales.

### Invariante de creación inicial

Crear un grupo implica mantener coherentemente:

```text
AuthIdentity
Group
Player creador
pertenencia Player -> Group
Group.adminPlayerId
```

No debe existir como estado válido un `Group` sin `Player` administrador.

### Subincremento 2.1 — Supabase + Auth anónima

Objetivo:

```text
crear/restaurar AuthIdentity anónima
```

Sin crear todavía `Group` ni `Player`.

La identidad se crea cuando una acción de producto la necesita, no por visitar portada.

### Subincremento 2.2 — Group + Player administrador

Objetivo:

```text
AuthIdentity
↓
crear Group
↓
crear Player
↓
establecer admin inicial
```

Debe introducir:

* persistencia mínima;
* invariantes básicas;
* RLS mínima desde el inicio;
* creación coherente/atómica.

### Subincremento 2.3 — Invitación + segundo dispositivo

Objetivo:

```text
Group
↓
código/enlace opaco
↓
segundo dispositivo
↓
segunda AuthIdentity
↓
segundo Player
```

La invitación usa código y enlace como la misma invitación conceptual.

El identificador debe ser opaco, no secuencial y distinto de `groupId`.

No se habilita enumeración pública de grupos.

### Subincremento 2.4 — Bootstrap + LocalIdentity

Objetivo:

```text
abrir/reabrir
↓
AuthIdentity
↓
Player
↓
Group
↓
contexto reconocido
```

Debe contemplar conceptualmente:

* loading;
* usuario no reconocido;
* contexto reconocido;
* contexto inconsistente;
* `LocalIdentity` previa sin `AuthIdentity` válida.

### Subincremento 2.5 — Endurecimiento

No agrega capacidades nuevas.

Incluye:

* nickname duplicado;
* doble submit;
* reintentos;
* código inválido;
* aislamiento entre grupos;
* contexto remoto inconsistente;
* manipulación de `LocalIdentity`;
* pérdida de sesión anónima;
* revisión completa de RLS;
* pruebas negativas;
* validación con dos navegadores/dispositivos;
* revisión mobile.

Estado al cierre del Incremento 2:

```text
CERRADO
```

El cierre local consolida lo implementado en los subincrementos 2.1 a 2.5:

* Supabase Auth anónima se crea únicamente ante intención de producto, no al visitar `/` ni `/impostor`;
* la creación de grupo, jugador administrador e invitación inicial ocurre mediante RPC autoritativa y atómica;
* la invitación usa código opaco y permite que una segunda `AuthIdentity` cree su propio `Player` dentro del mismo `Group`;
* `LocalIdentity` queda limitada a cache/pista UX y no autoriza acciones ni recupera jugadores sin sesión anónima válida;
* el bootstrap resuelve estados de carga, usuario no reconocido, contexto reconocido, inconsistencia remota y error de conexión sin crear identidad;
* RLS queda activa desde la primera persistencia remota y las tablas no aceptan escrituras directas desde cliente;
* `/impostor` muestra el grupo reconocido y permite entrar a una vista navegable;
* `/impostor/grupo` muestra nombre del grupo, integrantes y navegación de vuelta a Impostor;
* el administrador puede recuperar su invitación activa mediante `get_my_active_group_invitation()` bajo `auth.uid()`, sin parámetros y sin abrir acceso directo a `group_invitations`;
* un jugador no administrador ve integrantes, pero no CTA administrativa ni código/enlace de invitación.

Endurecimiento aplicado en 2.5:

* el error de nickname duplicado al unirse por invitación se muestra como mensaje de producto específico;
* los errores de unicidad no relacionados con nickname siguen usando mensaje genérico;
* el doble submit queda cubierto por controladores single-flight en acciones de crear, resolver invitación y unirse;
* los casos de código inválido, aislamiento entre grupos, sesión ausente, identidad local manipulada y contexto remoto inconsistente quedan cubiertos por pruebas de unidad/integración o validaciones de DB;
* la lista de integrantes usa lectura normal autorizada por RLS del grupo;
* la recuperación de invitación activa del administrador conserva una sola invitación activa por grupo.

Evidencia de cierre local:

* validación DB desde base limpia para creación, RLS, aislamiento, escrituras directas bloqueadas, invitaciones, join, códigos inválidos/inactivos, unicidad de nickname, concurrencia, recuperación de invitación admin, grants y firmas;
* validación unit/static con tests, lint, build y `git diff --check`;
* smoke browser aprobado para admin, invitación, clipboard, refresh, segundo jugador, no-admin, acceso directo sin Auth y mobile 360x640 / 390x844.

Trade-offs aceptados:

* no se implementa rate limiting de invitaciones en este incremento;
* no se agregan idempotency keys explícitas más allá de constraints, transacciones y single-flight cliente;
* no se implementa recuperación automática de `Player` cuando se pierde la sesión anónima;
* se mantiene la regla actual `AuthIdentity 1 -> 1 Player` y, por lo tanto, un dispositivo pertenece a un solo grupo en esta etapa;
* no se implementan regeneración, revocación ni expiración de invitaciones;
* `Group` queda resuelto como contexto social persistente, pero `Room` sigue fuera de alcance.

Producción:

El Incremento 2 queda cerrado también en producción.

Evidencia resumida:

* migration history local/remoto alineado para `20260814122000`, `20260814152000` y `20260818120000`;
* Vercel apunta al Supabase remoto esperado y contiene el código del incremento;
* smoke A/B aprobado con administrador y segundo jugador en contextos aislados;
* creación de grupo, reapertura de contexto, navegación a `/impostor/grupo`, listado de integrantes e invitación administrativa funcionan en producción;
* refresh de administrador y segundo jugador conserva el grupo reconocido;
* nickname duplicado, invitación inválida y acceso directo sin Auth muestran feedback de producto sin exponer detalles internos;
* revisión mobile 360x640 y 390x844 aprobada sin overflow horizontal ni controles inaccesibles.

### Dominio involucrado

Plataforma:

* identidad técnica;
* `Group`;
* `Player`;
* pertenencia al grupo;
* administrador inicial.

### Infraestructura necesaria

* Supabase Auth liviana/anónima;
* Postgres para grupo y jugador;
* RLS mínima para pertenencia;
* almacenamiento local permitido para recordar el vínculo del dispositivo.

### Decisiones técnicas a cerrar

* mecanismo técnico concreto para asegurar creación coherente/atómica de grupo+jugador+admin;
* formato exacto de código/enlace compartible;
* política mínima de expiración o invalidez de invitación;
* estrategia de bootstrap entre `AuthIdentity`, estado remoto y `LocalIdentity`.

### Tests / validación

* validación de creación/restauración de sesión anónima cuando una acción la requiere;
* integración de creación coherente de `Group` + `Player` + `adminPlayerId`;
* validación de join por código y por enlace;
* integración/RLS: un jugador solo accede a su grupo;
* validación manual con dos dispositivos/navegadores;
* pruebas negativas de identidad local manipulada o sesión perdida.

### Riesgos

* confundir `LocalIdentity` con autorización;
* permitir recuperación insegura del `Player` tras pérdida de sesión anónima;
* dejar tablas remotas temporalmente abiertas sin RLS mínima;
* duplicar la representación técnica de administrador sin necesidad;
* hacer complejo el ingreso inicial.

### Fuera de alcance

* múltiples grupos;
* selector de grupos;
* `Membership`;
* cambio de grupo;
* múltiples administradores;
* transferencia de administrador;
* perfiles;
* avatares;
* amigos;
* email;
* password;
* social login;
* recuperación avanzada;
* QR;
* salas;
* host;
* `RoomParticipant`;
* Realtime;
* Presence;
* banco de palabras;
* rondas;
* votos;
* marcador;
* historial de partidas.

### Criterio de terminado consolidado

El incremento termina cuando se cumple:

```text
teléfono A
→ crea un Group
→ crea su Player
→ queda como administrador

teléfono B
→ recibe código/enlace
→ se une al mismo Group
→ crea su propio Player

ambos dispositivos
→ al refrescar/reabrir recuperan su contexto
    mediante Auth + datos remotos

grupo
→ es navegable
→ muestra integrantes
→ permite invitar solo al administrador

LocalIdentity
→ mejora UX pero no concede autorización

RLS
→ impide consultar grupos ajenos

la pérdida completa de Auth anónima
→ no permite apropiarse automáticamente del Player anterior

no existe todavía ninguna sala
ni lógica jugable de Impostor
ni producción validada
```

### Conceptos a aprender

* identidad técnica vs identidad de producto;
* sesión anónima;
* persistencia local vs remota;
* pertenencia;
* autorización mínima con RLS.

---

## Incremento 3 — Banco de palabras del grupo

### Objetivo

Permitir agregar palabras o frases cortas al banco persistente del grupo, con validación, autoría y privacidad básica.

### Resultado observable

Un jugador puede agregar una palabra o frase, ver que fue agregada, consultar la cantidad total disponible, ver sus propios aportes y borrar uno propio.

Si intenta agregar un duplicado trivial, recibe un error claro.

Ningún integrante, incluido el administrador, puede explorar libremente el banco completo en este incremento.

La ruta conceptual prevista para la experiencia del banco es:

```text
/impostor/grupo/palabras
```

`/impostor/grupo` puede mostrar un resumen del banco:

```text
Banco de palabras
12 disponibles
Tus aportes: 3

[ Agregar palabras ]
```

### Dominio involucrado

Impostor:

* `GroupWord`;
* normalización;
* validación;
* autoría;
* visibilidad parcial.

Plataforma:

* permisos de grupo;
* pertenencia;
* identidad autoritativa.

### Infraestructura necesaria

* Postgres para palabras;
* RLS para integrante y autor;
* RPCs autoritativas para mutaciones y lecturas acotadas del banco.

### Decisiones cerradas

* entidad persistente `GroupWord`;
* implementación futura como `group_words`;
* campos conceptuales `id`, `groupId`, `text`, `normalizedText`, `authorPlayerId`, `createdAt`;
* longitud entre 2 y 40 caracteres;
* normalización de espacios y comparación case-insensitive;
* conservación de tildes, `ñ` y puntuación;
* rechazo de emojis;
* unicidad futura por grupo y texto normalizado;
* autoría derivada desde `auth.uid()` → `Player` → `Group`;
* palabras precargadas diferidas;
* administración completa del banco diferida.

Subincrementos previstos:

* 3.0 — alinear documentación;
* 3.1 — persistencia + alta autoritativa;
* 3.2 — cantidad total + listado propio;
* 3.3 — borrado propio;
* 3.4 — UI vertical;
* 3.5 — endurecimiento y cierre.

Estado al cierre local del Incremento 3:

```text
COMPLETADO LOCAL
```

El cierre local consolida persistencia, alta, cantidad total, listado propio, borrado propio, UI vertical, privacidad parcial, tests DB/unitarios y smoke browser local con identidades aisladas. Queda fuera de este cierre la alineación remota y el smoke de producción.

### Tests / validación

* unit tests de normalización;
* unit tests de duplicados;
* integración: cualquier integrante puede agregar;
* integración/RLS: integrante ve sus palabras y cantidad, no banco completo;
* integración/RLS: administrador tampoco explora el banco completo;
* integración/RLS: autor puede borrar lo propio;
* integración/RLS: no autor no puede borrar aportes ajenos;
* integración/RPC: mutaciones no aceptan `groupId`, `authorPlayerId` ni `authUserId` confiados al cliente;
* validación manual en teléfono;
* revisión de `git diff --check`.

### Riesgos

* exponer el banco completo a jugadores normales;
* exponer el banco completo al administrador antes de validar una necesidad real;
* guardar duplicados por diferencias triviales;
* convertir moderación futura en requisito del MVP;
* hacer que agregar palabras dependa de una sala activa;
* mezclar palabras persistentes del grupo con palabras usadas en una tanda.

### Fuera de alcance

* categorías;
* edición;
* aprobación manual;
* moderación administrativa;
* palabras precargadas;
* ranking de palabras;
* límites complejos de aporte;
* límite máximo de palabras por grupo;
* rate limiting específico;
* estadísticas;
* Room;
* Realtime;
* Presence;
* GameSession;
* Round;
* selección aleatoria;
* palabra usada/no usada.

### Criterio de terminado

El grupo tiene un banco persistente útil para jugar: cualquier integrante puede agregar una palabra/frase, consultar cantidad total, ver sus aportes y borrar aportes propios, sin que nadie pueda explorar libremente el banco completo.

### Conceptos a aprender

* datos persistentes de dominio;
* normalización determinística;
* restricciones de unicidad;
* visibilidad parcial;
* diferencia entre autor, integrante y administrador.

---

## Incremento 4 — Room + Lobby

El Incremento 4 queda dividido en slices verificables. Room pertenece al dominio de Impostor y no se promueve a Platform.

### Contrato cerrado

`Group` representa pertenencia social persistente. `Room` representa una reunión temporal de un subconjunto del Group.

* cualquier Player válido del Group puede crear una Room;
* el creador es host inicial y también RoomParticipant;
* una Room tiene estado `lobby` o `closed`;
* una Room cerrada deja de ser activa;
* un Player puede pertenecer a una sola Room activa de Impostor;
* un Group puede tener varias Rooms activas;
* crear de nuevo devuelve la Room activa existente del Player;
* código y enlace son dos representaciones de la misma Room;
* el código tiene 8 caracteres, es opaco y no secuencial;
* el join valida autoritativamente que Room y Player pertenecen al mismo Group;
* `RoomParticipant` representa pertenencia actual, no conexión;
* un participante puede abandonar un lobby;
* el host puede cerrar el lobby;
* si el host quiere abandonar, se cierra la Room;
* no existe sucesión automática de host en este incremento;
* el lobby se reconstruye después de refresh mediante el módulo de Impostor;
* Postgres Changes avisa de cambios y el cliente vuelve a leer el lobby autoritativamente;
* Presence queda diferida al Incremento 5.

### Incremento 4.0 — Contrato documental

#### Objetivo

Dejar la documentación de Room + Lobby coherente y lista para implementar.

#### Resultado observable

El corpus define entidades, invariantes, lifecycle, join, refresh, sincronización, seguridad y límites sin requerir decisiones relevantes silenciosas en 4.1.

#### Fuera de alcance

Código, SQL, migrations, RPCs, RLS, Realtime y componentes.

#### Validación

Revisión cruzada del corpus, contradicciones documentadas y validación de formato del diff.

### Incremento 4.1 — Crear Room + host

#### Objetivo

Permitir que un Player válido cree una Room persistida.

#### Resultado observable

```text
Player válido
→ Crear sala
→ Room persistida en lobby
→ creador = host
→ creador = RoomParticipant
→ lobby mínimo
```

#### Incluye

* creación coherente de Room y participante inicial;
* host perteneciente al Group;
* código único;
* una Room activa por Player;
* creación idempotente ante doble toque o reintento;
* estado `lobby`.

#### No incluye

Join de terceros, Realtime, Presence, sucesión de host, GameSession y gameplay.

#### Validación

Tests DB/integration de invariantes, código, aislamiento y doble create.

### Incremento 4.2 — Join autoritativo

#### Objetivo

Permitir que otro Player del mismo Group entre por código o enlace.

#### Resultado observable

```text
Segundo Player del mismo Group
→ código o enlace
→ RoomParticipant
→ acceso al lobby
```

#### Incluye

* código válido y Room en `lobby`;
* validación del mismo Group;
* rechazo de otro Group;
* join repetido idempotente;
* joins simultáneos;
* sin Auth;
* Auth sin Player.

#### No incluye

Sincronización automática entre pantallas, Presence, GameSession y sucesión de host.

#### Validación

Tests DB/integration de autorización, concurrencia, aislamiento y errores de producto.

### Incremento 4.3 — Reconstrucción de Room + lobby

#### Objetivo

Reconstruir la Room activa desde el contexto remoto después de refresh o apertura directa.

#### Resultado observable

```text
refresh
→ Auth
→ Player
→ Group
→ Room activa
→ host + participantes
→ mismo lobby
```

#### Incluye

* `get_my_active_room()` conceptual;
* Room cerrada fuera de la reconstrucción activa;
* apertura directa de `/impostor/sala/[code]`;
* estados de no Auth, Auth sin Player y sin Room.

#### No incluye

Realtime, Presence, conexión online/offline y GameSession.

#### Validación

Tests de lectura autorizada y smoke browser de refresh y apertura directa.

### Incremento 4.4 — Lobby sincronizado

#### Objetivo

Propagar cambios persistidos de participantes sin refresh manual.

#### Resultado observable

```text
A tiene el lobby abierto
B entra
A ve a B sin refrescar
```

#### Incluye

* Supabase Realtime Postgres Changes;
* evento como invalidación;
* refetch autoritativo del lobby;
* reconexión del canal;
* refetch completo ante reconexión o evento perdido.

#### No incluye

Presence, Broadcast como autoridad, online/offline, heartbeats y sucesión de host.

#### Validación

Tests de suscripción/RLS y smoke browser con dos clientes, reconexión y evento perdido simulado.

### Incremento 4.5 — UX vertical + lifecycle mínimo + endurecimiento

#### Objetivo

Completar el flujo usable de Room + Lobby en mobile.

#### Resultado observable

```text
crear
→ compartir
→ entrar
→ ver participantes
→ refresh
→ sincronización
→ salir / cerrar
```

#### Incluye

* sección secundaria de juego en `/impostor/grupo`;
* código, enlace y clipboard;
* lobby mobile-first;
* salida de participante no-host;
* cierre por host;
* cierre si el host quiere abandonar;
* errores de producto;
* aislamiento entre Groups;
* accesibilidad y viewport de 360 px;
* no exposición de IDs técnicos.

#### No incluye

Mínimo de jugadores, inicio de tanda, GameSession, Presence, sucesión de host, expiración automática, QR y offline multijugador.

#### Validación

Component tests, integration tests, browser smoke mobile, concurrencia, refresh, sincronización y lifecycle `lobby | closed`.

---

## Incremento 5 — Presencia básica y sucesión de host

### Objetivo

Detectar conexión/desconexión básica en lobby y reasignar host si el host deja de estar disponible.

### Resultado observable

Los jugadores ven quién está conectado.

Si el host se desconecta, el sistema asigna como nuevo host al participante conectado con `joinedAt` más antiguo.

Si el host original vuelve, vuelve como participante normal.

### Dominio involucrado

Impostor:

* `RoomParticipant.connectionStatus`;
* `joinedAt`;
* sucesión de host.

### Infraestructura necesaria

* Supabase Presence o mecanismo equivalente dentro de Supabase;
* persistencia mínima del host actual;
* lógica autoritativa de reasignación.

### Decisiones técnicas a cerrar

* tolerancia inicial antes de considerar desconectado;
* qué eventos de navegador móvil se consideran señal de desconexión;
* dónde se ejecuta la reasignación autoritativa;
* cómo se informa el cambio de host.

### Tests / validación

* unit test de selección de nuevo host por `joinedAt`;
* integración: host desconectado dispara reasignación;
* prueba manual con tres teléfonos;
* validación mobile: bloquear pantalla o cambiar de app no rompe lobby de forma irreversible.

### Riesgos

* sobreconfiar en presencia móvil;
* reasignar host demasiado rápido;
* generar dos hosts por carrera;
* intentar resolver reconexión avanzada demasiado temprano.

### Fuera de alcance

* recuperación completa en mitad de ronda;
* tolerancias configurables;
* auditoría histórica de conexión;
* reglas complejas para abandono.

### Criterio de terminado

El lobby puede sobrevivir a la desconexión del host manteniendo un único host consistente.

### Conceptos a aprender

* presencia efímera;
* diferencia entre conexión y pertenencia;
* eventos de navegador móvil;
* consistencia de una elección autoritativa.

---

## Incremento 6 — Iniciar tanda y preparar ronda privada

### Objetivo

Permitir que el host inicie una tanda y que el sistema prepare la primera ronda con palabra e impostor seleccionados autoritativamente.

### Resultado observable

Con al menos tres jugadores conectados y al menos una palabra disponible, el host inicia la tanda.

Cada dispositivo recibe solamente su información privada:

* jugadores normales ven la palabra;
* impostor ve `IMPOSTOR` y no recibe la palabra.

### Dominio involucrado

Impostor:

* `GameSession`;
* `SessionPlayer`;
* `Round`;
* palabra no usada;
* impostor balanceado;
* asignación privada.

### Infraestructura necesaria

* operación autoritativa para iniciar tanda y preparar ronda;
* persistencia operativa de sesión, jugadores de sesión y ronda;
* autorización del host;
* RLS o vistas privadas para asignaciones.

### Decisiones técnicas a cerrar

* forma concreta de operación autoritativa: transacción, RPC, Edge Function u otra opción compatible con Supabase;
* cómo representar asignaciones privadas sin enviar palabra al impostor;
* cómo registrar palabras usadas en la tanda;
* cómo asegurar idempotencia ante doble toque de `Iniciar partida`.

### Tests / validación

* unit tests de selección balanceada de impostor;
* unit tests de selección de palabra no usada;
* integración: no inicia con menos de tres jugadores;
* integración: no inicia sin palabras disponibles;
* integración/privacidad: el impostor no puede obtener la palabra;
* integración/autorización: solo host inicia;
* prueba manual con cuatro teléfonos.

### Riesgos

* filtrar la palabra al impostor;
* dejar ronda parcial sin palabra o sin impostor;
* permitir doble creación de ronda;
* usar el cliente como autoridad por conveniencia.

### Fuera de alcance

* confirmación `Estoy listo`;
* votación;
* scoring;
* nuevas rondas;
* historial final.

### Criterio de terminado

La primera ronda queda preparada de forma consistente y privada para todos los participantes.

### Conceptos a aprender

* transacciones u operaciones autoritativas;
* datos privados por jugador;
* azar controlado;
* balance de roles;
* idempotencia.

---

## Incremento 7 — Confirmación de rol y estado PLAYING

### Objetivo

Permitir que cada jugador confirme que vio su información y avanzar a conversación presencial cuando todos estén listos.

### Resultado observable

Cada jugador toca `Estoy listo`.

La partida avanza automáticamente de `ROLE_REVEAL` a `PLAYING`.

El host ve la acción `Ir a votación`.

Los demás ven que esperan al host.

### Dominio involucrado

Impostor:

* `ROLE_REVEAL`;
* `roleAcknowledged`;
* transición a `PLAYING`;
* acción `START_VOTING` disponible para host.

### Infraestructura necesaria

* persistencia de confirmaciones individuales;
* sincronización de fase global;
* autorización de participante para confirmar.

### Decisiones técnicas a cerrar

* si la confirmación se guarda en `SessionPlayer`, `RoundAssignment` o entidad equivalente;
* cómo evitar doble confirmación problemática;
* cómo se recupera esta pantalla después de refresh.

### Tests / validación

* unit test de guard: todos confirmados;
* integración: un jugador no participante no confirma;
* integración: la fase no avanza hasta que todos confirmen;
* prueba manual con varios teléfonos;
* validación de refresh durante `ROLE_REVEAL`.

### Riesgos

* avanzar de fase antes de tiempo;
* mostrar accidentalmente información privada tras confirmar;
* bloquear la ronda si un dispositivo se refresca.

### Fuera de alcance

* temporizador;
* orden de habla;
* control digital de conversación;
* votación.

### Criterio de terminado

La ronda puede pasar de información privada a conversación presencial con una única fase compartida y consistente.

### Conceptos a aprender

* estado global vs estado individual;
* guards de transición;
* sincronización de fase;
* recuperación simple de pantalla.

---

## Incremento 8 — Primera votación

### Objetivo

Implementar la primera votación secreta y su resolución básica.

### Resultado observable

El host inicia votación.

Cada jugador vota por otro participante.

No se muestran resultados parciales.

Cuando todos votan, se revela el resultado agregado.

Si no hay empate, la ronda avanza según corresponda:

* impostor descubierto → `IMPOSTOR_GUESS`;
* otro jugador acusado → `ROUND_RESULT`.

### Dominio involucrado

Impostor:

* `VOTING_FIRST`;
* `Vote`;
* voto secreto;
* conteo autoritativo;
* acusado único;
* detección de impostor descubierto o no descubierto.

### Infraestructura necesaria

* persistencia operativa de votos;
* restricción de un voto por jugador;
* autorización de participante;
* sincronización cuando todos votaron;
* operación autoritativa de conteo.

### Decisiones técnicas a cerrar

* cómo evitar voto duplicado;
* cómo impedir auto-voto;
* cómo ocultar votos individuales durante la votación;
* cómo resolver carreras cuando llega el último voto;
* qué información agregada se revela.

### Tests / validación

* unit tests de conteo sin empate;
* unit tests de no auto-voto;
* integración: un participante vota una sola vez;
* integración/privacidad: no se consultan votos individuales ajenos;
* concurrencia básica: votos simultáneos no duplican resolución;
* e2e mínimo de lobby a votación con pocos participantes si el flujo ya lo permite.

### Riesgos

* revelar votos antes de tiempo;
* permitir voto duplicado;
* resolver dos veces por llegada simultánea del último voto;
* dejar la ronda sin resultado.

### Fuera de alcance

* empate;
* segunda votación;
* intento final completo;
* scoring completo.

### Criterio de terminado

La primera votación funciona de forma privada, autoritativa y consistente para casos sin empate.

### Conceptos a aprender

* privacidad durante escritura y lectura;
* restricciones únicas;
* resolución por evento final;
* concurrencia pequeña pero real.

---

## Incremento 9 — Empate y segunda votación

### Objetivo

Completar la regla de empate y segunda votación definitiva.

### Resultado observable

Si la primera votación empata, todos ven los jugadores empatados.

El host inicia segunda votación.

Solo se puede votar por candidatos empatados, salvo auto-voto.

La segunda votación resuelve definitivamente la ronda.

### Dominio involucrado

Impostor:

* `TIE_DISCUSSION`;
* `VOTING_SECOND`;
* candidatos empatados;
* regla determinística de segunda votación.

### Infraestructura necesaria

* persistencia del conjunto de empatados;
* votos con `votingRound = 2`;
* autorización del host para iniciar segunda votación;
* conteo autoritativo.

### Decisiones técnicas a cerrar

* dónde se guarda el conjunto de empatados;
* cómo se evita votar por alguien fuera del empate;
* si los votos de primera y segunda etapa comparten entidad con restricción compuesta.

### Tests / validación

* unit tests de detección de empate;
* unit tests de candidatos restringidos;
* unit tests de regla definitiva de segunda votación;
* integración: no hay tercera votación;
* prueba manual con empate forzado.

### Riesgos

* permitir candidatos incorrectos;
* abrir tercera votación por ambigüedad;
* confundir empate de primera con empate de segunda;
* revelar palabra antes de tiempo si el impostor fue descubierto.

### Fuera de alcance

* intento final del impostor;
* scoring visual completo;
* estadísticas.

### Criterio de terminado

La votación cubre casos con y sin empate según las reglas v0.

### Conceptos a aprender

* modelado de ramas de estado;
* restricciones dependientes de fase;
* reglas determinísticas;
* tests de tablas de casos.

---

## Incremento 10 — Intento final del impostor

### Objetivo

Implementar la etapa donde el impostor descubierto intenta adivinar la palabra antes de definir el ganador.

### Resultado observable

Cuando el grupo identifica al impostor, la aplicación revela quién era, pero mantiene oculta la palabra.

El impostor responde verbalmente.

El host toca `Comprobar palabra`, todos ven la palabra, y el host registra si acertó.

La ronda obtiene ganador.

### Dominio involucrado

Impostor:

* `IMPOSTOR_GUESS`;
* revelación diferida de palabra;
* `REGISTER_GUESS_RESULT`;
* ganador `impostor` o `group`.

### Infraestructura necesaria

* autorización de host;
* control de visibilidad de palabra;
* persistencia de resultado de ronda;
* transición autoritativa a `ROUND_RESULT`.

### Decisiones técnicas a cerrar

* si `REVEAL_WORD` y `REGISTER_GUESS_RESULT` son pasos separados o una operación guiada;
* cómo se representa `impostorGuessedWord`;
* cómo prevenir doble registro del resultado;
* qué ve cada jugador antes y después de revelar palabra.

### Tests / validación

* unit tests de victoria por acierto/fallo;
* integración/privacidad: palabra no disponible antes de `REVEAL_WORD`;
* integración/autorización: solo host registra;
* idempotencia: no se registra dos veces;
* prueba manual de flujo completo con impostor descubierto.

### Riesgos

* revelar la palabra demasiado pronto;
* dejar al host como fuente no validada de una transición crítica;
* registrar resultado dos veces;
* confundir resultado de votación con resultado final de ronda.

### Fuera de alcance

* marcador persistente final;
* nueva ronda;
* cierre de tanda.

### Criterio de terminado

La ronda puede resolver correctamente el caso en que el impostor fue descubierto.

### Conceptos a aprender

* revelación progresiva de información;
* acciones autorizadas;
* separación entre interacción presencial y decisión digital;
* idempotencia en resultados.

---

## Incremento 11 — Puntuación, marcador y nueva ronda

### Objetivo

Actualizar puntuación después de cada ronda y permitir iniciar una nueva ronda dentro de la misma tanda.

### Resultado observable

Después del resultado se ve el marcador.

El host puede iniciar una nueva ronda.

La nueva ronda conserva jugadores y puntuación, evita palabras usadas y considera balance de impostor.

### Dominio involucrado

Impostor:

* `ROUND_RESULT`;
* `SCOREBOARD`;
* `SessionPlayer.score`;
* `SessionPlayer.impostorCount`;
* palabras usadas;
* `NEW_ROUND`.

### Infraestructura necesaria

* operación autoritativa de scoring;
* operación autoritativa de nueva ronda;
* persistencia operativa de marcador;
* prevención de doble nueva ronda.

### Decisiones técnicas a cerrar

* si la puntuación se calcula al entrar a `ROUND_RESULT` o al avanzar a `SCOREBOARD`;
* cómo registrar palabras usadas durante la tanda;
* cómo informar falta de palabras disponibles;
* cómo bloquear doble toque de `Nueva ronda`.

### Tests / validación

* unit tests de scoring;
* unit tests de selección de impostor con conteos acumulados;
* integración: nueva ronda no reutiliza palabra;
* integración: no hay doble creación de ronda;
* prueba manual de dos rondas consecutivas.

### Riesgos

* sumar puntos dos veces;
* reutilizar palabra en la misma tanda;
* romper balance de impostor;
* crear dos rondas por reintento.

### Fuera de alcance

* historial persistente de tanda finalizada;
* UI de estadísticas;
* cambio de participantes durante tanda.

### Criterio de terminado

Una tanda puede contener múltiples rondas con marcador consistente y palabras no repetidas.

### Conceptos a aprender

* side effects controlados;
* estado acumulado de sesión;
* prevención de duplicados;
* diferencias entre operación y resumen histórico.

---

## Incremento 12 — Terminar tanda e historial mínimo

### Objetivo

Permitir finalizar la tanda y persistir el resumen histórico mínimo definido para estadísticas futuras.

### Resultado observable

El host termina la tanda desde el marcador.

Todos ven resultado final, ganador por puntos, clasificación completa y cantidad de rondas jugadas.

El grupo, jugadores y banco permanecen disponibles para futuras partidas.

### Dominio involucrado

Impostor:

* `FINISHED`;
* `GameSessionHistory`;
* `RoundHistory`;
* resultado final de tanda.

### Infraestructura necesaria

* persistencia histórica;
* operación autoritativa de cierre;
* limpieza o cierre del estado operativo temporal;
* autorización de host.

### Decisiones técnicas a cerrar

* forma exacta del resumen histórico;
* cuándo se elimina o archiva estado operativo;
* cómo evitar registrar dos veces el cierre;
* qué datos no se guardan, especialmente votos individuales históricos.

### Tests / validación

* integración: cerrar tanda crea historial una sola vez;
* integración: historial contiene participantes, rondas, puntajes y ganadores;
* integración/privacidad: no se conservan votos individuales históricos sin necesidad;
* e2e de tanda completa con cuatro jugadores simulados si el entorno lo permite;
* prueba real presencial con 3 a 4 teléfonos.

### Riesgos

* guardar más información histórica de la necesaria;
* perder datos mínimos para estadísticas futuras;
* dejar sala/tanda en estado medio terminado;
* convertir historial en pantalla de estadísticas antes del MVP.

### Fuera de alcance

* estadísticas visuales;
* ranking global;
* exportaciones;
* analíticas;
* múltiples tandas simultáneas por sala.

### Criterio de terminado

El grupo puede jugar una tanda completa de Impostor desde creación de sala hasta resultado final.

Este es el:

```text
PRIMER MVP JUGABLE
```

Debe poder probarse con 3 a 8 teléfonos, especialmente con 4.

### Conceptos a aprender

* historial mínimo;
* datos operativos vs datos permanentes;
* cierre idempotente;
* validación real con personas.

---

## Incremento 13 — Reconexión básica

### Objetivo

Mejorar la recuperación ante refresh, reapertura, segundo plano y pérdida breve de red.

### Resultado observable

Un jugador puede refrescar o volver a abrir la PWA y recuperar:

* identidad;
* grupo;
* sala activa;
* fase actual;
* información privada que todavía le corresponda;
* estado de voto si ya votó.

### Dominio involucrado

Plataforma:

* identidad recordada;
* lifecycle de cliente.

Impostor:

* recuperación de sala, ronda y fase;
* vista privada de jugador;
* presencia.

### Infraestructura necesaria

* consultas de reconstrucción de estado autorizado;
* manejo de suscripciones al volver;
* estrategia básica para background/foreground;
* señales de error o reconexión en UI.

### Decisiones técnicas a cerrar

* qué se considera pérdida breve;
* qué ocurre si un jugador vuelve en otra fase;
* cómo se muestra un estado de reconectando;
* qué información privada puede reconstruirse y bajo qué guards;
* comportamiento si el host se desconectó y ya fue reemplazado.

### Tests / validación

* integración: reconstrucción de estado por jugador;
* e2e: refresh en lobby, `ROLE_REVEAL`, votación y marcador;
* pruebas manuales bloqueando teléfono y cambiando de app;
* validación específica en Safari iOS y Chrome Android cuando haya dispositivos disponibles.

### Riesgos

* recuperar datos privados de otro jugador;
* duplicar acciones al reconectar;
* mostrar fase vieja por cache local;
* depender de comportamiento móvil no confiable.

### Fuera de alcance

* modo offline de partida;
* recuperación de jugador que abandona por mucho tiempo;
* edición de participantes durante tanda;
* sincronización peer-to-peer.

### Criterio de terminado

La experiencia tolera interrupciones móviles comunes sin romper la tanda ni exponer información privada.

### Conceptos a aprender

* lifecycle PWA;
* refresh vs reapertura;
* estado local confiable y no confiable;
* resuscripción realtime;
* recuperación autorizada.

---

## Incremento 14 — Maduración PWA iOS/Android del MVP

### Objetivo

Madurar la PWA del MVP con service worker, cache, actualización y validaciones iOS/Android, sin prometer partida offline.

### Resultado observable

La app sigue pudiendo usarse desde navegador e instalarse cuando el dispositivo lo permite.

La capa temprana de manifest, iconos y metadatos queda revisada, y se suma una estrategia concreta de service worker, cache del shell y comportamiento de actualización razonable.

Funciona en Safari iOS y Chrome Android dentro del alcance MVP.

### Dominio involucrado

Plataforma:

* PWA;
* instalación opcional;
* cache de shell;
* actualización;
* mobile lifecycle.

Impostor:

* recuperación de partida conectada.

### Infraestructura necesaria

* revisión de manifest, iconos y metadata introducidos temprano;
* service worker;
* estrategia de cache;
* HTTPS en entorno desplegado cuando corresponda;
* pruebas en navegador e instalada.

### Decisiones técnicas a cerrar

* estrategia concreta de service worker;
* qué assets se cachean;
* qué rutas nunca deben servirse con datos sensibles obsoletos;
* cómo evitar cachear identidad, palabra secreta, rol de impostor, estado de sala, fase, votos y vistas privadas;
* cómo avisar actualización disponible;
* alcance de offline: shell sí, partida sincronizada no;
* diferencias iOS/Android que se documentan para el MVP.

### Tests / validación

* Lighthouse o auditoría equivalente de PWA;
* prueba de instalación en Android;
* prueba de agregar a inicio en iOS;
* prueba de navegador sin instalación;
* prueba de actualización de versión;
* prueba de red intermitente: la app informa estado sin prometer juego offline.

### Riesgos

* cachear datos privados;
* servir estado viejo de partida;
* confundir PWA con offline completo;
* tratar este incremento como el primer contacto con instalación en vez de como robustecimiento;
* introducir estrategias de cache que persistan datos sensibles u obsoletos.

### Fuera de alcance

* push notifications;
* background sync complejo;
* juego multi-dispositivo offline;
* app stores;
* optimizaciones avanzadas de cache.

### Criterio de terminado

La PWA cumple el alcance MVP: instalable cuando corresponde, usable sin instalación, mobile-first, con service worker/cache acotados y segura respecto de datos sensibles.

### Conceptos a aprender

* manifest;
* installability;
* service worker;
* cache strategies;
* actualización de versiones;
* HTTPS y localhost;
* diferencias reales entre iOS y Android.

---

## Incremento 15 — Auditoría final de seguridad, testing y UX del MVP

### Objetivo

Revisar el MVP completo antes de considerarlo listo para uso familiar sostenido.

### Resultado observable

Existe una versión candidata donde:

* los flujos principales funcionan;
* los permisos sensibles están validados;
* la experiencia mobile es clara;
* el juego puede probarse presencialmente;
* los riesgos conocidos están documentados.

### Dominio involucrado

Plataforma:

* identidad;
* grupo;
* PWA;
* permisos comunes.

Impostor:

* sala;
* host;
* ronda;
* palabra secreta;
* impostor;
* votos;
* scoring;
* historial.

### Infraestructura necesaria

* suite de tests mínima pero significativa;
* checklist de seguridad y privacidad;
* pruebas manuales en teléfonos;
* observabilidad básica suficiente para depurar partidas familiares.

### Decisiones técnicas a cerrar

* qué tests quedan como obligatorios antes de merge;
* qué casos requieren e2e;
* qué datos se pueden observar para depurar sin violar privacidad;
* qué limitaciones conocidas se documentan;
* si corresponde abrir una etapa específica de diseño visual/UX con Figma antes de pulir UI final.

### Tests / validación

* unit tests de reglas puras;
* integración de permisos y operaciones autoritativas;
* e2e de flujo crítico completo;
* prueba manual con 4 jugadores;
* revisión responsive en pantallas pequeñas;
* revisión PWA iOS/Android;
* revisión de privacidad: palabra, impostor, votos, banco y permisos.

### Riesgos

* declarar listo un MVP que solo funciona en happy path;
* ocultar datos en UI pero exponerlos por consultas;
* tests que no cubren reglas centrales;
* experiencia mobile con demasiada fricción durante conversación presencial.

### Fuera de alcance

* estadísticas;
* nuevo juego;
* escalabilidad masiva;
* marketplace público;
* moderación avanzada;
* rediseño total de UI.

### Criterio de terminado

El MVP está listo para jugarse y observarse con el grupo familiar inicial, con límites conocidos y sin deuda crítica de privacidad o flujo.

### Conceptos a aprender

* auditoría de producto;
* pruebas con personas;
* seguridad por diseño;
* cobertura por riesgo;
* criterios reales de MVP.

---

# 7. Secuencia de introducción de testing

El testing debe entrar junto al riesgo que cubre.

## Desde Incremento 0

* test mínimo para validar tooling;
* lint;
* build;
* revisión mobile manual.

## Desde Incremento 1

* validación inicial de manifest, iconos y metadata;
* validación mobile/standalone cuando el navegador o plataforma lo permita;
* comprobación explícita de que no se introdujo cache de datos sensibles ni soporte offline de partida.

## Desde Incremento 3

* unit tests de reglas puras de palabras;
* integración de persistencia y permisos.

## Desde Incremento 6

* unit tests de selección de palabra;
* unit tests de selección balanceada de impostor;
* tests de privacidad de asignación.

## Desde Incremento 8

* unit tests de votación;
* integración de voto único;
* concurrencia básica.

## Desde Incremento 10

* tests de ganador;
* tests de revelación progresiva de palabra.

## Desde Incremento 12

* e2e de tanda completa;
* prueba presencial real.

## Desde Incremento 14

* auditoría PWA completa del MVP;
* pruebas iOS/Android;
* pruebas de service worker;
* pruebas de actualización y cache;
* revisión de rutas y datos que no deben cachearse.

---

# 8. Secuencia de introducción de Supabase

Supabase debe entrar por necesidad de producto, no como bloque horizontal.

## Incremento 0 y 1

No se usa Supabase.

## Incremento 2

Estado: cerrado.

Entraron Supabase Auth anónima, Postgres, RLS mínima, RPCs autoritativas, grupos, jugadores, invitaciones y bootstrap de contexto reconocido.

Quedó explícitamente fuera de este cierre: banco de palabras, sala, realtime, presence, host, partida y recuperación avanzada.

## Incremento 3

Estado: cerrado.

Se agregaron `GroupWord`, autoría, cantidad total, listado propio, borrado propio y visibilidad parcial sin exploración completa del banco. La validación local y de producción documentada confirma el cierre del incremento.

## Incremento 4

Se agrega estado de sala y lobby compartido.

## Incremento 5

Se agrega Presence o mecanismo equivalente para conexión y host.

## Incrementos 6 a 12

Se agregan operaciones autoritativas, persistencia operativa, votación, scoring e historial.

## Incrementos 13 y 14

Se endurece reconexión, lifecycle PWA, service worker y cache sin convertir la partida en offline.

---

# 9. Seguridad y privacidad por etapa

## Palabra secreta

Primer riesgo crítico: Incremento 6.

La palabra no debe llegar al impostor.

Se vuelve a revisar en Incremento 10 y 14 por revelación, service worker y cache.

## Rol de impostor

Primer riesgo crítico: Incremento 6.

Cada jugador debe recibir únicamente su rol.

## Votos

Primer riesgo crítico: Incremento 8.

Los votos individuales no se muestran antes, durante ni después de la votación salvo como resultado agregado.

No se conservan votos individuales históricos salvo que aparezca una necesidad concreta futura.

## Banco de palabras

Primer riesgo crítico: Incremento 3.

Cualquier integrante puede ver sus propias palabras y cantidad total, no el banco completo.

El administrador tampoco puede explorar el banco completo en el MVP del Incremento 3.

## Administrador

Primer riesgo crítico: Incremento 2.

El administrador del grupo no equivale a host de sala.

## Host

Primer riesgo crítico: Incremento 4.

El host es temporal, derivado de la sala, y no necesita ser administrador.

Su sucesión se endurece en Incremento 5.

---

# 10. Diseño UX/UI

No conviene diseñar toda la UI antes de validar el flujo.

La progresión recomendada es:

1. Incremento 0: estructura mobile simple y base compatible con PWA, sin diseño visual definitivo.
2. Incremento 1: portada simple con primera experiencia web app instalable/standalone, sin convertirlo en infraestructura PWA avanzada.
3. Incrementos 2 a 5: UX funcional para identidad, palabras y lobby.
4. Incrementos 6 a 12: pantallas claras para juego real, priorizando privacidad y baja fricción.
5. Después del primer MVP jugable: sesión específica de UX/UI para pulir ritmo, claridad, accesibilidad y estética.
6. Incremento 15: auditoría final de UX en teléfonos reales.

Figma puede ser útil después de tener el flujo jugable o cuando aparezca una decisión visual que bloquee claridad. No debe convertirse en prerrequisito para empezar a validar el juego.

---

# 11. Uso de skills y asistentes

Las skills pueden ayudar como apoyo de trabajo, pero no reemplazan las decisiones del corpus.

Uso recomendado:

* documentación: mantener documentos claros y consistentes;
* PWA: revisar base compatible en Incremento 0, manifest/instalación/standalone en Incremento 1, lifecycle/reconexión en Incremento 13, y service worker/cache/actualización/iOS/Android en Incremento 14;
* seguridad: revisar palabra secreta, votos, RLS, permisos de host y administrador;
* testing: diseñar pruebas por riesgo en vez de cobertura indiscriminada;
* frontend/UX: revisar ergonomía mobile y pantallas de juego cuando haya flujo real;
* revisión crítica: auditar supuestos antes de cerrar hitos importantes.

Si una skill no está disponible en una sesión concreta, se usa como referencia conceptual y no como dependencia obligatoria.

---

# 12. Decisiones diferidas

Estas decisiones no bloquean el Incremento 0.

* mecanismo exacto de invitación al grupo;
* comportamiento de conexión, reconexión avanzada y background móvil;
* estrategia de realtime para GameSession y fases posteriores;
* forma exacta de operaciones autoritativas en Supabase;
* esquema SQL y políticas RLS detalladas;
* limpieza automática de salas viejas;
* tolerancias precisas de desconexión;
* comportamiento de entrada o salida de jugadores durante una tanda;
* estrategia completa de service worker y cache;
* alcance exacto del shell offline seguro;
* diseño visual final;
* estadísticas;
* soporte de un segundo juego.

---

# 13. Observaciones del corpus

## Correcto

La separación entre Juegos Familiares e Impostor está bien preservada.

`Group`, `Player`, identidad, navegación y PWA pertenecen a plataforma.

Banco de palabras, sala, tanda, ronda, votos, impostor, marcador e historial pertenecen a Impostor.

## Correcto

Las reglas, el flujo, el modelo de estados y el modelo conceptual coinciden en los puntos críticos:

* 3 a 8 jugadores;
* caso principal de 4;
* exactamente un impostor;
* palabra no repetida dentro de una tanda;
* primera votación;
* segunda votación solo por empate;
* intento final del impostor;
* scoring simple;
* historial mínimo sin UI de estadísticas.

## Correcto

La arquitectura ya resolvió la elección de Supabase de forma proporcional al MVP.

El plan no debe reabrir esa comparación.

## Decisión pendiente

`technical-requirements.md` todavía dice que no define stack ni proveedor, mientras `architecture.md` ya define Supabase.

No es una contradicción práctica si se interpreta que `technical-requirements.md` es anterior o más abstracto, y `architecture.md` es la decisión posterior.

Corrección futura opcional: agregar una nota breve en requisitos técnicos indicando que la arquitectura ya eligió Supabase para el MVP.

## Decisión pendiente

El framework frontend exacto aparece como diferido en arquitectura.

Este plan propone cerrar Next.js antes del Incremento 0.

## Problema operativo a verificar

Antes de ejecutar Incremento 0 hay que confirmar el estado real de Git en la carpeta raíz.

Si la carpeta contiene restos de `.git` pero no es un repositorio válido, eso debe resolverse conscientemente antes de inicializar el repositorio.

---

# 14. Próximo paso recomendado

El siguiente paso lógico es cerrar las decisiones mínimas del Incremento 0:

* Next.js;
* `npm`;
* runner mínimo de tests;
* estrategia segura para inicializar el frontend en la raíz existente;
* workflow Git simple;
* estructura mínima inicial.

Después de eso, ejecutar Incremento 0.

No hace falta crear otro modelo conceptual antes de empezar.

El modelo de estados de la partida ya existe y es suficiente para orientar los incrementos funcionales.
