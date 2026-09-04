# Juegos Familiares / Impostor — relato técnico accesible

> Estado: esqueleto inicial y contrato editorial de la tarea transversal de
> Incremento 15. Este documento está en construcción. Todavía no declara
> aprobada la aceptación pre-beta ni incorpora conclusiones de sesiones de
> juego con personas.

## Propósito

Este documento explica cómo Juegos Familiares e Impostor convierten una
situación social concreta —varias personas reunidas, cada una con su teléfono—
en un sistema multijugador pequeño, privado y recuperable. No está organizado
por carpetas ni pretende enumerar cada función. Parte de los problemas que una
persona puede observar y avanza, de forma gradual, hacia los conceptos de
ingeniería que permiten resolverlos.

Las preguntas que guían el relato son:

- ¿qué problema humano o de producto aparece?;
- ¿qué podría salir mal si cada teléfono actuara por su cuenta?;
- ¿qué concepto técnico ayuda a razonar sobre el problema?;
- ¿qué solución adoptó el proyecto y por qué?;
- ¿qué alternativa se evitó o se dejó para después?;
- ¿qué costo o límite introduce la decisión?;
- ¿qué efecto puede observarse?;
- ¿qué evidencia permite sostener la afirmación?;
- ¿qué aprendizaje se puede trasladar a otros proyectos?

La audiencia principal es el autor/desarrollador del proyecto y una persona
desarrolladora junior o intermedia. Como audiencia secundaria, el texto debe
servir a una entrevista técnica, a una persona responsable de contratación y a
una persona de producto con curiosidad técnica. No hace falta haber leído el
repositorio para entender el cuerpo narrativo.

## Contrato editorial

### Qué es y qué no es

Este es un relato pedagógico, explicativo y trazable. No es una especificación
normativa, un registro de cambios, una referencia de API, un manual archivo por
archivo, un README ampliado, un duplicado de requisitos ni el estudio de caso
público final.

Ante una discrepancia, este texto cede autoridad a:

1. documentación autoritativa vigente para intención, producto y diseño
   conceptual;
2. código, SQL, migrations, RPCs y políticas RLS vigentes para comportamiento
   actual;
3. pruebas y validadores para invariantes comprobables;
4. Git, plan de implementación y estudio de caso interno para evolución
   histórica;
5. pruebas de humo y aceptación manual para comportamiento en uso real.

Una conversación puede sugerir una pista, pero nunca constituye evidencia
autoritativa.

### Cómo se clasifican las afirmaciones

El relato usa estas categorías cuando el estado de una afirmación podría ser
ambiguo:

- **Comportamiento actual verificado:** aparece de forma coherente en la
  implementación efectiva y en pruebas o validadores pertinentes.
- **Evolución histórica:** describe cómo se llegó al diseño actual; no debe
  confundirse con una garantía vigente.
- **Simplificación pedagógica:** omite detalle accidental, pero conserva la
  responsabilidad y los límites reales del sistema.
- **Evidencia manual pendiente:** la capacidad existe técnicamente, pero falta
  comprobarla en el entorno, dispositivo o dinámica humana indicados.
- **Conclusión todavía no soportada:** no debe presentarse como resultado hasta
  que exista evidencia suficiente.

Las explicaciones simples aparecen primero. Los nombres técnicos se introducen
solo después de explicar el problema que resuelven. Los ejemplos usan personas
ficticias o genéricas y evitan secretos, tokens, códigos activos, palabras de
ronda y votos individuales.

### Límites de la versión inicial

Esta primera versión fija el contrato, el orden narrativo, el inventario y una
matriz inicial de trazabilidad. Comienza el relato únicamente con temas que ya
fueron contrastados. Deja marcadores explícitos para la evidencia de aceptación
manual aún no cerrada.

No contiene todavía:

- resultados o aprendizajes de una sesión de juego real;
- validación concluida en Android o iOS reales;
- resultado de la actualización PWA con dos versiones diferenciables (`U1`);
- revisión final de evidencia (`E1`);
- decisión de aceptación pre-beta (`D1`);
- métricas de uso, impacto o calidad no registradas;
- diagramas definitivos;
- conclusiones públicas de portfolio.

## Registro de la sesión autora

Este apartado conserva el registro producido durante la primera sesión autora.
Es evidencia histórica fechada de aquel punto de partida, no una descripción
eterna del repositorio ni una afirmación que un revisor posterior pueda
reproducir únicamente desde el estado actual de Git.

Verificación local del 2 de septiembre de 2026:

- rama activa: `main`;
- `HEAD`: `a064ce2c38abe4502b8c11ceeb9be5b7187aea62`
  (`Record successful pre-playtest preflight`);
- commit anterior: `53e9799` (`Repair historical pre-playtest validators`);
- `origin/main`: `1ad4b829470a2f5c9da6267e170da5efd64df0f2`;
- `main` está tres commits por delante de `origin/main`;
- rama local `pre-beta-playtest`: `a064ce2`;
- no existe una referencia remota local `origin/pre-beta-playtest`; por eso no
  se presenta como hecho que esa rama remota apunte al mismo commit;
