# Protocolo de aceptacion manual pre-beta

Este documento define como preparar, ejecutar y registrar la aceptacion manual
general pre-beta de Juegos Familiares / Impostor.

No registra una ejecucion realizada ni declara resultados. Su funcion es que
otra persona pueda ejecutar el protocolo sin depender de conversaciones previas.

---

# 1. Proposito

Preparar una aceptacion manual general antes de declarar el MVP listo para una
beta familiar curada.

La aceptacion debe comprobar que:

* los flujos principales de Impostor funcionan con cuatro personas;
* la experiencia mobile es clara en telefonos reales;
* la PWA se comporta razonablemente en navegador e instalada;
* la app recupera estado autoritativo despues de interrupciones reales;
* la evidencia capturada permite diagnosticar fallas sin exponer secretos.

La aceptacion combina observacion natural de juego y escenarios tecnicos
controlados. La sesion natural ocurre primero, antes de dirigir votos,
forzar empates o revelar informacion para pruebas especificas.

---

# 2. Alcance y fuera de alcance

## Incluido

* protocolo operativo;
* preflight automatizado;
* smoke tecnico multi-dispositivo;
* sesion natural de playtesting;
* escenarios tecnicos controlados;
* checklist de evidencia no sensible;
* criterios `PASS`, `FAIL`, `BLOCKED` y `NOT RUN`;
* plantilla de incidentes;
* tratamiento de pendientes externos de Incrementos 14 y 15.4;
* decision explicita sobre el gap de E2E;
* puerta objetiva para evaluar observabilidad adicional.

## Restricciones de esta tarea documental

Durante la creacion o correccion de este documento de Incremento 15.5 no esta
autorizado:

* implementar codigo;
* modificar tests;
* crear migrations;
* ejecutar tests, builds, resets, servicios, deploys o aceptacion manual real;
* hacer stage, commit, reset, restore, merge o push;
* modificar otros documentos.

Estas restricciones aplican al trabajo documental de 15.5, no a la futura
ejecucion del protocolo.

## Fuera de alcance del protocolo

El protocolo si puede describir y, en una fase futura autorizada, ejecutar
preflight, servicios locales controlados, deploy autorizado y aceptacion manual.

Siguen fuera de alcance del protocolo:

* cambios de codigo, tests o migrations;
* infraestructura nueva;
* analytics generales;
* dashboards;
* servicios externos de monitoreo;
* logging de palabras, roles, votos, tokens, credenciales o datos personales;
* redisenio UX;
* cambios de reglas;
* gameplay offline;
* nuevos contratos backend;
* reconciliar la numeracion operativa `15.x`.

---

# 3. Fuentes y contratos

La aceptacion manual se apoya en estas fuentes vigentes:

* `sources/implementation-plan.md`: Incremento 15 exige revisar el MVP antes de
  considerarlo listo para uso familiar sostenido, con pruebas en telefonos,
  privacidad validada y observabilidad basica para depurar partidas familiares.
* `sources/portfolio-case-study.md`: el MVP jugable esta cerrado tecnicamente,
  pero siguen pendientes Android/iOS reales, multi-actor real, auditoria final,
  playtesting y validacion fisica multi-dispositivo completa.
* `sources/project-principles.md`: la experiencia es mobile-first, la tecnologia
  acompana al juego presencial y la infraestructura debe ser proporcional.
* `sources/architecture.md`: Supabase/Postgres/RPC/read models son autoridad;
  Realtime y Presence invalidan o avisan, no autorizan.
* `sources/games/impostor/product-brief.md`: el caso de referencia son cuatro
  jugadores, cada uno con su telefono, en una experiencia social presencial.
* `sources/games/impostor/product-decisions.md`: no se promete soporte offline
  completo para salas sincronizadas y no se agregan capacidades sin necesidad.
* `sources/games/impostor/technical-requirements.md`: despues de reconnect,
  foreground, reapertura, update u offline, el estado vigente debe reconstruirse
  desde backend/refetch autoritativo.
* `sources/games/impostor/user-flow.md`: la UI debe mostrar estados vigentes,
  ocultar privados stale durante reconciliacion y permitir recovery/retry cuando
  corresponda.
* `sources/working-method.md`: la validacion se ajusta al riesgo; la pregunta
  central es que podria salir mal y como se comprueba.
* `README.md`: documenta entorno local, Supabase local, perfiles aislados,
  admin local, comandos y advertencias de reset.
* `package.json`: declara los comandos reales disponibles.

Contrato central:

```text
servidor / DB = autoridad
frontend = cache temporal / presentacion
PWA cache != game-state authority
```

Nunca se debe tratar cache, LocalIdentity, Presence, navegador, screenshots o
notas manuales como autoridad de Room, GameSession, fase, host, palabra, rol,
votos, marcador o permisos.

---

# 4. Responsables y roles

## Facilitador

Coordina la sesion, prepara entorno y datos, guia los escenarios controlados,
registra resultados y detiene la prueba si aparece una falla critica.

No debe mirar ni pedir secretos privados durante la sesion natural.

## Observador

Registra fricciones, comentarios espontaneos, tiempos aproximados, incidentes y
evidencia segura. Puede ser la misma persona que facilita si el grupo es chico,
pero conviene separar ambos roles cuando sea posible.

## Actores de juego

Usar aliases estables:

```text
A -> actor admin / host inicial
B -> actor invitado
C -> actor invitado
D -> actor invitado
```

Los nombres reales no deben publicarse sin consentimiento. En evidencia
publicable, preferir siempre A/B/C/D.

## Responsable tecnico

Interpreta incidentes despues de la sesion. No corrige durante la aceptacion
salvo que sea necesario para desbloquear una prueba marcada como nueva corrida.

---

# 5. Entornos

No asumir que un unico entorno sirve para todo.

| Entorno | Uso | Requisitos | No usar para |
| --- | --- | --- | --- |
| Supabase local controlado | Preflight tecnico, validadores DB, preparacion local repetible | `.env.local` apunta a `http://127.0.0.1:54321`; Supabase local iniciado; DB local reseteada solo si se acepta perder datos locales | Validar instalacion real PWA iOS/Android si no hay HTTPS accesible |
| Candidato HTTPS controlado | Dispositivos reales, instalacion PWA, A2HS, update y smoke multi-actor real | URL HTTPS accesible desde telefonos; commit exacto conocido; entorno remoto identificado | Ejecutar resets locales o asumir datos descartables |
| Entorno remoto identificado | Beta curada o preview con datos reales controlados | proyecto, URL, commit/version, politica de datos y admin autorizados documentados | Comandos destructivos locales como si fueran produccion |

