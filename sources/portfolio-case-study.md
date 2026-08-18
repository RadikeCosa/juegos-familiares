# Juegos Familiares — Impostor: registro para case study

## Propósito

Este archivo es un documento vivo para registrar información útil para construir más adelante un case study público de portfolio sobre:

```text
Juegos Familiares — Impostor
```

No es el case study final.

No es una pieza de marketing.

No afirma resultados que todavía no existen.

El proyecto tiene un doble objetivo:

1. construir un producto real y jugable;
2. recorrer conscientemente producto, UX, arquitectura, seguridad, testing, PWA e implementación.

El case study futuro debe mostrar tanto el resultado como el razonamiento que llevó a él.

---

# 1. Estado actual

```text
Estado:
Incremento 2 cerrado / Incremento 3 pendiente
```

## Ya existe

* principios del proyecto;
* product brief de la plataforma Juegos Familiares;
* product brief de Impostor;
* reglas v0 de Impostor;
* user flow;
* decisiones de producto;
* modelo conceptual de datos;
* modelo de estados;
* requisitos técnicos;
* arquitectura conceptual;
* plan de implementación incremental;
* repositorio Git inicializado y estable;
* línea base documental en `main`;
* fundación frontend mínima en rama de trabajo;
* portada de plataforma y entrada a Impostor;
* configuración local de Supabase;
* identidad anónima creada bajo intención de producto;
* modelo remoto mínimo `Group` + `Player`;
* invitación por código/enlace opaco;
* bootstrap de contexto reconocido;
* vista navegable de grupo con integrantes;
* invitación administrativa recuperable desde contexto reconocido;
* persistencia local defensiva mediante `LocalIdentity`;
* RLS y RPCs autoritativas para identidad, grupo e invitación;
* tests unitarios, validaciones de base de datos y smoke browser/mobile para Incremento 2;
* migrations remotas aplicadas y alineadas con el historial local;
* smoke de producción aprobado en Vercel con dos identidades reales aisladas.

## PENDIENTE

* producto jugable;
* playtesting real;
* métricas;
* banco de palabras;
* sala/lobby;
* realtime/presence;
* tests de dominio de juego;
* UI final;
* evidencia visual;
* resultados de uso.

---

# 2. Contexto del proyecto

Juegos Familiares es una aplicación contenedora mobile-first con objetivo PWA para juegos presenciales de grupos pequeños.

Impostor es el primer juego dentro de esa aplicación.

Está pensado principalmente para familias o grupos de amigos donde cada participante utiliza su propio teléfono. La interacción principal ocurre entre las personas: conversar, sospechar, votar, reírse, equivocarse y volver a jugar.

La tecnología aporta valor cuando coordina aquello que sería difícil o incómodo resolver manualmente:

* identidad sencilla dentro de un grupo;
* banco compartido de palabras;
* sala temporal;
* distribución de información privada;
* sincronización entre teléfonos;
* votación secreta;
* resolución de resultados;
* marcador;
* historial mínimo.

---

# 3. Problema / desafío

El desafío central del producto es:

> ¿Cómo construir un juego social multi-dispositivo donde varios teléfonos compartan estado y al mismo tiempo reciban información privada distinta, sin convertir la aplicación en el centro de la experiencia presencial?

Retos asociados:

* comenzar con baja fricción;
* funcionar bien con 3 a 8 jugadores, especialmente 4;
* mantener la palabra secreta fuera del dispositivo del impostor;
* mantener votos privados hasta la revelación;
* sincronizar fases y resultados entre teléfonos;
* manejar presencia y host temporal;
* recuperarse razonablemente ante refresh, segundo plano o pérdida breve de conexión;
* comportarse como PWA en iOS y Android;
* usar infraestructura proporcional al caso familiar inicial.

Estado: `IMPLEMENTACIÓN PARCIAL`.

La base de plataforma para identidad liviana, grupo, jugador e invitación ya está implementada y endurecida. El juego jugable de Impostor todavía está pendiente: banco de palabras, sala, realtime, roles, votación, scoring e historial siguen en incrementos futuros.

---

# 4. Objetivos

## Objetivos de producto

* llegar a jugar con pocos pasos;
* funcionar para 3 a 8 jugadores;
* optimizar el caso principal de 4 jugadores;
* usar un teléfono por participante;
* mantener baja intervención digital durante la conversación presencial;
* permitir agregar palabras en cualquier momento;
* construir un banco de palabras propio del grupo;
* mantener marcador durante la tanda;
* conservar historial mínimo para estadísticas futuras;
* evitar cuentas tradicionales en el MVP.

## Objetivos técnicos

* cliente mobile-first;
* PWA instalable sin que la instalación sea obligatoria;
* estado compartido consistente;
* fuente autoritativa para decisiones sensibles;
* privacidad real por jugador;
* sincronización entre dispositivos cuando el producto lo necesita;
* presencia básica;
* autorización para administrador, host, participante y autor de palabra;
* persistencia para grupo, jugadores, palabras e historial mínimo;
* reconexión razonable;
* dominio de Impostor separable de infraestructura.

## Objetivos de aprendizaje

