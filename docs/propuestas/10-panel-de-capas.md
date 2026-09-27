# 10 — Panel de capas

**Estado:** **fase 1 construida en la vuelta 96**; fases 2 a 4 sin construir,
porque tocan el formato del mapa y eso es una decisión que hay que tomar
mirándola (§2.1). Escrita en la misma vuelta a petición del encargo: *«Panel de capas, como en Photoshop: una lista con todos los elementos
del mapa, con agrupar, bloquear (para no moverlos sin querer) y un ojo para
ocultar o mostrar cada uno en el editor mientras construyo. Si es grande,
decídnoslo y lo planificamos.»*

**Es grande**, y no por la cantidad de código: por **dos decisiones que hay
dentro** y que ninguna de las tres funciones pedidas puede esquivar. Las dos
están en §2, y de ellas sale el reparto en fases de §3. Lo que sí es barato —la
lista con el ojo— cabe en una vuelta y se puede hacer sin tocar el formato.

---

## 1. Qué hay ya, y qué parte del problema resuelve

No se parte de cero, y conviene decirlo porque cambia el tamaño de lo que falta:

- **Cada tipo tiene su lista en su hoja.** Los dispositivos desde la vuelta 81
  (era su segunda puerta: «colocar y encontrar son dos problemas, y el segundo se
  olvida»), los estampados desde la 93, las salidas desde la 78. Pinchar una fila
  elige el elemento y abre su ficha.
- **Y desde la vuelta 96 todo lo colocable se elige, se arrastra y se borra
  igual.** El clic llega a la pieza de verdad, los tiradores son de lo elegido y
  **Supr** borra lo que haya elegido, sea de qué tipo sea. Eso era la mitad de lo
  que un panel de capas viene a dar en otros editores: *dar con las cosas*.

Lo que sigue faltando, y es lo que el encargo pide:

1. **Una sola lista**, no una por hoja: hoy, para inventariar un mapa hay que
   pasar por cuatro pestañas y las cajas no salen en ninguna.
2. **El ojo**: dejar de ver una cosa mientras se construye detrás.
3. **El candado**: que no se mueva sin querer.
4. **Agrupar**: tratar diez piezas como una.

---

## 2. Las dos decisiones que hay dentro

### 2.1 Agrupar y bloquear necesitan **identidad**, y hoy no hay

Un elemento de un mapa **no tiene nombre**: se identifica por **su índice en su
lista** (`boxes[7]`, `estampados[1]`), y eso es lo que usan la selección
(`seleccion`, `marcaElegida.i`), los gizmos, el arrastre y el borrado. Un índice
es una posición, no una identidad: **borrar la pieza 3 renumera de la 4 hacia
abajo**, así que cualquier cosa que guarde «la pieza 7 está bloqueada» apunta a
otra pieza en cuanto se borra una de antes.

Eso deja tres caminos y hay que elegir uno antes de escribir nada:

- **(a) Un `id` por elemento, en el formato.** Es la solución de verdad y es la
  cara: `CAMPOS` y `sanearPieza` × once tipos, un generador de ids que no repita
  al duplicar (Ctrl+V, vuelta 93), y **los mapas de hoy no lo traen**, así que el
  saneado tiene que inventárselo al abrir — y entonces abrir y guardar un mapa
  **le cambia el fichero**, que es justo lo que la vuelta 95 se cuidó de que no
  pasara con el `giro` de un estampado. Y ojo con la vuelta 83: `sanearMapa` es un
  punto fijo **byte a byte incluido el orden de las claves**, porque de eso cuelga
  que deshacer/rehacer pueda comparar dos mapas con un `JSON.stringify`.
- **(b) Un `id` sólo en memoria del editor.** No toca el formato ni el fichero, y
  **no sobrevive a guardar**: guardar recarga la página desde la vuelta 75. O sea
  que los grupos y los candados se perderían en cada guardado, que es cada pocos
  minutos. Inservible para agrupar; **suficiente para el ojo**, que es estado de
  vista y nadie espera que dure.
- **(c) Grupos por convención de nombre.** No hay nombres. Descartado.

**Recomendación:** (b) para el ojo, ahora; (a) para grupo y candado, cuando se
decida pagarlo. Mezclarlas es lo que no vale: un candado que se olvida al
guardar es peor que no tener candado, porque promete lo contrario de lo que hace.

### 2.2 El ojo choca con que **las mallas están fundidas por tipo**

`Scenario` funde la geometría **por montón**, y la clave de un montón es
`kind|tinte` (vueltas 40 y 93). Eso es lo que hace que un mapa de mil quinientas
piezas cueste 0.0004 ms por paso: **todo un `kind` es una sola llamada de
dibujo**. La consecuencia para esto es directa: **no hay una malla por pieza que
apagar**. Tres caminos:

- **(a) Una malla por pieza.** Tira por la ventana la decisión de la 40 y con ella
  el presupuesto. Descartado.
- **(b) Montar el escenario con una copia filtrada del mapa.** `new Scenario(scene,
  mapaSinLoOculto)`. Es barato —`remontar` ya reconstruye el escenario entero en
  cada arrastre— y no toca ni el formato ni `Scenario`. Lo que se paga es que **el
  editor dibuja algo que no es el mapa**, o sea la convención de la vuelta 78 al
  revés («el dibujo sale del dato, no al revés»). Se admite porque un ojo *es*
  pedir ver menos, **con una condición**: que la barra de arriba lo diga (regla de
  la vuelta 77), porque si no, un mapa con media docena de piezas ocultas es un
  mapa que parece tener menos piezas de las que tiene — y eso se descubre
  probándolo, que es enterarse tarde (vuelta 67).