- según el registro de esa sesión, al comenzar el único cambio del árbol de
  trabajo era el archivo nuevo sin seguimiento
  `sources/pre-beta-manual-acceptance-runbook.md`.

El runbook pertenece a la aceptación manual en curso y queda fuera de los
cambios de este relato.

## Evidencia documental de la tarea transversal

`sources/implementation-plan.md`, en “Incremento 15 — Tarea transversal —
Diseño y construcción del relato técnico accesible”, define expresamente:

- el destino `sources/technical-narrative.md`;
- las audiencias primaria y secundaria;
- el carácter pedagógico y no normativo;
- la jerarquía de fuentes;
- el patrón problema, riesgo, concepto, solución, costo asumido, efecto, evidencia
  y aprendizaje;
- la separación entre arquitectura final y evolución histórica;
- el inventario previo a la redacción;
- la trazabilidad a documentación, implementación y pruebas;
- la prohibición de inventar resultados o generalizar juegos futuros.

`sources/project-principles.md` y `sources/working-method.md` refuerzan el mismo
enfoque: experiencia antes que tecnología, infraestructura proporcional,
incrementos verticales, validación según riesgo y aprendizaje explícito. El
estudio de caso interno conserva la evolución y las decisiones, pero no
reemplaza este relato en profundidad.

## Inventario de conceptos y fuentes

El inventario evita confundir una lista de términos con un índice. Varios
conceptos aparecerán juntos porque resuelven un mismo problema humano.

| Familia conceptual | Conceptos principales | Problema que ayudan a explicar | Fuentes iniciales |
| --- | --- | --- | --- |
| Producto social | reunión presencial, un teléfono por jugador, baja fricción, intervención digital mínima | coordinar sin convertir el teléfono en protagonista | briefs de producto, reglas, principios, flujo de usuario |
| Plataforma y dominio | Juegos Familiares, Impostor, capacidades compartidas, abstracciones evitadas | compartir lo real sin diseñar un motor hipotético | principios, arquitectura, plan, historial Git |
| Identidad | Auth anónima, `AuthIdentity`, `Player`, `LocalIdentity` | reconocer a alguien sin email y sin confiar en una pista manipulable | brief de plataforma, arquitectura, arranque de contexto, Auth y pruebas |
| Pertenencia | `Group`, invitación, `Room`, `RoomParticipant` | distinguir el grupo habitual de quienes juegan ahora | briefs, modelo conceptual, migrations de Group/Room, validadores de DB |
| Autoridad y roles | `platform_admin`, administrador de `Group`, host de `Room`, sucesión | distinguir quién puede crear grupos, administrarlos o conducir una tanda | brief de plataforma, arquitectura, decisiones, SQL y pruebas de permisos |
| Modelado de partida | `GameSession`, `SessionPlayer`, `Round`, estados globales | mantener una tanda coherente y un plantel estable aunque cambie la conexión | reglas, modelos de datos/estados, migrations y validadores de gameplay |
| Estado y visibilidad | local, compartido, privado, persistente, operativo, histórico | entregar a cada dispositivo solo lo que necesita | modelo conceptual, vista de lectura, SQL y pruebas de privacidad |
| Seguridad | `auth.uid()`, RLS, RPC, pertenencia derivada | evitar que IDs enviados por el navegador se conviertan en permisos | requisitos, migrations, permisos y pruebas adversariales |
| Sincronización | vista de lectura, Realtime, consulta periódica, invalidación | hacer converger teléfonos sin confiar en eventos como verdad completa | arquitectura, adaptadores de Room, pantalla de sala y pruebas Realtime |
| Disponibilidad | Presence, pertenencia, actividad reciente, pulso periódico, vencimiento | diferenciar “pertenece”, “parece conectado” y “estuvo activo recientemente” | decisiones, migrations 5.x/6.x, cliente y validadores |
| Concurrencia | atomicidad, idempotencia, bloqueos, unicidad, reintento | evitar duplicados y estados parciales ante toques o llamadas simultáneas | requisitos, RPCs, restricciones y validadores de DB |
| Resolución del juego | voto, empate, segunda votación, intento del impostor | preservar el secreto y producir un único resultado válido | reglas, estados, migrations y pruebas de gameplay |
| Continuidad | puntuación, marcador, nueva ronda, historial, `finished` | acumular una tanda sin repetir palabra y cerrarla de forma recuperable | reglas, migrations 11–12, vista de lectura y validadores |
| Interrupciones | recarga, segundo plano/primer plano, varias pestañas, desconexión/reconexión | volver a una fase segura cuando el mundo real interrumpe al navegador | requisitos §17, pantalla de sala, pruebas unitarias y aceptación pendiente |
| PWA | manifiesto, instalación, service worker, caché, actualización | mejorar instalación y carga sin cachear autoridad o secretos | requisitos §24, manifiesto, `public/sw.js`, pruebas y `U1` pendiente |
| Evolución y calidad | migrations, pruebas unitarias/DB/Realtime/de humo, sesión de juego, riesgo | cambiar un sistema vivo sin perder invariantes ni confundir pruebas | plan, método, scripts de `package.json`, suites y protocolo manual |