* entender decisiones de producto antes de programar;
* diseñar reglas y flujo antes de arquitectura;
* aprender PWA progresivamente;
* diferenciar estado local, temporal, compartido y persistente;
* entender cliente/servidor, realtime y sincronización;
* comprender privacidad, autorización y límites de confianza del cliente;
* construir verticalmente por incrementos verificables;
* usar tests como documentación de reglas;
* usar IA sin delegar decisiones incomprensibles.

---

# 5. Restricciones

* contexto familiar o grupos pequeños;
* 3 a 8 jugadores;
* caso principal: 4 jugadores;
* iOS/Safari y Android/Chrome;
* navegador más instalación opcional;
* sin email/password en el MVP;
* infraestructura proporcional;
* bajo costo cognitivo y operativo;
* sin partida multi-dispositivo offline completa;
* sin matchmaking;
* sin escala masiva;
* privacidad de palabra, impostor, votos y banco de palabras;
* no generalizar para juegos futuros antes de tener un segundo juego real.

---

# 6. Mi rol

## Rol previsto para el case study

* Product discovery;
* product design;
* UX;
* arquitectura;
* full-stack development;
* testing;
* PWA.

## Estado real actual

Completado:

* product discovery inicial;
* reglas;
* user flow;
* decisiones de producto;
* modelo conceptual;
* modelo de estados;
* requisitos técnicos;
* arquitectura conceptual;
* plan incremental;
* fundación técnica del proyecto;
* exploración y decisión de dirección visual para el Incremento 1;
* portada mobile-first y entrada a Impostor;
* base de plataforma del Incremento 2:
  * Auth anónima sin cuentas tradicionales;
  * grupo y jugador administrador;
  * invitación por código/enlace;
  * segundo dispositivo como segundo jugador;
  * bootstrap de contexto reconocido;
  * vista de grupo con integrantes visibles;
  * CTA de invitación solo para administrador;
  * `LocalIdentity` como cache local no autoritativa;
  * RLS, RPCs y pruebas negativas.
* validación de producción del flujo completo en Vercel con dos identidades aisladas.

PENDIENTE:

* gameplay de Impostor;
* banco de palabras;
* lobby/sala;
* realtime/presence;
* privacidad de palabra y rol;
* votación, scoring e historial;
* testing práctico;
* diseño UI final;
* validación en dispositivos reales;
* playtesting;
* iteración sobre uso real.

---

# 7. Proceso

| Etapa | Estado |
| --- | --- |
| Idea inicial | COMPLETADA |
| Reglas del juego | COMPLETADA |
| User flow | COMPLETADA |
| Decisiones de producto | COMPLETADA |
| Modelo conceptual de datos | COMPLETADA |
| Modelo de estados | COMPLETADA |
| Requisitos técnicos | COMPLETADA |
| Comparación / decisión arquitectónica | COMPLETADA |
| Arquitectura conceptual | COMPLETADA |
| Plan incremental | COMPLETADA |
| Fundación técnica | COMPLETADA |
| Dirección visual del Incremento 1 | COMPLETADA |
| Portada y entrada a Impostor | COMPLETADA |
| Identidad, grupo, jugador e invitación | COMPLETADA |
| Gameplay de Impostor | PENDIENTE |
| Playtesting | PENDIENTE |
| Iteración | PENDIENTE |

No hay estimaciones de fecha en este documento.

## Método de trabajo aplicado (IA + criterio humano)

Este proyecto adopta explícitamente el método operativo definido en `sources/working-method.md`.

En el case study final no solo debe mostrarse qué se construyó, sino también cómo se tomaron decisiones y cómo se validó cada paso.

### Ciclo operativo

Para cada incremento usamos este ciclo:

```text
entender el problema
→ decidir con criterio
→ implementar en pequeño
→ validar según riesgo
→ capturar aprendizaje
→ ajustar siguiente paso
```

Esto evita dos riesgos frecuentes:

* programar sin contexto suficiente;
* aumentar complejidad sin una necesidad real.

### Regla de trazabilidad documental

Antes de cerrar una decisión relevante, debe poder trazarse contra el corpus de `sources/`:

* `project-principles.md` para principios de producto y desarrollo;
* `platform/product-brief.md` para alcance de plataforma;
* `games/impostor/product-brief.md` para intención del juego;
* `architecture.md` para límites entre plataforma, dominio e infraestructura;
* `implementation-plan.md` para secuencia incremental;
* `working-method.md` para forma de trabajo con IA.

Si una implementación contradice estos documentos, la contradicción debe registrarse y resolverse explícitamente.

### Regla de alcance por incremento

Cada tarea delegada a IA debe declarar:

* objetivo del cambio;
* contexto mínimo necesario;
* decisiones ya tomadas que no se negocian;
* alcance y fuera de alcance;
* criterios de calidad;
* validación requerida.

Si esto no está claro, la tarea se considera inmadura para implementación.

### Validación proporcional al riesgo

No todos los cambios requieren el mismo nivel de verificación.

Criterio operativo:

* bajo riesgo: revisión de diff, typecheck/lint/test de alcance local;
* riesgo medio: agregar pruebas de comportamiento y verificación de estados;
* alto riesgo: pruebas multi-dispositivo, revisión de seguridad/autorización y validación manual guiada.

