# AGENTS.md

## Proyecto

Juegos Familiares es una plataforma mobile-first de juegos sociales
presenciales, con objetivo PWA progresiva.

Impostor es el primer juego y conserva su dominio propio. No promover conceptos
de Impostor a una arquitectura común para futuros juegos sin evidencia de un
segundo juego real que requiera reutilización.

Stack actual: Next.js, React, TypeScript, Supabase Auth, Postgres, RLS y
Realtime cuando el producto lo necesita.

## Estructura del repositorio

- `app/`: rutas, composición de experiencia y componentes de UI.
- `lib/`: utilidades y lógica concreta de aplicación.
- `lib/supabase/`: clientes, adaptadores y operaciones de integración con
  Supabase.
- `supabase/`: configuración local, migrations SQL, scripts, validadores de DB
  y smokes.
- `sources/`: contratos de producto, arquitectura, decisiones y método.
- Tests: archivos colocalizados `*.test.ts` y `*.test.tsx`; tests de migrations
  en `supabase/migrations/`; validadores y smokes de DB en `supabase/tests/`.

## Fuentes de verdad

`AGENTS.md` es la entrada operativa permanente. Leer solo lo necesario según
el tipo e impacto de la tarea.

| Tipo de tarea | Lectura mínima |
| --- | --- |
| Cambio localizado de UI, ruta o test | Implementación y tests cercanos |
| Cambio de reglas o flujo de Impostor | Implementación, tests y documentos relevantes de `sources/games/impostor/` |
| Cambio de producto de plataforma | `sources/platform/product-brief.md` |
| Entorno local, setup o scripts operativos | `README.md` y `package.json` |
| Arquitectura, autorización, datos, Supabase, Realtime, PWA o límites entre dominios | `sources/architecture.md` y superficie afectada |
| Alcance, decisiones relevantes o planificación | `sources/working-method.md`, `sources/project-principles.md` y, si corresponde, `sources/implementation-plan.md` |
| Aprendizajes verificables | `sources/portfolio-case-study.md` |

Ampliar la lectura cuando exista incertidumbre, impacto transversal, una
decisión relevante o posible contradicción.

La documentación posee contratos y decisiones. El código, SQL y tests muestran
el comportamiento actualmente implementado. Si difieren, reportar el drift o
contradicción; no corregirlo ni decidir silenciosamente qué fuente prevalece
fuera del alcance autorizado.

## Antes de cambiar

1. Confirmar raíz, rama y `git status --short`.
2. Detectar instrucciones aplicables y cambios preexistentes.
3. Inspeccionar implementación y tests cercanos antes de proponer una solución.
4. Delimitar objetivo, alcance, fuera de alcance, riesgos y validación.
5. Separar hechos, decisiones existentes, hipótesis y preguntas abiertas.
6. Si una decisión relevante no está definida o contradice una fuente de
   verdad, detenerse y reportarla.

El working tree puede contener cambios preexistentes legítimos. Preservarlos:
no restaurarlos, descartarlos, reformatearlos ni incorporarlos al alcance.

## Límites según la tarea

- Una tarea de diagnóstico, planificación, auditoría, revisión o smoke no
  autoriza cambios salvo indicación expresa.
- Una auditoría independiente debe informar hallazgos, riesgos y faltantes; no
  debe corregirlos.
- Una tarea de implementación autoriza únicamente las modificaciones necesarias
  para su alcance explícito.
- Implementar no autoriza automáticamente commit, push, PR, merge, deploy,
  migrations remotas ni cambios de documentación.
- Modificar documentación requiere que el encargo la incluya o autorización
  explícita para resolver drift real.

## Reglas de trabajo

- Trabajar en incrementos pequeños, verticales y verificables.
- Resolver el problema pedido; no agregar refactors, limpieza, dependencias ni
  cambios no relacionados.
- Preferir la alternativa mínima cuando la diferencia sea exclusivamente
  técnica.
- No tomar silenciosamente decisiones relevantes de producto, arquitectura,
  privacidad o UX.
- Mantener separadas las reglas de dominio y la infraestructura.
- Crear componentes, carpetas y abstracciones solo ante reutilización real.
  No crear `GenericGame`, `GameEngine`, `GenericRoom` ni equivalentes por
  anticipación.
- Diseñar y comprobar desde mobile-first. PWA es progresiva: no asumir offline
  completo para partidas sincronizadas.
- Mantener código, tipos y tests comprensibles.

## Seguridad, autoridad y privacidad

- El cliente envía intenciones; las decisiones sensibles se resuelven de forma
  autoritativa en backend o DB.
- Derivar identidad y ownership de `auth.uid()` y estado remoto autorizado.
  No confiar en IDs, roles, ownership, resultados ni secretos enviados por el
  cliente.
