# Impostor — Estado autoritativo del juego

## Propósito y autoridad

Este contrato describe los estados durables, transiciones, actores, guards y
semántica de visibilidad de Impostor. El cliente envía intenciones; las RPCs y
Postgres derivan al actor desde la identidad autenticada, bloquean el estado
relevante, validan la transición y producen el siguiente estado.

Una pantalla, un evento Realtime o Presence no constituye autoridad. Después de
cualquier incertidumbre el cliente reconstruye una vista autorizada del estado
remoto.

## Capas de estado

### Lifecycle de Room

`Room.status` sólo representa el contenedor temporal:

```text
lobby → playing → closed
```

- `lobby`: admite joins y todavía no tiene una tanda iniciada.
- `playing`: contiene una GameSession y no admite nuevos joins.
- `closed`: no cuenta como Room activa ni se reutiliza.

El host puede cerrar una Room desde `lobby`. Terminar la tanda cierra la Room
desde `playing`.

### Estados durables de GameSession

La máquina persistida contiene exactamente:

```text
role_reveal
→ discussion
→ voting_first
   ├─ empate → tie_discussion → voting_second
   ├─ impostor descubierto ────────────────┐
   └─ acusación incorrecta → round_result  │
                                           ▼
                              impostor_guess
                                           │
                                           ▼
                                    round_result
                                           │
                                           ▼
                                      scoreboard
                                      ├─ role_reveal
                                      └─ finished
```

`PREPARING_ROUND` no es un estado durable. Crear la GameSession, congelar el
roster, seleccionar palabra, impostor y primer jugador, y crear la primera Round
ocurre en una sola operación antes de persistir `role_reveal`. Lo mismo aplica a
la preparación de cada ronda siguiente.

## Entidades que sostienen la máquina

- `RoomParticipant` expresa pertenencia a la Room; no conexión actual.
- `SessionPlayer` congela el roster de la tanda y conserva su score.
- `Round` guarda número, snapshot normalizado de palabra, impostor, primer
  jugador y resultado.
- `RoundVote` registra un voto por participante, ronda y vuelta de votación.
- `GameSessionHistory` y `RoundHistory` conservan el resumen terminal mínimo.

`Group` y `Player` pertenecen a la plataforma. Que Room o GameSession estén
persistidas para coordinación no las convierte en capacidades compartidas.

## Inicio de tanda

Actor: host actual de una Room en `lobby`.

Guards principales:

- identidad autenticada asociada a un Player del Group;
- caller participante y host actual de la Room;
- al menos tres RoomParticipants con liveness activa, incluido el host;
- al menos una palabra válida no usada;
- ausencia de otra GameSession para la Room.

Efectos atómicos:

- congela los participantes activos como SessionPlayers;
- crea GameSession y Round 1;
- selecciona palabra, impostor y primer jugador con las reglas vigentes;
- cambia la Room a `playing`;
- deja la GameSession en `role_reveal`.

Un reintento inmediato sobre la tanda recién creada devuelve el estado existente
en vez de crear duplicados.

## Contrato por estado

### `role_reveal`

Propósito: cada SessionPlayer consulta su vista privada de la ronda.

- Puede actuar: cada participante revela u oculta localmente; sólo el host
  solicita empezar la conversación.
- Transición: `role_reveal → discussion`.
- Guards: Room en `playing`, caller en el roster, host actual y ronda vigente.
- Visibilidad: un jugador normal recibe su palabra; el impostor recibe el rol
  sin palabra. El reveal visual no se persiste y no existe acknowledgement
  durable de roles vistos. `roleAcknowledged` es un non-goal explícito: el grupo
  coordina presencialmente que todos estén listos y evita bloquear la tanda por
  una confirmación distribuida o una desconexión.

### `discussion`

Propósito: primera pista y conversación presencial.

- Puede actuar: el host solicita ir a votación; todos conversan fuera de la app.
- Transición: `discussion → voting_first`.
- Guards: caller en roster, host actual y estado vigente.
- Visibilidad: continúa disponible la vista privada autorizada y se muestra el
  primer jugador; no se expone la identidad del impostor.

### `voting_first`

Propósito: registrar un voto secreto de cada SessionPlayer.

- Puede actuar: todo el roster, incluido host e impostor.
- Guards por voto: candidato y votante pertenecen al roster, no son la misma
  persona y el votante no registró otro target para esa vuelta.
- Mientras faltan votos: permanece en `voting_first`; sólo el caller conoce su
  propio voto registrado, sin resultados parciales.
- Al completar el roster:
  - empate máximo → `tie_discussion`;
  - impostor como único máximo → `impostor_guess`;
  - otro jugador como único máximo → `round_result` con victoria del impostor.

