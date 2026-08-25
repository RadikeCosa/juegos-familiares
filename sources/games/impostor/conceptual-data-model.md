# Impostor — Modelo conceptual de datos

## Propósito

Este documento describe las principales entidades de información que existen en Impostor y las relaciones entre ellas.

No define todavía:

* una base de datos;
* tablas;
* APIs;
* tecnologías;
* formatos de almacenamiento.

Su objetivo es responder primero:

> ¿Qué información necesita comprender y recordar el sistema?

---

# Vista general

El modelo puede pensarse así:

```text
Grupo
├── Jugadores
├── GroupWords
└── Salas
     └── Tanda
          ├── Participantes
          ├── Rondas
          │    ├── Palabra
          │    ├── Impostor
          │    └── Votos
          └── Marcador

Historial persistente
├── Historial de tandas
└── Historial de rondas
```

---

# Alcance dentro de Juegos Familiares

Este documento describe el modelo conceptual necesario para Impostor.

Algunos conceptos pueden pertenecer al nivel compartido de Juegos Familiares:

```text
AuthIdentity
Group
Player
LocalIdentity
Invitation
```

Otros conceptos son propios de Impostor:

```text
GroupWord
Room
RoomParticipant
GameSession
SessionPlayer
Round
RoundVote
RoundResult
GameSessionHistory
RoundHistory
```

No estamos definiendo todavía un modelo conceptual general para todos los juegos.

En el Incremento 2, `Group` ya existe como contexto social persistente. `Room` sigue siendo una entidad futura de Impostor.

```text
Group = quiénes somos
Room  = dónde/qué estamos jugando ahora
```

Desde Incremento 6 se agrega explícitamente:

```text
Group = contexto social persistente
Room = espacio temporal de juego actual
GameSession = tanda competitiva concreta
Round = ronda dentro de la tanda
```

---

# 1. Grupo

## Qué representa

Un conjunto persistente de personas que juegan habitualmente entre sí.

Puede ser una capacidad compartida de Juegos Familiares.

Impostor lo utiliza como contexto para banco de palabras, salas y permisos.

Ejemplo:

`Familia`

## Información mínima

```text
Group
- id
- name
- adminPlayerId
- createdAt
```

## Persistencia

Persistente.

El grupo continúa existiendo aunque no haya ninguna partida activa.

## Visibilidad

Compartida entre sus integrantes.

## Responsabilidades

El grupo determina:

* qué jugadores pertenecen al grupo;
* qué banco de palabras utiliza;
* quién tiene permisos de administración.

En el Incremento 2, la pantalla de grupo muestra el nombre y la lista de integrantes. No representa todavía una sala ni una partida activa.

---

# 2. Jugador

## Qué representa

La identidad de una persona dentro de un grupo.

Puede ser una capacidad compartida de Juegos Familiares.

Ejemplo:

```text
Ramiro
Pedro
Camila
Victoria
```

## Información mínima

```text
Player
- id
- groupId
- nickname
- createdAt
```

Para el Incremento 2, la condición de administrador del grupo se deriva de `Group.adminPlayerId`.

No hace falta persistir además un `Player.role` para administrador en esta etapa.

Esto no se confunde con roles temporales de partida, como host de sala o impostor de ronda.

## Persistencia

Persistente.

## Visibilidad

El nombre del jugador es visible dentro del grupo.

Otros datos técnicos de identidad no necesitan ser visibles.

---

# 3. Identidad del dispositivo

## Qué representa

La asociación entre una instalación o navegador y el jugador que está utilizando ese dispositivo.

Puede ser una capacidad compartida de Juegos Familiares.

Conceptualmente:

```text
este teléfono → Ramiro
```

## Información posible

```text
LocalIdentity
- playerId
- groupId
```

## Ubicación

Principalmente local al dispositivo.

## Persistencia

Debe sobrevivir entre aperturas de la aplicación.

## Motivo

Permite evitar que el usuario tenga que volver a escribir su nombre o identificarse en cada partida.

No determina por sí sola permisos ni autorización.

Las operaciones protegidas dependen del estado compartido y de la capacidad correspondiente del jugador.

