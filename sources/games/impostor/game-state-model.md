# Impostor — Modelo de estados de la partida

## Propósito

Este documento describe cómo cambia una partida de Impostor a lo largo del tiempo.

Complementa al modelo conceptual de datos:

* el modelo conceptual describe **qué información existe**;
* este modelo describe **en qué estado puede encontrarse la partida, qué eventos pueden ocurrir y quién puede provocarlos**.

Todavía no define:

* tecnología realtime;
* APIs;
* base de datos;
* proveedor de infraestructura;
* protocolo de comunicación;
* implementación concreta de presencia o reconexión.

---

# Principio general

La sala y la tanda tienen un estado compartido que debe ser consistente para todos los participantes.

Conceptualmente:

```text
Ramiro ───┐
Pedro ────┤
Camila ───┼── estado compartido de la partida
Victoria ─┘
```

Los teléfonos no deben decidir independientemente en qué etapa está la partida.

Existe una única progresión autoritativa de estados.

---

# Estado global e individual

Debemos distinguir dos tipos de estado.

## Estado global

Describe qué está ocurriendo en la partida.

Ejemplos:

```text
LOBBY
ROLE_REVEAL
DISCUSSION
VOTING
```

Todos los participantes pertenecen al mismo estado global.

## Estado individual

Describe el progreso particular de cada participante dentro de ese estado.

En Incremento 6, la revelación visual del rol usa un tap local y no persiste estado individual.

En el contrato vigente del Incremento 7, el MVP no persiste:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

La coordinación de que todos vieron su rol ocurre presencialmente. El host actual avanza la fase cuando el grupo está listo.

---

# Estados globales previstos

El modelo completo previsto para el MVP utiliza los siguientes estados conceptuales:

```text
LOBBY
PREPARING_ROUND
ROLE_REVEAL
DISCUSSION
VOTING_FIRST
TIE_DISCUSSION
VOTING_SECOND
IMPOSTOR_GUESS
ROUND_RESULT
SCOREBOARD
FINISHED
```

Al cierre técnico de Incremento 7, los estados durables de `GameSession` implementados son:

```text
role_reveal
discussion
```

El contrato documental de Incremento 8 agrega como siguiente estado durable planificado:

```text
voting_first
```

La resolución de esa primera votación puede llevar a:

```text
tie_discussion
impostor_guess
round_result
```

`PREPARING_ROUND` existe solo como preparación transaccional interna de `start_session()`. No se introduce `Round.status`: la fase global de gameplay pertenece a `GameSession.state`. Segunda votación, intento final, reveal de palabra, scoring, marcador y fin de tanda pertenecen a incrementos posteriores.

---

# Vista general

```text
LOBBY
  │
  │ START_SESSION
  ▼
PREPARING_ROUND
  │
  │ ROUND_PREPARED
  ▼
ROLE_REVEAL
  │
  │ START_ROUND_DISCUSSION
  ▼
DISCUSSION
  │
  │ START_VOTING
  ▼
VOTING_FIRST
  │
  ├── empate
  │      ▼
  │ TIE_DISCUSSION
  │      │
  │      │ START_SECOND_VOTING
  │      ▼
  │ VOTING_SECOND
  │
  ├── impostor identificado
  │      ▼
  │ IMPOSTOR_GUESS
  │
  └── otro jugador acusado
         ▼
     ROUND_RESULT

IMPOSTOR_GUESS
       │
       │ resultado del intento
       ▼
   ROUND_RESULT
       │
       ▼
    SCOREBOARD
       │
       ├── NEW_ROUND
       │       ▼
       │ PREPARING_ROUND
       │
       └── END_SESSION
               ▼
            FINISHED
```

---

# 1. LOBBY

## Qué representa

La sala existe y los jugadores pueden entrar antes de comenzar la tanda.

## Información relevante para Incremento 4

* Room en estado `lobby`;
* participantes persistidos;
* host;
* cantidad de jugadores;
* código/enlace de Room.

La pertenencia persistida no equivale a conexión. Presence básica de lobby quedó cerrada en 5.1, liveness autoritativo quedó cerrado en 5.2 y sucesión autoritativa de host quedó cerrada en 5.3. Recuperación avanzada queda fuera de Incremento 5.

## Acciones posibles

### Entrar a la sala

Actor:

`participante`

Efecto:

* crea o activa su `RoomParticipant`;
* queda visible para los demás.

