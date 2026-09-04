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
6. Presence para conexión/desconexión; liveness autoritativo separado para sucesión de host.

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

Estado: `ALCANZADO TÉCNICAMENTE`.

El cierre técnico del Incremento 12 completa el primer MVP jugable a nivel técnico. Incremento 13 cerró la robustez de reconexión autoritativa. Incremento 14 cerró el hardening PWA con smoke externo pendiente para Android/iOS real y multi-actor real. El candidato `a064ce2` quedó preparado en Vercel Preview. Siguen pendientes la aceptación manual pre-beta y la validación presencial completa del Incremento 15.

Este hito marca el:

```text
PRIMER MVP JUGABLE
```

## Hito E — Robustez y PWA

La experiencia se endurece para refresh, reconexión autoritativa, lifecycle móvil, service worker, cache apropiado, actualización, iOS, Android, seguridad, pruebas y pulido UX.

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

A.1 agrega una mejora de navegación de Platform sobre ese cierre: la portada
`/` reutiliza el bootstrap existente para expresar contexto reconocido
`Player -> Group` cuando lo hay, con acceso temporal a `/impostor/grupo` y a
Impostor. La portada sin contexto reconocido sigue siendo liviana y no crea
Auth, Player ni Group por renderizar.

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

Estado: cerrado.

El Incremento 4 se cerró en slices verificables. Room pertenece al dominio de Impostor y no se promueve a Platform.

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

Estado: cerrado.

#### Objetivo

Dejar la documentación de Room + Lobby coherente y lista para implementar.

#### Cierre

El corpus quedó alineado sobre Group vs Room, host, lifecycle `lobby | closed`, join, refresh, sincronización, seguridad y límites de alcance.

#### Resultado observable

El corpus define entidades, invariantes, lifecycle, join, refresh, sincronización, seguridad y límites sin requerir decisiones relevantes silenciosas en 4.1.

#### Fuera de alcance

Código, SQL, migrations, RPCs, RLS, Realtime y componentes.

#### Validación

Revisión cruzada del corpus, contradicciones documentadas y validación de formato del diff.

### Incremento 4.1 — Crear Room + host

Estado: cerrado.

#### Objetivo

Permitir que un Player válido cree una Room persistida.

#### Cierre

Se implementó `create_room()` sin argumentos de ownership, con creador como host y participante inicial, código único, estado `lobby` e idempotencia para recuperar la Room activa existente.

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

Estado: cerrado.

#### Objetivo

Permitir que otro Player del mismo Group entre por código o enlace.

#### Cierre

Se implementó `join_room_by_code(room_code)`, con Player y Group derivados desde `auth.uid()`, validación de mismo Group, rechazo de Room cerrada, join repetido idempotente y garantía técnica de una Room activa por Player.

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

Estado: cerrado.

#### Objetivo

Reconstruir la Room activa desde el contexto remoto después de refresh o apertura directa.

#### Cierre

Se implementó `get_my_active_room()` como lectura autoritativa sin parámetros, basada en el slot activo del Player y limitada a Rooms `lobby`.

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

Estado: cerrado.

#### Objetivo

Propagar cambios persistidos de participantes sin refresh manual.

#### Cierre

Se implementó sincronización de lobby con Supabase Realtime/Postgres Changes como invalidación, manteniendo `get_my_active_room()` como única fuente de verdad del estado visible.

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

Estado: cerrado.

#### Objetivo

Completar el flujo usable de Room + Lobby en mobile.

#### Cierre

Se implementó el flujo vertical completo: crear/unirse, lobby, reconstrucción tras refresh, sincronización Realtime, salida de no-host, cierre por host, cierre cuando el host abandona, liberación de slots, aislamiento y concurrencia básica de join/leave/close.

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

Alinear e implementar Presence básica de lobby y sucesión autoritativa de host sin confundir pertenencia, conexión, liveness y host.

### Resultado observable

Los jugadores ven de forma discreta quién está conectado o desconectado en el lobby.

Si el host deja de estar disponible más allá de una tolerancia inicial, el sistema puede asignar como nuevo host al participante disponible restante con `joinedAt` más antiguo.

Si el host original vuelve después de haber sido reemplazado, vuelve como participante normal y no recupera el host automáticamente.

El cambio de host se observa por el modelo ya vigente:

```text
estado persistido cambia
→ Realtime invalida
→ get_my_active_room() vuelve a leer
→ todos observan el nuevo host
```

Presence no se convierte en fuente de verdad del lobby persistente.

### Dominio involucrado

Impostor:

* `joinedAt`;
* `RoomParticipant` como pertenencia persistida a una Room;
* Presence efímera acotada a la Room activa;
* liveness autoritativo mínimo para validar staleness;
* `rooms.host_player_id` como host autoritativo persistido;
* sucesión de host.

### Infraestructura necesaria

* Supabase Realtime Presence para disponibilidad efímera `connected | disconnected` en el lobby;
* canal de Presence acotado internamente por `roomId`, no por `joinCode`;
* verificación de que solo un Player autenticado y RoomParticipant de esa Room participe u observe su Presence;
* señal remota verificable de liveness, conceptualmente `room_participants.last_seen_at` o equivalente técnico mínimo;
* lógica autoritativa, atómica/consistente y resistente a carreras para reasignar host.

### Contrato documental 5.0

Antes de implementar, el corpus debe cerrar estas separaciones:

```text
RoomParticipant = pertenencia persistida
Presence        = disponibilidad efímera
room_participants.last_seen_at = señal autoritativa mínima para validar staleness
rooms.host_player_id = host autoritativo persistido
```

Presence sabe qué conexiones activas publica Supabase para una Room activa. No sabe por sí sola si alguien abandonó la Room, no decide el host y no reemplaza `RoomParticipant`.

Postgres sabe quién pertenece a la Room, cuál es el host autoritativo y cuál fue la última señal remota verificable de liveness que la autoridad puede usar para decidir staleness.

El cliente decide cómo mostrar el estado visual discreto y puede solicitar una intención de sucesión cuando observa una condición candidata. El cliente no decide por sí mismo `host_player_id`.

La autoridad decide si el host está stale, quién es elegible y si corresponde actualizar `host_player_id`.

La hipótesis documental previa de 60 segundos queda reemplazada para la implementación inicial por un threshold técnico de 90 segundos, sujeto a validación mobile/background. No es una regla definitiva del juego ni una preferencia configurable.

Un evento de pérdida de Presence no equivale inmediatamente a abandono y no reasigna host de forma directa.

Varias conexiones del mismo Player, por ejemplo dos pestañas, representan un único Player lógico para `connected | disconnected`.

`last_seen_at` o su equivalente:

* sirve solo para validar staleness;
* no es el estado visual principal de Presence;
* no es historial;
* no se muestra al usuario;
* no implica auditoría de conexiones;
* no debe convertirse en infraestructura genérica.

### Subincrementos previstos

#### Incremento 5.0 — Contrato documental de Presence y sucesión

Estado: `CERRADO`.

Objetivo:

```text
cerrar corpus documental antes de implementar
```

Incluye:

* separación pertenencia/conexión/liveness/host;
* regla de no confiar en Presence como autoridad de host;
* registro de la hipótesis documental inicial de 60 segundos, reemplazada en 5.2 por 90 segundos para la implementación inicial;
* alcance estricto de lobby y Room activa;
* límites explícitos frente a reconexión avanzada.

#### Incremento 5.1 — Presence básica del lobby

Estado: `CERRADO`.

Objetivo:

```text
mostrar connected/disconnected discreto para participantes de la Room activa
```

Incluye:

* canal interno acotado por `roomId`;
* deduplicación lógica por Player ante varias pestañas;
* autorización de observación/participación limitada a RoomParticipants;
* estado visual no autoritativo.

Validación cerrada:

* tests y validadores automáticos de lógica/autorización relevante;
* Presence privada por Room activa con `Allow public access` deshabilitado;
* smoke manual productivo multi-sesión;
* desconexión, reconexión, refresh, lifecycle y mobile revisados.

No incluye `last_seen_at`, heartbeat persistido, threshold de stale, definición autoritativa de stale ni sucesión de host.

#### Incremento 5.2 — Liveness autoritativo mínimo

Estado: `CERRADO`.

Objetivo:

```text
introducir señal remota verificable para validar staleness
```

Incluye:

* `room_participants.last_seen_at`;
* inicialización de nueva participación con `last_seen_at = now()`;
* backfill acotado a Rooms en `lobby`, sin fabricar liveness activo para Rooms cerradas;
* RPC autoritativa `refresh_my_room_liveness()`;
* actualización acotada al participante autenticado, derivando `auth.uid() -> Player -> active Room -> RoomParticipant propio`;
* rechazo o no-op si no hay Auth válida, no existe Player, no existe Room activa, el Player no pertenece a la Room o la Room no está en `lobby`;
* timestamp server-side/Postgres, sin `player_id`, `room_id` ni timestamp enviados por cliente;
* heartbeat inicial cada 30 segundos mientras el lobby esté activo;
* refresh al establecer/reconstruir lobby, al establecer Presence y al volver a foreground;
* throttling técnico aproximado de 10 segundos para evitar escrituras redundantes;
* definición backend de active/stale con threshold inicial de 90 segundos;
* liveness por Player-en-Room, no por tab/conexión;
* no mostrar métricas técnicas al usuario.

No incluye elección de sucesor, modificación de `host_player_id`, RPC de sucesión, locks/concurrencia de sucesión, feedback visual de nuevo host, recuperación del host reemplazado, historial, auditoría ni infraestructura genérica de conexiones.

Validación cerrada:

* unit/frontend tests, lint, build y `git diff --check`;
* validadores 4.5, 5.1 y 5.2;
* migration remota `20260823120000_room_liveness_5_2.sql` aplicada y alineada con historial local;
* smoke productivo específico de liveness con dos participantes;
* comprobación de inicialización, refresh propio, throttle, heartbeat, active/stale, seguridad y Room cerrada;
* comprobación de que `rooms.host_player_id` no cambia;
* cleanup del dataset de smoke por IDs exactos.

#### Incremento 5.3 — Sucesión autoritativa de host

Estado: `CERRADO`.

Objetivo:

```text
reasignar host de forma consistente cuando el host esté stale
```

Incluye:

* RPC autoritativa `reassign_room_host_if_stale()`;
* `SECURITY DEFINER` sin argumentos de ownership;
* identidad derivada desde `auth.uid() -> Player -> active Room`;
* threshold inicial de 90 segundos definido en 5.2;
* evaluación server-side del host actual y de su liveness;
* selección server-side del participante disponible restante con `joinedAt` más antiguo;
* desempate técnico determinístico por `player_id ASC`;
* actualización autoritativa de `rooms.host_player_id`;
* locking transaccional, revalidación, consistencia ante concurrencia e idempotencia;
* trigger cliente acotado, recheck lento de 30 segundos y single-flight por instancia cliente;
* propagación mediante `rooms UPDATE`, Postgres Changes, invalidación y `get_my_active_room()`;
* feedback breve cuando cambia el host;
* host original vuelve como participante normal.

Regla implementada:

```text
si host actual está stale:
  candidatos = RoomParticipants restantes
  excluir host actual
  excluir participantes stale
  ordenar por joined_at ASC, player_id ASC
  persistir exactamente un candidato como rooms.host_player_id
```

`player_id` es solo desempate técnico determinístico. No es criterio visible de producto.

Si el host está fuera de Presence pero `last_seen_at` todavía está active, no hay sucesión. Presence puede disparar una solicitud de evaluación, pero no decide stale ni sucesor.

Si el host está stale y no hay candidatos active, la operación es no-op: la Room sigue `lobby`, el host actual permanece persistido, `host_player_id` no queda `null` y la Room no se cierra automáticamente.

Si el host original vuelve después de ser reemplazado, refresca liveness como participante normal y no recupera el rol automáticamente. No hay `previous_host`, historial de hosts ni prioridad especial del host original.

Validación cerrada:

* auditoría local, `npm test` completo, lint, build y `git diff --check`;
* validadores 4.5, 5.1, 5.2 y 5.3;
* concurrencia con dos callers y con B/C/D simultáneos;
* una sola transición efectiva, convergencia al mismo candidato determinístico e idempotencia posterior;
* revival vs sucesión según orden de serialización: si refresh gana no hay cambio; si sucesión gana, el host anterior vuelve como participante;
* migration remota `20260823130000_host_succession_5_3.sql` aplicada y alineada;
* commit productivo `5a68199 feat(impostor): add authoritative host succession`;
* smoke productivo `SmokeHost53-mt6bcmij` PASS con cleanup completo y sin residuos.

