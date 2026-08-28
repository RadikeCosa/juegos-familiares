# Impostor — User Flow

## Propósito

Este documento describe cómo una persona utiliza Impostor desde que abre la aplicación hasta que termina una tanda.

Impostor es accesible desde la portada de Juegos Familiares.

Este flujo se concentra en lo que ocurre una vez que la persona entra al juego Impostor.

El flujo parte de tres principios:

1. cada participante utiliza su propio teléfono;
2. la aplicación interviene cuando la tecnología aporta valor;
3. la conversación principal ocurre presencialmente.

---

# Flujo general

```text
Abrir aplicación
      ↓
Portada Juegos Familiares
      ↓
Elegir Impostor
      ↓
Inicio
      ↓
┌────────────────┬──────────────────┐
│ Crear un grupo │ Unirme a un grupo│
└────────────────┴──────────────────┘
      ↓
Grupo reconocido
      ↓
Ver grupo
      ↓
Integrantes
      ↓
Invitar personas (solo admin)
      ↓
Sala / lobby
      ↓
┌───────────────┬────────────────┬────────────────┐
│ Crear sala    │ Unirse a sala  │ Agregar palabra│
└───────────────┴────────────────┴────────────────┘
      ↓
Sala / Lobby
      ↓
Jugadores presentes
      ↓
Iniciar tanda
      ↓
Preparar ronda
      ↓
Información privada
      ↓
Conversación presencial
      ↓
Votación
      ↓
Resultado
      ↓
Marcador
      ↓
Nueva ronda / Terminar
```

---

# Primera experiencia

## Primer acceso

La primera decisión para una persona nueva es:

```text
[ Crear un grupo ]
[ Unirme a un grupo ]
```

El nickname se solicita dentro del flujo elegido.

El objetivo es evitar una experiencia de registro tradicional.

No se requieren inicialmente:

* email;
* contraseña;
* perfil público.

---

# Pertenencia a un grupo

Si el dispositivo todavía no pertenece a un grupo, debe poder:

* crear grupo;
* unirse a un grupo existente.

### Crear grupo

Flujo mínimo:

```text
Crear grupo
↓
Tu nombre
Nombre del grupo
↓
Crear grupo
```

### Unirse a grupo por código

Flujo mínimo:

```text
Unirme
↓
Ingresar código
↓
Resolver grupo
↓
Mostrar nombre del grupo
↓
Pedir nickname
```

### Unirse a grupo por enlace

Flujo mínimo:

```text
Abrir enlace
↓
Resolver grupo
↓
Mostrar nombre del grupo
↓
Pedir nickname
```

Si el enlace es válido, no se vuelve a pedir el código.

Una vez asociado, el dispositivo recuerda:

* jugador;
* grupo.

Las visitas siguientes deberían evitar repetir esa configuración.

Visitar `/`, `/impostor`, `/impostor/join/[code]` o `/impostor/grupo` no debe crear Auth automáticamente. La identidad anónima se crea o reutiliza cuando la persona confirma una intención de producto, como crear grupo o unirse.

---

# Inicio habitual

Desde A.1, para un jugador ya reconocido la portada `/` muestra:

> Hola, Ramiro

> Tu grupo

> Familia

> Ver grupo

La misma persona puede entrar a Impostor desde la lista de juegos. Durante A.1,
`/impostor` conserva también la señal de contexto reconocida; su simplificación
definitiva queda para un incremento posterior.

La acción principal de contexto es entrar al grupo.

## Vista de grupo

Flujo actual para acceder al grupo desde la portada:

```text
/
↓
Ver grupo
↓
/impostor/grupo
```

Flujo heredado todavía compatible:

```text
/impostor
↓
Ver grupo
↓
/impostor/grupo
```

La vista de grupo muestra:

```text
Familia

Integrantes

Ramiro · Admin
Pedro
Camila

Banco de palabras
12 disponibles
Tus aportes: 3

[ Agregar palabras ]
```

El administrador ve:

```text
[ Invitar personas ]
```

Un jugador común ve los integrantes, pero no ve acciones administrativas ni código/enlace de invitación.

Refrescar directamente `/impostor/grupo` debe recuperar el contexto mediante sesión Auth, `Player` y `Group`; no depende de haber navegado antes desde `/impostor`.