### Salir de la sala

Actor:

`participante`

Efecto:

* elimina su pertenencia actual si no es host;
* si es host y usa la acción explícita de abandono/cierre vigente, cierra la Room;
* no se confunde con sucesión por desconexión/staleness.

### Cerrar lobby

Actor autorizado:

`host`

Efecto:

```text
lobby → closed
```

Una Room cerrada deja de considerarse activa y no admite nuevos joins.

## Transiciones implementadas de Room

```text
create_room()
→ lobby

close_room() por host
→ closed

leave_room() por host
→ closed

leave_room() por no-host
→ lobby
```

El leave de un participante no-host elimina su pertenencia a la Room, pero no cambia el estado global de la Room ni el host.

### Iniciar tanda

Evento de producto implementado desde Incremento 6.3:

`START_SESSION`

Actor autorizado:

`rooms.host_player_id` actual

## Guards de START_SESSION

Estos guards no bloquean la formación ni la lectura del lobby en Incremento 4.

Para iniciar:

```text
caller tiene identidad válida
caller resuelve Player válido
caller pertenece a Room activa
Room está en lobby
caller es host actual
no existe otra GameSession para esa Room
connected/active participants >= 3
available words >= 1
```

La actividad autoritativa para el snapshot se deriva del mecanismo vigente de liveness. Presence puede ayudar a UX, pero no decide por sí sola el roster.

Si alguna condición no se cumple, la transición no ocurre.

## Transición

```text
LOBBY
→ preparación transaccional
→ ROLE_REVEAL
```

Como efecto de la misma operación, la Room pasa de `lobby` a `playing` y deja de aceptar nuevos joins.

---

# 2. PREPARING_ROUND

## Qué representa

El sistema está construyendo una nueva ronda.

Es principalmente un estado de coordinación interna.

En el inicio de la primera ronda, `PREPARING_ROUND` no necesita ser un estado durable observable. `START_SESSION` puede realizar la preparación atómicamente y dejar la `GameSession` directamente en `ROLE_REVEAL`.

## Actor

`system`

## Operaciones

El sistema debe:

1. determinar participantes activos de la Room mediante liveness autoritativo;
2. comprobar que existe una palabra disponible;
3. seleccionar una palabra no utilizada en la tanda;
4. seleccionar un impostor usando la regla de balance;
5. crear la GameSession si corresponde;
6. crear el snapshot de SessionPlayers;
7. crear la ronda con snapshot de palabra e impostor;
8. dejar disponible una vista privada derivable para cada participante.

## Guard

```text
availableUnusedWords >= 1
```

## Si no existe palabra

No se crea una ronda.

La sesión debe volver o permanecer en una situación desde la cual el host pueda:

* permitir que se agreguen palabras;
* terminar la tanda.

No se reutilizan automáticamente palabras ya utilizadas.

## Transición normal

Cuando la ronda fue preparada correctamente:

```text
PREPARING_ROUND
→ ROLE_REVEAL
```

Evento conceptual:

`ROUND_PREPARED`

Actor:

`system`

---

# 3. ROLE_REVEAL

## Qué representa

Cada participante consulta la información privada correspondiente a esa ronda.

## Vista individual

### Jugador normal

Recibe:

```text
role = player
word = palabra secreta
```

### Impostor

Recibe:

```text
role = impostor
```

No recibe la palabra secreta.

## Estado individual

Incremento 6 no persiste estado individual de confirmación de rol.

La UI implementada usa una interacción local:

```text
Tu rol está listo
→ Ver mi rol
```

Esto no cambia `GameSession`, no escribe `SessionPlayer` y se reinicia visualmente al refrescar porque la vista privada vuelve a reconstruirse desde servidor.

En Incremento 7 se descarta para el MVP persistir:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

La decisión de producto es no digitalizar el `ready` verbal del grupo. Impostor es presencial y la coordinación:

```text
¿Estamos todos?
```

ocurre entre las personas.

## Acción de transición

Evento:

`START_ROUND_DISCUSSION`

Actor:

`host actual`

Resultado:

```text
GameSession.state = discussion
```

## Guard de transición

En Incremento 7, la partida avanza cuando el host actual decide que el grupo está listo:

```text
Room.status = playing
GameSession.state = role_reveal
caller = current rooms.host_player_id
caller ∈ SessionPlayers
Round actual coherente
```

