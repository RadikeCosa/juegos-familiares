# Juegos Familiares — Principios de desarrollo

## Propósito

Construir juegos digitales sencillos, divertidos y cuidados para jugar con familiares y amigos.

Juegos Familiares es la aplicación contenedora.

Cada juego, como Impostor, debe poder mantener su propio dominio sin obligarnos a construir abstracciones genéricas antes de necesitarlas.

El proyecto tiene un doble objetivo:

1. crear productos que realmente resulten agradables de usar y jugar;
2. utilizar cada juego como oportunidad para aprender y comprender mejor el proceso completo de desarrollo de software.

No buscamos solamente llegar a una implementación que funcione. Queremos entender las decisiones de producto, diseño, arquitectura e ingeniería que permiten llegar a ella.

---

## Principios de producto

### La experiencia está primero

Antes de elegir tecnologías o diseñar arquitectura debemos comprender qué experiencia queremos producir.

Primero modelamos lo que hacen las personas.

Después modelamos el software necesario para hacerlo posible.

### La tecnología acompaña al juego

La aplicación no debe convertirse innecesariamente en el centro de la experiencia.

En juegos presenciales, el teléfono debe resolver aquello que aporta valor digital y retirarse cuando la interacción entre las personas es más importante.

### Empezar rápido

Una persona debería poder entender cómo comenzar y llegar a jugar con muy poca fricción.

Evitar:

* registros innecesarios;
* configuraciones extensas;
* pantallas que no aportan;
* explicaciones largas antes de poder jugar.

### Mobile-first

El contexto principal de uso son teléfonos.

Las decisiones de UX, interfaz, rendimiento y testing deben partir de dispositivos móviles reales.

### PWA como objetivo

Los juegos se desarrollarán inicialmente como aplicaciones web progresivas cuando resulte adecuado.

Queremos aprovechar el proyecto para aprender progresivamente:

* qué diferencia una web de una PWA;
* manifest;
* instalación;
* service workers;
* estrategias de caché;
* actualización de versiones;
* comportamiento offline;
* limitaciones de iOS, Android y navegadores;
* experiencia instalada;
* testing de PWAs.

No agregaremos capacidades PWA solamente para cumplir una lista técnica. Cada capacidad deberá responder a una necesidad real del producto.

### Infraestructura proporcional

Utilizar la arquitectura más sencilla capaz de resolver correctamente el problema.

Evitar infraestructura por anticipado.

Antes de incorporar un servicio, dependencia o capa arquitectónica debemos poder responder:

* qué problema resuelve;
* por qué lo necesitamos ahora;
* qué costo introduce;
* qué alternativa más sencilla existe.

### Privacidad por diseño

Recolectar y persistir solamente los datos necesarios.

Los juegos familiares deberían poder utilizarse sin cuentas siempre que el producto lo permita.

La información temporal de una partida no debe convertirse innecesariamente en información permanente.

### Accesibilidad

La accesibilidad forma parte de la calidad del producto.

Consideraremos desde el diseño:

* tamaño de controles;
* contraste;
* legibilidad;
* navegación;
* estados claros;
* feedback;
* uso con tecnologías asistivas cuando corresponda;
* reducción de movimiento;
* diferentes tamaños de pantalla.

---

# Principios de desarrollo

## Construir verticalmente

Preferir pequeños incrementos utilizables en lugar de desarrollar primero grandes capas aisladas.

Cada incremento debería acercarnos a una experiencia que podamos probar.

Ejemplo:

`crear sala → entrar desde otro teléfono → comprobar que ambos jugadores aparecen`

es preferible a:

`construir toda la capa de networking`.

## Separar dominio de infraestructura

Las reglas del juego deberían poder comprenderse y probarse independientemente de React, base de datos o transporte en tiempo real.

Ejemplos:

* elegir un impostor;
* elegir una palabra;
* determinar un ganador;
* calcular un marcador.

Estas reglas pertenecen al dominio del juego.

Cómo sincronizamos esa información entre teléfonos pertenece a infraestructura.

## Decisiones antes que complejidad

Cuando una cuestión todavía no está decidida, registrarla como decisión abierta.

No convertir una hipótesis en arquitectura.

## Probar temprano con personas

Un juego no puede validarse únicamente mediante tests automatizados.

Debemos jugarlo.

Las pruebas reales deben observar:

* si las reglas se entienden;
* dónde aparece fricción;
* si los tiempos funcionan;
* si hay momentos aburridos;
* qué genera diversión;
* qué acciones de la aplicación interrumpen el juego.

---

# Aprendizaje durante el proyecto

## Objetivo

Cada etapa debe permitir comprender qué estamos haciendo y por qué.

El desarrollo no consiste en recibir código terminado sin contexto.

Antes o durante cada incremento debemos identificar:

1. el problema que queremos resolver;
2. las alternativas razonables;
3. la decisión elegida;
4. por qué la elegimos;
5. cómo funciona técnicamente;
6. cómo comprobamos que funciona.

## Profundidad progresiva

No necesitamos estudiar una tecnología completa antes de utilizarla.

Preferimos aprender los conceptos en el momento en que aparecen.

Ejemplos:

Cuando necesitemos conectar varios teléfonos:

* entenderemos cliente/servidor;
* estado compartido;
* realtime;
* identificación de una sala;
* eventos y sincronización.

Cuando necesitemos instalar la aplicación:

* estudiaremos manifest;
* service workers;
* ciclo de instalación de una PWA.

Cuando necesitemos persistencia:

* diferenciaremos estado temporal, local y persistente.

Cuando necesitemos distribuir información secreta:

* estudiaremos confianza entre cliente y servidor y límites de seguridad.

## Código comprensible

Siempre que sea posible:

* nombres explícitos;
* funciones pequeñas;
* tipos claros;
* dependencias justificadas;
* evitar abstracciones prematuras;
* tests que documenten reglas.

El código debe servir también como material de aprendizaje.

## Uso de asistentes de IA

ChatGPT y Codex pueden participar en el desarrollo, pero las decisiones importantes deben permanecer comprensibles.

Para cambios relevantes queremos poder explicar:

* qué cambió;
* por qué;
* dónde;
* cómo funciona;
* cómo verificarlo.

No aceptar complejidad solamente porque una herramienta puede generarla.

---

# Método para cada juego

Cada nuevo juego sigue inicialmente este recorrido:

1. idea;
2. reglas;
3. flujo de usuarios;
4. decisiones de producto;
5. arquitectura mínima necesaria;
6. plan de incrementos;
7. implementación;
8. prueba real jugando;
9. aprendizaje y ajustes.

La documentación debe mantenerse pequeña.

Creamos un documento solamente cuando reduce incertidumbre, conserva una decisión importante o facilita continuar el proyecto.
