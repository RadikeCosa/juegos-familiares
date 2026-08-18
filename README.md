# Juegos Familiares

Aplicacion mobile-first con objetivo PWA para juegos familiares. El primer juego es Impostor.

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

Levanta los servicios locales necesarios para desarrollo. El script excluye servicios que el proyecto no necesita para este incremento.

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

## Validacion completa local

Workflow recomendado antes de cerrar un incremento:

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

Los comandos de reset documentados son para Supabase local. La migracion de produccion se realiza por un procedimiento controlado separado.

No hay todavia un flujo de produccion documentado como validado de punta a punta.
