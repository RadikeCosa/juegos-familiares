# Impostor — Decisiones de producto

## Propósito

Este documento registra decisiones de producto que consideramos suficientemente estables como para orientar el diseño y la implementación.

No contiene todas las posibilidades futuras. Su objetivo es evitar rediscutir decisiones ya tomadas y distinguir claramente entre decisiones confirmadas y cuestiones todavía abiertas.

---

# Contexto inicial

La primera versión está pensada para un grupo pequeño y conocido de jugadores.

El grupo inicial de referencia es:

* Ramiro
* Pedro
* Camila
* Victoria

El producto debe poder admitir eventualmente más participantes y otros grupos, pero no diseñaremos el MVP alrededor de problemas propios de una comunidad pública o masiva.

---

# Plataforma

## Decisión

Impostor se desarrollará dentro de Juegos Familiares.

Juegos Familiares será una aplicación web mobile-first con objetivo de funcionar como PWA.

Debe funcionar correctamente en iOS y Android.

La PWA debe contemplar específicamente Safari en iOS y Chrome en Android.

La instalación no debe ser obligatoria para poder jugar.

La aplicación debe seguir funcionando desde el navegador.

## Motivo

Cada participante utilizará principalmente su teléfono.

La PWA permite:

* acceso mediante URL;
* instalación en el dispositivo;
* experiencia similar a una aplicación;
* evolución progresiva del soporte offline;
* distribución sencilla sin depender inicialmente de tiendas.

El proyecto se utilizará también para aprender progresivamente los conceptos técnicos asociados a PWAs.

Debemos considerar diferencias reales entre plataformas respecto de instalación, manifest, service workers, cache, almacenamiento, ciclo de vida, actualización y comportamiento al pasar a segundo plano o volver a primer plano.

No definimos todavía soluciones técnicas concretas para esas diferencias.

---

# Identidad

## Decisión

No exigiremos cuentas tradicionales en el MVP.

Cada jugador tendrá una identidad sencilla dentro de su grupo.

La identidad, el jugador y el grupo son capacidades que pueden ser compartidas por distintos juegos de Juegos Familiares.

El dispositivo podrá recordar:

* identificador del jugador;
* nombre o nick;
* grupo al que pertenece.

## Motivo

La aplicación está pensada inicialmente para grupos conocidos y partidas casuales.

Email, contraseña o autenticación social introducirían fricción sin resolver un problema relevante del MVP.

## Principio

Sin cuenta no significa sin identidad.

La aplicación necesita reconocer al jugador, pero no necesita inicialmente una identidad global.

La identidad almacenada localmente permite recordar qué jugador utiliza el dispositivo, pero no constituye por sí sola la autoridad para ejecutar acciones protegidas.

Las acciones protegidas deben validarse contra el estado compartido del sistema.

No diseñaremos todavía RBAC, tokens, autenticación, RLS ni mecanismos técnicos concretos.

---

# Grupo

## Decisión

Existe un grupo persistente independiente de las partidas.

El grupo puede pertenecer al nivel compartido de Juegos Familiares.

Impostor lo utiliza para participantes, permisos y banco de palabras.

El grupo mantiene:

* participantes;
* banco de palabras;
* configuración básica.

## Motivo

Las mismas personas pueden jugar en diferentes momentos y el banco de palabras debe poder crecer entre partidas.

---

# Administrador del grupo

## Decisión

El creador del grupo es inicialmente su administrador.

## Permisos iniciales

El administrador puede:

* consultar integrantes;
* eliminar integrantes.

En el MVP del banco de palabras, el administrador no tiene una excepción para explorar el banco completo.

## Motivo

El contexto familiar permite mantener una administración sencilla sin construir un sistema complejo de roles.

La moderación completa del banco queda diferida hasta que aparezca un problema real de contenido.

---

# Capacidades protegidas

## Decisión

Las operaciones protegidas deben distinguir conceptualmente al menos estas capacidades.

### Administrador del grupo

Puede:

* consultar integrantes;
* eliminar integrantes.