#### Incremento 5.4 — UX + hardening mobile/concurrencia

Estado: `ABSORBIDO EN INCREMENTO 13`.

La implementación vigente de Presence/liveness/sucesión se mantiene sin cambios.

Las pruebas físicas mobile definidas para hardening quedaron absorbidas por el contrato de reconexión autoritativa y la validación 13.1-13.5. El cierre final de Incremento 13 no detectó defectos funcionales ni hardening adicional necesario.

Los timings vigentes se aceptan provisionalmente hasta esa validación física:

```text
heartbeat liveness ~= 30s
stale threshold = 90s
succession recheck ~= 30s
```

Incremento 13 validó:

* background breve;
* background 30-60s;
* ausencia >90s;
* sucesión real tras suspensión;
* retorno del host original;
* lock screen;
* app switching;
* microcorte/offline + reconnect;
* refresh/reconstrucción;
* multiple tabs/connections;
* comportamiento final de 30s/90s/30s.

Objetivo:

```text
pulir experiencia y validar comportamiento en navegadores móviles
```

Incluye:

* validación mobile/background de los parámetros técnicos iniciales;
* pruebas adicionales en dispositivos reales con múltiples pestañas, background/foreground y reconexión;
* ajuste fino de UX si la experiencia real lo requiere;
* observación de edge cases de concurrencia en entorno móvil real.

No muestra heartbeat, `last_seen_at`, métricas técnicas ni controles de tolerancia.

### Decisiones técnicas restantes

La decisión principal de sucesión quedó cerrada en 5.3. Lo restante absorbido por 13 es hardening y validación mobile/concurrencia, no rediseño de autoridad ni gameplay.

5.1-5.3 ya proveen la arquitectura funcional necesaria de Room, RoomParticipant, Presence, liveness y sucesión de host. La validación heredada de 5.4 quedó incorporada al cierre de Incremento 13 y no representa una capacidad de dominio faltante para gameplay.

### Tests / validación

5.1 ya validó:

* Presence básica privada para participantes de una Room activa;
* connected/disconnected visible y accesible en lobby;
* múltiples conexiones del mismo Player como un único Player lógico;
* pérdida de Presence sin abandono ni cambio de host;
* refresh y lifecycle existentes sin regresión;
* autorización negativa para no participantes, otro Group y sin Auth;
* smoke manual productivo multi-cliente y revisión mobile.

5.2 ya validó:

* DB: inicialización de `last_seen_at` al crear Room y al unirse;
* DB/RPC: refresh propio autorizado y derivado desde `auth.uid()`;
* DB/RPC: rechazo/no-op sin Auth, sin Player, sin Room activa, sin pertenencia o con Room cerrada;
* DB/RPC: cliente no controla `player_id`, `room_id` ni timestamp;
* DB: `last_seen_at null` se considera stale;
* DB: active/stale usa `now()` server-side y threshold de 90 segundos;
* frontend: heartbeat cada 30 segundos solo con lobby activo;
* frontend: refresh al reconstruir lobby, al establecer Presence y al volver a foreground;
* frontend: múltiples pestañas pueden refrescar la misma fila sin modelo por tab;
* integración: pérdida de Presence no reasigna de inmediato ni modifica `rooms.host_player_id`.

5.3 ya validó:

* selección de nuevo host por `joinedAt ASC, player_id ASC`;
* host stale después del threshold dispara reasignación autoritativa;
* host fuera de Presence pero liveness active no dispara sucesión;
* dos o más clientes intentando reasignar no generan dos hosts;
* sin candidatos active produce no-op y conserva Room `lobby`;
* host original que vuelve no recupera automáticamente el rol.

Incremento 13 cerró la validación de:

* iOS Safari: background, lock screen, app switching, reconnect y retorno;
* Android Chrome: background, lock screen, app switching, reconnect y retorno;
* desktop: multiple tabs/connections, refresh y reconnect repetido;
* observar la cadencia 30s/90s/30s en dispositivos reales sin presentarla todavía como validada ni defectuosa;
* comportamiento de feedback durante recuperación sin detectar un bloqueo funcional.

### Riesgos

* sobreconfiar en presencia móvil;
* reasignar host demasiado rápido;
* generar dos hosts por carrera;
* intentar resolver reconexión avanzada demasiado temprano.

### Fuera de alcance

* recuperación completa en mitad de ronda;
* experiencia PWA instalada completa, service worker, cache y update lifecycle;
* tolerancias configurables;
* auditoría histórica de conexión;
* reglas complejas para abandono.
* GameSession;
* `START_SESSION`;
* mínimo de 3 jugadores;
* `availableWords` como guard de inicio;
* roles, palabra secreta, ready, votación y scoring;
* recovery en mitad de partida;
* Presence histórica;
* host manual;
* expulsar jugadores;
* expiración/cleanup automático de Rooms.

### Criterio de terminado

El lobby puede distinguir disponibilidad efímera, conservar pertenencia persistida y sobrevivir a la indisponibilidad del host manteniendo un único host persistido y consistente.

### Conceptos a aprender

* presencia efímera;
* diferencia entre conexión y pertenencia;
* diferencia entre Presence y liveness autoritativo;
* eventos de navegador móvil;
* consistencia de una elección autoritativa.

---

## Incremento 6 — Iniciar tanda y preparar ronda privada

### Objetivo

Permitir que el host actual inicie una tanda y que el sistema prepare la primera ronda con roster congelado, palabra e impostor seleccionados autoritativamente.

### Resultado observable

Con al menos tres participantes autoritativamente activos y al menos una palabra disponible, el host actual inicia la tanda.

Cada dispositivo recibe solamente su información privada:

* jugadores normales ven la palabra;
* impostor ve `IMPOSTOR` y no recibe la palabra.

La Room pasa de `lobby` a `playing` y deja de admitir nuevos joins.

### Dominio involucrado

Impostor:

* `GameSession`;
* `SessionPlayer`;
* `Round`;
* `Room.status = playing`;
* palabra no usada;
* impostor balanceado;
* vista privada derivada para cada caller.

### Infraestructura necesaria

* operación autoritativa para iniciar tanda y preparar Round 1;
* persistencia operativa de sesión, jugadores de sesión y ronda;
* autorización del host actual desde `auth.uid() -> Player -> Room -> rooms.host_player_id`;
* lectura compartida sin secretos;
* lectura privada autoritativa del caller;
* serialización coherente sobre la Room.

### Decisiones técnicas a cerrar

* forma concreta de operación autoritativa compatible con Supabase;
* forma física mínima de `GameSession`, `SessionPlayer` y `Round`;
* cómo conservar snapshot de palabra en Round sin decidir más historial del necesario;
* cómo exponer la vista privada sin enviar palabra al impostor ni impostor a jugadores normales;
* cómo asegurar idempotencia ante doble toque, retry o respuesta perdida;
* cómo serializar `START_SESSION` frente a join, leave, close y sucesión de host.

### Tests / validación

* unit tests de selección balanceada de impostor;
* unit tests de selección de palabra no usada;
* integración: no inicia con menos de tres jugadores;
* integración: no inicia sin palabras disponibles;
* integración/privacidad: el impostor no puede obtener la palabra;
* integración/autorización: solo el host actual inicia;
* integración/idempotencia: doble tap o retry no crea dos GameSessions ni dos Rounds 1;
* integración/concurrencia: `START_SESSION` vs join/leave/close/host succession converge de forma coherente;
* prueba manual con cuatro teléfonos.

### Riesgos

* filtrar la palabra al impostor;
* filtrar el impostor a jugadores normales;
* dejar ronda parcial sin palabra o sin impostor;
* permitir doble creación de ronda;
* usar el cliente como autoridad por conveniencia.

### Fuera de alcance

* acknowledgement persistido de rol;
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

### Subincrementos

Estado de cierre documental:

```text
6.0 — CERRADO
6.1 — CERRADO
6.2 — CERRADO
6.3 — CERRADO
6.4 — CERRADO
6.5 — CERRADO
```

El Incremento 6 queda técnicamente cerrado. Queda pendiente, sin bloquear el cierre técnico, la validación manual multi-dispositivo del flujo completo de inicio de tanda y revelación privada.

#### Incremento 6.0 — Contrato documental

Objetivo:

```text
cerrar documentalmente el contrato de iniciar tanda y preparar Round 1
```

Resultado observable:

El corpus describe inequívocamente:

```text
Group → Room → GameSession → SessionPlayers + Rounds
Room.status = lobby | playing | closed
Room 1 → 0..1 GameSession
START_SESSION lobby → playing
GameSession.state = ROLE_REVEAL
```

Dominio:

* separación Group / Room / GameSession / Round;
* `SessionPlayer` como roster congelado;
* Room sigue siendo autoridad de host y membership;
* privacidad compartida vs privada;
* palabra snapshot;
* exactamente un impostor por Round.

Infraestructura:

No implementa infraestructura. Solo deja preparado el contrato para implementación posterior.

Tests / validación futura:

* revisión documental de consistencia;
* `git diff --check`;
* verificar que no se definan tablas, migrations, RPCs ni SQL concretos.

Fuera de alcance:

* código;
* migrations;
* Supabase;
* tests;
* UI.

Criterio de terminado:

La documentación vigente permite implementar 6.1 sin reabrir decisiones de dominio de 6.0.

#### Incremento 6.1 — Persistencia mínima de GameSession y SessionPlayer

Objetivo:

```text
introducir el soporte operativo mínimo para representar una tanda y su roster congelado
```

Resultado observable:

Existe una representación persistida mínima de:

```text
GameSession
- id
- roomId
- startedAt

SessionPlayer
- sessionId
- playerId
```

Dominio:

* una Room produce como máximo una GameSession;
* `SessionPlayer` no se deriva dinámicamente de `RoomParticipant`;
* no se agrega score, ready, voteSubmitted ni historial final.

Infraestructura:

* persistencia mínima;
* constraints o garantías equivalentes para una GameSession por Room;
* tablas cerradas para cliente hasta que exista una API de gameplay concreta;
* ninguna API de producto crea todavía GameSessions ni SessionPlayers.

Tests / validación futura:

* estructura mínima;
* unicidad de GameSession por Room;
* integridad de Group entre Room, GameSession, SessionPlayer y Player;
* RLS activo sin grants ni policies de producto;
* rechazo/no visibilidad para clientes normales.

Fuera de alcance:

* `GameSession.state`;
* `START_SESSION`;
* selección de palabra;
* selección de impostor;
* Round 1;
* UI completa.

Criterio de terminado:

El sistema puede representar físicamente una tanda y su roster congelado sin adelantar comportamiento de inicio, ronda, secretos ni lectura de gameplay.

#### Incremento 6.2 — Lifecycle de Room preparado para gameplay

Objetivo:

```text
preparar Room para representar lobby | playing | closed sin romper invariantes existentes
```

Resultado observable:

El backend puede representar correctamente una Room en `playing` sin liberar slots, sin permitir que un Player cree o entre a una segunda Room, sin perder reconstrucción compartida, sin perder membership, y sin desactivar liveness, Presence ni sucesión de host.

No hace falta que el usuario pueda provocar `playing` desde UI en este slice.

Dominio:

* `Room.status = lobby | playing | closed`;
* Room activa significa `lobby` o `playing`;
* una Room en `playing` no admite nuevos joins;
* `RoomParticipant` sigue siendo membership de Room durante gameplay;
* `rooms.host_player_id` sigue siendo la autoridad de host durante gameplay.

Infraestructura:

* ajustar `rooms.status` para admitir `playing`;
* ajustar slots para que `lobby -> playing` mantenga `player_active_room_slots`;
* liberar slots al cerrar, incluido `playing -> closed`;
* hacer que `create_room()` trate `playing` como Room activa existente y no cree una segunda Room;
* mantener `join_room_by_code()` limitado a `lobby`;
* hacer que `get_my_active_room()` reconstruya `lobby` y `playing` sin secretos de gameplay;
* hacer explícito que `leave_room()` y `close_room()` son operaciones de lobby y no modifican membership/lifecycle durante `playing`;
* ajustar RLS de `room_participants` para lectura autorizada en `lobby` y `playing`;
* mantener `room_participants.last_seen_at` como liveness autoritativo en `playing`;
* mantener Presence como UX efímera en `playing` si sus helpers estaban limitados a `lobby`;
* mantener host succession en `lobby` y `playing`;
* reutilizar Realtime como invalidación (`rooms UPDATE -> lectura autoritativa`) sin infraestructura nueva;
* mantener `game_sessions` y `session_players` cerradas para cliente.