La pregunta guía es:

> ¿Qué podría salir mal en este incremento y cómo lo comprobamos antes de continuar?

### Qué debe verse en el case study público

Para sostener credibilidad, cada hito importante debería mostrar:

* problema que se resolvía;
* alternativas consideradas;
* decisión tomada y trade-off;
* evidencia de validación;
* aprendizaje y ajuste posterior.

Este enfoque convierte el uso de IA en un acelerador de ejecución y análisis, no en una caja negra de decisiones.

---

# 8. Decisiones clave

## Juegos Familiares como plataforma + Impostor como primer dominio

**Decisión:** Impostor se desarrolla dentro de Juegos Familiares.

**Problema que resolvía:** permitir que identidad, grupo, jugadores, navegación y PWA puedan servir a más de un juego sin convertir Impostor en una aplicación aislada.

**Alternativas consideradas:** app exclusiva de Impostor; plataforma genérica de juegos.

**Motivo:** se preservan capacidades compartidas reales sin diseñar un motor genérico.

**Trade-off:** aparece una capa de plataforma mínima que requiere disciplina para no sobregeneralizar.

**Estado:** DECIDIDA.

## Un teléfono por jugador

**Decisión:** cada participante usa su propio teléfono.

**Problema que resolvía:** distribuir información privada y permitir votación secreta sin componentes físicos adicionales.

**Alternativas consideradas:** un solo dispositivo compartido; tarjetas físicas; juego completamente manual.

**Motivo:** permite palabra privada, rol privado, votos individuales y sincronización.

**Trade-off:** cada jugador necesita dispositivo y conectividad.

**Estado:** DECIDIDA.

## PWA en lugar de app nativa inicial

**Decisión:** Juegos Familiares será una web mobile-first con objetivo PWA.

**Problema que resolvía:** acceso rápido por URL, instalación opcional y distribución simple.

**Alternativas consideradas:** app nativa; web sin objetivo PWA.

**Motivo:** reduce fricción inicial y permite aprender PWA progresivamente.

**Trade-off:** hay diferencias reales entre iOS y Android que deberán probarse.

**Estado:** DECIDIDA.

## Identidad liviana/anónima

**Decisión:** no usar cuentas tradicionales con email/password en el MVP.

**Problema que resolvía:** evitar fricción innecesaria para un juego familiar casual.

**Alternativas consideradas:** registro tradicional; autenticación social; identidad solamente local.

**Motivo:** el producto necesita reconocer jugador y grupo, pero no identidad pública global.

**Trade-off:** hay que cuidar que identidad local no se convierta en autorización.

**Estado:** DECIDIDA.

## Identidad sin cuentas tradicionales

**Problema:** el producto necesita reconocer quién es cada jugador dentro de un grupo, pero pedir email, password o login social antes de una partida familiar agregaría fricción desproporcionada.

**Tensión:** una identidad puramente local sería cómoda, pero insuficiente para autorizar acceso a datos remotos. Una cuenta tradicional sería robusta, pero demasiado pesada para el momento de uso.

**Modelo adoptado:** separar explícitamente cuatro conceptos:

```text
AuthIdentity
Player
Group
LocalIdentity
```

`AuthIdentity` es la identidad técnica anónima de Supabase. `Player` es la persona dentro del grupo. `Group` es el contexto familiar compartido. `LocalIdentity` es una pista de UX guardada en el dispositivo, no una credencial.

**UX resultante:** crear un grupo o unirse por invitación crea/restaura la identidad anónima sólo cuando hay intención explícita. Visitar la portada o la pantalla inicial de Impostor no crea sesión por anticipado.

**Consistencia:** la creación inicial de grupo, jugador administrador e invitación sucede en una RPC autoritativa. El cliente no envía `auth_user_id` ni decide pertenencia remota.

**Invitación:** el segundo dispositivo entra mediante código/enlace opaco. Resolver la invitación no enumera grupos públicamente y unirse crea un nuevo `Player` asociado a la `AuthIdentity` de ese dispositivo.

**Seguridad:** RLS queda activa desde el primer dato remoto. Las tablas de plataforma no aceptan escrituras directas desde el cliente y el acceso de lectura depende de pertenecer al grupo.

**Persistencia local:** `LocalIdentity` mejora la reapertura de la app cuando la sesión anónima sigue vigente. Si la sesión se perdió, no se recupera automáticamente el jugador anterior usando datos locales manipulables.

**Endurecimiento:** el nickname duplicado dentro del grupo se informa con un mensaje de producto específico: "Ese nombre ya está en uso en este grupo. Probá con otro." Otros errores de unicidad siguen siendo genéricos.

**Trade-offs aceptados:** no se implementó rate limiting de invitaciones en este incremento. La mitigación actual depende de códigos opacos, RLS, RPCs acotadas y ausencia de enumeración pública. La recuperación avanzada de sesión y múltiples grupos por dispositivo quedan fuera del MVP inmediato.

**Resultado del Incremento 2:** el proyecto ya tiene una base real para reconocer grupo y jugador sin cuentas tradicionales, sin convertir la identidad local en autorización y sin adelantar todavía banco de palabras, sala o realtime.