## Mapa de afirmaciones: estables y pendientes

### Comportamiento actual verificado

- Juegos Familiares funciona como contenedor y mantiene Impostor como primer
  dominio específico, sin `GenericGame`, `GenericRoom` ni motor universal.
- La aplicación usa Next.js/React/TypeScript en un cliente mobile-first y
  Supabase Auth, Postgres, RLS, RPCs, Realtime y Presence en la infraestructura.
- La identidad anónima técnica, el `Player`, el `Group` y `LocalIdentity` son
  conceptos distintos. El arranque puede leer primero la pista local para
  orientar la experiencia, pero valida la sesión y el estado remoto antes de
  reconocer al jugador. La pista local no autoriza ni recupera por sí sola un
  jugador.
- `Group` representa pertenencia social persistente; `Room` representa el
  subconjunto reunido para jugar; `GameSession` es la tanda competitiva y
  `Round` una unidad dentro de ella.
- Existen tres roles distintos. `platform_admin` es una autoridad de plataforma
  y actualmente puede crear grupos. El administrador de `Group` es un rol
  persistente dentro de ese grupo. El host de `Room` es temporal y conduce las
  transiciones autorizadas de la tanda. No son equivalentes ni se infieren uno
  del otro. Al crear un grupo, el `platform_admin` que realiza la operación sí
  queda como su administrador inicial por decisión explícita; administrar ese
  `Group` no concede autoridad de plataforma ni convierte automáticamente a la
  persona en host de una `Room`.
- El navegador envía intenciones. Las operaciones sensibles identifican al
  solicitante autenticado mediante `auth.uid()` y aplican validaciones del lado
  del servidor. Las tablas sensibles de gameplay tienen RLS y no ofrecen CRUD
  directo al cliente.
- `get_my_game_state()` construye una vista según la fase y el solicitante.
  Mientras la palabra continúa siendo secreta, un jugador normal puede
  recibirla y la vista del impostor devuelve `word = null`. Después de resolver
  la ronda, `round_result` y `scoreboard` pueden revelar la palabra a todos los
  participantes. No se confía en ocultar con CSS un secreto ya entregado.
- Realtime de Room invalida y dispara una nueva lectura; no sustituye el estado
  persistido. El gameplay consulta periódicamente y a baja frecuencia la vista
  de lectura autoritativa.
- `RoomParticipant`, Presence, `last_seen_at` y `rooms.host_player_id`
  representan respectivamente pertenencia a la sala, señal efímera, actividad
  reciente autoritativa y host persistido.
- El pulso periódico del cliente —heartbeat— usa una cadencia inicial de 30
  segundos y la autoridad considera vencida —stale— la actividad después de 90
  segundos. La sucesión elige de forma determinista entre candidatos válidos y
  activos; Presence por sí sola no reasigna al host.
- El plantel de una tanda queda congelado en `SessionPlayer`. Una desconexión no
  elimina la pertenencia a la tanda, la elegibilidad como candidato de votación
  ni la obligación de votar. La candidatura para suceder al host es distinta:
  un participante stale queda excluido y, durante gameplay, un sucesor válido
  también debe pertenecer a `SessionPlayers`.
- Primera votación, empate, segunda votación sin tercera etapa, intento único
  del impostor, puntuación, marcador, nueva ronda y cierre `finished` están
  representados en migrations, adaptadores y validadores de DB.
- El historial no conserva votos individuales ni copia `secret_word` o
  `normalized_secret_word` en `round_history`. Sí conserva
  `impostor_guess_text` cuando existió un intento final; si el intento fue
  correcto, ese texto puede coincidir literalmente con la palabra. La
  minimización no equivale a ausencia total de texto relacionado con ella.
- La recarga, el retorno al primer plano y la recuperación de la conexión
  disparan la reconstrucción de Room y del estado de juego. El estado remoto
  vigente reemplaza el estado local potencialmente desactualizado.
- El service worker limita el caché a recursos estáticos del mismo origen y
  excluye Auth, REST, Realtime, Functions, RPCs y vistas de lectura. El producto
  no promete partidas multijugador sin conexión.
- La verificación previa P0 está documentada como `PASS` para pruebas unitarias,
  lint, build, validadores DB y pruebas de humo Realtime sobre el candidato
  registrado.

### Evolución histórica que debe narrarse aparte

- la expansión desde una app de Impostor hacia Juegos Familiares como
  plataforma contenedora;
