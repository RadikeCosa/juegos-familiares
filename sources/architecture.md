# Juegos Familiares — Arquitectura conceptual

## Propósito

Este documento describe la arquitectura conceptual del sistema completo.

Juegos Familiares es la aplicación contenedora.

Impostor es el primer juego dentro de esa aplicación.

La arquitectura distingue:

* capacidades compartidas de plataforma;
* capacidades específicas de Impostor;
* infraestructura compartida;
* reglas de dominio;
* responsabilidades del cliente;
* responsabilidades autoritativas.

Debe orientar el futuro `sources/implementation-plan.md`, sin definir todavía tablas, migraciones, componentes, APIs ni código.

---

# 1. Decisiones tecnológicas

Para el MVP, la decisión actual es utilizar:

* aplicación web mobile-first;
* PWA;
* TypeScript;
* Supabase como backend gestionado;
* Supabase Auth para identidad liviana/anónima;
* Postgres como persistencia;
* Row Level Security para autorización;
* Supabase Realtime cuando el producto necesite sincronización;
* Presence para presencia efímera cuando corresponda.

No reabrimos en este documento la comparación con Firebase, backend propio u otras alternativas.

---

# 2. Vista general del sistema

```text
Juegos Familiares PWA
│
├── Platform
│   ├── navegación general
│   ├── identidad
│   ├── grupos
│   ├── jugadores
│   └── lifecycle PWA
│
└── Games
    └── Impostor
        ├── banco de palabras
        ├── sala
        ├── tanda
        ├── ronda
        ├── votos
        ├── marcador
        └── historial
              │
              ▼
          Supabase
          ├── Auth
          ├── Postgres
          ├── RLS
          └── Realtime / Presence
```

Clientes simultáneos:

```text
PWA Ramiro ──┐
PWA Pedro ───┤
PWA Camila ──┼── backend compartido
PWA Victoria ┘
```

---

# 3. Platform vs Game

## Platform

Incluye únicamente capacidades que ya sabemos que son transversales:

* identidad;
* grupos;
* jugadores;
* navegación general;
* shell PWA;
* infraestructura común cuando corresponda.

## Impostor

Incluye reglas y datos propios del juego:

* banco de palabras;
* salas;
* tandas;
* rondas;
* selección de impostor;
* asignaciones privadas;
* votos;
* resolución;
* puntuación;
* historial específico.

No promovemos conceptos de Impostor al nivel de plataforma por anticipación.

---

# 4. Regla contra generalización prematura

No construir abstracciones genéricas para juegos futuros hasta que un segundo juego real demuestre una necesidad compartida.

Evitar por ahora:

```text
GenericGame
GameEngine
GenericRound
GenericRoom
GenericScore
GenericRealtimeGame
```

Cuando llegue Tutti Frutti, se evaluará qué capacidades son realmente reutilizables.

---

# 5. Responsabilidad del cliente PWA

El cliente puede encargarse de:

* renderizar UI;
* navegación;
* estado visual;
* formularios;
* interacción táctil;
* guardar identidad o preferencias locales permitidas;
* enviar intenciones;
* consultar estado autorizado;
* suscribirse a cambios compartidos;
* reaccionar a reconexión;
* lifecycle PWA;
* cache apropiado del shell.

El cliente no debe ser autoridad para decisiones sensibles.

En Impostor, no debe decidir unilateralmente:

* palabra;
* impostor;
* resultado de votación;
* ganador;
* puntos;
* cambio de fase;
* nuevo host.

---

# 6. PWA como capacidad de plataforma

La PWA pertenece a Juegos Familiares, no solamente a Impostor.

Debe contemplar:

* mobile-first;
* Safari/iOS;
* Chrome/Android;
* uso desde navegador;
* instalación opcional;
* manifest;
* service worker;
* estrategia de cache progresiva;
* actualizaciones;
* background/foreground;
* reconexión razonable.

PWA no equivale a offline completo.

Una partida multijugador sincronizada requiere conectividad en el MVP.

