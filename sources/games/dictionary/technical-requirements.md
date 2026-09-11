# Diccionario — Requisitos técnicos iniciales

## Estado del contrato

Este documento traduce la planificación de Diccionario a requisitos técnicos
iniciales. Habilita el diseño de arquitectura del primer incremento, pero
todavía no autoriza implementación.

El objetivo es separar:

- requisitos ya derivados de la baseline de producto;
- restricciones de seguridad y privacidad que deben mantenerse al implementar;
- decisiones postergadas que no pertenecen al MVP inicial.

## Alcance

Incluye requisitos para una primera versión implementable de Diccionario:

- partida activa de tres palabras por Group;
- carga asincrónica de definiciones propias;
- progreso visible sin exposición de contenido;
- congelamiento de definiciones al iniciar resolución;
- lectura presencial, votación, revelación y puntaje;
- pausa/reanudación conceptual;
- cierre e historial mínimo del Diccionario del grupo.

No incluye todavía:

- esquema SQL definitivo;
- nombres finales de tablas, RPCs o modelos de lectura;
- integración con una fuente externa de palabras durante la partida;
- diseño visual;
- reutilización técnica de entidades de Impostor.

## Autoridad y privacidad

El cliente debe enviar intenciones. El backend debe derivar actor, pertenencia,
permisos, estado vigente y transiciones desde estado remoto autorizado.

No debe confiarse en el cliente para:

- elegir palabras o definiciones reales;
- declarar presencia como autoridad final;
- congelar contenido sin validación remota;
- cerrar votaciones;
- calcular puntos;
- revelar autores;
- decidir cierre de partida;
- leer definiciones ajenas durante preparación.

Durante preparación, una persona sólo puede leer sus propias definiciones. El
grupo puede ver progreso agregado o por participante, pero no contenido ajeno.

Durante resolución, las definiciones congeladas se muestran anonimizadas hasta
el resultado de cada palabra. Los autores sólo se revelan en el resultado de esa
palabra.

Los votos individuales no deben exponerse como elecciones personales ajenas. El
resultado visible puede mostrar agregados por definición.

## Identidad y pertenencia

Diccionario usa el Group como contexto social persistente. Una acción del juego
requiere una identidad autenticada asociada a un Player del Group.

Esto no convierte a Diccionario en una extensión de Impostor ni promueve Room,
GameSession, Round, host, liveness o Presence a plataforma compartida. Cualquier
reutilización técnica futura debe justificarse por una necesidad real de
Diccionario, no por similitud nominal.

## Requisitos por capacidad

### Partida activa

- Debe existir como máximo una partida activa de Diccionario por Group, salvo
  que se decida explícitamente soportar partidas paralelas.
- Una partida activa contiene exactamente tres palabras.
- Cada palabra necesita una definición real disponible antes de resolución.
- Las palabras salen de un catálogo propio curado.
- La partida conserva un snapshot suficiente de cada carta para no depender de
  cambios posteriores del catálogo durante una resolución.
- La selección excluye palabras usadas previamente por el Group mientras existan
  alternativas disponibles.
- Si no existen tres cartas elegibles no usadas, no se crea una nueva partida en
  el MVP.

### Definiciones de participantes

- Un participante puede guardar como máximo una definición inventada propia por
  palabra.
- La entrada y la representación persistida son texto plano.
- Antes de persistir, el backend debe aplicar una normalización determinista de
  espacios, saltos de línea, signos repetidos y formato visual. La normalización
  no debe intentar cambiar el significado.
- El backend debe rechazar emojis, texto vacío, contenido fuera de los límites
  mínimo y máximo definidos y contenido compuesto sólo por ruido. La UI puede
  anticipar las mismas validaciones, pero no reemplaza el control autoritativo.
- La UI debe ofrecer sugerencias privadas y consultivas sobre posibles errores
  de ortografía, tono demasiado personal o formato raro, y recomendar un texto
  breve, impersonal y con estilo de diccionario.
- Las sugerencias no deben persistirse como contenido compartido, filtrar
  información al progreso del grupo ni modificar automáticamente la definición.
- El MVP no usa inteligencia artificial ni autocorrección semántica para esta
  revisión.
- El participante puede editar su definición hasta que la resolución comience.
- La participación parcial es válida.
- El contenido no se expone a otros participantes durante preparación.
- Las operaciones deben ser idempotentes o tolerantes a reintentos previstos.

### Progreso visible

