# Juegos Familiares — Principios

Estos principios son heurísticas duraderas para decisiones de producto,
diseño e ingeniería. El estado y el roadmap actuales pertenecen a
`sources/project-status.md`; el proceso operativo pertenece a
`sources/working-method.md`.

## La experiencia está primero

Comprender primero qué hacen las personas y qué experiencia se busca. Modelar
después el software necesario para sostenerla.

## La tecnología acompaña la experiencia

La tecnología debe aportar valor y retirarse cuando la interacción entre las
personas es más importante. Una capacidad técnica no se incorpora sólo por ser
posible o atractiva.

## Baja fricción

Las personas deben poder comprender cómo empezar y llegar al valor principal
con pocos pasos. Evitar registros, configuraciones, pantallas y explicaciones
que no sean necesarios.

## Mobile-first

El contexto principal de uso son teléfonos. UX, interfaz, rendimiento y
validación parten de pantallas pequeñas y dispositivos móviles reales.

## Privacidad por diseño

Recolectar, exponer y persistir sólo los datos necesarios. Los secretos, roles,
acciones privadas y datos temporales no deben hacerse visibles ni permanentes
sin una necesidad de producto.

## Infraestructura proporcional

Usar la arquitectura más sencilla que resuelva correctamente el problema
actual. Cada servicio, dependencia o capa debe justificar qué necesidad
resuelve, por qué se necesita ahora y qué costo introduce.

## Accesibilidad como calidad

Legibilidad, contraste, tamaño de controles, navegación, estados claros,
feedback, tecnologías asistivas y preferencias de movimiento forman parte de
la calidad del producto.

## Entrega vertical e incremental

Preferir cambios pequeños que produzcan un comportamiento observable y
verificable. Cada intervención debe reducir incertidumbre o acercar una
experiencia utilizable.

## Separación entre dominio e infraestructura

Las reglas de cada dominio deben poder comprenderse independientemente de la
UI, la persistencia y el transporte. La infraestructura implementa y protege
esas reglas; no las define silenciosamente.

## Decisiones antes que complejidad

Una hipótesis no debe convertirse en arquitectura. Las decisiones relevantes
se hacen explícitas y la complejidad se introduce sólo después de comprender la
necesidad y sus alternativas.

## Aprender mediante uso real

Los tests automatizados no sustituyen la experiencia de personas reales. La
observación posterior al uso real es una fuente de cambio de producto:

```text
uso real → observación → fricción → priorización → intervención pequeña → volver a usar
```

## Aprendizaje como parte del desarrollo

Cada nueva utilidad, dominio o experimento de producto debe ayudar a comprender
mejor el problema, las decisiones y sus trade-offs. Aprender no requiere
diseñar de antemano una arquitectura común.

## Código comprensible

Preferir nombres explícitos, funciones acotadas, tipos claros, dependencias
justificadas y tests que documenten comportamiento. Evitar abstracciones
prematuras; extraer conceptos compartidos sólo ante reutilización real.

## Responsabilidad humana en el uso de IA

Las herramientas de IA pueden ayudar a explorar, implementar y revisar, pero
no reemplazan la comprensión ni la responsabilidad. Las decisiones importantes
deben poder explicarse, verificarse y ser aceptadas por una persona.
