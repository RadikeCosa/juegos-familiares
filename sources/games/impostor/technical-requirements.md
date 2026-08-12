# Impostor — Requisitos técnicos

## Propósito

Este documento deriva requisitos técnicos del diseño actual de Impostor.

Impostor es el primer juego dentro de Juegos Familiares.

Algunos requisitos pertenecen a la aplicación contenedora, como PWA, compatibilidad iOS/Android, identidad liviana y grupo.

Otros requisitos, como salas, rondas, votos, palabra secreta, impostor, realtime y presencia, derivan específicamente de Impostor.

Responde:

> ¿Qué capacidades técnicas necesita realmente el MVP para soportar correctamente el producto que diseñamos?

No define todavía:

* stack;
* base de datos;
* proveedor realtime;
* hosting;
* autenticación concreta;
* APIs;
* tablas;
* arquitectura final.

Los requisitos buscan preservar:

* simplicidad;
* infraestructura proporcional;
* privacidad por diseño;
* mobile-first;
* PWA;
* aprendizaje progresivo;
* bajo costo cognitivo y operativo.

---

# 1. Cliente mobile-first

## Requisito MVP

La experiencia principal de Juegos Familiares debe funcionar correctamente en teléfonos.

Impostor debe integrarse dentro de esa experiencia mobile-first.

El cliente debe soportar:

* uso desde navegador;
* experiencia PWA instalada cuando esté disponible;
* pantallas móviles pequeñas;
* controles táctiles claros;
* lectura rápida en contexto social presencial;
* baja fricción para crear sala, unirse, votar y avanzar ronda.

La instalación de la PWA no debe ser obligatoria para jugar.

---

# 2. Compatibilidad PWA

## Requisito MVP

Juegos Familiares tiene objetivo PWA y debe contemplar explícitamente:

* iOS / Safari;
* Android / Chrome;
* uso sin instalación;
* uso como PWA instalada.

## Aspectos a considerar

La arquitectura futura debe permitir evaluar diferencias reales entre plataformas respecto de:

* instalación;
* manifest;
* service workers;
* cache;
* almacenamiento;
* actualización;
* segundo plano / primer plano;
* recuperación de sesión.

No se definen todavía soluciones técnicas concretas.

---

# 3. Estado compartido

## Requisito MVP

Debe existir estado compartido consistente entre dispositivos para:

* sala;
* participantes;
* host;
* tanda;
* ronda;
* fase global;
* confirmaciones individuales;
* votación;
* resultado;
* marcador.

Los teléfonos no deben decidir independientemente en qué etapa está la partida.

---

# 4. Realtime

## Requisito MVP

Para Impostor, algunos cambios deben propagarse con poca demora entre dispositivos:

* entrada y salida del lobby;
* cambios de conexión relevantes;
* cambio de host;
* inicio de tanda;
* cambio de fase;
* confirmación de roles;
* inicio de votación;
* votos completados;
* resultado;
* marcador;
* nueva ronda;
* fin de tanda.

## No requiere sincronización continua

No hace falta sincronizar digitalmente:

* conversación presencial;
* quién está hablando;
* contenido de pistas;
* duración exacta de intervenciones.

No se asume todavía un mecanismo realtime específico.

Realtime no se considera una capacidad obligatoria universal para todos los juegos futuros de Juegos Familiares.

---

# 5. Autoridad del sistema

## Requisito MVP

Debe existir una fuente autoritativa para las reglas compartidas.

Los clientes pueden solicitar acciones, pero no deben decidir unilateralmente:

* palabra seleccionada;
* impostor;
* resultado de votación;
* ganador;
* puntuación;
* transiciones de fase;
* reasignación del host.

La preparación de una ronda y la resolución de una votación deben ocurrir de forma coherente desde esa autoridad conceptual.

---

# 6. Identidad liviana

## Requisito MVP

El MVP no usa cuentas tradicionales con email y contraseña.

Debe reconocer de forma estable:

* jugador;
* grupo;
* identidad o sesión correspondiente.

Identidad, jugador y grupo pueden ser compartidos por distintos juegos dentro de Juegos Familiares.

La identidad local permite recordar qué jugador usa el dispositivo, pero no equivale por sí sola a autorización.

---

# 7. Autorización

## Requisito MVP

Las acciones protegidas deben validarse conceptualmente según capacidades.

## Administrador

Puede:

* consultar integrantes;
* eliminar integrantes;
* consultar banco completo;
* eliminar palabras.

