# Guia de ejecucion y registro de aceptacion manual pre-beta

Esta guia convierte `sources/pre-beta-manual-acceptance.md` en un cuaderno de
trabajo para ejecutar y registrar la aceptacion manual. El protocolo vigente
sigue siendo la fuente normativa ante cualquier diferencia.

No completar resultados por anticipado. Usar `PASS`, `FAIL`, `BLOCKED` o
`NOT RUN` solamente despues de ejecutar cada escenario.

Este runbook corresponde exclusivamente a la aceptacion formal. Un smoke UX/UI
exploratorio previo de un solo dispositivo se registra por separado y no
completa ningun escenario de esta matriz ni produce resultados de aceptacion.
La baseline actual es `a064ce2c38abe4502b8c11ceeb9be5b7187aea62`: si el smoke
no cambia codigo, puede seguir siendo candidata; si deriva en cambios de codigo,
queda como baseline de comparacion y deja de ser candidata final automatica.

Antes de usar este runbook con codigo modificado por ese smoke:

1. registrar el nuevo SHA candidato;
2. confirmar el Preview correspondiente;
3. repetir P0;
4. ejecutar un smoke focal de regresion sobre las superficies tocadas;
5. actualizar los datos generales de ejecucion.

N1 permanece reservado para la candidata final y no puede sustituirse con la
exploracion de un dispositivo.

---

# 1. Datos generales de la ejecucion

La numeracion `15.4`/`15.5` conserva la evolucion real del trabajo. El roadmap
original no habia reservado una secuencia completa `15.x`; no se infieren
Incrementos 15.1-15.3.

```text
Ejecucion: Ejecucion 1
Fecha/hora: 2026-09-02 18:47 America/Argentina/Buenos_Aires
Facilitador: Ramiro
Observador: Vicky
Responsable tecnico: Ramiro
Commit desplegado: a064ce2
Rama: pre-beta-playtest
Entorno: Vercel Preview
URL estable: https://juegos-familiares-git-pre-beta-playtest-radikecosas-projects.vercel.app
Shareable Link disponible en todos los dispositivos: no comprobado
Version desplegada: beta
Datos descartables: si
Resultado general: PASS | FAIL | BLOCKED | NOT RUN
Resumen:
```

## P0 ya ejecutado

```text
Escenario: P0
Resultado registrado: PASS
Fecha: 2026-09-02
Codigo de producto evaluado: 973dc0d
Contrato de tests corregido: 53e9799
Cobertura: unit tests, lint, build, validadores DB y smokes Realtime
```

Repetir P0 si cambia el codigo candidato o si una investigacion posterior lo
requiere. Un cambio solo documental no obliga por si mismo a repetirlo.

---

# 2. Reglas de seguridad y privacidad

## No registrar ni capturar

- [ ] palabras privadas;
- [ ] roles antes del resultado publico;
- [ ] identidad del impostor durante C6/C7;
- [ ] votos individuales;
- [ ] tokens, cookies, API keys o credenciales;
- [ ] headers de autorizacion;
- [ ] payloads privados completos;
- [ ] nombres reales sin consentimiento;
- [ ] contenido privado de aplicaciones externas de mensajeria.

Usar siempre los aliases A/B/C/D. Las capturas publicables deben ocultar codigos
de Room, URLs privadas e identificadores internos.

## Detener inmediatamente si ocurre

- [ ] la aplicacion expone una palabra o rol a quien no corresponde;
- [ ] la aplicacion expone un voto individual;
- [ ] aparece un token, cookie o credencial;
- [ ] un no-host puede ejecutar una accion host-only;
- [ ] se acepta voto duplicado o cambio de voto indebido;
- [ ] un actor reconectado conserva una fase vieja como vigente;
- [ ] la PWA presenta gameplay o privados de cache como autoridad sin red;
- [ ] una actualizacion recarga automaticamente una Room o tanda activa.

Las divulgaciones privadas de C6/C7 solo estan permitidas dentro de esas
corridas, en el momento indicado, limitadas a quienes las necesitan y sin
registro ni captura.

---

# 3. Criterios de resultado

## PASS

Usar `PASS` cuando se cumplieron precondiciones y pasos, el resultado coincide
con lo esperado, no se rompio privacidad o autoridad y existe evidencia segura.

