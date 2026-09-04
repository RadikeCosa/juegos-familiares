# Impostor — Reglas del juego

## Estado

Estas son las reglas v0 de Impostor.

Representan nuestra primera hipótesis jugable suficientemente definida como para diseñar e implementar el MVP.

No se consideran definitivas.

Después de jugar partidas reales debemos observar qué funciona, qué genera fricción y qué conviene modificar.

---

# Participantes

El juego está diseñado inicialmente para grupos pequeños.

## Rango inicial

* mínimo: 3 jugadores;
* recomendado: 3 a 8 jugadores;
* caso principal de prueba: 4 jugadores.

Cada participante utiliza su propio teléfono.

---

# Grupo

Los jugadores pertenecen a un grupo persistente.

El grupo mantiene:

* integrantes;
* banco de palabras;
* configuración básica.

Las partidas son temporales, pero el grupo y sus palabras permanecen disponibles para encuentros futuros.

---

# Banco de palabras

El grupo posee un banco persistente.

En el Incremento 3, el banco se alimenta con palabras o frases cortas aportadas por los participantes.

Cualquier integrante puede agregar palabras aunque no exista una partida activa.

Las palabras precargadas quedan diferidas para una etapa posterior.

---

## Visibilidad

Los integrantes no necesitan consultar el banco completo.

Pueden conocer:

* las palabras que ellos mismos agregaron;
* la cantidad total disponible.

También pueden borrar sus propios aportes.

En este MVP, el administrador tampoco puede explorar libremente el banco completo.

---

## Validación

La aplicación debe impedir automáticamente:

* palabras vacías;
* duplicados triviales;
* diferencias irrelevantes de espacios;
* duplicados que solamente difieren en mayúsculas o minúsculas;
* entradas de menos de 2 caracteres o más de 40 caracteres;
* emojis.

La normalización conserva tildes, `ñ` y puntuación. No intenta convertir palabras parecidas en una misma entrada si esa conversión puede cambiar el significado.

---

# Tanda

Una tanda es una sesión formada por múltiples rondas.

Durante la tanda se mantienen:

* jugadores participantes;
* rondas realizadas;
* palabras utilizadas;
* marcador.

No existe inicialmente un número obligatorio de rondas.

El grupo decide cuándo finalizar.

---

# Preparación de una ronda

Cada ronda utiliza:

* los jugadores actualmente presentes;
* una palabra secreta;
* exactamente un impostor.

La aplicación selecciona la palabra y el impostor.

---

# Selección de palabra

La palabra se obtiene del banco disponible para el grupo.

Para iniciar una ronda debe existir al menos una palabra disponible que todavía no haya sido utilizada durante la tanda actual.

Una palabra utilizada no debe aparecer nuevamente durante la misma tanda.

Puede volver a utilizarse en una tanda futura.

Si no quedan palabras disponibles para la tanda:

* no puede comenzar una nueva ronda;
* la aplicación debe permitir agregar nuevas palabras o terminar la tanda;
* no se reutilizan automáticamente palabras ya usadas durante esa misma tanda.

---

# Selección del impostor

Existe exactamente un impostor por ronda.

La selección debe incluir azar pero evitar distribuciones claramente injustas.

Mientras existan jugadores que hayan sido impostores menos veces dentro de la tanda, deben tener prioridad respecto de quienes ya tuvieron el rol más veces.

Entre los jugadores elegibles se selecciona aleatoriamente.

El objetivo es combinar:

* imprevisibilidad;
* variedad;
* distribución razonablemente equilibrada.

---

# Información privada

Cada teléfono recibe únicamente la información correspondiente a su jugador.

## Jugador normal

Ve la palabra secreta.

Ejemplo:

> MILANESA

## Impostor

No recibe la palabra.

Ve:

> IMPOSTOR

La privacidad no debe depender solamente de ocultar visualmente información que ya haya sido enviada al dispositivo.

---

# Comienzo de la ronda

Cuando todos disponen de su información, la aplicación indica que puede comenzar el juego.

La aplicación selecciona autoritativamente quién da la primera pista, mediante azar equilibrado dentro de la tanda actual. Tienen prioridad quienes hayan comenzado menos veces y, cuando varias personas empatan en ese mínimo, se evita elegir al impostor si existe otra alternativa. Entre las personas restantes, la selección es aleatoria.

Después de esa primera intervención, el grupo continúa físicamente, por ejemplo hacia la derecha. La aplicación no controla ni registra los turnos posteriores.

---

# Primera vuelta

Cada jugador debe participar al menos una vez.

Durante la primera vuelta, cada participante dice una palabra o frase breve relacionada con la palabra secreta.

El objetivo del jugador normal es demostrar que conoce la palabra sin revelarla demasiado claramente.

El objetivo del impostor es participar de manera convincente mientras intenta deducir la palabra.

---

# Conversación libre

Después de la primera vuelta se permite una conversación presencial breve y libre.

Los participantes pueden:

* comentar pistas;
* preguntar;
* sospechar;
* acusar;
* defenderse.

La aplicación no regula esta conversación.

No existe inicialmente:

* temporizador obligatorio;
* cantidad máxima de intervenciones;
* número fijo de vueltas adicionales.

El grupo decide cuándo está listo para votar.

---

# Inicio de votación

Cuando el grupo decide terminar la conversación, el host selecciona:

`Ir a votación`

Todos los dispositivos pasan al estado de votación.

---

