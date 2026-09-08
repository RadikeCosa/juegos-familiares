# Impostor — Recorrido del usuario

## Propósito

Este contrato describe las rutas, acciones, pantallas, feedback y recovery
visibles de la experiencia productiva. Las reglas pertenecen a
`game-rules.md`; los guards y estados durables, a `game-state.md`.

## Superficies actuales

### Plataforma

- `/`: inicio de Juegos Familiares y acceso a Impostor o al contexto existente.
- `/grupo`: superficie canónica del Group, con integrantes e invitación para el
  administrador.

### Impostor

- `/impostor`: presentación del juego y entrada principal para crear, unirse o
  volver a una Room.
- `/impostor/grupo`: contexto secundario del Group dentro de Impostor, también
  con acceso a Room y al banco de palabras.
- `/impostor/grupo/palabras`: cantidad disponible, alta y gestión de los
  aportes propios.
- `/impostor/join/[code]`: invitación directa para unirse a un Group.
- `/impostor/sala/[code]`: entrada directa, lobby y todas las fases de una
  tanda.

No existe una ruta separada para “join Room”: el enlace compartido abre la
misma ruta `/impostor/sala/[code]`.

## Identidad y onboarding

La aplicación no usa un registro tradicional con email y contraseña. Una
sesión de Supabase Auth anónima sustenta la identidad liviana cuando una acción
de producto la necesita.

Renderizar `/`, `/impostor`, `/impostor/grupo`, el banco de palabras o una
invitación no crea una identidad por sí solo. Sin contexto reconocido, la UI
ofrece acciones explícitas:

- un admin de plataforma puede iniciar la creación de un Group;
- un usuario común entra a un Group mediante código o enlace de invitación;
- una visita directa a una Room sin Auth ofrece `Continuar para unirme` antes
  de crear identidad o intentar el join.

Si existe Auth pero no un Player asociado, la experiencia guía al flujo de
Group en vez de inventar pertenencia desde datos locales.

## Inicio habitual

Un Player reconocido ve su contexto y, si corresponde, una Room activa:

- `Volver a la sala` cuando está en lobby;
- `Volver a la partida` cuando la tanda está en curso;
- acciones para crear o unirse cuando no existe Room activa.

El administrador del Group puede compartir su invitación. El rol de
administrador no lo convierte en host de una Room.

## Entrada a una Room

### Crear

`Crear sala` ejecuta una única intención. Al completarse, navega a
`/impostor/sala/[code]`; mientras espera muestra `Creando sala...` y evita
envíos duplicados. La persona creadora aparece como host inicial.

### Unirse con código

`Unirme a una sala` reemplaza el bloque de acciones por un paso contextual:

- título `Ingresá el código de la sala`;
- ayuda para pedirlo a quien creó la Room;
- input de código;
- `Entrar a la sala`;
- `Volver`.

Entrar al formulario no se muestra como error. Si el intento falla, el mensaje
aparece dentro del mismo contexto y el input permanece disponible para corregir
y reintentar. `Volver` restaura las acciones iniciales.

### Unirse con enlace

El enlace compartido abre la Room directamente. Un Player elegible puede
confirmar el join; una Room inexistente, cerrada, de otro Group o incompatible
mantiene feedback contextual y no concede acceso.

## Lobby

La pantalla muestra código, participantes, host y disponibilidad visual. Se
puede compartir la Room. Un participante no-host puede salir; el host puede
cerrar el lobby. Si el host queda stale y existe otro participante activo, la
UI puede reflejar la sucesión decidida remotamente.

Sólo el host ve la acción para iniciar la tanda. El inicio requiere al menos
tres participantes activos y una palabra disponible. Los errores —por ejemplo,
falta de jugadores, palabras o pérdida del rol de host— se muestran sin asumir
que el estado local sigue siendo válido.

## Revelación privada

Al comenzar cada ronda, todos llegan a la misma superficie privada, oculta por
defecto. Un tap revela la palabra autorizada o `IMPOSTOR`; otro tap la oculta.
El contenido secreto no se renderiza mientras la superficie está cerrada.

El mismo patrón sigue disponible durante `role_reveal` y `discussion`. El reveal
es local, vuelve a ocultarse al cambiar de ronda o fase relevante y no funciona
como confirmación persistida. El grupo confirma presencialmente que está listo;
el host toca `Empezar ronda`.

## Discusión y primera votación

En discusión se muestra quién da la primera pista. La conversación continúa
cara a cara. Cuando el grupo está listo, el host usa `Ir a votación`.

Cada participante ve los candidatos permitidos y envía su voto. Después del
envío, la pantalla confirma que ya fue registrado y no permite reemplazarlo.
Mientras faltan votos no se muestran conteos ni elecciones ajenas.

Al completar la primera votación:

- un empate abre la pantalla de discusión de desempate;
- descubrir al impostor abre su intento final;
- acusar a otra persona abre el resultado de la ronda.

## Empate y segunda votación

La pantalla de empate muestra las personas empatadas y pide conversar otra vez.
El host usa `Ir a segunda votación`. Luego cada participante vota entre los
candidatos empatados permitidos y ve la misma confirmación de voto registrado.

No hay una tercera votación. La resolución lleva al intento final únicamente si
el impostor quedó como único más votado; en cualquier otro caso muestra el
resultado de ronda.

## Intento final y resultado

En `impostor_guess` todos ven quién era el impostor, pero no la palabra. El
impostor ve un input y `Enviar intento`; los demás ven que está realizando su
intento final. El formulario exige texto y evita submits paralelos.

En `round_result` se muestra el bando ganador, la persona impostora, la palabra
y, cuando existió, el intento y si fue correcto. La UI explica si el resultado
surgió de una acusación incorrecta, un desempate no concluyente o el intento
final.

## Marcador, siguiente ronda y cierre

Después del resultado se aplica el scoring remoto y aparece el marcador
ordenado. Todos ven los puntajes; sólo el host recibe las acciones habilitadas:

- `Nueva ronda`, cuando queda una palabra no usada;
- `Terminar tanda`.

La nueva ronda vuelve a la revelación privada con el contenido cerrado. Si no
quedan palabras, la UI explica el bloqueo y ofrece terminar la tanda o volver al
banco para agregar contenido.

Al terminar, la pantalla final muestra ganador o ganadores, clasificación,
puntajes y cantidad de rondas. `Volver al grupo` sale de la Room cerrada; para
otra tanda se crea una Room nueva.

## Recovery visible

Cuando el navegador detecta pérdida de red muestra estado offline y pausa las
acciones sensibles. Durante la reconciliación muestra que está reconectando; si
la reconstrucción falla ofrece reintentar.

Refresh, retorno a foreground, evento online, invalidación Realtime y polling
de gameplay provocan una nueva lectura del estado autorizado. La pantalla pasa
a la fase remota vigente, aunque otro dispositivo haya avanzado mientras estaba
fuera.

La UI reconstruye, entre otros:

- Room y host actuales;
- rol y palabra permitidos de la ronda vigente, inicialmente ocultos;
- voto propio ya registrado;
- elegibilidad para el intento final;
- marcador y nueva ronda;
- resultado final de una tanda terminada, aun con la Room ya cerrada.

La selección de voto o el intento escrito pero no enviado, un modal y el reveal
abierto son estado local efímero y pueden perderse. Una respuesta perdida no
habilita a repetir una acción ya aceptada: la relectura muestra el resultado
autoritativo.

La experiencia está implementada y cubierta por pruebas automatizadas, pero no
se considera exhaustivamente validada para toda combinación de dispositivo
físico, instalación, suspensión y condiciones de red.