## FAIL

Usar `FAIL` cuando el escenario pudo ejecutarse pero el producto contradijo el
resultado esperado, habilito una accion indebida o no recupero estado vigente.

## BLOCKED

Usar `BLOCKED` cuando falta un dispositivo, acceso, sesion aislada, entorno,
admin, datos de prueba o una condicion externa necesaria para evaluar.

## NOT RUN

Usar `NOT RUN` cuando se decidio postergar el escenario. Registrar siempre el
motivo. Un escenario critico `BLOCKED` o `NOT RUN` impide aprobar pre-beta.

---

# 4. Actores y dispositivos

## Actor A

```text
Alias: A
Rol operativo: admin / host inicial
Sesion aislada: si | no
Operador: Ramiro
Dispositivo: Motorola g15 (modelo por confirmar)
SO/version: Android (version por confirmar)
Navegador/version: por confirmar
Modo: installed
Web Share: no comprobado
Clipboard: no comprobado
Notas:
```

## Actor B

```text
Alias: B
Rol operativo: invitado
Sesion aislada: si | no
Operador: Ramiro
Dispositivo: iPad
SO/version: iPadOS (version por confirmar)
Navegador/version: Safari (version por confirmar)
Modo: browser
Web Share: no comprobado
Clipboard: no comprobado
Notas:
```

## Actor C

```text
Alias: C
Rol operativo: invitado
Sesion aislada: si | no
Operador: Vicky
Dispositivo: iPhone
SO/version: iOS (version por confirmar)
Navegador/version: Safari (version por confirmar)
Modo: installed
Web Share: no comprobado
Clipboard: no comprobado
Notas:
```

## Actor D

```text
Alias: D
Rol operativo: invitado
Sesion aislada: si | no
Operador: Vicky
Dispositivo: Samsung A35
SO/version: Android (version por confirmar)
Navegador/version: Chrome (version por confirmar)
Modo: browser
Web Share: no comprobado
Clipboard: no comprobado
Notas:
```

## Preparacion comun

- [ ] cuatro sesiones realmente aisladas;
- [ ] Android con Chrome disponible;
- [ ] iOS con Safari disponible;
- [ ] navegador movil sin instalacion disponible;
- [ ] PWA Android instalable;
- [ ] iOS Add to Home Screen disponible;
- [ ] Group de prueba preparado;
- [ ] banco no sensible para al menos dos rondas;
- [ ] todos los dispositivos pueden abrir el Preview protegido;
- [ ] consentimiento para evidencia definido.

---

# 5. Matriz maestra

| ID | Escenario | Resultado | Incidente | Notas |
| --- | --- | --- | --- | --- |
| P0 | Preflight automatizado | PASS |  | Ejecutado 2026-09-02 |
| S1 | Navegador movil sin instalar |  |  |  |
| S2 | Android Chrome installed PWA |  |  |  |
| S3 | iOS Safari Add to Home Screen |  |  |  |
| S4 | Crear y recuperar Group |  |  |  |
| S5 | Invitacion y sesiones A/B/C/D |  |  |  |
| S6 | Crear, compartir y unirse a Room |  |  |  |
| S7 | Web Share y clipboard reales |  |  |  |
| S8 | Lobby, Presence, liveness y host |  |  |  |
| N1 | Sesion natural |  |  |  |
| C1 | Reveal y privacidad |  |  | Puede repetirse por corrida |
| C2 | Discusion |  |  |  |
| C3 | Primera votacion |  |  | Cubrir dentro de C4 |
| C4 | Empate forzado |  |  |  |
| C5 | Segunda votacion |  |  |  |
| C6 | Guess incorrecto |  |  | Corrida separada |
| C7 | Guess correcto |  |  | Corrida separada |
| C8 | Scoreboard |  |  | Puede repetirse |
| C9 | Nueva ronda sin privados stale |  |  |  |
| C10 | Fin de tanda |  |  |  |
| R1 | Background/foreground |  |  |  |
| R2 | Perdida y recuperacion de red |  |  |  |
| R3 | Avance remoto mientras offline |  |  |  |
| R4 | Sucesion real de host |  |  | Mas de 90 segundos |
| U1 | Actualizacion PWA |  |  | Requiere V1 y V2 reales |
| E1 | Revision de evidencia |  |  |  |
| D1 | Decision pre-beta |  |  |  |

