# Diccionario — Reglas del juego

## Estado de las reglas

Estas reglas convierten la baseline de concepto v0 en un contrato jugable
inicial. Todavía no constituyen una especificación técnica ni cierran todos los
casos límite necesarios para implementar.

La fuente de palabras, la definición real y los criterios de jugabilidad siguen
abiertos. Esas decisiones deben cerrarse antes de construir el primer incremento
funcional.

## Participantes y partida

- Diccionario se juega dentro de un Group existente.
- El grupo tiene una partida activa compuesta por tres palabras.
- Cada integrante puede participar en cero, una, dos o tres palabras.
- Para cada palabra, un integrante puede enviar como máximo una definición
  inventada propia.
- La partida se resuelve cuando sus tres palabras fueron reveladas y puntuadas.
- Después del cierre puede comenzar una nueva partida con otras tres palabras.

## Preparación asincrónica

Durante la preparación, cada integrante puede escribir o editar sus definiciones
propias. No necesita completar todas las palabras para que sus aportes sean
válidos.

El grupo puede conocer el progreso de cada participante, por ejemplo cuántas
definiciones cargó. No puede leer el contenido de definiciones ajenas antes de
la resolución.

La preparación termina cuando comienza la resolución presencial. Desde ese
momento las definiciones disponibles quedan congeladas y ya no se editan para
esa partida.

## Inicio de resolución presencial

Se necesitan al menos dos participantes presentes para iniciar la resolución.

Cualquiera de las personas presentes puede proponer empezar. La resolución
comienza cuando otra persona presente confirma la propuesta. La confirmación de
la misma persona que propuso no alcanza.

Al iniciar:

- se congela el contenido disponible;
- se incluyen definiciones de participantes ausentes;
- se incluyen definiciones parciales de quienes no completaron las tres
  palabras;
- las personas ausentes quedan fuera de la votación presencial.

## Lectura por palabra

La resolución se realiza palabra por palabra. No se vota una palabra antes de
terminar su lectura.

Para cada palabra, la aplicación presenta las definiciones de a una:

- anonimizadas;
- en un orden aleatorio;
- con el mismo orden para todo el grupo durante esa palabra.

Avanzar a la definición siguiente requiere propuesta de una persona presente y
confirmación de otra persona presente. Cuando ya no quedan definiciones por
leer, todas las definiciones de la palabra se muestran juntas para votar.

## Votación

Sólo votan participantes presentes en la resolución de la palabra.

Cada votante elige una definición entre las opciones disponibles de esa palabra.
Nadie puede votar su propia definición inventada. Si un participante no cargó
definición para esa palabra, puede votar cualquiera de las opciones disponibles.

La votación puede cerrarse cuando todas las personas presentes habilitadas para
votar emitieron su voto. No se muestran conteos parciales ni elecciones ajenas
antes del resultado.

## Revelación y resultado de palabra

Cuando la votación está completa, revelar el resultado requiere una propuesta y
la confirmación de otra persona presente.

El resultado de la palabra muestra:

- cuál era la definición real;
- quién escribió cada definición inventada;
- cuántos votos recibió cada definición;
- qué puntos se asignan por esa palabra.

El resultado se revela y puntúa antes de avanzar a la palabra siguiente.

## Puntaje

- Cada participante presente suma 1 punto si votó la definición real.
- El autor de una definición inventada suma 1 punto por cada voto recibido por
  esa definición.
- Una persona ausente puede sumar puntos como autora de una definición
  inventada.
- Una persona ausente no suma puntos por identificar la definición real porque
  no participa de la votación presencial.

El puntaje se acumula durante la partida activa de tres palabras.

## Pausa, reanudación y cierre

La resolución presencial puede pausarse y reanudarse más tarde. Al reanudar, la
partida conserva lo ya congelado, leído, votado, revelado y puntuado.

La partida se cierra cuando las tres palabras fueron resueltas. Cada palabra
resuelta pasa al historial o Diccionario del grupo.

## Preguntas abiertas para cerrar reglas

- ¿Cuál es la fuente de palabras y definiciones reales?
- ¿Se permiten palabras con más de una acepción jugable?
- ¿Cuántas definiciones mínimas necesita una palabra para ser divertida o
  resoluble?
- ¿Qué ocurre si sólo hay una definición votable para una palabra?
- ¿Qué ocurre si una persona presente es la única que cargó definición para una
  palabra?
- ¿Cómo se pausan y reanudan formalmente las resoluciones?
- ¿Qué política aplica si una persona presente se va durante la resolución o
  antes de votar?
- ¿Cómo se manejan definiciones ofensivas, inválidas o accidentalmente reales?
