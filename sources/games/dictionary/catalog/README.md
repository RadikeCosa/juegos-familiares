# Catálogo editorial — Borrador

`candidates.json` contiene **300 candidatas propuestas con ayuda de IA**, con
una acepción, definición original propuesta, dificultad orientativa y un enlace
de consulta pendiente. No se ha verificado que cada enlace resuelva ni que la
acepción propuesta sea adecuada. Ninguna entrada está revisada por una persona.

Este archivo no se importa desde la aplicación ni se incluye en `public/`.
No se carga automáticamente como catálogo jugable. El flag permanece apagado.

## Revisión humana antes de habilitar

Para cada candidata, verificar existencia, acepción y definición con fuentes
accesibles y sus condiciones; registrar las referencias efectivamente utilizadas.
Reescribir con palabras propias cuando corresponda. Evaluar pronunciación,
contexto familiar, dificultad, posibilidad de inventar alternativas plausibles y
variedad de estilo. Sustituir candidatas demasiado obvias o especializadas.

`verification_status` pasa a `verified` sólo tras esa comprobación; `status`
pasa a `reviewed` con responsable y fecha únicamente tras aprobación humana.
El archivo es una propuesta editorial, no evidencia de revisión.

## Carga administrativa

`node supabase/scripts/dictionary-catalog-sql.mjs <archivo.json>` genera SQL para
revisar e incorporar en una migration nueva. No conecta a bases ni ejecuta SQL.
Los borradores siguen siendo borradores; el generador rechaza entradas marcadas
como revisadas sin verificación, responsable o fecha.

No se actualizan automáticamente entradas existentes: una corrección editorial
necesita una migration explícita. Las partidas conservan snapshots; corregir el
catálogo no cambia una palabra ya seleccionada.

La activación se hace en una migration administrativa separada y autorizada:

```sql
select dictionary_private.set_enabled(true);
```

La función verifica 300 entradas `reviewed` válidas antes de habilitar. La primera
versión no ofrece carga, revisión ni activación desde el cliente.