## De pertenecer a un grupo a tener un lugar

**Problema inicial:** queríamos que una persona pudiera entrar rápido, sin email/password, pero que el sistema pudiera reconocerla, aislar grupos y permitir que otro teléfono se sumara al mismo contexto.

**Tensión:** baja fricción, identidad verificable y autorización segura tiraban en direcciones distintas. Una identidad local pura era cómoda, pero no alcanzaba para proteger datos remotos. Una cuenta tradicional era robusta, pero demasiado pesada para el momento de uso.

**Modelo mental:** el incremento separó `AuthIdentity`, `Player`, `Group` y `LocalIdentity`. La identidad técnica permite autorización; el `Player` representa a la persona dentro del grupo; el `Group` es el contexto social persistente; `LocalIdentity` solo ayuda a la UX.

**Autoridad:** el cliente pide y la base decide. Las operaciones sensibles pasan por `auth.uid()`, Postgres, RLS y RPCs autoritativas. Crear grupo no es una suma de inserts desde UI: crea coherentemente Auth, Group, Player administrador e invitación.

**Invitación:** el segundo jugador entra por código/enlace opaco, no por `groupId`. La resolución y el join ocurren mediante operaciones acotadas, sin acceso directo del cliente a `group_invitations`.

**Bootstrap:** reabrir parte de la sesión anónima, busca `Player` y resuelve `Group`. No crea identidad nueva. Si la sesión se perdió, `LocalIdentity` no funciona como mecanismo mágico de recovery.

**Primer aprendizaje del smoke manual:** técnicamente el sistema ya podía reconocer al usuario y recuperar su grupo, pero la UI expresaba poco de esa capacidad: mostraba el dato del grupo sin una próxima acción clara. La arquitectura estaba bien, pero la experiencia no decía "este es tu lugar".

**Regresión de invitación:** después de crear el grupo, la invitación existía, pero se perdía visualmente al pasar al estado reconocido. La solución no fue guardar el código localmente ni abrir RLS sobre invitaciones. Se agregó `get_my_active_group_invitation()`, una RPC autoritativa que permite al administrador recuperar su invitación activa bajo intención.

**Segundo aprendizaje UX:** aun con invitación disponible, apareció una pregunta más básica: ¿dónde está mi grupo? Eso separó pertenecer técnicamente a un `Group` de tener un espacio reconocible en la experiencia.

**Solución:** se creó `/impostor/grupo` con nombre, integrantes, admin derivado y acción de invitación solo para administrador. La ruta resuelve la UX del grupo sin adelantar `Room`.

**Group vs Room:** `Group` responde "quiénes somos". `Room` responderá más adelante "dónde/qué estamos jugando ahora". En el Incremento 2 no existe sala, lobby, realtime ni presence.

**Valor del smoke real:** unit tests y DB tests cubrieron invariantes técnicos, pero no detectaron pantalla muerta, invitación perdida visualmente ni falta de un lugar para entrar al grupo. El smoke browser/mobile encontró esos huecos de producto.

**Validación:** el cierre combinó unit/static, DB real, smoke browser y revisión mobile. El resultado no es todavía un juego jugable, pero sí una experiencia donde el usuario puede reconocer su grupo, entrar, ver quiénes están y sumar personas si es administrador.

**Cierre en producción:** el modelo se validó primero localmente con tests y base limpia. El smoke manual encontró huecos de UX que los tests no mostraban: una pantalla reconocida sin próxima acción clara, una invitación creada pero no recuperable visualmente y la falta de una vista concreta para el grupo. Después de corregir esos puntos, la base remota se alineó mediante migrations versionadas y el flujo completo se volvió a probar en Vercel con dos identidades reales aisladas. El resultado de producto en producción es que una persona puede crear o unirse a un grupo, reabrir su contexto, entrar a la vista del grupo, ver integrantes e invitar de forma segura si es administradora.

**Trade-offs deliberados:** quedan fuera recovery avanzado de Auth perdida, múltiples grupos por identidad, `Membership`, múltiples admins, expiración/regeneración/revocación de invitaciones, rate limiting específico, `Room`, Realtime y Presence.

## Estado autoritativo

**Decisión:** los clientes envían intenciones, pero no deciden palabra, impostor, votos, ganador, puntos, fase ni host.

**Problema que resolvía:** evitar divergencia entre dispositivos y manipulación de información sensible.

**Alternativas consideradas:** lógica decisoria en cada cliente; sincronización optimista completa.

**Motivo:** la partida requiere una única progresión compartida y consistente.

**Trade-off:** hace falta infraestructura autoritativa para operaciones críticas.

**Estado:** DECIDIDA.

## Privacidad: no enviar la palabra al impostor

**Decisión:** el impostor no debe recibir la palabra secreta, no solo ocultarla visualmente.

**Problema que resolvía:** privacidad real de la información central del juego.

**Alternativas consideradas:** enviar todo al cliente y ocultar por UI.

**Motivo:** ocultar datos en la interfaz no es seguridad.

**Trade-off:** requiere vistas o consultas privadas por jugador.

**Estado:** DECIDIDA.

## Supabase frente a Firebase/backend propio