## Transición

```text
ROLE_REVEAL
→ DISCUSSION
```

---

# 4. DISCUSSION

## Qué representa

La conversación presencial está ocurriendo.

Al cierre técnico del Incremento 7, `discussion` es un estado durable implementado de `GameSession.state`.

Durante `discussion`, la vista privada no aparece por defecto en el DOM. Cada jugador puede pedir explícitamente:

```text
Ver mi palabra
```

o:

```text
Ver mi rol
```

Luego puede ocultarla con:

```text
Ocultar
```

Ese reveal/hide es local y no se persiste. Al entrar desde `role_reveal` a `discussion`, la vista privada vuelve a ocultarse. Si el polling reconstruye la misma ronda y el mismo payload mientras el componente sigue montado, se preserva el reveal local para evitar flicker. Si cambia la ronda o se reconstruye desde bootstrap, vuelve a ocultarse.

Primero los jugadores realizan la vuelta inicial de pistas y después pueden conversar libremente.

## Intervención de la aplicación

Mínima.

La aplicación no controla:

* quién habla;
* orden de pistas;
* cantidad de intervenciones;
* duración.

## Acción principal

Evento:

`START_VOTING`

Actor autorizado:

`host actual`

RPC prevista:

```text
start_round_voting()
```

La operación no recibe parámetros y valida la autoridad contra `rooms.host_player_id` actual, no contra el administrador del Group, el creador original ni un host histórico. Debe ser idempotente frente a retry o respuesta perdida cuando la fase ya quedó en `voting_first`.

## Transición

```text
DISCUSSION
→ VOTING_FIRST
```

---

# 5. VOTING_FIRST

## Qué representa

Primera votación secreta de la ronda.

## Estado individual

Cada `SessionPlayer` tiene:

```text
voteSubmitted = false
```

Ese estado deriva de la existencia de su voto para la Round y etapa actual. No se basa en Presence, liveness ni conexión.

## Evento

`SUBMIT_VOTE`

Actor:

`participante`

Datos conceptuales:

```text
voterPlayerId
targetPlayerId
votingRound = 1
```

RPC prevista:

```text
submit_round_vote(target_player_id uuid)
```

El `target_player_id` es una elección de dominio enviada por el usuario, no una autoridad confiada al cliente. El servidor deriva caller, Player, GameSession, Round actual y voter desde `auth.uid()` y valida el target contra el roster congelado.

## Guards

El voto debe cumplir:

```text
voter ∈ SessionPlayers de la GameSession
AND
target ∈ SessionPlayers de la GameSession
AND
voter != target
AND
el jugador todavía no votó en esta etapa
AND
GameSession.state = voting_first
```

El impostor también vota. El host también vota y no tiene voto especial.

Cada voto pertenece a una Round y a una etapa de votación. La identidad lógica es:

```text
roundId
votingRound
voterPlayerId
```

El voto es secreto, inmutable y no se puede cambiar una vez registrado. Un retry del mismo voto por respuesta perdida puede ser éxito idempotente o recuperarse mediante el read model; un intento posterior de votar por otro target debe rechazarse.

## Después de cada voto

El sistema evalúa:

```text
¿votaron todos los SessionPlayers?
```

Membership y availability son conceptos distintos. Presence/liveness no determinan el denominador de la votación.

Un `SessionPlayer` desconectado:

* sigue perteneciendo a la tanda;
* sigue siendo candidato;
* puede votar si vuelve;
* conserva su voto si ya votó.

Si todavía no votó y no vuelve, la primera versión puede quedar esperando. Timeouts, override del host, expulsión de `SessionPlayer` y votación solo con conectados son políticas pendientes de hardening, no parte de Incremento 8.

### No

Permanece:

```text
VOTING_FIRST
```

### Sí

El sistema cuenta votos dentro de la misma operación lógica del último voto. No debe existir como estado estable que todos hayan votado y `GameSession.state` siga en `voting_first` esperando otra RPC manual.

Durante la votación no se muestran resultados parciales, votos individuales ajenos, quién votó a quién, `impostorPlayerId` ni la palabra secreta si el caller es impostor. El host no recibe privilegios informativos adicionales.

---

# Resolución de primera votación

Existen tres posibilidades.

## A. Existe empate en la mayor cantidad de votos

Transición:

```text
VOTING_FIRST
→ TIE_DISCUSSION
```