Cada ejecucion debe registrar:

* commit exacto;
* rama;
* URL;
* tipo de entorno;
* version desplegada cuando aplique;
* fecha y hora aproximada;
* quien preparo admin, Group, actores y palabras;
* si los datos pueden descartarse o deben preservarse.

---

# 6. Precondiciones

## Obligatorias para iniciar preparacion

* El repo local esta en el commit candidato esperado.
* `git status --short` esta limpio.
* El entorno objetivo esta identificado sin ambiguedad.
* La URL es accesible desde todos los dispositivos involucrados.
* Hay cuatro actores con sesiones aisladas.
* Hay al menos un dispositivo Android con Chrome.
* Hay al menos un dispositivo iOS con Safari.
* Hay capacidad de probar navegador sin instalacion.
* Hay capacidad de probar PWA instalada o Add to Home Screen.
* El facilitador sabe que datos no puede capturar.

## Obligatorias para ejecutar juego completo

* Existe un Group preparado.
* El actor A puede crear o administrar el Group segun el entorno.
* B/C/D pueden unirse por invitacion.
* Existe un banco con palabras suficientes para dos rondas.
* Cada actor usa su propia sesion o perfil.
* Ninguna sesion comparte Auth/local storage con otro actor.

## Bloqueo operativo

Marcar `BLOCKED` si falta algun dispositivo, URL, sesion, entorno identificado,
admin autorizado o preparacion minima de datos.

## Bloqueo tecnico

Marcar `FAIL` o bloquear la aceptacion si una falla de producto impide avanzar
en un flujo central ya preparado, especialmente si afecta autoridad, privacidad
o recuperacion.

---

# 7. Preflight tecnico

El preflight tecnico confirma que el candidato no parte de una base rota antes
de reunir personas y telefonos.

## Comandos documentados