**Decisión:** usar Supabase para el MVP.

**Problema que resolvía:** resolver identidad, persistencia, autorización y sincronización sin construir backend propio desde cero.

**Alternativas consideradas:** Firebase; backend propio; otras opciones realtime.

**Motivo:** encaja con TypeScript, Postgres, RLS y aprendizaje progresivo.

**Trade-off:** introduce dependencia de proveedor y obliga a diseñar bien políticas y operaciones autoritativas.

**Estado:** DECIDIDA EN ARQUITECTURA.

## Postgres + RLS + Realtime/Presence

**Decisión:** Postgres para persistencia, RLS para autorización, Realtime y Presence cuando correspondan.

**Problema que resolvía:** combinar datos persistentes, permisos y sincronización en una misma plataforma gestionada.

**Alternativas consideradas:** realtime propio; base documental; polling simple para todos los casos.

**Motivo:** el juego necesita estado compartido, privacidad y presencia básica.

**Trade-off:** Realtime y Presence deben introducirse por necesidad, no como capa universal.

**Estado:** DECIDIDA CON INTRODUCCIÓN PROGRESIVA.

## Dominio separado de infraestructura

**Decisión:** las reglas puras de Impostor deben poder probarse sin React ni Supabase.

**Problema que resolvía:** evitar que reglas como selección de impostor, votos y scoring queden mezcladas con detalles de infraestructura.

**Alternativas consideradas:** implementar reglas directamente en componentes o handlers de datos.

**Motivo:** mejora comprensión, testing y capacidad de cambio.

**Trade-off:** exige mantener una frontera clara sin crear abstracciones innecesarias.

**Estado:** DECIDIDA.

## No crear abstracciones genéricas para juegos futuros

**Decisión:** no construir `GameEngine`, `GenericGame`, `GenericRound` ni equivalentes.

**Problema que resolvía:** evitar complejidad preventiva por un segundo juego que todavía no existe.

**Alternativas consideradas:** diseñar desde el inicio una plataforma genérica de juegos.

**Motivo:** solo se comparten capacidades ya confirmadas: identidad, grupo, jugadores, navegación y PWA.

**Trade-off:** si llega otro juego, algunas piezas podrán extraerse después.

**Estado:** DECIDIDA.

## Historial mínimo para estadísticas futuras

**Decisión:** persistir resumen mínimo de tandas y rondas finalizadas.

**Problema que resolvía:** preservar datos útiles para estadísticas futuras sin construir la UI todavía.

**Alternativas consideradas:** no persistir historial; persistir todo, incluidos votos individuales.

**Motivo:** permite futuras estadísticas divertidas con baja carga de datos.

**Trade-off:** hay que definir qué conservar y qué descartar por privacidad y simplicidad.

**Estado:** DECIDIDA.

## Dirección visual: Cartas Geométricas

**Decisión:** adoptar `Cartas Geométricas` como base visual para la primera UI real de Juegos Familiares.

**Problema que resolvía:** definir una identidad clara para la portada del Incremento 1 sin atar la plataforma completa al tono de Impostor ni construir un design system prematuro.

**Alternativas consideradas:** `Mesa Viva`, con mayor calidez familiar; `Secreto Amable`, con mayor relación conceptual con Impostor.

**Motivo:** fue la dirección que mejor equilibró claridad mobile, carácter lúdico, accesibilidad, escalabilidad como plataforma y una implementación sencilla mediante tokens semánticos.

**Trade-off:** puede sentirse menos cálida que `Mesa Viva` si se ejecuta de forma demasiado tecnológica. La calidez deberá aparecer en copy, espaciado y microdetalles, no mezclando arbitrariamente paletas de varias propuestas.

**Definición inicial:** lenguaje contemporáneo, lúdico y claro; geometría basada en cartas/fichas; `Sora` para display; `Source Sans 3` para body/UI; iconografía `Lucide`; soporte light/dark desde la primera UI real; radios y sombras moderados; símbolo conceptual de cuatro fichas/cuadrados con una pieza diferenciada.

**Estado:** DECIDIDA PARA INCREMENTO 1.

---

# 9. Evolución de decisiones

## De app Impostor a Juegos Familiares + Impostor

Inicialmente el foco estaba en crear el juego Impostor.

Durante la planificación se definió que el producto sería parte de una aplicación contenedora: Juegos Familiares.

La decisión permite reutilizar identidad, grupo, jugadores, navegación y capacidades PWA en futuros juegos. Al mismo tiempo, el corpus dejó explícita la regla de no crear abstracciones genéricas para juegos futuros hasta que un segundo juego real demuestre una necesidad compartida.

Estado: REGISTRADA.

## De estado puramente temporal a historial mínimo persistente

El diseño inicial podía concentrarse solo en coordinar una tanda activa.

Durante la planificación apareció el valor futuro de estadísticas del grupo. Se decidió conservar un resumen mínimo de tandas y rondas finalizadas, sin construir todavía una pantalla de estadísticas y sin conservar votos individuales históricos.

Estado: REGISTRADA.

## De tecnología abierta a arquitectura Supabase

Los requisitos técnicos describieron capacidades sin elegir proveedor.