Esta entidad puede no existir finalmente como registro remoto independiente.

Su implementación dependerá de la arquitectura elegida.

Para el Incremento 2, `LocalIdentity` no guarda invitaciones ni lista de jugadores, no autoriza acciones y no permite recuperar una identidad perdida si ya no existe una `AuthIdentity` válida.

---

# 4. Invitación de grupo

## Qué representa

Una forma compartible para que otra persona se una al mismo `Group`.

La invitación pertenece al grupo, no a una sala.

## Información mínima

```text
Invitation
- code
- groupId
- createdAt
- revokedAt / expiresAt (futuro o según política)
```

El código debe ser opaco, no secuencial y distinto de `groupId`.

## Persistencia

Persistente mientras esté activa.

En el Incremento 2 existe una invitación activa por grupo.

## Visibilidad

El administrador puede recuperar la invitación activa de su grupo.

Un jugador común no necesita ver código ni enlace de invitación.

El cliente no debe acceder directamente a la tabla de invitaciones. Resolver o unirse a una invitación ocurre mediante operaciones autoritativas.

---

# 5. GroupWord

## Qué representa

Una palabra o frase corta disponible para utilizar en una ronda futura.

En este documento, `GroupWord` representa una entrada persistente del banco de palabras específico de Impostor.

Ejemplos:

```text
Milanesa
Messi
Chocotorta
Bariloche
Harry Potter
Buenos Aires
```

## Información mínima

```text
GroupWord
- id
- groupId
- text
- normalizedText
- authorPlayerId
- createdAt
```

## Relaciones

```text
Group
1 ───── N GroupWord

Player
1 ───── N GroupWord
        como autor
```

## Texto y normalización

`text` conserva el valor canónico de display.

Ejemplo:

```text
"  Harry   Potter  "
→
"Harry Potter"
```

`normalizedText` existe para detectar duplicados triviales dentro del grupo.

La normalización:

* elimina espacios externos;
* colapsa whitespace interno;
* compara sin distinguir mayúsculas/minúsculas;
* conserva tildes;
* conserva `ñ`;
* conserva puntuación;
* rechaza emojis;
* no aplica normalización lingüística agresiva.

Ejemplos:

```text
Elefante / elefante / ELEFANTE
→ duplicado

Camion / Camión
→ distintos

Papa / Papá
→ distintos

Spider-Man / spider-man
→ duplicado

Spider-Man / Spider Man
→ distintos
```

La longitud conceptual para el Incremento 3 es de 2 a 40 caracteres.

## Persistencia

Persistente.

## Visibilidad

Parcialmente privada.

### Jugador normal

Puede conocer:

* las palabras que él mismo agregó;
* cantidad total disponible.

### Administrador

En el MVP del Incremento 3, no puede consultar todas las palabras por ser administrador.

Puede agregar palabras, conocer la cantidad total, consultar sus propios aportes y borrar sus propios aportes como cualquier integrante.

La moderación completa queda diferida.

### Durante una ronda

La palabra seleccionada solamente debe llegar a los jugadores que no son impostores.

## Diferencia con palabra de ronda

`GroupWord` es una entrada persistente disponible en el banco del grupo.

La palabra seleccionada para una ronda futura pertenece al estado de partida o ronda correspondiente.

No se introduce todavía una entidad adicional para palabras usadas.

## Disponibilidad durante una tanda

Una ronda solamente puede crearse si existe al menos una palabra del banco que:

* esté disponible;
* no haya sido utilizada durante la tanda actual.

Si no existe ninguna palabra disponible, la sesión no puede avanzar a una nueva ronda hasta que se agreguen palabras o se termine la tanda.

---

# 6. Sala

## Qué representa

Una sesión temporal donde un subconjunto del grupo se reúne para jugar.

Todavía no existe en el Incremento 2.

Ejemplo:

```text
Sala X7K2

Ramiro
Pedro
Victoria
```

Camila puede pertenecer al grupo y no formar parte de esa sala.

## Información mínima

```text
Room
- id
- groupId
- joinCode
- hostPlayerId
- status
- createdAt
```

En Incremento 4 el lifecycle implementado fue:

```text
lobby
closed
```