- **(c) Ocultar también su proxy y su gizmo.** Hace falta, no es opcional: una
  pieza invisible que sigue robando el clic es peor que una visible.

**Recomendación:** (b) + (c), con el aviso en la barra.

---

## 3. Fases

### Fase 1 — La lista, y el ojo — **HECHA** (vuelta 96)

- **Una hoja nueva en el raíl** («Capas»), con **todos** los elementos del mapa
  agrupados por tipo y contados: cajas, prismas, tubos, rampas, escaleras,
  estampados, ventiladores, tirolinas, teletransportes, salidas. Cada fila:
  su nombre corto, sus medidas, y **pinchar la fila elige el elemento** —que es lo
  que ya hacen las cuatro listas de hoy, unificado.
- **El ojo por fila y por tipo**, en memoria del editor. Oculta la pieza del
  dibujo (§2.2b), su proxy y su gizmo (§2.2c), y **no se guarda**: al recargar se
  ve todo. Es lo correcto para estado de vista y es lo que hace que la fase 1 no
  toque el formato.
- **La barra de arriba dice cuántas hay ocultas**, y con un botón de «ver todo».
- Lo que **no** entra: grupo y candado. Se dice en la hoja en vez de dejar dos
  botones apagados.

**Y lo que costó de verdad no fue el filtro: fue que `escenario` servía para tres
cosas.** De él colgaban el dibujo, **el denominador del presupuesto** y **la línea
de visión entre las dos salidas** de un mapa de duelo, así que montarlo filtrado
habría hecho que ocultar una pieza **bajara el presupuesto** y pudiera cambiar un
«SE VEN» por un «sin línea de visión»: dos instrumentos mintiendo por un ajuste de
vista, que es el fallo de la vuelta 67 metido en una medida.

De ahí sale la regla que se queda, y vale para cualquier cosa que se pueda
ocultar: **lo que se dibuja y lo que se mide son dos cosas.** `escenario` es el
que está en la escena y `escenarioMedido` el del mapa entero; **sin nada oculto
son el mismo objeto**, así que el camino normal no monta nada de más y no puede
divergir.

Y una trampa que cazó el banco y es la de la vuelta 83: `salidasDe()` **escribe en
el mapa** si no hay dos salidas —se las inventa—, así que leerlas desde una lista
que se pinta con el panel le habría añadido `duelo.salidas` a cualquier mapa que
se abriese, rompiendo de paso la comparación de deshacer/rehacer. La lista las lee
de `mapa.duelo.salidas` y sólo en un mapa de duelo.

Medido (`capas96`): tantas filas como elementos —las cajas incluidas, que no
salían en ninguna hoja—, pinchar una fila elige ese elemento, el ojo quita una
pieza del dibujo **y de lo pinchable** dejando el mapa igual, lo medido sigue
contando 14 contra las 13 dibujadas, y «ver todo» las devuelve y vuelve a hacer de
los dos escenarios **un solo objeto**.

### Fase 2 — Identidad *(una vuelta, y toca el formato)*

`id` por elemento, en `CAMPOS` y en el saneado de los once tipos, con las tres
cautelas de §2.1a: que no se repita al duplicar, que el saneado siga siendo un
punto fijo byte a byte, y **una decisión explícita sobre los mapas que ya están
en disco** — o se les pone `id` al abrirlos (y entonces el primer guardado
reescribe el fichero entero, lo que hay que decir antes de hacerlo), o el `id` se
escribe sólo cuando algo lo usa, que es la disciplina de la vuelta 83 y deja los
mapas de hoy byte a byte iguales mientras no se agrupe nada. **Lo segundo.**

### Fase 3 — El candado *(media vuelta, sobre la fase 2)*

`bloqueado: true` en el elemento, escrito sólo cuando vale `true`. Lo mira el
`pointerdown`: un elemento bloqueado **no se elige y no se arrastra**, y su fila
lo dice. Va en el fichero a propósito: un candado existe justo para sobrevivir a
cerrar el editor.

Y una regla que hay que respetar: **bloqueado no es oculto**. Se sigue viendo, y
eso es la mitad de para qué sirve — lo que se quiere es que esté delante y no se
mueva.

### Fase 4 — Grupos *(una vuelta, sobre la fase 2)*

`grupo: '<id>'` en el elemento y una lista de grupos en el mapa con su nombre. Lo
que hay que decidir al construirlo, y no antes: si mover un grupo mueve sus
elementos uno a uno (barato, y deshacer anota una vez) o si un grupo es un
objeto con su propio origen (más potente, y entonces las coordenadas de sus
elementos pasan a ser relativas — que es un cambio de formato mucho mayor y
**afecta al motor**, no sólo al editor). **Lo primero.**

---

## 4. Lo que esta propuesta no hace, a propósito

- **No añade nombres editables.** Un panel de capas de un editor de imagen los
  tiene porque una capa no tiene forma; aquí cada fila ya dice qué es y sus
  medidas, y pinchar la fila lo enseña en el mapa. Si hace falta, es un campo más
  en la fase 2.
- **No ordena por profundidad.** No hay orden de dibujo que elegir: la geometría
  se funde por tipo y el resto se ordena por distancia.
- **Y no toca lo que el juego lee.** Ni el ojo ni el candado ni el grupo cambian
  nada de lo que `Scenario` monta en una partida: son de quien construye.
