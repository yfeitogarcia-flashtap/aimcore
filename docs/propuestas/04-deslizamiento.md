# Propuesta 04 — Deslizamiento (*slide*)

**Estado:** diseñada, **sin construir nada**. El encargo (vuelta 68) fue
diseñarla «para cuando encaje en el roadmap» y dejar **una ventana hacia atrás
abierta**: poder revertirla si rompe el juego o si no sale de calidad. Este
documento es el diseño y esa ventana está en §6.

**Qué se pide:** lo que hacen Battlefield 6, Fortnite o Warzone — un jugador que
ya va rápido se tira al suelo, conserva la marcha un instante, se hace bajo y
sale de ahí corriendo o saltando.

---

## 1. Lo primero, porque cambia el encargo: **CTRL no se puede usar**

El encargo pide activarlo con **W + CTRL + SPACE**. Esa combinación concreta no
se puede montar, y no es una preferencia de estilo: es la convención de la
vuelta 27, que nació de un cierre de pestaña real.

> **Ninguna acción del juego se mapea a un modificador, y CTRL no agacha.**
> Agacharse avanzando era Ctrl+W, y **Ctrl+W cierra la pestaña** en Chrome y en
> Edge: el navegador resuelve ese atajo antes de que el evento llegue a la
> página, así que `preventDefault` no lo toca.

Y el gesto que se pide es exactamente ése: **W pulsada + CTRL**. O sea que el
primer deslizamiento de cada partida cerraría el juego. No hay forma de
arreglarlo desde el código —el atajo lo resuelve el navegador— y `estabilidad.mjs`
lo guarda desde entonces: ninguna tecla de `MOVEMENT.keys` puede ser un
modificador.

**Lo que se propone en su lugar**, que es el mismo gesto con la tecla que en
Vektor ya significa «agacharse»:

| | Gesto | Qué hace |
|---|---|---|
| **Entrar** | correr (W) y pulsar **C** | se desliza, si se va lo bastante rápido |
| **Salir antes** | soltar **C** | se levanta y sigue corriendo |
| **Cancelar saltando** | **SPACE** durante el deslizamiento | se levanta y despega (§4.3) |

Es el gesto de la industria (correr + agacharse) y **no añade ninguna tecla
nueva**: la acción `crouch` ya existe, ya es reasignable y ya tiene su fila en
opciones. SPACE entra como salida, que es la otra mitad de lo que el encargo
describe.

**La alternativa, si se quiere una tecla propia:** una acción `slide` nueva en
`KEYBINDS`, con su fila en el panel de controles y su valor de fábrica. Cuesta
una entrada en el mapa y la invariante de siempre (dos acciones nunca comparten
tecla). No se propone como primera opción porque una tecla más para un gesto que
ya tiene una es una tecla que aprenderse por nada — pero la puerta queda abierta
y no cambia nada de lo demás.

---

## 2. Qué es un deslizamiento, en números de esta casa

Las marchas de hoy: correr **6.5** u/s, andar 4.2, agachado 2.6, y el techo del
aire **9.5** (`airStrafeMaxSpeed`).

- **Entrada con empujón**: la marcha salta a `slide.boostFactor · carrera`. Con
  1.45 son **9.43 u/s**, que es justo por debajo del techo del aire. Ese anclaje
  es deliberado: **deslizarse es ir tan rápido como un air-strafe perfecto, pero
  en línea recta y pegado al suelo**. Así el techo de velocidad del juego sigue
  siendo uno solo y no hay que recalibrar nada de lo que cuelga de él (las
  pisadas, la dispersión de disparo por velocidad, el silbido).
- **Frena solo**, en línea recta: `v(t) = v0 − a·t`, acotada por debajo a la
  marcha de agachado. Con `durationMs` 700 y llegando a 2.6, la desaceleración
  sale de despejarla, no de teclearla: `a = (9.43 − 2.6) / 0.7 = 9.76 u/s²`.
- **Lo que avanza**: el área bajo esa recta, **4.2 u** — dos cuerpos y medio, o
  sea cruzar una puerta o salir de una tronera, no cruzar el mapa.
- **Enfriamiento** (`cooldownMs`, 1200): sin él, encadenar deslizamientos es un
  segundo modelo de movimiento en el que correr no se usa nunca.
- **Umbral de entrada**: `slide.minSpeedFactor · carrera` **con el peso del arma
  contado** (`weaponSpeedFactor`), que es exactamente la regla de las pisadas de
  la vuelta 63 — si no, con la Rift (5.88) no se podría deslizar y con la pistola
  sí, sin que nadie lo haya decidido.

