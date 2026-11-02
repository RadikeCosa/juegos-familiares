# Diccionario — Alternativas para fuente de palabras

## Propósito

Este documento evalúa alternativas para construir una base amplia de palabras
jugables para Diccionario. Su objetivo es evitar repeticiones, palabras pobres y
dependencias que puedan arruinar la experiencia o bloquear la implementación.

No define todavía el dataset final ni incorpora palabras concretas al
repositorio.

## Criterio de evaluación

Una fuente útil para Diccionario debe permitir:

- una base amplia, con miles de candidatas posibles;
- filtrado por dificultad, rareza, longitud y jugabilidad;
- baja repetición dentro de un Group;
- uso legalmente claro en una aplicación propia;
- funcionamiento sin depender de una API externa durante la partida;
- curaduría humana antes de que una palabra llegue al juego.

La definición real es parte central de la experiencia. Por eso no alcanza con
tener un lemario amplio: cada palabra jugable necesita una definición usable,
breve y verificable.

## Alternativas evaluadas

### DLE / RAE como fuente primaria automática

El Diccionario de la lengua española es la referencia académica principal del
español. ASALE lo presenta como obra lexicográfica de referencia y registra más
de 93.000 lemas en su 23.ª edición:
https://www.asale.org/obras-academicas/diccionarios/diccionario-de-la-lengua-espanola

Ventajas:

- máxima confianza lingüística;
- cobertura amplia;
- definiciones de buena calidad.

Problemas:

- no hay una API pública oficial para usar como dependencia de producto;
- los textos lexicográficos tienen derechos propios;
- copiar o almacenar definiciones puede introducir riesgo legal;
- depender de consulta remota durante una partida agrega fragilidad.

Decisión: no usar DLE/RAE como fuente automática ni copiar definiciones al
producto. Puede usarse como referencia manual de consulta durante curaduría,
sin almacenar texto protegido.

### RAE API no oficial

RAE API ofrece acceso programático no oficial a contenidos del DLE:
https://rae-api.com/

Su aviso legal declara que no está vinculada con la RAE, que el contenido
lexicográfico pertenece a la RAE y que el servicio no garantiza disponibilidad:
https://rae-api.com/docs/aviso-legal/

Ventajas:

- integración técnica simple;
- acceso programático a definiciones.

Problemas:

- no es oficial;
- arrastra el mismo problema de derechos sobre contenido lexicográfico;
- puede cambiar o interrumpirse;
- introduce una dependencia externa para una parte sensible del juego.

Decisión: no usarla como fuente de producción para Diccionario.

### Wikcionario / Wiktionary

Wikcionario y Wiktionary ofrecen contenido abierto y API/dumps consultables. El
contenido está bajo licencias Creative Commons con requisitos de atribución y,
según el caso, compartir igual:
https://es.wiktionary.org/wiki/API

Ventajas:

- acceso abierto;
- gran cobertura;
- trazabilidad de páginas e historial;
- opción razonable para alimentar investigación o prototipos.

Problemas:

- calidad y formato variables;
- definiciones pueden requerir limpieza y revisión;
- licencias copyleft pueden condicionar cómo se redistribuyen definiciones
  adaptadas;
- una definición importada tal cual puede sonar demasiado técnica o poco
  jugable.

Decisión: puede ser fuente secundaria de contraste y candidatas, pero no se
debe importar masivamente texto de definiciones al producto inicial sin resolver
atribución, licencia y formato.

### Wikidata Lexemes

Wikidata ofrece datos estructurados y API REST. Sus datos estructurados están
disponibles bajo CC0:
https://www.wikidata.org/wiki/Wikidata:REST_API/es

Ventajas:

- licencia muy favorable para datos estructurados;
- IDs y relaciones útiles para normalización o metadata;
- puede ayudar a detectar idioma, formas o relaciones.

Problemas:

- no reemplaza un diccionario de definiciones jugables;
- cobertura de lexemas puede ser irregular para nuestro criterio;
- requiere modelado adicional para convertir datos en una carta jugable.

Decisión: posible apoyo futuro para metadata, no fuente principal del MVP.

### Lemarios abiertos

El proyecto `olea/lemarios` publica listas de palabras del español y declara sus
materiales en dominio público:
https://github.com/olea/lemarios

Ventajas:

- base amplia de candidatas;
- licencia clara y simple;
- buena opción para evitar repetición;
- se puede usar offline y filtrar localmente.

Problemas:

- provee palabras, no definiciones reales;
- requiere curaduría de jugabilidad;
- puede incluir términos demasiado raros, técnicos, regionales o poco
  divertidos.

Decisión: fuente recomendada para generar un pool amplio de palabras candidatas,
siempre filtrado y curado antes de producir cartas jugables.