Tests / validación futura:

* `lobby -> playing` mantiene slots;
* `playing -> closed` libera slots;
* `create_room()` con Room en `playing` no crea una segunda Room;
* `join_room_by_code()` contra Room en `playing` rechaza el ingreso;
* `get_my_active_room()` reconstruye Room en `playing`;
* `leave_room()` en `playing` no elimina membership ni cierra gameplay;
* `close_room()` en `playing` no cierra gameplay;
* RLS permite a participantes leer membership de Room en `playing`;
* liveness sigue funcionando en `playing` con el umbral vigente de 90 segundos;
* host succession sigue funcionando en `playing`;
* Presence sigue funcionando en `playing` como estado efímero;
* `game_sessions` y `session_players` siguen sin acceso directo de cliente.

Fuera de alcance:

* `start_session()`;
* creación de GameSession desde producto;
* snapshot de SessionPlayers desde producto;
* selección de palabra;
* selección de impostor;
* Round;
* `GameSession.state`;
* `ROLE_REVEAL`;
* lectura privada;
* botón Iniciar tanda;
* UI de gameplay;
* Realtime de gameplay;
* vista privada;
* acknowledgement persistido de rol.

Criterio de terminado:

El lifecycle físico de Room puede avanzar a `playing` de forma consistente y reversible hacia `closed`, sin adelantar gameplay ni crear estados de tanda durables incompletos.

#### Incremento 6.3 — START_SESSION atómico, snapshot y Round 1 privada

Objetivo:

```text
implementar START_SESSION como operación atómica completa hasta ROLE_REVEAL
```

Resultado observable:

El host actual inicia la tanda desde una Room en `lobby`. En una única operación autoritativa se congela el roster, se selecciona palabra e impostor, se crea Round 1, la Room pasa a `playing` y la GameSession queda en `ROLE_REVEAL`.

Dominio:

* el caller debe ser `rooms.host_player_id` actual;
* el roster se forma desde `RoomParticipant` + liveness autoritativo;
* Presence no decide el roster;
* mínimo de 3 evaluado sobre SessionPlayers que se van a congelar;
* palabra seleccionada server-side;
* palabra elegible = pertenece al Group y no fue usada antes en la misma GameSession;
* Round conserva `secretWord` y `normalizedSecretWord` como snapshot conceptual;
* selección de impostor balanceada por conteos derivados dentro de la GameSession;
* Round 1 parte de todos los SessionPlayers empatados en cero.

Infraestructura:

* operación autoritativa derivada desde `auth.uid()`;
* serialización/locking coherente sobre Room;
* refresh de `last_seen_at` del caller con `observed_at := now()` antes del snapshot;
* selección autoritativa y aleatoria;
* creación de GameSession;
* creación de SessionPlayers;
* garantía de una Round número 1 por GameSession;
* introducción de `GameSession.state` con estado inicial persistido válido `ROLE_REVEAL`;
* idempotencia ante retry/doble tap;
* rollback total si falla cualquier paso.

Tests / validación futura:

* `START_SESSION` happy path;
* no inicia con menos de 3 participantes autoritativamente activos;
* snapshot exacto;
* jugadores stale quedan excluidos;
* liveness del caller se refresca antes del snapshot;
* no host no inicia;
* Group admin no inicia por ser admin;
* creador original no inicia si ya no es host;
* doble start/retry produce una sola GameSession y una sola Round 1;
* `START_SESSION` vs join/leave/close/sucesión converge según orden serializado;
* no inicia sin palabras;
* palabra pertenece al Group;
* no repite palabra dentro de la GameSession;
* exactamente un impostor;
* selección balanceada respeta menor conteo;
* crea Round 1;
* deja `GameSession.state = ROLE_REVEAL`;
* no queda estado parcial: Room playing sin Round, GameSession sin Round, Round sin palabra, Round sin impostor o GameSession sin SessionPlayers.

Fuera de alcance:

* nuevas rondas;
* scoring;
* historial;
* entidad persistente `RoundPlayerAssignment`.

Criterio de terminado:

`START_SESSION` queda implementado como una operación atómica completa: si falla cualquier guard, la Room sigue en `lobby` y no existen GameSession, SessionPlayers ni Round parciales; si tiene éxito, el estado observable inicial es `ROLE_REVEAL`.

#### Incremento 6.4 — Lectura compartida, vista privada y sincronización mínima

Objetivo:

```text
permitir reconstruir estado compartido seguro y vista privada del caller
```

Resultado observable:

Cada participante puede reconstruir la Room en `playing` y recuperar solo su información privada:

```text
jugador normal → role = player, word = secretWord
impostor → role = impostor
```

Dominio:

* estado compartido sin secretos;
* vista privada autoritativa por caller;
* `get_my_active_room()` conserva responsabilidad de Room, host, participants y lifecycle;
* lectura privada conceptual equivalente a `GET_MY_GAME_STATE`.

Infraestructura:

* lectura compartida segura;
* lectura privada derivada desde `auth.uid() -> Player -> Room -> GameSession -> SessionPlayer -> Round actual`;
* Realtime como invalidación o cambio compartido seguro, sin transmitir secretos globalmente.

Tests / validación futura:

* jugador normal recibe palabra y no impostor;
* impostor no recibe palabra;
* ningún jugador consulta estado privado ajeno;
* Realtime no emite payload global con `secretWord` ni `impostorPlayerId`;
* refresh/reconstrucción recupera estado correcto.

Fuera de alcance:

* Broadcast específico;
* ACK persistido de rol;
* transición a `discussion`;
* votación.

Criterio de terminado:

La pantalla de revelación de rol puede reconstruirse de forma segura después de refresh.

#### Incremento 6.5 — UI vertical, endurecimiento y auditoría

Objetivo:

```text
conectar el flujo visible de lobby a revelación privada de Round 1 y auditar seguridad/consistencia
```

Resultado observable:

El host inicia la tanda desde el lobby y cada teléfono llega a su vista privada de `ROLE_REVEAL`.

Dominio:

* flujo vertical mínimo hasta Round 1;
* mensajes claros para guards fallidos;
* Room en `playing` sin ingreso posterior.

Infraestructura:

* integración frontend con operaciones de 6.1-6.4;
* manejo de loading, retry y respuesta perdida;
* refetch autoritativo tras invalidaciones.

Tests / validación futura:

* componentes/flujo de iniciar tanda;
* e2e o integración vertical con host y participantes;
* prueba manual con cuatro teléfonos;
* auditoría de que secretos no aparecen en estado compartido, logs ni payloads globales.

Validación final de cierre:

* Supabase reset local;
* DB tests locales;
* validators 6.1-6.4;
* unit/render tests;
* TypeScript;
* Next build;
* lint;
* `git diff --check`.

Resultado automatizado conocido de la auditoría final 6.5:

```text
35 test files
333 tests
```

Validación manual pendiente:

```text
PENDIENTE — validación manual multi-dispositivo de Incremento 6
```

Casos pendientes:

* A/B/C en dispositivos o sesiones independientes;
* host inicia tanda;
* todos reciben role reveal;
* exactamente uno ve impostor;
* jugadores normales ven la misma palabra;
* refresh por cliente reconstruye el mismo rol;
* host succession durante `role_reveal`;
* D excluido si se reproduce el caso de liveness stale.

Esto no cerraba la validación mobile/concurrencia heredada de 5.4. Desde 13.0, esa validación queda absorbida por Incremento 13.

Fuera de alcance:

* acknowledgement persistido de rol;
* transición `ROLE_REVEAL → DISCUSSION`;
* votación;
* scoring;
* `END_SESSION`;
* rejoin avanzado.

Criterio de terminado:

La primera ronda privada está preparada y visible para cada participante correcto, sin ampliar alcance hacia la transición `role_reveal → discussion` del Incremento 7.

---

## Incremento 7 — Transición de role reveal a discussion

### Objetivo

Permitir que el host actual avance la ronda desde la revelación privada de rol hacia la conversación presencial, sin persistir confirmaciones individuales.

El Incremento 7 adopta explícitamente la decisión de no digitalizar el `ready` verbal del grupo para el MVP:

```text
role_reveal
→ host pulsa "Empezar ronda"
→ discussion
```

No se implementan:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

La coordinación de que todos hayan visto su rol ocurre presencialmente. El grupo puede resolver verbalmente:

```text
¿Estamos todos?
```

Persistir acknowledgements individuales agregaría estado distribuido, casos de refresh, bloqueos por disconnect y sincronización adicional sin aportar suficiente valor al MVP presencial.

### Resultado observable

Durante `role_reveal`, cada jugador sigue usando el reveal local:

```text
Tu rol está listo
→ Ver mi rol
```

El host actual pulsa:

```text
Empezar ronda
```

La GameSession pasa de:

```text
role_reveal
→ discussion
```

Todos los SessionPlayers reconstruyen la fase mediante `get_my_game_state()`. En `discussion`, la UI comunica que la ronda está en juego y permite volver a consultar localmente la palabra o rol privado mediante una acción explícita.

### Dominio involucrado

Impostor:

* `ROLE_REVEAL`;
* `DISCUSSION`;
* transición host-driven `role_reveal → discussion`;
* privacidad de palabra/rol durante conversación presencial.

### Infraestructura implementada

* ampliación de `GameSession.state` para admitir `discussion`;
* RPC autoritativa específica `start_round_discussion()`;
* autorización de host actual;
* read model privado compatible con `role_reveal | discussion`;
* polling lento de `get_my_game_state()` mientras `Room.status = playing`.

### Decisiones técnicas cerradas

Decisiones cerradas por 7.0:

* no persistir acknowledgement de rol;
* no agregar `Round.status`;
* mantener la fase global en `GameSession.state`;
* usar `discussion`, no `playing`, como estado de GameSession;
* usar RPC específica 0-args `start_round_discussion()`, no `advance_round_phase()`;
* sincronizar inicialmente por polling autoritativo, no por Realtime de tablas privadas ni Broadcast.

Contrato implementado de `start_round_discussion()`:

```text
authenticated caller
Player válido
active Room
Room.status = playing
caller = current rooms.host_player_id
caller ∈ SessionPlayers
GameSession coherente
current GameSession.state = role_reveal
current Round coherente
```

Semántica:

```text
state = role_reveal
→ state = discussion
→ advanced = true
```

Retry:

```text
state = discussion
→ no-op exitoso
→ already_in_phase = true
```

Otro estado debe tratarse como transición inválida.

Orden conceptual de locking:

```text
resolver active Room
→ lock Room FOR UPDATE
→ validar current host
→ resolver/lock GameSession
→ transition
```

La fila de Room sigue siendo el lock principal para no invertir el orden vigente del lifecycle y la sucesión de host.

La sincronización de 7 usa:

```text
polling lento
→ get_my_game_state()
→ authoritative state
```

Valor inicial sugerido:

```text
aproximadamente cada 3 segundos
```

Es detalle técnico configurable, no regla de producto permanente. Cuando el host ejecuta exitosamente `start_round_discussion()`, su cliente hace un refetch autoritativo inmediato en lugar de esperar al siguiente tick.

### Tests / validación

* integración: solo el host actual puede iniciar `discussion`;
* integración: un sucesor legítimo puede iniciar `discussion`;
* integración: un RoomParticipant excluido no obtiene gameplay privado ni autoridad;
* integración: doble click/retry en `discussion` es no-op exitoso;
* integración: `get_my_game_state()` reconstruye `role_reveal | discussion`;
* validación técnica automatizada de backend, wrapper, polling, UI y privacidad;
* validación de refresh/reconnect durante `role_reveal` y `discussion`;
* revisión de privacidad: no se expone `impostor_player_id`, `normalized_secret_word` ni roles de otros.

### Riesgos

* avanzar de fase con un actor que ya no es host;
* confundir `Room.status = playing` con `GameSession.state = discussion`;
* mostrar accidentalmente información privada durante re-reveal local;
* polling demasiado agresivo o demasiado lento;
* introducir Realtime/Broadcast antes de necesitarlo.

### Fuera de alcance