- la introducción gradual de identidad, Group, banco de palabras, Room,
  Presence, liveness, sucesión, GameSession y gameplay multirronda;
- el reemplazo de hipótesis intermedias, como stale a 60 segundos, por el valor
  implementado de 90 segundos;
- la decisión de no persistir acknowledgements de role reveal y coordinar ese
  momento presencialmente;
- el paso de contratos documentales de votación y finalización a migrations y
  flujos ya implementados;
- el endurecimiento de PWA, seguridad, privacidad, contrato de pruebas y claridad
  UX antes de la aceptación manual.

Estos puntos sirven para “cómo llegamos acá”. No deben mezclarse con una foto
sin fecha del comportamiento vigente.

### Evidencia manual pendiente

El repositorio demuestra el contrato técnico y registra P0 como aprobado, pero
el runbook no contiene todavía resultados cerrados para:

- `S1–S8`: navegador/PWA, Group, invitaciones, Room, acción de compartir,
  Presence y host en dispositivos o perfiles reales;
- `N1`: sesión natural de juego con personas;
- `C1–C10`: privacidad, discusión, ramas de votación, intento, marcador,
  nueva ronda y `finished` con actores reales;
- `R1–R4`: segundo plano/primer plano, pérdida de red, avance remoto y sucesión real
  después de staleness;
- `U1`: actualización PWA con dos versiones realmente diferenciables;
- `E1`: revisión de evidencia segura;
- `D1`: decisión pre-beta.

Los commits `973dc0d` y `a064ce2` no constituyen dos versiones útiles para `U1`
porque `public/sw.js` conserva la misma versión de caché. Esa limitación está
registrada en el runbook y no debe reinterpretarse como un resultado.

### Conclusiones todavía no soportadas

Hasta cerrar la evidencia anterior, este relato no afirmará:

- que la aceptación pre-beta fue aprobada;
- que Android Chrome instalado o iOS Add to Home Screen pasaron;
- que la recuperación multi-actor real pasó en teléfonos;
- que la actualización PWA pasó;
- que la UX resultó clara para usuarios reales;
- que el juego fue divertido, fluido o exitoso en sesiones con personas;
- que existe impacto medido en usuarios.

## Riesgos de contradicción o falta de evidencia

1. **Documentos acumulativos con cortes históricos.** Algunos apartados del
   modelo de estados todavía dicen “al cierre de Incremento 7” o llaman
   “planificado” a un estado que migrations posteriores ya implementaron. Son
   útiles para historia, pero no bastan para afirmar comportamiento actual.
2. **Arquitectura conceptual previa a detalles físicos.** El documento de
   arquitectura conserva frases como “no se diseñan todavía tablas” junto a
   actualizaciones posteriores. Las tablas y funciones vigentes se verifican
   en la secuencia completa de migrations.
3. **Validadores históricos reparados.** El commit `53e9799` corrigió
   expectativas antiguas contradichas por migrations más nuevas. Una prueba
   vieja aislada no debe tratarse como contrato superior a la evolución del
   esquema.
4. **Diferencia entre garantía técnica y experiencia real.** Las pruebas
   unitarias y de DB sostienen invariantes, pero no prueban instalación
   iOS/Android, suspensión real de temporizadores, ergonomía móvil ni
   comprensión del juego.
5. **Ausencia de E2E completo de navegador.** `test:pre-playtest` combina unit,
   lint, build, validadores DB y pruebas de humo Realtime, pero no incluye hoy
   un E2E del flujo crítico completo. La aceptación manual cubre temporalmente
   ese riesgo.
6. **Rama remota no verificable localmente.** No existe
   `origin/pre-beta-playtest` en las referencias disponibles. Solo se puede
   afirmar el estado de la rama local.
7. **Runbook aún sin cierre registrado.** P0 tiene `PASS`; el resto de la matriz
   está vacío. No debe inferirse un resultado por el hecho de que la ejecución
   esté en curso.
8. **Detalles técnicos configurables.** La consulta periódica de aproximadamente
   3 segundos, el heartbeat de 30 y el vencimiento stale de 90 son decisiones
   iniciales implementadas, no reglas universales del producto.
9. **Seguridad no equivale a secreto absoluto.** El diseño evita entregar datos
   no autorizados y restringe acceso mediante RLS/RPC; el relato no debe prometer
   propiedades criptográficas o resistencia a amenazas que el proyecto no haya
   definido y probado.

## Estructura narrativa propuesta

El orden responde a la comprensión humana: primero por qué existe el producto,
después qué cosas deben distinguirse, luego quién decide, cómo convergen los
teléfonos y finalmente cómo se valida.

1. **Cuando el teléfono debe retirarse.** Problema social, propósito y límite de
   la intervención digital.
2. **Una plataforma pequeña, un dominio concreto.** Juegos Familiares frente a
   Impostor y el costo evitado de generalizar antes de tiempo.
3. **Reconocer sin pedir una cuenta tradicional.** Auth anónima, `Player`,
   `Group` y `LocalIdentity`; comodidad local frente a autorización remota.