### `tie_discussion`

Propósito: mostrar el empate agregado y permitir una nueva conversación.

- Puede actuar: el host solicita la segunda votación.
- Transición: `tie_discussion → voting_second`.
- Guards: caller en roster, host actual y estado vigente.
- Visibilidad: todos ven resultados agregados de la primera vuelta y los
  candidatos empatados; no se revela quién emitió cada voto.

### `voting_second`

Propósito: registrar el último desempate.

- Puede actuar: todo el roster.
- Guards: los de la primera votación, más target limitado al conjunto empatado
  derivado de los votos de la primera vuelta.
- Mientras faltan votos: sólo el caller conoce su voto; no hay conteos parciales.
- Al completar el roster:
  - impostor como único máximo → `impostor_guess`;
  - cualquier otro resultado → `round_result` con victoria del impostor.

No existe transición a una tercera votación.

### `impostor_guess`

Propósito: permitir el único intento final del impostor descubierto.

- Puede actuar: exclusivamente el impostor de la Round.
- Transición: `impostor_guess → round_result`.
- Guards: caller en roster y asignado como impostor, estado vigente e intento
  todavía ausente.
- Visibilidad: todos conocen al impostor y los resultados agregados; nadie
  recibe la palabra antes de resolver. Sólo el impostor recibe permiso de submit.
- Resolución: el servidor normaliza y compara el intento; acierto produce
  victoria del impostor y fallo produce victoria del grupo.

### `round_result`

Propósito: exponer el resultado final y aplicar scoring exactamente una vez.

- Puede actuar: un SessionPlayer puede solicitar el avance idempotente.
- Transición: `round_result → scoreboard`.
- Guards: ganador final válido y ronda aún no puntuada, o scoring ya aplicado en
  un reintento.
- Visibilidad: ganador, impostor, palabra, resultados agregados e intento final
  cuando existió pasan a la vista compartida.
- Efecto: suma 2 al impostor ganador o 1 a cada jugador normal cuando gana el
  grupo, marca la ronda como puntuada y cambia de fase en la misma operación.

### `scoreboard`

Propósito: mostrar scores acumulados y elegir continuidad o cierre.

- Puede actuar: todos leen; sólo el host actual inicia otra ronda o termina.
- `scoreboard → role_reveal`: requiere ronda puntuada y una palabra no usada;
  crea la Round siguiente sin cambiar el roster ni la GameSession.
- `scoreboard → finished`: requiere ronda puntuada; calcula el resultado final,
  persiste historial y cierra la Room.
- Visibilidad: scores, impostor y resultado de la ronda son compartidos. El read
  model deriva permisos y motivo de bloqueo para la ronda siguiente.

### `finished`

Propósito: estado terminal y reconstruible de la tanda.

- Transiciones: ninguna.
- Visibilidad: todos los participantes históricos reciben fecha de cierre,
  cantidad de rondas, clasificación, ganadores y resúmenes mínimos de ronda.
- Invariantes: Room en `closed`, acciones de nueva ronda y cierre deshabilitadas,
  un único historial de tanda y un resumen único por ronda.

El resultado puede reconstruirse aunque ya no exista una Room activa para el
Player.

## Visibilidad pública y privada

El estado compartido puede incluir Room, host, roster, fase, número de ronda,
primer jugador, candidatos permitidos, resultados agregados, marcador y
resultado final cuando corresponde.

Antes de la resolución, la identidad del impostor y la palabra son privadas:

- el jugador normal recibe la palabra de su ronda;
- el impostor nunca la recibe;
- durante `impostor_guess` nadie recibe la palabra;
- desde `round_result`, palabra e impostor ya son resultado compartido;
- cada votante puede reconstruir su voto, pero no votos individuales ajenos.

La UI puede mostrar menos que el read model autorizado, pero nunca debe usar
ocultamiento visual como sustituto de esta separación.

## Guards e invariantes transversales

- Toda acción deriva al actor desde `auth.uid()` y valida Group, Room y roster.
- La Room debe estar `playing` para transiciones de la tanda activa.
- Sólo el host vigente avanza las fases dirigidas por host.
- Presence y liveness no modifican el roster congelado ni reducen el quorum de
  votación.
- Un voto es único por Round, vuelta y votante; no puede cambiar de target tras
  ser aceptado.
- Los candidatos de segunda vuelta se derivan de la primera; no existe una lista
  paralela mutable.
- Una palabra normalizada no se repite en la misma GameSession.
- Scoring, creación de ronda y cierre de tanda son transaccionales e idempotentes
  frente a reintentos previstos.
- La sucesión automática de host usa liveness autoritativa y está acotada al
  lobby; Presence por sí sola nunca cambia `rooms.host_player_id`.
