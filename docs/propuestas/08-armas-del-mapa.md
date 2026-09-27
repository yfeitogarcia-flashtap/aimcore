# Propuesta 08 — El arsenal del mapa: peanas de arma y dotación

**Estado:** **diseñada, sin construir nada.** El encargo (vuelta 95) fue: «el
creador decide con qué se juega ese mapa», en dos formas —una armería filtrada o
**armas en el suelo sobre peanas**, que es la que gustó— más «en ese mismo panel
el creador define qué lleva equipado cada jugador al empezar la ronda: chaleco y
casco (sí o no), granadas y Fang».

Y tres preguntas explícitas, que se contestan en §1 antes que nada porque son las
que deciden el resto:

1. ¿Un arma recogida reaparece, y cada cuánto?
2. ¿Las peanas van en la zona de cada jugador o compartidas?
3. ¿Qué pasa con el arma que llevabas?

---

## 0. La respuesta corta

**Son cuatro fases, y las dos primeras no tienen mecánica nueva.**

| Fase | Qué | Coste |
|---|---|---|
| 1 | **La dotación completa**: `duelo.dotacion` gana granadas y arrojadizo | pequeño |
| 2 | **La lista blanca**: `duelo.armas` filtra el catálogo y la armería | pequeño |
| 3 | **La peana en el motor**, primero en el entrenamiento | grande |
| 4 | **La peana en red**, con el servidor de árbitro | mediano |

Lo que hace baratas las dos primeras es que **ya existen a medias**: `duelo.dotacion`
está construido desde la vuelta 72 —Los Pilares reparte Scout, chaleco y cuchillo
y no tiene tienda— y lo único que le falta son dos campos. O sea que **la mitad
del encargo es una extensión de un campo**, no un sistema.

Y lo que hace grande la tercera no es la geometría: es que una peana es **lo
primero de Vektor que entrega un arma sin pagarla**.

---

## 1. Las tres preguntas

### ¿Reaparece, y cada cuánto? Sí, y lo dice el mapa

**Reaparece**, porque si no la peana no es un sitio del mapa sino un premio de
carrera: quien llega primero la ronda 1 se lleva el rifle de todo el partido.

**Cada cuánto lo declara la peana**, con un valor de fábrica, y por la misma razón
por la que la física es del mapa desde la vuelta 72: es lo que decide el ritmo de
ese mapa, y dos mapas con ritmos distintos son dos mapas y no dos ajustes mal
puestos.

El número de fábrica **no se inventa, se deriva de lo que el duelo ya mide**: una
ronda dura 3 minutos, la fase de compra 15 s, cruzar El Espejo cuesta **7.0 s** y
el primer contacto posible cae a los **3.5 s** (vuelta 66). Con eso, **20 s** es
aproximadamente tres cruces: se puede volver a por ella, y perder la pelea por
ella cuesta algo. `PICKUPS.respawnMs` son 15 s y **no vale de referencia** —una
cruz de vida no cambia a qué juegas— así que esto es un número propio.

Extremos que sí valen, y son los que hacen que el campo signifique algo:

- **0 es «siempre puesta».** Es lo que quiere un mapa que sólo reparte: la peana
  del rifle junto a la salida, permanente, que es la dotación por otra puerta.
- **El tope es 120 s.** Por encima de eso, en una ronda de tres minutos la peana
  existe una vez y media: eso no es un sitio del mapa, es un evento.

Y **el reloj es el número de paso**, como todo lo demás del duelo (vuelta 45): con
un instante de pared sería un tercer reloj que sigue corriendo en pausa, que es el
agujero que la vuelta 54 ya cerró dos veces.

### ¿Zona de cada jugador o compartidas? Ni un campo: donde se pone