## Host

Puede:

* iniciar tanda;
* iniciar votación;
* iniciar segunda votación;
* avanzar resolución;
* iniciar nueva ronda;
* terminar tanda.

## Participante

Puede:

* entrar a sala;
* confirmar rol;
* votar;
* consultar su información privada.

## Autor de palabra

Puede:

* consultar sus propias palabras.

No se diseña todavía RBAC técnico.

---

# 8. Privacidad por jugador

## Requisito MVP

El sistema debe permitir vistas distintas según identidad y capacidad.

Debe cumplirse:

* el impostor no recibe la palabra;
* cada jugador recibe solamente su rol e información privada correspondiente;
* los votos individuales permanecen privados durante la votación;
* los resultados agregados se revelan cuando corresponde;
* un jugador normal no puede consultar el banco completo;
* el administrador sí puede consultar el banco completo;
* el autor puede consultar sus propias palabras.

La privacidad no puede depender solamente de ocultar datos en la UI.

---

# 9. Persistencia duradera

## Requisito MVP

Debe persistir como mínimo:

* grupo;
* jugadores;
* banco de palabras;
* historial mínimo de tandas;
* historial mínimo de rondas.

Estos datos sobreviven entre partidas.

---

# 10. Estado operativo temporal

## Requisito MVP

Debe existir estado operativo para coordinar una partida activa:

* sala activa;
* participación en sala;
* tanda activa;
* ronda activa;
* votos operativos;
* estado de conexión;
* marcador mientras se juega.

Aunque una implementación futura pudiera persistir técnicamente parte de este estado, conceptualmente debe distinguirse del historial permanente.

---

# 11. Historial mínimo

## Requisito MVP

Desde las primeras partidas debe conservarse suficiente información para estadísticas futuras.

## Tanda

Debe contemplar:

* grupo;
* participantes;
* inicio;
* fin;
* rondas jugadas;
* puntuación final.

## Ronda

Debe contemplar:

* número de ronda;
* impostor;
* ganador;
* si el impostor fue descubierto;
* si adivinó la palabra.

No se requiere conservar votos individuales históricos.

La UI de estadísticas no es parte obligatoria del primer MVP.

---

# 12. Consistencia

## Requisito MVP

Las operaciones compuestas deben completarse coherentemente.

Ejemplo: preparar ronda implica conceptualmente:

* comprobar palabra disponible;
* elegir palabra;
* elegir impostor;
* crear ronda;
* preparar asignaciones privadas;
* actualizar contador de impostor.

No debería existir un estado parcial donde, por ejemplo, haya ronda sin palabra, ronda sin impostor o asignaciones privadas inconsistentes.

---

# 13. Concurrencia

## Requisito MVP

Debe contemplar acciones simultáneas de pocos dispositivos.

Casos mínimos:

* varios votos llegando casi al mismo tiempo;
* último voto disparando resolución;
* doble toque del host en `Nueva ronda`;
* doble toque del host al iniciar votación;
* reconexión de un jugador durante una fase activa.

El contexto inicial es un grupo familiar pequeño, normalmente cuatro jugadores.

No se diseña para escala masiva.

---

# 14. Idempotencia y prevención de duplicados

## Requisito MVP

El sistema debe evitar:

* voto duplicado;
* creación de dos rondas por reintento;
* iniciar dos veces la votación;
* ejecutar dos veces una transición importante;
* registrar dos veces el resultado final de una ronda.

Las transiciones críticas deben poder tolerar reintentos o dobles acciones del usuario sin romper el estado compartido.

---

# 15. Presencia

## Requisito MVP

Impostor necesita presencia básica para distinguir:

* conectado;
* desconectado.

La presencia importa especialmente para:

* lobby;
* mínimo de jugadores;
* sucesión de host;
* recuperación razonable de sesión.

No se requiere presencia sofisticada.

Presence no se considera una capacidad obligatoria universal para todos los juegos futuros.

---

# 16. Reasignación del host

## Requisito MVP

Si el host deja de estar disponible, el sistema debe:

* identificar participantes conectados restantes;
* elegir al conectado con `joinedAt` más antiguo;
* reasignar host de forma consistente.

Si el host original vuelve, vuelve como participante normal y no recupera automáticamente el rol.

---

# 17. Reconexión

## Requisito MVP

La PWA debe poder recuperarse razonablemente de:

* refresh;
* cambio de aplicación;
* bloqueo del teléfono;
* pérdida breve de red;
* reapertura.

