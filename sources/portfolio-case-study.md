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
Planificación cerrada / implementación todavía no iniciada
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
* plan de implementación incremental.

## PENDIENTE

* producto funcionando;
* deploy;
* playtesting real;
* métricas;
* Supabase configurado;
* repositorio Git inicializado y estable;
* proyecto frontend inicializado;
* tests reales;
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

Estado: `PENDIENTE DE IMPLEMENTACIÓN`.

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
* plan incremental.

PENDIENTE:

* implementación;
* testing práctico;
* diseño UI final;
* validación en dispositivos reales;
* playtesting;
* deploy;
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
| Implementación | PENDIENTE |
| Playtesting | PENDIENTE |
| Iteración | PENDIENTE |

No hay estimaciones de fecha en este documento.

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

---

# 10. Arquitectura resumida

La arquitectura está definida conceptualmente, pero la implementación todavía no comenzó.

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

Estado general: `PENDIENTE DE IMPLEMENTACIÓN`.

Desafíos que conviene documentar durante el desarrollo:

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
* RLS para banco de palabras, participantes y permisos;
* separación real entre dominio e infraestructura.

No se registra todavía cómo fueron resueltos.

---

# 12. Implementación por incrementos

Esta tabla resume el plan. Debe actualizarse al cerrar cada incremento.

| Incremento | Capacidad | Estado | Evidencia |
| --- | --- | --- | --- |
| 0 | Fundación del proyecto | PENDIENTE | PENDIENTE |
| 1 | Portada de plataforma y entrada a Impostor | PENDIENTE | PENDIENTE |
| 2 | Identidad liviana, grupo y jugador | PENDIENTE | PENDIENTE |
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

PENDIENTE.

---

# 18. Uso de IA

ChatGPT y Codex ayudan a explorar, documentar, revisar e implementar.

Principios:

* las decisiones importantes deben seguir siendo comprensibles;
* los cambios relevantes deben poder explicarse;
* la IA puede acelerar exploración, redacción, revisión y ejecución;
* no aceptar complejidad solamente porque una herramienta pueda generarla;
* no presentar la IA como autora autónoma del proyecto.

Ejemplos concretos: `PENDIENTE`.

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
