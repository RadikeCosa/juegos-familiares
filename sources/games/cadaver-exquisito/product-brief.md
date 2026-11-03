# Cadáver exquisito — Producto y reglas

## Experiencia

Juego colaborativo presencial de Juegos Familiares para dos o más integrantes
del mismo Group, cada uno con su dispositivo. Se escribe una sola historia por
turnos, sin puntajes ni ganadores. La entrada es `/cadaver-exquisito`; permite
crear una Room o incorporarse mediante su código, además de consultar historias.

El anfitrión elige 3, 5 o 7 rondas, inicialmente 3. Antes de iniciar confirma
participantes e indicadores de conexión; un cambio de roster o configuración
invalida esa confirmación. El inicio congela participantes y configuración y
sortea un orden que permanece fijo. Una ronda incluye un aporte de cada persona.

## Escritura y revelación

La primera persona inventa libremente el comienzo. Después, sólo quien tiene
el turno recibe las últimas tres palabras del aporte anterior. Cada aporte
contiene entre 3 y 50 palabras; la pista está separada del editor y no vuelve
a concatenarse a la historia. Los demás ven el orden y a quién esperan, sin
recibir los textos enviados ni la pista.

Enviar requiere confirmación y es definitivo. El último envío revela y guarda
la historia completa con autoría por aporte, cierra la Room y libera sus lugares.
El historial pertenece al Group: sus integrantes actuales pueden leer historias
completas aunque no hayan participado. Conserva los nombres de quienes escribieron
y presenta «Historia del [fecha y hora]», con formato local. Para otra historia
se crea otra Room.

Los espacios Unicode se normalizan. Se cuentan tokens separados por espacios
que contengan letras o números; un guion interno no divide palabras. Emojis y
puntuación aislados no cuentan. La pista toma los últimos tres tokens contables
con su puntuación pegada y excluye tokens aislados de puntuación.

## Interrupciones y vencimiento

Desconectarse conserva turno y lugar. El borrador propio se conserva en
`sessionStorage`, asociado a Player, sesión y turno; no garantiza recuperación
si el navegador descarta la pestaña. No hay envíos offline.

Abandonar exige confirmación, descarta el borrador y libera el lugar activo.
En lobby elimina la membresía de Room. Tras iniciar conserva la posición en el
roster congelado y no salta el turno. Si corresponde, la espera indica
«Esperando a X (abandonó la sala)».

Regresar requiere recuperar un lugar; no desplaza otra Room activa. Dentro de
esa misma operación se actualiza disponibilidad y se resuelve la sucesión de
anfitrión. La salida del anfitrión permite sucesión determinista también en
lobby. Sin candidato se conserva una referencia inactiva, sin autoridad para
actuar. Una sola persona puede permanecer en lobby; sigue necesitando dos
para iniciar.

La Room vence tras 24 horas sin avances. Crear, cambiar efectivamente la
configuración, iniciar o aceptar un aporte renuevan el plazo. Leer, heartbeat,
abandonar, regresar y reintentar un envío ya aceptado no lo renuevan. La UI
recibe hora del servidor y vencimiento; el tiempo restante usa duración
monotónica transcurrida. Regresar a las 23:50 deja diez minutos.

El anfitrión activo puede cancelar. Cancelar o vencer elimina los aportes y sus
identificadores de operación, conserva sólo metadatos de cierre y nunca publica
una historia incompleta. El vencimiento se evalúa en las RPCs y mediante un
barrido cada 15 minutos; una Room ya vencida no acepta avances aunque el barrido
no haya pasado todavía. Una historia completada no puede cancelarse después.

## Límites de la primera versión

No ofrece edición ni borrado de historias publicadas, títulos personalizados,
moderación, exportación, enlaces públicos, notificaciones, consignas, salto de
turnos ni historias paralelas. La ausencia de retirada de contenido publicado
es una decisión explícita de esta versión. Todo texto se renderiza como texto
plano.

La arquitectura y permisos se describen en
[la arquitectura de plataforma](../../architecture.md#cadáver-exquisito).
La evidencia y el procedimiento de comprobación están en
[validación](validation.md). Implementación y pruebas no equivalen a validación
con personas o teléfonos físicos.