Limitacion conocida: si un `SessionPlayer` del roster congelado queda ausente
durante una votacion antes de emitir su voto, la ronda puede permanecer
esperando. No clasificar esto por anticipado como bug de Presence/liveness;
registrar el comportamiento observado y la politica vigente.

---

# 6. S1-S8: preparacion y smoke tecnico

## S1 - Navegador movil sin instalar

```text
Actor:
Dispositivo/SO:
Navegador/version:
Modo: browser
Fecha/hora:
```

- [ ] confirmar que la PWA no esta abierta en modo instalado;
- [ ] abrir el Shareable Link y luego la URL estable;
- [ ] verificar carga y layout mobile;
- [ ] entrar a inicio, onboarding o Group disponible;
- [ ] refrescar la pagina;
- [ ] cerrar y reabrir la pestana o navegador;
- [ ] confirmar reconstruccion del contexto autorizado;
- [ ] confirmar ausencia de informacion de otro actor.

```text
Resultado S1: PASS | FAIL | BLOCKED | NOT RUN
Resultado observado:
Refresh/reapertura:
Evidencia segura:
Incidente:
Notas:
```

## S2 - Android Chrome installed PWA

```text
Actor:
Dispositivo/Android:
Chrome/version:
Instalacion previa identificada: si | no
Fecha/hora:
```

- [ ] abrir el Preview en Chrome Android;
- [ ] instalar o agregar a pantalla de inicio;
- [ ] cerrar Chrome;
- [ ] abrir desde el icono instalado;
- [ ] confirmar modo instalado/standalone cuando aplique;
- [ ] navegar a inicio, Group o Room autorizada;
- [ ] cerrar completamente la PWA;
- [ ] reabrir desde el icono;
- [ ] confirmar reconstruccion de contexto vigente;
- [ ] confirmar ausencia de privados o tokens en pantalla.

```text
Resultado S2: PASS | FAIL | BLOCKED | NOT RUN
Instalacion:
Reapertura:
Evidencia segura:
Limitacion de plataforma:
Incidente:
Notas:
```

## S3 - iOS Safari Add to Home Screen

```text
Actor:
Dispositivo/iOS:
Safari/version:
Instalacion previa identificada: si | no
Fecha/hora:
```

- [ ] abrir el Preview en Safari;
- [ ] abrir Share Sheet;
- [ ] elegir Add to Home Screen;
- [ ] confirmar nombre visible;
- [ ] cerrar Safari;
- [ ] abrir desde el icono agregado;
- [ ] navegar al contexto autorizado;
- [ ] cerrar y reabrir desde Home Screen;
- [ ] confirmar reconstruccion de estado vigente;
- [ ] confirmar que no se ofrece gameplay offline.

```text
Resultado S3: PASS | FAIL | BLOCKED | NOT RUN
Add to Home Screen:
Reapertura:
Evidencia segura:
Limitacion de plataforma:
Incidente:
Notas:
```

## S4 - Crear y recuperar Group

- [ ] A abre la aplicacion;
- [ ] A crea o accede al Group de prueba;
- [ ] confirmar que el Group correcto esta visible;
- [ ] refrescar;
- [ ] cerrar y reabrir;
- [ ] confirmar que A vuelve al mismo Group;
- [ ] confirmar que no aparece onboarding incompatible.

```text
Resultado S4: PASS | FAIL | BLOCKED | NOT RUN
Actor/modo:
Resultado observado:
Evidencia segura sin IDs internos:
Incidente:
Notas:
```

## S5 - Invitacion y sesiones A/B/C/D

- [ ] A comparte invitacion de Group;
- [ ] B abre desde su sesion aislada y se une;
- [ ] C abre desde su sesion aislada y se une;
- [ ] D abre desde su sesion aislada y se une;
- [ ] confirmar cuatro integrantes distintos;
- [ ] reabrir al menos una sesion invitada;
- [ ] confirmar que una sesion no pisa a otra;
- [ ] confirmar que B/C/D no necesitan admin de plataforma.

```text
Resultado S5: PASS | FAIL | BLOCKED | NOT RUN
Actores incorporados:
Sesiones aisladas confirmadas:
Evidencia segura con aliases:
Incidente:
Notas:
```

