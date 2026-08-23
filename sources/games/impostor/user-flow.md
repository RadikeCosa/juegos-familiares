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
Futuro: sala / lobby
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

Visitar `/impostor`, `/impostor/join/[code]` o `/impostor/grupo` no debe crear Auth automáticamente. La identidad anónima se crea o reutiliza cuando la persona confirma una intención de producto, como crear grupo o unirse.

---

# Inicio habitual

Para un jugador ya reconocido:

> Hola, Ramiro

En el Incremento 2, la pantalla muestra:

> Tu grupo

> Familia

> Ver grupo

La acción principal es entrar al grupo.

## Vista de grupo

Flujo actual:

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

La pantalla futura permite agregar una palabra o frase por vez, ver la cantidad total disponible, consultar aportes propios y borrar aportes propios.

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

1. se fija el conjunto de participantes de la tanda;
2. se inicializa el marcador;
3. se prepara la primera ronda.

---

# Preparación de ronda

El sistema:

1. selecciona una palabra;
2. selecciona un impostor;
3. distribuye la información correspondiente a cada dispositivo.

---

# Información del jugador

## Jugador normal

La pantalla muestra claramente:

> Tu palabra es

# MILANESA

La interfaz debe evitar que otra persona pueda verla accidentalmente antes de que el jugador esté preparado.

---

## Impostor

La pantalla muestra:

# SOS EL IMPOSTOR

No muestra la palabra secreta.

---

# Confirmación individual

Cada jugador confirma que vio su información.

Ejemplo:

`Estoy listo`

La aplicación espera a que todos estén preparados.

---

# Todos listos

Cuando todos confirmaron:

> Todos están listos

> Empieza la ronda

A partir de este momento el teléfono deja de ser protagonista.

---

# Conversación presencial

Primero se realiza una vuelta en la que todos dan una pista.

Después puede existir conversación libre.

La aplicación puede mostrar únicamente un estado discreto:

> Ronda en juego

Para el host:

`Ir a votación`

Para los demás:

> Cuando estén listos, el host iniciará la votación.

No existe inicialmente temporizador obligatorio.

---

# Iniciar votación

Cuando el grupo lo decide, el host toca:

`Ir a votación`

Todos los dispositivos cambian de estado.

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

Después:

`Votar`

---

# Voto enviado

Después de votar:

> Voto registrado

> Esperando al resto...

No se muestran resultados parciales.

---

# Revelación

Cuando todos votaron, todos reciben el resultado.

Ejemplo:

> Resultado

> Camila — 3 votos
> Pedro — 1 voto

---

# Votación incorrecta

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

> Decí cuál creés que era la palabra.

Cuando responde verbalmente, el host toca:

`Comprobar palabra`

---

# Revelar palabra

Todos los dispositivos muestran:

> La palabra era

# MILANESA

El host registra:

`La adivinó`

o

`No la adivinó`

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

`Terminar partida`

---

# Nueva ronda

Si el host selecciona `Nueva ronda`:

1. se conserva el marcador;
2. se mantiene el mismo grupo de jugadores;
3. se evita reutilizar palabras de la tanda;
4. se considera el historial de impostores;
5. si hay una palabra disponible no utilizada en la tanda, se prepara automáticamente una nueva ronda.

Si no quedan palabras disponibles, la aplicación permite agregar nuevas palabras o terminar la tanda.

El flujo vuelve a:

`Información privada`

---

# Empate

Si la primera votación termina empatada:

> Empate

> Ramiro y Camila recibieron 2 votos.

La aplicación indica:

> Hablen un poco más y vuelvan a votar.

Cuando el host continúa, los dispositivos muestran una segunda votación únicamente entre las personas empatadas.

---

# Finalizar tanda

Cuando el host selecciona:

`Terminar partida`

se muestra:

> Resultado final

# Victoria gana

> 4 puntos

y debajo la clasificación completa.

La tanda termina.

El banco de palabras y el grupo permanecen disponibles para futuras partidas.

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

# Flujos que todavía requieren diseño

Antes de implementar debemos resolver con mayor precisión:

* primera instalación de la PWA;
* creación inicial de grupo;
* invitación al grupo;
* mecanismo para compartir una sala;
* reconexión si un dispositivo pierde internet;
* salida o incorporación de un jugador durante una tanda;
* experiencia de reasignación del host;
* capacidades de instalación y cache de la PWA.

Estas cuestiones pertenecen principalmente al diseño de experiencia y arquitectura, no a las reglas centrales del juego.