Los comandos reales declarados por el repo son:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:pre-playtest
npm run supabase:stop
```

`npm run test:pre-playtest` ejecuta:

```text
npm test
npm run lint
npm run build
npm run test:db:all
npm run test:realtime
```

Ese comando no inicia Supabase local y no resetea la DB automaticamente.

## Precondiciones del preflight

Antes de ejecutar `npm run test:pre-playtest` en una fase futura:

* instalar dependencias si corresponde;
* iniciar Supabase local con `npm run supabase:start`;
* confirmar que `.env.local` apunta al Supabase local;
* resetear la DB local solo si se acepta perder datos locales;
* entender que `npm run supabase:reset` es destructivo exclusivamente para la
  DB local y no equivale a ningun procedimiento de produccion.

## Resultado esperado

* `npm run test:pre-playtest` termina en PASS.
* Si falla, no iniciar aceptacion manual general hasta clasificar la causa.
* Si no se ejecuta por decision de alcance, registrar `NOT RUN` con motivo.

---

# 8. Preparacion de actores, dispositivos y datos

## Actores

Usar cuatro actores aislados:

```text
A -> host inicial / admin operativo
B -> invitado
C -> invitado
D -> invitado
```

Cada actor debe tener:

* sesion Auth separada;
* navegador, perfil o dispositivo propio;
* alias estable en la planilla de evidencia;
* consentimiento sobre que evidencia puede capturarse.

## Dispositivos

Registrar para cada dispositivo:

* alias del dispositivo;
* sistema operativo y version aproximada;
* navegador y version aproximada;
* modo `browser` o `installed`;
* si permite Web Share;
* si permite clipboard;
* si se puede cortar y restaurar red sin afectar a todo el grupo.

## Datos

Preparar:

* un Group de prueba;
* invitacion de Group;
* una Room creada por A;
* invitacion o codigo de Room;
* banco con palabras suficientes para al menos dos rondas;
* una lista privada de palabras de control solo para escenarios tecnicos donde
  sea necesario forzar guess correcto.

No usar palabras sensibles, datos personales reales ni referencias que no deban
aparecer accidentalmente en screenshots.

---

# 9. Matriz de escenarios

Cada escenario debe registrarse con `PASS`, `FAIL`, `BLOCKED` o `NOT RUN`.

## Orden operativo de ejecucion

El orden de una aceptacion manual general futura debe ser:

1. Preflight.
2. Preparacion y smoke tecnico S1-S8.
3. Sesion natural N1.
4. Corridas tecnicas controladas.
5. Recovery/PWA.
6. Revision y decision.

S4-S8 ocurren antes de N1 porque preparan Group, actores, Room, invitaciones,
share/clipboard y liveness basico. La sesion natural debe ocurrir antes de los
escenarios que dirigen votos, fuerzan ramas tecnicas o revelan informacion que
una partida real no revelaria.

## Corridas y tandas separadas

C1-C10 no son una unica secuencia lineal obligatoria. Son bloques de validacion
que deben ejecutarse en corridas o tandas separadas cuando sea necesario para
forzar ramas sin contaminar la observacion natural.

| Corrida | Estado inicial | Room/tanda | Datos necesarios | Escenarios principales |
| --- | --- | --- | --- | --- |
| Corrida natural | S1-S8 completados o bloqueos clasificados; cuatro actores listos | Room preparada para juego real sin dirigir votos | banco de palabras no sensibles suficiente para una ronda | N1 |
| Corrida tecnica de empate y segunda votacion | actores A/B/C/D en una Room tecnica; host identificado | tanda tecnica nueva o ronda reiniciable | patron publico de empate por alias, sin ejecutar C3 como votacion separada | C1-C5 y C8 si la ronda resuelve |
| Corrida de guess incorrecto | Room tecnica en ronda donde el impostor se identifica privadamente ante el facilitador despues de C1 | tanda tecnica separada de la natural | patron privado minimo para llegar a `impostor_guess`; texto deliberadamente incorrecto | C1-C3, C6 y C8 |
| Corrida de guess correcto | Room tecnica en ronda donde el impostor se identifica privadamente ante el facilitador despues de C1 | tanda tecnica separada; llegar primero a `impostor_guess` | palabra activa comunicada privadamente por un jugador normal al facilitador solo despues de `impostor_guess` | C1-C3, C7 y C8 |
| Corrida de nueva ronda/finished | Room tecnica en `scoreboard` con host vigente | tanda con al menos una ronda resuelta | palabras suficientes para una segunda ronda | C8-C10 |
| Corridas de recovery, sucesion y PWA | partida en curso o PWA instalada segun caso | Room/tanda activa solo cuando el escenario lo requiere | forma controlada de background, red, staleness o dos versiones | R1-R4 y U1 |

Cada corrida debe registrar su propio estado inicial, Room o tanda usada,
actores, datos preparados, escenarios ejecutados y decision de continuar,
repetir o detener.

## Matriz resumida

| ID | Escenario | Tipo | Actores | Dispositivos | Evidencia minima |
| --- | --- | --- | --- | --- | --- |
| P0 | Preflight tecnico automatizado | Preflight | responsable tecnico | local | comando previsto, entorno, resultado |
| S1 | Navegador movil sin instalacion | Smoke tecnico | A/B | Android o iOS browser | pantalla inicial, URL, modo browser |
| S2 | Android Chrome installed PWA | Smoke tecnico | A/B | Android Chrome | instalacion, apertura, navegacion basica |
| S3 | iOS Safari Add to Home Screen | Smoke tecnico | A/B | iOS Safari | A2HS, apertura, navegacion basica |
| S4 | Crear y recuperar Group | Controlado | A | browser o instalado | Group visible tras refresh/reapertura |
| S5 | Invitacion y sesiones A/B/C/D | Controlado | A/B/C/D | perfiles/dispositivos aislados | cuatro actores en Group |
| S6 | Crear, compartir y unirse a Room | Controlado | A/B/C/D | mixto | Room visible, jugadores unidos |
| S7 | Web Share y clipboard reales | Controlado | A + receptor | Android/iOS | exito o error visible seguro |
| S8 | Lobby, Presence, liveness y host | Controlado | A/B/C/D | mixto | host visible, estados de conexion |
| N1 | Sesion natural de playtesting | Natural | A/B/C/D | telefonos reales | notas de comprension, ritmo y friccion |
| C1 | Role reveal y privacidad por actor | Controlado | A/B/C/D | telefonos reales | confirmacion sin capturar secretos |
| C2 | Discusion | Controlado | A/B/C/D | telefonos reales | fase correcta y host actual |
| C3 | Primera votacion | Controlado | A/B/C/D | telefonos reales | voto registrado sin votos individuales |
| C4 | Empate forzado | Controlado | A/B/C/D | telefonos reales | resultado agregado de empate |
| C5 | Segunda votacion sin tercera votacion | Controlado | A/B/C/D | telefonos reales | resolucion definitiva |
| C6 | Impostor descubierto con guess incorrecto | Controlado | A/B/C/D | telefonos reales | resultado de ronda |
| C7 | Impostor descubierto con guess correcto | Controlado | impostor + grupo | telefonos reales | resultado de ronda |
| C8 | Scoreboard | Controlado | A/B/C/D | telefonos reales | marcador acumulado |
| C9 | Nueva ronda sin privado stale | Controlado | A/B/C/D | telefonos reales | nueva ronda, secretos no stale |
| C10 | Fin de tanda y `finished` | Controlado | A/B/C/D | telefonos reales | resultado final compartido |
| R1 | Background/foreground | Controlado | host + guest | Android/iOS | fase/host vigentes al volver |
| R2 | Perdida y recuperacion de red | Controlado | uno o mas actores | Android/iOS | offline/reconnecting y recuperacion |
| R3 | Avance remoto de fase offline | Controlado | actor offline + resto | mixto | actor vuelve a fase actual |
| R4 | Sucesion de host real | Controlado | host + sucesor | telefonos reales | host nuevo despues de staleness |
| U1 | Actualizacion PWA dos versiones | Controlado | actor instalado | candidato HTTPS | aviso/update sin reload en sala activa |
| E1 | Revision de evidencia | Cierre | facilitador/observador | n/a | matriz completa e incidentes clasificados |
| D1 | Decision pre-beta | Cierre | responsable | n/a | aceptada, bloqueada o con pendientes |

---

# 10. Sesion natural de playtesting

La sesion natural debe ocurrir antes de los escenarios controlados que dirigen
votos, fuerzan empates o revelan informacion.

## Objetivo

Observar el juego como experiencia social, no como checklist tecnico.

Registrar:

* comprension de reglas;
* claridad UX/UI;
* fricciones;
* confusiones;
* ritmo;
* interrupciones causadas por la aplicacion;
* momentos divertidos;
* comentarios espontaneos;
* acciones que las personas intentan antes de que el facilitador las explique.

## Reglas de facilitacion

* No dirigir votos.
* No revelar palabra, roles ni votos privados.
* No corregir cada duda de inmediato si observarla aporta aprendizaje.
* Intervenir solo para evitar bloqueo, exposicion de privacidad o abandono de
  la sesion.
* Registrar notas con aliases A/B/C/D.

## Resultado esperado

La app permite jugar al menos una ronda completa de forma entendible y con baja
friccion, aunque aparezcan mejoras futuras de copy, ritmo o pulido visual.

---

# 11. Escenarios controlados

Los escenarios controlados se ejecutan despues de la sesion natural. Buscan
cubrir ramas tecnicas y riesgos de plataforma.

La excepcion son S1-S8: esos smokes y preparaciones se ejecutan antes de N1
porque dejan listo el entorno, los actores y la Room. Despues de N1 quedan las
corridas que fuerzan votos, ramas, recovery o revelaciones controladas.

## S1 - Navegador movil sin instalacion

Precondiciones:

* URL HTTPS o local accesible desde el telefono elegido;
* al menos un actor con sesion aislada;
* navegador movil sin PWA instalada ni modo standalone;
* cache o sesion previa identificada si existe.

Pasos:

1. Abrir la URL desde el navegador movil sin instalar la app.
2. Verificar carga inicial, navegacion basica y reconocimiento de sesion si
   corresponde.
3. Entrar al contexto disponible para el actor: inicio, Group o invitacion.
4. Refrescar la pagina.
5. Cerrar y reabrir la pestana o navegador.

Esperado:

* la app carga sin depender de instalacion PWA;
* el layout mobile es usable sin solapamientos evidentes;
* refresh y reapertura reconstruyen desde estado autorizado;
* errores de conexion o permisos, si aparecen, son visibles y recuperables;
* no aparece informacion privada de otra sesion o actor.

Evidencia:

* dispositivo, SO, navegador/version aproximada y modo `browser`;
* URL o entorno identificado sin tokens ni parametros sensibles;
* screenshot de pantalla no privada;
* notas de error visible si ocurre, sin capturar payloads sensibles.

## S2 - Android Chrome installed PWA

Precondiciones:

* dispositivo Android con Chrome;
* URL HTTPS controlada accesible desde el dispositivo;
* PWA no instalada, o instalacion previa identificada para desinstalarla antes
  de la corrida si corresponde;
* actor con sesion aislada.

Pasos:

1. Abrir la URL en Chrome Android.
2. Ejecutar el flujo disponible de instalacion o agregar a pantalla de inicio.
3. Abrir la app instalada desde el icono.
4. Verificar navegacion basica hacia inicio, Group o Room segun estado del
   actor.
5. Cerrar la app instalada y abrirla nuevamente.

Esperado:

* la instalacion queda disponible desde Chrome Android;
* la app abre en modo instalado/standalone cuando la plataforma lo permita;
* la navegacion basica conserva contexto autorizado despues de reabrir;
* la app no muestra estado de juego como autoridad si necesita refetch;
* no se exponen tokens, palabras, roles ni datos privados en pantalla.

Evidencia:

* modelo aproximado de dispositivo, version Android y Chrome;
* modo `installed`;
* screenshot de icono o apertura instalada sin datos privados;
* resultado de navegacion basica y reapertura.

## S3 - iOS Safari Add to Home Screen

Precondiciones:

* dispositivo iOS con Safari;
* URL HTTPS controlada accesible desde Safari;
* app no agregada previamente a Home Screen, o instalacion previa identificada;
* actor con sesion aislada.

Pasos:

1. Abrir la URL desde Safari iOS.
2. Usar Share Sheet y seleccionar Add to Home Screen.
3. Confirmar el nombre visible si la plataforma lo permite.
4. Abrir la app desde el icono agregado.
5. Navegar hacia inicio, Group o Room segun estado autorizado del actor.
6. Cerrar y reabrir desde Home Screen.

Esperado:

* Add to Home Screen queda disponible y abre la app desde el icono;
* la experiencia instalada no rompe navegacion basica;
* reapertura reconstruye estado vigente desde backend cuando corresponde;
* no hay dependencia de gameplay offline;
* no aparecen privados stale ni informacion de otro actor.

Evidencia:

* dispositivo, version iOS aproximada y Safari;
* modo `installed` o limitacion real observada;
* screenshot sin secretos de apertura desde Home Screen;
* notas de cualquier limitacion de plataforma.

## S4 - Crear y recuperar Group

Precondiciones:

* entorno preparado;
* A tiene permiso operativo para crear Group;
* sesion A aislada.

Pasos:

1. A abre la app.
2. A crea o accede al Group de prueba por el mecanismo autorizado del entorno.
3. A refresca o reabre la app.

Esperado:

* A vuelve al contexto reconocido;
* el Group correcto queda visible;
* no aparece onboarding incompatible con la sesion.

Evidencia:

* screenshot sin IDs internos;
* alias A;
* entorno, URL y modo browser/installed.

## S5 - Invitacion y sesiones A/B/C/D

Precondiciones:

* Group existente;
* invitacion vigente;
* cuatro perfiles o dispositivos separados.

Pasos:

1. A comparte la invitacion.
2. B, C y D abren la invitacion desde sesiones aisladas.
3. Cada actor completa su ingreso.

Esperado:

* los cuatro actores pertenecen al mismo Group;
* ninguna sesion pisa a otra;
* usuarios comunes no necesitan ser admin de plataforma.

Evidencia:

* lista visible de integrantes si no contiene nombres reales publicables;
* para evidencia publicable, reemplazar nombres por A/B/C/D.

## S6 - Crear, compartir y unirse a Room

Precondiciones:

* cuatro actores en Group;
* banco con palabras suficientes.

Pasos:

1. A crea una Room.
2. A comparte Room o codigo.
3. B/C/D se unen desde sus dispositivos.

Esperado:

* la Room muestra cuatro jugadores;
* A es host inicial;
* el codigo/enlace permite union autorizada;
* un actor ajeno no debe recibir datos utiles de Room.

Evidencia:

* screenshot de lobby con alias;
* Room code completo solo en evidencia interna si hace falta diagnostico;
* Room code oculto en evidencia publicable.

## S7 - Web Share y clipboard reales

Precondiciones:

* Room o Group compartible;
* al menos un dispositivo con Web Share disponible;
* al menos un dispositivo con clipboard disponible.

Pasos:

1. Ejecutar accion de compartir.
2. Ejecutar accion de copiar.
3. Abrir el enlace o usar el codigo desde otro actor.

Esperado:

* la app muestra exito o error comprensible;
* el receptor puede usar el enlace/codigo;
* no se copian tokens ni credenciales.

Evidencia:

* resultado visible;
* tipo de accion;
* navegador/SO;
* no capturar contenido privado de apps externas de mensajeria.

## S8 - Lobby, Presence, liveness y host

Precondiciones:

* Room con cuatro actores;
* todos con la pantalla de lobby abierta.

Pasos:

1. Observar host y jugadores conectados.
2. Bloquear brevemente un dispositivo no host y volver.
3. Repetir con host sin superar umbral de staleness.

Esperado:

* Presence puede cambiar como senal visual;
* host no cambia por Presence solamente;
* liveness se recupera al volver;
* la Room no pierde membership por una suspension corta.

Evidencia:

* host visible antes/despues;
* estados conectados/desconectados;
* tiempo aproximado de suspension.

## C1 - Role reveal y privacidad por actor

Precondiciones:

* Room con cuatro actores;
* A host;
* banco con palabras.

Pasos:

1. A inicia tanda.
2. Cada actor abre su reveal privado.
3. Cada actor confirma verbalmente que ve una pantalla coherente.

Esperado:

* exactamente un actor ve que es impostor;
* los otros actores ven la misma palabra;
* el impostor no recibe la palabra;
* un actor no ve rol/palabra de otro.

Evidencia:

* no capturar screenshots con palabra o rol antes del reveal publico de ronda;
* registrar solo `C1 PASS/FAIL` por actor;
* si falla privacidad, detener inmediatamente.

## C2 - Discusion

Precondiciones:

* todos confirmaron reveal;
* host actual identificado.

Pasos:

1. Host inicia discusion.
2. Cada actor verifica que esta en ronda en juego.
3. Un actor oculta y vuelve a mostrar localmente su rol si necesita recordarlo.

Esperado:

* todos pasan a `discussion`;
* el reveal local sigue siendo accion privada y efimera;
* host actual puede avanzar a votacion.

Evidencia:

* fase visible sin secretos;
* host visible.

## C3 - Primera votacion

Precondiciones:

* fase `discussion`;
* host actual identificado;
* si se ejecuta la corrida de empate, C3 se valida dentro de C4.

Pasos:

1. Host inicia votacion.
2. Cada actor vota.
3. Observar espera despues de votar.

Esperado:

* cada actor puede votar una vez;
* no hay resultados parciales;
* despues de votar, el actor ve estado de espera;
* la resolucion ocurre al ultimo voto.

Evidencia:

* screenshot de `Voto registrado` si no muestra voto individual;
* no registrar votos individuales salvo en patron controlado de empate;
* en corrida de empate, registrar C3 como cubierto por C4, no como votacion
  separada.

## C4 - Empate forzado

Precondiciones:

* fase `discussion`;
* host actual identificado;
* patron publico definido por facilitador.

Pasos:

1. Host inicia `voting_first`.
2. El facilitador indica un patron por alias, por ejemplo `A/B votan a C` y
   `C/D votan a B`.
3. Los primeros votos permiten comprobar voto unico, espera y ausencia de
   resultados parciales.
4. Todos los actores siguen el patron publico de empate.
5. El ultimo voto completa C3 y dispara el empate de C4.
6. Observar resultado agregado.

Esperado:

* C3 queda validado dentro de C4, sin una votacion separada previa;
* cada actor vota una vez;
* antes del ultimo voto no hay resultados parciales;
* aparece empate;
* se muestran candidatos empatados;
* no se muestran votos individuales como datos privados.

Evidencia:

* patron publico usado;
* registro de que C3 fue cubierto por la misma votacion;
* screenshot del empate agregado;
* no registrar informacion de rol/palabra.

## C5 - Segunda votacion y resolucion sin tercera votacion

Precondiciones:

* fase `tie_discussion`;
* candidatos empatados visibles.

Pasos:

1. Host inicia segunda votacion.
2. Todos votan entre candidatos empatados.
3. Observar resolucion.

Esperado:

* solo aparecen candidatos empatados;
* cada actor vota una vez;
* la resolucion es definitiva;
* no aparece tercera votacion.

Evidencia:

* candidatos visibles;
* resultado posterior;
* sin votos individuales privados.

## C6 - Impostor descubierto con guess incorrecto

Precondiciones:

* ronda tecnica separada de la sesion natural;
* la Room/tanda fue declarada como corrida tecnica de guess incorrecto;
* despues de C1, solo en esta corrida tecnica, el actor impostor se identifica
  privadamente ante el facilitador;
* esa identidad no se registra ni se captura;
* el facilitador puede dirigir la votacion para llegar a `impostor_guess`.

Pasos:

1. Completar C1.
2. El impostor se identifica privadamente ante el facilitador.
3. El facilitador dirige los votos estrictamente necesarios para votar al
   impostor y llegar a `impostor_guess`.
4. El impostor ingresa deliberadamente un texto incorrecto.
5. Observar resultado de ronda.

Esperado:

* solo el impostor puede enviar guess;
* guess incorrecto da victoria al grupo;
* la palabra se revela en resultado segun reglas vigentes;
* la identificacion manual planificada del impostor ante el facilitador no se
  clasifica como incidente.

Evidencia:

* resultado de ronda;
* registrar que se uso divulgacion tecnica controlada;
* no registrar ni capturar identidad del impostor, rol ni patron privado;
* no capturar formulario antes del envio si expone informacion sensible.

## C7 - Impostor descubierto con guess correcto

Precondiciones:

* ronda tecnica separada de la sesion natural;
* la Room/tanda fue declarada como corrida tecnica de guess correcto;
* despues de C1, solo en esta corrida tecnica, el actor impostor se identifica
  privadamente ante el facilitador;
* esa identidad no se registra ni se captura;
* el facilitador puede dirigir la votacion para llegar a `impostor_guess`;
* no se asume que una palabra preparada fue seleccionada por el backend.

Pasos:

1. Completar C1.
2. El impostor se identifica privadamente ante el facilitador.
3. El facilitador dirige los votos estrictamente necesarios para votar al
   impostor y llegar a `impostor_guess`.
4. Solo despues de alcanzar `impostor_guess`, un jugador normal comunica
   privadamente al facilitador la palabra efectivamente activa.
5. El facilitador comunica esa palabra unicamente al impostor.
6. El impostor envia guess correcto.
7. Observar resultado de ronda.

Esperado:

* solo el impostor puede enviar guess;
* guess correcto da victoria al impostor;
* el resultado queda visible para todos despues de resolver;
* la identificacion manual del impostor y la revelacion planificada de la
  palabra dentro de C7 no se clasifican como incidente;
* la divulgacion queda limitada al facilitador y a los actores estrictamente
  necesarios.

Evidencia:

* registrar que se uso divulgacion tecnica controlada;
* no registrar ni capturar palabra, rol, identidad del impostor ni patron
  privado;
* resultado agregado posterior.

## C8 - Scoreboard

Precondiciones:

* ronda resuelta.

Pasos:

1. Esperar o avanzar hasta marcador.
2. Comparar marcador visible entre actores.

Esperado:

* todos ven marcador acumulado coherente;
* acciones de nueva ronda y terminar tanda son host-only;
* no se exponen votos individuales.

Evidencia:

* screenshot de scoreboard;
* ocultar nombres reales si se publica.

## C9 - Nueva ronda sin palabra privada stale

Precondiciones:

* fase `scoreboard`;
* quedan palabras sin usar.

Pasos:

1. Host inicia nueva ronda.
2. Cada actor llega a reveal de nueva ronda.
3. Un actor que vio palabra anterior confirma que no queda visible como stale.

Esperado:

* aparece nueva ronda;
* reveal empieza oculto;
* la palabra anterior no queda visible antes de revelar estado vigente;
* no se repite palabra dentro de la tanda si hay alternativas disponibles.

Evidencia:

* numero de ronda;
* confirmacion sin capturar palabra privada.

## C10 - Fin de tanda y `finished`

Precondiciones:

* fase `scoreboard`;
* host actual identificado.

Pasos:

1. Host elige terminar tanda.
2. Confirmar la accion.
3. Cada actor verifica resultado final.
4. Volver al Group.

Esperado:

* la Room se cierra;
* todos los participantes ven `finished`;
* resultado final es compartido;
* no hay acciones de nueva ronda ni terminar tanda despues de `finished`;
* volver al Group permite iniciar otra Room futura.

Evidencia:

* resultado final;
* numero de rondas;
* sin IDs internos.

## R1 - Background/foreground

Precondiciones:

* partida en curso;
* al menos un host y un invitado disponibles para alternar app o bloquear.

Pasos:

1. Enviar un actor a background o lock screen.
2. Avanzar o mantener fase segun subcaso.
3. Volver a foreground.

Esperado:

* el actor vuelve a estado autoritativo actual;
* no se confia en timers locales suspendidos;
* host y fase quedan correctos.

Evidencia:

* actor;
* fase antes/despues;
* tiempo aproximado fuera.

## R2 - Perdida y recuperacion de red

Precondiciones:

* partida en curso;
* forma controlada de cortar red a un dispositivo.

Pasos:

1. Cortar red de un actor.
2. Intentar observar feedback offline/reconnecting.
3. Restaurar red.
4. Usar retry si aparece.

Esperado:

* acciones conectadas quedan pausadas;
* no se habilita gameplay offline;
* al volver, se reconstruye estado vigente.

Evidencia:

* modo de corte de red;
* estado visible;
* resultado de recuperacion.

## R3 - Avance remoto de fase mientras un actor esta offline

Precondiciones:

* actor elegido puede quedar offline;
* el resto puede avanzar fase.

Pasos:

1. Actor B queda offline en fase A.
2. A/C/D avanzan a fase B.
3. B recupera red.

Esperado:

* B no vuelve a fase A desde cache;
* B ve fase B despues de reconciliar;
* no aparecen privados stale.

Evidencia:

* fase A;
* fase B;
* estado visible al reconectar.

## R4 - Sucesion de host despues de staleness real

Precondiciones:

* Room en lobby o playing;
* host actual identificado;
* se puede dejar al host sin liveness mas de 90 segundos;
* otro participante permanece activo.

Pasos:

1. Sacar al host de conectividad/foreground el tiempo necesario.
2. Mantener al menos un candidato activo.
3. Esperar evaluacion de sucesion o provocar recovery natural permitido.
4. Devolver al host original.

Esperado:

* la DB define el host actual;
* el cliente no elige sucesor por su cuenta;
* el host original no recupera host automaticamente;
* acciones host-only se mueven al host vigente.

Evidencia:

* host antes/despues;
* tiempo aproximado;
* actor que queda como host;
* no registrar IDs internos salvo evidencia interna estricta.

## U1 - Actualizacion PWA con dos versiones controladas

Precondiciones:

* candidato HTTPS controlado;
* dispositivo con PWA instalada;
* dos versiones desplegables identificadas por commit o version;
* metodo de despliegue autorizado fuera de este protocolo.

Pasos:

1. Instalar o abrir version 1.
2. Entrar a una ruta no critica.
3. Desplegar o habilitar version 2 por el metodo autorizado.
4. Verificar que el aviso o accion de update aparece en la ruta no critica.
5. Navegar despues a una Room activa.
6. Verificar que el update no se aplica ni queda accionable dentro de la sala.
7. Verificar que no hay recarga automatica durante la sala/tanda activa.
8. Salir de la sala/tanda hacia una ruta no critica.
9. Aplicar la actualizacion fuera de gameplay.
10. Reabrir la app y confirmar refetch autoritativo.

Esperado:

* update no interrumpe una tanda activa;
* update detectado fuera de gameplay no queda como accion activa dentro de una
  Room;
* no hay reload automatico en sala/tanda activa;
* aplicar update es accion explicita;
* despues del update no se usa cache como autoridad de juego;
* la reapertura reconstruye Group/Room/GameState desde backend cuando
  corresponde.

Evidencia:

* commits/versiones;
* ruta donde aparece aviso;
* comportamiento en sala activa;
* confirmacion de ausencia de reload automatico;
* ruta donde se aplica update fuera de gameplay;
* resultado despues de aplicar update y reabrir.

---

# 12. Evidencia

## Evidencia interna de diagnostico

Puede conservar datos operativos minimos cuando sean necesarios para correlacion
y con acceso acotado.

Puede incluir:

* Room code completo si hace falta reproducir una falla;
* URL del entorno;
* hora aproximada;
* commit;
* dispositivo/navegador;
* consola filtrada;
* eventos de red filtrados;
* screenshots sin secretos.

No debe incluir tokens, credenciales, service keys, palabras privadas, roles
antes del reveal publico de resultado, votos individuales privados ni datos
personales innecesarios.

Las divulgaciones manuales planificadas de C6/C7 sirven solo para dirigir una
corrida tecnica. No deben registrarse ni capturarse como evidencia.

## Evidencia publicable o portfolio

Es opcional. No producir material publicable o de portfolio no bloquea la
aceptacion pre-beta.

Si se produce, debe redactarse antes de publicarse.

Debe ocultar:

* Room codes;
* identificadores internos;
* tokens y credenciales;
* URLs privadas;
* palabras;
* roles antes del reveal;
* votos individuales;
* datos personales;
* nombres reales sin consentimiento.

Preferir:

* aliases A/B/C/D;
* capturas recortadas;
* texto redactado;
* resultados agregados;
* descripcion de comportamiento en lugar de datos crudos.

## Registro minimo por escenario

Cada escenario debe registrar:

* ID de escenario;
* resultado `PASS | FAIL | BLOCKED | NOT RUN`;
* fecha y hora aproximada;
* commit;
* entorno y URL identificada;
* actor;
* dispositivo, sistema, navegador y version;
* modo `browser` o `installed`;
* fase inicial;
* acciones realizadas;
* resultado esperado;
* resultado observado;
* recuperacion mediante retry, refresh o reconnect;
* evidencia segura disponible;
* referencia a incidente si corresponde.

## Screenshots y video

Antes de capturar:

1. revisar que no aparezca palabra privada;
2. revisar que no aparezca rol privado antes de resultado;
3. revisar que no aparezcan votos individuales;
4. revisar que no aparezcan tokens, cookies, headers o URLs privadas;
5. revisar si nombres reales deben ocultarse.

Si una captura accidental contiene secretos, moverla a evidencia interna
restringida si es imprescindible para diagnostico o eliminarla segun la politica
del equipo. No publicarla.

## Consola y red

La consola y el panel de red solo pueden capturarse si se filtran datos
sensibles.

Prohibido conservar:

* tokens de Auth;
* cookies;
* API keys;
* Authorization headers;
* payloads con palabra, rol, voto individual o datos personales;
* respuestas completas de RPCs con privados.

Permitido, si ayuda al diagnostico:

* nombre de escenario;
* hora aproximada;
* mensaje de error visible;
* tipo de fallo observado;
* endpoint o RPC redactado si no expone secretos;
* status general de red sin payload sensible.

---

# 13. Incidentes y severidad

## Severidades

| Severidad | Criterio | Accion |
| --- | --- | --- |
| S0 privacidad/autoridad | La aplicacion expone palabra, rol de otro actor, voto individual privado, token/credencial, o el cliente actua como autoridad indebida. Tambien aplica a cualquier exposicion manual fuera del momento autorizado de C6/C7 | Detener aceptacion inmediatamente |
| S1 bloqueo de flujo central | No se puede completar Group, Room, ronda, votacion, scoreboard, nueva ronda, finished o recovery basico | Detener o aislar corrida antes de continuar |
| S2 falla importante recuperable | Hay error visible o comportamiento incorrecto, pero retry/refresh/reconnect recupera y no rompe privacidad | Registrar incidente y continuar si el facilitador lo aprueba |
| S3 friccion UX | Duda, demora, copy confuso, tap equivocado o ritmo pobre sin romper contrato | Registrar como aprendizaje |
| S4 mejora futura | Observacion deseable sin impacto pre-beta | Registrar sin bloquear |

## Criterios de interrupcion inmediata

Detener la aceptacion si ocurre:

* exposicion de palabra secreta a quien no corresponde por la aplicacion, fuera
  de C7 o antes de `impostor_guess`;
* exposicion del impostor antes de resultado por la aplicacion o fuera de la
  identificacion privada planificada de C6/C7;
* exposicion de votos individuales privados;
* token, credencial o secreto capturado;
* accion host-only disponible para no-host;
* voto duplicado o cambio de voto aceptado indebidamente;
* cliente muestra fase vieja como vigente despues de reconectar;
* PWA/cache muestra Room/GameState/privados como autoridad sin red;
* update recarga automaticamente una sala/tanda activa.

No son incidentes las divulgaciones manuales planificadas en C6/C7 cuando
ocurren dentro de la corrida tecnica declarada, en el momento autorizado y
limitadas al facilitador y a los actores estrictamente necesarios.

Cualquier exposicion producida por la aplicacion, fuera del momento autorizado
o fuera de esas corridas sigue siendo S0 y detiene la aceptacion.

## Plantilla de incidente

```text
ID:
Severidad: S0 | S1 | S2 | S3 | S4
Escenario:
Fecha/hora aproximada:
Commit:
Entorno:
URL:
Actor(es):
Dispositivo/SO/navegador:
Modo: browser | installed
Fase inicial:
Acciones realizadas:
Resultado esperado:
Resultado observado:
Privacidad afectada: si | no
Autoridad afectada: si | no
Recuperacion intentada: retry | refresh | reconnect | ninguna
Resultado de recuperacion:
Evidencia segura:
Datos redactados:
Reproduccion minima:
Decision: bloquear | continuar | repetir | mejora futura
```

## Plantilla de reproduccion minima

```text
1. Usar commit:
2. Usar entorno:
3. Preparar actores:
4. Preparar datos:
5. Ir a fase:
6. Ejecutar accion:
7. Observar:
8. Esperado:
9. Actual:
10. Evidencia:
```

---

# 14. Criterios de resultado

## PASS

Usar `PASS` cuando:

* se cumplen las precondiciones del escenario;
* los pasos se ejecutan completos;
* el resultado observado coincide con el esperado;
* no hay exposicion de privacidad;
* no hay autoridad incorrecta;
* la evidencia segura queda registrada.

## FAIL

Usar `FAIL` cuando:

* el escenario se puede ejecutar, pero el resultado observado contradice el
  contrato;
* aparece una falla reproducible;
* una accion indebida queda habilitada o aceptada;
* se rompe privacidad o autoridad;
* recovery/reconnect no converge al estado vigente.

## BLOCKED

Usar `BLOCKED` cuando:

* falta dispositivo;
* falta URL accesible;
* falta entorno preparado;
* falta admin autorizado;
* las sesiones no estan aisladas;
* Supabase o deploy no esta disponible;
* no se puede preparar banco o actores;
* una falla externa impide saber si el producto pasa o falla.

## NOT RUN

Usar `NOT RUN` cuando:

* se decide no ejecutar un escenario en esta corrida;
* falta tiempo;
* el escenario queda fuera del alcance de esa sesion;
* se posterga deliberadamente a otro entorno;
* hay un motivo explicito que no debe contarse como pass ni fail.

Los pendientes externos de Incrementos 14 y 15.4 no pueden quedar `NOT RUN` o
`BLOCKED` si se quiere declarar aprobada la aceptacion pre-beta.

---

# 15. Pendientes de Incremento 14 y 15.4

Estos pendientes estan integrados en la aceptacion manual general:

* Android Chrome installed PWA smoke;
* iOS Safari Add to Home Screen smoke;
* real multi-actor round transition/offline/reconnect smoke;
* Web Share y clipboard en moviles reales;
* UX/UI y responsive en dispositivos reales.

No bloquean crear este protocolo ni preparar la aceptacion.

Si permanecen `NOT RUN` o `BLOCKED`, bloquean declarar aprobada la aceptacion
pre-beta. En ese caso, el cierre debe decir que la preparacion o corrida quedo
incompleta y conservar el motivo concreto.

---

# 16. Gap de E2E

El contrato documental de Incremento 15 menciona E2E del flujo critico completo.

El comando `npm run test:pre-playtest` no contiene actualmente un E2E completo
de navegador. Incluye unit tests, lint, build, validadores DB y smokes Realtime.

Decision para 15.5:

* no implementar E2E en esta tarea;
* no bloquear la creacion del protocolo por este gap;
* cubrir temporalmente el riesgo con aceptacion manual multi-actor completa y
  evidencia segura;
* abrir revision posterior de E2E si la evidencia lo justifica.

Abrir revision posterior de E2E si:

* aparecen regresiones dificiles de reproducir;
* el flujo critico cambia;
* la aceptacion debe repetirse frecuentemente;
* una decision de release necesita garantia automatica adicional.

---

# 17. Puerta de observabilidad

No agregar observabilidad runtime por anticipado.

La observabilidad actual se considera suficiente para iniciar aceptacion manual
si el protocolo captura evidencia minima por escenario.

Abrir un diagnostico posterior de observabilidad minima solo si un incidente
bloqueante no puede ubicarse razonablemente con la evidencia disponible,
especialmente en:

* Auth/Group/Room/GameState;
* trigger de reconnect;
* Presence versus liveness;
* RPC de sucesion;
* fase autoritativa observada por distintos actores.

Cualquier propuesta posterior debe excluir:

* palabras;
* roles;
* votos individuales;
* tokens;
* credenciales;
* datos personales;
* payloads privados completos.

El alcance maximo inicial deberia ser logging local no sensible o modo
diagnostico acotado, y solo despues de demostrar necesidad con evidencia.

---

# 18. Criterio de aceptacion pre-beta

La aceptacion pre-beta puede declararse aprobada solo si:

* el preflight tecnico requerido para la corrida esta `PASS` o tiene una
  excepcion documentada y aceptada;
* la sesion natural se ejecuto y produjo evidencia segura;
* los escenarios criticos de Group, Room, ronda, votacion, empate, segunda
  votacion, intento, scoreboard, nueva ronda y `finished` estan `PASS`;
* Android Chrome installed PWA esta `PASS`;
* iOS Safari Add to Home Screen esta `PASS`;
* real multi-actor round transition/offline/reconnect esta `PASS`;
* Web Share y clipboard reales estan `PASS` o tienen limitacion de plataforma
  documentada sin bloquear el flujo principal;
* no quedan incidentes S0 o S1 abiertos;
* los incidentes S2 tienen workaround o decision explicita;
* la evidencia interna segura requerida esta completa;
* la evidencia interna sensible, si existe, tiene acceso acotado.

Si algun punto critico queda `FAIL`, `BLOCKED` o `NOT RUN`, no declarar la
aceptacion pre-beta aprobada. Registrar el estado real y el proximo paso.

La evidencia publicable o de portfolio es opcional. Si se produce, debe quedar
redactada antes de publicarse, pero no producirla no bloquea la aceptacion
pre-beta.

---

# 19. Plantillas reutilizables

## Registro de ejecucion

```text
Ejecucion:
Fecha/hora:
Facilitador:
Observador:
Commit:
Rama:
Entorno:
URL:
Version desplegada:
Datos descartables: si | no
Actores:
Dispositivos:
Resultado general: PASS | FAIL | BLOCKED | NOT RUN
Resumen:
Incidentes:
Pendientes:
Evidencia interna segura:
Evidencia publicable opcional redactada: si | no | no producida
Decision:
```

## Registro de actor

```text
Actor: A | B | C | D
Nombre publicable:
Sesion aislada: si | no
Dispositivo:
SO/version:
Navegador/version:
Modo: browser | installed
Puede Web Share: si | no | no comprobado
Puede clipboard: si | no | no comprobado
Notas:
```

## Registro de escenario

```text
ID:
Nombre:
Tipo: preflight | smoke tecnico | natural | controlado | cierre
Resultado: PASS | FAIL | BLOCKED | NOT RUN
Fecha/hora aproximada:
Commit:
Entorno:
URL:
Actor(es):
Dispositivo(s):
Modo:
Fase inicial:
Precondiciones cumplidas:
Acciones realizadas:
Resultado esperado:
Resultado observado:
Recuperacion mediante retry/refresh/reconnect:
Evidencia interna:
Evidencia publicable opcional:
Incidente relacionado:
Notas:
```

## Checklist de cierre

```text
[ ] Repo candidato identificado
[ ] Entorno identificado
[ ] URL accesible
[ ] Cuatro actores aislados
[ ] Android Chrome cubierto
[ ] iOS Safari A2HS cubierto
[ ] Browser sin instalacion cubierto
[ ] Group cubierto
[ ] Room cubierto
[ ] Web Share cubierto
[ ] Clipboard cubierto
[ ] Sesion natural ejecutada
[ ] Primera votacion cubierta
[ ] Empate y segunda votacion cubiertos
[ ] Guess incorrecto cubierto
[ ] Guess correcto cubierto
[ ] Scoreboard cubierto
[ ] Nueva ronda sin stale cubierto
[ ] Finished cubierto
[ ] Offline/reconnect cubierto
[ ] Background/foreground cubierto
[ ] Host succession real cubierto
[ ] PWA update cubierto
[ ] Evidencia interna segura obligatoria completa
[ ] Evidencia interna guardada con acceso acotado
[ ] Evidencia publicable redactada si se produjo
[ ] Incidentes S0/S1 cerrados o aceptacion bloqueada
[ ] Decision pre-beta registrada
```
