# Propuesta 09 — Disparar a través de una esquina

**Estado:** **diseñada y medida, sin construir nada.** El encargo (vuelta 95) fue:
que ciertas armas —Rift, Krakov, Titan y Reaper— atraviesen **las esquinas** de las
piezas y no su grosor completo, con daño reducido, resolviéndolo **por grosor
atravesado**: cada arma cruza como máximo tanto material. Y una instrucción que es
la mitad del trabajo: **«valorad cómo afecta al equilibrio de los mapas actuales
antes de activarlo»**.

Se ha valorado, con un barrido sobre los dos mapas de verdad
(`bancos/perfora95.mjs`), y la medida cambia la recomendación. Está en §1.

---

## 0. La respuesta corta

**El modelo propuesto es el correcto y el número que necesita es mucho más
pequeño de lo que parece.** «Por grosor atravesado» es exactamente la forma de
resolverlo, y de paso es casi gratis: el *slab test* de `cortarSegmento` (vuelta
85) **ya calcula la entrada y la salida** de cada caja y tira la segunda.

Lo que la medida dice es que **la ventana útil es estrecha y está abajo**:

| Umbral | Escondites del Plano A que dejan de esconder | Los de El Espejo |
|---|---|---|
| 0.5 u | **2.9 %** | **4.5 %** |
| 1.0 u | 8.6 % | 13.3 % |
| 1.5 u | **34.5 %** | 23.4 % |
| 2.0 u | 54.9 % | 37.8 % |

Y de ahí, dos cosas:

- **A 1.5 u se acaba el juego que hay hoy**: un tercio de los sitios donde uno se
  esconde en el Plano A deja de esconder. Eso no es una mecánica añadida, es otro
  mapa.
- **A 0.5 u la mecánica casi no existe** en el sentido del encargo — el 3 % de los
  escondites— y lo que sí hace es **ablandar el borde exacto de la cobertura**, que
  es una mecánica distinta y buena, pero no «atravesar la esquina de una caja».

Así que la propuesta son **dos fases, y la primera no es la global**:

| Fase | Qué | Efecto en los mapas de hoy |
|---|---|---|
| 1 | **La pieza declara que se atraviesa** (`perforable`), y el arma cuánto | **ninguno, por construcción** |
| 2 | El borde blando global, con umbral ≤ 0.45 u y su auditoría publicada | 3–5 % de los escondites |

---

## 1. La medida, y por qué cambia el diseño

### Qué se midió

Se recorren los puestos a nivel de suelo de cada mapa (231 en el Plano A, 462 en El
Espejo), se quedan las parejas a 20 u o menos en las que la víctima **no se ve hoy
desde ninguna de las tres alturas** —cabeza 1.7, pecho 1.2 y rodillas 0.4, con el
mismo `hasLineOfSight` que decide la brújula y la aparición— y para cada una se mide
el material que hay entre el ojo del tirador y el pecho de la víctima, **sumado
sobre todas las piezas**.

Son **13.206 parejas tapadas** en el Plano A y **8.039** en El Espejo. El
denominador está delante a propósito (vuelta 46): el porcentaje de la tabla es
«cuántos escondites dejan de esconder», no «cuántos tiros entran».

```
largoYPuerta: material entre ojo y pecho — mín 0.000, p5 0.25, mediana 1.68, p95 4.61
elEspejo:     material entre ojo y pecho — mín 0.000, p5 0.18, mediana 2.41, p95 5.05
```

### Lo que se aprende, y no se veía venir

**Una esquina no es «poco material».** La intuición del encargo es que un vértice
es un pellizco de caja y el cuerpo entero es una pared, y con un rectángulo eso es
falso: para pasar **de un lado al otro** de una caja hay que cruzar entera una de
sus dos bandas en planta, así que el material es **por lo menos su grosor**. Medido
contra la pieza más fina del Plano A (1 u × 14 u), rozando su vértice a 0.05, 0.1,
0.2, 0.4, 0.6 y 1.0 u de distancia: **1.000, 1.000, 1.000, 1.001, 1.003 y 1.008 u**.
El grosor no baja acercándose al vértice — sólo sube con el ángulo (1.15 u a 30°,
1.41 a 45°, 1.98 a 60°).