Desde Incremento 6, el lifecycle conceptual vigente de Room es:

```text
lobby
playing
closed
```

`Room.status` responde solamente:

```text
¿se puede seguir entrando?
¿hay una tanda en curso?
¿la Room terminó?
```

El detalle de fases de juego pertenece a `GameSession.state`, por ejemplo:

```text
Room.status = playing
GameSession.state = ROLE_REVEAL
```

`finished` no se introduce como estado de Room en el contrato mínimo de Incremento 6.

## Persistencia

Room es temporal en el dominio, pero se persiste técnicamente para concurrencia, refresh, reconstrucción y sincronización.

Una Room cerrada no cuenta como activa.

Una Room en `playing` mantiene el contexto compartido de gameplay y no admite nuevos joins.

El cierre de una Room libera a sus participantes para crear o unirse a otra Room. La membresía puede conservarse técnicamente para saber quién participó, pero una Room `closed` no es lobby activo ni historial visible de producto.

## Visibilidad

Compartida entre los participantes de la sala.

---

# 7. Participación en sala

## Qué representa

La relación entre un jugador y una sala concreta.

No conviene modelar simplemente:

```text
Room.players = [...]
```

porque en el futuro podemos necesitar información sobre esa participación.

## Información conceptual para Incremento 4

```text
RoomParticipant
- roomId
- playerId
- joinedAt
```

En la base física puede existir `group_id` en esta relación como dato técnico de integridad. No forma parte del modelo conceptual de producto: la pertenencia social persistente sigue estando en `Group` y `Player`.

En una Room `lobby`, una fila significa:

> este Player pertenece actualmente a esta Room.

No significa que el Player esté conectado ahora.

Para Incremento 5.1, la conexión visual ya cerrada no debe agregarse conceptualmente como una conversión de `RoomParticipant` en conexión. La separación es:

```text
RoomParticipant
= pertenencia persistida

Presence
= disponibilidad efímera connected/disconnected

room_participants.last_seen_at
= evidencia autoritativa de actividad reciente

rooms.host_player_id
= host autoritativo persistido
```

`connectionStatus`, `isOnline`, `presenceState`, `ready`, `score` y `sessionPlayerId` no forman parte de `RoomParticipant` en Incremento 4.

Incremento 5.2 agregó conceptualmente `room_participants.last_seen_at` como señal remota verificable de liveness del Player dentro de esa Room, con alcance estricto:

* sirve solo para validar staleness;
* no es el estado visual principal de Presence;
* no es historial;
* no se muestra al usuario;
* no implica auditoría de conexiones;
* no debe convertirse en infraestructura genérica.

`last_seen_at` no representa Presence, conexión, abandono, host, ready ni estado de juego.

Una nueva participación comienza con `last_seen_at = now()`. El backfill físico de 5.2 queda fuera del modelo conceptual: fue acotado a Rooms en `lobby` y no convirtió Rooms cerradas en actividad reciente.

La escritura se realiza para el RoomParticipant propio mediante autoridad backend: el cliente no suministra `player_id`, `room_id` ni timestamp. Liveness es por Player-en-Room, no por conexión ni pestaña.

La Presence debe estar acotada a la Room activa y usar internamente `roomId` como identificador preferido del canal. `joinCode` sigue siendo una representación compartible para entrar a la Room, no la clave conceptual de Presence.

Solo un Player autenticado que sea `RoomParticipant` de esa Room puede participar u observar la Presence de esa Room.

Incremento 5.3 cerró la sucesión autoritativa de host sin convertir Presence en autoridad. `rooms.host_player_id` sigue siendo el host persistido y solo cambia cuando la autoridad valida que el host actual está stale según `last_seen_at`.

Si corresponde sucesión, el sucesor se elige entre `RoomParticipants` restantes con liveness active, excluyendo al host actual y ordenando por:

```text
joined_at ASC
player_id ASC
```

`player_id` es únicamente un desempate técnico determinístico. No se muestra como criterio de producto.

Si el host está desconectado en Presence pero `last_seen_at` todavía está active, no hay sucesión. Si no hay candidatos active, no hay sucesión, la Room sigue `lobby` y el host actual permanece persistido.

