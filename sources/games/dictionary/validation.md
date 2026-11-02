# Diccionario — Implementación local y validación

## Estado de entrega

Primera versión implementada localmente en `codex/dictionary-v1`, el 2 de
noviembre de 2026. El contrato aprobado está en [planning.md](planning.md).
El flag queda desactivado; no se desplegó ni se aplicaron migrations remotas.

Incluye entrada y lobby, configuración, inicio, reservas, escritura, votación,
resultados, finalización, vencimiento, recuperación y revancha. Se conserva la
sucesión compartida sobre participantes de sesión neutrales.

La implementación agrega operaciones específicas de Diccionario; extiende el
tipo y la recuperación de Room y protege su ruta de sala ante una actualización
PWA. La señal Realtime contiene sólo una revisión opaca, con RLS por membresía.

## Evidencia automatizada

- Suite de aplicación: 811 tests aprobados.
- TypeScript: aprobado.
- ESLint: sin errores. La suite de tests conserva un aviso previo de una
  aserción no esperada con `await` en Tutti Frutti.
- Build de producción con Webpack: aprobado. La ejecución restringida devolvía
  salida vacía por `EPERM` al iniciar TypeScript; con permisos para ese proceso
  completó sin cambios de configuración.
- Migration ejecutada en una base descartable con copia del esquema local,
  sin copiar filas de usuarios ni modificar la base Supabase original.
- Validador DB: ciclo completo de tres rondas con envíos/votos simultáneos y
  duplicados, puntuación única, recovery y orden compartido estable.
- Privacidad: rechazo de lectura directa cliente de catálogo, definiciones,
  opciones, votos, reservas y settings; acceso por actor/grupo; señal filtrada
  por membresía y contenido autorizado por fase.
- Gate: 299 entradas sintéticas revisadas no habilitan; 300 válidas habilitan.
  Estos fixtures no representan revisión humana ni contenido editorial real.
- Reservas: salas concurrentes de un mismo grupo, agotamiento, liberación de
  palabras no mostradas y consumo de la primera palabra aunque se abandone.
- Regresión DB focalizada: create/join, recuperación de sala activa y cierre
  de Impostor y Tutti Frutti, además de entrada/salida propia de Diccionario.
- Lifecycle: límites 24/72 horas, heartbeat que no revive una sala vencida,
  sucesión sin candidato, regreso de un candidato y retorno del antiguo host.
- Resultados parciales e históricos protegidos después de revancha.

## Evidencia de navegador

Se recorrió el juego con tres contextos Chromium aislados a 390 × 844:
crear/unir, lobby, tres rondas, confirmaciones, auto-voto deshabilitado, orden
compartido, recarga durante votación y después del resultado, clasificación,
revancha y finalización anticipada sin rondas resueltas.

Se interrumpió el acceso REST de un cliente y se verificó su recuperación.
Las solicitudes tienen un límite de espera de 10 segundos; el polling visible
no acumula solicitudes propias y el mensaje de conexión se limpia al recuperar
estado. Los reintentos de escrituras conservan su intención original.

No se observaron errores de ejecución de página ni desborde horizontal en ese
recorrido. Se inspeccionaron capturas de escritura, votación y resultado.

La prueba usa sesiones JWT sintéticas firmadas para una API PostgREST y una DB
locales descartables. Comprueba autorización real por rol/actor y flujo de UI;
no sustituye el onboarding de Supabase Auth. La API de prueba no incluye
Realtime: la continuidad observada usa el polling de respaldo.

## Repetir validaciones DB

Con Supabase local ya iniciado, dependencias, Docker, `psql` y `pg_dump`:

```bash
node supabase/scripts/dictionary-test-db.mjs start
npm run test:db:dictionary
node supabase/scripts/dictionary-test-db.mjs stop
```

El preparador usa la imagen local existente, crea un contenedor descartable
identificado y copia exclusivamente esquema y permisos. No copia filas ni
resetea la instancia original. Si el nombre o puerto están ocupados, falla.
La eliminación exige el marcador del contenedor creado por este preparador.
El validador exige conexión loopback, puerto 55432 y marcador de base descartable.

La migration se instala sólo en esa base. Los fixtures y el flag se manipulan
allí; el validador restaura el flag apagado al salir.

`smoke-dictionary-browser.mjs` conserva el recorrido automatizado. Requiere un
runtime Playwright mediante `PLAYWRIGHT_MODULE`, aplicación local en 3107 y una
API REST de prueba en 55430 apuntando a la base descartable. Sus identidades y
firma son exclusivamente fixtures; nunca dirigirlo a una instancia real.

## Catálogo y pendientes de habilitación

Hay [300 candidatas](catalog/candidates.json) en estado `draft`, con definición
propuesta, dificultad y referencia de consulta pendiente. No se verificaron
individualmente las referencias ni se realizó revisión humana. Algunas entradas
pueden necesitar reemplazo editorial. No se cargan automáticamente a la DB.

Antes de habilitar:

1. Verificar y revisar humanamente 300 entradas; registrar responsable, fecha
   y referencias efectivamente comprobadas. Seguir [el procedimiento editorial](catalog/README.md).
2. Comprobar entrega de invalidaciones y resuscripción con Supabase Realtime
   real; el smoke aislado sólo cubrió su fallback de polling.
3. Verificar la ejecución programada de Cron y la política de vencimiento en
   el destino autorizado; el validador local invoca el barrido directamente.
4. Completar revisión en dispositivo físico/PWA, segundo plano real, pérdida
   total de red y sucesión visible en navegador. La sucesión se probó en DB.
5. Aplicar migrations y activar mediante una migration administrativa separada,
   sólo con autorización y destino explícitos.

No se ejecutó `npm run test:db` completo: apunta al Supabase habitual y algunas
pruebas exigen fixtures iniciales. Se usó un entorno descartable para preservar
los datos locales. Las regresiones de aplicación sí se ejecutaron completas.

## Control de cambios

Se preservaron los archivos preexistentes del workspace original, incluidos
los cambios de Tutti Frutti y las decisiones de archivo documental de esta
tarea. La implementación vive en un worktree separado. No se realizó commit,
push, PR, merge, despliegue ni cambio remoto. La documentación de producción
no se utiliza como evidencia de despliegue de Diccionario.
