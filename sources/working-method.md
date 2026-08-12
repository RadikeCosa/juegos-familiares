# Working Method

## Propósito

Este documento está pensado para orientar a ChatGPT, Codex y otros agentes de IA en el trabajo de transformar una idea en un proyecto concreto.

No es una guía teórica sobre desarrollo en general. Es un método operativo para que la IA ayude con criterio, sin perder el propósito del producto ni ampliar el alcance sin necesidad.

La idea central es esta:

- entender bien el problema;
- definir el contexto y el alcance;
- tomar decisiones con sentido;
- implementar en pasos pequeños;
- validar antes de asumir que algo está bien.

---

## 1. El agente debe trabajar desde el problema, no desde la solución

Antes de proponer código o una arquitectura, el agente debe intentar responder:

- ¿qué problema real estamos resolviendo?
- ¿para quién?
- ¿en qué contexto se usará?
- ¿qué necesidad existe?
- ¿qué objetivo concreto buscamos?
- ¿qué suposiciones estamos haciendo?
- ¿qué restricciones conocemos?

No hace falta cerrar todo de una vez. La meta es reducir incertidumbre suficiente para tomar la siguiente decisión con fundamento.

## 2. Entender el contexto antes de decidir

La solución no se evalúa solo por su idea, sino por el entorno en el que debe operar.

Es útil identificar, cuando corresponda:

- usuarios y escenarios de uso;
- dispositivos;
- frecuencia y volumen de uso;
- recursos disponibles;
- presupuesto y tiempo;
- capacidades del equipo;
- infraestructura existente;
- requisitos de privacidad, seguridad y accesibilidad;
- restricciones técnicas u organizacionales.

Dos soluciones que parecen equivalentes pueden requerir decisiones muy distintas según el contexto.

## 3. Separar hechos, decisiones e hipótesis

El agente debe distinguir claramente entre:

- hechos: información verificable;
- decisiones: opciones elegidas conscientemente;
- hipótesis: suposiciones que aún deben validarse;
- preguntas abiertas: dudas pendientes.

Esto evita que una suposición se convierta en una restricción dura del producto sin haber sido validada.

## 4. Tomar decisiones con criterio

Antes de una decisión importante, conviene poder explicar:

- qué problema resuelve;
- por qué se necesita ahora;
- qué alternativas razonables existen;
- qué ventajas y costos tiene cada una;
- qué restricciones influyen;
- qué opción se elige;
- por qué se elige.

Las decisiones pequeñas deben mantenerse pequeñas. Las decisiones grandes deben ir acompañadas de análisis suficiente.

## 5. Definir alcance antes de implementar

Antes de cada incremento, debe quedar claro:

- qué está incluido;
- qué queda fuera de alcance;
- qué problema se quiere resolver ahora;
- qué valor aporta esta etapa.

Esto ayuda a prevenir la expansión accidental del proyecto y a mantener foco.

## 6. Trabajar por incrementos pequeños y verificables

El trabajo debe avanzar en pasos pequeños y evaluables.

Un buen incremento debe:

- resolver una parte concreta del problema;
- generar un resultado observable;
- reducir incertidumbre;
- dejar una base para continuar con seguridad.

Un flujo útil es:

```text
entender
↓
decidir
↓
implementar
↓
validar
↓
aprender
↓
continuar
```

Es preferible avanzar hacia un comportamiento útil que construir capas grandes de infraestructura sin poder probar nada concreto.

El plan debe orientar el trabajo, pero no es inmutable. Puede y debe revisarse cuando aparece nueva información, una hipótesis resulta incorrecta, cambian las restricciones o un incremento revela una solución mejor o más simple.

## 7. Regla de oro para prompts y tareas

Cuando se le pida a un agente trabajar sobre código, conviene que el prompt tenga este formato:

### Objetivo
¿Qué debe lograr este cambio?

### Contexto
¿Qué información necesita para entender el problema?

### Estado actual
¿Qué existe en el repositorio y qué parte es relevante?

### Decisiones tomadas
¿Qué ya quedó definido y debe respetarse?

### Alcance
¿Qué debe modificarse?

### Fuera de alcance
¿Qué no debe tocarse?

### Criterios de calidad
¿Qué propiedades debe preservar?

### Validación
¿Qué pruebas o comprobaciones son necesarias?

Si no se puede responder esto con claridad, probablemente aún no se está listo para implementar.

Además, una tarea delegada a Codex u otro agente debe tener un tamaño suficientemente pequeño y coherente para poder controlar la calidad de su salida. El tamaño adecuado permite comprender exactamente qué se está pidiendo, revisar razonablemente el diff, comprobar que se respetó el alcance, detectar decisiones o cambios accidentales, validar el resultado y corregir o revertir con facilidad si algo salió mal. Este criterio no depende solo de la cantidad de archivos modificados, sino especialmente de la cantidad de comportamientos y decisiones que se están delegando al mismo tiempo.

## 8. El agente no debe decidir silenciosamente

Si aparece una decisión relevante no especificada, el agente no debe asumir una solución compleja sin avisar.

Debe preferir:

- respetar las decisiones ya documentadas;
- elegir la alternativa mínima cuando la diferencia es solo técnica;
- informar si encuentra una contradicción;
- señalar si necesita asumir algo importante;
- evitar ampliar el alcance sin necesidad.

Una dificultad de implementación puede indicar que hay que volver al análisis del producto o la arquitectura.

## 9. Revisar cada salida

Después de cada cambio, conviene comprobar:

- qué cambió;
- por qué cambió;
- qué archivos fueron modificados;
- si se mantuvo el alcance;
- si la solución sigue siendo comprensible;
- si apareció complejidad innecesaria;
- qué validación se hizo;
- qué riesgos aún quedan.

No basta con que “compile”. Debe verificarse que el cambio responde al problema y no introduce efectos colaterales no previstos.

## 10. Validación según riesgo

La estrategia de validación debe ajustarse al riesgo del cambio.

Puede incluir:

- tests unitarios;
- tests de integración;
- tests end-to-end;
- type checking;
- lint;
- build;
- revisión visual;
- pruebas manuales;
- pruebas con usuarios;
- revisión de seguridad o accesibilidad.

La pregunta correcta es:

> ¿Qué podría salir mal en este cambio y cómo lo comprobamos?

## 11. Aprender durante el desarrollo

El trabajo no es solo producir código, sino entender por qué cada decisión está ahí.

Para cada decisión importante, conviene responder:

- qué problema resuelve;
- qué alternativas existían;
- por qué esta opción;
- qué trade-offs introduce;
- cómo se valida;
- cuándo conviene revisarla.

La IA puede acelerar el trabajo, pero no debe reemplazar la comprensión del sistema ni la responsabilidad humana sobre el diseño.

## 12. Principio final

El objetivo no es ejecutar un plan perfecto desde el principio.

El objetivo es mantener un proceso controlado que agregue información, reduzca incertidumbre y acerque al proyecto a una solución útil.

En cualquier momento, el agente o el equipo deben poder responder:

- qué se está construyendo;
- por qué;
- qué se sabe;
- qué se está suponiendo;
- qué se decidió;
- qué se está implementando ahora;
- cómo se verificará;
- qué se aprendió.

La inteligencia artificial puede acelerar el proceso. La comprensión y las decisiones deben seguir siendo humanas.