4. **Pertenecer no es estar jugando.** `Group` frente a `Room`; autoridad de
   plataforma, administración persistente y host temporal; pertenencia frente a
   disponibilidad.
5. **Congelar una tanda sin congelar el mundo.** `GameSession`, `SessionPlayer`,
   `Round`, estado global, estado individual y capturas persistentes.
6. **El servidor decide; cada teléfono ve una parte.** `auth.uid()`, RLS, RPC,
   autoridad, privacidad y vistas de lectura.
7. **Sincronizar no es obedecer eventos.** Cómo convergen los dispositivos
   mediante invalidación de Realtime, consulta periódica, vistas de lectura y
   nueva lectura autoritativa.
8. **Tres significados de “estar”.** Cómo se decide disponibilidad y autoridad
   temporal mediante pertenencia a Room, Presence, actividad reciente,
   heartbeat, staleness y sucesión determinista.
9. **Una votación bajo concurrencia.** voto privado, idempotencia, último voto,
   empate, segunda votación e intento final.
10. **De una ronda a una historia mínima.** puntuación del lado del servidor,
    marcador, nueva ronda, no repetición, `finished` e historial sin exceso de
    datos.
11. **El mundo real interrumpe.** Cómo se aplican los mecanismos anteriores ante
    recarga, bloqueo de pantalla, segundo plano/primer plano, desconexión y
    reconexión, varias pestañas y reapertura.
12. **Una PWA que no promete lo que no puede dar.** instalación, estructura
    estática, service worker, caché, actualizaciones y límite del gameplay sin
    conexión.
13. **Cambiar sin perder el contrato.** migrations, evolución del modelo,
    decisiones revisadas y abstracciones evitadas.
14. **Probar según lo que puede fallar.** dominio puro, pruebas unitarias,
    migrations, validadores DB, Realtime, pruebas de humo, E2E ausente y
    aceptación manual.
15. **Lo inesperado y lo transferible.** decisiones contraintuitivas, costos
    asumidos, aprendizajes y preguntas que quedan abiertas.

Los capítulos 7, 8 y 11 se complementan sin duplicarse: el 7 explica el
mecanismo de convergencia, el 8 define disponibilidad y sucesión, y el 11 aplica
ambos ante interrupciones concretas del navegador y del teléfono.

Los diagramas se evaluarán después de estabilizar este orden. Los candidatos
más útiles son identidad/pertenencia, `Group → Room → GameSession → Round`,
estado completo frente a vista privada, invalidación frente a autoridad y
Presence frente a liveness.

## Matriz inicial de trazabilidad

Esta matriz es deliberadamente inicial. Se ampliará al redactar cada capítulo y
se revisará contra el estado vigente antes de cerrar el relato.

Los nombres breves de migrations identifican su sufijo único dentro de
`supabase/migrations/`; los archivos de prueba y validadores se nombran de forma
exacta. La selección es representativa, no un inventario exhaustivo.

