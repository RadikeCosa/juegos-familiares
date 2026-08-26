# Juegos Familiares — Product Brief

## Juegos Familiares

Juegos Familiares es una aplicación mobile-first con objetivo PWA destinada a contener distintos juegos pensados principalmente para jugar entre familiares, amigos o grupos pequeños.

---

# Objetivo

Ofrecer una entrada común a varios juegos con baja fricción.

La aplicación debe permitir abrir rápidamente un juego disponible y jugar sin convertir la tecnología en el centro de la experiencia.

---

# Portada

La aplicación tendrá una portada raíz:

```text
/
→ Juegos Familiares
```

La portada mostrará los juegos disponibles.

Ejemplo conceptual:

```text
Juegos Familiares

[ Impostor ]
Jugar

[ Tutti Frutti ]
Próximamente
```

Esto no define todavía UI visual, componentes ni estilos.

---

# Rutas conceptuales

Orientación inicial:

```text
/
→ portada Juegos Familiares

/impostor
→ juego Impostor

/impostor/grupo
→ grupo reconocido de Impostor

/tutti-frutti
→ posible juego futuro
```

Estas rutas son orientación de producto, no contrato técnico definitivo.

---

# Capacidades compartidas conocidas

Por ahora, las capacidades que pueden pertenecer a la aplicación contenedora son:

* identidad liviana;
* grupo;
* jugadores;
* pertenencia `Player -> Group`;
* navegación entre juegos;
* experiencia PWA;
* infraestructura compartida cuando corresponda.

La intención es que un jugador reconocido dentro de un grupo pueda participar más adelante en otros juegos sin recrear toda su identidad.

No diseñamos todavía un sistema genérico de perfiles.

---

# Identidad liviana y grupo (Incremento 2)

La primera experiencia de una persona nueva no comienza pidiendo nickname.

Primero elige:

```text
[ Crear un grupo ]
[ Unirme a un grupo ]
```

El nickname se solicita dentro del flujo elegido.

## Crear grupo

Formulario mínimo:

En la etapa actual del MVP, la creación de grupos está restringida al admin de plataforma.

Para ese caso habilitado, el formulario solicita:

```text
Tu nombre
Nombre del grupo

[ Crear grupo ]
```

Para usuarios comunes, la acción principal de entrada es unirse por invitación a un grupo existente.

No incluye en este incremento:

* descripción;
* avatar;
* preferencias;
* password o PIN;
* onboarding adicional.

El admin de plataforma que crea el grupo queda como administrador inicial del Group.

Para este incremento no se diseña:

* múltiples administradores;
* transferencia de administrador;
* RBAC configurable.

## Invitación al grupo

La invitación utiliza código y enlace compartible como dos representaciones de la misma invitación conceptual.

El identificador de invitación debe ser opaco, no secuencial y distinto de `groupId`.

No debe habilitar búsqueda o enumeración pública de grupos.

QR queda fuera de alcance en esta etapa.

La invitación a `Group` se mantiene separada de la futura invitación a `Room` de Impostor.

El administrador puede volver a pedir su invitación activa desde la experiencia reconocida del grupo. Esa recuperación no debe depender de guardar el código localmente.

## Unirse

Por código:

```text
Unirme
↓
ingresar código
↓
resolver grupo
↓
mostrar nombre del grupo
↓
pedir nickname
↓
crear Player
```

Por enlace:

```text
abrir enlace
↓
resolver grupo
↓
mostrar nombre del grupo
↓
pedir nickname
↓
crear Player
```

Si el enlace es válido, no se vuelve a pedir el código.

## Nickname

Reglas conceptuales mínimas:

* `trim`;
* no vacío;
* longitud razonable;
* único por `Group` ignorando mayúsculas/minúsculas.

Debe existir una forma normalizada de nickname para garantizar unicidad remota.

No se define todavía una normalización lingüística compleja.

## Separación de identidades

Debe mantenerse explícitamente:

```text
AuthIdentity
≠
Player
≠
Group
≠
LocalIdentity
```

`LocalIdentity` es cache/pista de UX.

No constituye autorización.

La identidad verificable y la autorización dependen de `AuthIdentity` y estado remoto.

Si se pierde la sesión anónima y ya no existe `AuthIdentity` válida, no debe recuperarse automáticamente el `Player` anterior usando datos locales.

La recuperación avanzada queda fuera del MVP de este incremento.

## Grupo reconocido

Cuando una persona ya pertenece a un grupo, `/impostor` debe expresar claramente ese contexto:

```text
Hola, Ramiro

Tu grupo
Familia

[ Ver grupo ]
```

`/impostor/grupo` funciona como espacio persistente del grupo:

```text
Familia

Integrantes

Ramiro · Admin
Pedro
Camila
```

El administrador ve una acción para invitar personas. Un jugador común entiende que pertenece al mismo grupo, pero no ve controles administrativos.

Esta vista no es una sala de juego. Resuelve la pertenencia social antes de introducir `Room`.

---

# Primer juego

El primer juego de la aplicación es:

```text
Impostor
```

Impostor mantiene su propio dominio de reglas, flujo, estado, historial y requisitos técnicos.

---

# Evolución futura

Juegos Familiares podrá incorporar otros juegos, por ejemplo:

```text
Tutti Frutti
```

No asumimos que todos los juegos futuros tendrán salas, rondas, votos, palabras, impostores o realtime.

Esas capacidades pertenecen a cada juego solamente cuando correspondan.

---

# Organización futura conceptual

Cuando exista la aplicación, podría distinguir conceptualmente:

```text
app/
├── page.tsx
└── impostor/
```

y dominio de juego:

```text
domain/
└── impostor/
```

Esto no fija todavía una estructura de carpetas detallada ni implica crear código.

---

# Principio

La existencia de varios juegos futuros no justifica construir ahora abstracciones genéricas para juegos que todavía no existen.

Debemos:

* compartir solamente capacidades que ya sabemos que son transversales;
* mantener el dominio de Impostor independiente;
* extraer abstracciones nuevas solo cuando un segundo juego real demuestre que son necesarias.

Evitar por ahora conceptos como:

```text
GenericGame
GenericRound
GenericScoreEngine
GenericRoom
GenericRealtimeGame
```
