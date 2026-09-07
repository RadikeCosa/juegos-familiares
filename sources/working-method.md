# Juegos Familiares — Método de trabajo

## Propósito

Este documento define cómo se deciden, implementan, validan y controlan los
cambios. La etapa, la baseline productiva y los workstreams actuales pertenecen
a `sources/project-status.md`.

## Antes de cambiar

Para un cambio relevante, delimitar antes de implementar:

- objetivo y resultado esperado;
- alcance y fuera de alcance;
- hechos comprobados;
- decisiones existentes que deben respetarse;
- supuestos, hipótesis y preguntas abiertas;
- riesgos y posibles efectos laterales;
- criterios de éxito;
- validación proporcional al riesgo.

También se comprueba la raíz, rama y estado Git, se identifican instrucciones
aplicables y se inspeccionan la implementación y los tests cercanos. Los
cambios preexistentes se preservan y no se incorporan silenciosamente.

## Visibilidad de las decisiones

Separar hechos, decisiones, hipótesis y preguntas abiertas. Una herramienta no
debe convertir una suposición en una decisión invisible.

Los cambios relevantes de arquitectura, dominio, permisos, persistencia, UX o
dependencias deben quedar explícitos y ser revisables. Si una decisión necesaria
no está definida o contradice una fuente de verdad, el trabajo se detiene antes
de introducirla silenciosamente.

Cuando la diferencia sea sólo técnica, se prefiere la alternativa mínima. Una
dificultad de implementación puede indicar que es necesario revisar primero el
producto o la arquitectura.

## Flujo humano dirigido y asistido por IA

Las herramientas de IA pueden ayudar a:

- explorar alternativas y cuestionar supuestos;
- identificar riesgos y contradicciones;
- preparar una implementación acotada;
- proponer pruebas;
- auditar diffs;
- inspeccionar casos límite.

La responsabilidad humana permanece sobre:

- dirección de producto;
- aceptación arquitectónica;
- juicio de UX;
- aprobación final;
- validación con dispositivos y uso real.

La salida de una herramienta debe poder explicarse y verificarse. La velocidad
no reemplaza la comprensión ni la rendición de cuentas.

## Entrega incremental y control de alcance

Trabajar en cambios pequeños, verticales y verificables. Cada cambio debe
resolver un problema concreto, producir un resultado observable y reducir
incertidumbre sin mezclar trabajo no relacionado.

```text
entender → decidir → implementar → validar → aprender
```

El plan orienta, pero puede revisarse cuando aparece evidencia nueva. Esa
revisión debe ser explícita y no amplía por sí sola el alcance autorizado.

## Git y change control

Según el tamaño y riesgo del cambio:

1. trabajar en una rama corta y coherente;
2. inspeccionar `status`, diff e instrucciones antes de editar;
3. implementar sólo el alcance autorizado;
4. ejecutar validación focal durante el trabajo;
5. revisar el diff completo y hacer una auditoría pre-commit;
6. obtener revisión humana;
7. hacer push, PR y merge sólo después de validar y con la autorización
   correspondiente.

`main` representa estado estable y producción es una superficie protegida. No
se mezclan workstreams no relacionados. Commit, push, PR, merge, deploy,
migrations remotas y cambios de datos remotos requieren alcance y autorización
explícitos.

## Validación proporcional

La validación responde a la pregunta: ¿qué podría fallar en este cambio y cómo
lo comprobamos? No todas las capas son obligatorias para todos los cambios.

- **Tests automatizados:** reglas, componentes y regresiones aislables.
- **Tests de base de datos e integración:** schema, RPCs, RLS, permisos,
  privacidad y concurrencia.
- **Auditoría asistida por IA:** alcance, contradicciones, casos límite y
  cambios accidentales.
- **Revisión humana del diff:** intención, claridad, decisiones y riesgos.
- **Smoke en navegador:** flujos integrados, navegación, errores y
  reconstrucción de estado.
- **Validación en dispositivo físico:** mobile, PWA, lifecycle, conectividad y
  comportamiento instalado.
- **Validación mediante uso real:** comprensión, fricción y valor de la
  experiencia compartida.

Los cambios de mayor riesgo exigen evidencia más amplia. Las validaciones no
ejecutadas y su motivo se reportan; una capa no se presenta como sustituto de
otra.

## Aprendizaje post-uso

La observación real alimenta cambios de producto mediante un ciclo controlado:

```text
uso real → observación → fricción → priorización → intervención pequeña → volver a usar
```

Una observación histórica se revalida contra el producto actual antes de entrar
al backlog. El aprendizaje puede modificar prioridades, pero no autoriza por sí
solo un cambio de alcance.

## Propiedad de la documentación

> Active documentation describes the current system. Git preserves
> implementation history.

Cada afirmación actual se registra en su dueño canónico:

- product brief: qué es el producto y por qué existe;
- principles: heurísticas duraderas;
- architecture: cómo está estructurado el sistema actual;
- working method: cómo se conduce el cambio;
- `AGENTS.md`: routing y reglas operativas compactas;
- project status: etapa, baseline productiva y workstreams actuales.

Los contratos activos no funcionan como changelog. La historia de
implementación permanece en Git y el material histórico no gobierna trabajo
nuevo sin revalidación.

## Cierre de un cambio

El reporte final debe dejar claro:

- resultado y alcance completado;
- archivos modificados y preservados deliberadamente;
- decisiones, supuestos y contradicciones;
- validaciones ejecutadas y no ejecutadas;
- riesgos, pendientes y decisiones humanas necesarias;
- estado de acciones externas.