El sistema conserva la lista de jugadores empatados.

Incremento 8 detecta este empate, muestra el resultado agregado y deja la GameSession en `tie_discussion`. No inicia todavía la segunda votación.

---

## B. El impostor es el único jugador más votado

Transición:

```text
VOTING_FIRST
→ IMPOSTOR_GUESS
```

El impostor fue descubierto.

La palabra todavía no debe revelarse.

---

## C. Otro jugador es el único más votado

El grupo no descubrió al impostor.

Resultado:

```text
winner = impostor
```

Transición:

```text
VOTING_FIRST
→ ROUND_RESULT
```

Incremento 8 no aplica todavía puntos, scoreboard, historial final, nueva ronda ni fin de tanda.

---

# 6. TIE_DISCUSSION

## Qué representa

La primera votación terminó empatada.

La aplicación informa:

* quiénes quedaron empatados;
* que habrá una segunda votación.

El grupo puede discutir nuevamente presencialmente.

## Candidatos siguientes

Solamente los jugadores empatados pueden recibir votos en la segunda votación.

El conjunto de empatados no se guarda como entidad separada. Se reconstruye autoritativamente desde los votos de primera votación de la ronda actual:

```text
round_votes
WHERE round_id = ronda actual
AND voting_round = 1
```

Los candidatos son quienes comparten la cantidad máxima de votos. Como `tie_discussion` solamente existe después de una primera votación completa, esa tabla ya contiene la información necesaria.

## Acción

Evento:

`START_SECOND_VOTING`

Actor autorizado:

`host`

RPC prevista:

```text
start_second_round_voting()
```

La operación no recibe parámetros de ownership, deriva identidad y autoridad desde `auth.uid()`, valida el host actual persistido en `rooms.host_player_id`, no crea votos, no persiste candidatos de empate y no revela secretos.

Debe ser idempotente frente a retry si la GameSession ya está en `voting_second`.

## Transición

```text
TIE_DISCUSSION
→ VOTING_SECOND
```

---

# 7. VOTING_SECOND

## Qué representa

Segunda y última votación de la ronda.

## Evento

`SUBMIT_VOTE`

Actor:

`participante`

Datos:

```text
votingRound = 2
```

RPC:

```text
submit_round_vote(target_player_id)
```

Durante `voting_second`, esta RPC registra el voto como `voting_round = 2`. La misma RPC sigue usando `voting_round = 1` durante `voting_first`.

## Guards

Además de las restricciones normales:

```text
targetPlayerId pertenece al conjunto de empatados
```

Un participante tampoco puede votarse a sí mismo.

Todos los `SessionPlayers` votan en segunda votación. No se usa Presence, liveness ni conexión actual como denominador. El impostor vota, el host vota sin voto especial y los jugadores empatados también votan.

## Cuando todos votaron

El sistema cuenta los votos.

No muestra resultados parciales ni votos individuales ajenos.

---

# Resolución de segunda votación

La regla es determinística.

## El impostor es el único jugador más votado

El grupo identifica correctamente al impostor.

Transición:

```text
VOTING_SECOND
→ IMPOSTOR_GUESS
```

## Cualquier otro resultado

Incluye:

* nuevo empate;
* otro jugador como único más votado;
* cualquier resultado donde el impostor no sea el único más votado.

Resultado:

```text
winner = impostor
```

Transición:

```text
VOTING_SECOND
→ ROUND_RESULT
```

No existe una tercera votación.

## Read model

`get_my_game_state()` durante `tie_discussion` debe exponer:

* resultado agregado completo de la primera votación;
* `candidates` como jugadores empatados en el máximo de la primera votación;
* información suficiente para que la UI determine si el caller puede iniciar la segunda votación;
* ningún secreto adicional.

Durante `voting_second` debe exponer:

* `candidates` como candidatos empatados autorizados para recibir votos;
* si el caller forma parte del empate, su propio Player queda excluido de sus opciones votables;
* `has_voted`;
* `my_vote_target_player_id` solamente para el voto propio de `voting_round = 2`;
* ningún resultado parcial.

Después de la resolución, `vote_results` representa la votación que produjo el estado vigente:

* resolución en primera votación → resultados de `voting_round = 1`;
* resolución después de segunda votación → resultados de `voting_round = 2`.

---

# 8. IMPOSTOR_GUESS

## Qué representa

