# Diccionario — Plan incremental inicial

## Propósito

Este plan organiza el camino desde la baseline conceptual de Diccionario hasta
un primer producto implementable. No autoriza implementación por sí solo ni
decide arquitectura, base de datos o reutilización de piezas de Impostor.

El plan mantiene una regla de trabajo: cerrar decisiones de producto antes de
convertirlas en migrations, RPCs, rutas o componentes.

## Criterio de avance

Cada incremento debe entregar una porción vertical verificable o una decisión
documental necesaria para destrabar la siguiente. No se deben introducir
abstracciones compartidas con Impostor antes de que Diccionario demuestre una
necesidad propia.

## Incremento 0 — Cierre de decisiones bloqueantes

Objetivo: transformar preguntas abiertas en decisiones explícitas de producto.

Debe cerrar:

- fuente inicial de palabras y definiciones reales;
- criterio de palabra jugable;
- mínimo de definiciones para resolver una palabra;
- comportamiento con pocas definiciones;
- pausa y reanudación;
- desconexión o salida durante resolución;
- ciclo de propuestas pendientes;
- alcance del historial inicial;
- moderación mínima.

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
- creación o asignación de partida activa según la fuente decidida;
- visualización de tres palabras;
- estado vacío de definiciones propias;
- mensajes claros cuando falta contexto de Group.

Validación:

- no crear identidad por renderizar;
- no mezclar estado de Impostor;
- reconstruir partida activa desde estado autorizado;
- cubrir ausencia de partida o falta de pertenencia.

## Incremento 2 — Definiciones propias y progreso privado

Objetivo: permitir carga asincrónica de definiciones propias sin exponer
contenido ajeno.

Capacidades:

- guardar definición propia por palabra;
- editar definición propia antes de resolución;
- ver progreso propio y progreso permitido del grupo;
- impedir duplicados propios por palabra;
- preservar participación parcial como estado válido.

Validación:

- un participante no lee definiciones ajenas;
- edición queda acotada al autor;
- progreso no filtra contenido;
- reintentos o taps rápidos no duplican definiciones;
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
- moderación compleja;
- IA generativa;
- soporte offline para resolución compartida;
- múltiples partidas simultáneas por Group;
- abstracciones genéricas compartidas con Impostor.

## Primer checkpoint recomendado

El próximo trabajo debería ser el Incremento 0. Si una decisión parece
exclusivamente técnica, puede proponerse una alternativa mínima; si afecta reglas
de juego, privacidad, presencia o UX presencial, debe quedar documentada como
decisión de producto antes de implementar.