Si el host original vuelve después de haber sido reemplazado, vuelve como participante normal. No existe recuperación automática del rol, `previous_host` ni historial de hosts en 5.3.

## Persistencia

Temporal.

## Slot activo

`player_active_room_slots` es una estructura técnica de integridad, no una entidad de dominio. Su propósito es garantizar que un Player tenga como máximo una Room activa y liberar ese bloqueo al salir o cerrar la Room.

---

# 8. Tanda

## Qué representa

El conjunto de rondas jugadas consecutivamente por los participantes de una sala.

Una sala puede producir inicialmente una sola tanda.

Conceptualmente las mantenemos separadas porque representan ideas diferentes:

```text
Sala
→ conexión entre jugadores

Tanda
→ competencia y marcador
```

## Información mínima para Incremento 6

```text
GameSession
- id
- roomId
- startedAt
- state
```

El lifecycle futuro de GameSession puede crecer, pero Incremento 6 solamente necesita llegar a:

```text
ROLE_REVEAL
```

`PREPARING_ROUND` sigue siendo un concepto válido de la máquina de estados, pero no necesita obligatoriamente constituir un estado persistido observable. `START_SESSION` puede realizar atómicamente:

```text
LOBBY
→ preparación transaccional
→ ROLE_REVEAL
```

No debe existir un estado durable inválido como una GameSession creada sin Round.

## Persistencia

Operativa y temporal mientras la tanda está activa.

Al finalizar, debe producir un resumen histórico mínimo persistente.

## Responsabilidades

Mantiene:

* participantes de la tanda;
* rondas;
* palabras utilizadas;
* historial necesario para balancear impostores.

En Incremento 6 no se agrega todavía `winner`, `finalScores` ni `roundCount`.

El estado operativo puede desaparecer cuando ya no se necesita para coordinar la sala activa.

El resumen histórico de la tanda debe conservarse para estadísticas futuras.

---

# 9. Participante de la tanda

## Qué representa

La participación de un jugador en una tanda concreta.

## Información conceptual para Incremento 6

```text
SessionPlayer
- sessionId
- playerId
```

`SessionPlayer` representa el roster congelado de la tanda. No se reutiliza dinámicamente `RoomParticipant` como roster de `GameSession`.

Una desconexión no elimina `SessionPlayer` ni modifica automáticamente el roster.

`score` pertenece a scoring posterior. `voteSubmitted` pertenece a votación. `impostorCount` puede derivarse de rondas anteriores y no se persiste conceptualmente como dato obligatorio en Incremento 6.

Al cierre técnico de Incremento 7 no se persisten `roleAcknowledged`, `role_acknowledged_at` ni `allRolesSeen` para el MVP. La coordinación de que todos vieron su rol ocurre presencialmente y el avance a conversación lo ejecuta el host actual mediante `start_round_discussion()`.

## Persistencia

Temporal.

---

# 10. Ronda

## Qué representa

Una unidad individual del juego.

Cada ronda tiene:

* una palabra;
* un impostor;
* votos;
* resultado.

## Información mínima

```text
Round
- id
- sessionId
- number
- secretWord
- normalizedSecretWord
- impostorPlayerId
- createdAt
```

`secretWord` y `normalizedSecretWord` son un snapshot conceptual de la palabra efectivamente usada.

Ese snapshot permite recordar qué palabra se jugó aunque el `GroupWord` original deje de existir, y preservar la regla de no repetición durante la tanda aunque una palabra se borre y vuelva a agregarse con diferencias triviales de mayúsculas o espacios.

En la forma mínima implementada por Incremento 6, `Round` guarda el snapshot de texto y normalización. No existe `rounds.group_word_id`.

`winner`, `accusedPlayer`, `finishedAt`, `guessResult` y cambios de score quedan fuera de Incremento 6.

Para Incremento 6 la fase global pertenece a `GameSession.state`; no se agrega `Round.status` si duplicaría esa misma fase. Incremento 7 mantiene esa decisión para `role_reveal → discussion`.

## Persistencia

Operativa y temporal durante la tanda.