En el Incremento 3, sus permisos sobre el banco son los mismos que los de cualquier integrante: agregar palabras, consultar cantidad total, consultar sus propios aportes y borrar sus propios aportes.

### Host de sala

Puede:

* iniciar la tanda;
* iniciar la votación;
* avanzar las etapas de resolución de ronda;
* iniciar una nueva ronda;
* terminar la tanda.

### Participante de la sala

Puede:

* recibir su propia información privada;
* confirmar que está listo;
* votar;
* participar de la ronda.

### Autor de palabra

Puede:

* consultar sus propias palabras;
* borrar sus propias palabras.

## Motivo

Estas capacidades ordenan permisos del MVP sin convertirlos todavía en un sistema técnico de autorización.

---

# Sala

## Decisión

Las salas son temporales.

Una sala representa a las personas que están jugando en ese momento.

No todos los integrantes del grupo deben participar de todas las salas.

---

# Host de la sala

## Decisión

La persona que crea la sala actúa como host.

El host puede ser cualquier integrante del grupo y no necesita ser administrador.

El administrador del Group y el host de una Room son roles distintos. Ser administrador del Group no autoriza automáticamente a cerrar una Room creada por otro Player.

## Motivo

La administración permanente del grupo y la conducción temporal de una partida son responsabilidades diferentes.

Esto permite que cualquier integrante pueda iniciar una partida aunque el administrador no participe.

---

# Lifecycle mínimo de Room

## Decisión

En Incremento 4 una Room puede estar en:

```text
lobby
closed
```

Una Room cerrada deja de considerarse activa.

Un participante no-host puede abandonar el lobby. El host puede cerrar el lobby. Si el host quiere abandonar durante este incremento, la Room se cierra.

El cierre explícito de una Room solo corresponde al host. Al cerrar, la Room pasa a `closed`, deja de ser activa y libera a sus participantes para crear o unirse a otra Room. Las filas de `RoomParticipant` pueden preservarse como rastro técnico de quién participó, pero eso no constituye una pantalla ni feature de historial.

No existe expiración automática ni sucesión automática del host en este incremento. La sucesión, el host desconectado y el host original que vuelve pertenecen al Incremento 5.

## Persistencia

Aunque Room es temporal en el dominio, se persiste técnicamente para refresh, concurrencia, reconstrucción y sincronización entre dispositivos.

# Presence y sucesión de host

## Decisión

En Incremento 5 el lobby usará Supabase Realtime Presence para mostrar disponibilidad efímera `connected | disconnected` de los participantes de la Room activa.

`RoomParticipant` sigue representando pertenencia persistida a una Room. No se convierte conceptualmente en una conexión.

La separación de producto queda así:

```text
RoomParticipant = pertenece a la Room
Presence = está disponible ahora de forma efímera
rooms.host_player_id = host actual autoritativo
```

Varias conexiones del mismo Player, por ejemplo dos pestañas, cuentan como un único Player lógico.

La pérdida de Presence no significa abandono inmediato y no reasigna por sí sola el host.

## Sucesión

Si el host deja de estar disponible, la sucesión requiere validación autoritativa de staleness. La hipótesis inicial del MVP es esperar 60 segundos antes de considerar al host no disponible para sucesión.

Esa tolerancia de 60 segundos es una hipótesis técnica/producto a validar en navegadores móviles. No es una regla definitiva del juego ni una configuración para usuarios.

El nuevo host es el participante disponible restante con `joinedAt` más antiguo.

Si el host original vuelve después de haber sido reemplazado, vuelve como participante normal y no recupera el rol automáticamente.

El cambio de host debe sentirse liviano: la interfaz identifica al host actual y muestra feedback breve, no bloqueante, cuando cambia. No debe mostrar métricas técnicas, heartbeat ni `lastSeenAt`.

## Motivo

Queremos que una ausencia breve, un bloqueo de pantalla o una transición background/foreground móvil no cierre ni desordene el lobby.

También queremos evitar que un cliente pueda decidir el host solo porque observó una pérdida de Presence. El host es un rol persistido y debe cambiar mediante una decisión autoritativa.

# Sincronización de lobby

## Decisión