## S6 - Crear, compartir y unirse a Room

- [ ] A crea una Room;
- [ ] confirmar que A es host;
- [ ] A comparte enlace o codigo;
- [ ] B se une;
- [ ] C se une;
- [ ] D se une;
- [ ] confirmar cuatro jugadores en lobby;
- [ ] comparar la composicion publica en las cuatro pantallas;
- [ ] confirmar que A sigue siendo host;
- [ ] no iniciar todavia la sesion natural.

```text
Resultado S6: PASS | FAIL | BLOCKED | NOT RUN
Lobby observado:
Host inicial:
Evidencia interna segura:
Codigo redactado en evidencia publicable: si | no | no producida
Incidente:
Notas:
```

## S7 - Web Share y clipboard reales

### Web Share

- [ ] A ejecuta compartir;
- [ ] aparece el menu nativo o error comprensible;
- [ ] el enlace llega a un receptor;
- [ ] el receptor abre el Group o Room esperado;
- [ ] no se captura contenido privado de apps externas.

### Clipboard

- [ ] A ejecuta copiar;
- [ ] aparece feedback comprensible;
- [ ] pegar temporalmente en un lugar privado;
- [ ] confirmar que solo contiene enlace o codigo esperado;
- [ ] confirmar ausencia de token o credencial;
- [ ] otro actor puede utilizarlo.

```text
Resultado S7 general: PASS | FAIL | BLOCKED | NOT RUN
Resultado Web Share: PASS | FAIL | BLOCKED | NOT RUN
Resultado clipboard: PASS | FAIL | BLOCKED | NOT RUN
SO/navegador:
Feedback observado:
Limitacion de plataforma:
Evidencia segura:
Incidente:
Notas:
```

## S8 - Lobby, Presence, liveness y host

- [ ] confirmar A/B/C/D visibles;
- [ ] registrar host inicial;
- [ ] registrar estados de conexion visibles;
- [ ] bloquear un no-host durante 20-30 segundos;
- [ ] observar cambio de Presence si existe;
- [ ] devolver el no-host;
- [ ] confirmar recovery y membership conservada;
- [ ] bloquear el host durante 20-30 segundos, sin superar staleness;
- [ ] devolver el host;
- [ ] confirmar que no hubo sucesion por Presence solamente;
- [ ] confirmar que nadie perdio su lugar.

```text
Resultado S8: PASS | FAIL | BLOCKED | NOT RUN
Host antes/despues:
Actor suspendido:
Tiempo aproximado:
Estados visibles:
Evidencia segura:
Incidente:
Notas:
```

---

# 7. N1: sesion natural

No dirigir votos, no forzar empates, no revelar privados y no explicar cada
pantalla. Intervenir solo para evitar bloqueo, exposicion o abandono.

## Preparacion

- [ ] S1-S8 ejecutados o bloqueos clasificados;
- [ ] cuatro actores en la misma Room;
- [ ] host visible;
- [ ] banco de palabras preparado;
- [ ] facilitador y observador identificados.

## Ejecucion

- [ ] explicar solo que deben jugar una ronda usando lo que muestra la app;
- [ ] observar si el host encuentra como iniciar;
- [ ] permitir reveal individual sin mirar pantallas privadas;
- [ ] observar comprension y ritmo de la discusion;
- [ ] permitir que el grupo decida cuando votar;
- [ ] no dirigir candidatos ni votos;
- [ ] observar voto, espera y resolucion natural;
- [ ] si aparece empate natural, dejar que continue sin manipularlo;
- [ ] si aparece intento, no sugerir palabra ni resultado;
- [ ] llegar a resultado o scoreboard compartido;
- [ ] comparar las cuatro pantallas.

## Debrief posterior

- [ ] preguntar cuando no supieron que hacer;
- [ ] preguntar que pantalla fue menos clara;
- [ ] preguntar si entendieron cuando actuar o esperar;
- [ ] preguntar por momentos lentos o frustrantes;
- [ ] preguntar por momentos divertidos;
- [ ] preguntar que esperaban que ocurriera distinto;
- [ ] preguntar si jugarian otra ronda sin ayuda.

