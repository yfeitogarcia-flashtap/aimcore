# Propuesta 06 — Superficies, estructuras y la colisión curva

**Estado:** triaje, sin construir nada. El encargo (vuelta 79) fue **triar siete
mecánicas nuevas** en los mismos tres cajones que el menú de formas de la
propuesta 05 §3 —gratis hoy / trabajo pequeño / vuelta propia—, confirmar o
corregir una hipótesis concreta, y contestar **qué implicaría resolver la falta
de colisiones curvas**.

**Lo que se pide:** plataforma de rebote, ventilador, plataforma de velocidad,
superficie resbaladiza (hielo), teletransportador —en dos formas—, tirolina y
estructura de cilindro/tubo para descender.

---

## 0. El triaje, en una tabla

| Gratis hoy | Trabajo pequeño y acotado | Vuelta propia |
|---|---|---|
| **El tubo, por composición**: un pozo octogonal son ocho cajas finas en anillo, y por dentro se baja igual (§5) · el **aspecto** de todo lo demás: dibujar una placa de rebote o una flecha de velocidad no cuesta nada | **Plataforma de rebote** · **Plataforma de velocidad** · **Teletransportador de zona** · **Guardar punto y volver** por tecla · y el cimiento que las cuatro comparten: **que el suelo diga sobre qué estás** (§2) | **Ventilador** · **Hielo** · **Tirolina** · **Colisión curva de verdad** (§6) |

**La hipótesis de la vuelta 79 era casi toda correcta, y falla en un sitio.**
Se decía: *rebote, ventilador, velocidad, hielo y teletransportador podrían
resolverse con un solo sistema de «tipos de superficie» sobre piezas ya
existentes; la tirolina es un sistema nuevo del tamaño del deslizamiento; el
cilindro cae en el mismo cajón que la rotación libre.*

- **La tirolina, exacta.** Es un estado de movimiento nuevo, con sus campos en
  `snapshot()`, como el deslizamiento de la 69 (§4).
- **El cilindro, exacto** en lo que dice y con un premio que no se ve: lo que
  cae en ese cajón es el **sólido curvo**, no el sitio por el que se baja
  —ése se construye hoy (§5)—.
- **El grupo de cinco, no.** Cuatro de ellos sí son el mismo sistema. **El
  hielo no**, y por una razón que no se ve leyendo el editor sino el
  movimiento: **a pie, en Vektor, no hay velocidad.** Un paso es
  `posición + dirección × marcha × dt`; soltar W deja al jugador quieto en ese
  mismo paso. No hay rozamiento que bajar porque no hay inercia que conservar,
  así que «hielo» no es un número de una superficie: es **estrenar un modelo de
  velocidad en el suelo**, que es lo que hoy sólo existe en el aire
  (`_airVelX`/`_airVelZ`) y en el deslizamiento. Eso son dos campos más en
  `snapshot()`, una regla de aceleración y frenada que no está escrita, y la
  pregunta abierta de si el mapa puede tocar **cómo** se acelera —que la vuelta
  72 dejó cerrada a propósito: «un mapa puede decir cuánto pesas; **cómo** se
  acelera, no»—. Y el **ventilador** se cae del grupo por el mismo tipo de
  motivo, en el otro eje (§3).

---

## 1. Por qué estas cinco sí son un solo sistema

Un mapa ya puede declarar datos que cambian cómo se juega y **no viajan por la
red**: la física de la vuelta 72 (`gravity`, `jumpSpeed`, `airStrafeMaxSpeed`),
la caja de compra y la gracia de inicio de ronda de la 78. El argumento que las
hace seguras es siempre el mismo y vale entero aquí:

> Los dos extremos montan **el mismo mapa** —lo dice la sala— y derivan los
> mismos números **sin que viaje ninguno**. Un campo de superficie en el
> protocolo sería una superficie que se puede mentir.

Rebote, velocidad y teletransporte de zona son, además, **eventos de un paso**:
ocurren al aterrizar o al entrar en un volumen, dentro de `_simStep`, y su
efecto se agota ahí. No hay estado nuevo que guardar y por tanto **ni un campo
más en `snapshot()`**, que es lo que los hace baratos de verdad.

El formato sería un campo más de la pieza, saneado como los demás:

```js
{ x, z, w, d, kind, base, superficie: { tipo: 'rebote', fuerza: 12 } }
{ x, z, w, d, kind,       superficie: { tipo: 'velocidad', rumbo: 1.57, fuerza: 9 } }
```

Con `CAMPOS` exhaustivo y `sanearSuperficie` contando lo que tira, que es la
regla de la vuelta 74: un campo que desaparece en silencio al guardar es cómo
un mapa pierde su física sin que nadie se entere — y es exactamente el fallo
que la vuelta 79 acaba de cerrar con `spawnZone`.

---

## 2. El cimiento que comparten: **el suelo tiene que decir sobre qué estás**

Hoy `Scenario.groundHeightAt(x, z, feetY)` devuelve **un número**:

```js
groundHeightAt(x, z, feetY) {
  let ground = 0
  for (…) { if (fuera de la huella) continue; if (box.top <= ground) continue; ground = box.top }
  …
  return ground
}
```

El jugador sabe a qué altura está el suelo y **no sabe qué pieza es**. Las
cuatro mecánicas del cajón del medio necesitan lo segundo, y ninguna necesita
nada más del motor. Así que el trabajo compartido es:

- que ese barrido **se quede con la pieza ganadora**, no sólo con su altura;
- que `_land(ground, now)` reciba esa pieza y consulte su `superficie`.

Dos cautelas que **son** el trabajo, y no un detalle:

- **Se devuelve, no se guarda en un campo del escenario.** El bucle caliente no
  asigna memoria: lo que sale de ahí es un índice o una referencia a la caja ya
  existente, escrito en un hueco del propio `Scenario` reutilizado por paso, no
  un objeto nuevo por llamada. `groundHeightAt` se llama **dos veces por paso**
  (`_feetYAfter` y la vertical) y encima la usa el servidor por cada jugador.
- **Y sigue decidiendo por altura, no por tipo.** Si dos cajas se solapan gana
  la más alta, como ahora; no puede ganar «la que tenga superficie» o dos mapas
  se jugarían distinto según el orden en que se escribieron las piezas.

Con eso puesto, las cuatro son cortas:

**Plataforma de rebote.** En `_land`, si la pieza rebota, en vez de aterrizar se
llama a `_takeOff(fuerza)`. La parábola sigue resuelta **en forma cerrada**, así
que un rebote se comporta igual a 60 que a 240 Hz sin hacer nada — que es
justamente la propiedad que hay que no romper. Ojo a dos reglas que ya existen y
aquí hay que respetar: el rebote **no es un salto**, así que no gasta la
pulsación (`_jumpPressedAt`, vuelta 68) ni cuenta para la fatiga (vuelta 34) —o
rebotar tres veces dejaría al jugador sin impulso en la cuarta—, y la marcha
horizontal se conserva como en un encadenado, no se recalcula.

**Plataforma de velocidad.** Lo mismo, pero lo que se siembra es la velocidad
horizontal del vuelo (`_airVelX`/`_airVelZ`) en el rumbo que declare la pieza.
Aquí hay una decisión de producto que conviene tomar antes de construir: **si
respeta el techo del aire** (`airStrafeMaxSpeed`) o lo salta. Respetarlo la deja
inútil para lanzar de verdad; saltárselo abre un camino para pasar del techo sin
air-strafe, que es la técnica del juego. La propuesta es **respetarlo y subir el
techo desde el mapa**, que es la palanca que la vuelta 72 ya dejó abierta.

**Teletransportador de zona.** Es el más barato de los cuatro y no por poco: el
motor **ya sabe** teletransportar bien. `movement.reset()` sube `poseEpoch`, la
época viaja en la foto y el que dibuja al rival **no interpola por encima de
ella** (vueltas 44 y 50), así que un teletransporte cae en su instante exacto y
en un frame en vez de dibujarse como un barrido por medio mapa. Lo que falta es
el volumen de entrada, su pareja, y el rumbo con el que se sale —que lo declara
el destino, como `duelo.salidas` desde la 66: sin rumbo se sale mirando a la
pared del fondo—. Y el aviso de siempre: **no es una pieza**, es un área, así
que va con las marcas de la fase 3 y fuera de `occluders` y del presupuesto.

**Guardar punto y volver, por tecla.** Ésta **no es del mapa y no tiene
representación**, como decía el encargo, y por eso es la más fácil de todas y la
que más cuidado pide en un sitio concreto:

- Son **dos acciones más en `KEYBINDS`**, con su saneado y su invariante de que
  dos acciones no comparten tecla. Hay huecos reservados sin lógica desde la
  vuelta 27 (la 5 y la G), pero esto no es equipo: merece sus propias teclas.
- **Volver es un teletransporte**, o sea `reset()`-con-época, lo mismo que
  arriba.
- **Y el mapa tiene que poder no permitirlo.** En un duelo, guardar un punto y
  volver a él es teletransportarse a voluntad. Va como bandera del mapa
  —`bunnyHop: true`, o el nombre que se elija— y **el servidor la comprueba**,
  no el cliente: es la regla de la vuelta 64, lo que se puede tener lo decide el
  servidor.
- **Y guardar no es una entrada más del paso.** Si algún día esto se juega en
  red, «volver» **sí** tiene que ir en la máscara de entrada y sellado en su
  paso, como el salto y el agachado, o los dos extremos se separarían; se
  deduce del flanco de la máscara como el deslizamiento de la 69, sin campo
  nuevo en el protocolo.

---

## 3. El ventilador, y por qué se cae del grupo

Un ventilador es **empuje sostenido mientras estés dentro**, y eso choca con la
pieza más cuidada del movimiento:

> *El salto: la vertical **no se integra frame a frame**. Se guarda el estado del
> despegue y se evalúa la parábola —`y = y0 + v0·t − ½gt²`— desde `_airTime`.*

Una fuerza sostenida no es un número que se sume: es **una gravedad efectiva
distinta mientras se está dentro del volumen**. Eso se puede hacer sin perder la
forma cerrada —dentro del volumen la aceleración sigue siendo constante, así que
sigue siendo una parábola—, pero obliga a **re-anclar** la parábola en cada
cruce de frontera: al entrar, `y0` y `v0` pasan a ser los de ese instante, y al
salir otra vez. O sea: dos regímenes, dos re-anclajes y un instante de cruce que
hay que **despejar**, no detectar en el paso siguiente — porque detectarlo tarde
es exactamente el error de un paso que la vuelta 68 midió en el aterrizaje y
corrigió despejando la parábola.

No es difícil; es **delicado**, y su banco es una tabla de alturas a 60, 144 y
240 Hz que tiene que salir idéntica. Va con el hielo en la misma vuelta si se
quiere: son el mismo trabajo —«el modelo de a pie y el del aire ganan un
régimen»— en ejes distintos.

Y una nota de diseño que conviene decidir antes: el encargo pide «menos control
que el rebote». Eso sale solo de **no tocar la horizontal**: dentro del
ventilador el jugador sigue gobernando su aire con el modelo vectorial de
siempre, que a 0.78 u/s de `wishSpeed` es poquísimo comparado con la subida.
No hace falta inventar una penalización de control: hace falta **no darla**.

---

## 4. La tirolina: vuelta propia, y del tamaño del deslizamiento

Confirmado, y con la comparación medida. El deslizamiento de la vuelta 69 costó
**siete campos nuevos en `snapshot()`** (25 → 32), una forma cerrada propia para
que la distancia no dependiera del refresco, una regla de entrada por flanco y
otra de salida por cuatro caminos. Una tirolina es la misma forma de problema:

- **Un estado de movimiento nuevo**: enganchado, con la gravedad apagada, la
  dirección fija y la posición gobernada por un parámetro a lo largo de un
  segmento. Eso son, como poco, «enganchado», el cable, el parámetro y la
  velocidad: cuatro campos que viajan.
- **Y con forma cerrada**, o se rompe con el refresco. Si la tirolina acelera
  —que es lo que la hace divertida— lo que avanza un paso es **la diferencia de
  dos distancias**, no velocidad × delta, exactamente como el deslizamiento.
- **Y una salida que no regala marcha.** Es la regla de la 69: saltar de un
  deslizamiento no se lleva su empujón. Soltarse de una tirolina a 15 u/s con el
  techo del aire en 9.5 sería la misma puerta por otro sitio, y hay que decidir
  qué se conserva **antes** de construirla.

A eso se le suma lo que el encargo pide encima y **no es del movimiento**:

- **El aviso «Usa E» al acercarse**, con la ayuda activada. Los mensajes de
  ayuda ya existen (bajo la mira, y con su ajuste), así que esto es un canal que
  está puesto. Lo que hay que respetar es la regla de la acción contextual: **`use`
  es una sola acción**, y hoy significa dos cosas —desactivar el explosivo dentro
  de su radio, equipar el artilugio fuera—. Una tercera entra por la misma puerta
  y con la misma prioridad escrita, no con un `if` nuevo donde toque.
- **Y el aviso sale por proximidad, como la ficha flotante sale por apuntar**:
  se mide por distancia al cable, no con un rayo por frame.

---

## 5. El cilindro y el tubo: el cajón es el correcto, pero hay un premio

**El temor es correcto**: un cilindro *sólido* contra el que se choca es
exactamente la rotación libre por otra puerta. `resolveAxis` resuelve un eje
cada vez contra `minX/maxX/minZ/maxZ/bottom/top` y no hay orientación en ningún
sitio; una pieza curva se **dibujaría** curva, **pararía las balas bien** —el
rayo va contra la malla, no contra la AABB— y el jugador **chocaría contra su
caja envolvente**: andar contra aire en el hueco entre la curva y la caja.

Y hay que ver bien de dónde viene la asimetría, porque es lo que hace el fallo
invisible: **los disparos ya son exactos contra la geometría dibujada**
(`_superficieBajoElRayo`, vuelta 64), así que un tubo curvo se comportaría
perfectamente al dispararle y mentiría sólo al andar. Un mapa así no sale rojo
en ningún banco: se descubre cayéndose.

**El premio:** lo que el encargo pide de verdad —«estructura de cilindro/tubo
para descender»— **no necesita colisión curva**, y se puede construir hoy:

- **Un pozo por el que se baja** son cuatro, seis u ocho cajas finas puestas en
  anillo. Con ocho, la sección es un octógono y desde dentro no se distingue de
  un tubo: el jugador es un cilindro de 0.4 de radio y lo que nota es que no
  puede salirse, que es lo mismo. Es **composición**, que es la respuesta que la
  propuesta 05 §3 ya daba para los vanos.
- Y encaja con algo que el juego ya hace en otro sitio: **el volumen con el que
  se choca no tiene por qué ser el que se dibuja.** El jugador lleva desde la
  vuelta 65 chocando como un cilindro de 0.4 y **recibiendo disparos como su
  silueta**. Dibujar redondo y chocar octogonal es esa misma idea.

Lo único que no se puede hacer así es una superficie curva **por la que se
resbala o se rueda**. Eso es §6.

---

## 6. Qué implicaría resolver la colisión curva

Ésta era la pregunta grande, y merece una respuesta con su precio.

### 6.1 Lo primero: «curva» no es una cosa, son tres

| Nivel | Qué es | Qué cuesta |
|---|---|---|
| **(a) Giro de 90°** | Intercambiar ancho y fondo | **Gratis, y ya está** (vuelta 79: el aro del gizmo) |
| **(b) OBB** — caja con un giro libre en Y | Un rectángulo orientado | Reescribir la colisión horizontal entera |
| **(c) Convexa** — prismas de N lados, cuñas, tejados | Lo que de verdad hace falta para un tubo o un tejado | (b) más una función de altura y un formato nuevo |

Y hay un cuarto nivel que **no se propone y conviene descartar en voz alta**:
colisión analítica contra curvas de verdad (cilindros, esferas, splines). Nadie
la usa en un juego de este tipo; lo que se usa es **descomposición convexa** —un
cilindro *es* un prisma de doce lados— y por eso (c) es el techo razonable.

### 6.2 Qué habría que tocar, en concreto

Lo que hace esto acotado es que **la colisión está escrita una sola vez**:
`scenario.js` lo importan el juego, el editor y `net/partida.js` tal cual. No
hay tres implementaciones que sincronizar. Lo que hay es esto:

1. **`resolveAxis` deja de existir tal cual.** Hoy resuelve **un eje cada vez**,
   y ésa no es una optimización: es de donde sale que rozar un muro deslice en
   lugar de frenar en seco, y de donde salen las dos reglas escritas en
   `CLAUDE.md` —nunca se empuja hacia atrás, y no se compara contra la caja
   engordada—. Contra un polígono orientado eso se convierte en un **barrido de
   cilindro contra polígono convexo** (SAT con el radio del cuerpo como
   dilatación de Minkowski) resuelto de una vez para los dos ejes. Las dos
   reglas hay que volver a garantizarlas, y no salen solas.