- El grupo puede conocer progreso sin contenido: por ejemplo cantidad de
  definiciones enviadas por participante o estado de completitud propia.
- El progreso no debe permitir inferir definiciones ajenas.
- La UI debe distinguir participación parcial de error.

### Inicio de resolución

- La resolución requiere al menos dos participantes presentes.
- Cada palabra debe tener al menos tres definiciones votables: la definición
  real y dos definiciones inventadas de autores distintos.
- Una persona presente puede proponer iniciar.
- Otra persona presente distinta debe confirmar.
- Al confirmar, las definiciones disponibles quedan congeladas.
- Desde el congelamiento no pueden agregarse ni editarse definiciones para esa
  partida.
- Las definiciones de participantes ausentes se incluyen en la resolución.

### Lectura

- La resolución avanza palabra por palabra.
- Para cada palabra, las definiciones se presentan anonimizadas.
- El orden de lectura debe ser aleatorio y estable para esa palabra.
- Avanzar a la definición siguiente requiere propuesta y confirmación de otra
  persona presente.
- Al terminar la lectura de una palabra, todas sus definiciones se muestran
  juntas para votar.

### Votación

- Sólo votan participantes presentes habilitados.
- El conjunto de votantes se fija al entrar a votación para la palabra actual.
- Cada persona vota una vez por palabra.
- Nadie puede votar su propia definición inventada.
- No se muestran resultados parciales.
- El sistema debe registrar el voto propio de forma reconstruible después de
  refresh o reconexión.

### Revelación y puntaje

- El resultado requiere votación completa, propuesta y confirmación de otra
  persona presente.
- La revelación expone definición real, autores, votos agregados y puntos de la
  palabra.
- Cada participante presente suma 1 punto si identifica la definición real.
- El autor de una definición inventada suma 1 punto por cada voto recibido.
- Una persona ausente puede sumar puntos como autora, pero no como votante.
- El cálculo de puntos debe ser autoritativo e idempotente.

### Pausa y reanudación

- Una resolución pausada no reabre edición de definiciones.
- Pausar requiere propuesta y confirmación de otra persona presente.
- Reanudar requiere al menos dos presentes.
- Al reanudar debe reconstruirse el estado autorizado de la palabra actual,
  avance de lectura, votos ya emitidos, resultados revelados y puntaje.
- Las propuestas pendientes no expiran por tiempo en el MVP; se invalidan por
  cambio de estado o guards.

### Cierre e historial

- La partida se cierra cuando sus tres palabras fueron resueltas.
- El historial mínimo debe permitir revisar palabras resueltas, definición real,
  definiciones inventadas reveladas, autores, votos agregados, puntos y fecha de
  resolución.
- Rankings, estadísticas avanzadas y votación histórica no pertenecen al
  contrato inicial.

## Recovery

La experiencia debe reconstruir estado autorizado después de refresh, retorno a
foreground, reconexión o pérdida de respuesta:

- definiciones propias guardadas;
- progreso de preparación;
- bloqueo de edición tras congelamiento;
- palabra actual;
- definición actual o conjunto de definiciones para votar;
- voto propio ya registrado;
- resultado de palabras reveladas;
- puntaje acumulado;
- cierre de partida e historial mínimo.

Estado local efímero, como texto no guardado o un modal abierto, puede perderse
si no fue aceptado por el backend.

## Decisiones postergadas

Estas decisiones no bloquean el primer diseño técnico si se mantienen fuera del
MVP:

- reciclaje de palabras después de una ventana larga de enfriamiento;
- cancelación explícita o reemplazo manual de propuestas pendientes;
- representación de palabras omitidas o anuladas;
- abandono de una partida en curso;
- moderación avanzada o revisión posterior al congelamiento;
- garantía de anonimato perfecto frente a rasgos de autoría.

## Validación esperada

Cuando se implemente, la validación deberá cubrir:

- privacidad de definiciones durante preparación;
- normalización determinista y validación autoritativa de definiciones;
- privacidad de las sugerencias de revisión y ausencia de reescritura
  semántica;
- inclusión de definiciones de ausentes sin habilitarles voto;
- propuesta y confirmación por personas distintas;
- congelamiento de edición;
- prohibición de auto-voto;
- ausencia de resultados parciales;
- scoring idempotente;
- recovery de preparación, resolución, voto, resultado y cierre;
- límites entre plataforma, Diccionario e Impostor;
- selección sin repetición dentro del Group mientras haya cartas disponibles.