**No hay ajuste, y eso es la respuesta.** Una peana tiene una posición, y una
posición ya está o en la mitad de alguien o en el centro. Lo que lo hace seguro es
que el mapa de duelo **es simétrico por giro de 180°** (vuelta 66): se declara
media sala y `giro180` añade la otra girada, así que **una peana declarada en una
mitad sale con su gemela en la otra, con la misma arma, por construcción**. Y una
declarada en el centro es compartida, también por construcción.

Un campo `zona` sería la ocasión de escribir dos veces la misma peana y que una se
quede a media unidad de su pareja — que es literalmente el argumento con el que la
vuelta 66 eligió el giro en vez del espejo.

Lo que **no** se hace es reservar una peana para su dueño. La única geografía que
el duelo impone es la caja de compra, y es de la fase de compra (vuelta 62);
«tu zona» es geografía y nada más, así que el rival puede ir a por tu rifle. Que
pueda es la mitad de para qué sirve ponerlo ahí.

### ¿Qué pasa con el arma que llevabas? Se va, y por eso la peana no sorprende

**La peana escribe su ranura, y lo que hubiera en esa ranura desaparece.** No es
una regla nueva: es `CAMPO[item.ranura]` de la vuelta 92, el **único** camino por
el que se escribe un arma comprada, y usarla aquí es lo que evita que haya dos
formas de acabar empuñando algo (vuelta 67).

De ahí tres cosas, y las tres salen de reglas que ya están escritas:

- **Si ya llevas esa misma arma, recoger es recargar** — no comprar, exactamente
  como el Fang desde la vuelta 90. Y a cargador lleno **no pasa nada y la peana se
  queda encendida**, que es la regla de `pickups.js`: si el jugador no tenía hueco,
  el objeto se queda donde está.
- **Si llevas otra de esa ranura, se cambia.** Eso incluye cambiar a peor —pasar
  por encima de una peana de Volt con un Rift en la mano te deja el Volt— y **se
  acepta a propósito**, porque la alternativa es peor: la alternativa es pedir la
  tecla contextual, y esa tecla ya reparte tres cosas desde la vuelta 83
  (desactivar, engancharse a un cable, el artilugio). Meterle una cuarta es
  exactamente cómo se pierde una ronda por un reflejo.
- **Lo que hace que eso no sea una trampa es que se lee desde lejos.** La peana
  lleva la ficha flotante con la silueta del arma, y la silueta es lo único que se
  ve de un arma en Vektor (vuelta 38). Pasar por encima de una peana sin saber qué
  hay encima no puede ocurrir.

Y lo que **no** se hace, aunque es tentador: **el arma que dejas no vuelve a la
peana ni cae al suelo.** Volver a la peana convertiría su contenido en «lo que
dejó el último», y entonces «el rifle está en el centro» deja de ser un hecho del
mapa — que es justo lo que un mapa de arena vende. Y caer al suelo es un sistema
entero: armas tiradas con su posición, su identidad, su caducidad y su radio, o
sea `clavadas.js` generalizado, para resolver un problema que la peana ya
resuelve.

---

## 2. Lo que decide el alcance: una peana no puede convivir con la tienda

**Una peana es lo primero del juego que da un arma sin cobrarla**, y de ahí sale
la única restricción de verdad de esta propuesta: **las peanas viven en mapas
`sinEconomia`** (vuelta 72), y el saneado lo obliga en vez de avisarlo.

El motivo no es purismo. Con tienda abierta, un rifle gratis a doce unidades de la
salida deja el catálogo entero en decoración: ningún artículo de `ECONOMY.catalogo`
compite con «gratis y a la vuelta de la esquina», y la economía —que es lo que la
vuelta 64 construyó entera— pasa a no decidir nada. Y al contrario: si la tienda
puede vender el Titan, las peanas son decoración.

Así que el encuadre completo, y es el que lo hace barato:

> **Un mapa de peanas es un mapa sin economía.** `dotacionDeDuelo` dice con qué
> sales, las peanas dicen qué se encuentra por el mapa, y no hay tienda que
> contradecir a ninguna de las dos.

