# Diccionario — baseline de concepto v0

## Estado y propósito del documento

Este documento registra una primera baseline del concepto de **Diccionario**.
Separa los hechos de contexto y las decisiones de producto ya tomadas de las
hipótesis de evolución y de las preguntas que todavía requieren definición.

No constituye una especificación técnica, un diseño de arquitectura ni un
contrato completo de reglas y casos límite.

## Hechos de contexto y motivación

Diccionario busca sostener una actividad compartida por el grupo durante los
días en que sus integrantes están separados y darle una resolución social
cuando vuelven a encontrarse presencialmente.

La experiencia combina dos momentos:

1. una preparación asíncrona, en la que cada integrante puede aportar
   definiciones a su ritmo;
2. una resolución presencial, en la que quienes están presentes leen, votan y
   descubren los resultados juntos.

## Decisiones de producto

### Partida activa y preparación asíncrona

- El grupo tiene una partida activa compuesta por **3 palabras**.
- Cada miembro puede completar entre **0 y 3 definiciones**, una por cada
  palabra.
- La participación puede ser parcial: no es necesario completar las tres
  palabras para aportar a la partida.
- Cada participante puede editar sus definiciones hasta que comienza la
  resolución presencial.
- El progreso de cada participante es visible para el grupo, pero el contenido
  de sus definiciones permanece oculto.

### Inicio de la resolución presencial

- Se necesitan al menos **2 participantes presentes** para resolver la partida.
- Cualquiera de los presentes puede proponer el inicio.
- La resolución comienza cuando al menos otro participante presente confirma
  la propuesta.
- Al comenzar, se congela el contenido disponible: desde ese momento no se
  agregan ni editan definiciones para esa partida.
- Las definiciones ya enviadas por participantes ausentes o por participantes
  que solo completaron algunas palabras se incluyen en las palabras
  correspondientes.
- Un participante ausente puede sumar puntos por los votos que reciba una
  definición inventada que haya enviado, pero no participa de la votación
  presencial.

### Lectura de definiciones

- La resolución se realiza palabra por palabra.
- Para cada palabra, las definiciones se presentan de a una, anonimizadas y en
  un orden aleatorio que permanece estable durante la resolución de esa
  palabra.
- Avanzar a la definición siguiente requiere que una persona presente lo
  proponga y otra persona presente lo confirme.
- Una vez terminada la lectura, todas las definiciones de la palabra se muestran
  juntas para votar.

### Votación y revelación

- Solo votan los participantes presentes.
- Nadie puede votar su propia definición.
- La votación puede cerrarse cuando todos los presentes emitieron su voto.
- Una vez cumplida esa condición, revelar el resultado requiere una propuesta
  y la confirmación de otro participante presente.
- El resultado se revela y resuelve antes de avanzar a la palabra siguiente.

### Puntaje

- Cada participante presente obtiene **+1 punto** si identifica la definición
  real.
- Cada definición inventada otorga **+1 punto a su autor por cada voto que
  recibe**.
- Este segundo puntaje también puede corresponder a una persona ausente si su
  definición fue incorporada a la palabra.

### Pausa, cierre y continuidad

- La resolución presencial puede pausarse y reanudarse posteriormente.
- La partida se cierra cuando se resolvieron sus 3 palabras.
- Cada palabra resuelta pasa al historial o **Diccionario del grupo**.
- Después del cierre queda disponible una nueva partida con otras 3 palabras.

## Hipótesis y posibilidades futuras

Estas posibilidades se conservan como hipótesis de evolución; no forman parte
de la baseline decidida:

- rankings;
- selección o reconocimiento de mejores definiciones;
- estadísticas;
- votación histórica sobre palabras o definiciones ya incorporadas al
  Diccionario del grupo.

## Preguntas abiertas

- ¿Cuál será la fuente de las palabras y qué relación tendrá con la RAE u otras
  fuentes?
- ¿Qué criterios determinan que una palabra sea jugable?
- ¿Cómo se resolverán los casos límite todavía no cerrados?

Los casos límite deberán identificarse y decidirse antes de convertir este
concepto en reglas completas o en un contrato de implementación.

## Fuera de alcance de esta baseline

- arquitectura técnica;
- implementación;
- decisiones sobre reutilizar conceptos, modelos o componentes de Impostor.