Si no hay sesión, la vista no crea Auth, no muestra un grupo ajeno y ofrece una salida clara hacia Impostor.

Acciones disponibles desde el cierre del Incremento 4:

### Sala activa

Si el jugador no tiene una Room activa, la vista de grupo ofrece:

```text
Crear sala
Unirme a una sala
```

Si el jugador tiene una Room activa en `lobby` o `playing`, la vista de grupo muestra:

```text
Sala activa
Volver a la sala
```

`Volver a la sala` aplica tanto a host como guest y reconstruye la Room activa autoritativamente.

Cuando una Room queda `closed`, deja de considerarse activa y vuelven a mostrarse:

```text
Crear sala
Unirme a una sala
```

### Crear sala

Crea una Room en estado `lobby`. Cualquier integrante puede hacerlo; no requiere ser administrador. Si ya pertenece a una Room activa, recupera esa Room.

### Unirse a sala

Permite entrar a una Room `lobby` del mismo Group mediante código o enlace.

### Agregar palabras

Permite alimentar el banco del grupo en cualquier momento.

Ruta prevista:

```text
/impostor/grupo/palabras
```

---

# Agregar palabra

Esta acción debe funcionar aunque no exista ninguna partida.

Flujo:

```text
Inicio
  ↓
Agregar palabras
  ↓
/impostor/grupo/palabras
  ↓
Campo de texto
  ↓
Agregar
  ↓
Validación
  ↓
Palabra guardada
```

Ejemplo:

> Agregar palabra

`Chocotorta`

`Agregar`

Después:

> ✓ Palabra agregada

> 64 palabras disponibles

El jugador puede continuar agregando más palabras o volver al inicio.

La pantalla permite agregar una palabra o frase por vez, ver la cantidad total disponible, consultar aportes propios y borrar aportes propios.

---

# Error por duplicado

Si la palabra ya existe:

> Esa palabra ya está en el banco.

No es necesario revelar quién la agregó.

---

# Crear sala

Un jugador selecciona:

`Crear sala`

La aplicación crea una Room persistida en estado `lobby`, convierte a ese jugador en host y lo agrega como RoomParticipant. La creación es idempotente si ya existe una Room activa para ese Player.

El host llega al lobby.

Si el jugador ya pertenece a una Room activa, la aplicación recupera esa Room en lugar de crear otra.

---

# Compartir sala

El lobby muestra un código opaco de 8 caracteres y permite compartir el enlace equivalente:

```text
/impostor/sala/[code]
```

QR queda fuera de Incremento 4.

---

# Unirse a sala

Un jugador selecciona:

`Unirse a sala`

Identifica la Room mediante código o enlace. El backend valida que el Player y la Room pertenecen al mismo Group. Conocer el código no reemplaza autorización.

Si el Player ya participa, el join devuelve la misma participación sin duplicarla.

Como su identidad ya está guardada, no debería volver a escribir su nick en cada partida.

Visitar directamente un link de sala no equivale a intención de unirse. Si no hay Auth, la pantalla no crea una identidad por renderizar. Si hay Auth pero no Player, no auto-une al usuario a ningún Group.

Si el Player ya pertenece a esa Room y abre `/impostor/sala/[code]`, la aplicación reconstruye el lobby autoritativamente desde el contexto remoto.

Si el Player abre un enlace de sala que ya no coincide con su Room activa, la aplicación no debe presentar una sala viva falsa. Debe mostrar el estado actual: volver a la Room activa real si existe, mostrar que no hay sala activa si esa Room cerró, o permitir volver al grupo.

---

# Lobby

Todos los participantes ven el estado persistido del lobby, no la conexión actual del dispositivo.

Ejemplo:

> Sala

* Ramiro · Host
* Pedro
* Victoria

> 3 jugadores

El lobby muestra también el código/enlace para compartir y acciones de salida/cierre según el participante.

En Incremento 4 todavía no muestra `Iniciar partida`, mínimo de jugadores, `2 de 3`, Presence, roles, palabra, impostor ni marcador.

Un participante no-host puede salir. El host puede cerrar la Room. Si el host usa la acción explícita de abandono/cierre vigente, la Room se cierra. Eso no se confunde con sucesión por desconexión/staleness.