Futuros juegos pueden tener necesidades offline distintas.

---

# 7. Identidad como capacidad compartida

Supabase Auth debe resolver identidad técnica liviana.

El objetivo de UX sigue siendo:

* sin email;
* sin password;
* sin onboarding pesado.

La identidad debe permitir relacionar:

```text
Auth identity
→ Player
→ Group
```

La identidad local del dispositivo puede ayudar a recordar al jugador, pero no debe ser la fuente de autorización.

La intención es que en el futuro el mismo `Player` pueda participar en otros juegos de Juegos Familiares.

---

# 8. Grupo y jugadores como conceptos de plataforma

`Group` y `Player` son conceptos transversales actuales.

Ejemplo:

```text
Familia
├── Ramiro
├── Pedro
├── Camila
└── Victoria
```

Estos jugadores pueden ser reutilizados por distintos juegos futuros.

No asumimos todavía:

* perfiles públicos;
* avatares complejos;
* amigos;
* matchmaking;
* múltiples grupos simultáneos;
* sistema social.

---

# 9. Navegación de plataforma

Orientación conceptual:

```text
/
→ Juegos Familiares

/impostor
→ Impostor
```

La portada permitirá acceder a juegos disponibles.

Un juego futuro podría usar:

```text
/tutti-frutti
```

No se diseñan todavía componentes, layouts ni estética.

---

# 10. Supabase como infraestructura compartida

Supabase constituye infraestructura común, pero no todas sus capacidades son obligatorias para todos los juegos.

## Compartido claramente

* Auth;
* Postgres;
* autorización;
* persistencia.

## Dependiente del juego

* Realtime;
* Presence;
* operaciones sincronizadas;
* requerimientos específicos de privacidad.

Impostor requiere Realtime y Presence por su flujo actual.

Un futuro juego podría no necesitarlos.

---

# 11. Postgres

Postgres será la fuente principal de persistencia compartida.

## Plataforma

Conceptualmente conserva:

* grupos;
* jugadores;
* relaciones necesarias para identidad y membresía.

## Impostor

Conceptualmente conserva:

* palabras;
* estado operativo;
* rondas;
* votos;
* marcador;
* historial.

No se diseñan todavía:

* tablas;
* columnas;
* índices;
* constraints concretos;
* migrations.

---

# 12. Estado operativo vs histórico

## Persistente de plataforma

* `Group`
* `Player`

## Persistente de Impostor

* `Word`
* `GameSessionHistory`
* `RoundHistory`

## Operativo de Impostor

* `Room`
* `RoomParticipant`
* `GameSession` activa
* `SessionPlayer`
* `Round` activa
* `Vote`
* `RoundResult` operativo

Operativo no significa necesariamente solo en memoria.

Puede persistirse técnicamente para facilitar consistencia y recuperación.

---

# 13. RLS y autorización

RLS protege acceso a datos compartidos.

## Plataforma

Debe permitir conceptualmente:

* que un jugador acceda solo a los grupos donde corresponde;
* que membresía y permisos no dependan del cliente.

## Impostor

Debe permitir conceptualmente:

* que un participante acceda a la sala correspondiente;
* que un jugador normal no consulte el banco completo;
* que un administrador pueda consultar y gestionar banco según reglas;
* que información privada no quede expuesta.

No se escriben políticas RLS concretas en este documento.

---

# 14. Admin de grupo vs Host de Impostor

## Group Admin

Rol persistente y transversal del grupo.

Puede:

* consultar integrantes;
* eliminar integrantes;
* ver banco completo de Impostor;
* eliminar palabras según reglas actuales.

## Room Host

Rol temporal dentro de una sala de Impostor.

Puede:

* iniciar tanda;
* iniciar votación;
* iniciar segunda votación;
* revelar palabra;
* registrar resultado del intento;
* iniciar ronda;
* terminar tanda.

Host no implica admin.

Admin no implica host.

---

# 15. Operaciones autoritativas