* `roleAcknowledged`;
* `role_acknowledged_at`;
* `allRolesSeen`;
* temporizador;
* orden de habla;
* control digital de conversación;
* botón funcional o falso de `Ir a votación`;
* votación.

### Criterio de terminado

La ronda puede pasar de información privada a conversación presencial con una fase compartida consistente:

```text
role_reveal
→ discussion
```

El host actual inicia la fase, todos los SessionPlayers la reconstruyen, reconnect reconstruye `discussion`, la vista privada sigue protegida y cada jugador puede volver a consultar localmente su palabra/rol sin persistir ese reveal.

### Conceptos a aprender

* estado global vs estado individual;
* transición host-driven;
* idempotencia;
* polling como sincronización simple;
* recuperación simple de pantalla.

#### Incremento 7.0 — Contrato documental

Objetivo:

```text
documentar el contrato role_reveal → discussion
```

Debe cerrar:

* sin persisted acknowledgement;
* transición controlada por host actual;
* `discussion` como estado de `GameSession`;
* fase global en `GameSession.state`, sin `Round.status`;
* RPC específica `start_round_discussion()`;
* polling lento de `get_my_game_state()`;
* sin Realtime de tablas privadas;
* sin Broadcast;
* sin voting.

Estado:

```text
CERRADO
```

#### Incremento 7.1 — Backend role_reveal → discussion

Incluye de forma coherente:

* `GameSession.state` admite `discussion`;
* `start_round_discussion()`;
* `get_my_game_state()` puede leer `discussion`;
* tests DB/security/idempotencia.

No debe dejar un backend capaz de entrar en `discussion` que el read model vigente no pueda reconstruir.

Estado:

```text
CERRADO
```

#### Incremento 7.2 — Client API + polling de estado

Incluye:

* wrapper cliente de transición;
* tipos TypeScript para `discussion`;
* polling autoritativo de `get_my_game_state()`;
* refetch inmediato para el host tras transición exitosa;
* hardening de race/unmount/stale response.

Estado:

```text
CERRADO
```

#### Incremento 7.3 — UI vertical discussion

Incluye:

* acción host `Empezar ronda`;
* pantalla `discussion`;
* re-reveal privado local de palabra/rol;
* ausencia de CTA funcional o falso de votación.

Estado:

```text
CERRADO
```

#### Incremento 7.4 — Hardening, auditoría y validación

Cubre:

* host succession;
* retry/doble click;
* offline/reconnect;
* RoomParticipant excluido;
* polling;
* privacidad;
* validación técnica final.

Estado:

```text
CERRADO
```

Pendiente fuera del cierre técnico:

```text
validación manual multi-dispositivo de Incremento 7
```

Estado final del Incremento 7:

```text
7.0 — CERRADO
7.1 — CERRADO
7.2 — CERRADO
7.3 — CERRADO
7.4 — CERRADO

INCREMENTO 7 — CERRADO TÉCNICAMENTE
```

---

## Incremento 8 — Primera votación

### Objetivo

Convertir la transición `discussion → voting_first` y la primera votación secreta en un vertical autoritativo completo:

```text
discussion
→ voting_first
→ voto secreto de todos los SessionPlayers
→ resolución automática de la primera votación
→ resultado agregado
→ tie_discussion | impostor_guess | round_result
```

El Incremento 8 no introduce `Round.status`: la fase global de gameplay continúa perteneciendo a `GameSession.state`.

### Resultado observable

El host actual inicia la votación desde `discussion` mediante:

```text
start_round_voting()
```

La RPC no recibe parámetros, usa `rooms.host_player_id` actual como autoridad y es idempotente frente a retry/lost response coherente.

Cada jugador vota por otro participante.

No se muestran resultados parciales.

Cuando todos los `SessionPlayers` votan, se revela el resultado agregado.

La resolución de la primera votación produce una de tres ramas:

* empate en el máximo → `tie_discussion`;
* impostor único más votado → `impostor_guess`;
* otro jugador único más votado → `round_result`.

En empate, Incremento 8 solo detecta el empate, muestra el agregado y deja registrados los votos de primera vuelta desde los que Incremento 9 reconstruye los candidatos empatados. No inicia ni resuelve todavía la segunda votación.

### Dominio involucrado

Impostor:

* `voting_first`;
* `RoundVote` / futura tabla `round_votes`;
* voto secreto;
* un voto por voter, Round y etapa de votación;
* conteo autoritativo;
* empate en el máximo;
* acusado único;
* transición a `tie_discussion`, `impostor_guess` o `round_result`.

### Infraestructura necesaria

* persistencia operativa de votos;
* distinción conceptual de `voting_round = 1 | 2`, aunque Incremento 8 solo use `1`;
* restricción estructural de un voto por `voter_player_id`, `round_id` y `voting_round`;
* validación estructural de `voter ∈ SessionPlayers`, `target ∈ SessionPlayers`, `voter != target`;
* RPC `submit_round_vote(target_player_id uuid)` que deriva caller, Player, GameSession, Round y voter desde `auth.uid()`;
* extensión discriminada de `get_my_game_state()` para `voting_first` y resultados posteriores;
* operación autoritativa de conteo dentro de la misma operación lógica que registra el último voto;
* polling lento vigente de `get_my_game_state()` como sincronización de gameplay.

### Decisiones técnicas a cerrar

Decisiones cerradas para el contrato de Incremento 8:

* `GameSession.state` incorpora `voting_first`; la resolución puede llevar a `tie_discussion`, `impostor_guess` o `round_result`;
* todos los `SessionPlayers` de la GameSession votan; no se usa Presence, liveness ni RoomParticipants conectados como denominador;
* el impostor vota como cualquier `SessionPlayer`;
* el host vota y no tiene voto especial;
* no se permite auto-voto;
* no se puede cambiar el voto una vez registrado;
* retry del mismo voto puede ser éxito idempotente o recuperación equivalente; intento de cambiar target debe rechazarse;
* no se muestran resultados parciales ni votos individuales ajenos;
* el host no recibe privilegios informativos sobre votos;
* `round_votes` permanece privada al cliente, sin SELECT/INSERT/UPDATE directos ni Realtime/Postgres Changes;
* `get_my_game_state()` sigue siendo la vista autorizada del caller y no una descarga genérica del estado interno;
* el último voto dispara la resolución automática; no existe una RPC manual de cierre de primera votación;
* un `SessionPlayer` desconectado sigue perteneciendo a la tanda, sigue siendo candidato y puede votar si vuelve; si no votó y no vuelve, la primera versión puede quedar esperando.

La espera indefinida por un `SessionPlayer` ausente queda registrada como limitación conocida/política pendiente de hardening. No se resuelve silenciosamente mediante Presence, timeout, host override, expulsión o votación solo con conectados.

### Tests / validación

* unit tests de conteo con empate máximo, impostor único más votado y otro jugador único más votado;
* unit tests de no auto-voto;
* unit tests de inmutabilidad del voto;
* integración: un `SessionPlayer` vota una sola vez por Round y etapa;
* integración: el impostor también vota;
* integración/privacidad: no se consultan votos individuales ajenos;
* integración: no se muestran resultados parciales;
* integración: denominador de completion = `SessionPlayers`, no Presence/liveness;
* concurrencia básica: votos simultáneos no duplican resolución;
* lost-response/recovery: start voting y submit vote se recuperan con `get_my_game_state()`;
* e2e mínimo de lobby a votación con pocos participantes si el flujo ya lo permite.

### Riesgos

* revelar votos antes de tiempo;
* permitir voto duplicado;
* resolver dos veces por llegada simultánea del último voto;
* dejar la ronda sin resultado.
* confundir availability con membership y desbloquear votación por Presence.

### Fuera de alcance

* segunda votación;
* resolución de segunda votación;
* intento final del impostor;
* reveal de palabra;
* registro de acierto/error del impostor;
* scoring;
* scoreboard;
* nueva ronda;
* fin de tanda;
* Realtime/Broadcast de gameplay.

### Criterio de terminado

La primera votación funciona de forma privada, autoritativa y consistente para las tres ramas de resolución inicial: empate, impostor único más votado y otro jugador único más votado.

### Conceptos a aprender

* privacidad durante escritura y lectura;
* restricciones únicas;
* resolución por evento final;
* concurrencia pequeña pero real.

### Slicing oficial

#### Incremento 8.0 — Contrato/documentación

Actualizar la documentación vigente para convertir el Incremento 8 en contrato implementable por slices pequeños, sin código funcional, migrations, Supabase ni tests.

#### Incremento 8.1 — Persistencia de votos + voting_first + start_round_voting()

Preparar la persistencia operativa de votos de Round, ampliar `GameSession.state` con `voting_first` y agregar `start_round_voting()` host-only desde `discussion`.

#### Incremento 8.2 — submit_round_vote() + resolución autoritativa de primera votación

Registrar votos de `voting_round = 1`, validar roster congelado, impedir auto-voto/cambio de voto, resolver automáticamente en el último voto y transicionar a `tie_discussion`, `impostor_guess` o `round_result`.

#### Incremento 8.3 — get_my_game_state() voting/result + UI vertical

Extender el read model privado y la UI para `discussion`, `voting_first`, post-vote y resultado agregado, sin resultados parciales ni votos individuales.

#### Incremento 8.4 — Polling, recovery, concurrencia, privacidad y cierre

Validar polling lento, refresh/reconnect, lost-response recovery, carreras del último voto, privacidad, auditoría documental/técnica y cierre del incremento.

---

## Incremento 9 — Empate y segunda votación

### Objetivo

Completar la rama posterior al empate detectado en Incremento 8:

```text
tie_discussion
→ current host continúa
→ voting_second
→ candidatos limitados a los empatados
→ segundo voto secreto
→ resolución definitiva
```

### Resultado observable

Si la primera votación ya dejó la GameSession en `tie_discussion`, todos ven los jugadores empatados.

El host inicia segunda votación.

Solo se puede votar por candidatos empatados, salvo auto-voto.

La segunda votación resuelve definitivamente la ronda.

### Dominio involucrado

Impostor:

* `tie_discussion`;
* `voting_second`;
* candidatos empatados;
* regla determinística de segunda votación.

### Infraestructura necesaria

* reconstrucción autoritativa del conjunto de empatados desde los votos de primera vuelta;
* votos con `votingRound = 2`;
* autorización del host para iniciar segunda votación;
* conteo autoritativo.

### Decisiones técnicas a cerrar

Decisiones cerradas para el contrato de Incremento 9:

* no se persiste una tabla, columna, array JSON ni entidad separada de candidatos empatados;
* los candidatos empatados se reconstruyen desde `round_votes` de la ronda actual con `voting_round = 1`, tomando quienes comparten la cantidad máxima de votos;
* `tie_discussion` solo puede existir como resultado de una primera votación completa, por lo que `round_votes` ya contiene la fuente autoritativa necesaria;
* `GameSession.state` incorpora `voting_second`;
* la transición `tie_discussion → voting_second` la solicita el host actual mediante `start_second_round_voting()`;
* `start_second_round_voting()` no recibe argumentos de ownership, deriva identidad y autoridad desde `auth.uid()`, no crea votos, no persiste candidatos y no revela secretos;
* `submit_round_vote(target_player_id)` se extiende para usar `voting_round = 1` cuando `GameSession.state = voting_first` y `voting_round = 2` cuando `GameSession.state = voting_second`;
* en segunda votación, `target_player_id` debe pertenecer al conjunto de empatados reconstruido desde la primera votación;
* todos los `SessionPlayers` votan también en segunda votación; Presence/liveness no cambia el denominador;
* el impostor vota, el host vota sin voto especial y los jugadores empatados también votan;
* nadie puede votarse a sí mismo, incluso si forma parte del empate;
* no existe tercera votación;
* si el impostor es el único jugador más votado en segunda votación, la transición es `voting_second → impostor_guess`;
* cualquier otro resultado de segunda votación, incluido un nuevo empate o un jugador incorrecto como único más votado, produce `voting_second → round_result` con victoria conceptual del impostor.

### Contrato de read model

`get_my_game_state()` sigue siendo la vista autorizada del caller.

Durante `tie_discussion` debe exponer:

* resultado agregado completo de la primera votación;
* `candidates` como jugadores empatados en el máximo de la primera votación;
* información suficiente para que la UI sepa si el caller puede iniciar la segunda votación;
* ninguna palabra secreta adicional, ningún voto individual y ningún privilegio informativo especial para el host.

Durante `voting_second` debe exponer:

* `candidates` como candidatos empatados autorizados para recibir votos;
* si el caller está entre los empatados, su propio Player queda excluido de sus opciones votables por la regla de no auto-voto;
* `has_voted`;
* `my_vote_target_player_id` correspondiente solamente al voto propio de `voting_round = 2`;
* ningún resultado parcial, ningún voto individual ajeno, `impostor_player_id` ni palabra secreta adicional.

Después de una resolución, `vote_results` representa la votación que produjo la resolución vigente de la ronda:

* si la ronda se resolvió en primera votación, muestra resultados de `voting_round = 1`;
* si hubo segunda votación, muestra resultados finales de `voting_round = 2`;
* no debe mostrar accidentalmente el tally de primera votación como resultado final después de una segunda votación.

### Tests / validación

* unit tests de candidatos restringidos;
* unit tests de regla definitiva de segunda votación;
* integración: no hay tercera votación;
* integración: `start_second_round_voting()` solo funciona para el host actual desde `tie_discussion` y es idempotente si ya está en `voting_second`;
* integración: `submit_round_vote()` usa `voting_round = 2` durante `voting_second`;
* integración: un target fuera del empate reconstruido es rechazado;
* integración: todos los `SessionPlayers` deben votar aunque Presence/liveness indique otra disponibilidad;
* integración: `vote_results` posterior a segunda votación usa `voting_round = 2`;
* privacidad: sin parciales, votos individuales ajenos, palabra ni secretos extra;
* concurrencia: últimos votos simultáneos resuelven una sola vez;
* recovery: retries y respuesta perdida se reconstruyen con `get_my_game_state()`;
* prueba manual con empate forzado.

### Riesgos

* permitir candidatos incorrectos;
* abrir tercera votación por ambigüedad;
* confundir resolución de primera votación con resolución definitiva de segunda votación;
* revelar palabra antes de tiempo si el impostor fue descubierto.

### Fuera de alcance

* intento final del impostor;
* guess input;
* reveal de palabra;
* scoring;
* scoreboard;
* nueva ronda;
* historial;
* fin de tanda;
* Realtime/Broadcast de gameplay.

### Criterio de terminado

La rama de empate queda resuelta de forma privada, autoritativa y definitiva: desde `tie_discussion`, el host actual puede iniciar `voting_second`, todos los `SessionPlayers` votan una vez por candidatos empatados, y el sistema transiciona automáticamente a `impostor_guess` o `round_result` sin tercera votación.

### Conceptos a aprender

* modelado de ramas de estado;
* restricciones dependientes de fase;
* reglas determinísticas;
* tests de tablas de casos.

### Slicing oficial

#### Incremento 9.0 — Contrato documental

Cerrar documentación de estado, candidatos derivados, RPCs, read model, privacidad, resolución definitiva y slicing. No incluye código funcional, SQL, migrations, tests ni UI.

Estado:

```text
CERRADO DOCUMENTAL
```

#### Incremento 9.1 — Entrada a segunda votación

Agregar `voting_second` como estado durable y `start_second_round_voting()` host-only desde `tie_discussion`, sin crear votos ni persistir candidatos.

Estado:

```text
CERRADO TÉCNICAMENTE
```

Validación registrada:

```text
validate-9-1.mjs PASS
```

#### Incremento 9.2 — Voto y resolución de segunda vuelta

Extender `submit_round_vote(target_player_id)` para `voting_second`, registrar `voting_round = 2`, validar candidatos empatados reconstruidos, impedir auto-voto/cambio de voto y resolver automáticamente al último voto.

Estado:

```text
CERRADO TÉCNICAMENTE
```

Validación registrada:

```text
validate-9-2.mjs PASS
regresiones compatibles 8.1, 8.3 y 8.4 PASS
```

Nota de regresión:

```text
validate-8-2.mjs queda obsoleto como regresión posterior a 9.x porque exige que no exista voting_second.
```

#### Incremento 9.3 — Read model + UI

Extender `get_my_game_state()` y la UI para `tie_discussion`, CTA del host, `voting_second`, espera post-voto y resultado agregado final correcto.

Estado:

```text
CERRADO TÉCNICAMENTE
```

Validación registrada:

```text
validate-9-3.mjs PASS repetido
```

#### Incremento 9.4 — Hardening

Validar concurrencia, retries, lost-response recovery, refresh/reconnect, privacidad, estados inválidos y tests adversariales.

Estado:

```text
CERRADO TÉCNICAMENTE
```

Validación registrada:

```text
validate-9-4.mjs PASS repetido
regresiones compatibles 8.1, 8.3 y 8.4 PASS
npm test PASS
npm run lint PASS con warning preexistente en validate-6-2.mjs
npm run build PASS
git diff --check PASS
```

Estado global del Incremento 9:

```text
CERRADO TÉCNICAMENTE
```

9.0 está cerrado documentalmente. 9.1, 9.2, 9.3 y 9.4 están cerrados técnicamente. El incremento completo queda cerrado técnicamente: la segunda votación se inicia por host actual desde `tie_discussion`, se vota con candidatos empatados reconstruidos desde `voting_round = 1`, resuelve sin tercera votación y mantiene privacidad sin Realtime/Broadcast de gameplay.

---

## Incremento 10 — Intento final del impostor

### Objetivo

Completar la etapa donde el impostor descubierto intenta adivinar la palabra antes de definir el ganador.

### Resultado observable

Cuando el grupo identifica al impostor, la aplicación revela quién era, pero mantiene oculta la palabra.

Solo el impostor puede enviar un intento final desde la aplicación.

El servidor compara el intento contra la palabra secreta y la ronda obtiene ganador.

### Dominio involucrado

Impostor:

* `impostor_guess`;
* intento final único;
* comparación server-side;
* revelación de palabra en `round_result`;
* ganador `impostor` o `group`.

### Infraestructura necesaria

* autorización del impostor real de la ronda;
* control de visibilidad de palabra antes/después del intento;
* persistencia de resultado de ronda;
* transición autoritativa a `round_result`;
* idempotencia frente a retries/respuesta perdida.

### Decisiones técnicas a cerrar

Decisiones cerradas para el contrato de Incremento 10:

* `GameSession.state = impostor_guess` representa que el impostor fue señalado correctamente y falta su intento final;
* solo el impostor de la ronda actual puede enviar el intento;
* la RPC futura será `submit_impostor_guess(guess_text)`;
* la RPC no recibe ownership ni campos de decisión como `is_correct` o `winner`;
* la autoridad se deriva desde `auth.uid()` hacia Player, Room activa, GameSession actual y Round actual;
* el intento es único; no hay múltiples intentos, edición ni reemplazo;
* la comparación se hace server-side;
* la normalización conceptual hace trim, colapsa espacios internos y compara sin sensibilidad a mayúsculas/minúsculas;
* el MVP no incluye matching difuso, tolerancia ortográfica, sinónimos ni equivalencias semánticas;
* si el guess normalizado coincide con `normalized_secret_word`, `winner = impostor`;
* si no coincide, `winner = group`;
* después de resolver siempre se pasa a `round_result`;
* antes del intento no se expone `secret_word` al impostor ni a otros jugadores;
* nunca se expone `normalized_secret_word`;
* el cliente no decide si acertó;
* `round_result` puede revelar `secret_word`, guess visible, acierto/error y ganador conceptual.

### Contrato de read model

`get_my_game_state()` durante `impostor_guess` debe exponer:

* estado `impostor_guess`;
* identidad pública del impostor señalado;
* `can_submit_impostor_guess` o equivalente para el caller;
* datos suficientes para espera de los demás jugadores;
* ningún `secret_word`;
* ningún `normalized_secret_word`;
* ningún resultado de guess.

`get_my_game_state()` durante `round_result` debe exponer:

* `winner`;
* `impostor_player_id`;
* `accused_player_id`;
* `impostor_was_accused`;
* `secret_word` revelada;
* `final_guess_text` si existió;
* `final_guess_correct` si existió;
* `vote_results` de la votación que produjo la resolución vigente.

Si la ronda llegó a `round_result` sin pasar por `impostor_guess`, `final_guess_text` y `final_guess_correct` son `null`.

### Tests / validación

* unit tests de victoria por acierto/fallo;
* integración/privacidad: palabra no disponible antes del intento;
* integración/autorización: solo el impostor registra;
* integración: otro jugador u host no impostor no puede enviar guess;
* integración: el cliente no puede forzar `winner` ni `is_correct`;
* idempotencia: no se registra dos veces ni cambia el primer intento;
* prueba manual de flujo completo con impostor descubierto.

### Riesgos

* revelar la palabra demasiado pronto;
* permitir que otro jugador envíe el intento;
* dejar al cliente como fuente no validada de una transición crítica;
* registrar resultado dos veces;
* confundir resultado de votación con resultado final de ronda.

### Fuera de alcance

* código en 10.0;
* SQL en 10.0;
* migrations en 10.0;
* tests en 10.0;
* UI en 10.0;
* scoring;
* scoreboard;
* marcador persistente final;
* nueva ronda;
* historial;
* cierre de tanda.

### Criterio de terminado

La ronda puede resolver autoritativamente el caso en que el impostor fue descubierto: el impostor envía un único intento, el servidor compara la palabra, se define `winner = impostor | group` y todos llegan a `round_result` sin exponer secretos antes de tiempo.

Estado global del Incremento 10:

```text
CERRADO TÉCNICAMENTE
```

### Conceptos a aprender

* revelación progresiva de información;
* acciones autorizadas;
* comparación server-side;
* idempotencia en resultados.

### Slicing oficial

#### Incremento 10.0 — Contrato documental

Cerrar documentación de actor autorizado, payload, normalización, comparación server-side, privacidad, datos conceptuales de resultado, read model y slicing. No incluye código funcional, SQL, migrations, tests ni UI.

Estado:

```text
CERRADO DOCUMENTAL
```

#### Incremento 10.1 — Persistencia/RPC autoritativa del guess

Implementar la persistencia mínima necesaria del resultado y `submit_impostor_guess(guess_text)` con autorización del impostor, comparación server-side, transición a `round_result`, idempotencia y privacidad.

Estado:

```text
CERRADO TÉCNICAMENTE
```

#### Incremento 10.2 — Read model + UI

Extender `get_my_game_state()` y la UI para `impostor_guess` y `round_result`: formulario solo para el impostor, espera para los demás, palabra revelada después de resolver, intento visible y ganador conceptual.

Estado:

```text
CERRADO TÉCNICAMENTE
```

#### Incremento 10.3 — Hardening

Validar concurrencia, retries, refresh/reconnect, privacidad, estados inválidos, ausencia de múltiples intentos, normalización y regresiones de votación.

Estado:

```text
CERRADO TÉCNICAMENTE
```

---

## Incremento 11 — Puntuación, marcador y nueva ronda

### Objetivo

Actualizar puntuación después de cada ronda y permitir iniciar una nueva ronda dentro de la misma tanda.

### Slicing

```text
11.0 — contrato documental de puntuación, marcador y nueva ronda
11.1 — persistencia de score y estado scoreboard
11.2 — aplicar puntos al cerrar round_result
11.3 — iniciar nueva ronda
11.4 — read model y UI de marcador/nueva ronda
11.5 — hardening
```

Estado de slicing:

```text
11.0 — CERRADO DOCUMENTAL
11.1 — CERRADO TÉCNICAMENTE
11.2 — CERRADO TÉCNICAMENTE
11.3 — CERRADO TÉCNICAMENTE
11.4 — CERRADO TÉCNICAMENTE
11.5 — CERRADO TÉCNICAMENTE
```

### Resultado observable

Después del resultado se ve el marcador.

El host puede iniciar una nueva ronda.

La nueva ronda conserva jugadores y puntuación, evita palabras usadas y considera balance de impostor.

En Incremento 11.0 queda cerrado documentalmente el scoring vigente:

* si `round_winner = group`, puntúan todos los jugadores no impostores con `+1`;
* si `round_winner = impostor`, puntúa solo el impostor con `+2`;
* el marcador es individual y vive en `SessionPlayer.score`;
* el scoreboard visible se deriva del roster congelado de la `GameSession`.

### Dominio involucrado

Impostor:

* `ROUND_RESULT`;
* `SCOREBOARD`;
* `SessionPlayer.score`;
* conteo derivado de veces como impostor;
* palabras usadas;
* `NEW_ROUND`.

### Infraestructura necesaria

* operación autoritativa de scoring;
* operación autoritativa de nueva ronda;
* persistencia operativa de marcador;
* prevención de doble nueva ronda.