El impostor fue correctamente identificado y tiene su última oportunidad de ganar.

## Visibilidad

El sistema puede revelar:

```text
impostorPlayerId
```

La palabra todavía permanece privada.

## Interacción presencial

El impostor dice en voz alta cuál cree que era la palabra.

## Acción

El host selecciona:

`Comprobar palabra`

Evento conceptual:

`REVEAL_WORD`

Actor autorizado:

`host`

Después de este evento todos pueden ver la palabra secreta.

El host registra:

* acertó;
* no acertó.

Evento:

`REGISTER_GUESS_RESULT`

Actor autorizado:

`host`

## Resultado

### Acertó

```text
winner = impostor
```

### Falló

```text
winner = group
```

## Transición

```text
IMPOSTOR_GUESS
→ ROUND_RESULT
```

---

# 9. ROUND_RESULT

## Qué representa

La ronda ya tiene un resultado definitivo.

El sistema conoce:

* jugador acusado;
* impostor real;
* si fue descubierto;
* si adivinó la palabra;
* ganador.

## Side effects

El sistema actualiza la puntuación.

### Victoria del impostor

```text
impostor.score += 2
```

### Victoria del grupo

Para cada jugador normal:

```text
score += 1
```

## Transición

Después de calcular el resultado y actualizar el marcador:

```text
ROUND_RESULT
→ SCOREBOARD
```

Actor:

`system`

La UI puede mostrar el resultado antes de presentar el marcador sin requerir que esto constituya una nueva decisión de dominio.

---

# 10. SCOREBOARD

## Qué representa

La ronda terminó y se muestra la situación acumulada de la tanda.

## Información compartida

* resultado de la última ronda;
* puntuación de cada participante;
* cantidad de rondas;
* palabras restantes disponibles.

## Acciones del host

### Nueva ronda

Evento:

`NEW_ROUND`

Actor:

`host`

Guard:

```text
availableUnusedWords >= 1
```

Transición:

```text
SCOREBOARD
→ PREPARING_ROUND
```

### Si no quedan palabras

`NEW_ROUND` no está disponible.

La interfaz debe permitir:

* agregar palabras;
* terminar la tanda.

Si se agregan nuevas palabras válidas al banco, `NEW_ROUND` vuelve a estar disponible.

### Terminar tanda

Evento:

`END_SESSION`

Actor:

`host`

Transición:

```text
SCOREBOARD
→ FINISHED
```

---

# 11. FINISHED

## Qué representa

La tanda terminó.

## Información disponible

* clasificación final;
* ganador;
* puntos;
* cantidad de rondas.

## Side effects

Al entrar en `FINISHED`, el sistema debe preservar el resumen histórico mínimo necesario de la tanda y sus rondas.

Este side effect no agrega estados nuevos a la máquina.

## Historial persistente

El historial de tanda conserva conceptualmente:

* identificador;
* grupo;
* fecha/hora de inicio;
* fecha/hora de finalización;
* participantes;
* cantidad de rondas;
* puntuación final.

El historial de ronda conserva conceptualmente:

* tanda;
* número de ronda;
* impostor;
* ganador (`group` o `impostor`);
* si el impostor fue descubierto;
* si el impostor adivinó la palabra.

No hace falta conservar votos individuales históricos salvo que aparezca una razón concreta.

El grupo y su banco de palabras continúan existiendo.

---

# Estados individuales relevantes

No todo necesita convertirse en un estado global.

## Conexión

Estado fuera de Incremento 4 y cerrado en Incremento 5.1 para lobby.

En Incremento 4, `RoomParticipant` representa membresía de la Room, no presencia ni conexión actual.

En Incremento 5.1, la conexión visual del lobby se modela con Presence efímera:

```text
presence =
connected
disconnected
```

Esta Presence está acotada a la Room activa y representa disponibilidad actual. Varias conexiones del mismo Player, por ejemplo dos pestañas, cuentan como un único Player lógico.

Presence no reemplaza `RoomParticipant`, no decide `host_player_id` y no equivale a abandono.

Incremento 5.2 agregó liveness autoritativo mínimo:

```text
room_participants.last_seen_at
= evidencia verificable de actividad reciente
```

`last_seen_at` no representa Presence, conexión, abandono, host, ready ni estado de juego. Se actualiza por autoridad backend para el RoomParticipant propio y con reloj server-side/Postgres.