Dónde **sí** sale poco material es cuando la bala **roza y sale por el mismo lado**
por el que entró, o sea cuando la víctima estaba *a punto* de ser visible. Eso es lo
que el p5 de la tabla mide: 0.25 u en el Plano A y 0.18 en El Espejo.

Por eso el umbral no controla «esquinas sí o no»: controla **a cuántos centímetros
de ser visible empiezas a estar en peligro**. Es una mecánica real —le quita ventaja
a quien se pega al borde— pero no la del encargo, y conviene decirlo antes de
calibrar un número creyendo que se calibra otra cosa.

### Y el techo del umbral no es de gusto: lo pone el mapa más fino

**El Espejo y Los Pilares tienen cinco piezas de 0.50 u de grosor cada uno**, y once
de 1.0 u o menos de sus 31. Un umbral de 0.5 las atraviesa **de frente y enteras**:
no la esquina, la pared. Así que el tope del formato sale de ahí y no de una
sensación — **por debajo del grosor de la pieza más fina de cualquier mapa**, que
hoy son 0.5, o sea **0.45**.

Y como un mapa nuevo puede declarar una pieza de `PIEZA_MINIMA` (0.1 u), esto no
puede quedarse en un número: **el editor tiene que avisar** cuando el mapa que se
está dibujando trae una pieza más fina que el umbral, igual que avisa de una barrera
por debajo de un salto. Es la regla de la vuelta 67 aplicada a la geometría: quien
construye un tabique de 30 cm tiene que saber que es transparente para el Titan.

---

## 2. Lo que esto rompe a propósito, y hay que saberlo antes

Hoy en Vektor **«te puedo disparar» y «te veo» son la misma cosa**, y eso es
load-bearing en tres sitios. Esta mecánica los separa, y la separación tiene que ser
explícita o rompe los tres:

- **`hasLineOfSight` sigue siendo booleano y sigue siendo el único sitio que
  contesta «¿se ve eso desde aquí?»** (vuelta 42). De él cuelgan dónde nace un
  muñeco, la brújula y el destello de mira del Titan (vuelta 90). Si se convierte en
  una medida, un rival tras una esquina perforable pasa a tener brújula — o sea un
  detector de rivales, que es exactamente lo que ese marcador no puede ser.
- **La perforación es una función aparte** (`materialAtravesado`) que **sólo** llama
  la resolución de un disparo. Dos funciones que contestan a dos preguntas
  distintas, no una que contesta a medias las dos.
- **Y por eso el rival perforado no aparece marcado.** Matar a alguien a quien no
  ves y que no sale en tu pantalla es la promesa de esta mecánica; enseñarlo la
  convertiría en otra.

---

## 3. Fase 1 — La pieza declara que se atraviesa

### El dato

Un acabado de pieza, hermano de `barrera` (vuelta 95):

```js
{ x: -4, z: 6, w: 8, d: 0.6, kind: 'media', perforable: true }
```

Y un campo de arma, con el modelo del encargo intacto:

```js
titan:  { …, perforaMaterial: 2.0 },   // cruza casi cualquier tabique
krakov: { …, perforaMaterial: 0.9 },
rift:   { …, perforaMaterial: 0.7 },
reaper: { …, perforaMaterial: 0.6 },
```

### Por qué esto y no el umbral global

Cuatro razones, y la primera es la que contesta al encargo:

- **El efecto en los mapas de hoy es exactamente ninguno, por construcción.**
  Ninguna pieza de los seis escenarios declara `perforable`, así que no hay nada que
  auditar ni que recalibrar. Es la garantía que la fase 2 no puede dar.
