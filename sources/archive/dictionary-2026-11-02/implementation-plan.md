# Diccionario — Plan incremental inicial

## Propósito

Este plan organiza el camino desde la baseline conceptual de Diccionario hasta
un primer producto implementable. No autoriza implementación por sí solo ni
decide arquitectura, base de datos o reutilización de piezas de Impostor.

La propuesta previa a implementación vive en `architecture-plan.md`. Sus gates
humanos deben resolverse antes del incremento que los necesita.

El plan mantiene una regla de trabajo: cerrar decisiones de producto antes de
convertirlas en migrations, RPCs, rutas o componentes.

## Criterio de avance

Cada incremento debe entregar una porción vertical verificable o una decisión
documental necesaria para destrabar la siguiente. No se deben introducir
abstracciones compartidas con Impostor antes de que Diccionario demuestre una
necesidad propia.

## Incremento 0 — Cierre de decisiones bloqueantes

Objetivo: transformar preguntas abiertas en decisiones explícitas de producto.

Estado: cerrado para pasar a diseño de arquitectura inicial, siempre que el MVP
mantenga fuera las decisiones postergadas.

Decisiones ya cerradas para avanzar:

- fuente inicial basada en catálogo propio curado;
- lemarios abiertos y listas de frecuencia como pool auxiliar, no como cartas
  finales;
- no usar DLE/RAE ni RAE API como fuente automática de definiciones;
- palabra jugable con definición real breve, dificultad razonable y posibilidad
  de definiciones inventadas plausibles;
- mínimo de tres definiciones votables por palabra: una real y dos inventadas de
  autores distintos;
- pausa por propuesta y confirmación de otra persona presente;
- conjunto de votantes fijado por palabra al entrar a votación;
- exclusión de palabras ya usadas por el Group mientras haya alternativas;
- formato editorial de carta jugable;
- dificultad, familia léxica, categoría amplia y revisión como metadata mínima;
- tamaño inicial: 120 cartas para MVP técnico, 300 para beta familiar y 1.000 o
  más como base saludable;
- moderación mínima basada en validaciones de texto y confianza de grupo;
- entrada de definiciones como texto plano, con normalización visual
  determinista y bloqueo de emojis, vacío, largo inválido o puro ruido;
- ayuda estática y privada desde un ícono de signo de pregunta, con checklist,
  ejemplos y recomendación de usar el corrector del teléfono o navegador;
- sin inteligencia artificial, autocorrección semántica ni garantía de anonimato
  perfecto en el MVP;
- historial inicial con palabra, definición real, definiciones reveladas,
  autores, votos agregados, puntos y fecha de resolución;
- propuestas sin expiración automática; se invalidan por estado o guards;
- sin reciclaje de palabras en MVP si el Group agota el catálogo disponible;
- sin omitir, anular o reemplazar palabras dentro de una partida en MVP.

Queda postergado fuera del MVP:

- reciclaje después de una ventana larga de enfriamiento;
- cancelación explícita de propuestas;
- anulación de palabras;
- abandono de partida;
- moderación avanzada.

Salida esperada:

- actualización de `game-rules.md`;
- actualización de `game-state.md`;
- actualización de `technical-requirements.md`;
- lista clara de decisiones postergadas.

No incluye:

- implementación;
- migrations;
- rutas;
- diseño visual final.

## Incremento 1 — Entrada y partida activa de Diccionario

Objetivo: que un Group reconocido pueda ver la superficie de Diccionario y una
partida activa de tres palabras.

Capacidades:

- entrada desde la plataforma o el contexto de Group;
- pantalla inicial de Diccionario;
- creación o asignación de partida activa desde el catálogo curado;
- visualización de tres palabras;
- estado vacío de definiciones propias;
- mensajes claros cuando falta contexto de Group.

Validación:

- no crear identidad por renderizar;
- no mezclar estado de Impostor;
- reconstruir partida activa desde estado autorizado;
- excluir palabras ya usadas por el Group mientras haya alternativas;
- cubrir ausencia de partida o falta de pertenencia.

## Incremento 2 — Definiciones propias y progreso privado