Debe existir una capa conceptual de operaciones autoritativas para acciones sensibles.

No decidimos todavía si cada operación será:

* función Postgres;
* RPC;
* server function;
* otra opción apropiada.

En Impostor deben proteger:

* iniciar tanda;
* preparar ronda;
* seleccionar palabra;
* seleccionar impostor;
* validar guards;
* registrar voto;
* resolver votación;
* resolver empate;
* actualizar puntuación;
* crear siguiente ronda;
* reasignar host;
* terminar tanda;
* persistir historial.

Principio:

```text
UI
→ intención
→ autoridad
→ validación
→ cambio de estado
→ sincronización
```

---

# 16. Dominio independiente de infraestructura

Las reglas puras de Impostor deberían mantenerse independientes de Supabase cuando sea razonable.

Ejemplos:

* normalizar palabras;
* determinar jugadores elegibles como impostor;
* elegir entre candidatos;
* resolver conteo de votos;
* determinar ganador;
* calcular puntuación.

Supabase debe resolver:

* persistencia;
* autorización;
* identidad;
* sincronización;
* coordinación.

Evitar mezclar reglas puras con llamadas a infraestructura.

---

# 17. Privacidad específica de Impostor

El sistema puede conocer:

```text
word
impostorPlayerId
```

pero cada participante debe recibir solo su información autorizada.

## Jugador normal

Puede recibir:

```text
role: player
word: ...
```

## Impostor

Puede recibir:

```text
role: impostor
```

y no la palabra.

No implementar privacidad así:

```text
enviar todo
→ ocultar palabra con CSS/React
```

El dato sensible no debe ser entregado al cliente no autorizado.

---

# 18. Votos privados

Los votos individuales deben permanecer privados durante la votación.

El cliente puede conocer:

* que ya votó;
* cuándo todos terminaron;
* resultado agregado cuando corresponda.

No necesita conocer votos individuales ajenos.

No mantener historial individual de votos después de la tanda en el MVP.

---

# 19. Realtime específico de Impostor

Cambios que requieren sincronización rápida:

* participantes en sala;
* host;
* comienzo de tanda;
* cambio de fase;
* confirmación de roles;
* comienzo de votación;
* fin de votación;
* empate;
* resultado;
* marcador;
* siguiente ronda;
* fin de tanda.

No decidimos todavía qué caso utiliza:

* Postgres Changes;
* Broadcast;
* otro mecanismo Realtime de Supabase.

Esa granularidad se decidirá durante implementación.

---

# 20. Presence

Presence se usa para información efímera como:

* conectado;
* desconectado;
* lobby;
* disponibilidad para sucesión de host.

Presence no reemplaza `Player`.

Presence no reemplaza membresía de grupo.

Presence no debería ser por sí sola la autoridad final de `hostPlayerId`.

La reasignación de host debe quedar registrada en el estado autoritativo.

---

# 21. Ejemplo completo: START_VOTING

```text
Host toca "Ir a votación"
        ↓
PWA envía intención
        ↓
autoridad valida:
- actor es host
- ronda está en PLAYING
        ↓
estado cambia a VOTING_FIRST
        ↓
Realtime propaga estado
        ↓
cada participante muestra UI de votación
```

---

# 22. Ejemplo completo: PREPARE_ROUND

```text
Host solicita nueva ronda
        ↓
autoridad valida:
- jugadores suficientes
- palabra disponible
        ↓
selecciona palabra
        ↓
calcula menor impostorCount
        ↓
elige impostor aleatoriamente entre elegibles
        ↓
crea ronda
        ↓
actualiza contador
        ↓
genera vistas privadas
        ↓
estado pasa a ROLE_REVEAL
        ↓
clientes reciben su información autorizada
```

---

# 23. Consistencia y concurrencia

La arquitectura debe contemplar pocos clientes concurrentes, pero correctamente.

Casos:

* dos taps sobre `Nueva ronda`;
* varios votos simultáneos;
* último voto dispara resolución;
* reintentos de red;
* dos clientes reaccionando a desconexión de host.

