# Juegos Familiares — Arquitectura conceptual

## Propósito

Este documento describe la arquitectura conceptual del sistema completo.

Juegos Familiares es la aplicación contenedora.

Impostor es el primer juego dentro de esa aplicación.

La arquitectura distingue:

* capacidades compartidas de plataforma;
* capacidades específicas de Impostor;
* infraestructura compartida;
* reglas de dominio;
* responsabilidades del cliente;
* responsabilidades autoritativas.

Debe orientar el futuro `sources/implementation-plan.md`, sin definir todavía tablas, migraciones, componentes, APIs ni código.

---

# 1. Decisiones tecnológicas

Para el MVP, la decisión actual es utilizar:

* aplicación web mobile-first;
* PWA;
* TypeScript;
* Supabase como backend gestionado;
* Supabase Auth para identidad liviana/anónima;
* Postgres como persistencia;
* Row Level Security para autorización;
* Supabase Realtime cuando el producto necesite sincronización;
* Presence para presencia efímera cuando corresponda, fuera del lobby inicial.

No reabrimos en este documento la comparación con Firebase, backend propio u otras alternativas.

---

# 2. Vista general del sistema

```text
Juegos Familiares PWA
│
├── Platform
│   ├── navegación general
│   ├── identidad
│   ├── grupos
│   ├── jugadores
│   └── lifecycle PWA
│
└── Games
    └── Impostor
        ├── banco de palabras
        ├── sala
        ├── tanda
        ├── ronda
        ├── votos
        ├── marcador
        └── historial
              │
              ▼
          Supabase
          ├── Auth
          ├── Postgres
          ├── RLS
          └── Realtime / Presence
```

Clientes simultáneos:

```text
PWA Ramiro ──┐
PWA Pedro ───┤
PWA Camila ──┼── backend compartido
PWA Victoria ┘
```

---

# 3. Platform vs Game

## Platform

Incluye únicamente capacidades que ya sabemos que son transversales:

* identidad;
* grupos;
* jugadores;
* navegación general;
* shell PWA;
* infraestructura común cuando corresponda.

## Impostor

Incluye reglas y datos propios del juego:

* banco de palabras;
* salas;
* tandas;
* rondas;
* selección de impostor;
* asignaciones privadas;
* votos;
* resolución;
* puntuación;
* historial específico.

No promovemos conceptos de Impostor al nivel de plataforma por anticipación.

---

# 4. Regla contra generalización prematura

No construir abstracciones genéricas para juegos futuros hasta que un segundo juego real demuestre una necesidad compartida.

Evitar por ahora:

```text
GenericGame
GameEngine
GenericRound
GenericRoom
GenericScore
GenericRealtimeGame
```

Cuando llegue Tutti Frutti, se evaluará qué capacidades son realmente reutilizables.

---

# 5. Responsabilidad del cliente PWA

El cliente puede encargarse de:

* renderizar UI;
* navegación;
* estado visual;
* formularios;
* interacción táctil;
* guardar identidad o preferencias locales permitidas;
* enviar intenciones;
* consultar estado autorizado;
* suscribirse a cambios compartidos;
* reaccionar a reconexión;
* lifecycle PWA;
* cache apropiado del shell.

El cliente no debe ser autoridad para decisiones sensibles.

En Impostor, no debe decidir unilateralmente:

* palabra;
* impostor;
* resultado de votación;
* ganador;
* puntos;
* cambio de fase;
* nuevo host.

---

# 6. PWA como capacidad de plataforma

La PWA pertenece a Juegos Familiares, no solamente a Impostor.

Debe contemplar:

* mobile-first;
* Safari/iOS;
* Chrome/Android;
* uso desde navegador;
* instalación opcional;
* manifest;
* service worker;
* estrategia de cache progresiva;
* actualizaciones;
* background/foreground;
* reconexión razonable.

PWA no equivale a offline completo.