Cuando un no-host elige `Salir de la sala`, deja de pertenecer a la Room y vuelve al contexto de Group. La Room sigue en `lobby` para el host y los demás participantes.

Cuando el host elige `Cerrar sala`, la Room pasa a `closed`, deja de ser activa y los participantes que estén mirando el lobby vuelven al contexto de Group tras la sincronización autoritativa.

## Lobby con Presence

En Incremento 5.1, el lobby agrega estado discreto de conexión:

```text
Ramiro · Host · conectado
Pedro · conectado
Victoria · desconectada
```

Este estado visual viene de Presence y representa disponibilidad efímera. No cambia por sí solo la pertenencia a la Room.

Si una persona bloquea el teléfono, cambia de app o pierde conexión brevemente, puede aparecer como desconectada sin abandonar la sala.

La interfaz no muestra heartbeat, `last_seen_at`, tiempos técnicos ni métricas de conexión.

En 5.1 y 5.2, si el host deja de estar disponible, el lobby puede indicarlo de forma no bloqueante, pero no reasigna host.

5.2 agregó liveness autoritativo mínimo sin mostrarlo en la interfaz. El cliente mantiene esa señal con heartbeat cada 30 segundos mientras el lobby está activo y con refresh al volver a foreground. Un teléfono en background, bloqueado o con timers suspendidos no se considera abandono por ese solo hecho.

5.3 agregó sucesión autoritativa de host. Si después de validar staleness la autoridad cambia el host, todos observan el cambio al releer el lobby:

```text
Camila ahora es host
```

El aviso debe ser breve y no bloquear el uso del lobby.

Si el host aparece `desconectado` en Presence pero su `last_seen_at` sigue active, no hay sucesión. Presence puede mostrar disponibilidad efímera, pero no decide el host.

Si el host está stale y no hay otro participante active, no hay cambio: la Room sigue `lobby`, el host actual permanece y no se cierra automáticamente.

Si el host original vuelve después de haber sido reemplazado, aparece como participante normal.

---

# Inicio de tanda

Cuando el host inicia:

1. la autoridad valida que quien llama es el host actual de la Room;
2. se fija el conjunto de participantes activos de la tanda;
3. la Room pasa de `lobby` a `playing`;
4. se crea la GameSession de esa Room;
5. se prepara la primera ronda.

Desde ese momento no se admiten nuevos ingresos a la Room.

El creador original de la Room no recupera autoridad si ya no es host. El administrador del Group tampoco puede iniciar la tanda por ser administrador.

---

# Preparación de ronda

El sistema:

1. selecciona una palabra;
2. selecciona un impostor;
3. crea la ronda con la palabra usada y el impostor;
4. permite que cada dispositivo recupere solamente su vista privada.

---

# Información del jugador

Antes de revelar el contenido privado, la pantalla muestra:

```text
Tu rol está listo
Ver mi rol
```

Ese tap es local: no persiste confirmación, no cambia `GameSession` y no equivale a `roleAcknowledged`.

## Jugador normal

La pantalla muestra claramente:

> Tu palabra es

# MILANESA

La interfaz debe evitar que otra persona pueda verla accidentalmente antes de que el jugador esté preparado.

---

## Impostor

La pantalla muestra:

# Sos el impostor

No muestra la palabra secreta.

---

# Coordinación presencial

La confirmación persistida de que cada jugador vio su información no forma parte del MVP.

No se persiste:

```text
roleAcknowledged
role_acknowledged_at
allRolesSeen
```

El grupo coordina verbalmente que todos estén listos. En 6.5, refrescar la pantalla vuelve a ocultar visualmente el rol y reconstruye la vista privada desde servidor.

---

# Empezar ronda

Cuando el grupo confirmó presencialmente que todos vieron su información, el host actual selecciona:

`Empezar ronda`

La fase pasa a:

```text
discussion
```

A partir de este momento el teléfono deja de ser protagonista.

---

# Conversación presencial

Primero se realiza una vuelta en la que todos dan una pista.

Después puede existir conversación libre.

La aplicación puede mostrar únicamente un estado discreto:

> Ronda en juego

Los jugadores pueden volver a consultar localmente su información privada mediante una acción explícita:

```text
Ver mi rol
```