| Tema | Problema | Decisión | Documentación | Código / SQL | Pruebas representativas | Estado final | Evidencia pendiente |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plataforma y dominio | compartir capacidades reales sin inventar un motor | plataforma mínima + dominio Impostor; sin genéricos | principios §Proyecto y desarrollo; arquitectura §§2–4 | `app/page.tsx`; `app/impostor/`; `lib/platform/`; `lib/supabase/impostor-rooms.ts` | `app/page.test.ts`; `app/impostor/page.test.ts` | Actual verificado + decisión | segundo juego real para reevaluar abstracciones |
| Identidad anónima | baja fricción sin perder identidad técnica | sesión anónima de Supabase vinculada a un `Player` | brief plataforma §§Identidad/Crear grupo; arquitectura §7; requisitos §6 | `lib/supabase/anonymous-auth.ts`; migration `create_groups_players` | `anonymous-auth.test.ts`; `create_groups_players.test.ts`; `validate-2-2.mjs` | Actual verificado | recuperación avanzada fuera del MVP |
| `LocalIdentity` | recordar contexto sin convertir localStorage en permiso | pista local; reconocimiento desde Auth y estado remoto | brief plataforma §Identidad; arquitectura §7; modelo conceptual §3 | `local-identity.ts`; `platform-bootstrap.ts` | `local-identity.test.ts`; `platform-bootstrap.test.ts` | Actual verificado | comportamiento real tras limpiar sesión/dispositivo |
| `Group` / `Room` | grupo habitual no equivale a jugadores presentes | entidades y ciclos separados | briefs §Grupo/§Sala; arquitectura §§8,12; modelo conceptual §§1,6 | migrations `create_groups_players` y `create_rooms`; `getMyActiveRoom()` | `create_rooms.test.ts`; `validate-4-1.mjs`; `validate-4-3.mjs` | Actual verificado | S4–S6 |
| `platform_admin` | no abrir creación de grupos a cualquier identidad | autoridad de plataforma que actualmente habilita crear grupos | brief plataforma §Crear grupo; arquitectura §13 | migration `restrict_group_creation_to_platform_admin`; `getMyPlatformPermissions()` | `restrict_group_creation_to_platform_admin.test.ts`; `validate-smoke-ux-2-platform-admin-group-creation.mjs` | Actual verificado | S4 |
| Administrador de `Group` / host de `Room` | poder persistente no equivale a conducción temporal | roles independientes; crear un Group asigna su admin inicial, pero administrarlo no concede host | arquitectura §14; decisiones §§Administrador/Host | `groups.admin_player_id`; `rooms.host_player_id`; RPCs de Group y Room | `create_groups_players.test.ts`; `create_rooms.test.ts`; `validate-5-3.mjs` | Actual verificado | S8 y R4 |
| Capas de estado | distinguir pista local, verdad compartida, secreto, operación e historia | responsabilidades y visibilidad separadas | arquitectura §§5,12,17; modelo conceptual §§3,7–11; requisitos §§9–10,23 | `LocalIdentity`; tablas operativas; `get_my_game_state()`; tablas `*_history` | `platform-bootstrap.test.ts`; `get_my_game_state_finished_12_3.test.ts`; `validate-12-3.mjs` | Actual verificado con simplificación pedagógica | C1, C9, C10 y E1 |
| Máquina de fases y condiciones | impedir transiciones fuera de orden o por actor incorrecto | `GameSession.state` + RPCs autoritativas con validación de fase y host | modelo de estados §§Estados globales/Transiciones; requisitos §§20–23 | migrations `start_session_6_3`, `submit_second_round_vote_9_2` y `end_session_12_2` | sus pruebas de migration; `validate-9-2.mjs`; `validate-12-2.mjs` | Actual verificado | C2–C10 |
| Vista privada de palabra y rol | no entregar el secreto antes del resultado | vista por solicitante y fase; `word = null` para el impostor mientras sigue secreta | reglas §Información privada; arquitectura §17; requisitos §§8,20–21 | migration final `get_my_game_state_finished_12_3`; `getMyGameState()` | `get_my_game_state_impostor_guess_10_2.test.ts`; `get_my_game_state_scoreboard_11_4.test.ts`; `validate-10-2.mjs` | Actual verificado | C1, C6 y C7 sin capturar secretos |
| Autoridad | el cliente manipulable no decide pertenencia, permisos ni fases | `auth.uid()` + RLS + RPCs específicas | arquitectura §§13,15; requisitos §§5,7,12–14 | políticas, permisos y RPCs 0-args o con intención mínima | `start_session_6_3.test.ts`; `submit_round_vote_8_2.test.ts`; `validate-8-2.mjs` | Actual verificado | revisión manual de UX de errores |
| Realtime de Room | eventos pueden perderse o llegar tarde | invalidar y reconstruir desde lecturas autorizadas | arquitectura §19; requisitos §§4,17 | `subscribeToRoomChanges()` → `refreshAuthoritativeRoomState()` → `getMyActiveRoom()` → `getMyGameState()` si corresponde | `sync_room_lobby_realtime.test.ts`; `room-lobby-shell.test.ts`; pruebas de humo `4.4/4.5` | Actual verificado | R2/R3 en dispositivos reales |
| Consulta periódica de gameplay | las fases no siempre cambian la Room | consultar `get_my_game_state()` cada ~3 s mientras la pestaña está visible | arquitectura §19; requisitos §§20–23 | `createGameplayPollLoop()`; integración en `room-lobby-shell.tsx` | `room-lobby-shell.test.ts`, bloque `createGameplayPollLoop` | Actual verificado | ritmo y batería en N1 |
| Presence / actividad reciente | conectado no equivale a pertenecer ni a actividad autoritativa | señales separadas; heartbeat 30 s; stale 90 s | decisiones §Presence; arquitectura §§20,25; requisitos §§15–16 | Presence privada; `last_seen_at`; `refresh_my_room_liveness()` | `room_lobby_presence_5_1.test.ts`; `room_liveness_5_2.test.ts`; `validate-5-2.mjs` | Actual verificado | S8 y R4 |
| Sucesión de host | varios clientes pueden reaccionar a la misma ausencia | backend serializa y elige por `joined_at`, luego `player_id`; exige actividad vigente | arquitectura §25; requisitos §16 | versión final de `reassign_room_host_if_stale()` en `start_session_6_3` | `host_succession_5_3.test.ts`; `start_session_6_3.test.ts`; `validate-5-3.mjs` | Actual verificado | vencimiento real R4 |
| Varias pestañas | un mismo jugador puede producir varias conexiones | claves de Presence por conexión y deduplicación por `Player`; actividad reciente compartida | requisitos §17 “Multi-tab y multi-device” | `createRoomPresenceKey()`; `getConnectedRoomParticipantIds()` | `impostor-rooms.test.ts`, casos de múltiples Presence y recuperación | Verificado unitariamente | validación práctica con varias pestañas en S8/R1–R3 |
| Plantel de tanda | la conexión puede cambiar durante una tanda | captura estable en `session_players` | modelo conceptual §§8–9; arquitectura §15; requisitos §20 | migration `start_session_6_3`; `session_players` | `start_session_6_3.test.ts`; `validate-6-3.mjs`; `validate-8-2.mjs` | Actual verificado | C1–C10 y R1–R4 con varios actores |
| Privacidad de votos | secreto durante la votación sin perder recuperación propia | mostrar voto propio durante la fase, agregados tras resolver y nunca el mapa histórico de quién votó a quién | reglas §§Votación/Resultado; requisitos §21 | `round_votes`; migration final `get_my_game_state_finished_12_3` | `get_my_game_state_voting_8_3.test.ts`; `validate-8-3.mjs`; `validate-12-5.mjs` | Actual verificado | C3–C5 y E1 |
| Votación y empate | votos simultáneos y reintentos deben producir un resultado único | voto único por etapa; resolución autoritativa; máximo dos votaciones | reglas §§Votación–Empate; requisitos §21 | migrations `submit_round_vote_8_2`, `start_second_round_voting_9_1`, `submit_second_round_vote_9_2` | pruebas homónimas; `validate-8-2.mjs`; `validate-9-2.mjs` | Actual verificado | C3–C5 |
| Intento del impostor | el cliente no debe comparar la palabra | un intento y comparación normalizada del lado del servidor | reglas §Impostor descubierto; requisitos §Incremento 10 | migration `submit_impostor_guess_10_1`; wrapper `submitImpostorGuess()` | `submit_impostor_guess_10_1.test.ts`; `validate-10-1.mjs`; `validate-10-3.mjs` | Actual verificado | C6/C7 |
| Puntuación y nueva ronda | evitar doble puntuación y palabras repetidas | puntuación idempotente; mismo plantel; selección del lado del servidor | reglas §§Puntuación–Nueva ronda; requisitos §22 | migrations `apply_round_scoring_11_2` y `start_next_round_11_3` | pruebas homónimas; `validate-11-5.mjs` | Actual verificado | C8/C9 |
| `finished` e historial | cerrar sin duplicar ni persistir datos innecesarios | sin votos individuales ni copia explícita de `secret_word`; conserva `impostor_guess_text` si hubo intento | decisiones §Terminar tanda; requisitos §23 | `finished_history_12_1`; `end_session_12_2`; vista de lectura `12_3` | `end_session_12_2.test.ts`; `validate-12-2.mjs`; `validate-12-5.mjs` | Actual verificado con minimización acotada | C10 y E1 |
| Reconstrucción | la UI local puede quedar desactualizada | primer plano/conexión/reintento vuelven a leer autoridad | decisiones de reconexión; requisitos §17; arquitectura §26 | `refreshAuthoritativeRoomState()` y manejadores de `room-lobby-shell.tsx` | `room-lobby-shell.test.ts`, casos de primer plano, conexión y estado terminal | Actual verificado técnicamente | R1–R3 reales |
| PWA y caché | una caché útil puede servir autoridad obsoleta | cachear solo estáticos del mismo origen; red para autoridad | decisiones §Alcance offline y PWA; requisitos §24 | `app/manifest.ts`; `public/sw.js`; `next.config.ts` | `manifest.test.ts`; `sw.test.ts`; `next.config.test.ts` | Actual verificado técnicamente | S1–S3 |
| Actualización PWA | una versión nueva no debe recargar una tanda activa | aviso explícito; actualización bloqueada en ruta crítica; activación controlada | requisitos §24 “Update lifecycle” (ciclo de actualización) | `service-worker-registration.tsx`; mensaje `JUEGOS_FAMILIA_APPLY_UPDATE` en `sw.js` | `service-worker-registration.test.tsx`; `sw.test.ts` | Actual verificado técnicamente | U1 con dos versiones diferenciables |
| Estrategia de pruebas | ningún tipo de prueba cubre todos los riesgos | capas proporcionales al riesgo | método §6; plan Incremento 15; protocolo §§7,16 | scripts de `package.json`; suites unitarias, DB y Realtime | P0 registrado `PASS` en el runbook | Automatizado verificado en P0 | E2E completo ausente; N1/E1/D1 pendientes |