- `LocalIdentity`, caché, Presence y payloads de Realtime sirven para UX o
  invalidación; no autorizan acciones ni reemplazan el estado autoritativo.
- Incluir RLS, grants, RPCs y sus pruebas en cualquier cambio que afecte datos
  compartidos o permisos.
- No exponer a clientes no autorizados palabra secreta, identidad del impostor,
  votos individuales ni datos equivalentes. Ocultarlos en UI no es suficiente.
- Realtime notifica cambios; reconstruir el estado desde lecturas o RPCs
  autorizadas cuando corresponda.
- No registrar, devolver ni documentar credenciales, tokens o secretos.
- No usar `service_role` en frontend.

## Supabase y migrations

- Distinguir siempre Supabase local de remoto antes de operar.
- `npm run supabase:reset` es destructivo y solo aplica a la DB local.
- No aplicar migrations remotas, cambios remotos de datos ni limpieza remota
  sin autorización explícita y confirmación del destino.
- No reescribir migrations históricas aplicadas salvo encargo explícito,
  justificación y plan de alineación.
- Para cambios de DB, añadir o ajustar el test de contenido de migration cuando
  corresponda y validar en una DB local controlada.
- Comprobar contratos de RLS, grants, RPCs, privacidad e intentos no
  autorizados, no solo el caso feliz.
- Los scripts locales que escriben deben verificar inequívocamente un destino
  local. No introducir bypasses.
- No ejecutar limpieza destructiva si el entorno, las tablas afectadas o los
  identificadores son ambiguos.

## Validación

Elegir validación proporcional al riesgo, superficie afectada y etapa de cierre.

- Durante la implementación, ejecutar tests focalizados para el comportamiento
  modificado cuando existan.
- Seleccionar `npm test`, `npm run lint` y `npm run build` según el riesgo, la
  superficie afectada y si se está cerrando un incremento.
- Para cambios de DB, RLS, RPC, permisos o privacidad, ejecutar los tests de
  migration y validadores de DB relevantes desde Supabase local controlado.
  Usar `npm run test:db` cuando el alcance requiera la suite disponible.
- Para cambios de comportamiento en Realtime, concurrencia o reconexión,
  validar según riesgo identidades o sesiones aisladas, eventos perdidos,
  refresh o carga directa y reconstrucción desde estado autoritativo.
- Para mobile o PWA, realizar revisión visual mobile y, según el alcance,
  comprobar instalación, lifecycle, red y caché.
- Para secretos o roles, comprobar explícitamente que cada actor recibe solo
  los datos autorizados.
- Ejecutar `git diff --check` antes de entregar cualquier cambio textual,
  salvo que no haya modificaciones.

Reportar las validaciones ejecutadas, sus resultados y las no ejecutadas.

## Git y acciones externas

- `main` representa estado estable. Los cambios funcionales se hacen en ramas
  cortas y coherentes.
- No trabajar directamente en `main` para cambios funcionales sin autorización
  explícita.
- No usar comandos destructivos ante ambigüedad: no ejecutar reset hard,
  checkout o restore destructivos, limpieza masiva ni borrado de ramas.
- No hacer commit, push, PR, merge, deploy, release, cambios remotos ni aplicar
  migrations remotas sin autorización explícita.
- Se pueden iniciar servicios locales cuando sean necesarios para una tarea ya
  autorizada y dentro de su alcance.
- No iniciar servicios, instalar dependencias ni persistir datos cuando no sean
  necesarios para el encargo.
- Mantener autorización explícita para operaciones remotas, destructivas o
  externas.

## Documentación

Actualizar documentación solo cuando el encargo la incluya o exista autorización
explícita para resolver una decisión, contrato, aprendizaje o drift real.

- Mantener separados hechos, decisiones, hipótesis, implementación, validación
  y aprendizaje.
- Actualizar la fuente específica que posee el contrato; no duplicarla aquí.
- Usar `sources/portfolio-case-study.md` para aprendizajes relevantes y verificables,
  no como tablero de estado actual.
- No convertir este archivo en roadmap, changelog, inventario de migrations,
  schema, firmas RPC ni especificación completa de Impostor.

## Reporte de cierre

Al finalizar, informar:

1. Resultado y alcance completado.
2. Archivos modificados y archivos no tocados deliberadamente.
3. Decisiones tomadas, supuestos y contradicciones detectadas.
4. Validaciones ejecutadas y resultados.
5. Validaciones no ejecutadas y motivo.
6. Riesgos, pendientes o decisiones humanas necesarias.
7. Estado de acciones externas y autorización aplicable.
8. Confirmación de que los cambios preexistentes fueron preservados.
