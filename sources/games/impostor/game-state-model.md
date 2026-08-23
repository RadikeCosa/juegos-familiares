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
PLAYING
VOTING
```

Todos los participantes pertenecen al mismo estado global.

## Estado individual

Describe el progreso particular de cada participante dentro de ese estado.

Ejemplo:

```text
Estado global:
ROLE_REVEAL

Ramiro
roleAcknowledged = true

Pedro
roleAcknowledged = true

Camila
roleAcknowledged = false

Victoria
roleAcknowledged = true
```

La partida continúa globalmente en `ROLE_REVEAL` hasta que se cumpla la condición necesaria para avanzar.

---

# Estados globales

La primera versión utiliza los siguientes estados conceptuales:

```text
LOBBY
PREPARING_ROUND
ROLE_REVEAL
PLAYING
VOTING_FIRST
TIE_DISCUSSION
VOTING_SECOND
IMPOSTOR_GUESS
ROUND_RESULT
SCOREBOARD
FINISHED
```

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
  │ todos confirmaron
  ▼
PLAYING
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

La pertenencia persistida no equivale a conexión. Presence y estado online/offline pertenecen al Incremento 5.

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
* si es host, cierra la Room en Incremento 4;
* no provoca sucesión automática.

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

Evento futuro, fuera de Incremento 4:

`START_SESSION`

Actor autorizado:

`host`

## Guards futuros de START_SESSION

Estos guards pertenecen al incremento que introduzca `GameSession`. No bloquean la formación ni la lectura del lobby en Incremento 4.

Para iniciar:

```text
connectedPlayers >= 3
AND
availableWords >= 1
```

Si alguna condición no se cumple, la transición no ocurre.

## Transición

```text
LOBBY
→ PREPARING_ROUND
```

---

# 2. PREPARING_ROUND

## Qué representa

El sistema está construyendo una nueva ronda.

Es principalmente un estado de coordinación interna.

## Actor

`system`

## Operaciones

El sistema debe:

1. determinar jugadores activos;
2. comprobar que existe una palabra disponible;
3. seleccionar una palabra no utilizada en la tanda;
4. seleccionar un impostor usando la regla de balance;
5. crear la ronda;
6. preparar la información privada de cada participante;
7. actualizar el historial necesario para balancear futuras selecciones.

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

Cada participante posee:

```text
roleAcknowledged
```

Inicialmente:

```text
false
```

Después de ver su información selecciona:

`Estoy listo`

Evento:

`ACKNOWLEDGE_ROLE`

Actor:

`participante`

Resultado:

```text
roleAcknowledged = true
```

## Guard de transición

La partida solamente avanza cuando:

```text
todos los participantes activos
tienen roleAcknowledged = true
```

## Transición

```text
ROLE_REVEAL
→ PLAYING
```

Actor:

`system`

---

# 4. PLAYING

## Qué representa

La conversación presencial está ocurriendo.

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

`host`

## Transición

```text
PLAYING
→ VOTING_FIRST
```

---

# 5. VOTING_FIRST

## Qué representa

Primera votación secreta de la ronda.

## Estado individual

Cada participante tiene:

```text
voteSubmitted = false
```

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

## Guards

El voto debe cumplir:

```text
voter participa en la ronda
AND
target participa en la ronda
AND
voter != target
AND
el jugador todavía no votó en esta etapa
```

## Después de cada voto

El sistema evalúa:

```text
¿votaron todos los participantes activos?
```

### No

Permanece:

```text
VOTING_FIRST
```

### Sí

El sistema cuenta votos.

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

## Acción

Evento:

`START_SECOND_VOTING`

Actor autorizado:

`host`

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

## Guards

Además de las restricciones normales:

```text
targetPlayerId pertenece al conjunto de empatados
```

Un participante tampoco puede votarse a sí mismo.

## Cuando todos votaron

El sistema cuenta los votos.

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

Estado futuro, fuera de Incremento 4.

En Incremento 4, `RoomParticipant` representa membresía de la Room, no presencia ni conexión actual. Más adelante, la conexión podrá modelarse conceptualmente como:

```text
connectionStatus =
connected
disconnected
```

## Rol visto

Durante `ROLE_REVEAL`:

```text
roleAcknowledged =
true
false
```

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
PLAYING

Pedro.connectionStatus:
connected → disconnected
```

La partida puede continuar en:

```text
PLAYING
```

La política completa para decidir cuánto esperar a un jugador desconectado queda fuera del MVP conceptual inicial.

---

# Desconexión del host

Si el host deja de estar disponible:

1. el sistema identifica participantes conectados restantes;
2. los ordena según `joinedAt`;
3. asigna como host al participante conectado más antiguo.

Evento conceptual:

`REASSIGN_HOST`

Actor:

`system`

Esto no modifica necesariamente el estado global de la partida.

Ejemplo:

```text
PLAYING
host = Pedro

Pedro se desconecta

PLAYING
host = Camila
```

Si Pedro vuelve posteriormente:

```text
Pedro = participant
Camila = host
```

El host anterior no recupera automáticamente el rol.

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
ACKNOWLEDGE_ROLE
SUBMIT_VOTE
```

y participar de la sala.

## Sistema

Produce o resuelve:

```text
ROUND_PREPARED
ALL_ROLES_ACKNOWLEDGED
VOTE_TALLY
ROUND_RESOLUTION
SCORE_UPDATE
REASSIGN_HOST
```

---

# Guards principales

## Iniciar tanda

```text
connectedPlayers >= 3
AND
availableWords >= 1
```

## Crear ronda

```text
availableUnusedWords >= 1
```

## Empezar conversación

```text
allActivePlayers.roleAcknowledged = true
```

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
crear asignaciones privadas
actualizar impostorCount
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
word = "Milanesa"
impostor = Camila
status = ROLE_REVEAL
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
* confirmación de roles;
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
PLAYING
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