# Votación

Cada participante vota desde su propio teléfono por quien considera impostor.

La votación es secreta.

Un jugador no puede votarse a sí mismo.

Los resultados no se muestran hasta que todos los jugadores hayan votado.

---

# Resultado de la votación

Cuando todos votaron, la aplicación muestra el resultado simultáneamente.

Ejemplo:

> Camila — 3 votos
> Pedro — 1 voto

---

# Empate

Si dos o más jugadores comparten la mayor cantidad de votos:

1. la aplicación informa el empate;
2. el grupo puede discutir nuevamente;
3. se realiza una segunda votación;
4. solamente pueden recibir votos los jugadores empatados.

En la segunda votación, el grupo solamente identifica al impostor si el impostor queda como único jugador con mayor cantidad de votos.

Cualquier otro resultado da la victoria al impostor.

Esto incluye:

* un nuevo empate;
* otro jugador como único más votado;
* cualquier resultado donde el impostor no sea el único más votado.

No hay más rondas de desempate.

---

# Impostor no descubierto

Si el jugador más votado no es el impostor:

**gana el impostor.**

La ronda termina.

---

# Impostor descubierto

Si el jugador más votado es efectivamente el impostor, todavía tiene una última oportunidad.

La aplicación revela quién era el impostor pero no muestra inmediatamente la palabra.

Solo el impostor puede enviar un único intento final para adivinar la palabra secreta.

El intento se envía desde la aplicación con el texto que el impostor cree que corresponde a la palabra:

```text
submit_impostor_guess(guess_text)
```

El cliente no decide si acertó. El servidor normaliza y compara el intento contra la palabra secreta de la ronda.

Si acierta, gana el impostor.

Si falla, gana el grupo.

Después del intento la ronda pasa a resultado y la aplicación puede revelar la palabra.

---

# Condiciones de victoria

El ganador final de ronda se representa como:

```text
round_winner = impostor | group
```

Este valor no describe solamente el resultado de la votación. Describe quién ganó después de resolver también el intento final del impostor cuando corresponde.

## Victoria del impostor

El impostor gana si ocurre cualquiera de estas situaciones:

* el grupo acusa a otro jugador;
* en la segunda votación, el impostor no queda como único jugador con mayor cantidad de votos;
* el grupo descubre al impostor pero este adivina correctamente la palabra en su único intento final.

## Victoria del grupo

El grupo gana si:

* identifica correctamente al impostor;
* y el impostor no logra adivinar la palabra en su único intento final.

---

# Puntuación

El sistema inicial prioriza simplicidad, pero no iguala el peso de ambos bandos.

## Victoria del impostor

El impostor recibe:

`+2 puntos`

Los jugadores normales no reciben puntos.

## Victoria del grupo

Cada jugador normal recibe:

`+1 punto`

El impostor no recibe puntos.

La puntuación es individual. No existe un score de equipo separado.

El cliente nunca calcula puntos: el servidor los aplica al cerrar la ronda.

---

# Marcador

Después de cada ronda se muestra el marcador actualizado.

El marcador acumula los puntos de todos los `SessionPlayers` de la tanda actual.

No necesita una entidad de marcador separada en la primera versión.

Ejemplo:

> Victoria — 4
> Pedro — 3
> Camila — 3
> Ramiro — 2

Desde esa pantalla el host puede:

* iniciar una nueva ronda;
* terminar la tanda.

Si no quedan palabras disponibles para la tanda, la acción de nueva ronda no está disponible. La aplicación debe permitir agregar palabras al banco o terminar la tanda.

---

# Nueva ronda

Al comenzar una nueva ronda se conservan:

* jugadores;
* marcador;
* banco de palabras;
* registro de palabras ya utilizadas durante la tanda;
* distribución anterior de roles necesaria para balancear la selección del próximo impostor.

Se seleccionan:

* una nueva palabra;
* un nuevo impostor.

La nueva palabra, el nuevo impostor y el nuevo número de ronda se eligen server-side.

El cliente no puede elegir ni sugerir esos valores como autoridad.

La nueva ronda reutiliza la misma tanda y el mismo roster congelado.

Si existe una palabra disponible no utilizada en la tanda, el sistema crea una ronda con número siguiente.

Si no existe una palabra disponible no utilizada, no se crea la ronda.

---

# Fin de la tanda

La tanda puede terminar desde el marcador, después de una ronda cerrada y puntuada.

Sólo el host actual puede terminarla.

La aplicación muestra:

* clasificación final;
* ganador o ganadores según puntuación;
* cantidad de rondas jugadas.

Ganan todos los jugadores que tengan el puntaje máximo al cerrar la tanda.

Si hay empate en el primer puesto, el resultado final conserva múltiples ganadores. No hay desempate oculto.

Después de terminar la tanda, esa Room ya no se usa para otra tanda. Para volver a jugar, el grupo crea una nueva Room.

Las estadísticas adicionales son opcionales y no forman parte necesaria del MVP.

---

# Principio de diseño de las reglas

Estas reglas no buscan reproducir obligatoriamente otra implementación existente de Impostor.

Buscan producir una variante:

* sencilla de explicar;
* rápida;
* social;
* competitiva sin ser compleja;
* divertida con cuatro personas;
* escalable razonablemente a grupos pequeños;
* con mínima intervención del teléfono durante la conversación.

Las primeras sesiones reales determinarán qué reglas deben mantenerse o modificarse.