- **Es lo que de verdad se pidió.** «La bala atraviesa la esquina de la caja» quiere
  decir que esa caja es atravesable; con `perforable` el creador pone un tabique de
  madera, una caja de embalaje o una valla, y **el grosor decide dentro de ese
  conjunto** — que es el modelo del encargo, sólo acotado a las piezas que lo piden.
- **Se puede aprender.** Con umbral global hay que aprender, pieza a pieza y ángulo
  a ángulo, cuánto material hay: nadie aprende eso. Con `perforable` se aprenden
  **dos** cosas: qué piezas son de tabique y qué arma las cruza. Y la segunda va en
  la ficha de la armería, que es donde la vuelta 90 puso `perforaArmadura` por el
  mismo motivo: es lo único que un arma hace que no se lee en sus números.
- **Y se ve.** Una pieza perforable **tiene que verse distinta**, o la mecánica es
  una trampa — la regla de la vuelta 80 con las superficies. Sin luces ni texturas,
  lo que queda es el borde y el rayado: se propone la arista **a trazos** y una
  retícula de líneas en la cara, con el generador de `grid.js`, que es el que ya
  dibuja la sala y la piel del avatar. El gris sigue diciendo el alto (vuelta 40) y
  el tinte sigue siendo del creador, así que el rayado es el único canal libre.

### Cómo se resuelve un disparo

El reparto de la vuelta 46, con un paso más al final:

1. **El corte contra el cuerpo** (`hitPlayer`), que es aritmética.
2. **`materialAtravesado`** sobre el segmento ojo→impacto, sumando sólo las piezas
   `perforable`. Si hay **una sola pieza no perforable** en medio, el disparo se
   para y no hay nada más que calcular.
3. Si el total pasa de `perforaMaterial`, se para. Si no, entra **con daño
   reducido**.

Y el daño baja por un factor, no por una curva: Vektor no tiene caída de daño con
la distancia (vuelta 70) y la escopeta demostró que la forma de no inventarse una
curva es **no escribirla** (vuelta 91). Un número por arma, aplicado **en
`encajarImpacto`**, que es el único sitio por el que pasan las cuatro formas de
hacer daño y donde ya vive `perforaArmadura` (vuelta 90).

Con una excepción que hay que decidir a la vista y no por omisión: **la cabeza no se
escala nunca** (vuelta 70), así que una bala perforante a la cabeza sigue matando.
La regla es correcta —la unidad letal sigue siendo un rayo, que es el matiz que la
vuelta 91 le puso— pero significa que un tabique no protege la cabeza en absoluto.
Es otra razón para que el conjunto de piezas perforables lo elija el creador.

### Qué se ve al perforar

**Dos marcas de bala y no una**: la de entrada y la de salida. Hoy una bala que falla
deja una estrella donde acabó (vuelta 64) y eso es lo único que dice por dónde se
fue; con perforación, **sin la marca de salida el tirador no puede aprender qué
atraviesa y qué no**. Es barato: `impacts.js` es un `InstancedMesh` de 24 ranuras.

Para la víctima no se añade nada. La cuña de daño ya dice de qué lado vino (vuelta
40), y «te han dado a través de eso» se aprende mirando lo que tienes delante. Un
aviso propio sería un cuarto canal para un caso particular.

### En red

**No viaja ningún número**, como la física de la vuelta 72: los dos extremos montan
el mismo mapa y derivan el mismo material. `materialAtravesado` va en
`net/disparo.js`, junto a `hitPlayer` y `perdigonDeSemilla`, que es donde ya vive lo
que llaman los dos — escrito dos veces sería una bala que el tirador ve entrar y el
servidor ve pararse.

Y **es más barato que lo que sustituye**: hoy esa pregunta la contesta un raycast
contra las mallas fundidas (`hasLineOfSight`), y `cortarSegmento` midió **0.62 µs
contra 12.8** para la misma geometría. Lo que no se puede dar por hecho es que diga
lo mismo, y eso es la lección de la vuelta 85: **un segundo camino que contesta la
misma pregunta no es duplicación si se compara con el primero** — así se encontró el
winding invertido de los prismas, que llevaba matando a través de las columnas desde
la 83.