Luego la arquitectura conceptual cerró Supabase para el MVP: Auth, Postgres, RLS, Realtime y Presence cuando correspondan.

Estado: REGISTRADA.

## De exploración visual a dirección de plataforma

Antes de implementar la portada se compararon tres direcciones visuales: `Mesa Viva`, `Cartas Geométricas` y `Secreto Amable`.

La elección no se tomó como preferencia estética aislada. El criterio fue elegir una dirección que pudiera sostener a Juegos Familiares como plataforma, permitir futuros juegos y mantener claridad en mobile sin adelantar un design system completo.

Se descartó basar la identidad general demasiado directamente en misterio, rol secreto, Impostor, estética gamer o estética infantil. `Cartas Geométricas` permite que Impostor sea la primera opción disponible sin convertirlo en la identidad completa del producto.

La primera UI real usará una base pequeña de tokens semánticos para color, tipografía, radios, foco y sombra. Los componentes deberán depender de significado semántico, no de colores hardcodeados. La estructura podrá crecer solo cuando aparezcan necesidades reales.

Se decidió incluir soporte light/dark desde esta primera UI porque el alcance visual todavía es pequeño y permite validar que los tokens son realmente semánticos. No queda cerrada todavía la UX de selección o persistencia del tema.

Figma no se incorpora en esta etapa. La exploración ya permitió cerrar dirección, tipografías, iconografía, formas y símbolo conceptual; la siguiente validación de mayor valor será observar una primera UI pequeña funcionando en mobile.

Estado: REGISTRADA.

---

# 10. Arquitectura resumida

La arquitectura está definida conceptualmente y la primera capa de plataforma ya está implementada para identidad, grupo, jugador, invitación y bootstrap.

La capa específica de juego todavía no comenzó: banco de palabras, salas, tandas, rondas, votos, marcador e historial permanecen en incrementos futuros.

```text
Juegos Familiares PWA
        │
        ▼
Platform
- identidad
- Group / Player
- navegación
- PWA shell

        │
        ▼
Impostor
- banco de palabras
- salas
- tandas
- rondas
- votos
- marcador
- historial

        │
        ▼
Supabase
- Auth
- Postgres
- RLS
- Realtime
- Presence
```

Responsabilidad principal:

* el cliente renderiza UI, navega y envía intenciones;
* el sistema autoritativo decide información sensible y transiciones críticas;
* el dominio de Impostor debe permanecer comprensible y testeable sin depender directamente de UI o proveedor.

---

# 11. Desafíos técnicos previstos

Estado general: `IMPLEMENTACIÓN PARCIAL`.

Resuelto en el Incremento 2:

* identidad técnica anónima sin cuentas tradicionales;
* separación entre `AuthIdentity`, `Player`, `Group` y `LocalIdentity`;
* creación atómica de grupo, jugador administrador e invitación inicial;
* acceso por invitación desde segundo dispositivo;
* nickname único dentro del grupo;
* vista navegable del grupo con integrantes;
* recuperación autoritativa de invitación activa para administrador;
* RLS mínima para que un jugador sólo lea su grupo;
* escrituras remotas a través de RPCs autoritativas;
* bootstrap de contexto reconocido al reabrir;
* manejo defensivo de `LocalIdentity` manipulada o sesión perdida.

Pendiente para el juego:

* varios dispositivos sincronizados en una misma sala;
* información privada distinta por jugador;
* impedir que la palabra llegue al impostor;
* votos secretos sin resultados parciales;
* concurrencia del último voto;
* doble toque del host en acciones críticas;
* host desconectado y reasignación;
* reconexión después de refresh o segundo plano;
* lifecycle PWA en mobile;
* diferencias iOS/Safari y Android/Chrome;
* cache sin exponer datos sensibles;
* RLS para banco de palabras, sala, rondas, votos y permisos específicos de Impostor;
* separación real entre dominio e infraestructura.

La parte resuelta todavía no implica que Impostor sea jugable. Sólo cierra la base transversal de identidad, grupo y jugador.

---

# 12. Implementación por incrementos

Esta tabla resume el plan. Debe actualizarse al cerrar cada incremento.

| Incremento | Capacidad | Estado | Evidencia |
| --- | --- | --- | --- |
| 0 | Fundación del proyecto | COMPLETADO | Next.js, TypeScript, lint, Vitest, build y pantalla mobile-first mínima |
| 1 | Portada de plataforma y entrada a Impostor | COMPLETADO | Portada mobile-first, entrada a Impostor, manifest/metadatos e iconos base |
| 2 | Identidad liviana, grupo y jugador | COMPLETADO | Auth anónima bajo intención, RPCs, RLS, invitaciones, bootstrap, LocalIdentity, vista de grupo, migrations remotas alineadas y smoke Vercel A/B aprobado |
| 3 | Banco de palabras del grupo | PENDIENTE | PENDIENTE |
| 4 | Crear y unirse a una sala | PENDIENTE | PENDIENTE |
| 5 | Presencia básica y sucesión de host | PENDIENTE | PENDIENTE |
| 6 | Iniciar tanda y preparar ronda privada | PENDIENTE | PENDIENTE |
| 7 | Confirmación de rol y estado PLAYING | PENDIENTE | PENDIENTE |
| 8 | Primera votación | PENDIENTE | PENDIENTE |
| 9 | Empate y segunda votación | PENDIENTE | PENDIENTE |
| 10 | Intento final del impostor | PENDIENTE | PENDIENTE |
| 11 | Puntuación, marcador y nueva ronda | PENDIENTE | PENDIENTE |
| 12 | Terminar tanda e historial mínimo | PENDIENTE | PENDIENTE |
| 13 | Reconexión básica | PENDIENTE | PENDIENTE |
| 14 | Maduración PWA iOS/Android del MVP | PENDIENTE | PENDIENTE |
| 15 | Auditoría final de seguridad, testing y UX del MVP | PENDIENTE | PENDIENTE |

