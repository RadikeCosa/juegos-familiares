# Diccionario — Recorrido del usuario

## Propósito

Este contrato describe el recorrido visible esperado para Diccionario antes de
su implementación. Las reglas pertenecen a `game-rules.md`; los estados
durables y guards conceptuales, a `game-state.md`.

Las rutas y nombres de pantallas son propuestas de producto. No implican que la
arquitectura, las tablas o los componentes ya existan.

## Superficies propuestas

### Plataforma

- `/`: inicio de Juegos Familiares y acceso a las utilidades disponibles.
- `/grupo`: superficie canónica del Group, con integrantes e invitación para el
  administrador.

### Diccionario

- `/diccionario`: entrada principal, estado de partida activa y acceso al
  historial del grupo.
- `/diccionario/partida`: preparación asincrónica de la partida activa.
- `/diccionario/resolucion`: resolución presencial de la partida.
- `/diccionario/historial`: palabras ya incorporadas al Diccionario del grupo.

Estas superficies pueden cambiar al diseñar la implementación. La decisión
estable es la separación entre preparación asincrónica, resolución presencial e
historial.

## Entrada

Un Player reconocido entra a Diccionario desde la plataforma o desde el contexto
del Group. Si no hay una partida activa, la experiencia debe explicar que el
grupo necesita crear o recibir una nueva partida de tres palabras.

La creación o asignación de palabras todavía depende de una decisión abierta:
fuente de palabras, criterio de jugabilidad y eventual curaduría.

## Preparación asincrónica

La pantalla de partida activa muestra las tres palabras y el progreso del grupo.
Cada participante puede abrir una palabra, escribir su definición inventada,
guardarla y editarla mientras la resolución no haya comenzado.

La UI debe permitir participación parcial sin presentar eso como error. Una
persona puede completar una sola definición y volver después.

El grupo ve señales de avance, por ejemplo:

- definiciones propias completadas;
- cantidad de definiciones propias pendientes;
- progreso de otros integrantes sin revelar contenido;
- estado general de si la partida tiene aportes suficientes para proponer una
  resolución, cuando esa regla se defina.

El contenido de definiciones ajenas no aparece en preparación.

## Proponer resolución

Cuando hay al menos dos participantes presentes, la interfaz permite proponer el
inicio de la resolución presencial.

Después de una propuesta:

- quien propuso ve que espera confirmación;
- otra persona presente puede confirmar;
- cualquier persona puede ver que la partida está por congelarse;
- el contenido sigue oculto hasta que la resolución comienza.

Al confirmar, la aplicación pasa a resolución y bloquea nuevas ediciones para
esa partida.

## Lectura presencial

La resolución muestra una palabra por vez. Para la palabra actual, las
definiciones se presentan anonimizadas, una por una, en orden aleatorio estable.

La pantalla debe funcionar como apoyo compartido del encuentro presencial:

- muestra la palabra actual;
- muestra la definición en lectura;
- permite proponer avanzar;
- pide confirmación de otra persona presente;
- evita mostrar autores antes del resultado.

Cuando se leyó la última definición de la palabra, la pantalla muestra todas las
opciones juntas para votar.

## Votación

Cada participante presente vota desde su teléfono. La pantalla muestra las
definiciones disponibles de la palabra y bloquea el voto propio cuando
corresponde.

Después de votar, la persona ve una confirmación de voto registrado. Mientras
faltan votos, no ve resultados parciales ni votos ajenos.

Cuando todos los presentes habilitados votaron, la pantalla indica que el
resultado puede revelarse.

## Revelación

Revelar el resultado requiere propuesta y confirmación de otra persona presente.

La pantalla de resultado de palabra muestra la definición real, autores de
definiciones inventadas, votos recibidos y puntos asignados. Después permite
avanzar a la siguiente palabra o cerrar la partida si ya se resolvieron las
tres.

## Pausa y reanudación

Durante la resolución debe existir una forma de pausar y volver más tarde. Al
reanudar, la UI reconstruye la palabra actual, el progreso de lectura, los votos
o resultados ya cerrados y el marcador acumulado.

La política exacta de quién puede pausar, cómo se confirma la pausa y qué pasa
si cambia el conjunto de presentes sigue abierta.

## Cierre e historial

Al resolver la tercera palabra, la partida se cierra. La pantalla final muestra
puntajes de la partida y confirma que las palabras pasan al Diccionario del
grupo.

El historial permite revisar palabras resueltas y sus definiciones reveladas.
Rankings, estadísticas avanzadas y votación histórica no forman parte de la
baseline actual.

## Recovery visible

Diccionario debe reconstruir el estado autorizado después de refresh,
reconexión o retorno a la aplicación:

- definiciones propias guardadas;
- progreso de la preparación;
- bloqueo de edición si la resolución ya comenzó;
- palabra actual en resolución;
- avance de lectura;
- voto propio ya registrado;
- resultado de palabras ya reveladas;
- puntaje acumulado y cierre.

Texto escrito pero no guardado, modales abiertos o propuestas locales todavía no
confirmadas pueden perderse si no fueron aceptadas por el estado remoto.
