# Juegos Familiares — Product brief

## Propósito

Juegos Familiares es una aplicación mobile-first orientada a facilitar
experiencias compartidas entre familiares, amigos o grupos pequeños.

La tecnología debe reducir fricción sin reemplazar la interacción humana
cuando esa interacción es el núcleo de la utilidad.

## Producto actual

Impostor es actualmente la única utilidad jugable implementada dentro de
Juegos Familiares. Mantiene su propio dominio de producto, reglas, estado y
operación.

La portada `/` es la entrada común a la aplicación y el espacio de gestión del
grupo: allí se crean o aceptan invitaciones, se consulta el contexto y se ven
los integrantes. La portada no crea identidad, jugador ni grupo sólo por
renderizarse; el onboarding comienza tras una acción explícita.

## Capacidades compartidas actuales

La plataforma ofrece únicamente las capacidades compartidas respaldadas por
la implementación actual:

- identidad autenticada liviana;
- `Player`;
- `Group` y pertenencia del `Player` a un grupo;
- contexto de jugador y grupo reconstruido desde estado remoto autorizado;
- navegación común y gestión de grupo en la portada `/`;
- shell de aplicación mobile-first y capacidades PWA.

Estas capacidades no forman todavía un sistema genérico de perfiles ni un
motor para múltiples productos.

## Grupo

La portada `/` es la superficie canónica de plataforma para consultar el grupo
reconocido, sus integrantes y, para su administrador, la invitación activa.
`/grupo` se conserva como ruta de compatibilidad y redirige a `/`. Las
invitaciones compartidas abren `/grupo/invitacion/[code]`, donde ocurre la
incorporación al grupo dentro de la superficie de plataforma. El grupo no es
una sala ni contiene estado de una partida.

La creación de grupos está restringida al administrador de plataforma. El
administrador que crea un grupo queda como administrador inicial de ese
`Group`. Los usuarios comunes se incorporan a un grupo existente mediante una
invitación por código o enlace.

La aplicación no ofrece actualmente eliminación de integrantes, múltiples
administradores, transferencia de administración ni pertenencia simultánea a
múltiples grupos.

## Límites entre plataforma e Impostor

Pertenecen a Impostor, no a la plataforma:

- `Room` y `RoomParticipant`;
- `GameSession` y `SessionPlayer`;
- rondas, roles y palabras;
- votos, resultados y puntuación;
- host, liveness y semántica de juego;
- sincronización Realtime y Presence usada por su gameplay.

La existencia de Impostor no justifica promover estos conceptos a
infraestructura genérica. En particular, no se definen `GenericGame`,
`GameEngine`, `GenericRoom`, `GenericRound`, `GenericScore` ni una plataforma
Realtime genérica.

## Exploración futura

Futuras utilidades —juegos u otra clase de experiencia— servirán para descubrir
qué capacidades son realmente compartidas. Cada utilidad deberá conservar su
propio dominio hasta que exista evidencia concreta de reutilización.