La acción previa al reveal es la misma para todos los jugadores; no depende de si la vista privada contiene rol de impostor o palabra.

La información queda oculta por defecto para reducir exposición física. Este reveal local no se persiste.

En Incremento 7 no se muestra un botón funcional ni falso de votación. La acción del host `Ir a votación` pertenece al Incremento 8.

No existe inicialmente temporizador obligatorio.

Al cierre técnico del Incremento 7, el flujo implementado termina en esta conversación presencial con reveal/hide privado local.

---

# Incremento 8: iniciar primera votación

Cuando el grupo lo decide, el host toca:

`Ir a votación`

Todos los dispositivos cambian a `voting_first` mediante polling de `get_my_game_state()`.

Solo el host actual de la Room puede iniciar esta transición. El administrador del Group y el creador original no tienen permiso especial si no son el host actual.

---

# Pantalla de votación

Cada participante ve:

> ¿Quién es el impostor?

Lista de jugadores elegibles.

Ejemplo para Ramiro:

* Pedro
* Camila
* Victoria

Ramiro no aparece como opción porque nadie puede votarse a sí mismo.

La lista sale del roster congelado de `SessionPlayers`, no de Presence ni de quién aparece conectado. El impostor también vota. El host también vota y no tiene voto especial.

Después:

`Votar`

---

# Voto enviado

Después de votar:

> Voto registrado

> Esperando al resto...

No se muestran resultados parciales.

El voto no se puede editar. Si la respuesta de red se pierde, la pantalla se recupera al releer el estado y mostrar que el voto propio ya quedó registrado.

---

# Revelación

Cuando todos los `SessionPlayers` votaron, todos reciben el resultado agregado.

Ejemplo:

> Resultado

> Camila — 3 votos
> Pedro — 1 voto

---

# Votación incorrecta

Desde aquí el flujo entra en estados posteriores a la primera votación. Incremento 8 solo llegaba a `round_result`; Incremento 11.0 define documentalmente scoring, marcador y nueva ronda.

Si la persona más votada no era el impostor:

> El impostor era...

# Victoria

> Victoria gana la ronda

> +2 puntos

Después se muestra el marcador.

---

# Impostor descubierto

Si el grupo votó correctamente:

> Encontraron al impostor

# Camila

La palabra todavía permanece oculta.

En el dispositivo del impostor:

> Tenés una última oportunidad.

> ¿Cuál era la palabra?

El impostor escribe su intento y toca:

`Enviar intento`

En los demás dispositivos:

> El impostor está haciendo su intento final

---

# Revelar palabra

Después del intento, la ronda pasa a resultado.

Todos los dispositivos muestran:

> La palabra era

# MILANESA

También muestran el intento del impostor y el ganador:

> El impostor acertó

---

# Resultado final de ronda

## Si el impostor acertó

> Camila gana

> +2 puntos

## Si falló

> Gana el grupo

Los jugadores normales reciben:

`+1 punto`

---

# Marcador

Después de cada ronda:

> Marcador

1. Victoria — 4
2. Pedro — 3
3. Camila — 3
4. Ramiro — 2

Acciones del host:

`Nueva ronda`

`Terminar tanda`

El marcador muestra puntuación individual acumulada dentro de la tanda.

La ronda otorga puntos según el bando ganador:

* si gana el grupo, cada jugador normal recibe 1 punto;
* si gana el impostor, solo el impostor recibe 2 puntos.

Los demás jugadores ven el marcador y el estado de espera, pero no pueden iniciar la siguiente ronda.

---

# Nueva ronda

Si el host selecciona `Nueva ronda`:

1. se conserva el marcador;
2. se mantiene el mismo grupo de jugadores;
3. se evita reutilizar palabras de la tanda;
4. se considera el historial de impostores;
5. si hay una palabra disponible no utilizada en la tanda, se prepara automáticamente una nueva ronda.

Si no quedan palabras disponibles, la aplicación permite agregar nuevas palabras o terminar la tanda.

El teléfono del host no elige palabra, impostor ni número de ronda. La aplicación prepara esos datos desde el servidor.

El flujo vuelve a:

`Información privada`

En esa nueva información privada se preserva la misma regla de privacidad: el impostor no recibe la palabra antes del reveal permitido para su rol.

---