### Los muñecos, que es la mitad que se olvida

Los muñecos disparan con un arma del catálogo (hoy la Rift) y comprueban cobertura
con el mismo reparto que el jugador. Si la Rift perfora, **los muñecos perforan**, y
eso es correcto por la convención de la vuelta 63 —una diferencia entre modos que
nadie decidió es un fallo de producto— pero significa que un tabique en un mapa de
entrenamiento deja de ser cobertura contra ocho muñecos a la vez. Hay que jugarlo
antes de dar `perforaMaterial` a la Rift, y por eso §5 propone empezar por el Titan.

---

## 4. Fase 2 — El borde blando global

Es el umbral global del encargo, y sólo tiene sentido con tres cosas puestas:

- **Umbral ≤ 0.45 u**, por debajo de la pieza más fina de cualquier mapa de hoy
  (0.50). Con eso ninguna pared se cruza de frente y lo que se ablanda es el borde:
  **2.9 % de los escondites del Plano A y 4.5 % de los de El Espejo**.
- **Su auditoría publicada y pasada de nuevo con cada mapa nuevo**
  (`bancos/perfora95.mjs`, que no afirma: mide, como `x8.mjs`). Un umbral sin
  esa tabla al lado es un número que nadie puede discutir.
- **Y el aviso del editor** cuando el mapa trae una pieza más fina que el umbral.

Lo que **no** se hace es subirlo «para que se note». La tabla dice qué se compra con
cada escalón, y el escalón siguiente (1.0 u) ya se lleva el 8.6 % y el 13.3 %. Si
jugándolo el borde blando no se nota, la respuesta no es 1.5: es que lo que hacía
falta era la fase 1.

---

## 5. Qué hacer primero

**El Titan, y sólo el Titan.** Es la única arma del arsenal donde esto es justo por
construcción, y el argumento es el de la vuelta 90 llevado un paso más: el Titan ya
mata en cualquier zona y a través de cualquier armadura, y eso se aceptó **porque se
puede ver venir** — su mirilla suelta un destello que el rival ve. Es el único arma
que **se delata antes de disparar**, así que es el único caso en que «te han matado a
través de una esquina» viene con un aviso previo.

Y paga tres precios antes de apretar: 2500 ms entre tiros, 4.88 u/s de marcha y 4700
en la tienda, que es el artículo más caro del catálogo.

Después, en este orden y midiendo entre medias:

1. **Reaper** (0.6 u), que ya atraviesa cascos y es un arma de una sola bala buena.
2. **Krakov** (0.9 u), que es la primaria difícil y cuyo sitio es premiar el dominio.
3. **La Rift, la última y con los muñecos jugados** — es el rifle por defecto, así
   que dársela no es añadir una mecánica: es cambiar a qué se juega de serie.

---

## 6. Lo que se deja fuera

- **Perforar a un jugador y seguir** (una bala que atraviesa dos cuerpos). Es otra
  mecánica con otro problema —a quién se le cobra el daño y en qué orden— y no se ha
  pedido.
- **Material por pieza** (madera, hormigón, chapa). Sería un vocabulario nuevo en un
  juego que no tiene texturas para distinguirlos: `perforable` sí o no es lo que se
  puede **ver**, y eso es el tope de lo que se puede pedir al jugador que aprenda.
- **Desgaste**: que un tabique se abra a tiros. Es geometría que cambia en partida,
  o sea colisión que cambia en partida, o sea el único sitio del que los dos extremos
  de una partida en red pueden discrepar sin que nada lo diga.
- **Caída de daño por material cruzado.** Es la curva que §3 se niega a escribir, y
  por la misma razón: ilegible, y con dos extremos que tienen que derivarla igual.