En Incremento 4, Realtime usa Postgres Changes solo como señal de invalidación:

```text
INSERT room_participants
DELETE room_participants
UPDATE rooms
→ get_my_active_room()
```

El payload de Realtime no es fuente de verdad. El lobby visible se reconstruye siempre desde la lectura autoritativa.

# Rooms activas

## Decisión

Un Player puede pertenecer a una sola Room activa de Impostor.

Un Group puede tener varias Rooms activas simultáneamente.

Si el Player ya pertenece a una Room activa y solicita crear otra, la operación devuelve la Room existente en lugar de crear una segunda Room ambigua.

# Código y enlace de Room

## Decisión

Cada Room tiene un código opaco de 8 caracteres, no secuencial. El código y el enlace son dos representaciones de la misma Room.

La ruta conceptual es:

```text
/impostor/sala/[code]
```

No existe `RoomInvitation` separada. QR queda fuera de Incremento 4.

---

# Banco de palabras

## Decisión

Las palabras o frases cortas pertenecen al grupo y no a una partida concreta.

Pueden agregarse en cualquier momento, incluso cuando no existe una sala activa.

La entidad persistente concreta del banco es `GroupWord`.

## Motivo

Queremos que el banco crezca progresivamente y se convierta en contenido propio del grupo.

---

# Fuentes de palabras

## Decisión

En el Incremento 3, el banco se alimenta con palabras creadas por los integrantes.

Inicialmente no necesitamos organizar obligatoriamente las palabras por categorías.

Las palabras precargadas quedan diferidas fuera del Incremento 3.

La opción futura preferida es un catálogo global separado, por ejemplo `default_words`, sin copiar automáticamente palabras iniciales a cada grupo.

---

# Visibilidad del banco

## Decisión

Ningún integrante puede explorar libremente el banco completo en el MVP del Incremento 3.

Cualquier integrante, incluido el administrador, puede conocer:

* las palabras que ellos mismos agregaron;
* la cantidad total disponible.

También puede borrar sus propios aportes.

## Motivo

Mostrar todas las palabras reduciría la sorpresa de rondas futuras.

Esta decisión evoluciona la política anterior: aunque el administrador podía consultar el banco completo en una versión conceptual inicial, en el MVP se elimina esa excepción porque el administrador también puede jugar y conocer todas las palabras le daría una ventaja innecesaria.

La moderación suficiente para esta etapa combina:

* borrado de aportes propios;
* duplicados automáticos;
* grupo cerrado por invitación.

---

# Alta de palabras

## Decisión

Cualquier integrante del grupo puede agregar palabras sin que exista una partida activa.

En el contexto inicial, las palabras ingresan directamente al banco.

## Motivo

Agregar palabras debe ser una acción espontánea y de baja fricción.

No queremos convertir al administrador en un cuello de botella.

---

# Validación automática

## Decisión

La aplicación debe resolver automáticamente los problemas sencillos de calidad de datos.

Inicialmente:

* impedir palabras vacías;
* normalizar espacios;
* comparar sin distinguir mayúsculas y minúsculas;
* impedir duplicados triviales;
* limitar longitud entre 2 y 40 caracteres;
* conservar tildes, `ñ` y puntuación;
* rechazar emojis.

La normalización no debe ser lingüísticamente agresiva. Por ejemplo, `Camion` y `Camión` son entradas distintas, mientras que `Elefante`, `elefante` y `ELEFANTE` son duplicados.

## Motivo

Estas comprobaciones son determinísticas y no requieren criterio humano.

El administrador no debería dedicar tiempo a tareas que el software puede resolver.

---

# Moderación

## Decisión

No habrá aprobación obligatoria de palabras en el MVP familiar.

En el Incremento 3 no se incorpora un panel administrativo para revisar y eliminar contenido de otros integrantes.

Cada autor podrá borrar sus propios aportes.

## Evolución posible

Si el producto se utiliza posteriormente en grupos menos controlados, podemos incorporar:

* palabras pendientes;
* aprobación;
* rechazo;
* límites de aportes;
* moderación adicional.

No implementaremos esas capacidades anticipadamente.

---

# Persistencia