Al finalizar la tanda, solamente debe conservarse un resumen histórico mínimo de cada ronda.

---

# 11. Vista privada de la ronda

## Problema

La ronda contiene conceptualmente:

```text
secretWord
impostorPlayerId
```

pero esa información no debe entregarse completa a todos los dispositivos.

El servidor conoce el estado completo.

Cada jugador recibe una vista limitada derivada para el caller.

## Jugador normal

```text
role = player
word = "Milanesa"
```

## Impostor

```text
role = impostor
word = null
```

No recibe la palabra.

No se introduce en Incremento 6 una entidad persistente `RoundPlayerAssignment` si únicamente repetiría `Round.secretWord`, `Round.impostorPlayerId` y `SessionPlayers`.

## Principio

Una vista privada de datos no es lo mismo que ocultar datos en la interfaz.

La arquitectura debe impedir que información secreta innecesaria llegue al dispositivo.

---

# 12. Voto

## Qué representa

La elección privada de un jugador durante una votación.

## Información mínima

```text
RoundVote
- roundId
- votingRound
- voterPlayerId
- targetPlayerId
- createdAt
```

La futura tabla física prevista puede llamarse:

```text
round_votes
```

Puede incluir columnas técnicas adicionales cuando hagan falta para integridad referencial, por ejemplo `game_session_id`, pero esas columnas no se convierten en conceptos de producto si solo redundan información derivable desde `Round`.

## VotingRound

Inicialmente:

```text
1
2
```

La segunda corresponde a una eventual votación por empate.

## Restricciones

Un jugador:

* solamente puede votar una vez por Round y etapa;
* no puede votarse a sí mismo.

La identidad lógica de un voto debe garantizar:

```text
un solo voto por voterPlayerId
por roundId
por votingRound
```

La integridad no debe depender solo del cliente. La implementación futura debe poder garantizar estructuralmente:

```text
voterPlayerId ∈ SessionPlayers de la GameSession
targetPlayerId ∈ SessionPlayers de la GameSession
voterPlayerId != targetPlayerId
```

El impostor vota como cualquier `SessionPlayer`. El host también vota y no tiene voto especial.

## Persistencia

Temporal.

Los votos pertenecen a `Round`, no solamente a `GameSession`.

## Visibilidad

Privada mientras se vota.

Durante la votación no se muestran votos individuales ajenos, conteos parciales ni quién votó a quién. El host no recibe privilegios informativos sobre votos.

Los resultados agregados se revelan solamente cuando corresponde y no requieren exponer quién votó a quién.

---

# 13. Resultado de ronda

## Qué representa

La resolución de lo ocurrido después de la votación.

Podría derivarse de la ronda y los votos, pero conceptualmente necesitamos distinguir:

```text
impostor descubierto
impostor no descubierto
palabra adivinada
ganador
```

## Información conceptual

```text
RoundResult
- accusedPlayerId
- impostorWasFound
- impostorGuessedWord
- winner
```

## Persistencia

Operativa y temporal durante la tanda.

Los datos necesarios para estadísticas futuras se conservan después en el historial mínimo de ronda.

---

# 14. Marcador

El marcador puede representarse mediante el `score` de cada `SessionPlayer`.

No necesitamos inicialmente una entidad separada.

Conceptualmente:

```text
Ramiro    3
Pedro     2
Camila    4
Victoria  3
```

## Regla

### Victoria del impostor

```text
impostor +2
```

### Victoria del grupo

```text
cada jugador normal +1
```

---

# 15. Permisos conceptuales

No necesitamos inicialmente una entidad compleja de permisos.

Las operaciones protegidas deberán distinguir al menos estas capacidades:

* administrador;
* host;
* participante;
* autor de palabra.

Estas capacidades se derivan del estado compartido correspondiente.

Ejemplos:

* cualquier integrante puede agregar palabras, consultar cantidad total, consultar sus propios aportes y borrar sus propios aportes;
* el host de la sala puede avanzar etapas de la tanda;
* el participante de la sala puede recibir su información privada y votar;
* el autor de una palabra puede consultar sus propias palabras.

La identidad local ayuda a recordar al jugador en el dispositivo, pero no reemplaza estas comprobaciones conceptuales.

