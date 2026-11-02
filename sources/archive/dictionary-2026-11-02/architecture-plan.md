# Diccionario — Plan de arquitectura inicial

## Estado y propósito

Este documento propone una arquitectura inicial para Diccionario antes de
implementar. Organiza límites de dominio, estado durable y efímero, autoridad,
lecturas, intenciones, privacidad, recovery y validación.

No define todavía nombres finales de tablas, firmas SQL, migrations, rutas ni
componentes. Las decisiones marcadas como gates requieren revisión humana antes
del incremento que las necesita.

## Alcance

La propuesta cubre:

- catálogo propio curado;
- una partida activa de tres palabras por Group;
- preparación asincrónica y definiciones propias;
- resolución presencial con lectura, votación, revelación y puntaje;
- pausa y reanudación;
- cierre e historial mínimo;
- privacidad por actor y fase;
- reconstrucción desde estado remoto autorizado.

No promueve entidades de Impostor a plataforma, no diseña un motor genérico de
juegos y no incorpora las decisiones postergadas fuera del MVP.

## Restricciones de partida

La arquitectura debe preservar estas decisiones de producto:

- exactamente tres palabras por partida;
- definición real curada disponible antes de crear la partida;
- al menos dos definiciones inventadas de autores distintos por palabra antes
  de iniciar resolución;
- definiciones editables sólo durante preparación;
- lectura anónima con orden aleatorio estable y compartido;
- conjunto de votantes fijado por palabra al entrar a votación;
- auto-voto prohibido;
- resultado sin exposición de votos individuales;
- propuestas confirmadas por una persona distinta;
- acciones sensibles autoritativas e idempotentes;
- palabras no repetidas por Group mientras existan tres cartas elegibles.

## Límites de dominio

### Plataforma compartida

Diccionario consume capacidades existentes de plataforma:

- `AuthIdentity` y sesión autenticada;
- `Player` asociado al actor autenticado;
- `Group` y pertenencia;
- navegación y shell PWA;
- clientes y adaptadores comunes de Supabase.

### Dominio de Diccionario

Pertenecen a Diccionario:

- catálogo y metadata editorial;
- partida activa y sus tres cartas congeladas;
- definiciones inventadas;
- progreso de preparación;
- propuestas y confirmaciones de resolución;
- orden de lectura;
- conjunto de votantes, votos y resultados;
- puntaje e historial de Diccionario.

`Room`, `RoomParticipant`, `GameSession`, `Round`, host y liveness de Impostor
no se reutilizan como conceptos de Diccionario. Sólo pueden reutilizarse patrones
técnicos concretos que respeten este límite.

## Capas de estado

### Estado editorial

El catálogo existe antes de una partida. Cada carta posee palabra, definición
real, dificultad, estado de revisión y metadata opcional. Una partida nunca
consulta una fuente externa para completar una carta.

### Estado durable de partida

Postgres conserva como mínimo:

- Group propietario y estado de la partida;
- las tres cartas seleccionadas y un snapshot de su contenido necesario;
- posición y fase actuales;
- definiciones inventadas normalizadas y su autor;
- propuestas aceptadas o pendientes que sean necesarias para recovery;
- orden estable de lectura;
- conjunto de votantes fijado por palabra;
- votos, resultado, puntos y cierre.

El historial puede derivarse de la partida finalizada y sus resultados mientras
esa representación permita las lecturas requeridas. No se crea una segunda
copia histórica sin una necesidad demostrada.

### Estado efímero

Presence puede representar disponibilidad durante la resolución. Texto no
guardado, ayuda de escritura abierta, selección de voto todavía no enviada y
modales son estado local efímero.

Presence no prueba identidad, pertenencia, voto, confirmación ni transición. Si
un dato debe sobrevivir refresh o reconexión, debe persistirse de forma
autoritativa.

## Entidades conceptuales

Los siguientes nombres describen responsabilidades, no tablas definitivas:

- `DictionaryCard`: carta curada reutilizable.
- `DictionaryGame`: partida de un Group y estado global.
- `DictionaryGameWord`: carta seleccionada, snapshot y progreso de una de las
  tres palabras.