```text
Resultado N1: PASS | FAIL | BLOCKED | NOT RUN
Ronda completa: si | no
Intervenciones del facilitador:
Dudas observadas:
Fricciones:
Ritmo:
Momentos divertidos:
Comentarios espontaneos:
Resultado compartido consistente: si | no
Evidencia segura:
Incidente:
Notas:
```

---

# 8. Corrida tecnica A: C1-C5 y C8

```text
Room/tanda:
Fecha/hora:
Host inicial:
Actores:
Estado inicial:
```

## C1 - Reveal y privacidad

- [ ] un no-host confirma que no puede iniciar la tanda;
- [ ] host inicia tanda;
- [ ] cada actor abre su reveal en privado;
- [ ] cada actor confirma pantalla coherente sin decir rol o palabra;
- [ ] confirmar que nadie ve el privado de otro;
- [ ] no capturar reveal.

```text
Resultado C1: PASS | FAIL | BLOCKED | NOT RUN
A: PASS | FAIL
B: PASS | FAIL
C: PASS | FAIL
D: PASS | FAIL
Evidencia segura:
Incidente:
```

## C2 - Discusion

- [ ] todos confirmaron reveal;
- [ ] un no-host confirma que no puede iniciar la ronda;
- [ ] host inicia discusion;
- [ ] cuatro actores llegan a `discussion`;
- [ ] un actor oculta y vuelve a mostrar localmente su privado;
- [ ] confirmar que la accion sigue siendo privada y efimera;
- [ ] confirmar host vigente y accion de avanzar.

```text
Resultado C2: PASS | FAIL | BLOCKED | NOT RUN
Host visible:
Fase compartida:
Evidencia segura:
Incidente:
```

## C3/C4 - Primera votacion y empate forzado

Definir un patron publico por alias que produzca empate. C3 se cubre dentro de
esta misma votacion.

```text
Patron publico de empate:
```

- [ ] antes, un no-host confirma que no puede iniciarla;
- [ ] host inicia primera votacion;
- [ ] primeros actores votan segun patron;
- [ ] confirmar voto unico y estado de espera;
- [ ] confirmar ausencia de resultados parciales;
- [ ] ultimo actor vota;
- [ ] confirmar que el ultimo voto resuelve C3 y dispara empate;
- [ ] confirmar candidatos empatados visibles;
- [ ] confirmar ausencia de votos individuales.

```text
Resultado C3: PASS | FAIL | BLOCKED | NOT RUN
Resultado C4: PASS | FAIL | BLOCKED | NOT RUN
Espera sin parciales: si | no
Empate agregado visible: si | no
Evidencia segura:
Incidente:
```

## C5 - Segunda votacion

- [ ] un no-host confirma que no puede iniciar la segunda votacion;
- [ ] host inicia segunda votacion;
- [ ] solo aparecen candidatos empatados;
- [ ] definir votos que produzcan resolucion definitiva;
- [ ] cada actor vota una vez;
- [ ] esperar ultimo voto;
- [ ] confirmar resolucion;
- [ ] confirmar que no aparece tercera votacion.

```text
Resultado C5: PASS | FAIL | BLOCKED | NOT RUN
Candidatos limitados correctamente: si | no
Resolucion definitiva: si | no
Tercera votacion ausente: si | no
Evidencia segura:
Incidente:
```

## C8 - Scoreboard

- [ ] llegar al scoreboard;
- [ ] comparar marcador en cuatro pantallas;
- [ ] confirmar mismo acumulado;
- [ ] un no-host confirma que no puede iniciar nueva ronda;
- [ ] un no-host confirma que no puede terminar tanda;
- [ ] confirmar ausencia de votos individuales.

```text
Resultado C8: PASS | FAIL | BLOCKED | NOT RUN
Marcador consistente: si | no
Acciones host-only: si | no
Evidencia segura:
Incidente:
```

---

# 9. Corrida tecnica B: C6 guess incorrecto

```text
Room/tanda:
Fecha/hora:
Declarada como corrida de guess incorrecto: si | no
```