El primer MVP jugable está previsto al cerrar el Incremento 12.

---

# 13. Plantilla para registrar incrementos cerrados

Duplicar esta plantilla solo cuando un incremento esté terminado o haya una decisión/problema importante que valga la pena conservar.

## Incremento 0 — Fundación del proyecto

Estado: `COMPLETADO`

### Problema

El proyecto debía pasar de un corpus documental a una base ejecutable sin perder `sources/`, sin crear un proyecto anidado y sin introducir arquitectura prematura antes de tener producto.

Además, antes de implementar se detectó una carpeta `.git` vacía e inválida. Se auditó el estado del repositorio antes de reparar nada: raíz correcta, ausencia de repositorios padre o anidados, `.git` sin información recuperable y documentación intacta.

### Qué implementamos

Se inicializó Git correctamente en la raíz, se creó una línea base documental en `main`, se dejó `skills-lock.json` versionado y `.agents/` ignorado como estado local de skills instaladas.

Sobre una rama de trabajo se creó una fundación frontend mínima directamente en la raíz existente: Next.js, TypeScript, npm, App Router, ESLint, Vitest y una pantalla inicial mobile-first de `Juegos Familiares`.

### Decisiones relevantes

La base de Next.js se creó manualmente en lugar de usar `create-next-app`. El scaffolding manual exigió más configuración inicial, pero permitió controlar exactamente qué entraba al proyecto y redujo el riesgo de sobrescribir documentación o crear una aplicación anidada.

El alcance se mantuvo deliberadamente pequeño: no entraron Supabase, autenticación, realtime, dominio de Impostor, service worker, PWA avanzada, CI/CD ni diseño visual definitivo.

El test mínimo quedó orientado a proteger una decisión real del proyecto, no una abstracción creada solo para tener algo testeable.

### Ajustes durante la revisión

Se eliminó `min-width: 320px` porque podía forzar overflow horizontal en viewports menores a 320px. La fundación técnica también debía respetar el criterio mobile-first mediante una composición fluida.

También se eliminó una función `getAppName()` que envolvía un string sin aportar comportamiento real. Aunque era utilizada por la aplicación, su valor principal era fabricar una superficie de test, y eso iba contra el principio de evitar abstracciones prematuras.

### Cómo lo validamos

El incremento cerró con lint, test, build y revisión de diff. `sources/` permaneció intacta y no se creó ningún proyecto anidado.

```text
npm run lint      PASS
npm test          PASS
npm run build     PASS
git diff --check  PASS
```

### Qué aprendí

Resolver primero el estado del repositorio redujo el riesgo de perder trabajo o construir sobre una base ambigua.

Una fundación técnica no es un logro de producto final, pero sí fija hábitos importantes: controlar el alcance, validar temprano, revisar el diff completo y eliminar complejidad que todavía no demuestra valor.

### Evidencias

* PR: PENDIENTE.
* screenshot: PENDIENTE.
* video: PENDIENTE.
* test: Vitest mínimo ejecutado.
* diagrama: PENDIENTE.

---

## Incremento X — Nombre

Estado: `PENDIENTE / COMPLETADO / REVISAR`

### Problema

PENDIENTE.

### Qué implementamos

PENDIENTE.

### Decisión relevante

PENDIENTE.

### Problema encontrado

PENDIENTE.

### Cómo lo resolvimos

PENDIENTE.

### Cómo lo validamos

PENDIENTE.

### Qué aprendí

PENDIENTE.

### Evidencias

* PR: PENDIENTE.
* screenshot: PENDIENTE.
* video: PENDIENTE.
* test: PENDIENTE.
* diagrama: PENDIENTE.

---

# 14. Evidencias a conservar

Guardar evidencia útil, no documentación ornamental.

Durante implementación conviene conservar, cuando aporte valor:

* screenshots de UI;
* wireframes;
* diseños Figma;
* diagramas;
* PRs relevantes;
* tests interesantes;
* fragmentos representativos de RLS;
* diagramas de estados;
* screenshots de Supabase si ayudan a explicar;
* video de varios teléfonos jugando;
* resultados de pruebas reales;
* problemas importantes y fixes;
* comparaciones antes/después.

No hace falta producir evidencia para cada microcambio.

---

# 15. Playtesting

No hubo playtesting real todavía.

Usar esta plantilla para registrar partidas reales.

## Sesión de playtesting

Fecha: PENDIENTE.

Cantidad de jugadores: PENDIENTE.

