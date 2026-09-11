# Diccionario — Estado conceptual del juego

## Propósito y autoridad

Este contrato describe estados, transiciones, actores, guards e invariantes
conceptuales para Diccionario. Todavía no define tablas, RPCs, rutas ni modelo
de lectura técnico.

Cuando se implemente, el cliente deberá enviar intenciones y el backend deberá
validar identidad, pertenencia, estado vigente, permisos y transiciones
sensibles. Una pantalla local o una señal de presencia no debe constituir
autoridad.

## Capas de estado

Diccionario necesita distinguir tres capas conceptuales:

- partida activa del Group;
- resolución presencial de esa partida;
- historial o Diccionario del grupo.

La partida activa contiene tres palabras y las definiciones de participantes.
La resolución consume esa partida congelada palabra por palabra. El historial
conserva palabras ya resueltas.

## Estados durables propuestos

La máquina conceptual inicial es:

```text
preparation
  └─ resolution_start_proposed
       ├─ preparation
       └─ reading
            ├─ advance_reading_proposed
            │    ├─ reading
            │    └─ voting
            ├─ voting
            │    └─ reveal_proposed
            │         ├─ voting
            │         └─ word_result
            ├─ paused
            │    └─ reading | voting | word_result
            └─ word_result
                 ├─ reading
                 └─ finished
```

Los nombres son provisorios. La decisión estable es que propuesta y
confirmación deben existir para iniciar resolución, avanzar lecturas y revelar
resultados.

## Entidades conceptuales

- `DictionaryGame`: partida activa de un Group, compuesta por tres palabras.
- `DictionaryWord`: palabra seleccionada para una partida y su definición real.
- `DictionaryDefinition`: definición inventada enviada por un participante para
  una palabra.
- `DictionaryPresence`: conjunto de participantes presentes para una resolución.
- `DictionaryVote`: voto de una persona presente sobre una definición de la
  palabra actual.
- `DictionaryWordResult`: resultado revelado de una palabra.
- `DictionaryEntry`: palabra ya incorporada al Diccionario del grupo.

Estos nombres no deciden la forma final de implementación.

## Contrato por estado

### `preparation`

Propósito: permitir carga y edición asincrónica de definiciones.

- Puede actuar: integrantes del Group.
- Acciones: crear, editar o eliminar definición propia para una palabra activa,
  según se defina el flujo final.
- Transición: `preparation → resolution_start_proposed`.
- Visibilidad: cada participante ve sus propias definiciones y el progreso del
  grupo, pero no contenido ajeno.

### `resolution_start_proposed`

Propósito: confirmar presencialmente que la partida se congela y empieza la
resolución.

- Puede actuar: participantes presentes.
- Guards: al menos dos presentes; quien confirma no es quien propuso.
- Transiciones: volver a `preparation` si la propuesta se cancela o queda
  inválida; pasar a `reading` al confirmar.
- Efecto al confirmar: congela definiciones disponibles y fija la primera
  palabra a resolver.

### `reading`

Propósito: leer definiciones anonimizadas de la palabra actual.

- Puede actuar: participantes presentes.
- Acción: proponer avanzar a la definición siguiente.
- Transición: `reading → advance_reading_proposed`.
- Visibilidad: palabra actual y una definición anonimizada por vez; autores
  ocultos.

El orden de lectura debe ser aleatorio y estable para la palabra.

### `advance_reading_proposed`

Propósito: evitar que una sola persona avance la lectura compartida sin acuerdo
presencial mínimo.

- Puede actuar: otra persona presente confirma o rechaza.
- Guards: quien confirma no es quien propuso.
- Transiciones: volver a `reading` si se rechaza o queda inválido; avanzar a la
  siguiente definición o a `voting` si ya se leyó la última.

### `voting`

Propósito: registrar votos de los participantes presentes.

- Puede actuar: participantes presentes habilitados para votar.
- Guards: una persona vota una vez por palabra; el voto no puede apuntar a su
  propia definición inventada.
- Mientras faltan votos: permanece en `voting`.
- Al completarse: habilita `reveal_proposed`.
- Visibilidad: cada votante puede conocer su propio voto registrado; no se
  muestran conteos parciales.

### `reveal_proposed`

Propósito: confirmar que el grupo está listo para revelar resultado y puntos.

- Puede actuar: participantes presentes.
- Guards: votación completa; quien confirma no es quien propuso.
- Transiciones: volver a `voting` si se rechaza o queda inválido; pasar a
  `word_result` al confirmar.

### `word_result`

Propósito: revelar y puntuar la palabra actual.

- Puede actuar: participantes presentes avanzan la resolución según se defina.
- Efectos: muestra definición real, autores, votos agregados y puntos; marca la
  palabra como resuelta.
- Transiciones: `word_result → reading` si quedan palabras; `word_result →
  finished` si era la tercera palabra.
- Visibilidad: la palabra resuelta ya es compartida.

### `paused`

Propósito: conservar una resolución interrumpida.

- Puede actuar: pendiente de definir.
- Transición: reanudar al estado de resolución correspondiente.
- Visibilidad: conserva lo ya congelado y resuelto; no reabre edición de
  definiciones.

La política de pausa sigue abierta y debe cerrarse antes de implementar.

### `finished`

Propósito: estado terminal de la partida.

- Transiciones: ninguna dentro de la misma partida.
- Efectos: conserva resultado final, puntajes y palabras incorporadas al
  Diccionario del grupo; permite crear o recibir una nueva partida.

## Visibilidad pública y privada

Durante `preparation`, el contenido propio es privado para su autor y el
contenido ajeno está oculto. El grupo puede ver progreso sin leer definiciones.

Durante resolución, las definiciones congeladas se vuelven visibles de forma
anonimizada según el avance de lectura. Los autores permanecen ocultos hasta
`word_result`.

Desde `word_result`, la definición real, las definiciones inventadas, sus
autores, votos agregados y puntos de esa palabra son información compartida.

Los votos individuales no deben exponerse como decisiones personales ajenas; el
resultado visible puede mostrar agregados por definición.

## Guards e invariantes transversales

- Toda acción debe derivar el actor desde identidad autenticada y pertenencia al
  Group.
- Una partida activa tiene exactamente tres palabras.
- Una persona puede tener como máximo una definición inventada por palabra.
- Nadie puede leer definiciones ajenas durante preparación.
- Al comenzar resolución, las definiciones quedan congeladas.
- Participantes ausentes pueden aportar puntos como autores, pero no votar.
- Sólo participantes presentes pueden iniciar, confirmar avances, votar y
  revelar.
- La confirmación de propuesta requiere una persona distinta de quien propuso.
- Nadie puede votar su propia definición inventada.
- Votos, puntaje, avance de palabra y cierre deben ser idempotentes frente a
  reintentos previstos cuando se implemente.

## Decisiones pendientes que afectan estado

- Fuente de palabras y persistencia de definición real.
- Mínimo de definiciones requeridas por palabra para iniciar o resolver.
- Política de presencia durante una resolución pausada o interrumpida.
- Política ante desconexión de una persona presente antes de votar.
- Si las propuestas tienen expiración, cancelación explícita o reemplazo por
  una propuesta nueva.
- Si una palabra puede omitirse, anularse o reemplazarse después de creada la
  partida.
