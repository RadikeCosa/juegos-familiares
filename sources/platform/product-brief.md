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
* membresía del grupo;
* navegación entre juegos;
* experiencia PWA;
* infraestructura compartida cuando corresponda.

La intención es que un jugador reconocido dentro de un grupo pueda participar más adelante en otros juegos sin recrear toda su identidad.

No diseñamos todavía un sistema genérico de perfiles.

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