# Terminar tanda

Si el host selecciona `Terminar tanda` desde el marcador:

1. la tanda se marca como finalizada;
2. se calcula el o los ganadores finales por puntaje;
3. se conserva el historial mínimo de tanda y rondas;
4. la Room queda cerrada;
5. todos ven el resultado final.

Los demás jugadores no pueden terminar la tanda.

Si varios jugadores empatan en el mayor puntaje, todos se muestran como ganadores.

Para jugar otra tanda, el grupo vuelve al grupo y crea una nueva Room.

La pantalla final del MVP muestra resultado final, ganador único o ganadores empatados, clasificación completa, puntajes, cantidad de rondas y `Volver al grupo`.

No muestra detalle de rondas, votos individuales históricos ni palabras.

---

# Empate

Si la primera votación termina empatada:

> Empate

> Ramiro y Camila recibieron 2 votos.

La aplicación indica:

> Hablen un poco más y vuelvan a votar.

En Incremento 8, la aplicación llega hasta `tie_discussion`: muestra el resultado agregado y el empate. La acción del host para continuar a una segunda votación, la pantalla `voting_second` y su resolución pertenecen al Incremento 9.

En Incremento 9, todos ven además quiénes son los candidatos empatados. Esa lista se deriva de la primera votación registrada, no de una lista persistida aparte.

El host actual ve:

`Ir a segunda votación`

Cuando el host toca esa acción, todos los dispositivos pasan a:

```text
voting_second
```

La segunda votación usa la misma pantalla vertical de voto, pero solo muestra como candidatos votables a los jugadores empatados. Si el jugador actual también está empatado, no aparece como opción para sí mismo porque nadie puede votarse a sí mismo.

Todos los `SessionPlayers` votan otra vez. El impostor vota, el host vota sin voto especial y Presence/liveness no cambia quién debe votar.

Después de votar:

> Voto registrado

> Esperando al resto...

No se muestran resultados parciales.

Cuando votaron todos, la aplicación muestra el resultado agregado de la segunda votación, no el de la primera.

Si el impostor fue el único más votado:

> El impostor fue señalado

La ronda pasa al intento final del impostor, que pertenece al Incremento 10.

Si hubo un nuevo empate o fue más votado cualquier otro jugador:

> La ronda quedó resuelta

No hay tercera votación. La victoria conceptual es del impostor y, según el contrato de puntuación, el impostor recibe 2 puntos al cerrarse la ronda.

---

# Intento final del impostor

Cuando la ronda entra en:

```text
impostor_guess
```

Todos ven que el impostor fue señalado correctamente.

La palabra todavía no se muestra.

## Vista del impostor

El impostor ve un formulario mínimo:

> ¿Cuál era la palabra?

Acción:

```text
Enviar intento
```

Solo puede enviar un intento.

## Vista de los demás jugadores

Los demás jugadores ven una pantalla de espera:

> El impostor está haciendo su intento final

No pueden enviar un guess.

## Después del intento

La aplicación pasa a:

```text
round_result
```

Todos pueden ver:

* palabra secreta;
* intento enviado por el impostor;
* si acertó o falló;
* ganador conceptual.

Si acertó:

> Gana el impostor

Si falló:

> Gana el grupo

Scoring, marcador y nueva ronda quedaron cerrados en el Incremento 11. Historial y cierre final de tanda quedaron cerrados técnicamente en el Incremento 12.

---

# Finalizar tanda

Cuando el host selecciona:

`Terminar tanda`

se muestra:

> Resultado final

# Victoria gana

> 4 puntos

y debajo la clasificación completa.

La tanda termina.

El banco de palabras y el grupo permanecen disponibles para futuras tandas. Para jugar otra tanda, el grupo vuelve al grupo y crea una nueva Room.

---

# Administración del grupo

El administrador dispone de una sección secundaria de administración.

No debe competir visualmente con las acciones principales del juego.

Puede acceder a:

## Integrantes

* ver participantes;
* eliminar participante.

## Palabras

En el Incremento 3 no existe una sección administrativa para explorar el banco completo.

La pantalla futura de palabras permite a cualquier integrante:

* agregar una palabra o frase por vez;
* ver la cantidad total disponible;
* ver sus propios aportes;
* borrar sus propios aportes.

