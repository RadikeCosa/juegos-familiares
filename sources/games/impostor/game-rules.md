# Impostor — Reglas del juego

## Estado de las reglas

Estas son las reglas vigentes de la beta. Fueron validadas mediante juego real
repetido y siguen abiertas a refinamiento cuando aparezcan observaciones
actuales.

## Participantes y tanda

- Se necesitan al menos 3 participantes para iniciar.
- El juego está pensado para grupos pequeños; cuatro jugadores es el caso de
  referencia.
- Cada participante usa su teléfono.
- Al iniciar se congela el roster de `SessionPlayers` de la tanda a partir de
  quienes tienen participación y liveness activa en el lobby.
- Una desconexión posterior no agrega ni quita participantes de ese roster.
- Una tanda contiene una o más rondas, conserva el roster y el marcador, y no
  tiene una cantidad obligatoria de rondas.

## Banco y selección de palabra

El banco persistente pertenece al Group. Sus integrantes pueden aportar
palabras o frases cortas, pero no explorar el banco completo.

En cada ronda la aplicación elige al azar una palabra disponible. La misma
palabra normalizada no se repite dentro de una tanda, aunque su entrada original
haya sido borrada y agregada otra vez. Puede volver a aparecer en otra tanda.

Si no quedan palabras no usadas, no puede iniciarse otra ronda. El grupo puede
agregar palabras al banco o terminar la tanda; las ya usadas no se reciclan
automáticamente.

## Selección de impostor

Hay exactamente un impostor por ronda. La aplicación cuenta cuántas veces tuvo
ese rol cada integrante del roster, prioriza a quienes tengan el menor conteo y
sortea entre ellos. Así conserva azar sin permitir una distribución claramente
desbalanceada.

Los jugadores normales reciben la palabra secreta. El impostor recibe sólo su
rol y nunca la palabra.

## Quién empieza

La aplicación elige quién da la primera pista:

1. prioriza a quienes hayan empezado menos rondas en la tanda;
2. si varias personas empatan en ese mínimo, excluye al impostor cuando existe
   una alternativa igualmente balanceada;
3. sortea entre las alternativas restantes.

El impostor puede empezar si es la única persona con el conteo mínimo; preservar
el balance tiene prioridad. El host no recibe ventaja en esta selección.

Después de la primera pista, el grupo continúa presencialmente —por ejemplo,
hacia la derecha— sin que la aplicación registre los turnos siguientes.

## Pistas y conversación

Cada participante da al menos una pista breve. Los jugadores normales intentan
demostrar que conocen la palabra sin revelarla; el impostor intenta integrarse y
deducirla. Luego puede haber conversación libre, acusaciones y defensas.

No hay timer obligatorio, máximo de intervenciones ni cantidad fija de vueltas.
El grupo decide cuándo está listo y el host inicia la votación.

## Primera votación

- Votan todos los SessionPlayers, incluidos host e impostor.
- Cada participante emite un solo voto secreto.
- No se permite el auto-voto.
- No se muestran votos ajenos ni conteos parciales.
- La resolución ocurre cuando votó todo el roster congelado.

Si existe un único jugador más votado:

- si es el impostor, pasa a su intento final;
- si no es el impostor, gana el impostor y la ronda termina.

Si dos o más jugadores comparten el máximo, se informa el empate y el grupo
vuelve a conversar.

## Segunda votación

El host inicia una segunda votación. Vota otra vez todo el roster, pero sólo los
jugadores empatados en la primera pueden recibir votos. Se mantienen el voto
secreto, la prohibición de auto-voto y la ausencia de resultados parciales.

El grupo descubre al impostor sólo si queda como único jugador más votado. Un
nuevo empate o cualquier otro resultado da la victoria al impostor. No existe
una tercera votación: el desempate único mantiene una resolución simple y evita
prolongar indefinidamente la ronda.

## Intento final

Cuando el impostor es descubierto, se revela su identidad pero la palabra sigue
oculta. Sólo ese participante puede enviar un único intento para adivinarla.

La comparación se realiza en el servidor con la normalización vigente:

- si acierta, gana el impostor;
- si falla, gana el grupo.

Después se revela la palabra y se muestra el resultado completo de la ronda.

## Puntuación y marcador

- Si gana el grupo, cada jugador normal de esa ronda suma 1 punto.
- Si gana el impostor, sólo el impostor suma 2 puntos.
- El cliente no calcula ni aplica puntos.

La diferencia compensa que el impostor compite solo, mientras una victoria del
grupo reparte puntos entre varias personas, sin agregar una economía compleja.

El marcador acumula los puntajes individuales del roster durante toda la tanda.
Desde allí el host puede iniciar otra ronda, si queda una palabra no usada, o
terminar la tanda.

## Fin de la tanda

La tanda sólo termina desde el marcador, con al menos una ronda resuelta y
puntuada. Gana cada participante que tenga el puntaje máximo; los empates en el
primer puesto producen múltiples ganadores y no un desempate oculto.

La Room queda cerrada y no se reutiliza. Para una nueva tanda el grupo crea otra
Room.