- `DictionaryDefinition`: aporte normalizado de una persona.
- `DictionaryProposal`: intención de transición que requiere otra persona.
- `DictionaryVoterSet`: participantes habilitados para votar una palabra.
- `DictionaryVote`: elección privada de una persona habilitada.
- `DictionaryWordResult`: revelación, agregados y puntos de una palabra.

La forma SQL puede combinar o separar estas responsabilidades según constraints,
privacidad y concurrencia. No debe generalizarse para otros juegos.

## Autoridad de escritura

Toda operación deriva `Player` y `Group` desde `auth.uid()`. El cliente puede
enviar el identificador del recurso sobre el que desea actuar cuando sea
inevitable, pero nunca certifica actor, pertenencia, autor, definición real,
fase, puntaje ni resultado.

Las intenciones conceptuales son:

- obtener o crear la partida activa del Group;
- guardar, editar o eliminar una definición propia;
- proponer y confirmar inicio;
- proponer y confirmar avance de lectura;
- registrar voto propio;
- proponer y confirmar revelación;
- proponer y confirmar pausa;
- reanudar una resolución;
- avanzar después de un resultado;
- cerrar la partida y habilitar la siguiente.

Cada intención debe validar estado previo, pertenencia, presencia cuando
corresponda, persona proponente, persona confirmante y guards específicos. Los
reintentos de la misma intención no deben duplicar definiciones, votos, puntos,
avance ni cierre.

## Contrato de definiciones

La definición persistida es texto plano normalizado. La normalización y las
validaciones objetivas se ejecutan en backend; la UI puede anticiparlas para dar
feedback inmediato.

La ayuda desde el signo de pregunta es contenido estático de UI. Incluye
checklist, ejemplos, recomendación de tono breve e impersonal y sugerencia de
usar el corrector del teléfono o navegador. No requiere persistencia, no analiza
el texto y no llama a un servicio de corrección.

Antes del Incremento 2 deben fijarse con ejemplos verificables:

- largo mínimo y máximo después de normalizar;
- tratamiento exacto de espacios y saltos de línea;
- signos repetidos que se reducen y signos válidos que se preservan;
- criterio técnico para detectar emojis;
- criterio mínimo para rechazar puro ruido.

## Modelos de lectura y privacidad

La lectura principal debe reconstruir una vista del juego derivada del actor y
de la fase. No debe devolver filas crudas para que React oculte secretos.

| Fase | Contenido propio | Contenido ajeno | Definición real | Votos |
| --- | --- | --- | --- | --- |
| Preparación | texto propio y estado de guardado | sólo progreso permitido | oculta | no disponibles |
| Lectura | opciones congeladas sin autor | opciones congeladas sin autor | mezclada sin marcar | no disponibles |
| Votación | opciones y elegibilidad propia | opciones sin autores | mezclada sin marcar | sólo voto propio registrado |
| Resultado | definiciones y autores | definiciones y autores | revelada | agregados por definición |
| Historial | contenido revelado | contenido revelado | revelada | agregados, nunca elecciones individuales |

Durante lectura y votación, cada opción necesita un identificador opaco y un
orden compartido. La respuesta puede indicar si el actor puede votar una opción
sin revelar el autor ni si es la definición real. El backend vuelve a comprobar
la prohibición de auto-voto al aceptar la intención.

## RLS, grants y RPCs

Las tablas del dominio deben tener RLS habilitada. Como punto de partida seguro,
las filas sensibles no reciben políticas de lectura o escritura directa para
clientes; las operaciones se exponen mediante funciones acotadas con grants
explícitos a `authenticated`.

Las funciones sensibles deben:

- fijar `search_path` seguro;
- derivar actor y Group desde `auth.uid()`;
- validar pertenencia activa;
- limitar cada lectura a la fase vigente;
- bloquear definiciones, autores, votos o definición real antes de su momento;
- ejecutar transiciones y puntaje en una única transacción;
- usar constraints como defensa adicional, no como única autorización.

La arquitectura final debe decidir si conviene una lectura principal por actor
y fase o varias lecturas pequeñas. La decisión se toma por claridad de contrato
y privacidad, no por imitación de `get_my_game_state()` de Impostor.