---

# 16. Historial persistente

El estado operativo de una sala y una tanda sigue siendo temporal.

Al finalizar una tanda, el sistema debe conservar un resumen histórico mínimo que permita construir estadísticas futuras del grupo.

No necesitamos conservar absolutamente todo lo ocurrido durante la partida.

## GameSessionHistory

Representa el resumen persistente de una tanda finalizada.

Información conceptual mínima:

```text
GameSessionHistory
- id
- groupId
- startedAt
- finishedAt
- participants
- roundCount
- finalScores
```

## RoundHistory

Representa el resumen persistente de una ronda finalizada dentro de una tanda.

Información conceptual mínima:

```text
RoundHistory
- sessionHistoryId
- roundNumber
- impostorPlayerId
- winner
- impostorWasFound
- impostorGuessedWord
```

## Alcance

El historial mínimo permite derivar estadísticas futuras como rondas jugadas, victorias, rendimiento como impostor, veces que un impostor fue descubierto o veces que adivinó la palabra.

No hace falta conservar votos individuales históricos salvo que aparezca una razón concreta.

Este modelo no define tablas, schemas ni base de datos.

---

# Relaciones principales

```text
Group
  1 ──────── N Player

Group
  1 ──────── N GroupWord

Player
  1 ──────── N GroupWord
              ↑
           autor

Group
  1 ──────── N Room

Room
  1 ──────── N RoomParticipant

Room
  1 ──────── 0..1 GameSession

GameSession
  1 ──────── N SessionPlayer

GameSession
  1 ──────── N Round

Round
  guarda snapshot de palabra
  sin FK física a GroupWord

Round
  N ──────── 1 Player
              ↑
           impostor

Round
  1 ──────── N RoundVote

Group
  1 ──────── N GameSessionHistory

GameSessionHistory
  1 ──────── N RoundHistory
```

---

# Clasificación por duración

## Persistente

```text
Group
Player
GroupWord
GameSessionHistory
RoundHistory
```

Sobreviven entre partidas.

## Local persistente

```text
LocalIdentity
```

Permite recordar quién utiliza el dispositivo.

## Temporal

```text
Room
RoomParticipant
GameSession
SessionPlayer
Round
RoundVote
RoundResult
```

Existen principalmente mientras se desarrolla una partida.

---

# Clasificación por visibilidad

## Compartido

Puede ser conocido por todos los participantes correspondientes:

```text
nombre del grupo
jugadores
participantes de la sala
estado general de la partida
marcador
resultado final
```

## Privado

Debe limitarse según jugador:

```text
palabra secreta durante la ronda
rol individual
voto individual
```

## Parcialmente privado

```text
banco de palabras
```

Los integrantes no consultan el banco completo.

El administrador tampoco consulta el banco completo en el MVP del Incremento 3.

---

# Clasificación por ubicación conceptual

## Principalmente local

```text
identidad del dispositivo
estado visual temporal
cache de la PWA
preferencias locales
```

## Compartido/remoto

```text
grupo
jugadores
palabras
sala
tanda
ronda
votos
marcador
historial mínimo de tandas
historial mínimo de rondas
```

---

# Lo que este modelo todavía no decide

Este documento no decide:

* SQL o NoSQL;
* Supabase, Firebase u otro servicio;
* WebSockets;
* Server-Sent Events;
* polling;
* autenticación concreta;
* almacenamiento local concreto;
* mecanismos de cache;
* service worker;
* APIs;
* tablas;
* políticas de seguridad.

Esas decisiones deben aparecer después de entender qué capacidades necesita el modelo.

---

# Próximo paso

El siguiente modelo debe describir cómo cambia una partida a lo largo del tiempo.

En particular:

```text
lobby
→ preparar ronda
→ mostrar rol
→ esperar jugadores
→ jugar
→ votar
→ resolver
→ marcador
→ nueva ronda
```

Ese modelo permitirá identificar:

* qué eventos deben sincronizarse;
* quién puede producir cada evento;
* qué ocurre en cada dispositivo;
* dónde necesitamos tiempo real;
* qué errores y reconexiones debemos contemplar.
