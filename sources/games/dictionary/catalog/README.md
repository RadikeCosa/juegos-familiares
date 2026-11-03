# Catálogo editorial

`candidates.json` contiene las **300 entradas revisadas para el lanzamiento**.
El usuario autorizó expresamente reemplazar el requisito de revisión humana por
revisión asistida por IA con fuentes. `reviewed` registra esa revisión editorial;
no significa aprobación humana ni aval de la RAE. El responsable se identifica
como Codex y `review_kind` como `ai_assisted_authorized`.

Se contrastaron individualmente las acepciones con el Diccionario de la lengua
española de RAE-ASALE, siguiendo remisiones cuando correspondía. Cada registro
conserva referencia, fecha y nota editorial. [review.json](review.json) resume
55 modificaciones, incluidas 20 sustituciones para mejorar fiabilidad, variedad
y adecuación familiar. Las definiciones son paráfrasis breves para el juego;
no se redistribuyen artículos ni ejemplos de las fuentes.

La selección conserva cierto sesgo hacia objetos tradicionales y arquitectura.
La dificultad es orientativa y puede ajustarse tras observar partidas reales.
La revisión asistida no elimina la posibilidad de errores editoriales.

## Ampliaciones y correcciones

Contrastar existencia y acepción con fuentes accesibles, revisar las condiciones
de consulta y redactar con palabras propias. Evaluar el contexto familiar,
la dificultad y las alternativas inventadas plausibles. Registrar la modalidad
de revisión, responsable, fecha, referencias y observaciones. No aprobar entradas
sólo porque el enlace exista o porque una comprobación de formato pase.

`verification_status` pasa a `verified` sólo después del contraste; `status`
pasa a `reviewed` después de la evaluación editorial. Una ampliación sigue este
proceso administrativo. No existe aprobación desde un cliente de la aplicación.

## Carga administrativa

`node supabase/scripts/dictionary-catalog-sql.mjs <archivo.json>` genera SQL para
incorporar en una migration nueva. No conecta a bases ni ejecuta SQL. Rechaza
entradas revisadas sin verificación, responsable o fecha. La fuente editorial
no se importa desde la aplicación ni se incluye en `public/`.

Correcciones posteriores requieren migrations nuevas. Las rondas conservan sus
snapshots: corregir el catálogo no altera palabras ya seleccionadas. La activación
usa una migration separada que invoca `dictionary_private.set_enabled(true)`;
el backend exige al menos 300 entradas válidas revisadas. Para revertir la
habilitación, una migration autorizada puede invocar la misma función con
`false`, conservando partidas, resultados e historial.