- [ ] repetir C1 sin capturas;
- [ ] despues de C1, el impostor se identifica solo ante facilitador;
- [ ] no registrar ni capturar identidad;
- [ ] dirigir solo los votos necesarios para llegar a `impostor_guess`;
- [ ] confirmar que solo el impostor ve accion de guess;
- [ ] impostor ingresa texto deliberadamente incorrecto;
- [ ] no capturar formulario sensible;
- [ ] enviar y observar resultado;
- [ ] confirmar victoria del grupo;
- [ ] comparar resultado agregado entre actores;
- [ ] revisar scoreboard C8.

```text
Resultado C6: PASS | FAIL | BLOCKED | NOT RUN
Solo impostor pudo enviar: si | no
Guess incorrecto dio victoria al grupo: si | no
Divulgacion controlada usada: si | no
Informacion privada no registrada: si | no
Resultado C8 en esta corrida:
Evidencia segura:
Incidente:
Notas:
```

---

# 10. Corrida tecnica C: C7 guess correcto

```text
Room/tanda:
Fecha/hora:
Declarada como corrida de guess correcto: si | no
```

- [ ] repetir C1 sin capturas;
- [ ] despues de C1, el impostor se identifica solo ante facilitador;
- [ ] no registrar ni capturar identidad;
- [ ] dirigir solo los votos necesarios para llegar a `impostor_guess`;
- [ ] confirmar que solo el impostor ve accion de guess;
- [ ] solo despues de `impostor_guess`, un jugador normal comunica la palabra al facilitador;
- [ ] facilitador comunica la palabra solo al impostor;
- [ ] no registrar ni capturar palabra;
- [ ] impostor envia guess correcto;
- [ ] confirmar victoria del impostor;
- [ ] comparar resultado agregado entre actores;
- [ ] revisar scoreboard C8.

```text
Resultado C7: PASS | FAIL | BLOCKED | NOT RUN
Solo impostor pudo enviar: si | no
Guess correcto dio victoria al impostor: si | no
Divulgacion ocurrio despues de impostor_guess: si | no
Informacion privada no registrada: si | no
Resultado C8 en esta corrida:
Evidencia segura:
Incidente:
Notas:
```

---

# 11. Corrida tecnica D: C9-C10

```text
Room/tanda:
Fecha/hora:
Fase inicial: scoreboard
Rondas resueltas al inicio:
Host vigente:
```

## C9 - Nueva ronda sin privados stale

- [ ] un no-host confirma que no puede iniciar nueva ronda;
- [ ] host inicia nueva ronda;
- [ ] numero de ronda avanza;
- [ ] cada actor llega a reveal oculto;
- [ ] un actor confirma que la palabra anterior no sigue visible;
- [ ] no preguntar ni capturar palabra nueva;
- [ ] confirmar que no se repite palabra si quedan alternativas;
- [ ] completar la ronda hasta volver a scoreboard.

```text
Resultado C9: PASS | FAIL | BLOCKED | NOT RUN
Numero de ronda:
Reveal inicio oculto: si | no
Privado anterior ausente: si | no
Evidencia segura:
Incidente:
```

## C10 - Fin de tanda

- [ ] un no-host confirma que no puede terminar tanda;
- [ ] desde scoreboard, host elige terminar tanda;
- [ ] host confirma;
- [ ] comparar resultado final en cuatro pantallas;
- [ ] confirmar estado `finished`;
- [ ] confirmar ausencia de nueva ronda/terminar despues de `finished`;
- [ ] refrescar o reabrir la app de al menos un participante desde `finished`;
- [ ] confirmar que reconstruye el resultado historico autoritativamente;
- [ ] confirmar que no reaparece una Room activa falsa;
- [ ] volver al Group;
- [ ] confirmar posibilidad futura de crear otra Room.

```text
Resultado C10: PASS | FAIL | BLOCKED | NOT RUN
Resultado final consistente: si | no
Cantidad de rondas:
Room cerrada: si | no
Finished recuperado tras refresh/reapertura: si | no
Room activa falsa ausente: si | no
Retorno al Group: si | no
Evidencia segura:
Incidente:
```

---

# 12. Recovery: R1-R3

```text
Room/tanda:
Fecha/hora:
Actor interrumpido sugerido: B
Host:
```

## R1 - Background/foreground

- [ ] registrar fase inicial;
- [ ] enviar B a background o lock 20-30 segundos;
- [ ] no avanzar fase;
- [ ] mantener conectividad del resto;
- [ ] devolver B;
- [ ] confirmar fase y host vigentes.