Una partida multijugador sincronizada requiere conectividad en el MVP.

Futuros juegos pueden tener necesidades offline distintas.

---

# 7. Identidad como capacidad compartida

Supabase Auth debe resolver identidad técnica liviana.

El objetivo de UX sigue siendo:

* sin email;
* sin password;
* sin onboarding pesado.

La identidad debe permitir relacionar:

```text
Auth identity
→ Player
→ Group
```

Debe mantenerse explícitamente la separación conceptual:

```text
AuthIdentity
≠ Player
≠ Group
≠ LocalIdentity
```

La identidad local del dispositivo puede ayudar a recordar al jugador, pero no debe ser la fuente de autorización.

Regla:

```text
LocalIdentity
→ cache / pista UX

AuthIdentity + estado remoto
→ identidad verificable y autorización
```

Si se pierde la sesión anónima y ya no existe `AuthIdentity` válida, no debe recuperarse automáticamente el `Player` anterior usando datos locales.

La intención es que en el futuro el mismo `Player` pueda participar en otros juegos de Juegos Familiares.

---

# 8. Grupo y jugadores como conceptos de plataforma

`Group` y `Player` son conceptos transversales actuales.

Ejemplo:

```text
Familia
├── Ramiro
├── Pedro
├── Camila
└── Victoria
```

Estos jugadores pueden ser reutilizados por distintos juegos futuros.

No asumimos todavía:

* perfiles públicos;
* avatares complejos;
* amigos;
* matchmaking;
* múltiples grupos simultáneos;
* sistema social.

---

# 9. Navegación de plataforma

Orientación conceptual:

```text
/
→ Juegos Familiares

/impostor
→ Impostor

/impostor/grupo
→ contexto persistente del Group para Impostor
```

La portada permitirá acceder a juegos disponibles.

Un juego futuro podría usar:

```text
/tutti-frutti
```

No se diseñan todavía componentes, layouts ni estética.

`/impostor/grupo` pertenece a plataforma aplicada al primer juego: muestra `Group` y `Player` y ofrece entradas a Room, pero no es un lobby ni contiene el estado de una Room.

---

# 10. Supabase como infraestructura compartida

Supabase constituye infraestructura común, pero no todas sus capacidades son obligatorias para todos los juegos.

## Compartido claramente

* Auth;
* Postgres;
* autorización;
* persistencia.

## Dependiente del juego

* Realtime;
* Presence;
* operaciones sincronizadas;
* requerimientos específicos de privacidad.

Incremento 4 requiere Realtime para avisar cambios persistidos del lobby. Presence queda fuera de Room + Lobby y se introduce recién en Incremento 5 para conexión, desconexión y sucesión del host.

Un futuro juego podría no necesitarlos.

---

# 11. Postgres

Postgres será la fuente principal de persistencia compartida.

## Plataforma

Conceptualmente conserva:

* grupos;
* jugadores;
* relaciones necesarias para identidad y pertenencia `Player -> Group`.

Para el Incremento 2 no se introduce una entidad `Membership` separada.

Al cierre del Incremento 2, esta capa ya tiene persistencia concreta para `groups`, `players` e invitaciones de grupo, con RLS activa y escrituras encapsuladas en RPCs autoritativas.

También permite listar integrantes del propio grupo mediante lectura autorizada por RLS, y recuperar la invitación activa del administrador mediante una RPC sin parámetros basada en `auth.uid()`.

## Impostor

Conceptualmente conserva:

* `GroupWord`;
* estado operativo;
* rondas;
* votos;
* marcador;
* historial.

No se diseñan todavía:

* tablas;
* columnas;
* índices;
* constraints concretos;
* migrations.

---

# 12. Estado operativo vs histórico

## Persistente de plataforma

* `Group`
* `Player`

## Persistente de Impostor

* `GroupWord`
* `GameSessionHistory`
* `RoundHistory`

## Operativo de Impostor