### Decisiones técnicas cerradas

Incremento 11.0 cierra:

* la puntuación se aplica al cerrar `round_result` hacia `scoreboard`, siempre con `round_winner` definido;
* `round_winner` se representa como `impostor | group`;
* `round_winner` representa el ganador final de ronda, no solamente el resultado de votación;
* `round_result → scoreboard` es el lifecycle posterior al cierre de ronda;
* las palabras usadas se derivan de los `Round` ya creados en la `GameSession` y su snapshot normalizado;
* la nueva ronda reutiliza la misma `GameSession` y el mismo roster congelado;
* cada nueva ronda crea `Round.number = max(number) + 1`;
* palabra, impostor y número de ronda se eligen server-side;
* si no hay palabras disponibles, no se crea ronda y el host debe poder terminar la tanda o esperar nuevas palabras válidas;
* no hay fin automático por puntaje objetivo en este incremento.

Incremento 11.2 cierra:

* `advance_round_result_to_scoreboard()` como operación autoritativa sin ownership ni puntajes enviados por cliente;
* `Round.scored_at` como marca persistida de idempotencia;
* scoring server-side según `round_winner`;
* transición transaccional `round_result → scoreboard`;
* retry sobre ronda ya puntuada como no-op no destructivo.

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
* ganador final de tanda por puntos;
* ranking histórico;
* moderación avanzada, categorías o palabras precargadas;
* objetivo de puntos o ganador automático de tanda;
* fin automático por puntaje;
* cambio de participantes durante tanda.

### Criterio de terminado

Una tanda puede contener múltiples rondas con marcador consistente y palabras no repetidas.

Incremento 11 quedó cerrado técnicamente con validación DB multironda en 11.5.

### Cierre técnico de 11.1

Incremento 11.1 deja preparada la persistencia operativa:

* `session_players.score` existe físicamente con default `0` y check no negativo;
* `game_sessions.state` acepta `scoreboard`;
* `get_my_game_state()` acepta `scoreboard` como fase post-resultado y mantiene privacidad de secretos normalizados;
* el cliente tipado reconoce `scoreboard` sin introducir todavía UI final de marcador.

No aplica puntos todavía, no crea nueva ronda y no introduce historial.

### Cierre técnico de 11.2

Incremento 11.2 aplica puntos al cerrar la ronda:

* si `round_winner = impostor`, suma `+2` solo al `SessionPlayer` impostor;
* si `round_winner = group`, suma `+1` a cada `SessionPlayer` no impostor;
* la RPC `advance_round_result_to_scoreboard()` deriva jugador, sala, tanda y ronda desde estado autoritativo;
* `Round.scored_at` evita duplicar puntos ante retry, doble click o llamada repetida;
* una ronda puntuada avanza a `GameSession.state = scoreboard`.

No crea nueva ronda, no implementa UI final de marcador y no introduce historial.

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

La Room queda cerrada y no se reutiliza para otra tanda.

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

### Decisiones cerradas en 12.0

* sólo el host actual puede terminar la tanda;
* inicialmente sólo se termina desde `scoreboard`;
* `GameSession.state` avanza a `finished`;
* `GameSession.finished_at` es server-side e idempotente;
* la Room queda `closed`;
* una nueva tanda requiere crear otra Room;
* ganador final = jugador o jugadores con mayor `SessionPlayer.score`;
* los empates en primer puesto se preservan como múltiples ganadores;
* el historial de tanda guarda roster, scores finales, ganadores, cantidad de rondas, inicio, fin y host que cerró;
* el historial de ronda guarda número, impostor, `round_winner`, descubierto por votación, guess final y resumen de scoring;
* no se conservan votos individuales históricos;
* no se guarda la palabra completa usada en el historial mínimo inicial;
* el cliente no arma historial ni decide ganador final.

### Slicing oficial 12.x

* 12.0 — contrato documental de terminar tanda e historial mínimo;
* 12.1 — persistencia de `finished` e historial mínimo;
* 12.2 — RPC autoritativa 0-args `end_session()`;
* 12.3 — read model `get_my_game_state()` para `finished`;
* 12.4 — UI de cierre y resultado final;
* 12.5 — hardening y validación DB multironda/cierre.

### Estado de slicing

```text
12.0 — CERRADO DOCUMENTAL
12.1 — CERRADO TÉCNICAMENTE
12.2 — CERRADO TÉCNICAMENTE
12.3 — CERRADO TÉCNICAMENTE
12.4 — CERRADO TÉCNICAMENTE
12.5 — CERRADO TÉCNICAMENTE
```

### Decisiones cerradas de UI final

El MVP muestra en `finished` sólo el resultado final compartido:

* ganador único o ganadores empatados;
* clasificación completa;
* puntajes finales;
* cantidad de rondas jugadas;
* CTA `Volver al grupo`.

No muestra detalle ronda por ronda, votos históricos ni palabras usadas.

### Decisiones cerradas en 12.1

* `game_sessions.finished_at` existe como timestamp server-side y sólo puede quedar seteado si `state = finished`;
* `game_session_history` guarda un snapshot único por `game_session_id`, con FK a `GameSession` y `Room` más datos autosuficientes de cierre;
* `round_history` guarda un snapshot único por `round_id` y por `(game_session_id, number)`;
* ganadores múltiples se representan con `winner_player_ids uuid[]` y `winners jsonb`;
* roster final y scores finales se guardan como snapshots `jsonb`;
* `scoring_summary` de ronda es un objeto `jsonb` con al menos `rule` y `awarded`;
* el historial no copia `secret_word` ni `normalized_secret_word`, y no conserva votos individuales.

### Cierre técnico de 12.2

Incremento 12.2 implementa la operación autoritativa de cierre:

* `end_session()` es 0-args y deriva contexto desde `auth.uid()`, Room activa, `GameSession`, `SessionPlayers` y `Rounds`;
* sólo el host actual puede cerrar desde `scoreboard`;
* la operación fija `finished_at`, mueve `GameSession.state` a `finished` y deja `Room.status = closed`;
* crea un único `game_session_history` y un `round_history` por ronda;
* calcula `round_count`, scores finales y ganadores únicos o múltiples desde `SessionPlayer.score`;
* conserva `scoring_summary` por ronda sin votos individuales ni palabras completas;
* el retry devuelve cierre ya persistido sin duplicar historial ni cambiar resultados.

En ese incremento todavía no se implementaba la UI final; quedó cubierta en 12.4.

### Cierre técnico de 12.3

Incremento 12.3 implementa el read model final:

* `get_my_game_state()` sigue siendo 0-args y deriva identidad desde `auth.uid()` y `Player`;
* si no hay Room activa, reconstruye la última tanda `finished` del jugador desde `game_session_history` y `round_history`;
* sólo jugadores que fueron `SessionPlayers` de la tanda cerrada pueden ver ese resultado;
* expone `finished_at`, `round_count`, `final_scores`, `winner_player_ids`, `winners` y `rounds_summary`;
* devuelve vista compartida sin rol/palabra privada, sin votos individuales históricos y sin `secret_word`/`normalized_secret_word`;
* deja `can_start_next_round = false` y `can_end_session = false`;
* en `scoreboard`, expone `can_end_session = true` sólo para el host actual cuando la ronda vigente está puntuada.

No implementa estadísticas ni ranking.

### Cierre técnico de 12.4

Incremento 12.4 implementa la experiencia frontend de cierre y resultado final:

* en `scoreboard`, sólo el host ve `Terminar tanda` cuando el read model expone `can_end_session`;
* antes de cerrar, se pide confirmación porque la tanda y la Room quedan cerradas;
* durante el envío se deshabilitan acciones incompatibles para evitar doble ejecución;
* ante error, el marcador permanece visible y permite reintentar;
* `end_session()` se llama sin argumentos;
* después del éxito, el frontend consulta nuevamente `get_my_game_state()` y renderiza `finished`;
* si la Room ya no está activa, primero intenta recuperar el resultado histórico `finished`;
* no construye el resultado final desde estado local ni desde una respuesta optimista;
* host y no-host participantes ven la misma pantalla final;
* la vista final muestra ganador o ganadores, clasificación completa, puntajes, cantidad de rondas y `Volver al grupo`;
* no ofrece `Nueva ronda` ni `Terminar tanda` en `finished`.

Validación: tests focales de `room-lobby-shell` con 110 casos PASS, suite completa PASS, lint PASS, build PASS y `git diff --check` PASS.

### Cierre técnico de 12.5

Incremento 12.5 valida adversarialmente el lifecycle completo contra Supabase local:

```text
scoreboard
→ end_session()
→ finished
→ Room closed
→ historial
→ reconstrucción histórica
```

La matriz A-I quedó validada:

* precondiciones y autorización de `end_session()`;
* cierre exitoso sólo por host;
* historial único de tanda;
* historial único por ronda;
* ausencia de votos individuales y palabras secretas en historial;
* idempotencia;
* ganadores múltiples;
* read model histórico para participantes;
* denegación a no participantes;
* imposibilidad de reutilizar tanda o Room cerradas;
* creación posterior de nueva Room sin alterar historial;
* retry tardío sin afectar una Room nueva.

Durante 12.5 se detectó y corrigió una inconsistencia del read model: `get_my_game_state()` devolvía `can_end_session = false` también para el host en `scoreboard`, bloqueando la acción real de 12.4. El contrato efectivo queda:

```text
scoreboard:
can_end_session = true sólo para el host actual con ronda vigente puntuada

finished:
can_end_session = false
can_start_next_round = false
```

Validación: `test:db:12.5` PASS, regresiones 11.5/12.2/12.3 PASS, tests focales 12.4 PASS, `npm test` PASS, lint PASS con un warning preexistente, build PASS y `git diff --check` PASS.

### Tests / validación

* integración: cerrar tanda crea historial una sola vez;
* integración: historial contiene participantes, rondas, puntajes y ganadores;
* integración/privacidad: no se conservan votos individuales históricos sin necesidad;
* integración: empate en primer puesto conserva múltiples ganadores;
* integración: no-host no puede terminar tanda;
* integración: no se termina desde estados intermedios;
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

El grupo puede jugar técnicamente una tanda completa de Impostor desde creación de sala hasta resultado final: múltiples rondas, marcador, cierre por host, Room cerrada, historial mínimo y reconstrucción de `finished`.

Este es el:

```text
PRIMER MVP JUGABLE ALCANZADO TÉCNICAMENTE
```

La prueba presencial completa con 3 a 8 teléfonos, especialmente con 4, sigue pendiente como validación posterior.

### Conceptos a aprender

* historial mínimo;
* datos operativos vs datos permanentes;
* cierre idempotente;
* validación real con personas.

---

## Incremento 13 — Reconexión autoritativa y hardening mobile

### Objetivo

Mejorar la recuperación ante refresh, reapertura, segundo plano, foreground, resuscripción Realtime, pérdida breve/larga de red y sucesión de host, tomando el contrato documental 13.0 como autoridad para implementación y validación.

Incremento 13 absorbe formalmente el hardening pendiente de 5.4:

```text
background/foreground
lock screen
app switching
short disconnect
long disconnect
heartbeat recovery
host succession recovery
multi-tab
multi-device best-effort
resubscription/reconciliation
```

La implementación vigente de Presence/liveness/sucesión no cambia por 13.0. Los timings vigentes se conservan:

```text
heartbeat cliente: 30s
host succession recheck: 30s
gameplay polling: ~3s
host stale threshold DB: 90s
liveness DB throttle: ~10s
```

### Resultado observable

Un jugador puede refrescar, reabrir o volver desde background/offline y recuperar desde servidor:

* identidad;
* grupo;
* sala activa;
* host actual;
* fase actual;
* información privada que todavía le corresponda;
* estado de voto si ya votó;
* elegibilidad de intento final;
* marcador;
* resultado final `finished` aunque la Room ya no esté activa.

El estado local stale nunca sobreescribe autoridad actual.

### Dominio involucrado

Plataforma:

* identidad recordada;
* lifecycle de cliente.

Impostor:

* recuperación de sala, ronda y fase;
* vista privada de jugador;
* presencia;
* liveness;
* sucesión de host.

### Infraestructura necesaria

* consultas existentes de reconstrucción de estado autorizado;
* manejo de triggers de reconciliación;
* resuscripción Realtime/Presence al volver;
* foreground recovery de liveness;
* evaluación de sucesión cuando corresponda;
* señales mínimas de error, offline, retry o reconexión en UI.