Eso además coloca la **lista blanca** (fase 2) en su sitio: no es la alternativa a
las peanas, es lo que se usa en un mapa **con** economía. Las dos formas del
encargo no compiten — **contestan a mapas distintos**.

---

## 3. Fase 1 — La dotación completa

`duelo.dotacion` existe y hoy tiene tres campos: `arma`, `chaleco`, `casco`. Lo
que pide el encargo son dos más:

```js
duelo: {
  sinEconomia: true,
  dotacion: {
    arma: 'scout',          // ya existe
    especial: null,         // la quinta ranura (vuelta 92)
    chaleco: true,          // ya existe
    casco: false,           // ya existe
    granadas: ['ko'],       // nuevo — lista, con el tope de ECONOMY.granadasMax
    arrojadizo: 'fang',     // nuevo — o null
  },
}
```

Cuatro reglas, y ninguna es nueva:

- **Se reparte por el inventario de siempre** (`Partida._dotar`), así que llega al
  cliente por `MSG.ECONOMIA` y el arma se pone en la mano sola — que es lo que ya
  hace una compra desde la vuelta 67.
- **Y después de quitar.** `_perderEquipo` deja sin chaleco al que cayó y el orden
  de esas dos líneas **es** la regla (vuelta 72): en un mapa que reparte, morir no
  puede costar el equipo, porque no hay forma de recuperarlo.
- **Las granadas son una lista con su tope**, el mismo `ECONOMY.granadasMax` de la
  vuelta 88 (2 clases): una dotación que pudiera dar las tres sería un mapa
  saltándose el límite que la tienda respeta.
- **Y la ranura especial entra ahora**, aunque el encargo no la nombre: existe
  desde la vuelta 92 y dejarla fuera sería una dotación que no puede decir «en
  este mapa se juega con arco», que es exactamente la clase de mapa que esto viene
  a permitir.

En el editor va en la hoja de **Duelo**, junto a «sin economía», que es donde ya
está el campo que la enciende.

**Lo que se mide:** que un mapa con dotación completa reparta las cinco cosas al
empezar la ronda y al reaparecer, que morir no cueste nada de eso, y que un mapa
sin dotación se comporte **dígito a dígito** como hoy.

---

## 4. Fase 2 — La lista blanca

`duelo.armas`: las claves que ese mapa admite. Tres reglas:

- **Filtra `catalogoDeTienda()`**, que es el catálogo que miran los dos extremos
  —el cliente para montar el panel y el servidor para aceptar (vuelta 73)—. Escrito
  en un solo lado, el síntoma sería un artículo que el panel enseña y el servidor
  rechaza sin decir por qué.
- **Filtra lo que se ofrece, nunca lo que existe.** Es la regla de `publicado` de
  la vuelta 88: `WEAPONS` no se toca, y las listas derivadas (`PRIMARY_WEAPONS` y
  compañía) tampoco — lo que se acota es el catálogo. Un arma fuera de la lista que
  llegue en un ajuste guardado cae a la de serie por el saneado de siempre.
- **Y una ranura no puede quedarse vacía.** Si la lista deja la ranura de pistola
  sin ninguna, el saneado lo dice y no la aplica: `slots.secondary` es la ranura a
  la que se cae cuando falla otra (vuelta 89), y vaciarla es quedarse sin mano.

En el entrenamiento la armería enseña lo mismo que la tienda cobraría, así que el
filtro sale gratis ahí también — que es la convención de la vuelta 63: lo que se
aprende en un modo vale en el otro.

---

## 5. Fase 3 — La peana, en el motor

### El dato

```js
peanas: [
  { x: 0, z: -12, arma: 'rift', reaparicionSegundos: 20 },
]
```

`x`/`z` es **el centro** y no la esquina mínima, como en un tubo (vuelta 81): la
esquina de un círculo no quiere decir nada. La altura sale del suelo que haya
debajo (`groundHeightAt`), así que una peana sobre una plataforma funciona sin
declarar nada — y eso obliga a lo de siempre: se consulta en la línea de al lado de
su propio `groundHeightAt` (vuelta 80).