## Decisión

Debemos distinguir dos tipos de estado.

### Persistente

Debe sobrevivir entre partidas:

* grupo;
* jugadores;
* banco de palabras.

### Temporal

Pertenece principalmente a una sesión:

* sala;
* participantes actuales;
* ronda;
* palabra seleccionada;
* impostor;
* votos;
* marcador de la tanda.

### Historial mínimo

Al finalizar una tanda debemos conservar un resumen histórico mínimo de la tanda y sus rondas.

El objetivo es poder construir más adelante estadísticas divertidas del grupo sin guardar datos innecesarios.

El historial de tanda debe preservar al menos:

* identificador;
* grupo;
* fecha/hora de inicio;
* fecha/hora de finalización;
* participantes;
* cantidad de rondas;
* puntuación final.

El historial de ronda debe preservar al menos:

* tanda;
* número de ronda;
* impostor;
* ganador (`group` o `impostor`);
* si el impostor fue descubierto;
* si el impostor adivinó la palabra.

No necesitamos conservar votos individuales históricos salvo que aparezca una razón concreta.

Este historial no define tablas, schemas ni base de datos.

---

# Privacidad de la ronda

## Decisión

Cada dispositivo debe recibir solamente la información privada necesaria para su jugador.

Un jugador normal recibe la palabra.

El impostor recibe únicamente su rol.

No debemos basar la privacidad solamente en ocultar información que ya fue enviada al navegador.

---

# Selección del impostor

## Decisión

En cada ronda existe exactamente un impostor.

La selección combina azar con balance.

Mientras existan jugadores que hayan sido impostores menos veces durante la tanda, tendrán prioridad frente a quienes ya ocuparon ese rol más veces.

Entre los jugadores elegibles, la selección es aleatoria.

## Motivo

Buscamos evitar repeticiones injustas sin hacer predecible quién será el próximo impostor.

---

# Selección de palabras

## Decisión

Una palabra utilizada no vuelve a aparecer durante la misma tanda.

Continúa perteneciendo al banco y puede utilizarse nuevamente en una tanda futura.

Para iniciar una ronda debe existir al menos una palabra del banco disponible que todavía no haya sido utilizada durante la tanda actual.

Si no quedan palabras disponibles, no puede comenzar una nueva ronda. La aplicación debe permitir agregar nuevas palabras o terminar la tanda, sin reutilizar automáticamente palabras ya usadas en esa misma tanda.

---

# Interacción durante la ronda

## Decisión

Después de distribuir la palabra y el rol, la conversación ocurre principalmente fuera de la aplicación.

La aplicación no controla:

* turnos;
* cantidad de pistas;
* duración;
* conversación.

Existe una primera vuelta en la que cada jugador participa al menos una vez y luego conversación libre.

## Motivo

La interacción social presencial es el centro del juego.

---

# Inicio de conversación

## Decisión

La aplicación no selecciona quién habla primero.

El grupo lo decide presencialmente.

## Motivo

Evita agregar una regla digital que no aporta suficiente valor y evita cualquier posible inferencia sobre quién es el impostor.

---

# Votación

## Decisión

La votación se realiza desde los dispositivos.

Cada jugador vota secretamente por quien considera impostor.

No puede votarse a sí mismo.

No se muestran resultados parciales.

Los votos se revelan cuando todos participaron.

## Motivo

La votación secreta es uno de los momentos donde tener un teléfono por participante aporta valor real al juego.

---

# Empates

## Decisión

Si la primera votación termina empatada entre los jugadores con más votos:

1. se informa el empate;
2. el grupo puede discutir nuevamente;
3. se realiza una segunda votación;
4. solamente participan como candidatos los jugadores empatados.

En la segunda votación, el grupo solamente identifica al impostor si el impostor queda como único jugador con mayor cantidad de votos.

Cualquier otro resultado da la victoria al impostor.

Esto incluye:

* un nuevo empate;
* otro jugador como único más votado;
* cualquier resultado donde el impostor no sea el único más votado.

No hay más rondas de desempate.

---

# Última oportunidad del impostor

## Decisión