## Relato — 1. Cuando el teléfono debe retirarse

Impostor no nace de una necesidad de mantener a cuatro personas mirando una
pantalla. Nace de la situación contraria: hay personas reunidas que quieren
hablar, sospechar, improvisar y reírse juntas. El software solo resulta útil en
los momentos en los que un teléfono puede coordinar algo que sería incómodo o
inseguro hacer a mano.

Hay que reunir a quienes juegan ahora, elegir una palabra sin repetirla,
asignar un impostor, entregar información diferente a cada persona, recoger
votos secretos y mantener un marcador. Después de eso, durante las pistas y la
discusión, la aplicación debe apartarse. No necesita registrar qué dijo cada
jugador, controlar turnos ni imponer un temporizador.

Esta frontera de producto reduce complejidad técnica por una razón humana. Si
la aplicación intentara modelar cada gesto de la conversación, agregaría estado
distribuido, sincronización y fallas posibles justo en la parte que el grupo ya
sabe resolver presencialmente. Por eso el proyecto digitaliza la coordinación
que aporta valor y deja la conversación en el mundo real.

La decisión produce un sistema híbrido:

```text
teléfonos
→ identidad, privacidad, coordinación, voto y marcador

personas reunidas
→ pistas, conversación, sospecha y ritmo de la ronda
```

