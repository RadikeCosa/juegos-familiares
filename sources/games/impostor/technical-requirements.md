# Impostor — Requisitos técnicos

## Propósito

Estos requisitos preservan las garantías técnicas del juego productivo. No
repiten sus reglas ni su recorrido completo. La implementación de referencia es
la baseline productiva indicada por `sources/project-status.md`; este documento
no crea comportamiento por sí solo.

## Identidad y autorización

- Toda operación protegida parte de una sesión válida de Supabase Auth.
- El backend deriva `Player`, Group, Room y actor desde `auth.uid()` y estado
  remoto autorizado.
- IDs, roles, ownership, permisos o resultados enviados por el cliente no son
  autoridad.
- `LocalIdentity` es una pista de UX; no prueba identidad ni pertenencia y no
  recupera por sí sola un Player si falta la sesión autenticada.
- Renderizar una ruta no debe crear Auth anónima. La identidad se crea o
  reutiliza sólo ante una intención explícita de producto.
- La creación de Group está restringida al admin de plataforma. Un usuario
  común entra mediante invitación.
- Las operaciones de Room validan pertenencia al Group y a la Room. Las acciones
  de gameplay validan además pertenencia al roster congelado de SessionPlayers.
- El administrador del Group y el host de una Room son capacidades distintas.
  Sólo el host vigente ejecuta las transiciones reservadas a ese rol.

RLS, grants y RPCs deben impedir lecturas o mutaciones directas que salteen estas
reglas. No se usa `service_role` en el frontend.

## Privacidad

- La palabra secreta no se entrega al impostor.
- La identidad del impostor no se entrega a otros participantes antes de la
  fase donde pasa a ser resultado compartido.
- Durante el intento final nadie recibe la palabra; se revela sólo después de
  resolverlo.
- El read model privado deriva la vista del caller en el servidor. Ocultar texto
  con React, CSS o un estado local no es una barrera de privacidad.
- Cada participante puede reconstruir su propio voto aceptado. Los votos
  individuales ajenos, quién votó a quién y los conteos parciales permanecen
  privados.
- Realtime, Presence, logs y mensajes de error no transportan secretos de
  gameplay ni identificadores sensibles innecesarios.
- El banco no es explorable por completo. Cada integrante ve el total y sus
  propios aportes; ser administrador no amplía esa lectura.
- El historial mínimo no conserva votos individuales ni necesita conservar el
  texto completo de las palabras jugadas.

## Autoridad del juego

El servidor o la base de datos decide y persiste:

- el roster al iniciar la tanda;
- la palabra, el impostor y el primer jugador de cada ronda;
- el estado de Room y GameSession y todas sus transiciones;
- aceptación, quorum y resolución de ambas votaciones;
- elegibilidad y comparación del intento final;
- ganador de ronda, scoring y permisos del marcador;
- ganador o ganadores finales e historial mínimo;
- host actual y, en lobby, su sucesión por staleness.

El cliente sólo envía intenciones acotadas, como un código, un target de voto o
el texto del intento. Después de una respuesta, un error ambiguo o una
notificación, vuelve a leer el resultado autorizado.

## Consistencia y concurrencia

- Las mutaciones sensibles bloquean y validan el estado previo dentro de la
  misma transacción que produce sus efectos.
- Una Room tiene como máximo una GameSession y un Player como máximo una Room
  activa mediante restricciones persistidas.
- Iniciar la tanda crea GameSession, roster y primera Round, y cambia la Room a
  `playing`, sin dejar una sesión durable parcialmente preparada.
- El roster de SessionPlayers no cambia por Presence, desconexión o liveness
  posterior al inicio.
- Cada voto es único por `(Round, voting round, voter)`; voter y target deben
  pertenecer al roster y no pueden coincidir.
- Los candidatos de segunda vuelta se derivan de los resultados persistidos de
  la primera, evitando dos fuentes de verdad.
- El intento final sólo puede resolverse una vez y sólo para el impostor.
- La puntuación se aplica exactamente una vez por Round.
- Cada ronda usa el siguiente número y una palabra normalizada no usada en la
  GameSession.
- El cierre crea un solo historial por GameSession y un solo resumen por Round,
  calcula ganadores y cierra la Room en una operación consistente.

El cliente evita envíos paralelos, pero las garantías no dependen de esa
protección visual.

## Idempotencia, retries y respuestas perdidas

Las operaciones expuestas a doble tap, retry o pérdida de respuesta distinguen
un primer efecto de un resultado ya aplicado cuando su contrato lo requiere:

- crear o unirse no duplica una participación ni el slot activo;
- iniciar una tanda o ronda no crea duplicados;
- avanzar a una fase ya alcanzada devuelve el estado compatible;
- reenviar el mismo voto aceptado no crea otro voto ni permite cambiar el
  target;
- reenviar el intento final ya resuelto devuelve el resultado persistido;
- scoring y cierre terminal no se aplican dos veces.

Ante una respuesta perdida, el cliente no deduce éxito o fracaso desde memoria
local: ejecuta un authoritative refetch y presenta el estado vigente.