### FreeLing, WordNet y Open Multilingual Wordnet

FreeLing incluye recursos lingüísticos del español y datos derivados de MCR 3.0
con licencias abiertas, pero advierte que los diccionarios tienen licencias
distintas según su origen:
https://nlp.lsi.upc.edu/freeling/node/12

Open Multilingual Wordnet agrupa wordnets abiertos y permite uso, modificación
y redistribución de sus componentes según sus licencias:
https://omwn.org/

Ventajas:

- útiles para análisis lingüístico;
- pueden aportar categorías, relaciones semánticas o sentidos;
- ayudan a enriquecer filtros.

Problemas:

- no producen por sí solos definiciones naturales para el juego;
- licencias y procedencias deben revisarse recurso por recurso;
- pueden empujar hacia complejidad técnica prematura.

Decisión: no usarlos en MVP. Reconsiderarlos si necesitamos metadata semántica
o filtros más sofisticados.

### Listas de frecuencia

Listas como OpenSLR SLR21 ofrecen palabras del español con frecuencia derivada
de corpus:
https://www.openslr.org/21/

`wordfreq` ofrece frecuencias para muchos idiomas, incluido español, a partir de
varias fuentes y con listas grandes cuando están disponibles:
https://github.com/rspeer/wordfreq

Ventajas:

- ayudan a excluir palabras demasiado frecuentes o demasiado raras;
- permiten diseñar bandas de dificultad;
- sirven como filtro complementario para un catálogo amplio.

Problemas:

- frecuencia no equivale a jugabilidad;
- algunas licencias exigen atribución o compartir igual;
- no aportan definiciones reales;
- `wordfreq` declara que sus datos de frecuencia son una foto hasta
  aproximadamente 2021.

Decisión: usar frecuencia como filtro auxiliar, no como fuente principal de
cartas jugables.

### Catálogo propio curado

Un catálogo propio contiene cartas jugables creadas para Diccionario:

- palabra;
- definición real breve, redactada o adaptada por el proyecto;
- dificultad;
- etiquetas opcionales;
- estado de revisión;
- fuente de inspiración o verificación, cuando corresponda;
- fecha de incorporación.

Ventajas:

- control total de tono, dificultad y experiencia;
- evita copiar definiciones protegidas;
- funciona offline desde el punto de vista del catálogo;
- permite crecer por tandas;
- facilita excluir repetición por Group e historial.

Problemas:

- requiere trabajo de curaduría;
- la calidad depende del proceso editorial;
- una base inicial demasiado chica produciría repetición.

Decisión: fuente principal recomendada para el MVP.

## Decisión para MVP

Diccionario usará un **catálogo propio curado** como fuente de palabras
jugables.

La base amplia de candidatas puede alimentarse desde lemarios abiertos y listas
de frecuencia, pero una palabra sólo entra al juego cuando se convierte en una
carta curada. No se importan definiciones de DLE/RAE ni se depende de RAE API
durante la partida.

## Tamaño objetivo

Para evitar repetición temprana:

- MVP técnico: al menos 120 cartas curadas;
- beta familiar: al menos 300 cartas curadas;
- base saludable: 1.000 o más cartas curadas;
- pool de candidatas: varios miles de palabras filtrables.

Con partidas de tres palabras, 300 cartas permiten unas 100 partidas antes de
repetir dentro de un Group si la selección excluye el historial del grupo.

## Criterios de palabra jugable

Una palabra candidata es jugable cuando:

- es reconocible o al menos pronunciable para el grupo;
- permite definiciones inventadas plausibles;
- tiene una definición real breve;
- no depende de conocimiento técnico demasiado específico;
- no es una función gramatical vacía, artículo, preposición o palabra puramente
  auxiliar;
- no es ofensiva, sensible o incómoda para un contexto familiar;
- no es tan cotidiana que la definición real sea obvia de inmediato;
- no es tan rara que nadie pueda inventar algo creíble;
- no repite de forma cercana una palabra jugada recientemente por el Group.

## Estrategia anti-repetición

La selección de palabras debe:

- excluir palabras ya usadas por el Group mientras queden alternativas;
- evitar repetir una misma familia léxica en ventanas cercanas, cuando exista
  metadata suficiente;
- mezclar dificultad para que una partida de tres palabras no sea plana;
- evitar tres palabras de la misma categoría semántica cuando exista metadata;
- bloquear una nueva partida si quedan menos de tres cartas elegibles no usadas;
- permitir reciclaje sólo si una política futura define una ventana larga de
  enfriamiento.

## Próximo paso

Antes de programar, conviene crear una primera muestra manual pequeña,
suficiente para validar tono, dificultad y estructura del catálogo sin todavía
convertirla en seed técnico definitivo.