Dispositivos: PENDIENTE.

Contexto: PENDIENTE.

### Qué funcionó

* PENDIENTE.

### Fricciones

* PENDIENTE.

### Confusiones

* PENDIENTE.

### Momentos divertidos

* PENDIENTE.

### Cambios decididos

* PENDIENTE.

### Cambios descartados

* PENDIENTE.

---

# 16. Resultados

Estado: `PENDIENTE`.

Más adelante registrar únicamente resultados reales.

Posibles datos a registrar:

* MVP jugable;
* cantidad de partidas de prueba;
* cantidad de jugadores;
* problemas encontrados;
* mejoras posteriores;
* estadísticas técnicas o de uso si realmente existen.

No crear KPIs ficticios.

---

# 17. Aprendizajes

Registrar aprendizajes concretos cuando surjan durante desarrollo o playtesting.

No completar con generalidades.

## Producto

PENDIENTE.

## UX

PENDIENTE.

## Arquitectura

PENDIENTE.

## Backend / seguridad

PENDIENTE.

## Realtime

PENDIENTE.

## PWA

PENDIENTE.

## Testing

PENDIENTE.

## Desarrollo con IA

Registrar aquí aprendizajes concretos derivados del uso del marco definido en la sección 18.

Estado actual: PENDIENTE.

---

# 18. Uso de IA

ChatGPT y Codex se usan como asistentes de análisis y ejecución, no como reemplazo del criterio de producto e ingeniería.

Esta sección complementa el método descrito en la sección de proceso y registra cómo se aplica en la práctica.

## Marco de uso

La IA puede acelerar:

* exploración del problema y síntesis de contexto;
* estructuración documental;
* implementación de tareas acotadas;
* revisión de cambios y detección de riesgos;
* propuesta de validaciones según riesgo.

La responsabilidad humana mantiene:

* decisiones de alcance;
* decisiones de arquitectura y trade-offs;
* aprobación final de cambios;
* definición de criterios de calidad;
* priorización de iteraciones.

## Reglas operativas

Para tareas relevantes, el prompt debe incluir:

* objetivo;
* contexto;
* decisiones tomadas;
* alcance;
* fuera de alcance;
* validación esperada.

Además, cada salida importante de IA debe dejar trazabilidad mínima:

* qué se pidió;
* qué cambió;
* por qué;
* cómo se verificó;
* qué riesgo residual queda.

## Riesgos de uso y mitigaciones

Riesgos a controlar:

* complejidad accidental;
* cambios fuera de alcance;
* decisiones implícitas no discutidas;
* sobreconfianza en salida no validada.

Mitigaciones aplicadas:

* dividir el trabajo en incrementos pequeños;
* revisar diff completo por intención y alcance;
* validar proporcionalmente al riesgo;
* registrar contradicciones cuando aparezcan.

## Evidencia para el portfolio

Cuando exista material suficiente, conviene conservar:

* ejemplos de prompts de trabajo (sin datos sensibles);
* fragmentos de diff representativos;
* evidencia de validación (tests, build, revisión manual);
* casos donde se descartó una propuesta de IA por criterio de producto o simplicidad.

Estado de ejemplos concretos: PENDIENTE.

---

# 19. Qué mostrar finalmente en portfolio

El futuro case study público probablemente debería condensarse en:

* desafío;
* rol;
* restricciones;
* proceso;
* decisiones clave;
* arquitectura;
* producto final;
* desafíos técnicos;
* validación;
* resultados;
* aprendizajes.

Este documento es más extenso porque funciona como fuente interna para esa pieza final.

La versión pública deberá ser más breve, visual y selectiva.

---

# 20. Información sensible / privacidad

Para el futuro portfolio:

* no publicar secretos o credenciales;
* no mostrar datos privados reales de usuarios;
* no publicar información personal de familiares sin necesidad;
* anonimizar o pedir autorización cuando aparezcan fotos/videos;
* evitar capturas con datos sensibles de Supabase o configuración;
* no publicar IDs, tokens, URLs privadas, políticas incompletas ni detalles explotables.

---

# 21. Mantenimiento

Actualizar este documento solo cuando ocurra algo que aporte valor para explicar el proyecto.

Al cerrar un incremento, evaluar registrar:

* una decisión;
* un problema;
* una validación;
* un aprendizaje;
* una evidencia.

Si no hubo nada significativo, no agregar contenido por obligación.

Este archivo no debe convertirse en changelog.

---

# 22. Contradicciones o notas de consistencia

## Nota: requisitos técnicos y arquitectura

`technical-requirements.md` declara que no define stack ni proveedor, mientras `architecture.md` ya define Supabase para el MVP.

Interpretación: no es una contradicción bloqueante si se entiende que requisitos técnicos conserva el nivel de capacidades y arquitectura registra una decisión posterior.

Estado: NO BLOQUEANTE.

## Nota: framework frontend

`architecture.md` mantiene el framework frontend exacto como decisión diferida, mientras `implementation-plan.md` propone cerrar Next.js antes del Incremento 0.

Interpretación: no es una contradicción. Es una decisión pendiente prevista para el inicio de implementación.

Estado: NO BLOQUEANTE.