El costo asumido —el trade-off— es deliberado. La aplicación no puede verificar
que todos hablaron ni medir automáticamente si la conversación fue justa. A
cambio, evita imponer un protocolo digital pesado y conserva el carácter
social del juego. Esa es una lección transferible: no todo lo que ocurre
alrededor de un producto necesita convertirse en datos o estados del sistema.

**Estado de la afirmación:** la frontera funcional está documentada en el brief,
las reglas y los principios, y el código no implementa turnos, pistas ni
temporizador. Que esta frontera produzca una experiencia clara y divertida
sigue siendo una hipótesis de producto pendiente de `N1`.

## Relato — 2. Una plataforma pequeña, un dominio concreto

Juegos Familiares es la entrada común; Impostor es el primer juego. La
distinción parece organizativa, pero evita dos errores opuestos.

El primer error sería construir todo como si solo pudiera existir Impostor. La
identidad anónima, el grupo habitual, los jugadores, la navegación y el ciclo de
vida de la PWA ya son capacidades razonablemente compartibles. El segundo sería
inventar un motor universal para juegos que todavía no existen.

Para hablar con precisión sin perder la situación humana, el proyecto usa estos
nombres:

```text
el grupo habitual                         → Group
las personas reunidas para jugar ahora   → Room
la tanda competitiva completa            → GameSession
cada unidad de juego dentro de la tanda  → Round
```

`Group` pertenece a la plataforma porque expresa una relación persistente que
puede servir a más de un juego. En cambio, una `Room`, un impostor, una
votación, una `GameSession` o una `Round` forman hoy parte del dominio concreto
de Impostor. No se vuelven universales solo porque el proyecto imagine agregar
otro juego en el futuro.

La solución es compartir únicamente lo demostrado:

```text
Juegos Familiares
├── identidad, Group, Player, navegación y ciclo de vida PWA
└── Impostor
    ├── banco de palabras
    ├── Room y GameSession
    ├── Round, votos y resolución
    └── marcador e historial específico
```

Por eso no existen `GenericGame`, `GenericRoom` ni `GameEngine`. La alternativa
de generalizar desde el primer juego podría producir una arquitectura más
simétrica sobre el papel, pero trasladaría hipótesis a interfaces y tablas que
después serían costosas de cambiar. La opción actual acepta cierta duplicación
futura si aparece un segundo dominio; esa duplicación será evidencia para
extraer una abstracción real.

**Comportamiento actual verificado:** la separación aparece en documentación,
rutas y módulos actuales. **Evolución futura:** un segundo juego podrá revelar
qué conceptos son realmente compartidos. Hasta entonces, esa generalización es
una pregunta abierta, no trabajo pendiente del MVP.

## Próximos capítulos a redactar

El siguiente bloque debe desarrollar “Reconocer sin pedir una cuenta
tradicional”. Antes de redactarlo por completo se ampliará la matriz con las
políticas RLS y los casos adversariales exactos que prueban la relación
`auth.uid() → Player → Group`.

Después conviene avanzar en este orden:

1. identidad y pertenencia;
2. modelado de Room, GameSession y Round;
3. autoridad, privacidad y vistas de lectura;
4. sincronización, Presence, actividad reciente y reconstrucción;
5. concurrencia y resolución completa de la tanda;
6. PWA, evolución mediante migrations y estrategia de validación;
7. aprendizajes y evidencia manual una vez cerradas `U1`, `E1` y `D1`.

## Marcadores de evidencia pendiente

> **PENDIENTE — U1:** incorporar únicamente el resultado registrado de una
> actualización con dos versiones PWA realmente diferenciables. No inferirlo
> desde pruebas del service worker.

> **PENDIENTE — E1:** revisar que la matriz manual esté completa, que fallas y
> bloqueos tengan incidentes/motivos y que la evidencia no exponga palabras,
> roles, votos, tokens ni datos personales no consentidos.

> **PENDIENTE — D1:** registrar la decisión pre-beta exacta —aceptada, bloqueada
> o rechazada— solo cuando se cumplan los criterios del protocolo. Hasta
> entonces, toda conclusión de aprobación permanece no soportada.
