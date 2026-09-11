# Diccionario — Product brief

## Propósito

Diccionario es un juego social de Juegos Familiares para grupos pequeños que
quieren sostener una actividad compartida entre encuentros presenciales.

La tecnología habilita dos ritmos complementarios:

- preparación asincrónica durante los días en que el grupo está separado;
- resolución presencial cuando al menos parte del grupo vuelve a encontrarse.

La aplicación no reemplaza la lectura compartida, la discusión ni el momento de
descubrir quién escribió cada definición. Coordina el contenido oculto, el
progreso, las votaciones, la puntuación y la continuidad de la partida.

## Experiencia objetivo

El grupo conserva una partida activa de Diccionario con tres palabras. Cada
integrante puede aportar hasta una definición inventada por palabra, a su ritmo,
sin obligación de completar la partida entera.

Durante la preparación, el grupo puede ver quién avanzó y cuántas definiciones
aportó cada persona. El contenido de las definiciones permanece oculto hasta la
resolución presencial.

Cuando al menos dos integrantes están presentes, cualquiera puede proponer
empezar la resolución. Otra persona presente debe confirmar. Al comenzar, la
partida congela las definiciones disponibles: ya no se agregan ni editan
definiciones para esa partida.

La resolución ocurre palabra por palabra. Para cada palabra, la aplicación
presenta definiciones anonimizadas en un orden aleatorio estable. Luego quienes
están presentes votan cuál creen que es la definición real. El resultado se
revela antes de avanzar a la palabra siguiente.

Las definiciones aportadas por integrantes ausentes siguen participando. Una
persona ausente no vota, pero puede sumar puntos si su definición inventada
recibe votos.

## Capacidades previstas

- partida activa por Group con tres palabras;
- carga y edición asincrónica de definiciones propias antes de la resolución;
- progreso visible sin exponer contenido;
- inicio presencial mediante propuesta y confirmación de otra persona presente;
- congelamiento de definiciones al iniciar la resolución;
- lectura secuencial, anonimizada y ordenada aleatoriamente por palabra;
- votación presencial sin auto-voto sobre definiciones propias;
- revelación de definición real, autores y puntos de la palabra;
- pausa y reanudación de una resolución en curso;
- cierre de partida al resolver las tres palabras;
- incorporación de palabras resueltas al Diccionario del grupo;
- disponibilidad de una nueva partida con otras tres palabras después del cierre.

## Límites de producto

- El caso principal son grupos conocidos; no comunidades públicas ni
  competencia abierta.
- La preparación puede ser asincrónica, pero la resolución está pensada como
  experiencia presencial.
- No se exige que todos los integrantes participen ni que cada participante
  complete las tres definiciones.
- El contenido de las definiciones es privado hasta la resolución; mostrar menos
  en UI no sustituye una separación real de lectura cuando se implemente.
- La presencia define quién puede votar en la resolución, no quién puede haber
  aportado contenido antes.
- La fuente de palabras y el criterio de jugabilidad todavía no están definidos.
- Diccionario conserva su propio dominio. No se promueven conceptos de Impostor
  a plataforma ni se reutiliza su arquitectura sin evidencia concreta.

## Fuera de alcance actual

- arquitectura técnica o esquema de base de datos;
- implementación de rutas, componentes o RPCs;
- integración con RAE u otra fuente externa;
- rankings globales, estadísticas avanzadas o competencia pública;
- moderación avanzada de definiciones;
- votación histórica sobre palabras ya incorporadas;
- inteligencia artificial para generar palabras o definiciones;
- reutilización automática de Room, GameSession, Round, host o Presence de
  Impostor.

Las posibilidades futuras no forman backlog por sí solas. Deben incorporarse
solamente cuando exista una decisión explícita de producto.

## Criterio de producto

Diccionario cumple su propósito cuando un grupo puede mantener una partida viva
entre encuentros, aportar definiciones sin revelar la sorpresa y resolverlas
presencialmente con lectura, votos, revelación y puntaje claros.