**Y la altura no se inventa**: deslizarse es estar agachado, así que la altura de
ojos es `MOVEMENT.crouchHeight` y llega ahí por el mismo camino de siempre. De
eso sale gratis lo que importa: **el hitbox lo sigue** —`bodyHeightFor` y
`ZONE_BANDS` son la única definición del cuerpo desde la vuelta 65— y el avatar
se achata solo. No hay una segunda idea de «estar bajo».

---

## 3. Dónde vive, y por qué ahí

**En `src/game/movement.js`, dentro del paso fijo, y en ninguna parte más.**
No es una decisión de comodidad: es lo que hace que el duelo lo tenga gratis. El
motor es el mismo en los dos modos (vuelta 63) y el servidor importa
`movement.js` tal cual (vuelta 47), así que una mecánica de movimiento escrita
ahí la simulan el cliente y el servidor **con el mismo código**, que es el
requisito entero de la predicción.

Cuatro reglas de la casa que el diseño tiene que cumplir, y cómo:

1. **Todo el tuning en `config.js`.** Bloque `MOVEMENT.slide`, sin una sola
   constante suelta.
2. **Nada que dependa del refresco.** La velocidad del deslizamiento es una
   **forma cerrada** de `_slideTime`, como la parábola del salto: se evalúa, no
   se integra. Así un deslizamiento mide lo mismo a 60 que a 240 Hz aunque un
   día el servidor simule a otro ritmo.
3. **El reloj es el del mundo.** `_slideTime` avanza con el `dt` del paso, así
   que en pausa no corre y en red va en número de paso como todo lo demás.
4. **El bucle caliente no asigna.** Son tres números y un booleano.

### 3.1 Cómo viaja por la red **sin un campo nuevo en la entrada**

El salto necesitó su fracción de paso (`jt`) porque la ventana de encadenado mide
130 ms y redondear al paso costaba 16.7. **El deslizamiento no la necesita**: lo
que lo arranca es el **flanco de la tecla de agachado**, y esa tecla ya viaja en
la máscara de cada entrada. El flanco se deduce comparando la máscara del paso
con la del paso anterior, y los dos extremos ejecutan los mismos pasos con las
mismas máscaras, así que deducen el mismo flanco. Un campo menos en el protocolo
y un sitio menos donde discrepar.

Lo que **sí** hay que hacer: añadir los tres campos del deslizamiento a
`snapshot()`/`restore()` de `movement.js` (hoy 25). La regla está escrita: *si
añades algo al movimiento que sobreviva a un frame, añádelo también ahí*. Sin
eso, la reconciliación reejecuta entradas con el deslizamiento a medias y cada
foto trae una corrección.

---

## 4. Los tres sitios donde esto puede romper el juego

No son riesgos genéricos: son tres interacciones concretas con mecánicas que ya
están medidas.

### 4.1 El salto sale del deslizamiento con la marcha del deslizamiento

`currentSpeed` **congela la marcha al despegar** y en el aire ya no cambia. Si se
despega deslizándose a 9.43, se vuela a 9.43 — y el air-strafe puede seguir
subiendo hasta 9.5. O sea: **deslizarse y saltar sería la forma barata de llegar
al techo del aire**, que hoy cuesta tres encadenados bien hechos. Eso no es un
detalle de equilibrio, es tirar por la ventana la mecánica que más se practica.

**Cómo se cierra:** el despegue desde un deslizamiento siembra la marcha aérea
con **la de carrera**, no con la del deslizamiento (`slide.keepSpeedOnJump:
false`). El deslizamiento sirve para cruzar un hueco a ras de suelo, no para
ganar aire. El interruptor existe para poder probar lo contrario jugando; el
valor por defecto es el que protege lo que ya funciona.

### 4.2 Un jugador bajo y rápido es un jugador difícil de acertar

El hitbox es la silueta desde la vuelta 65, así que deslizarse **de verdad**
esquiva. Con los muñecos ya se sabe lo que pasa cuando el blanco se estrecha:
aciertan la mitad (14 de 54 contra 29 de 54). Un deslizamiento de 700 ms
atravesando un vano es una ventaja real y hay que medirla antes de decidir que es
la que se quiere.

**Cómo se acota:** no se puede disparar con precisión deslizándose. La dispersión
por velocidad ya existe (`ACCURACY.speedThreshold`) y 9.43 está muy por encima de
ella, así que **esto sale solo**: el que se desliza llega antes y llega sin
puntería. Conviene comprobarlo, no suponerlo.

### 4.3 Levantarse debajo de algo

Salir de un deslizamiento es volver a 1.7 de altura, y eso puede pasar debajo de
una caja. Hoy el agachado no comprueba nada al levantarse porque no hace falta:
nadie se agacha debajo de una `baja` y luego se levanta a 9 u/s. Con esto sí.