El avance remoto mientras B queda offline se ejecuta exclusivamente en R3.

```text
Resultado R1: PASS | FAIL | BLOCKED | NOT RUN
Fase antes:
Fase despues:
Tiempo fuera:
Host antes/despues:
Evidencia segura:
Incidente:
```

## R2 - Perdida y recuperacion de red

- [ ] cortar Wi-Fi y datos de B;
- [ ] observar feedback offline/reconnecting;
- [ ] intentar una accion conectada no destructiva;
- [ ] confirmar que no finge exito ni habilita gameplay offline;
- [ ] restaurar red;
- [ ] usar retry si aparece;
- [ ] esperar reconciliacion;
- [ ] confirmar estado vigente.

```text
Resultado R2: PASS | FAIL | BLOCKED | NOT RUN
Metodo de corte:
Feedback visible:
Accion pausada correctamente: si | no
Tiempo hasta recovery:
Evidencia segura:
Incidente:
```

## R3 - Avance remoto mientras B esta offline

- [ ] registrar fase A;
- [ ] cortar red de B;
- [ ] A/C/D avanzan legitimamente a fase B;
- [ ] confirmar fase B en actores conectados;
- [ ] restaurar red de B;
- [ ] esperar reconciliacion o usar retry;
- [ ] confirmar que B ve fase B;
- [ ] confirmar que B no presenta fase A como vigente;
- [ ] confirmar ausencia de privados stale.

```text
Resultado R3: PASS | FAIL | BLOCKED | NOT RUN
Fase A:
Fase B:
Estado de B al reconectar:
Privados stale ausentes: si | no
Evidencia segura:
Incidente:
```

---

# 13. R4: sucesion real de host

Ejecutar separado de R1-R3 porque requiere superar 90 segundos de staleness.

```text
Room/tanda:
Fecha/hora:
Host inicial:
Candidato activo:
Fase inicial:
```

- [ ] desconectar o mandar host a background;
- [ ] mantener al menos un candidato activo;
- [ ] esperar mas de 90 segundos;
- [ ] permitir recovery o evaluacion natural;
- [ ] observar host vigente en varios dispositivos;
- [ ] confirmar que el nuevo host puede accion host-only;
- [ ] confirmar que otros no-host no pueden;
- [ ] devolver host original;
- [ ] confirmar que no recupera host automaticamente.

```text
Resultado R4: PASS | FAIL | BLOCKED | NOT RUN
Host antes:
Host despues:
Tiempo aproximado:
Accion host-only transferida: si | no
Host original no recupero autoridad: si | no
Evidencia segura:
Incidente:
```

---

# 14. U1: actualizacion PWA con dos versiones

## Puerta de preparacion

Los commits `973dc0d` y `a064ce2` no alcanzan para ejecutar U1 porque los cambios
intermedios son documentales/tests y `public/sw.js` mantiene la misma version de
cache. No marcar U1 como `PASS` sin dos versiones PWA realmente diferenciables.

```text
Version 1 / commit:
Version 2 / commit:
Metodo de despliegue autorizado:
Dispositivo/PWA instalada:
Preparacion completa: si | no
Motivo si BLOCKED:
```

## Ejecucion

- [ ] instalar o abrir V1;
- [ ] entrar a ruta no critica;
- [ ] desplegar o habilitar V2;
- [ ] detectar aviso o accion de update fuera de gameplay;
- [ ] entrar a una Room activa sin aplicar update;
- [ ] confirmar que update no queda accionable dentro de Room;
- [ ] confirmar ausencia de reload automatico;
- [ ] salir de Room/tanda a ruta no critica;
- [ ] aplicar update explicitamente;
- [ ] cerrar y reabrir PWA;
- [ ] confirmar refetch autoritativo de Group/Room/GameState;
- [ ] confirmar que cache no actua como autoridad de juego.

```text
Resultado U1: PASS | FAIL | BLOCKED | NOT RUN
Ruta donde se detecto update:
Comportamiento dentro de Room:
Reload automatico ausente: si | no
Ruta donde se aplico:
Resultado al reabrir:
Evidencia segura:
Incidente:
```

---

# 15. Registro de incidentes

Duplicar esta plantilla por incidente.

