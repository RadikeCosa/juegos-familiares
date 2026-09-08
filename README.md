# Juegos Familiares

Aplicacion mobile-first con objetivo PWA para juegos familiares. El primer juego es Impostor.

## Documentacion canonica

La documentacion activa describe el sistema actual. Git conserva la historia
de implementacion.

- `sources/project-status.md`: etapa actual, baseline productiva y workstreams
  post-beta.
- `sources/product-brief.md`: contrato actual de producto de Juegos Familiares.
- `sources/project-principles.md`: principios duraderos de producto y
  desarrollo.
- `sources/architecture.md`: arquitectura actual y limites de autoridad.
- `sources/working-method.md`: metodo de trabajo, cambio y validacion.
- `sources/games/impostor/product-brief.md`: contrato de producto de Impostor.
- `sources/games/impostor/game-rules.md`: reglas vigentes de Impostor.
- `sources/games/impostor/user-flow.md`: recorrido actual de usuario.
- `sources/games/impostor/game-state.md`: estados, transiciones y actores.
- `sources/games/impostor/technical-requirements.md`: invariantes y requisitos
  tecnicos.

Consultar `sources/project-status.md` en lugar de duplicar aqui el estado, la
baseline o el roadmap.

## Desarrollo local

### Instalar dependencias

```bash
npm install
```

### Variables locales

Crear `.env.local` apuntando al Supabase local:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key-local>
```

`.env.local` no se versiona. No usar `service_role` en frontend y no copiar secretos reales en este README.

### Arrancar Supabase local

```bash
npm run supabase:start
```

Levanta los servicios locales necesarios para desarrollo. El script excluye
servicios que el proyecto no utiliza actualmente.

Para consultar URLs y keys locales:

```bash
npx supabase status
```

No hay script npm propio para `status`.

### Resetear la DB local

```bash
npm run supabase:reset
```

Advertencia: `supabase:reset` es DESTRUCTIVO SOLO PARA LA DB LOCAL. Borra los datos locales y reaplica las migrations.

No usar este comando como procedimiento de produccion.

### Provisionar admin de plataforma

Actualmente, solo el admin de plataforma puede crear grupos. El alta del primer admin es un paso operativo manual, no una pantalla publica del producto.

En local, usar siempre el script:

```bash
npm run local:make-platform-admin -- <auth-user-id>
```

El script lee `npx supabase status -o env` y solo escribe si `API_URL` y `DB_URL` apuntan inequivocamente a Supabase local (`127.0.0.1`, `localhost` o `::1`). Si no puede probar que el destino es local, aborta antes de ejecutar SQL. No usar bypasses ni copiar este flujo a entornos remotos.

Flujo recomendado para local:

1. Abrir la app en el navegador/perfil que se va a usar como admin.
2. Crear una identidad anonima en ese navegador. Si todavia no existe ningun grupo, se puede intentar unirse con cualquier codigo invalido desde `Unirme a un grupo`; ese intento crea la identidad anonima y luego falla al resolver la invitacion.
3. Buscar el `id` de esa identidad en la DB local. Como Studio no se levanta con `npm run supabase:start`, usar `psql` contra la URL local:

```bash
psql "$(npx supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" \
  --quiet \
  --tuples-only \
  --no-align \
  --command "select id, created_at from auth.users order by created_at desc limit 5;"
```

4. Habilitar ese `id` como admin local:

```bash
npm run local:make-platform-admin -- <auth-user-id>
```

5. Refrescar la app en ese mismo navegador. La accion `Crear grupo` deberia quedar visible.

No insertar usuarios de prueba en produccion salvo que se vaya a usarlos realmente como admins. No usar `service_role` en frontend ni exponer este paso como UI publica.

### Smoke manual local multi-perfil

Preparar Supabase local:

```bash
npm run supabase:start
```

Confirmar que `.env.local` apunta al entorno local:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key-local>
```

No guardar keys reales en documentacion ni usar `service_role` en frontend.

Usar perfiles Chromium persistentes separados ayuda a mantener una Auth anonima por persona, refrescar, reconectar y repetir smokes multiusuario sin mezclar sesiones:

```text
A -> Ramiro
B -> Pedro
C -> Camila
D -> Victoria
```

Perfil A, creador/admin:

1. Abrir Chromium con el perfil A.
2. Entrar al flujo `Unirme a un grupo`.
3. Usar un codigo invalido para disparar la intencion de producto; eso crea una Auth anonima local y luego falla al resolver la invitacion.
4. Obtener el UUID local con la consulta de `auth.users` documentada arriba.
5. Ejecutar:

```bash
npm run local:make-platform-admin -- <auth-user-id>
```

6. Refrescar el perfil A.
7. Crear grupo queda habilitado.
8. Crear desde la UI real un grupo llamado `Smoke`.

Perfiles B/C/D:

1. Abrir cada invitacion desde un perfil Chromium distinto.
2. Completar el join con una Auth anonima propia.
3. Usar estos nombres para el smoke:

```text
Perfil B -> Pedro
Perfil C -> Camila
Perfil D -> Victoria
```

Estos perfiles no necesitan `platform_admin`; solo el perfil A lo necesita para crear el grupo.

Despues de `npm run supabase:reset`, la DB local se reconstruye desde migrations y se pierden:

```text
auth.users
platform_admins
groups
players
invitations
rooms
gameplay
```

Los perfiles Chromium pueden conservar sesiones/local storage que ya no correspondan con la DB nueva. Despues de un reset, limpiar sesion/storage en esos perfiles o crear perfiles limpios, y reconstruir el flujo:

```text
Auth A -> platform admin -> Group -> B/C/D por invitacion
```

### Tests de DB

```bash
npm run test:db
```

La suite de DB puede esperar una base limpia. Flujo recomendado:

```bash
npm run supabase:reset
npm run test:db
```

### Arrancar Next

```bash
npm run dev
```

URL habitual:

```text
http://localhost:3000
```

### Detener Supabase local

```bash
npm run supabase:stop
```

`stop` detiene servicios locales. `start` los vuelve a levantar. `reset` es distinto: borra datos locales y reaplica migrations.

La CLI/proyecto no documenta aqui un concepto separado de pausa; para este repo, pausar/reanudar se maneja como `stop`/`start`.

## Referencia de validacion completa local

Ejecutar estas capas cuando el alcance y riesgo del cambio lo requieran. El
criterio general de validacion proporcional esta en
`sources/working-method.md`.

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm test
npm run lint
npm run build
git diff --check
```

Opcionalmente, al terminar:

```bash
npm run supabase:stop
```

## Produccion

Produccion es una superficie real y protegida. El estado y la baseline vigentes
se documentan en `sources/project-status.md`.

Los comandos `supabase:start`, `supabase:stop` y `supabase:reset` documentados
en este README corresponden al entorno local. No usar `supabase:reset` como
procedimiento de produccion.

Cualquier migration, cambio de datos, limpieza, deploy u otra operacion remota
requiere alcance, destino y autorizacion explicitos. Este README no define un
procedimiento general para modificar produccion.
