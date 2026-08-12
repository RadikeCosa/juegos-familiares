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

La aplicación necesita establecer una identidad sencilla.

Ejemplo:

> ¿Cómo te llamás?

`Ramiro`

`Continuar`

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

Una vez asociado, el dispositivo recuerda:

* jugador;
* grupo.

Las visitas siguientes deberían evitar repetir esa configuración.

---

# Inicio habitual

Para un jugador ya reconocido:

> Hola, Ramiro

Acciones principales:

### Crear sala

Comienza una nueva sesión de juego.

### Unirse a sala

Permite entrar a una sala creada por otro integrante.

### Agregar palabras

Permite alimentar el banco del grupo en cualquier momento.

---

# Agregar palabra

Esta acción debe funcionar aunque no exista ninguna partida.

Flujo:

```text
Inicio
  ↓
Agregar palabras
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

---

# Error por duplicado

Si la palabra ya existe:

> Esa palabra ya está en el banco.

No es necesario revelar quién la agregó.

---

# Crear sala

Un jugador selecciona:

`Crear sala`

La aplicación crea una sala temporal y convierte a ese jugador en host.

El host llega al lobby.

---

# Compartir sala

El lobby debe ofrecer una forma sencilla para que otros integrantes entren.

La mecánica exacta —código, enlace, QR o combinación— se decidirá durante el diseño técnico y UX.

El objetivo es que incorporarse requiera pocos pasos.

---

# Unirse a sala

Un jugador selecciona:

`Unirse a sala`

Identifica la sala y entra al lobby.

Como su identidad ya está guardada, no debería volver a escribir su nick en cada partida.

---

# Lobby

Todos los participantes ven quién está presente.

Ejemplo:

> Sala

* Ramiro ✓
* Pedro ✓
* Camila ✓
* Victoria ✓

> 64 palabras disponibles

El host dispone de:

`Iniciar partida`

Los demás jugadores ven un estado de espera.

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

* ver banco completo;
* buscar;
* eliminar palabras.

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
