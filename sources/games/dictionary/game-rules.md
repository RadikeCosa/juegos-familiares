# Diccionario — Reglas del juego

## Estado de las reglas

Estas reglas convierten la baseline de concepto v0 en un contrato jugable
inicial. Todavía no constituyen una especificación técnica ni cierran todos los
casos límite necesarios para implementar.

Estas reglas cierran el primer conjunto de decisiones bloqueantes para avanzar
hacia arquitectura e implementación. Las preguntas que permanecen abiertas no
deben bloquear el primer incremento si se mantienen dentro del alcance definido
acá.

## Participantes y partida

- Diccionario se juega dentro de un Group existente.
- El grupo tiene una partida activa compuesta por tres palabras.
- Cada integrante puede participar en cero, una, dos o tres palabras.
- Para cada palabra, un integrante puede enviar como máximo una definición
  inventada propia.
- Cada palabra tiene una definición real curada antes de entrar a la partida.
- La partida se resuelve cuando sus tres palabras fueron reveladas y puntuadas.
- Después del cierre puede comenzar una nueva partida con otras tres palabras.

## Fuente de palabras

Diccionario usa un catálogo propio curado. Cada carta jugable contiene una
palabra y una definición real breve preparada o verificada por el proyecto.

El catálogo puede alimentarse desde lemarios abiertos, listas de frecuencia y
consulta manual de diccionarios, pero no copia definiciones protegidas ni
depende de una API externa durante la partida.

Una palabra es jugable cuando:

- permite inventar definiciones plausibles;
- tiene una definición real breve;
- no es demasiado obvia ni demasiado rara;
- no es ofensiva ni incómoda para un contexto familiar;
- no es una palabra funcional, auxiliar o puramente gramatical;
- puede pronunciarse y leerse sin fricción razonable.

La selección evita repetir palabras ya usadas por el Group mientras existan
cartas disponibles. Si el catálogo del Group se agota, la aplicación debe
bloquear una nueva partida y explicar que faltan palabras disponibles. El MVP
no recicla palabras ya jugadas.

## Preparación asincrónica

Durante la preparación, cada integrante puede escribir o editar sus definiciones
propias. No necesita completar todas las palabras para que sus aportes sean
válidos.

Las definiciones se ingresan como texto plano. Antes de guardarlas, la
aplicación normaliza espacios, saltos de línea, signos repetidos y cualquier
formato visual extraño sin alterar intencionalmente el significado. No acepta
emojis, texto vacío, contenido demasiado corto o largo ni respuestas compuestas
sólo por ruido.

La persona autora recibe sugerencias privadas para revisar posibles errores de
ortografía, un tono demasiado personal o un formato raro. Estas sugerencias no
revelan contenido al grupo ni reemplazan el texto automáticamente. Se recomienda
una definición breve, impersonal y con estilo de diccionario.

El MVP no usa inteligencia artificial ni autocorrección semántica para revisar
o reescribir definiciones. Estas medidas buscan reducir pistas accidentales de
autoría; no garantizan anonimato perfecto.

El grupo puede conocer el progreso de cada participante, por ejemplo cuántas
definiciones cargó. No puede leer el contenido de definiciones ajenas antes de
la resolución.

La preparación termina cuando comienza la resolución presencial. Desde ese
momento las definiciones disponibles quedan congeladas y ya no se editan para
esa partida.

Para iniciar la resolución, cada palabra debe tener al menos tres definiciones
votables: la definición real y al menos dos definiciones inventadas de autores
distintos. Si una palabra no alcanza ese mínimo, la partida sigue en
preparación.

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

Cualquier persona presente puede proponer la pausa y otra persona presente debe
confirmarla. Reanudar requiere el mismo criterio mínimo de dos presentes. El
conjunto de votantes de una palabra se fija al entrar a la votación de esa
palabra; si alguien se va después, su ausencia no reabre la preparación ni borra
lo ya resuelto.

Las propuestas de inicio, avance, revelación o pausa no tienen expiración
automática en el MVP. Quedan válidas sólo mientras el estado y los participantes
presentes sigan cumpliendo sus guards; si dejan de cumplirlos, la aplicación
debe descartarlas al reconstruir el estado autorizado.

La partida se cierra cuando las tres palabras fueron resueltas. Cada palabra
resuelta pasa al historial o Diccionario del grupo.

## Preguntas abiertas para cerrar reglas

- ¿Se permiten palabras con más de una acepción jugable?
- ¿Cómo se manejan definiciones ofensivas o accidentalmente reales más allá de
  la moderación mínima definida?
- ¿Una versión futura necesita anular una palabra o abandonar una partida ya
  iniciada?
