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
├── Palabras
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
Group
Player
LocalIdentity
```

Otros conceptos son propios de Impostor:

```text
Word
Room
RoomParticipant
GameSession
SessionPlayer
Round
Vote
RoundResult
GameSessionHistory
RoundHistory
```

No estamos definiendo todavía un modelo conceptual general para todos los juegos.

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
- role
- createdAt
```

## Role

Inicialmente puede ser:

```text
admin
player
```

El rol permanente del grupo no debe confundirse con ser host de una sala ni impostor en una ronda.

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

---

# 4. Palabra

## Qué representa

Una palabra o concepto disponible para utilizar en una ronda.

En este documento, `Word` representa el banco de palabras específico de Impostor.

Ejemplos:

```text
Milanesa
Messi
Chocotorta
Bariloche
```

## Información mínima

```text
Word
- id
- groupId
- text
- authorPlayerId
- source
- createdAt
```

## Source

Permite distinguir inicialmente entre:

```text
preloaded
player
```

## Persistencia

Persistente.

## Visibilidad

Parcialmente privada.

### Jugador normal

Puede conocer:

* las palabras que él mismo agregó;
* cantidad total disponible.

### Administrador

Puede consultar todas las palabras.

### Durante una ronda

La palabra seleccionada solamente debe llegar a los jugadores que no son impostores.

## Disponibilidad durante una tanda

Una ronda solamente puede crearse si existe al menos una palabra del banco que:

* esté disponible;
* no haya sido utilizada durante la tanda actual.

Si no existe ninguna palabra disponible, la sesión no puede avanzar a una nueva ronda hasta que se agreguen palabras o se termine la tanda.

---

# 5. Sala

## Qué representa

Una sesión temporal donde un subconjunto del grupo se reúne para jugar.

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
- hostPlayerId
- status
- createdAt
```

## Status

Conceptualmente puede tener estados como:

```text
lobby
playing
finished
```

La definición completa aparecerá posteriormente en el modelo de estados.

## Persistencia

Temporal.

Puede desaparecer después de finalizar la tanda.

## Visibilidad

Compartida entre los participantes de la sala.

---

# 6. Participación en sala

## Qué representa

La relación entre un jugador y una sala concreta.

No conviene modelar simplemente:

```text
Room.players = [...]
```

porque en el futuro podemos necesitar información sobre esa participación.

## Información conceptual

```text
RoomParticipant
- roomId
- playerId
- joinedAt
- connectionStatus
```

## ConnectionStatus

Podría distinguir:

```text
connected
disconnected
```

No necesitamos definir todavía toda la lógica de reconexión.

## Sucesión del host

Para el MVP, `joinedAt` puede utilizarse para seleccionar de forma determinística al participante conectado más antiguo cuando sea necesario reasignar el host.

No define todavía un algoritmo técnico de presencia o reconexión.

## Persistencia

Temporal.

---

# 7. Tanda

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

## Información mínima

```text
GameSession
- id
- roomId
- status
- startedAt
- finishedAt
```

## Persistencia

Operativa y temporal mientras la tanda está activa.

Al finalizar, debe producir un resumen histórico mínimo persistente.

## Responsabilidades

Mantiene:

* participantes de la tanda;
* rondas;
* puntuaciones;
* palabras utilizadas;
* historial necesario para balancear impostores.

El estado operativo puede desaparecer cuando ya no se necesita para coordinar la sala activa.

El resumen histórico de la tanda debe conservarse para estadísticas futuras.

---

# 8. Participante de la tanda

## Qué representa

La participación de un jugador en una tanda concreta.

## Información conceptual

```text
SessionPlayer
- sessionId
- playerId
- score
- impostorCount
```

## Score

Puntos acumulados durante la tanda.

## ImpostorCount

Cantidad de veces que ese jugador fue impostor.

Este dato permite aplicar la selección balanceada definida por las reglas.

## Persistencia

Temporal.

---

# 9. Ronda

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
- wordId
- impostorPlayerId
- status
- winner
- createdAt
- finishedAt
```

## Winner

Conceptualmente:

```text
impostor
group
```

## Persistencia

Operativa y temporal durante la tanda.

Al finalizar la tanda, solamente debe conservarse un resumen histórico mínimo de cada ronda.

---

# 10. Información privada de la ronda

## Problema

La ronda contiene:

```text
wordId
impostorPlayerId
```

pero esa información no debe entregarse completa a todos los dispositivos.

El servidor conoce el estado completo.

Cada jugador recibe una vista limitada.

## Jugador normal

```text
RoundAssignment
- role: player
- word: "Milanesa"
```

## Impostor

```text
RoundAssignment
- role: impostor
```

No recibe la palabra.

## Principio

Una vista privada de datos no es lo mismo que ocultar datos en la interfaz.

La arquitectura debe impedir que información secreta innecesaria llegue al dispositivo.

---

# 11. Voto

## Qué representa

La elección privada de un jugador durante una votación.

## Información mínima

```text
Vote
- roundId
- voterPlayerId
- targetPlayerId
- votingRound
- createdAt
```

## VotingRound

Inicialmente:

```text
1
2
```

La segunda corresponde a una eventual votación por empate.

## Restricciones

Un jugador:

* solamente puede votar una vez por etapa;
* no puede votarse a sí mismo.

## Persistencia

Temporal.

## Visibilidad

Privada mientras se vota.

Los resultados agregados se revelan solamente cuando corresponde.

---

# 12. Resultado de ronda

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

# 13. Marcador

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

# 14. Permisos conceptuales

No necesitamos inicialmente una entidad compleja de permisos.

Las operaciones protegidas deberán distinguir al menos estas capacidades:

* administrador;
* host;
* participante;
* autor de palabra.

Estas capacidades se derivan del estado compartido correspondiente.

Ejemplos:

* el administrador del grupo puede consultar y administrar el banco completo;
* el host de la sala puede avanzar etapas de la tanda;
* el participante de la sala puede recibir su información privada y votar;
* el autor de una palabra puede consultar sus propias palabras.

La identidad local ayuda a recordar al jugador en el dispositivo, pero no reemplaza estas comprobaciones conceptuales.

---

# 15. Historial persistente

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
  1 ──────── N Word

Group
  1 ──────── N Room

Room
  1 ──────── N RoomParticipant

Room
  1 ──────── 1 GameSession

GameSession
  1 ──────── N SessionPlayer

GameSession
  1 ──────── N Round

Round
  N ──────── 1 Word

Round
  N ──────── 1 Player
              ↑
           impostor

Round
  1 ──────── N Vote

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
Word
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
Vote
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

Los jugadores normales no consultan el banco completo.

El administrador sí.

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