**Cómo se cierra:** si al acabar el deslizamiento hay techo, se sigue agachado
hasta que deje de haberlo — que es lo que hace cualquier juego con agachado y es
una comprobación de la geometría que `groundHeightAt` ya sabe hacer por el otro
lado. Es trabajo, y es el trozo menos bonito de la propuesta: conviene saberlo
antes de empezar y no a mitad.

### 4.4 Y una voz que hoy no existe

Un deslizamiento hace ruido, y del rival hay que oírlo. Hay una trampa anotada:
**el emisor del rival es hoy el de las pisadas**, con su radio de 16 u y su curva
propia. Un deslizamiento necesita **su propio emisor**; colgarlo de ése le pondría
un radio que no es el suyo.

---

## 5. Qué mediría que está bien (`slide69.mjs`)

Ninguna de estas afirmaciones se firma sin su número, y todas se miden a 60, 144
y 240 Hz:

1. **Mismo deslizamiento en cualquier monitor**: la distancia recorrida es la
   misma hasta el último decimal en los tres refrescos. Es la prueba de que es
   forma cerrada y no una integración.
2. **De parado no se desliza**: y el umbral se mide **con las tres armas**, o el
   peso lo convierte en una mecánica de la pistola.
3. **No se rompe el techo del aire**: 50 deslizamientos seguidos con salto al
   final y `_airSpeed` nunca pasa de 9.5.
4. **La silueta es el hitbox mientras se desliza**: el barrido de `hitbox65`
   otra vez, con el jugador deslizándose. Cero impactos fuera de la silueta.
5. **No se levanta dentro de una caja**: deslizarse bajo una `baja` y comprobar
   que el jugador sigue agachado mientras haya techo.
6. **En red, cero correcciones**: el banco de `red45` con el deslizamiento en la
   rotación de gestos. Si `snapshot()` se queda corto, esto es lo que lo caza.
7. **Coste**: p99 por paso, contra el presupuesto de 0.2 ms de la casa.
8. **Y el interruptor es de verdad un interruptor** (§6).

---

## 6. La ventana hacia atrás

Es la parte que el encargo pide expresamente, y se construye como ya se
construyó una vez: **`MOVEMENT.airVector` es el precedente exacto** — dos modelos
de aire conviviendo detrás de un booleano, con la medida de que el suelo es
idéntico en los dos.

- **`MOVEMENT.slide.enabled`, de fábrica en `false`.** Se construye apagado y se
  enciende para probarlo. Apagado, `_updateSlide` es un `return` en la primera
  línea y **no hay ningún otro sitio** que pregunte por el deslizamiento: ni el
  motor, ni el HUD, ni la red, ni el servidor.
- **No es un ajuste del jugador**, igual que `airVector`: no sale en el panel de
  opciones. Es un interruptor de prueba, y un jugador que pueda apagarle una
  mecánica a su partida es un jugador que juega a otro juego.
- **Lo que garantiza que se puede volver atrás es una medida, no una promesa**:
  con la bandera apagada, un paseo largo por el Plano A —el mismo banco que
  comparó los dos modelos de aire— tiene que acabar en **la misma coordenada
  hasta el último decimal** que antes de escribir una línea de esto. Si eso no
  sale, la mecánica se ha metido donde no debía y la ventana ya no existe.
- **Y revertir del todo es borrar un bloque de `config.js`, un método de
  `movement.js` y tres campos de `snapshot()`.** Nada más, porque no hay nada
  más: ésa es la razón de que §3 insista en dónde vive.

---

## 7. Lo que costaría

Dos vueltas, y conviene que sean dos:

- **Vuelta A — la mecánica, apagada.** `MOVEMENT.slide`, `_updateSlide`, los
  campos de `snapshot()`, la salida por salto y el techo al levantarse. Con el
  banco entero de §5 y la bandera en `false` al acabar.
- **Vuelta B — encenderla y calibrarla jugando.** Los números de §2 son un punto
  de partida, como los tres niveles de `ENEMY_DIFFICULTIES`: lo que decide si un
  deslizamiento dura 700 u 800 ms es jugarlo. Y aquí es donde se decide si se
  queda.

**Dependencia:** ninguna. No necesita cuentas, ni servidor nuevo, ni rondas. Se
puede coger cuando se quiera.

**Y una nota de orden**, que es de la casa: esto es una mecánica de movimiento, o
sea de lo que más se nota y lo más difícil de deshacer una vez que la gente lo
tiene en los dedos. La Fase 1 del roadmap —que la partida aguante una tarde— pesa
más que esto.