## Realtime, Presence y liveness

- Realtime señala cambios o invalida una vista; no decide estado ni reemplaza
  una lectura autorizada.
- En lobby, Postgres Changes provoca una nueva lectura de la Room.
- El gameplay se reconstruye mediante `get_my_game_state()` y polling lento
  donde no existe otra invalidación. El intervalo actual es de 3 segundos.
- Los secretos nunca viajan en payloads públicos de Realtime o Broadcast.
- Presence representa disponibilidad efímera por conexión. Varias conexiones
  del mismo Player cuentan como un solo participante lógico.
- `RoomParticipant` representa pertenencia persistida. `SessionPlayer`
  representa membership autoritativa de la tanda. Ninguno se reemplaza con
  Presence.
- `last_seen_at` es evidencia remota de liveness, no estado visual de conexión.
  El lobby usa actualmente heartbeat y recheck de 30 segundos, con umbral stale
  de 90 segundos.
- Una pérdida de Presence no reasigna host. La sucesión exige que el backend
  compruebe staleness y elija determinísticamente entre participantes activos.
- La sucesión automática implementada se limita a Rooms en `lobby`. No existe
  una política automática equivalente durante `playing`.

## Reconstrucción y recovery

La regla central es:

```text
interrupción o duda
→ authoritative refetch
→ current valid Room/GameState
→ reemplazo de estado local stale
```

La aplicación ejecuta reconciliación al menos después de bootstrap, refresh,
retorno a foreground, evento online, señal Realtime, polling que detecta drift y
retry manual.

Debe reconstruir:

- ausencia, lobby o Room en juego y host vigente;
- fase y Round actuales;
- vista privada autorizada de esa Round;
- voto propio ya aceptado y candidatos vigentes;
- permiso del impostor para el intento final;
- resultado, marcador y disponibilidad de nueva ronda;
- estado `finished` desde historial aunque la Room ya esté cerrada.

El reveal abierto, modales, feedback, selección de voto no enviada e intento no
enviado son efímeros y pueden perderse. Después de refresh o reconciliación la
información privada vuelve oculta. Si cambió la Round, no se conserva ni muestra
un secreto anterior.

Si otro dispositivo avanzó, el estado remoto vigente reemplaza la fase local.
Un voto ya registrado no vuelve a ofrecerse como pendiente. Una tanda terminada
no se reconstruye como Room activa.

## Conectividad y acciones sensibles

- No existe garantía de jugar una tanda compartida multi-dispositivo sin
  conexión.
- Al detectar offline o una reconciliación incompleta, la UI bloquea acciones
  sensibles y comunica `offline`, `reconnecting` o un error recuperable.
- Estado privado o compartido cacheado no se presenta como autoridad vigente.
- Volver online exige reconciliar antes de reanudar acciones.
- Un SessionPlayer desconectado sigue perteneciendo al roster y contando para
  el quorum de voto. No hay timeout, expulsión ni reducción automática a quienes
  estén conectados.
- La pérdida del host durante `playing` no tiene sucesión automática; puede
  bloquear transiciones reservadas al host hasta que vuelva. Definir otra
  política es una decisión de producto posterior, no recovery implícito.

## Límite PWA de Impostor

La estrategia general de PWA pertenece a la arquitectura de plataforma. Para
Impostor se preservan estas garantías:

- instalar la PWA es opcional;
- `PWA cache != game-state authority`;
- el service worker sólo usa cache-first para recursos estáticos seguros del
  mismo origen;
- Auth/session state, Player/Group remoto, Room, GameSession, Round, host,
  Presence/liveness, role, word, votes y live scoreboard no son autoridad
  cacheable;
- las llamadas Supabase, `get_my_active_room()`, `get_my_game_state()` y
  cualquier RPC o mutación Supabase no se sirven como estado de juego cacheado;
- el ciclo de actualización evita una recarga automática durante una ruta
  crítica de partida.

Una shell estática disponible no implica gameplay offline ni permiso para usar
datos sensibles stale.

## Persistencia e historial

Group, Player y GroupWord sobreviven entre partidas. Room, RoomParticipant,
GameSession, SessionPlayer, Round y RoundVote son estado operativo persistido
para coordinación, autorización y recovery. Su carácter temporal de producto no
autoriza borrado inseguro ni los convierte en estado sólo local.

Al terminar se conservan resúmenes mínimos de tanda y ronda suficientes para
reconstruir el resultado final y habilitar estadísticas futuras sin retener
votos individuales o palabras completas innecesarias.

## Límites de validación

Los contratos de rutas, RPCs, migrations, read models y recovery cuentan con
pruebas automatizadas y validaciones locales. La experiencia productiva fue
usada repetidamente en juego real. Esto no equivale a haber cubierto
exhaustivamente toda combinación de teléfono físico, navegador, PWA instalada,
background prolongado, múltiples pestañas y degradación de red.

Una validación física pendiente se reporta como límite de evidencia, no como una
funcionalidad ausente ni como autorización para cambiar el contrato.