2. **`groundHeightAt` necesita una función de altura por pieza.** Hoy es «¿cae
   el punto en la huella? pues su `top`». Con caras inclinadas es lo que ya
   hacen las rampas (`_rampHeightAt`), generalizado — y con la trampa que las
   rampas ya tienen documentada: el crédito de pendiente sólo cuenta si ya
   estabas encima.
3. **`giro180` deja de ser tres líneas.** Hoy girar media sala es mandar la
   esquina máxima al otro lado del origen. Con orientación hay que girar
   también el ángulo, y la simetría de El Espejo —que hoy **sale por
   construcción**— pasa a ser algo que hay que comprobar.
4. **El presupuesto se vuelve a medir, desde cero.** El número de hoy —1500
   piezas a 0.0004 ms por paso contra un presupuesto de 0.2— vale para AABB. Un
   SAT contra polígonos de N lados cuesta del orden de N veces más por pieza y
   por paso, y el barrido de mapa del editor (`ed76`) es el instrumento: hay que
   volver a pasar la escalera 0 → 600 → 1500 antes de creerse nada. **Y con la
   lección de la vuelta 76 puesta**: un paso no se cronometra en un navegador,
   se mide el total de dos mil y se divide.
5. **Y hay un riesgo de red que no es de rendimiento.** La predicción del
   cliente converge porque los dos extremos dan **los mismos pasos** con la
   misma aritmética. AABB son comparaciones y restas; SAT son productos
   escalares, normalizaciones y raíces. Sigue siendo determinista —el mismo
   código en los dos lados da el mismo doble— pero el margen para que un
   reordenamiento del compilador o una diferencia de motor JS produzca un bit
   distinto **se abre**, y el síntoma sería una corrección por paso contra una
   pared. Antes de esto hay que tener el banco que lo mida: `red45` con el mapa
   curvo delante y el error de reconciliación en cero.

### 6.3 El tamaño, y la recomendación

Puesto junto: **una vuelta entera del motor**, del orden de lo que costaron la
44 (paso fijo) o la 65 (hitbox de silueta) — no de lo que cuesta añadir un
panel—, con su banco de determinismo y su remedida de presupuesto. Y con una
dependencia que no se puede saltar: **la comprobación de levantarse debajo de
algo** (nota de la vuelta 69, `slide69` [9]) es anterior a todo esto, porque un
tejado sólido es precisamente una pieza con aire debajo.

La recomendación es **no hacerla todavía**, y es la misma que la propuesta 05
§3 ya dio para la rotación libre, ahora con un año más de mapas detrás:

> Construir dos o tres mapas con lo que hay —giro de 90°, composición, y las
> superficies del cajón del medio— y ver qué se echa en falta de verdad.

Con una condición que sí conviene poner por escrito ahora: **el día que se
haga, se hace entera (c) y no (b)**. Un OBB suelto resuelve el 20% de los casos
y paga el 90% del precio —la reescritura de la colisión horizontal— y luego hay
que volver a pasar por ahí para el tejado.

---

## 7. Orden propuesto

1. **El cimiento** (§2): que el suelo diga sobre qué estás. Sin esto no hay
   ninguna superficie, y con esto hay cuatro.
2. **Rebote, velocidad y teletransportador de zona**, con su formato, su saneado
   y sus marcas en el editor —arrastrables y con su flecha, que es la convención
   de la 78—. Una vuelta corta.
3. **Guardar punto y volver**, con su bandera de mapa y su comprobación en el
   servidor. Cabe en la misma vuelta o en media.
4. **Ventilador y hielo**, juntos: es una vuelta del **movimiento**, no del
   editor, y su entregable es una tabla a 60/144/240 Hz que sale idéntica.
5. **Tirolina**, vuelta propia, con el diseño escrito antes —qué marcha conserva
   al soltarse— como se hizo con el deslizamiento.
6. **Colisión convexa**, cuando dos o tres mapas digan que hace falta, y
   completa.

Y una regla que vale para los seis, porque es la que ha ido sosteniendo el
editor: **nada entra en el menú antes de que su colisión exista**. Un mapa con
una superficie que el motor no sabe resolver no es un mapa con una limitación;
es un mapa roto del que te enteras cayéndote.