```text
ID:
Severidad: S0 | S1 | S2 | S3 | S4
Escenario:
Fecha/hora aproximada:
Commit:
Entorno:
URL:
Actores:
Dispositivo/SO/navegador:
Modo: browser | installed
Fase inicial:
Acciones realizadas:
Resultado esperado:
Resultado observado:
Privacidad afectada: si | no
Autoridad afectada: si | no
Recuperacion: retry | refresh | reconnect | ninguna
Resultado de recuperacion:
Evidencia segura:
Datos redactados:
Reproduccion minima:
Decision: bloquear | continuar | repetir | mejora futura
```

## Reproduccion minima

```text
1. Commit:
2. Entorno:
3. Actores:
4. Datos preparados:
5. Fase inicial:
6. Accion:
7. Resultado observado:
8. Resultado esperado:
9. Recuperacion:
10. Evidencia segura:
```

---

# 16. E1: revision de evidencia

- [ ] matriz maestra completa;
- [ ] todos los escenarios tienen resultado real;
- [ ] cada `BLOCKED` o `NOT RUN` tiene motivo;
- [ ] cada `FAIL` tiene incidente y reproduccion minima;
- [ ] capturas revisadas y redactadas;
- [ ] palabras privadas ausentes;
- [ ] roles privados ausentes;
- [ ] votos individuales ausentes;
- [ ] tokens y credenciales ausentes;
- [ ] nombres reales ausentes o consentidos;
- [ ] Room codes ocultos en evidencia publicable;
- [ ] incidentes S0-S4 clasificados;
- [ ] incidentes S2 tienen workaround o decision;
- [ ] evidencia interna sensible tiene acceso acotado;
- [ ] evidencia publicable marcada como opcional.

```text
Resultado E1: PASS | FAIL | BLOCKED | NOT RUN
Escenarios PASS:
Escenarios FAIL:
Escenarios BLOCKED:
Escenarios NOT RUN:
Incidentes S0:
Incidentes S1:
Incidentes S2:
Incidentes S3:
Incidentes S4:
Evidencia faltante:
Decision de revision:
```

---

# 17. D1: decision pre-beta

## Condiciones obligatorias

- [ ] P0 aprobado;
- [ ] S1-S8 cubiertos;
- [ ] N1 ejecutado con evidencia segura;
- [ ] C1-C10 en PASS;
- [ ] R1-R4 en PASS;
- [ ] U1 en PASS;
- [ ] Android Chrome installed PWA en PASS;
- [ ] iOS Add to Home Screen en PASS;
- [ ] Web Share y clipboard cubiertos;
- [ ] multi-actor/offline/reconnect cubierto;
- [ ] UX/UI mobile real revisada;
- [ ] ningun S0 o S1 abierto;
- [ ] S2 con workaround o decision explicita;
- [ ] evidencia interna segura completa.

Si un punto critico queda `FAIL`, `BLOCKED` o `NOT RUN`, no declarar aprobada
la aceptacion pre-beta.

```text
Resultado D1: ACCEPTED | BLOCKED | REJECTED
Fecha/hora:
Commit/version aceptada:
Responsable de decision:
Resumen:
Bloqueantes:
Incidentes aceptados:
Workarounds:
Pendientes no bloqueantes:
Proximo paso:
```

---

# 18. Checklist final compacto

- [ ] S1 navegador movil;
- [ ] S2 Android instalado;
- [ ] S3 iOS A2HS;
- [ ] S4 Group;
- [ ] S5 cuatro actores;
- [ ] S6 Room;
- [ ] S7 share/clipboard;
- [ ] S8 lobby/presencia;
- [ ] N1 sesion natural;
- [ ] C1 reveal;
- [ ] C2 discusion;
- [ ] C3 primera votacion;
- [ ] C4 empate;
- [ ] C5 segunda votacion;
- [ ] C6 guess incorrecto;
- [ ] C7 guess correcto;
- [ ] C8 scoreboard;
- [ ] C9 nueva ronda;
- [ ] C10 finished;
- [ ] R1 background;
- [ ] R2 reconnect;
- [ ] R3 avance remoto offline;
- [ ] R4 sucesion;
- [ ] U1 update PWA;
- [ ] E1 evidencia;
- [ ] D1 decision.