* `Room`
* `RoomParticipant`
* `GameSession` activa
* `SessionPlayer`
* `Round` activa
* `Vote`
* `RoundResult` operativo

Operativo no significa necesariamente solo en memoria.

Puede persistirse técnicamente para facilitar consistencia y recuperación.

## Room + Lobby en Incremento 4

`Room` pertenece exclusivamente al dominio de Impostor.

```text
Group = quiénes somos
Room  = quiénes estamos jugando ahora
```

Una Room es temporal en el dominio, pero se persiste técnicamente para soportar concurrencia, refresh, reconstrucción y sincronización entre teléfonos.

El lifecycle mínimo de Incremento 4 es:

```text
lobby → closed
```

No se usan todavía `playing` ni `finished`; esos estados dependen de `GameSession` y pertenecen a incrementos posteriores.

Un Player puede pertenecer a una sola Room activa de Impostor. Un Group puede tener varias Rooms activas. El creador de una Room es su host inicial y también su participante. El host no recibe capacidades de gameplay en este incremento.

Un participante no-host puede salir del lobby. El host puede cerrar el lobby. Si el host quiere abandonarlo, la Room se cierra. No existe sucesión automática del host ni expiración automática en Incremento 4.

El cliente no envía como autoridad `player_id`, `group_id`, `host_player_id` ni `auth_user_id`. El backend deriva esos datos desde `auth.uid()`, `Player` y `Group`.

El lobby toma como fuente de verdad las filas persistidas de `Room` y `RoomParticipant`. Postgres Changes funciona como aviso para volver a leer el lobby; no es autoridad y no sustituye el refetch después de reconexión o eventos perdidos.

---

# 13. RLS y autorización

RLS protege acceso a datos compartidos.

## Plataforma

Debe permitir conceptualmente:

* que un jugador acceda solo a los grupos donde corresponde;
* que pertenencia y permisos no dependan del cliente.

En el Incremento 2, las escrituras directas a plataforma permanecen bloqueadas para el cliente. Crear grupo, unirse por invitación y recuperar invitación activa usan operaciones autoritativas acotadas.

## Impostor

Debe permitir conceptualmente:

* que un participante acceda a la sala correspondiente;
* que un integrante no consulte el banco completo;
* que el banco no sea explorable libremente por ningún integrante en el Incremento 3;
* que un autor pueda consultar y borrar sus propios aportes;
* que información privada no quede expuesta.

No se escriben políticas RLS concretas en este documento.

---

# 14. Admin de grupo vs Host de Impostor

## Group Admin

Rol persistente y transversal del grupo.

En el Incremento 2 se representa con `Group.adminPlayerId`.

No hace falta persistir también `Player.role` para administrador en esta etapa.

Puede:

* consultar integrantes;
* eliminar integrantes.

En el Incremento 3 no puede explorar el banco completo de Impostor por ser administrador. Sus permisos sobre palabras se limitan a los de cualquier integrante: agregar, ver cantidad total, consultar sus aportes y borrar sus aportes.

## Room Host

Rol temporal dentro de una sala de Impostor.

En Incremento 4 solo se representa visualmente. Las capacidades de gameplay se habilitan cuando exista `GameSession`.

Host no implica admin.

Admin no implica host.

---

# 15. Operaciones autoritativas

Debe existir una capa conceptual de operaciones autoritativas para acciones sensibles.

No decidimos todavía si cada operación será:

* función Postgres;
* RPC;
* server function;
* otra opción apropiada.

En Impostor deben proteger:

* iniciar tanda;
* preparar ronda;
* seleccionar palabra;
* seleccionar impostor;
* validar guards;
* registrar voto;
* resolver votación;
* resolver empate;
* actualizar puntuación;
* crear siguiente ronda;
* reasignar host;
* terminar tanda;
* persistir historial.

Principio:

```text
UI
→ intención
→ autoridad
→ validación
→ cambio de estado
→ sincronización
```

## Operaciones de Room

Incremento 4 cerró estas RPCs dentro del módulo de Impostor:

```text
create_room()
join_room_by_code(room_code)
get_my_active_room()
leave_room()
close_room()
```

Room no forma parte del bootstrap global de Platform ni de `LocalIdentity`. El bootstrap resuelve `AuthIdentity → Player → Group`; luego Impostor reconstruye o modifica Room desde ese contexto autoritativo.

Las operaciones de Room derivan ownership desde `auth.uid()`. El cliente no envía `player_id`, `group_id`, `room_id` ni `host_player_id`.

* `create_room()` crea Room sin argumentos de ownership o devuelve la Room activa existente si el Player ya pertenece a una;
* `join_room_by_code(room_code)` deriva Player y Group desde `auth.uid()` y valida que la Room esté en `lobby`;
* `get_my_active_room()` reconstruye la Room activa del Player sin recibir `player_id` ni `group_id`;
* `leave_room()` permite abandonar como participante no-host y cierra la Room si quien sale es el host;
* `close_room()` cierra la Room solo si quien llama es el host.

La creación incluye atómicamente Room, host y participación inicial. El join es idempotente y no duplica `RoomParticipant`.

Las lecturas del lobby devuelven únicamente Room, estado, host, nicknames y la marca necesaria para identificar al participante propio sin exponer UUIDs de Player. No existe una lectura pública de todas las Rooms. Supabase Realtime funciona como capa de invalidación: avisa `INSERT`/`DELETE` de participantes y `UPDATE` de Room para repetir una lectura autorizada. La autoridad sigue siendo Postgres + RPCs.

---

# 16. Dominio independiente de infraestructura

Las reglas puras de Impostor deberían mantenerse independientes de Supabase cuando sea razonable.

Ejemplos:

* normalizar palabras;
* determinar jugadores elegibles como impostor;
* elegir entre candidatos;
* resolver conteo de votos;
* determinar ganador;
* calcular puntuación.

Supabase debe resolver:

* persistencia;
* autorización;
* identidad;
* sincronización;
* coordinación.

Evitar mezclar reglas puras con llamadas a infraestructura.

---

# 17. Privacidad específica de Impostor

El sistema puede conocer:

```text
word
impostorPlayerId
```

pero cada participante debe recibir solo su información autorizada.

## Jugador normal

Puede recibir:

```text
role: player
word: ...
```

## Impostor

Puede recibir:

```text
role: impostor
```

y no la palabra.

No implementar privacidad así:

```text
enviar todo
→ ocultar palabra con CSS/React
```

El dato sensible no debe ser entregado al cliente no autorizado.

---

# 18. Votos privados

Los votos individuales deben permanecer privados durante la votación.

El cliente puede conocer:

* que ya votó;
* cuándo todos terminaron;
* resultado agregado cuando corresponda.

No necesita conocer votos individuales ajenos.

No mantener historial individual de votos después de la tanda en el MVP.

---

# 19. Realtime específico de Impostor

En Incremento 4, el único caso cerrado es el lobby:

```text
Postgres Changes
→ aviso de cambio persistido
→ refetch autoritativo de Room + RoomParticipant
```

La suscripción queda acotada por `room_id` de la Room activa reconstruida por `get_my_active_room()`.
Ese id es metadato técnico para filtrar el canal, no una autoridad de producto ni contenido visible
del lobby.

El payload no es fuente final de verdad. Ante `INSERT room_participants` o `UPDATE rooms`, el cliente
invalida el lobby y llama nuevamente a `get_my_active_room()`. Ante reconexión exitosa también relee
completo, porque Realtime no garantiza que todos los eventos intermedios hayan sido observados.

`DELETE room_participants` queda fuera mientras no exista salida de sala en producto. No se habilita
`REPLICA IDENTITY FULL` solo como preparación especulativa.

