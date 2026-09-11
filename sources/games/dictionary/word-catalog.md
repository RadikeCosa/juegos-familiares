# Diccionario — Catálogo inicial de palabras

## Propósito

Este documento define el formato editorial del catálogo de palabras de
Diccionario y los criterios mínimos para que una palabra pueda entrar al juego.

No contiene todavía el dataset final ni reemplaza el proceso de curaduría.

## Decisión de fuente

El MVP usará un catálogo propio curado. Cada carta jugable se prepara dentro del
proyecto y queda disponible sin consultar servicios externos durante una
partida.

Los lemarios abiertos y las listas de frecuencia pueden usarse para encontrar
candidatas, ampliar variedad y evitar repeticiones, pero no convierten una
palabra automáticamente en jugable.

DLE/RAE, RAE API, Wikcionario, Wikidata, WordNet, FreeLing y recursos similares
pueden servir como referencias de contraste según sus condiciones de uso. No se
importan definiciones protegidas ni se depende de una API externa en runtime.

## Carta jugable

Una carta jugable debe contener:

- palabra visible;
- forma normalizada para deduplicación;
- definición real breve redactada o curada para el juego;
- dificultad;
- estado de revisión;
- notas internas de curaduría cuando correspondan.

Puede contener:

- familia léxica;
- categoría amplia;
- etiquetas de tono o tema;
- fuente de inspiración o verificación;
- observaciones de riesgo.

Estos campos son editoriales. No deciden por sí solos el esquema técnico final.

## Dificultad

La dificultad describe experiencia esperada, no prestigio lingüístico:

- `facil`: palabra reconocible, pero con definición no completamente obvia;
- `media`: palabra entendible o plausible, con margen para engañar;
- `dificil`: palabra poco común, pero pronunciable y con definiciones
  inventadas posibles.

Una partida de tres palabras debería mezclar dificultad. El patrón inicial
recomendado es una fácil, una media y una difícil, siempre que el catálogo
disponible lo permita.

## Criterios de aceptación

Una palabra entra al catálogo jugable cuando:

- puede leerse y pronunciarse sin fricción excesiva;
- no es una palabra funcional o auxiliar;
- no es ofensiva, sensible o incómoda para un grupo familiar;
- no depende de jerga técnica demasiado específica;
- permite al menos dos definiciones inventadas plausibles;
- tiene una definición real breve y clara;
- no se confunde fácilmente con otra carta ya aceptada;
- no pertenece a una familia léxica saturada en el catálogo.

## Definición real

La definición real debe:

- ser breve;
- ser comprensible en lectura oral;
- evitar ejemplos largos;
- no copiar texto protegido de fuentes externas;
- preservar el sentido principal elegido para la carta;
- ser revisada por una persona antes de entrar al catálogo.

Si una palabra tiene varias acepciones jugables, la carta debe elegir una. No se
mezclan varias definiciones reales en la misma carta.

## Tamaño objetivo

Para evitar repetición temprana:

- MVP técnico: al menos 120 cartas curadas;
- beta familiar: al menos 300 cartas curadas;
- base saludable: 1.000 o más cartas curadas;
- pool auxiliar de candidatas: varios miles de palabras filtrables.

La selección debe excluir cartas ya usadas por el Group mientras queden
alternativas. Con 300 cartas, un Group puede jugar unas 100 partidas de tres
palabras antes de necesitar reciclaje.

## Selección de palabras

La selección de una partida debe:

- elegir tres cartas no usadas previamente por el Group, si existen;
- evitar repetir familia léxica dentro de la misma partida;
- mezclar dificultad cuando sea posible;
- evitar tres palabras de una misma categoría amplia;
- registrar qué cartas fueron usadas por el Group.

Si no quedan tres cartas elegibles, la aplicación no debe iniciar una nueva
partida salvo que exista una política explícita de reciclaje.

## Reciclaje

El MVP no recicla palabras mientras el catálogo tenga alternativas. Si un Group
agota el catálogo disponible, la aplicación debe bloquear la nueva partida y
explicar que faltan palabras disponibles.

Una política futura podría permitir reciclaje después de una ventana larga de
enfriamiento, pero esa decisión queda fuera del contrato inicial.

## Moderación mínima

El MVP confía en grupos conocidos. Para las definiciones de participantes,
aplica el contrato de texto plano, normalización visual, validaciones de
contenido y ayuda privada de escritura definido en las reglas y requisitos
técnicos. Estas medidas reducen pistas accidentales de autoría, pero no
garantizan anonimato perfecto.

Como mínimo bloquea:

- definición no vacía;
- largo mínimo suficiente para evitar respuestas sin contenido;
- largo máximo razonable para lectura oral;
- emojis;
- contenido puramente decorativo, ilegible o compuesto sólo por ruido.

No hay moderación automática avanzada, revisión comunitaria, inteligencia
artificial ni autocorrección semántica. Si una definición propia está mal antes
de la resolución, su autor puede editarla. Después del congelamiento no se
corrige dentro de la misma partida.

## Muestra editorial previa a código

Antes de implementar, conviene crear una muestra manual pequeña de cartas para
validar tono y estructura:

- 12 cartas fáciles;
- 12 cartas medias;
- 12 cartas difíciles.

Esa muestra debe revisarse como producto, no como seed técnico definitivo.