Si el impostor es descubierto, tiene una oportunidad para adivinar la palabra.

Primero se revela quién era el impostor.

La palabra permanece oculta.

El impostor dice en voz alta cuál cree que era.

Después se revela la palabra y el host registra si acertó.

## Motivo

Mantiene al impostor involucrado durante toda la conversación y evita que ser descubierto cierre automáticamente la ronda.

---

# Condiciones de victoria

## Victoria del impostor

El impostor gana si:

* el grupo acusa a otro jugador;
* en la segunda votación, el impostor no queda como único jugador con mayor cantidad de votos;
* es descubierto pero adivina correctamente la palabra.

## Victoria del grupo

El grupo gana si:

* identifica correctamente al impostor;
* y el impostor no logra adivinar la palabra.

---

# Puntuación

## Decisión

La puntuación inicial debe mantenerse deliberadamente sencilla.

### Victoria del impostor

El impostor recibe:

`+2 puntos`

### Victoria del grupo

Cada jugador normal recibe:

`+1 punto`

## Motivo

Queremos que el marcador agregue continuidad y competencia sin convertir la partida en una optimización compleja de puntos individuales.

---

# Duración de la tanda

## Decisión

No existe inicialmente un número fijo de rondas.

Después de cada ronda el host puede:

* iniciar otra ronda;
* terminar la tanda.

## Motivo

El juego debe adaptarse naturalmente al contexto presencial.

---

# Alcance offline y PWA

## Decisión

Juegos Familiares sigue teniendo objetivo PWA.

La instalación y las capacidades progresivas de cache forman parte del proyecto.

Una partida multijugador completamente funcional sin conectividad no es requisito del MVP.

No prometemos soporte offline completo para salas sincronizadas.

El objetivo PWA incluye navegador y experiencia instalada tanto en iOS como en Android.

## Motivo

El objetivo PWA acompaña el aprendizaje y la experiencia de instalación.

La sincronización entre teléfonos en Impostor requiere conectividad en la primera versión jugable.

---

# Estadísticas futuras

## Decisión

La interfaz de estadísticas no forma parte obligatoria del primer MVP.

Sin embargo, desde las primeras partidas conservaremos el historial mínimo necesario para poder construir estadísticas futuras.

Ejemplos de estadísticas derivables:

* partidas jugadas;
* rondas jugadas;
* victorias por jugador;
* rendimiento como impostor;
* veces que un impostor fue descubierto;
* veces que un impostor acertó la palabra;
* victorias del grupo vs victorias del impostor;
* rachas;
* puntuaciones acumuladas u otras estadísticas derivables.

## Alcance

Estos ejemplos son posibilidades futuras, no requisitos de UI actuales.

No agregaremos datos históricos adicionales si no son necesarios para el conjunto mínimo definido.

---

# Alcance inicial

## Incluido

* grupo persistente;
* identidad sencilla;
* administración básica;
* banco persistente de palabras;
* agregar palabras;
* validación automática;
* crear sala;
* unirse a sala;
* múltiples teléfonos;
* un impostor por ronda;
* selección balanceada del impostor;
* distribución privada de roles;
* conversación presencial;
* votación secreta;
* resolución de empates;
* intento final del impostor;
* puntuación;
* marcador de tanda;
* historial mínimo de tandas y rondas finalizadas.

## No incluido inicialmente

* registro por email;
* contraseña;
* perfiles públicos;
* ranking global;
* matchmaking;
* chat;
* contenido público;
* moderación avanzada;
* compras;
* anuncios;
* interfaz de estadísticas;
* estadísticas históricas complejas;
* inteligencia artificial durante las partidas.

---

# Decisiones pendientes

Room + Lobby queda cerrado para Incremento 4. Permanecen abiertas únicamente cuestiones posteriores o generales:

* experiencia de primera instalación;
* cómo se crea inicialmente un grupo;
* cómo se invita a otro dispositivo al grupo;
* comportamiento cuando un jugador pierde conexión;
* entrada o salida de jugadores durante una tanda;

Estas decisiones no modifican el contrato de Room + Lobby ni las reglas centrales de la primera variante jugable.