## Concurrencia e idempotencia

Las operaciones de confirmación, voto, revelación, puntaje y cierre pueden
recibir taps simultáneos, respuestas perdidas o reintentos. El diseño SQL debe
serializar la transición relevante o condicionar el cambio al estado esperado.

Como mínimo deben existir garantías equivalentes a:

- una definición inventada por autor y palabra;
- una partida activa por Group;
- tres posiciones únicas por partida;
- un voto por votante y palabra;
- una confirmación no realizada por quien propuso;
- un único resultado y una única aplicación de puntaje por palabra;
- un único cierre de partida;
- una carta registrada una sola vez como usada por el Group.

## Realtime, Presence y recovery

Realtime debe notificar invalidación o cambios persistidos; no transportar
secretos ni decidir transiciones. Después de una notificación, refresh,
foreground, reconexión o resuscripción, el cliente vuelve a pedir su lectura
autorizada.

Presence sólo participa en los guards presenciales definidos para resolución.
El conjunto de votantes se persiste al entrar a votación para que una
desconexión posterior no cambie silenciosamente la condición de cierre.

Si Realtime no cubre todavía una superficie, polling acotado puede ser una
alternativa inicial. Esa elección no cambia la fuente autoritativa.

## Selección y anti-repetición

La creación de partida selecciona tres cartas revisadas dentro de una operación
autoritativa. Debe excluir las cartas ya usadas por el Group y evitar que dos
creaciones concurrentes asignen partidas o cartas duplicadas.

La selección puede aplicar dificultad, familia y categoría cuando exista
metadata suficiente. Si quedan menos de tres cartas elegibles, la operación no
crea una partida parcial y devuelve un estado de producto comprensible.

## Gates humanos antes de implementar

### Antes del Incremento 1

- decidir quién puede crear o solicitar la nueva partida del Group;
- decidir si la primera partida aparece automáticamente o requiere una acción;
- confirmar el tamaño de catálogo necesario para habilitar el primer entorno
  técnico.

### Antes del Incremento 2

- aprobar los parámetros exactos de normalización y validación de definiciones;
- aprobar el contenido y ejemplos de la ayuda estática.

### Antes del Incremento 3

- decidir cómo una persona entra y sale de la presencia de resolución;
- definir qué evidencia efímera usa el backend para aceptar una acción
  presencial sin convertir Presence en autoridad de pertenencia.

### Antes de cerrar el flujo de resolución

- decidir quién puede proponer y confirmar el avance desde `word_result`;
- precisar desde qué fases puede pausarse y a cuál retorna cada pausa.

Estas decisiones no deben resolverse copiando host, Room o Presence de Impostor.

## Validación esperada

El diseño de migrations y RPCs deberá prever tests para:

- actor sin sesión, sin Player o ajeno al Group;
- lectura de definiciones propias y rechazo de contenido ajeno en preparación;
- ausencia de definición real, autores y votos individuales antes del resultado;
- normalización y rechazos de contenido en backend;
- doble envío, doble confirmación, doble voto y doble revelación;
- acciones con estado stale o propuesta invalidada;
- selección concurrente y anti-repetición por Group;
- conjunto de votantes congelado y desconexión posterior;
- puntaje, cierre e historial idempotentes;
- recovery desde cada fase durable.

## Evidencia del prototipo histórico

El prototipo `v0-dictionary` aporta referencias de composición mobile, escritura,
progreso, tarjetas de votación y resultados. No aporta una baseline reutilizable
de identidad, autorización, privacidad o estado.

En particular, la arquitectura nueva no adopta salas efímeras, host, rondas
configurables, IDs locales como autoridad, exposición de estado completo,
dependencia runtime de diccionarios externos ni avance por unanimidad de todos
los jugadores.

## Próximo checkpoint

Revisar y resolver primero los gates del Incremento 1. Después, convertir sólo
ese incremento en un diseño técnico verificable de tablas conceptuales,
operaciones, modelos de lectura y matriz de tests. Ninguna parte de este plan
autoriza todavía migrations ni implementación.