Debe poder reconstruir:

* identidad;
* grupo;
* sala activa, si corresponde;
* estado actual;
* información privada que todavía corresponda.

No se diseña reconexión avanzada todavía.

---

# 18. Banco de palabras

## Requisito MVP

Antes de crear una ronda debe existir una palabra válida no utilizada en esa tanda.

Si no quedan palabras:

* no se crea nueva ronda;
* se permite agregar palabras;
* se permite terminar tanda;
* no se reutilizan automáticamente palabras ya usadas en esa tanda.

El banco debe validar entradas simples:

* valores vacíos;
* espacios innecesarios;
* duplicados triviales;
* diferencias de mayúsculas/minúsculas;
* límites razonables de longitud.

---

# 19. Selección aleatoria y balance

## Requisito MVP

La selección de palabra e impostor debe ocurrir en el lado autoritativo.

Para impostor:

* determinar menor `impostorCount`;
* obtener jugadores elegibles;
* elegir aleatoriamente entre ellos.

El objetivo es combinar azar, variedad y distribución razonablemente equilibrada.

---

# 20. Votación

## Requisito MVP

Debe soportar:

* primera votación;
* segunda votación si corresponde;
* un voto por jugador por etapa;
* sin auto-voto;
* candidatos restringidos en segunda votación;
* conteo autoritativo;
* privacidad hasta la revelación.

La segunda votación es definitiva: el grupo solamente identifica al impostor si el impostor queda como único jugador con mayor cantidad de votos.

---

# 21. Offline

## Requisito MVP

Debe quedar explícito:

* PWA sí;
* cache progresivo cuando aporte valor;
* una partida multi-dispositivo completamente offline no es requisito del MVP;
* no se diseña peer-to-peer offline.

La sincronización entre teléfonos requiere conectividad en la primera versión jugable.

Esta necesidad de sincronización corresponde a Impostor.

---

# 22. Escala

## Requisito MVP

El diseño técnico debe optimizar para el caso real inicial:

* grupo familiar pequeño;
* normalmente cuatro jugadores;
* rango aproximado de tres a ocho jugadores;
* pocas salas simultáneas;
* volumen pequeño o medio de palabras e historial.

No se debe optimizar prematuramente para comunidades públicas, matchmaking o gran escala.

---

# 23. Experiencia de desarrollo y aprendizaje

## Criterio para comparar arquitecturas

La futura solución técnica debería favorecer:

* TypeScript;
* documentación clara;
* testing;
* desarrollo local razonable;
* observabilidad básica;
* poco boilerplate;
* costos bajos;
* comprensión progresiva de los conceptos.

El costo cognitivo debe formar parte de la comparación de arquitecturas.

Esto no elige todavía framework, proveedor ni infraestructura.

---

# Requisitos obligatorios del MVP

1. Cliente mobile-first usable desde navegador en teléfonos.
2. Compatibilidad objetivo con iOS / Safari y Android / Chrome.
3. Experiencia PWA instalable sin que la instalación sea obligatoria.
4. Estado compartido consistente de sala, tanda, ronda, fase, participantes, host, votación, resultado y marcador.
5. Propagación con poca demora de cambios de fase, lobby, votos completados, resultados, marcador y host.
6. Fuente autoritativa para palabra, impostor, resultados, puntuación y transiciones.
7. Identidad liviana estable para jugador y grupo, separada de autorización.
8. Autorización conceptual para administrador, host, participante y autor de palabra.
9. Vistas privadas por jugador, sin enviar secretos al dispositivo equivocado.
10. Persistencia duradera de grupo, jugadores, banco de palabras e historial mínimo.
11. Estado operativo temporal para salas, tandas, rondas, votos, conexión y marcador activo.
12. Historial mínimo de tandas y rondas finalizadas para estadísticas futuras.
13. Consistencia en operaciones compuestas como preparar ronda y resolver votación.
14. Concurrencia básica para pocos dispositivos actuando al mismo tiempo.
15. Prevención de duplicados en votos, rondas y transiciones críticas.
16. Presencia básica conectado/desconectado.
17. Reasignación consistente del host usando `joinedAt`.
18. Recuperación razonable ante refresh, reapertura, segundo plano y pérdida breve de red.
19. Validación y privacidad del banco de palabras.
20. Selección autoritativa y balanceada del impostor.
21. Votación secreta de primera y segunda etapa.
22. Alcance offline acotado: PWA y cache progresivo, sin partida multi-dispositivo offline.