## Reveal visual de rol

Durante `ROLE_REVEAL`, el reveal visual es local:

```text
Tu rol está listo
→ Ver mi rol
```

No se persiste `roleAcknowledged`, `role_acknowledged_at` ni `allRolesSeen` en el contrato vigente del MVP. Refrescar puede volver a ocultar visualmente la información, pero `get_my_game_state()` reconstruye la vista privada.

## Voto

Durante cada etapa de votación:

```text
voteSubmitted =
true
false
```

Estos estados individuales participan en guards de la máquina global.

---

# Desconexión de participante

Una desconexión no cambia automáticamente el estado global de la partida.

Ejemplo:

```text
DISCUSSION

Pedro.presence:
connected → disconnected
```

La partida puede continuar en:

```text
DISCUSSION
```

En el lobby de Incremento 5, una ausencia breve no elimina `RoomParticipant` ni dispara por sí sola sucesión de host. Presence es una señal efímera para UI y para detectar candidatos, no una decisión autoritativa.

La política avanzada de recuperación de jugadores durante una tanda queda fuera de Incremento 6 y pertenece a reconexión posterior.

---

# Desconexión del host

Incremento 5.3 cerró la reasignación autoritativa cuando el host está stale. En 5.1 y 5.2, un host desconectado conservaba `rooms.host_player_id`; desde 5.3, la desconexión sigue sin bastar por sí sola y la autoridad debe validar liveness.

Si el host deja de estar disponible:

1. se observa una ausencia candidata mediante Presence;
2. la autoridad valida staleness con `room_participants.last_seen_at` o representación física equivalente;
3. se aplica un threshold inicial de 90 segundos;
4. se identifican participantes disponibles restantes;
5. si la Room está en `playing`, se intersectan con los `SessionPlayers` de la GameSession;
6. se ordenan según `joined_at ASC, player_id ASC`;
7. se asigna como host al primer candidato mediante actualización autoritativa y consistente.

`player_id` es solo desempate técnico determinístico.

Evento conceptual:

`REASSIGN_HOST`

Actor:

`authority`

Un cliente puede intentar disparar la intención de sucesión, pero no decide el nuevo host. La operación está protegida con locking/revalidación para que varios clientes simultáneos converjan en una sola transición efectiva.

Esto no modifica necesariamente el estado global de la partida.

Ejemplo:

```text
DISCUSSION
host = Pedro

Pedro se desconecta

DISCUSSION
host = Camila
```

Si Pedro vuelve posteriormente:

```text
Pedro = participant
Camila = host
```

El host anterior no recupera automáticamente el rol.

Si el host está stale y no hay candidatos active, no hay transición: el host actual permanece persistido y la Room no se cierra automáticamente.

El threshold de 90 segundos reemplaza la hipótesis previa de 60 segundos para la implementación inicial. Busca dar margen frente a heartbeat de 30 segundos, throttling, red y suspensión de timers móviles. No es una regla definitiva del juego ni configuración de usuario.

Presence y liveness pueden discrepar temporalmente sin que sea un bug:

```text
Presence = disconnected
last_seen_at = hace 10 segundos

→ desconectado para UX
→ todavía no stale autoritativamente
```

---

# Acciones y autorización

La identidad local del dispositivo no basta para autorizar estas operaciones.

El estado compartido debe determinar si el actor posee la capacidad necesaria.

## Administrador

Puede realizar acciones administrativas del grupo.

Estas acciones no forman parte directamente de la máquina de estados de una tanda.

## Host

Puede producir:

```text
START_SESSION
START_VOTING
START_SECOND_VOTING
REVEAL_WORD
REGISTER_GUESS_RESULT
NEW_ROUND
END_SESSION
```

## Participante

Puede producir:

```text
SUBMIT_VOTE
```

y participar de la sala.

## Sistema

Produce o resuelve:

```text
ROUND_PREPARED
VOTE_TALLY
ROUND_RESOLUTION
SCORE_UPDATE
REASSIGN_HOST
```

---

# Guards principales

## Iniciar tanda

```text
Room.status = lobby
caller = rooms.host_player_id actual
no existe GameSession para la Room
connected/active participants >= 3
available words >= 1
```

## Crear ronda

```text
availableUnusedWords >= 1
```

## Empezar conversación