Objetivo: permitir carga asincrónica de definiciones propias sin exponer
contenido ajeno.

Capacidades:

- guardar definición propia por palabra;
- editar definición propia antes de resolución;
- normalizar texto plano antes de guardarlo;
- bloquear emojis, vacío, largo inválido y puro ruido;
- mostrar ayuda estática de ortografía, tono y formato sin analizar el texto;
- ver progreso propio y progreso permitido del grupo;
- impedir duplicados propios por palabra;
- preservar participación parcial como estado válido.

Validación:

- un participante no lee definiciones ajenas;
- edición queda acotada al autor;
- progreso no filtra contenido;
- reintentos o taps rápidos no duplican definiciones;
- la normalización es determinista y no reescribe el significado;
- la ayuda es accesible, no persiste estado, no analiza el contenido y no se
  expone como progreso a otros participantes;
- refresh reconstruye lo guardado.

## Incremento 3 — Inicio presencial y congelamiento

Objetivo: pasar de preparación a resolución mediante acuerdo de al menos dos
personas presentes.

Capacidades:

- detectar o declarar presencia según política decidida;
- proponer inicio de resolución;
- confirmar con una persona distinta;
- congelar definiciones disponibles;
- bloquear edición posterior;
- incluir aportes de personas ausentes.

Validación:

- no confirmar una propuesta propia;
- no iniciar con menos de dos presentes;
- no aceptar edición después del congelamiento;
- mantener aportes parciales y ausentes;
- reconstruir estado después de pérdida de respuesta.

## Incremento 4 — Lectura de definiciones

Objetivo: leer una palabra por vez, con definiciones anonimizadas y orden
aleatorio estable.

Capacidades:

- seleccionar palabra actual;
- ordenar definiciones de forma aleatoria y estable;
- mostrar una definición anonimizada por vez;
- proponer avance;
- confirmar avance con otra persona presente;
- pasar a votación al terminar la lectura.

Validación:

- autores ocultos antes del resultado;
- orden estable para todos los presentes;
- avance idempotente;
- recovery de definición actual;
- bloqueo ante confirmación inválida.

## Incremento 5 — Votación y resultado de palabra

Objetivo: votar una palabra, revelar resultado y asignar puntos de manera
autoritativa.

Capacidades:

- listar definiciones votables;
- registrar voto propio;
- impedir auto-voto;
- ocultar resultados parciales;
- detectar votación completa;
- proponer y confirmar revelación;
- mostrar definición real, autores, votos agregados y puntos;
- acumular marcador.

Validación:

- sólo presentes votan;
- ausentes pueden sumar como autores;
- puntaje idempotente;
- voto propio reconstruible;
- resultados parciales no expuestos;
- autores revelados sólo al resultado.

## Incremento 6 — Continuidad, pausa y cierre

Objetivo: completar las tres palabras, manejar interrupciones y cerrar la
partida con historial mínimo.

Capacidades:

- avanzar a la palabra siguiente;
- pausar y reanudar según política decidida;
- conservar puntaje acumulado;
- cerrar al resolver la tercera palabra;
- incorporar entradas al Diccionario del grupo;
- habilitar una nueva partida después del cierre.

Validación:

- no reabrir definiciones tras pausa;
- recovery desde cada punto de resolución;
- cierre único e idempotente;
- historial sin datos fuera del alcance inicial;
- nueva partida sin reciclar estado mutable anterior.

## Fuera de alcance inicial

- rankings globales;
- estadísticas avanzadas;
- votación histórica;
- moderación compleja o garantía de anonimato perfecto;
- IA generativa;
- autocorrección semántica;
- soporte offline para resolución compartida;
- múltiples partidas simultáneas por Group;
- abstracciones genéricas compartidas con Impostor.

## Primer checkpoint recomendado

El próximo trabajo debería resolver los gates del Incremento 1 identificados en
`architecture-plan.md` y preparar, en un alcance separado, una muestra editorial
pequeña de cartas curadas. Si una decisión nueva afecta reglas de juego,
privacidad, presencia o UX presencial, debe quedar documentada como decisión de
producto antes de implementar.