Expectativa inicial:

```text
frontend + RPCs/read models existentes
```

No se prevé backend nuevo salvo que la validación revele un caso no representable con los read models actuales.

### Decisiones técnicas a cerrar

13.0 cierra documentalmente:

* qué se considera reconexión;
* triggers conceptuales: mount, manual retry, `visibility → visible`, `online`, recovery/resuscripción Realtime;
* `focus` como trigger no obligatorio salvo evidencia de valor real;
* orden de reconstrucción: Auth → Player/Group → Room activa → GameSession/read model → privados/acción propia → Realtime/Presence/liveness/sucesión;
* qué ocurre si el Player vuelve en otra fase;
* qué ocurre si `/sala/[code]` no coincide con su Room activa;
* qué ocurre si Room ya cerró pero `GameSession` está `finished`;
* qué estado local puede perderse;
* qué estado autoritativo debe reconstruirse;
* private reveal oculto por defecto tras refresh/reconnect;
* voto propio y `my_vote_target_player_id` reconstruidos desde read model cuando existen;
* intento final: no reofrecer submit si ya se resolvió o si la fase avanzó;
* host succession: DB decide, cliente sólo solicita evaluación;
* multi-tab como múltiples refs de Presence del mismo Player con dedupe lógico;
* multi-device misma identidad como best-effort, no requisito fuerte del flujo normal;
* single-flight/dedupe/coalescing para triggers cercanos;
* política conceptual de error.

### Tests / validación

* integración: reconstrucción de estado por jugador;
* e2e/browser: refresh en lobby, `role_reveal`, votaciones, scoreboard y `finished`;
* DB/integration: voto propio, segunda votación, Room cerrada, `finished`, sucesión;
* smoke manual: bloqueando teléfono, cambiando de app y alternando red;
* smoke multi-tab del mismo Player;
* validación específica en Safari iOS y Chrome Android cuando haya dispositivos disponibles.

### Riesgos

* recuperar datos privados de otro jugador;
* duplicar acciones al reconectar;
* mostrar fase vieja por cache local;
* dejar visible un secreto de una ronda anterior;
* permitir voto/guess/host action desde una fase stale;
* depender sólo de eventos Realtime perdidos;
* depender de comportamiento móvil no confiable.

### Fuera de alcance

* modo offline de partida;
* edición de participantes durante tanda;
* sincronización peer-to-peer;
* service worker;
* estrategia de cache;
* offline shell;
* cache de secretos;
* background sync;
* install/update behavior de PWA;
* playtest amplio y polish final.

### Criterio de terminado

La experiencia tolera interrupciones móviles comunes y resuscripciones sin romper la tanda, sin exponer información privada, sin habilitar acciones stale y aceptando siempre la fase/host/Room/resultado actuales del servidor.

### Conceptos a aprender

* lifecycle PWA;
* refresh vs reapertura;
* estado local confiable y no confiable;
* resuscripción realtime;
* recuperación autorizada.

### Subincrementos

#### 13.0 — Contrato documental de reconexión + hardening 5.4

Estado: contrato documental.

Define qué debe ocurrir ante refresh, reapertura, foreground, lock screen, app switching, offline corto/largo, resuscripción Realtime, sucesión de host, Room cerrada y `finished`.

No modifica código, tests, listeners, Realtime, Presence, heartbeat, RPCs, DB, RLS ni Auth.

#### 13.1 — Triggers de reconstrucción autoritativa

Estado: cerrado.

Objetivo:

```text
mount / retry / foreground / online
→ una reconciliación coherente
```

Implementado con la ruta autoritativa existente de Room/GameSession: mount, retry, `visibility → visible`, `online` y recovery de Realtime convergen en reconstrucción desde `getMyActiveRoom()`/`getMyGameState()`. Los triggers cercanos se coalescen con single-flight local y el polling de gameplay conserva su cadencia normal sin competir con foreground.

#### 13.2 — UI reconnecting/offline mínima

Estado: cerrado.

Objetivo:

```text
feedback
+
acciones seguras durante reconexión
```

Debe cubrir estados locales `reconnecting`, `offline`, `error` y `retry` dentro de Room/gameplay si alcanza, sin diseñar un sistema global.

Implementado localmente en el shell de Room/GameSession con un estado de confianza mínimo:

```text
stable
offline
reconnecting
reconcile-error
```

El shell escucha `offline` y conserva el último estado compartido visible con feedback de "Sin conexión". Al recuperar `online`, foreground, Realtime o retry, usa la reconciliación autoritativa existente. Mientras el estado no es confiable, pausa acciones sensibles de Room/gameplay y no renderiza secretos privados stale; en error de reconciliación conserva contexto compartido seguro y ofrece `Reintentar`.

#### 13.3 — Presence/liveness foreground recovery

Estado: cerrado.

Objetivo:

```text
heartbeat
resubscribe
multi-tab
suspensión móvil
```

Debe validar que cerrar una pestaña no desconecte conceptualmente al Player si otra conexión válida sigue activa.

La validación final de 13.5 cubrió reconexión repetida y multi-tab sin generar Presence duplicada ni loops visibles de recovery.

#### 13.4 — Host succession recovery

Estado: cerrado.

Objetivo:

```text
host stale
successor
host original vuelve
concurrencia
```

La DB decide sucesión; el cliente sólo solicita evaluación. El host original no recupera el rol automáticamente.

El cierre 13.4 mantiene `rooms.host_player_id` como autoridad server-side. Cuando `reassign_room_host_if_stale()` devuelve `hostChanged = true`, el cliente lo trata únicamente como señal de invalidación y fuerza una reconstrucción autoritativa inmediata de Room mediante el camino existente de `get_my_active_room()`.

No hubo cambios de DB, schema ni reglas de producto. La validación cerró con tests focales PASS, suite completa PASS, build PASS, lint PASS con warning preexistente en archivo no tocado, `git diff --check` PASS, auditoría pre-commit PASS y smoke browser real PASS.

#### 13.5 — Matriz final de validación

Estado: cerrado.

Objetivo:

```text
tests
DB validators
smoke físico acotado
documentación final 13
```

Matriz mínima:

| Escenario | Validación |
| --- | --- |
| refresh `role_reveal` | desktop + mobile real |
| refresh `voting_first` después de votar | DB/integration + browser |
| refresh `voting_second` después de votar | DB/integration + browser |
| refresh `scoreboard` | browser |
| refresh `finished` | DB/integration + browser |
| background corto guest | mobile real |
| background corto host | mobile real |
| background largo host con succession | mobile real + DB |
| offline corto voting | manual smoke |
| fase avanza mientras Player está fuera | manual smoke + browser |
| Room termina mientras Player está fuera | DB/integration + browser |
| host original vuelve después de succession | DB/integration + manual |
| multi-tab mismo Player | browser smoke |

El cierre final de 13.5 no requirió cambios de código. Se realizó mediante smoke browser real integrado y validó recovery across phase advance, persisted vote, new round/privacy, finished recovery y repeated reconnect + multi-tab.

Resultado:

```text
13.5
VALIDATION ONLY
13.5 — Final recovery validation: CLOSED
FINAL RECOVERY SMOKE PASS
CLOSED
```

No se detectaron bugs ni hardening adicional necesario para cerrar el bloque de recovery.

Estado consolidado:

```text
Increment 13: CLOSED
```

Siguiente bloque de trabajo:

```text
Increment 14 — PWA hardening / service worker / cache / updates / iOS-Android
```

---

## Incremento 14 — Maduración PWA iOS/Android del MVP

### Objetivo

Madurar la PWA del MVP con service worker, cache, actualización y validaciones iOS/Android, sin prometer partida offline.

### Resultado observable

La app sigue pudiendo usarse desde navegador e instalarse cuando el dispositivo lo permite.

La capa temprana de manifest, iconos y metadatos queda revisada, y se suma una estrategia concreta de service worker, cache del shell y comportamiento de actualización razonable.

La validación automática y Chromium desktop quedan cerradas. Safari iOS, Chrome Android y el smoke multi-actor real quedan como validaciones externas previas a beta cuando haya dispositivos y escenario Supabase vivo.

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
* prueba de instalación en Android, pendiente si no hay dispositivo disponible;
* prueba de agregar a inicio en iOS, pendiente si no hay dispositivo disponible;
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

La PWA cumple el alcance MVP a nivel funcional y de validación automática/Chromium desktop: instalable cuando corresponde, usable sin instalación, mobile-first, con service worker/cache acotados y segura respecto de datos sensibles. Android/iOS reales y multi-actor real pueden quedar documentados como smoke externo pendiente antes de beta.

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

### Tarea transversal — Diseño y construcción del relato técnico accesible

#### Propósito, audiencia y límites

Incremento 15 contempla construir `sources/technical-narrative.md`: un relato técnico extenso y accesible que explique Juegos Familiares / Impostor mediante problemas reales, conceptos de ingeniería, decisiones, implementación, trade-offs, resultados observables y aprendizaje.

Prioriza aprendizaje, comprensión profunda, transferencia de conocimiento y capacidad de explicar decisiones. Sus audiencias primarias son el autor/desarrollador y una persona desarrolladora junior/intermedia. Como audiencias secundarias, debe ayudar a un entrevistador técnico o hiring manager y a una persona de producto técnicamente curiosa. El cuerpo principal debe entenderse sin leer el repositorio, empezando accesible y profundizando después.

No será API reference, manual de código, README grande, duplicado de requisitos, changelog, documentación operativa para agentes ni tutorial genérico de tecnologías. Es pedagógico y explicativo, no normativo: ante discrepancias prevalecen los documentos autoritativos vigentes y el código, SQL/migrations y tests.

El archivo vive en `sources/`, no en `source/`. No forma parte del contexto operativo mínimo por defecto para agentes; sólo se consulta para tareas de aprendizaje, onboarding humano, portfolio, explicación o documentación pedagógica. Su estado y eventual incorporación se controlan como trabajo documental separado.

#### Fuentes y trazabilidad

| Fuente | Qué aporta | Autoridad | Cuándo se usa |
| --- | --- | --- | --- |
| `sources/platform/product-brief.md`, `sources/project-principles.md`, `sources/games/impostor/product-decisions.md`, `sources/games/impostor/user-flow.md` y reglas de juego vigentes | problema, intención, reglas y decisiones de producto | autoritativa para intención | al explicar problema, experiencia o decisión de producto |
| `sources/architecture.md`, `sources/games/impostor/technical-requirements.md`, `sources/games/impostor/conceptual-data-model.md`, `sources/games/impostor/game-state-model.md` | entidades, estado, privacidad, límites y arquitectura | autoritativa para diseño conceptual | al explicar modelo y responsabilidades |
| `sources/implementation-plan.md`, `sources/portfolio-case-study.md`, historial Git, commits y PRs disponibles | orden real, problemas descubiertos y evolución | autoritativa para historia, verificada contra estado actual | en apartados "Cómo llegamos acá" |
| código, SQL, migrations, RPCs, RLS y wrappers vigentes | comportamiento e implementación efectiva | máxima para comportamiento actual | antes de afirmar un detalle técnico actual |
| unit tests, integración/DB tests y validadores | invariantes, seguridad, concurrencia, idempotencia y casos límite | máxima para comportamiento verificable | al explicar riesgos y garantías |
| smoke tests y playtests | fricción visible, límites móviles y origen de decisiones UX | evidencia contextual | al conectar uso real con una decisión |
| conversaciones ChatGPT/Codex | dudas, preguntas y formulaciones pedagógicas | no autoritativa | sólo como pista; todo hecho se contrasta |

Mantener una matriz auxiliar por tema: `Tema | Problema | Decisión | Docs | Código/SQL | Tests | Estado final`. No tiene que publicarse completa, pero cada afirmación relevante debe poder rastrearse. Para comportamiento actual tienen máxima prioridad código/DB/tests y documentación vigente; para intención, decisiones, arquitectura y requisitos; para historia, plan, case study y Git. Un chat anterior nunca sobreescribe la realidad del repositorio.

#### Método y patrón pedagógico