```text
Room.status = playing
GameSession.state = role_reveal
caller = rooms.host_player_id actual
caller ∈ SessionPlayers
Round actual coherente
```

Este guard pertenece a la RPC `start_round_discussion()`, cerrada en Incremento 7.

## Resolver votación

```text
allRequiredPlayers.voteSubmitted = true
```

## Nueva ronda

```text
availableUnusedWords >= 1
```

---

# Side effects principales

Las transiciones pueden producir cambios adicionales.

## Crear ronda

```text
seleccionar palabra
seleccionar impostor
crear Round con snapshot de palabra
```

## Votar

```text
guardar voto privado
```

## Resolver votación

```text
contabilizar votos
determinar empate o acusado
```

## Resolver ronda

```text
determinar ganador
actualizar puntuación
marcar palabra como utilizada en la tanda
```

## Reasignar host

```text
actualizar hostPlayerId
```

---

# Propiedades que siempre deben cumplirse

Estas invariantes ayudan a detectar estados imposibles.

## Ronda

Una ronda activa debe tener:

```text
exactamente una palabra
exactamente un impostor
```

## Privacidad

Antes de revelar la palabra:

```text
impostor no recibe palabra
```

## Voto

Un jugador:

```text
no puede votar por sí mismo
no puede votar dos veces en la misma etapa
```

## Segunda votación

Solo puede ocurrir:

```text
si la primera terminó empatada
```

y solamente los empatados pueden recibir votos.

## Marcador

Los puntos solamente cambian cuando una ronda queda resuelta.

## Palabras

Una palabra no puede utilizarse dos veces durante la misma tanda.

---

# Estado compartido vs vista del cliente

El estado autoritativo puede conocer más información que cada dispositivo.

Ejemplo conceptual:

```text
Round
secretWord = "Milanesa"
impostorPlayerId = Camila

GameSession
state = ROLE_REVEAL
```

Pero las vistas individuales son diferentes.

## Ramiro

```text
status = ROLE_REVEAL
role = player
word = "Milanesa"
```

## Camila

```text
status = ROLE_REVEAL
role = impostor
```

Camila no recibe:

```text
word = "Milanesa"
```

Esta separación será un requisito central para la arquitectura técnica.

---

# Qué necesita sincronización rápida

Este modelo permite identificar qué cambios deben reflejarse en los demás teléfonos con poca demora.

Ejemplos:

* entrada de un jugador al lobby;
* salida o desconexión;
* cambio de host;
* inicio de tanda;
* cambio de fase;
* comienzo de votación;
* estado de “esperando votos”;
* finalización de la votación;
* resultado;
* marcador;
* nueva ronda;
* fin de tanda.

No estamos decidiendo todavía cómo se sincronizan.

---

# Qué NO necesita sincronización continua

La conversación presencial no genera estado digital continuo.

La aplicación no necesita conocer:

* qué dijo cada jugador;
* quién está hablando;
* contenido de las pistas;
* duración exacta de cada intervención.

Esto reduce considerablemente las necesidades técnicas del producto.

---

# Casos todavía abiertos

Este modelo deja deliberadamente para la arquitectura técnica o pruebas posteriores:

* cuánto tiempo debe considerarse tolerable una desconexión;
* qué ocurre si un participante desaparece durante una votación;
* qué ocurre si quedan menos de tres jugadores conectados durante una ronda;
* mecanismo concreto de presencia;
* recuperación después de cerrar/reabrir la PWA;
* expiración y limpieza de salas terminadas;
* forma técnica de persistir el historial mínimo de tandas y rondas finalizadas.

Estos casos no impiden diseñar la arquitectura mínima ni comenzar posteriormente con un MVP controlado para el grupo inicial.

---

# Resultado del modelo

La partida puede entenderse como una máquina de estados compartida:

```text
LOBBY
↓
PREPARING_ROUND
↓
ROLE_REVEAL
↓
DISCUSSION
↓
VOTING_FIRST
├── TIE_DISCUSSION → VOTING_SECOND
├── IMPOSTOR_GUESS
└── ROUND_RESULT
        ↑
IMPOSTOR_GUESS
↓
ROUND_RESULT
↓
SCOREBOARD
├── PREPARING_ROUND
└── FINISHED
```

Cada transición tiene:

* un evento;
* un actor autorizado;
* guards;
* posibles side effects.

Este modelo será la base para determinar qué capacidades técnicas necesita realmente la aplicación.