Principio:

> Las operaciones importantes deben ser atómicas o consistentes e idempotentes cuando corresponda.

No definimos todavía implementación transaccional exacta.

---

# 24. Host disconnect

Comportamiento actual de Impostor:

Si el host deja de estar disponible:

1. detectar participantes conectados;
2. excluir host no disponible;
3. ordenar restantes por `joinedAt`;
4. elegir el más antiguo;
5. registrar nuevo `hostPlayerId` autoritativamente.

Si el host original vuelve:

* vuelve como participante normal;
* no recupera host automáticamente.

---

# 25. Reconexión

Cuando un cliente vuelve después de:

* refresh;
* lock/unlock;
* background;
* pérdida de red;
* cierre/reapertura;

la secuencia conceptual debe ser:

```text
recuperar identidad
↓
recuperar grupo
↓
detectar contexto activo
↓
consultar estado autoritativo
↓
recuperar vista privada
↓
re-suscribirse
```

No diseñamos todavía política avanzada de expiración o timeout.

---

# 26. Historial y estadísticas futuras

Al finalizar una tanda de Impostor:

* cerrar estado operativo;
* preservar `GameSessionHistory`;
* preservar `RoundHistory`;
* no conservar votos individuales históricos.

Esto permitirá estadísticas futuras.

La pantalla de estadísticas no forma parte obligatoria del primer MVP.

---

# 27. Futuro segundo juego

Tutti Frutti es solo un ejemplo arquitectónico futuro.

```text
Juegos Familiares
│
├── Platform
│   ├── Group
│   ├── Player
│   ├── Auth
│   └── PWA
│
├── Impostor
│   └── dominio actual
│
└── Tutti Frutti
    └── dominio futuro
```

Cuando se diseñe Tutti Frutti se decidirá qué infraestructura y conceptos puede reutilizar.

No diseñamos Tutti Frutti ahora.

---

# 28. Dependencia de Supabase

Supabase reduce complejidad operativa al proporcionar:

* Auth;
* Postgres;
* RLS;
* Realtime;
* Presence.

El trade-off es la dependencia del proveedor.

Mitigación conceptual:

* mantener dominio puro independiente;
* evitar que componentes de UI dependan directamente de detalles de infraestructura cuando no sea necesario;
* encapsular accesos a backend razonablemente;
* no construir capas abstractas innecesarias solo para evitar lock-in hipotético.

---

# 29. Límites del MVP

Quedan fuera:

* múltiples backends;
* microservicios;
* matchmaking;
* usuarios públicos;
* social network;
* offline multijugador;
* peer-to-peer;
* escalabilidad masiva;
* colas distribuidas;
* moderación avanzada;
* sistema de plugins para juegos;
* motor universal de juegos;
* abstracciones anticipadas para Tutti Frutti;
* analytics sofisticados.

---

# 30. Decisiones diferidas

Se difieren:

* framework frontend exacto si todavía no está formalmente decidido;
* estructura física definitiva de carpetas;
* schema SQL;
* RLS concreto;
* RPC/Functions concretas;
* Postgres Changes vs Broadcast por evento;
* estrategia exacta service worker/cache;
* limpieza de salas;
* expiraciones;
* tolerancia precisa a desconexiones;
* recuperación avanzada;
* UI/design system.

No cerramos decisiones que todavía no fueron tomadas.

---

# 31. Relación con futura estructura del repositorio

Una futura estructura podría separar conceptualmente:

```text
app/
├── platform/shared
└── impostor
```

o equivalente.

Y dominio:

```text
domain/
└── impostor
```

No fijamos nombres de carpetas definitivos.

Lo importante es la separación de responsabilidades, no la estructura exacta.

---

# 32. Próximo paso

Con la arquitectura conceptual cerrada, el siguiente paso es crear:

```text
sources/implementation-plan.md
```

Ese plan deberá convertir arquitectura y dominio de Impostor en incrementos verticales pequeños, verificables y pedagógicos.