1. Inventariar conceptos reales sin convertirlos todavía en capítulos.
2. Mapear `problema → riesgo → concepto → solución → evidencia`.
3. Ordenar el relato por comprensión humana, no por carpetas ni necesariamente cronología.
4. Redactar una primera versión con capas: explicación simple, precisión técnica y materialización en Juegos Familiares.
5. Hacer revisión técnica contra docs actuales, código, SQL y tests; clasificar afirmaciones como `correcta`, `simplificada pero fiel`, `obsoleta` o `no soportada`.
6. Separar arquitectura final de evolución histórica y hacer revisión pedagógica: problema antes que solución, jargon definido, ejemplos concretos y simplificación fiel.
7. Agregar sólo lo que aporte comprensión: diagramas, glosario y enlaces oficiales.
8. Auditar nuevamente contra el proyecto terminado.

El patrón preferente por concepto es: problema real, qué podría salir mal, concepto técnico, solución usada, motivo, alternativa descartada, trade-off, efecto observable y aprendizaje. No debe aplicarse rígidamente. El estándar es poder conectar un jugador que bloquea el teléfono, la partida que continúa, su UI stale al volver, el foreground como trigger de reconstrucción y el read model autoritativo que permite converger al estado actual.

#### Estructura, alcance y derivados

La estructura macro tentativa: problema y producto; identidad y pertenencia; modelado de una partida; estado compartido y privado; autoridad; sincronización entre dispositivos; interrupciones del mundo real; PWA y lifecycle; validación; decisiones no anticipadas; aprendizaje. No será una guía organizada por `app/`, `lib/`, `supabase/` o `sources/`.

Agrupar, sin imponer un capítulo por término: Auth anónima; `AuthIdentity` versus `Player`; `Group`, admin, `Room` y host; `GameSession` y `Round`; estado privado/compartido; diseño server-authoritative, RLS, RPC y read models; Realtime, Presence, liveness, heartbeat, polling y sucesión; concurrencia, idempotencia, votación, empate, intento, puntaje e historial; refresh, reconstrucción, stale state, background/foreground, offline/reconnect y multi-tab; PWA, service worker/cache y el límite de no ofrecer gameplay offline; migrations, tests, smoke, playtest, entrega incremental, abstracciones evitadas y crecimiento futuro.

Investigar y verificar antes de afirmar los trade-offs: no adelantar `GenericGame`/`GenericRoom`, no exigir cuentas tradicionales, no usar Presence como autorización, no usar frontend como autoridad, no ofrecer gameplay offline y no cachear secretos sin política explícita. Usar escenarios ficticios o genéricos, no datos personales. Explicar arquitectura con fragmentos breves sólo cuando aclaren un concepto, nunca con un recorrido archivo por archivo.

El documento debe ser autosuficiente; enlaces oficiales de Supabase, PostgreSQL, Next.js y MDN/PWA serán complementarios y se verificarán al redactar. Evaluar diagramas de identidad/pertenencia, `Group` versus `Room`, `Room → GameSession → Round`, estado privado/compartido, Realtime versus RPC/read model, Presence versus liveness y reconexión; sucesión y capas de testing son opcionales. El glosario puede cubrir estado autoritativo, stale, RPC, RLS, Presence, liveness, heartbeat, idempotencia, concurrencia, read model, migration, smoke, PWA y service worker, sin sustituir explicaciones en contexto.

`sources/portfolio-case-study.md` conserva una síntesis de evolución, decisiones, resultados y aprendizajes para portfolio; la narrativa explica el sistema en profundidad. `architecture`, `technical-requirements`, `game-state-model` y `product-decisions` siguen siendo las fuentes para construir y mantener correctamente.

#### Criterios de terminado y pasos internos

El relato estará terminado cuando sea comprensible sin repo, técnicamente fiel, trazable, distinga comportamiento actual de evolución histórica, defina jargon, use problemas y ejemplos reales, explique trade-offs, no contradiga docs/código, no duplique requisitos ni case study, no se vuelva normativo y permita explicar el proyecto en una entrevista y aprender conceptos transferibles.

El plan original no reservó una secuencia completa `15.x`. La ejecución posterior usó de hecho `15.4` para el polish de claridad UX y `15.5` para el protocolo pre-beta. No se infieren ni se crean retrospectivamente Incrementos 15.1-15.3.

Los pasos internos del relato técnico siguen siendo: contrato e índice tentativo; inventario de fuentes/evidencia; primer relato; revisión técnica; revisión histórica; revisión pedagógica; diagramas/glosario/recursos; versión final. Una versión breve de portfolio, guion de entrevista, presentación, posts, mapa conceptual o preguntas de estudio son derivados opcionales, no requisitos de Incremento 15.

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

Estado: cerrado.

Se agregó Room + Lobby: creación de Room, join por código/enlace, reconstrucción autoritativa, sincronización Realtime por invalidación y lifecycle mínimo `lobby | closed` con salida/cierre.

## Incremento 5

5.0 cerró el contrato documental de Presence y sucesión.

5.1 cerró Presence básica de lobby con canal privado por Room, autorización por RoomParticipant y validación productiva multi-cliente.

5.2 cerró liveness autoritativo mínimo con `room_participants.last_seen_at`, RPC propia de refresh, heartbeat 30s, stale 90s, migration remota aplicada y smoke productivo específico.

5.3 cerró sucesión autoritativa de host con RPC sin ownership cliente, liveness server-side, locking/revalidación, idempotencia, propagación por Realtime existente y smoke productivo PASS.

5.4 quedó absorbido y cerrado por Incremento 13. El contrato documental 13.0 cubrió hardening mobile/concurrencia y validación ampliada de la cadencia técnica 30s/90s/30s. La implementación vigente de Presence/liveness/sucesión se mantiene sin cambios y no se observaron defectos funcionales que bloqueen el avance.

## Incrementos 6 a 12

Incremento 6 quedó cerrado técnicamente: inicio de tanda autoritativo, `GameSession`, `SessionPlayer`, Round 1, privacidad por caller y UI vertical hasta `role_reveal`.

Incrementos 7 a 12 agregan transición a conversación presencial, votación, scoring e historial.

## Incrementos 13 a 15

Incremento 13 queda cerrado. El smoke final de 13.5 validó reconexión autoritativa frente a avance remoto de fase, voto persistido, nueva ronda con protección contra secreto stale, reconstrucción de `finished` y reconexiones repetidas con multi-tab, sin requerir cambios de código.

Incremento 14 queda cerrado con la fórmula `INCREMENT 14 CLOSED WITH EXTERNAL MANUAL SMOKE PENDING`: contrato PWA/cache, manifest/install hardening, service worker static-safe, offline/update UX mínima y Chromium desktop smoke están cerrados. Android/iOS real y round transition/offline/reconnect multi-actor real quedan pendientes externos antes de beta.

Incremento 15 está en curso. `15.4` implementó claridad UX y quedó cubierto por el P0 del candidato `a064ce2`, con smoke UX/UI en mobile real pendiente. `15.5` creó el protocolo de aceptación y registró P0 `PASS`; S1-S8, N1, C1-C10, R1-R4, U1, E1 y D1 siguen pendientes.

El refinamiento posterior de la portada `/` está implementado en el commit
`365fe5a`: Impostor conserva la prioridad y su acceso explícito, mientras el
contexto reconocido se reduce a un control que navega a `/grupo`. Los tests
focalizados de la home, lint y `git diff --check` se ejecutaron durante su
implementación. La revisión manual local con tres usuarios reconocidos del
mismo Group, sin Room activa, aprobó ese resultado.

Siguen pendientes la observación manual del estado de portada con Room activa,
la revalidación que corresponda a una nueva candidata y las validaciones
formales ya abiertas del Incremento 15. La observación `POLISH` de la entrada
a Room quedó implementada en el commit `ea73954`: desde `/impostor`, un
jugador reconocido sin Room activa puede crear sala directamente o unirse
mediante un formulario inline, sin pasar por `/impostor/grupo#jugar`. Falta la
revisión manual de ese cambio (crear, unirse, código inválido, doble tap,
lobby, playing, viewport móvil, teclado).

Antes de la aceptación física pre-beta se ejecutará, como paso preparatorio, un
smoke UX/UI exploratorio en un solo dispositivo. Esta actividad no forma parte
de S1-S8, N1, C1-C10, R1-R4, U1, E1 o D1 y no usa resultados `PASS`/`FAIL` de
aceptación. Busca detectar problemas de jerarquía visual, copy, ergonomía
táctil, densidad/scroll, responsive, claridad de CTA, estados de espera y
fricción perceptual mobile. No valida Presence, sucesión de host,
sincronización o recovery multi-actor, privacidad entre dispositivos, votación
real, scoring ni update PWA.

La baseline actual se preserva como
`a064ce2c38abe4502b8c11ceeb9be5b7187aea62`. Si el smoke no produce cambios de
código, `a064ce2` puede seguir siendo candidata para aceptación. Si produce
cambios, incluso solo visuales o de copy, el polish debe realizarse después en
una rama y commit separados, generar un nuevo SHA candidato y usar un Preview
separado. Para esa nueva candidata se debe repetir P0 y ejecutar un smoke focal
sobre las superficies tocadas antes de la aceptación formal; `a064ce2` queda
como baseline de comparación y deja de ser candidata final automática.

N1 se reserva para la candidata final y para la sesión natural con cuatro
dispositivos. El smoke exploratorio de un dispositivo no sustituye N1 ni
completa ningún escenario formal.

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

# 12. Decisiones diferidas e históricas

Estas decisiones fueron diferidas al comienzo del plan y no bloquearon el Incremento 0. Varias ya fueron resueltas por los Incrementos 0 a 12; se conservan aquí como registro histórico, no como estado vigente.

Ya resuelto o cerrado técnicamente:

* mecanismo exacto de invitación al grupo;
* estrategia de Realtime para Room y gameplay hasta Incremento 12;
* forma de operaciones autoritativas en Supabase para identidad, grupo, Room y gameplay hasta cierre de tanda;
* esquema SQL y políticas RLS detalladas hasta historial mínimo;

Pendiente o futuro:

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

## Aclaración documental

`technical-requirements.md` conserva el registro de que originalmente no definía stack ni proveedor, mientras `architecture.md` ya define Supabase.

No es una contradicción práctica si se interpreta que `technical-requirements.md` es anterior o más abstracto, y `architecture.md` es la decisión posterior.

La aclaración vigente en requisitos técnicos indica que el documento conserva su valor como marco conceptual independiente de proveedor, mientras arquitectura y este plan registran la selección de Next.js y Supabase para el MVP.

## Aclaración histórica

El framework frontend exacto apareció como diferido en la etapa conceptual inicial.

La implementación vigente cerró Next.js para el MVP.

## Problema operativo histórico

Antes de ejecutar Incremento 0 había que confirmar el estado real de Git en la carpeta raíz.

Ese riesgo pertenece al arranque del proyecto y ya no representa el próximo paso vigente.

---

# 14. Próximo paso recomendado

El siguiente paso lógico del roadmap formal es continuar Incremento 15:

1. preservar `a064ce2` como baseline estable y ejecutar el smoke UX/UI exploratorio de un dispositivo pendiente de 15.4;
2. clasificar sus hallazgos y, si corresponde, realizar polish acotado en una rama/commit separados y generar un nuevo SHA candidato con Preview separado;
3. si cambió código, repetir P0 y ejecutar un smoke focal sobre las superficies tocadas;
4. ejecutar la aceptación formal 15.5 con cuatro dispositivos contra la candidata final, incluidos N1, Android Chrome installed PWA, iOS Safari Add to Home Screen, U1 y recovery multi-actor real;
5. registrar E1 y D1 y declarar el cierre del MVP solamente cuando se cumplan sus criterios técnicos, de validación manual y de riesgo.

Estado consolidado vigente:

* Incrementos 0 a 4 cerrados;
* Incrementos 5.1 a 5.3 cerrados;
* Incremento 5.4 absorbido en Incremento 13;
* Incrementos 6 a 12 cerrados técnicamente;
* Incremento 13 técnicamente cerrado; R1-R4 físicos pendientes en aceptación pre-beta;
* Incremento 14 técnicamente cerrado; Android/iOS, U1 y multi-actor real pendientes;
* 15.4 implementado y cubierto por P0; smoke UX/UI mobile real pendiente;
* 15.5 documental y P0 `PASS`; aceptación manual y decisión pre-beta pendientes;
* no existieron Incrementos 15.1-15.3 en la evolución real del roadmap.

Las mejoras y defectos encontrados durante el smoke se tratan antes de continuar cuando afecten el uso real o introduzcan riesgo. Las mejoras no bloqueantes deben mantenerse acotadas para no reabrir decisiones de producto ni ampliar el MVP.
