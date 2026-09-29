# Propuesta 13 — Que disparar se sienta sin un arma en pantalla

**Estado:** **construida en la vuelta 106**, con las tres partes y todo su tuning
en `SENSACION` (`config.js`); lo medido y lo que cambió está en
`docs/decisions.md` §106.3. Escrita en la vuelta 105. El encargo: para la
beta el arma en pantalla se quita del menú, así que lo que un arma en la mano
cuenta al disparar (que ha salido una bala, cuánto patea y que se está
recargando) tiene que contarlo otra cosa, y **con coste bajo**. Se pidieron tres
ideas concretas y se contestan por orden. Al final, lo que se mediría para decidir.

Lo que ya existe y no se toca: **el sonido** (una voz por arma, vuelta 91), **el
retroceso que mueve la mira** (vuelta 61, no vuelve solo nunca) y **la marca de
impacto** (vuelta 64). Lo que falta es lo que se ve **en el borde de la vista**
en el instante del disparo, que es donde el ojo espera el arma.

---

## 1. Un fogonazo sutil en la parte baja de la pantalla

**Qué es**: un resplandor cálido y breve, abajo a la derecha (donde estaría la
boca del arma en la mano derecha), que se enciende con cada disparo y se apaga en
**60–80 ms**. No es una estrella ni un sprite de fuego: es **luz**, un degradado
radial que aclara el borde de la imagen. Por eso no promete un arma que no se ve.

**Cómo, y por qué es barato**:

- **Un elemento del DOM** con `radial-gradient`, encima del lienzo, y **sólo
  `opacity` animada**. El navegador lo resuelve en el compositor, sin tocar el
  dibujo de three ni la maquetación. Cero trabajo por frame cuando no se dispara.
- **Lo enciende el mismo aviso que el sonido** (`onShot`, que el motor ya llama
  en cada disparo). No hay un segundo camino que pueda desfasarse de la bala.
- **Del motor, con su propia hoja de estilos**, como la mirilla y el tajo (vueltas
  70 y 71), para que salga igual en el entrenamiento y en el multijugador.
- **Por arma, y lo declara el arma** (`WEAPONS[x].fogonazo`): intensidad y
  tamaño. La Pump y el Titan, más; la Volt, menos y más corto, porque a 800 RPM un
  destello largo es un parpadeo continuo. **Con silenciador, casi nada**: es la
  mitad de lo que el silenciador promete, y el fogonazo del rival ya se apaga con
  él. El cuchillo, las granadas y el arco no llevan: no disparan pólvora.

**Riesgo que hay que medir**: con fuego automático, diez destellos por segundo en
el borde de la vista pueden cansar. Por eso el techo de opacidad va bajo (≈0.35) y
el automático alterna intensidad: se juega con él puesto antes de dejarlo.

## 2. El retroceso de cámara, afinado

Hoy el retroceso es **una sola cosa**: el patrón que sube la mira y que el jugador
compensa (vuelta 61). Lo que un arma en la mano añade encima es un **golpe
visual**: la vista se sacude y vuelve, sin cambiar a dónde apuntas. La propuesta
es añadir ese golpe como **segunda capa, sólo de dibujo**:

- **Un empujón de la cámara que vuelve solo** (1–2 mm hacia atrás y ~0.3° hacia
  arriba, recuperado en ~90 ms), aplicado **en la pose de dibujo** y no en la
  mira. Va como la pose interpolada de la vuelta 44: se pone antes de `render()`
  y se quita después. Así **no contradice la regla de la 61**: la mira no vuelve
  sola, y este golpe no es la mira.
- **Un pellizco de campo de visión** (−1 %, vuelta en 70 ms), que es lo que en
  otros juegos se lee como «patada» sin mover nada de sitio.
- **Por arma**, de los números que ya tiene: el golpe escala con el primer paso
  de su patrón de retroceso, así que la Titan patea más que la Pulse sin escribir
  un número nuevo por arma.
- **Y con un interruptor en Opciones** (*Sacudida de cámara*), apagable, porque a
  quien juega a apuntar al milímetro puede molestarle. Es un ajuste del jugador,
  no de la partida (regla de la vuelta 92).

**Coste**: dos sumas en la pose de dibujo por frame; cero asignaciones.

## 3. La silueta del arma del HUD reacciona

La silueta de abajo a la derecha (vuelta 67) es **la única imagen del arma que
queda en pantalla**, así que es la que tiene que hacer lo que haría el arma:

- **Al disparar**: un retroceso de la silueta, 3–4 px hacia atrás y un poco hacia
  arriba, y vuelta en ~80 ms. Además, un brillo breve del trazo, en blanco y no en
  un color nuevo, porque la paleta no tiene tonos libres (vuelta 39).
- **Al recargar**: la silueta **se apaga y se llena** de atrás adelante en lo que
  dura la recarga (un `clip-path` que avanza), y en las de cartucho (Pump) un
  pequeño salto por cada uno. Hoy la recarga se dice con un rótulo; esto la
  convierte en algo que se ve de reojo sin leer.
- **En seco**: un temblor corto, a la vez que el clic del gatillo vacío.

**Cómo, y por qué no rompe la regla del HUD**: el HUD no repinta por frame (se
actualiza por refs). Esto son **clases que se ponen en un evento** (disparo,
empezar recarga, cartucho, seco) y animaciones CSS de `transform`, `opacity` y
`clip-path` que corre el navegador. No hay trabajo por frame ni estado de React
por disparo. La duración de la recarga ya la publica el motor.

---

## 4. Qué se mediría antes de decidir

1. **Coste**: el mismo frame con y sin las tres cosas, con fuego automático
   sostenido, por la misma escalera que las demás medidas (F3 en un PC de verdad,
   y en el contenedor con WebGL por software). El listón es que no se note: menos
   de 0.05 ms por frame, porque las tres son del compositor o dos sumas.
2. **Legibilidad**: capturas del mismo disparo sin nada, con cada una por
   separado y con las tres, al lado de una del juego con el arma holográfica (§5).
3. **Y que no tape**: el fogonazo no puede caer sobre el bloque de munición ni
   sobre la silueta. Se mide la caja de cada uno en las cuatro resoluciones de
   siempre, que es la regla de la vuelta 89 (estar en pantalla no es verse).

## 5. Orden propuesto

Primero **la silueta del HUD** (§3), que es la que más dice por menos. Detrás el
**fogonazo** (§1). La **sacudida de cámara** (§2) la última y con su interruptor,
porque es la única que toca la vista. Y las tres se juzgan **al lado del piloto
holográfico**: si el arma de contorno no gana claramente, estas tres son lo que
sustituye al arma, y el tema del arma en pantalla se cierra.