Las comprobaciones automáticas de duplicados y formato no requieren intervención manual.

---

# Principio de UX

La cantidad de interacción con la aplicación debería seguir aproximadamente esta curva:

```text
Preparación       ALTA
Distribución      ALTA
Conversación      MUY BAJA
Votación          ALTA
Resultado         ALTA
Nueva ronda       BAJA
```

La aplicación debe estar presente cuando coordina información entre dispositivos y hacerse discreta cuando la diversión depende de la conversación presencial.

---

# Estado de flujos

## Ya diseñados e implementados

Estos flujos ya están respaldados por el diseño y la implementación vigente:

* creación inicial de grupo;
* unión a grupo por código o enlace;
* vista de grupo con integrantes y contexto recuperable;
* compartir/copiar invitación de grupo para administrador de Group;
* creación de Room desde el grupo;
* unión a sala por código o enlace;
* compartir/copiar invitación de sala desde el lobby;
* salida de participante no-host y cierre de Room por host;
* sucesión autoritativa de host cuando la autoridad valida que el host está stale y existe un sucesor active.

## Contrato de reconexión para Incremento 13

Cuando una persona refresca, reabre la PWA, vuelve del bloqueo de pantalla, cambia de app y vuelve, pasa de offline a online o recupera una suscripción Realtime, la pantalla debe reconciliarse con el servidor.

El usuario debe ver el estado vigente de la partida, no el estado visual viejo del teléfono.

Ejemplos esperados:

* si estaba en `role_reveal`, al volver el reveal aparece oculto y puede ver nuevamente su rol/palabra vigente;
* si ya votó en `voting_first`, al volver ve `Voto registrado` y no vuelve a poder votar;
* si ya votó en `voting_second`, al volver ve su estado de espera y no se ofrecen votos duplicados;
* si el grupo avanzó de `discussion` a `voting_first`, al volver ve votación;
* si el grupo avanzó de votación a `scoreboard`, al volver ve marcador;
* si el host cambió por sucesión, al volver ve el host actual;
* si la Room terminó, al volver no queda en una sala viva falsa y, si participó en la tanda, ve `finished`;
* si el host original vuelve después de sucesión, vuelve como participante normal.

Puede perderse sin considerarse error:

* modal abierto;
* reveal visible;
* selección de voto no enviada;
* texto de intento final no enviado;
* feedback temporal.

La aplicación no promete jugar offline. Puede conservar el último estado compartido con un indicador de reconexión/offline, pero al recuperar conexión debe aceptar el estado autoritativo actual.

Incremento 13.2 implementa la UX mínima para ese intervalo: muestra "Sin conexión", "Reconectando..." o error reintentable en Room/gameplay, pausa acciones sensibles y no renderiza secretos privados stale mientras la reconciliación no haya terminado.

## Implementados pero pendientes de validación smoke específica

Estos flujos existen técnicamente, pero todavía requieren prueba real en teléfonos, sesiones independientes, pérdida de conexión, background/reconnect o concurrencia:

* comportamiento mobile/background de Presence y liveness según contrato 13.0;
* smoke manual focal de triggers de reconstrucción autoritativa implementados en 13.1;
* smoke manual focal de UX offline/reconnecting y retry implementada en 13.2;
* cadencia 30s/90s/30s de heartbeat, stale y evaluación de sucesión en condiciones reales;
* reasignación de host bajo pérdida de conexión, múltiples conexiones, refresh y carreras de clientes;
* continuidad de la tanda completa en dispositivos físicos durante el smoke manual general.

La reasignación de host no está pendiente como contrato ni como implementación central: 5.3 cerró la sucesión autoritativa. Lo pendiente corresponde al hardening y la validación mobile/concurrencia absorbidos por Incremento 13.

## Flujos todavía abiertos o futuros

Siguen pendientes dentro del roadmap o como decisiones explícitamente diferidas:

* primera instalación de la PWA;
* implementación de reconexión autoritativa 13.3–13.5;
* salida o incorporación de un jugador durante una tanda;
* capacidades de instalación y cache de la PWA.

Estas cuestiones pertenecen principalmente a Incrementos 13 a 15 y al diseño de experiencia/arquitectura pendiente, no a las reglas centrales ya implementadas del juego.