---

# Capacidades deseables / futuras

* Interfaz de estadísticas.
* Estadísticas históricas complejas.
* Moderación avanzada de palabras.
* Límites de aportes o aprobación de palabras.
* Perfiles públicos.
* Matchmaking.
* Ranking global.
* Chat.
* Partidas remotas fuera del contexto presencial.
* Reglas avanzadas de reconexión.
* Presencia más sofisticada.
* Offline más amplio si aparece una necesidad real.
* Optimización para comunidades grandes.

---

# Decisiones todavía abiertas

* Cómo se crea inicialmente un grupo.
* Cómo se invita a otro dispositivo al grupo.
* Cómo se crea y comparte una sala.
* Si conviene código, enlace, QR o combinación.
* Comportamiento detallado cuando un jugador pierde conexión.
* Entrada o salida de jugadores durante una tanda.
* Forma técnica de persistir historial mínimo.
* Mecanismo concreto para estado compartido y realtime.
* Estrategia concreta de PWA para diferencias iOS/Android.

---

# Preguntas para evaluar tecnologías

## Persistencia

* ¿Permite persistir grupo, jugadores, banco de palabras e historial mínimo sin complejidad excesiva?
* ¿Permite distinguir claramente estado operativo temporal e historial permanente?
* ¿Qué costo introduce para migrar o ajustar el modelo?

## Realtime

* ¿Puede propagar cambios de sala y partida con poca demora para grupos pequeños?
* ¿Permite mantener una progresión autoritativa de estados?
* ¿Qué complejidad agrega frente a alternativas más simples?

## Privacidad

* ¿Permite entregar vistas distintas por jugador?
* ¿Evita que la palabra llegue al impostor?
* ¿Evita exponer votos individuales durante la votación?
* ¿Permite restringir el banco completo a administradores?

## Autorización

* ¿Puede representar capacidades de administrador, host, participante y autor sin sobrediseño?
* ¿Cómo evita que la identidad local se convierta indebidamente en autoridad?

## Consistencia

* ¿Puede ejecutar de forma coherente operaciones compuestas como preparar ronda o resolver votación?
* ¿Cómo evita estados parciales inválidos?

## Concurrencia

* ¿Cómo maneja votos simultáneos?
* ¿Cómo evita doble creación de ronda o doble transición por reintentos?
* ¿Es suficiente para pocos dispositivos sin diseñar para escala masiva?

## Presencia

* ¿Permite distinguir conectado/desconectado de manera simple?
* ¿Ayuda a resolver sucesión de host?
* ¿Qué tan confiable es en navegador móvil?

## Reconexión

* ¿Puede recuperar identidad, grupo, sala activa y fase actual tras refresh o reapertura?
* ¿Qué ocurre al volver desde segundo plano?
* ¿Qué responsabilidad queda en el cliente y cuál en la fuente autoritativa?

## PWA iOS/Android

* ¿Funciona bien desde Safari en iOS y Chrome en Android?
* ¿Qué limitaciones tiene para instalación, cache, almacenamiento y actualización?
* ¿Cómo se comporta al pasar a segundo plano y volver?

## Historial

* ¿Permite conservar el resumen mínimo desde las primeras partidas?
* ¿Evita guardar votos individuales históricos sin necesidad?
* ¿Permite derivar estadísticas futuras sin rediseñar todo?

## Costos

* ¿Cuál es el costo inicial para un grupo familiar pequeño?
* ¿Qué costos aparecen si hay más grupos o más historial?
* ¿Hay costos fijos aunque el uso sea bajo?

## Complejidad operativa

* ¿Cuánto mantenimiento exige?
* ¿Requiere configurar demasiadas piezas para el MVP?
* ¿Qué tan fácil es depurar una partida real?

## Experiencia de desarrollo

* ¿Favorece TypeScript, testing y desarrollo local?
* ¿Tiene buen soporte para errores y observabilidad básica?
* ¿Reduce boilerplate o lo aumenta?

## Aprendizaje

* ¿Permite entender progresivamente cliente/servidor, estado compartido, realtime, privacidad y PWA?
* ¿Las decisiones importantes siguen siendo explicables?

## Lock-in

* ¿Qué tan difícil sería cambiar de proveedor o estrategia después?
* ¿El dominio del juego queda separado de la infraestructura?
* ¿Las reglas pueden probarse sin depender del proveedor elegido?