### Qué se ve, y de qué se reutiliza

Tres piezas, y **ninguna es nueva**:

- **La peana**: un cilindro bajo facetado, del vocabulario de `pickups.js` —sólidos
  sin textura, porque lo que distingue una cosa de otra es la silueta—. Un
  `InstancedMesh` para todas las del mapa, que es el patrón de `impacts.js`.
- **El haz de luz**: un cono invertido aditivo, como el destello de un dispositivo
  (`dispositivos.js`). Aditivo quiere decir que apagarse **es** bajar a negro, así
  que una peana gastada no necesita un material propio.
- **La ficha flotante**: `weaponSilhouetteSvg()`, que vive fuera de React
  precisamente para que la usen los dos modos (vuelta 67), dibujada con el
  `CSS3DRenderer` que ya monta la ficha sobre la cabeza de un muñeco. Y **con el
  tope de tamaño de `MARKERS.referenceDistance`**, o a treinta unidades son cuatro
  píxeles y lo que no se ve no se cuenta (vuelta 39).

**Y no es geometría**: fuera de `occluders`, sin colisión y fuera del presupuesto.
Una peana que parase balas sería cobertura que nadie decidió, y un haz de luz que
tapase la vista sería un muro de aire.

### Cómo se coge

**Por proximidad y sin tecla**, como los recogibles desde la vuelta 33 y el Fang
desde la 90. El radio se mide **desde los pies** —una peana está en el suelo, no
como un cuchillo clavado en una pared— y en el **flanco de entrar**: sin flanco, un
jugador parado encima recargaría sesenta veces por segundo.

### Lo que suena y lo que se ve al cogerla

**Una peana es un dispositivo**, así que le aplica entera la norma permanente de la
vuelta 82: **nace con su voz y su destello, decididos al construirla**. Las dos ya
existen:

- **La voz es `playEquip('arma')`**, el cerrojo de la vuelta 73, que es
  exactamente el sonido de «acabas de tener un arma». Inventarle otra sería una
  segunda voz para el mismo suceso.
- **El destello es un anillo de `dispositivos.js`**, tumbado y abriéndose desde la
  peana. Y **el haz se apaga**, que es la otra mitad: sin eso, coger una peana y
  pasar por al lado se ven igual.

Apagada, la ficha se atenúa y el haz desaparece, así que **desde la otra punta del
mapa se ve si el rifle del centro está puesto**. Eso no es adorno: es la
información con la que se decide ir o no ir, y esconderla detrás de la distancia
sería el fallo de la vuelta 89 con otro nombre.

### En el editor, viendo el efecto

La convención de la vuelta 78 en su caso fácil: la peana **se arrastra por la
rejilla** con el mismo gesto que una pieza, lleva su arma en un desplegable que sale
de `PRIMARY_WEAPONS` y compañía —no de una lista a mano—, y **la ficha flotante se
dibuja ya en el editor**, así que se ve si el rifle cabe en ese pasillo. Botón en la
hoja de **Dispositivos**, con su fila en la lista de «En el mapa», que es lo que
resuelve el segundo problema de la vuelta 81: volver a dar con ella.

Y la ficha dice lo que se va a notar jugando y no el número otra vez: «cada 20 s;
en este mapa cruzar de una salida a otra cuesta 7.0 s».

### Y en el entrenamiento, primero

Se construye **en el motor y se prueba contra los muñecos antes de escribir una
línea de red**. Es la convención de la vuelta 63 por su lado bueno: lo que vive en
el motor sale en los dos modos, y lo que se juega antes de mandarlo por un cable es
lo que no hay que rehacer después.

---

## 6. Fase 4 — La peana en red

Todo lo del inventario lo decide el servidor desde la vuelta 64, así que esto es el
Fang otra vez y se resuelve igual:

- **El servidor reparte y el cliente no lo predice.** Si cada cliente cogiera la
  peana por su cuenta, los dos podrían coger la misma — que es literalmente el
  argumento de la vuelta 90 con un cuchillo en el suelo. Llega un viaje más tarde y
  **no se nota**, porque lo que se coge no se mueve.
- **El reloj de la reaparición es el número de paso**, y **lo que viaja es el
  estado**, no la fecha: un mensaje por peana cuando se apaga y cuando vuelve, que
  es un suceso de cada veinte segundos y no un campo en la foto de 60 Hz (la regla
  de la economía en la vuelta 64).
- **Y empezar una ronda las devuelve todas**, por lo mismo que limpia los cuchillos
  clavados y tira la cola sin confirmar (vuelta 62): una ronda empieza con el mapa
  como el creador lo dejó.
- **El identificador lo pone quien manda** (vuelta 90). Aquí es más fácil que con
  el Fang: una peana es del mapa, así que su identificador es **su índice en la
  lista**, que los dos extremos derivan del mismo fichero sin que viaje nada.

---

## 7. El equilibrio de los mapas de hoy

**Ninguno cambia**, y eso es una propiedad y no una promesa: las peanas sólo
existen en mapas `sinEconomia`, y de los seis escenarios de hoy el único es **Los
Pilares**, que no declara ninguna. Los dos mapas de duelo con tienda —El Espejo y
lo que se dibuje en Alchemist— no pueden tenerlas.

Lo que sí hay que decir, porque es el riesgo real de la fase 3: **un mapa de peanas
es un juego distinto**, no una variante. Sin economía no hay decisión de ahorro, la
ronda 1 deja de ser diferente y el salto de dinero por ganar no existe — o sea que
tres de las ocho reglas de la vuelta 64 no aplican. Eso es correcto para un mapa de
arena y sería un error como valor de fábrica, y por eso las peanas no llegan a
ningún mapa que no las pida.

---

## 8. Qué se deja fuera, y por qué

- **Armas tiradas al suelo al morir o al cambiar.** Es el sistema que §1 descarta:
  entidades con posición, identidad y caducidad para resolver algo que la peana ya
  resuelve. Si algún día se quiere, el sitio es `clavadas.js` generalizado, no un
  segundo módulo.
- **Peanas de chaleco, casco o granadas.** El encargo las excluye explícitamente
  —«sí o no, no se colocan en el suelo»— y tiene razón: eso ya está en el suelo
  desde la vuelta 33 (`pickups`), y una segunda forma de coger un casco serían dos.
- **Que la peana diga cuánto le queda.** Un número flotando sobre el suelo es
  telemetría en el mundo; el haz apagado ya dice «no está» y eso es lo que se
  necesita para decidir. Si jugándolo hace falta, es una fase propia.
- **Prioridad entre una peana y un recogible en el mismo sitio.** No hace falta
  decidirlo: son dos radios independientes y coger las dos cosas al pasar es lo
  correcto. Lo que **no** puede pasar es que compitan bajo el punto de mira, y no
  compiten porque ninguna de las dos se apunta.

---

## 9. Qué hacer primero

**La fase 1, y sola.** Es la mitad del encargo, no tiene mecánica nueva, no toca el
protocolo y se puede jugar el mismo día: un mapa que reparte Krakov, chaleco, casco,
dos KO y un Fang ya es un mapa con su propio arsenal.

La fase 2 va detrás porque es igual de barata y contesta a la otra mitad para los
mapas **con** tienda.

Y la fase 3 **no se empieza hasta haber jugado un mapa de dotación completa**, por
una razón concreta: la mitad de lo que una peana viene a dar —«en este mapa se
juega con esto»— la da ya la dotación, y jugarla es lo que dice si lo que falta es
encontrar armas por el mapa o sólo elegir con qué se sale. Construir la peana antes
es construirla sin saber contra qué se compara.