La sincronización de tanda, rondas, votos, resultados y marcador se definirá junto con `GameSession`.

---

# 20. Presence

Presence quedó fuera de Incremento 4.

En Incremento 5 se utiliza Supabase Realtime Presence para representar disponibilidad efímera de los `RoomParticipant` de una Room activa:

* conectado;
* desconectado;
* disponibilidad para sucesión de host.

Presence funciona como señal inmediata de disponibilidad. No reemplaza `RoomParticipant`, no reemplaza `Player` y no constituye autoridad para `hostPlayerId`.

Varias conexiones de un mismo Player se reducen a un único Player lógico.

La separación conceptual del Incremento 5 es:

```text
RoomParticipant
= pertenencia persistida a una Room

Presence
= disponibilidad efímera connected/disconnected

rooms.host_player_id
= host autoritativo persistido
```

La Presence debe estar acotada a la Room activa. El identificador interno preferido del canal es `roomId`, no `joinCode`, porque el código pertenece al ingreso compartible y no debería funcionar como clave conceptual del canal.

Solo un Player autenticado que sea `RoomParticipant` de esa Room puede participar u observar su Presence.

Un evento de pérdida de Presence no equivale inmediatamente a abandono. La sucesión requiere validación autoritativa adicional antes de modificar `host_player_id`.

Para sucesión de host se necesita una señal remota verificable de liveness que no dependa solamente de la afirmación de otro cliente. Conceptualmente puede expresarse como `lastSeenAt` en `RoomParticipant` o un equivalente técnico mínimo.

Ese dato:

* sirve solo para validar staleness;
* no es el estado visual principal de Presence;
* no es historial;
* no se muestra al usuario;
* no implica auditoría de conexiones;
* no debe convertirse en infraestructura genérica.

La tolerancia inicial del MVP antes de considerar al host no disponible para sucesión es 60 segundos. Es una hipótesis técnica/producto a validar en navegadores móviles, no una regla definitiva del juego ni configuración de usuario.

La reasignación de host debe quedar registrada en el estado autoritativo. El flujo sigue siendo:

```text
estado persistido cambia
→ Realtime invalida
→ get_my_active_room() vuelve a leer
→ todos observan el nuevo host
```

Presence no se convierte en fuente de verdad del lobby persistente.

---

# 21. Ejemplo completo: START_VOTING

```text
Host toca "Ir a votación"
        ↓
PWA envía intención
        ↓
autoridad valida:
- actor es host
- ronda está en PLAYING
        ↓
estado cambia a VOTING_FIRST
        ↓
Realtime propaga estado
        ↓
cada participante muestra UI de votación
```

---

# 22. Ejemplo completo: PREPARE_ROUND

```text
Host solicita nueva ronda
        ↓
autoridad valida:
- jugadores suficientes
- palabra disponible
        ↓
selecciona palabra
        ↓
calcula menor impostorCount
        ↓
elige impostor aleatoriamente entre elegibles
        ↓
crea ronda
        ↓
actualiza contador
        ↓
genera vistas privadas
        ↓
estado pasa a ROLE_REVEAL
        ↓
clientes reciben su información autorizada
```

---

# 23. Consistencia y concurrencia

La arquitectura debe contemplar pocos clientes concurrentes, pero correctamente.

Casos:

* dos taps sobre `Nueva ronda`;
* varios votos simultáneos;
* último voto dispara resolución;
* reintentos de red;
* dos clientes reaccionando a desconexión de host.

Principio:

> Las operaciones importantes deben ser atómicas o consistentes e idempotentes cuando corresponda.

No definimos todavía implementación transaccional exacta.

---

# 24. Host disconnect

Comportamiento actual de Impostor:

Si el host deja de estar disponible:

1. observar ausencia candidata mediante Presence;
2. validar staleness con una señal remota verificable de liveness;
3. aplicar la tolerancia inicial de 60 segundos;
4. excluir al host no disponible;
5. ordenar participantes disponibles restantes por `joinedAt`;
6. elegir el más antiguo;
7. registrar el nuevo `host_player_id` autoritativamente y de forma resistente a carreras.

Si el host original vuelve:

* vuelve como participante normal;
* no recupera host automáticamente.

---

# 25. Reconexión

Cuando un cliente vuelve después de:

* refresh;
* lock/unlock;
* background;
* pérdida de red;
* cierre/reapertura;

la secuencia conceptual debe ser:

```text
recuperar identidad
↓
recuperar grupo
↓
detectar contexto activo
↓
consultar estado autoritativo
↓
recuperar vista privada
↓
re-suscribirse
```

No diseñamos todavía política avanzada de expiración o timeout.

---

# 26. Historial y estadísticas futuras

Al finalizar una tanda de Impostor:

* cerrar estado operativo;
* preservar `GameSessionHistory`;
* preservar `RoundHistory`;
* no conservar votos individuales históricos.

Esto permitirá estadísticas futuras.

La pantalla de estadísticas no forma parte obligatoria del primer MVP.

---

# 27. Futuro segundo juego

Tutti Frutti es solo un ejemplo arquitectónico futuro.

```text
Juegos Familiares
│
├── Platform
│   ├── Group
│   ├── Player
│   ├── Auth
│   └── PWA
│
├── Impostor
│   └── dominio actual
│
└── Tutti Frutti
    └── dominio futuro
```

Cuando se diseñe Tutti Frutti se decidirá qué infraestructura y conceptos puede reutilizar.

No diseñamos Tutti Frutti ahora.

---

# 28. Dependencia de Supabase

Supabase reduce complejidad operativa al proporcionar:

* Auth;
* Postgres;
* RLS;
* Realtime;
* Presence.

El trade-off es la dependencia del proveedor.

Mitigación conceptual:

* mantener dominio puro independiente;
* evitar que componentes de UI dependan directamente de detalles de infraestructura cuando no sea necesario;
* encapsular accesos a backend razonablemente;
* no construir capas abstractas innecesarias solo para evitar lock-in hipotético.

---

# 29. Límites del MVP

Quedan fuera:

* múltiples backends;
* microservicios;
* matchmaking;
* usuarios públicos;
* social network;
* offline multijugador;
* peer-to-peer;
* escalabilidad masiva;
* colas distribuidas;
* moderación avanzada;
* sistema de plugins para juegos;
* motor universal de juegos;
* abstracciones anticipadas para Tutti Frutti;
* analytics sofisticados.

---

# 30. Decisiones diferidas

Se difieren:

* framework frontend exacto si todavía no está formalmente decidido;
* estructura física definitiva de carpetas;
* schema SQL posterior a identidad/grupo/jugador;
* RLS concreto para banco de palabras, salas, rondas, votos y permisos de Impostor;
* RPC/Functions concretas posteriores a identidad, grupo e invitación;
* Postgres Changes vs Broadcast por evento;
* estrategia exacta service worker/cache;
* limpieza de salas;
* expiraciones;
* tolerancia precisa a desconexiones;
* recuperación avanzada;
* UI/design system.

No cerramos decisiones que todavía no fueron tomadas.

---

# 31. Relación con futura estructura del repositorio

Una futura estructura podría separar conceptualmente:

```text
app/
├── platform/shared
└── impostor
```

o equivalente.

Y dominio:

```text
domain/
└── impostor
```

No fijamos nombres de carpetas definitivos.

Lo importante es la separación de responsabilidades, no la estructura exacta.

---

# 32. Próximo paso

Con la arquitectura conceptual cerrada, el siguiente paso es crear:

```text
sources/implementation-plan.md
```

Ese plan deberá convertir arquitectura y dominio de Impostor en incrementos verticales pequeños, verificables y pedagógicos.
