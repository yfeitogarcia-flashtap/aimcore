/**
 * Escenarios con cobertura: geometría, colisión y anclajes de aparición.
 *
 * Un escenario se declara como datos en `SCENARIOS` (config.js) y este módulo
 * lo convierte en tres cosas que consume el resto del motor:
 *
 *  - **Mallas** para dibujar. Se fusionan por tipo de pieza, así que 20 cajas
 *    salen en 5 llamadas de dibujo y no en 20.
 *  - **Colisionadores**: una lista plana de AABB más las rampas, que se
 *    resuelven aparte porque no frenan y sí levantan el suelo.
 *  - **Anclajes** resueltos, con su metadato intacto.
 *
 * Sin luces ni materiales PBR, igual que el resto de la escena: `MeshBasicMaterial`
 * de color plano más una arista un tono por encima, que es lo que le da al
 * bloque su silueta contra el fondo negro.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COLORS, COVER, FANS, ROUNDS, SURFACES, TELEPORTS, ZIPLINES, claveDeEscenario, coverColor, coverEdgeColor, coverHeight, definicionDeEscenario, fisicaDeEscenario, fondoDeEscenario, scenarioRoom } from '../config.js'
import { bandaDePrisma, carasDePrisma, dentroDePrisma, envolventeDePrisma, puntosDePrisma } from '../maps/prisma.js'
import { cajasDeTubos } from '../maps/tubo.js'
import { crearFondo } from './backdrop.js'

/**
 * Prisma triangular para las rampas: rectángulo abajo y una única arista
 * arriba, en el lado alto. Se construye a mano porque `BoxGeometry` no hace
 * cuñas, y con `DoubleSide` para no depender del orden de los vértices.
 */
function buildRampGeometry(ramp) {
  const x0 = ramp.x
  const x1 = ramp.x + ramp.w
  const zLow = ramp.fromZ
  const zHigh = ramp.toZ
  const top = coverHeight(ramp.top)

  const a = [x0, 0, zLow]
  const b = [x1, 0, zLow]
  const c = [x1, 0, zHigh]
  const d = [x0, 0, zHigh]
  const e = [x0, top, zHigh]
  const f = [x1, top, zHigh]

  const tris = [
    a, b, c, a, c, d, // suelo
    a, b, f, a, f, e, // rampa
    d, c, f, d, f, e, // cara alta
    a, d, e, // costado x0
    b, f, c, // costado x1
  ]

  const positions = new Float32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    positions[i * 3] = tris[i][0]
    positions[i * 3 + 1] = tris[i][1]
    positions[i * 3 + 2] = tris[i][2]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * **La malla de un prisma convexo** (vuelta 83): tapa, fondo y una cara por
 * lado, a mano.
 *
 * A mano y no con `ExtrudeGeometry` por dos razones, y ninguna es el gusto: la
 * de three trae UVs, grupos y una tesela de tapa que aquí no se usan —y que
 * **impedirían fundirla** con las cajas, que es lo que mantiene el número de
 * llamadas de dibujo—, y el prisma es convexo, así que la tapa es un abanico
 * desde el primer vértice y no hay nada que triangular.
 *
 * Y los triángulos salen con el mismo bobinado que los de una caja, para que
 * `FrontSide` valga igual y una pieza girada no desaparezca vista de un lado.
 */
function geometriaDePrisma(prisma, bottom, thickness) {
  const puntos = puntosDePrisma(prisma)
  const top = bottom + thickness
  const n = puntos.length
  const tris = []
  // Tapa: abanico desde el primer vértice, visto desde arriba.
  for (let i = 1; i < n - 1; i++) {
    tris.push([puntos[0].x, top, puntos[0].z])
    tris.push([puntos[i].x, top, puntos[i].z])
    tris.push([puntos[i + 1].x, top, puntos[i + 1].z])
  }
  // Fondo: el mismo abanico al revés.
  for (let i = 1; i < n - 1; i++) {
    tris.push([puntos[0].x, bottom, puntos[0].z])
    tris.push([puntos[i + 1].x, bottom, puntos[i + 1].z])
    tris.push([puntos[i].x, bottom, puntos[i].z])
  }
  // Costados.
  for (let i = 0; i < n; i++) {
    const p = puntos[i]
    const q = puntos[(i + 1) % n]
    tris.push([p.x, bottom, p.z], [q.x, bottom, q.z], [q.x, top, q.z])
    tris.push([p.x, bottom, p.z], [q.x, top, q.z], [p.x, top, p.z])
  }
  const positions = new Float32Array(tris.length * 3)
  for (let i = 0; i < tris.length; i++) {
    positions[i * 3] = tris[i][0]
    positions[i * 3 + 1] = tris[i][1]
    positions[i * 3 + 2] = tris[i][2]
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  /**
   * **Y tiene que parecerse a una `BoxGeometry`, porque se funde con ellas.**
   *
   * Un prisma va al mismo montón que las cajas de su misma altura —para eso
   * está el montón, para que todo un `kind` sea **una** llamada de dibujo— y
   * `mergeGeometries` exige que todas traigan **los mismos atributos y el
   * mismo índice**. Una `BoxGeometry` trae `position`, `normal`, `uv` e
   * índice; ésta traía las dos primeras y ninguna de las otras dos, y la fusión
   * fallaba entera: **el montón de esa altura no se dibujaba**.
   *
   * No dio ningún error en pantalla — sólo una línea en la consola del
   * navegador, que es lo que `ed76` cuenta y por eso lo cazó. Las `uv` van a
   * cero porque aquí no hay texturas y el índice es la identidad, que es lo que
   * significa «triángulos sueltos» en una malla indexada.
   */
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tris.length * 2), 2))
  const indices = new Uint32Array(tris.length)
  for (let i = 0; i < tris.length; i++) indices[i] = i
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  return geometry
}

/** Acota un valor a un intervalo. El bucle de colisión lo usa por frame. */
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}

/**
 * Frena `to` contra la banda `[lo, hi]` de un obstáculo, viniendo de `from`.
 *
 * Nunca devuelve una posición **más metida** en la banda que `from`, y nunca
 * empuja hacia atrás: lo peor que puede pasar es quedarse donde se estaba.
 */
function clampAgainstBand(to, from, lo, hi) {
  if (to <= lo || to >= hi) return to
  if (from <= lo) return Math.min(to, lo)
  if (from >= hi) return Math.max(to, hi)
  // `from` ya estaba dentro de la banda: se impide hundirse más hacia la cara
  // que tiene más cerca, y salir por la otra sigue siendo libre.
  return from - lo <= hi - from ? Math.min(to, from) : Math.max(to, from)
}

/**
 * El hueco donde `bandaDePrisma` escribe. Temporal de módulo, como los vectores
 * del bucle caliente: se pregunta dos veces por paso y por jugador, por cada
 * prisma, y devolver un objeto sería basura para el recolector.
 */
const _banda = { lo: 0, hi: 0 }

/**
 * Un escenario ya montado. Mientras `key` sea `empty` no hay geometría, no hay
 * colisión y no hay anclajes: el motor se comporta exactamente como antes.
 */
export class Scenario {
  /**
   * @param {THREE.Scene} scene
   * @param {string|object} escenario una clave de `SCENARIOS` **o** la
   *   definición entera, que es como el editor monta un mapa que todavía no
   *   está en ningún catálogo (vuelta 74).
   */
  constructor(scene, escenario) {
    this.scene = scene
    this.key = claveDeEscenario(escenario)
    this.definition = definicionDeEscenario(escenario)

    this.group = new THREE.Group()
    this.materials = []
    this.geometries = []

    /** AABB de colisión: {minX, maxX, minZ, maxZ, bottom, top}. */
    this.boxes = []
    /**
     * **Prismas convexos** (vuelta 83): lo mismo con caras en vez de bandas.
     *
     * Van en su propia lista y no mezclados con `boxes` a propósito. Una caja
     * se resuelve con cuatro comparaciones y un prisma con N productos
     * escalares, así que fundirlos costaría lo segundo **en todos los mapas**,
     * incluidos los cuatro que no tienen ni uno. Con dos listas, un mapa sin
     * prismas recorre un bucle vacío y el camino de siempre no se entera —que
     * es lo que `curva83` mide dígito a dígito.
     */
    this.prismas = []
    /** Rampas: no frenan, sólo levantan el suelo. */
    this.ramps = []
    /** Mallas contra las que se comprueba la visibilidad de un punto. */
    this.occluders = []
    /** La superficie de la última consulta de suelo. Ver `superficieDelSuelo`. */
    this._superficieDelSuelo = null
    /**
     * Rutas ya resueltas. Cada una es un conjunto de puntos mutuamente
     * alcanzables en línea recta, y lleva la cuenta de cuántos muñecos patrullan
     * por ella ahora mismo.
     * @type {Array<{id: string, zone: string, requiresPeek: boolean, floorY: number, points: Array<object>, liveCount: number}>}
     */
    this.routes = []
    /**
     * Todos los puntos de todas las rutas, en plano. **No hay dos clases de
     * punto**: cualquiera de éstos vale para que aparezca un muñeco y para que
     * patrulle hacia él.
     */
    this.points = []

    /**
     * **El fondo panorámico vive aquí y no en quien dibuja** (vuelta 77), que
     * es lo que hace que salga igual entrenando, en el duelo y en el editor —
     * la convención de la vuelta 63—. Va **fuera de `this.group`** a propósito:
     * ese grupo es la geometría del mapa, y el fondo no es geometría del mapa.
     */
    this.fondo = crearFondo(scene, fondoDeEscenario(escenario), this.room)

    this._build()
    scene.add(this.group)
  }

  /**
   * Coloca el fondo donde toca. Lo llama quien dibuja, una vez por frame: es
   * una escritura de posición, sin reloj y sin estado.
   */
  /** ¿Este mapa trae decorado detrás de sus paredes? */
  get tieneFondo() {
    return Boolean(this.fondo)
  }

  seguirConFondo(camara) {
    this.fondo?.seguir(camara)
  }

  /** ¿Este escenario tiene cobertura, o es la sala vacía de siempre? */
  get hasGeometry() {
    return this.boxes.length > 0 || this.ramps.length > 0 || this.prismas.length > 0
  }

  /** Punto de aparición del jugador. */
  get spawn() {
    return this.definition.spawn
  }

  /**
   * **Las dos salidas de un duelo**, que es lo único que el servidor le pide a
   * un escenario además de su geometría (vuelta 66).
   *
   * Un mapa pensado para 1v1 las declara (`duelo.salidas`); cualquier otro cae
   * al reparto de antes —el spawn del jugador con 2.5 u a cada lado—, que no era
   * un reparto de sitios sino la forma de que dos jugadores no aparecieran uno
   * dentro del otro. Se queda como respaldo porque los bancos de netcode siguen
   * midiendo sobre el Plano A.
   */
  get salidasDeDuelo() {
    const suyas = this.definition.duelo?.salidas
    if (Array.isArray(suyas) && suyas.length >= 2) return suyas
    const spawn = this.definition.spawn
    return [
      { x: spawn.x - 2.5, z: spawn.z, yaw: 0 },
      { x: spawn.x + 2.5, z: spawn.z, yaw: 0 },
    ]
  }

  /**
   * **El corralito de la fase de compra, y lo dice el mapa** (vuelta 78).
   *
   * `duelo.cajaCompra` existe y se sanea desde la vuelta 77, y **nadie lo
   * leía**: `Partida._cajaDe` cogía `ROUNDS.cajaCompra` siempre, así que el
   * campo del editor era un control que el servidor ignoraba — el fallo de la
   * vuelta 67 por la puerta del formato. Se lee aquí, junto a las salidas, y
   * es seguro por lo mismo que la física de la 72: los dos extremos montan el
   * mismo mapa y derivan la misma caja **sin que viaje ningún número**.
   */
  get cajaCompraDeDuelo() {
    const suya = this.definition.duelo?.cajaCompra
    return suya?.ancho > 0 && suya?.fondo > 0 ? suya : ROUNDS.cajaCompra
  }

  /**
   * **La gracia con la que arranca una ronda** (vuelta 78), en milisegundos.
   *
   * Cero —lo que devuelve un mapa que no dice nada— es cómo se jugaba hasta
   * aquí: se abre la caja de compra y ya se puede matar. Un mapa donde las
   * salidas se ven, o donde se sale a campo abierto, puede pedir un respiro sin
   * que eso cambie el resto de los mapas.
   */
  get invulnerabilidadDeDuelo() {
    return this.definition.duelo?.invulnerabilidadMs ?? 0
  }

  /**
   * **Con qué se sale en este mapa, si es que no se compra** (vuelta 72).
   *
   * `sinEconomia` no es «la tienda cerrada» —eso era una fase de compra a
   * cero—: es que **no hay tienda**, ni dinero, ni elección de arma. Lo declara
   * el mapa y lo mira el servidor, que es quien reparte; el cliente se entera
   * por la bienvenida, como de todo lo demás de la sala.
   *
   * Devuelve `null` cuando el mapa sí tiene economía, que es lo que deja el
   * camino de siempre intacto sin un solo `if` extra en la partida.
   */
  get dotacionDeDuelo() {
    const duelo = this.definition.duelo
    if (!duelo?.sinEconomia) return null
    return duelo.dotacion ?? { arma: null, chaleco: false, casco: false }
  }

  /**
   * Sala de este escenario: la de `ROOM` salvo que traiga la suya. Es la
   * medida que consumen la grilla, los límites de movimiento, el acotado de
   * dianas y el tablero de acciones, así que **no hay dos versiones** del
   * tamaño de la sala que se puedan desincronizar.
   */
  get room() {
    // Contra `this.definition` y no contra la clave: un mapa recién dibujado en
    // el editor todavía no está en el catálogo, y preguntar por su nombre
    // devolvería la sala de la sala vacía (vuelta 74).
    return scenarioRoom(this.definition)
  }

  /**
   * **La física de este mapa** (vuelta 72): gravedad, impulso del salto y techo
   * del aire, con los de `MOVEMENT` de valor por defecto. Sale de aquí por la
   * misma razón que la sala: **no hay dos versiones** que se puedan
   * desincronizar, y el servidor la deriva del mismo dato que el cliente sin
   * que viaje ningún número.
   */
  get fisica() {
    // Contra la definición, por lo mismo que la sala: preguntar por el nombre
    // le devolvería a un mapa sin guardar la gravedad de fábrica, y eso es un
    // mapa que se prueba con una física que no es la suya.
    return fisicaDeEscenario(this.definition)
  }

  /**
   * Sitios posibles del explosivo. Vacío en los escenarios que no tienen
   * objetivo, que es como la sala vacía se queda sin él sin ningún caso especial.
   */
  get objectiveSites() {
    return this.definition.objectiveSites ?? []
  }

  /**
   * Recogibles curados: vida, escudo y casco. Vacío en la sala vacía, que es
   * como se queda sin ellos sin ningún caso especial, igual que con el explosivo.
   */
  get pickupSites() {
    return this.definition.pickups ?? []
  }

  _build() {
    const definition = this.definition
    /** Geometrías agrupadas por tipo de pieza, para fusionarlas de una vez. */
    const byKind = new Map()

    /**
     * **Un mapa puede no traer geometría, y eso no puede tumbar la escena**
     * (vuelta 74). Los cuatro escenarios escritos a mano declaran siempre las
     * dos listas, así que hasta aquí daba igual; desde que un mapa puede venir
     * de un fichero, uno a medio escribir dejaba `definition.boxes` sin
     * definir y el `for` se llevaba por delante el montaje entero.
     */
    /**
     * **Un tubo es un objeto en el fichero y cajas en el motor** (vuelta 81).
     * Se despliega aquí, antes de construir nada, así que de esta línea hacia
     * abajo no hay nada que sepa que existe: la colisión, los oclusores, el
     * presupuesto y los disparos ven cajas alineadas a los ejes y ya está. El
     * porqué de desplegar en vez de escribirlas en el fichero, en
     * `src/maps/tubo.js`.
     */
    for (const box of [...(definition.boxes ?? []), ...cajasDeTubos(definition.tubos)]) {
      const height = coverHeight(box.kind)
      const bottom = box.base ? coverHeight(box.base) : 0
      const thickness = height - bottom
      if (thickness <= 0) continue

      this.boxes.push({
        minX: box.x,
        maxX: box.x + box.w,
        minZ: box.z,
        maxZ: box.z + box.d,
        bottom,
        top: height,
        kind: box.kind,
        // **Lo que la pieza te hace al pisarla** (vuelta 80), o `null`. Va en
        // la caja de colisión y no en una lista aparte porque la pregunta que
        // contesta es «¿sobre qué estoy?», y eso lo decide el mismo barrido
        // que decide a qué altura está el suelo.
        superficie: box.superficie ?? null,
      })

      /**
       * **Un dispositivo puede no tener malla** (vuelta 82). `invisible` le
       * quita la caja gris y le deja **todo lo demás**: se sigue pisando, se
       * sigue chocando y su marca se sigue dibujando encima, que es lo que
       * pedía un mapa de sólo velocidad donde la losa no tiene por qué verse.
       *
       * Lo que se paga, y va escrito en la ficha del editor porque no se
       * adivina: **las balas la atraviesan**. Los disparos van contra la malla
       * dibujada desde la vuelta 64, así que sin malla no hay contra qué
       * cortar y el tiro sigue hasta el suelo de debajo. Con la losa de 0.2
       * con la que nacen los dispositivos eso son 20 cm de diferencia en dónde
       * cae la marca de impacto; con una pieza alta sería una pared invisible
       * que no para balas, y por eso el editor lo avisa.
       */
      if (box.superficie?.invisible) continue

      const geometry = new THREE.BoxGeometry(box.w, thickness, box.d)
      geometry.translate(box.x + box.w / 2, bottom + thickness / 2, box.z + box.d / 2)
      if (!byKind.has(box.kind)) byKind.set(box.kind, [])
      byKind.get(box.kind).push(geometry)
    }

    /**
     * **Los prismas convexos** (vuelta 83). Cuatro lados es una caja girada y
     * de cinco en adelante un pilar de N caras; el motor los ve igual porque
     * los dos son la misma primitiva (`src/maps/prisma.js`).
     *
     * Las caras y la envolvente se calculan **aquí**, al montar, y de ahí no
     * se vuelven a tocar: lo que el bucle caliente lee son N normales ya
     * unitarias. Es la misma disposición que las cajas, que tampoco guardan
     * `x/w` sino `minX/maxX`.
     */
    for (const prisma of definition.prismas ?? []) {
      const height = coverHeight(prisma.kind)
      const bottom = prisma.base ? coverHeight(prisma.base) : 0
      const thickness = height - bottom
      if (thickness <= 0) continue

      this.prismas.push({
        caras: carasDePrisma(prisma),
        ...envolventeDePrisma(prisma),
        bottom,
        top: height,
        kind: prisma.kind,
        superficie: prisma.superficie ?? null,
      })

      if (prisma.superficie?.invisible) continue
      if (!byKind.has(prisma.kind)) byKind.set(prisma.kind, [])
      byKind.get(prisma.kind).push(geometriaDePrisma(prisma, bottom, thickness))
    }

    for (const ramp of definition.ramps ?? []) {
      const top = coverHeight(ramp.top)
      this.ramps.push({
        minX: ramp.x,
        maxX: ramp.x + ramp.w,
        minZ: Math.min(ramp.z, ramp.z + ramp.d),
        maxZ: Math.max(ramp.z, ramp.z + ramp.d),
        fromZ: ramp.fromZ,
        toZ: ramp.toZ,
        top,
      })
      if (!byKind.has('rampa')) byKind.set('rampa', [])
      byKind.get('rampa').push(buildRampGeometry(ramp))
    }

    for (const [kind, geometries] of byKind) {
      const merged = mergeGeometries(geometries, false)
      for (const geometry of geometries) geometry.dispose()
      if (!merged) continue

      // Por `coverColor` y no por la tabla a pelo: una altura en números
      // coge el gris de la del vocabulario más cercana (vuelta 76).
      const fill = coverColor(kind)
      const material = new THREE.MeshBasicMaterial({
        color: fill,
        side: kind === 'rampa' ? THREE.DoubleSide : THREE.FrontSide,
      })
      const mesh = new THREE.Mesh(merged, material)
      this.group.add(mesh)
      this.occluders.push(mesh)
      this.materials.push(material)
      this.geometries.push(merged)

      // Arista: mismo volumen, un tono por encima. Sin ella los bloques del
      // mismo gris se funden entre sí contra el fondo negro.
      const edgeGeometry = new THREE.EdgesGeometry(merged, 20)
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: coverEdgeColor(kind),
        transparent: true,
        opacity: COVER.edgeOpacity,
      })
      this.group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial))
      this.materials.push(edgeMaterial)
      this.geometries.push(edgeGeometry)
    }

    /**
     * **Los teletransportes del mapa** (vuelta 80): un área en planta con su
     * destino. No son geometría —ni colisionan, ni entran en `occluders`, ni
     * cuentan en el presupuesto—: lo único que hacen es que quien entre
     * aparezca en otro sitio.
     */
    this.teletransportes = definition.teletransportes ?? []
    /**
     * **Los ventiladores** (vuelta 83). Como los teletransportes: un volumen,
     * no geometría — fuera de `occluders`, fuera de la colisión y fuera del
     * presupuesto. Lo único que hacen es cambiar con qué gravedad se evalúa la
     * parábola de quien esté dentro.
     */
    this.ventiladores = definition.ventiladores ?? []
    /**
     * **Las tirolinas** (vuelta 83), ya masticadas: dirección unitaria y largo.
     *
     * Se precalculan **al montar** y no por consulta por la razón de siempre —
     * el enganche se pregunta una vez por pulsación, pero la raíz cuadrada de
     * un cable no cambia nunca y este módulo es el que sabe cuándo empieza el
     * mundo—. Y por lo mismo que la física de la vuelta 72: los dos extremos
     * montan el mismo mapa y derivan **los mismos** números sin que viaje
     * ninguno.
     */
    this.tirolinas = (definition.tirolinas ?? []).map((t) => {
      const dx = t.hasta.x - t.desde.x
      const dy = t.hasta.y - t.desde.y
      const dz = t.hasta.z - t.desde.z
      const largo = Math.hypot(dx, dy, dz) || 1
      return {
        ...t,
        dirX: dx / largo,
        dirY: dy / largo,
        dirZ: dz / largo,
        largo,
      }
    })
    this._pintarSuperficies()

    /**
     * **La zona de aparición del jugador queda fuera del grafo.** Cualquier
     * punto de ruta que caiga dentro se descarta al construir, con el radio del
     * muñeco de margen: no hay dónde aparecer ni a dónde patrullar, así que la
     * exclusión no depende de que alguien se acuerde de comprobar una distancia
     * al sembrar. Un escenario sin `spawnZone` no pierde nada.
     */
    /**
     * **Y pueden ser varias** (vuelta 66): un mapa de duelo tiene dos salidas y
     * por tanto dos bandas. Se normaliza a lista aquí, que es lo único que
     * cambia — el resto del sistema sigue preguntando `isInSpawnZone`.
     */
    this.spawnZone =
      definition.spawnZone == null
        ? []
        : Array.isArray(definition.spawnZone)
          ? definition.spawnZone
          : [definition.spawnZone]
    /** Cuántos puntos se han quedado fuera por caer en la zona de aparición. */
    this.excludedBySpawnZone = 0

    for (const definitionRoute of definition.routes ?? []) {
      const floorY = coverHeight(definitionRoute.y)
      const route = {
        id: definitionRoute.id,
        zone: definitionRoute.zone,
        /** ¿Obliga a asomarse a descubierto para tirarle? */
        requiresPeek: Boolean(definitionRoute.peek),
        /** Suelo sobre el que se apoyan sus puntos: 0 o la altura de la plataforma. */
        floorY,
        points: [],
        /** Cuántos muñecos patrullan por ella ahora mismo. */
        liveCount: 0,
      }
      for (const point of definitionRoute.points) {
        if (this.isInSpawnZone(point.x, point.z)) {
          this.excludedBySpawnZone += 1
          continue
        }
        route.points.push({
          id: point.id,
          route,
          zone: route.zone,
          requiresPeek: route.requiresPeek,
          floorY,
          position: new THREE.Vector3(point.x, floorY, point.z),
          occupied: false,
        })
      }
      // Una ruta que se queda con menos de dos puntos deja de ser una ruta: no
      // hay entre qué patrullar. Se descarta entera en vez de dejar un punto
      // suelto que se comportaría como un anclaje fijo.
      if (route.points.length < 2) continue
      this.routes.push(route)
      for (const point of route.points) this.points.push(point)
    }
  }

  /**
   * **¿Este punto cae en la zona de aparición del jugador?**
   *
   * Única fuente de verdad de la exclusión: la usa el propio constructor al
   * montar el grafo de rutas y la usan las auditorías. Un segundo cálculo en
   * otro sitio es cómo se desincronizan los dos.
   *
   * El rectángulo se declara **como las cajas** —esquina mínima más ancho y
   * fondo—, no por centro: son datos del mismo escenario y leerlos con dos
   * convenciones distintas es un error que no avisa. Y se engorda con el radio
   * del cuerpo (`COVER.playerRadius`), porque un punto justo en el filo es un
   * muñeco medio dentro.
   */
  isInSpawnZone(x, z) {
    const margin = COVER.playerRadius
    return this.spawnZone.some(
      (zone) =>
        x >= zone.x - margin &&
        x <= zone.x + zone.w + margin &&
        z >= zone.z - margin &&
        z <= zone.z + zone.d + margin,
    )
  }

  /**
   * **Una superficie que no se ve es una trampa** (vuelta 80).
   *
   * Vektor no tiene ni texturas ni luces, así que lo único que puede decir que
   * una caja no es una caja normal es **una marca dibujada encima**. Se pinta
   * con líneas —una geometría y un material para todas las del mapa—, va
   * **fuera de `occluders`** y no toca la colisión: ningún rayo le pregunta
   * nada y no cuesta un paso de mundo.
   *
   * Dos reglas de forma, que son las de siempre:
   *
   * - **Lo que distingue las tres es la forma, no el color** (vuelta 67): una
   *   flecha vertical lanza hacia arriba, una horizontal lanza hacia donde
   *   apunta, y un anillo es una puerta. Y el largo de las dos flechas **sale
   *   de la fuerza**, así que mirando el mapa se ve cuánto empuja cada una.
   * - **El color es el azul eléctrico** (`COLORS.electric`), que ya significa
   *   «energía» —el escudo, sus cargas, el visor—. Es la segunda vez que un
   *   color de la paleta significa dos cosas, y se admite por lo mismo que la
   *   primera: no coinciden nunca. Un escudo es un icono del HUD y un objeto a
   *   la altura de la cintura; esto está pintado en el suelo, bajo los pies. Lo
   *   que **no** podía ser es ámbar (hay una bomba), rojo (te disparan),
   *   amarillo (te han visto) ni naranja (eso es una diana).
   */
  _pintarSuperficies() {
    /** Líneas: la hélice del muelle y los anillos de las puertas. */
    const lineas = []
    /** Triángulos: las franjas gruesas, que una línea no puede serlo en WebGL. */
    const caras = []

    const linea = (x1, y1, z1, x2, y2, z2) => lineas.push(x1, y1, z1, x2, y2, z2)

    /**
     * Un trazo **grueso** en horizontal, como dos triángulos. Es el ladrillo de
     * todas las franjas: un galón son dos de éstos y la base de un muelle son
     * los lados de su polígono.
     */
    const trazo = (x1, z1, x2, z2, y, grosor) => {
      const dx = x2 - x1
      const dz = z2 - z1
      const largo = Math.hypot(dx, dz)
      if (largo < 1e-6) return
      // Normal en planta, escalada a medio grosor.
      const nx = (-dz / largo) * grosor * 0.5
      const nz = (dx / largo) * grosor * 0.5
      const ax = x1 + nx, az = z1 + nz
      const bx = x1 - nx, bz = z1 - nz
      const cx2 = x2 - nx, cz2 = z2 - nz
      const dx2 = x2 + nx, dz2 = z2 + nz
      caras.push(ax, y, az, bx, y, bz, cx2, y, cz2)
      caras.push(ax, y, az, cx2, y, cz2, dx2, y, dz2)
    }

    /**
     * **Repite un dibujo por toda la cara de la pieza** (vuelta 82).
     *
     * Antes había una marca en el centro y ya. Con una losa del tamaño del
     * suelo de un mapa —que es lo que la 82 abre— eso es un garabato en medio
     * de un descampado; con la repetición, un mapa entero de velocidad **se ve
     * como un mapa entero de velocidad**. El tope de repeticiones es para que
     * una losa de 200×200 no se convierta en seis mil dibujos: pasado el tope
     * se separa más, que degrada bien.
     */
    const porLaCara = (box, dibujar) => {
      const { paso, margen, maxRepeticiones } = SURFACES.marca
      const w = box.maxX - box.minX - margen * 2
      const d = box.maxZ - box.minZ - margen * 2
      if (w <= 0 || d <= 0) {
        // Una losa más pequeña que el margen se lleva un dibujo y en su centro.
        dibujar((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, Math.min(
          box.maxX - box.minX, box.maxZ - box.minZ,
        ))
        return
      }
      let sep = paso
      let nx = Math.max(1, Math.round(w / sep))
      let nz = Math.max(1, Math.round(d / sep))
      if (nx * nz > maxRepeticiones) {
        // Se reparte el tope entre los dos ejes conservando la proporción.
        const escala = Math.sqrt((nx * nz) / maxRepeticiones)
        nx = Math.max(1, Math.round(nx / escala))
        nz = Math.max(1, Math.round(nz / escala))
        sep = Math.min(w / nx, d / nz)
      }
      const pasoX = w / nx
      const pasoZ = d / nz
      const escala = Math.min(1, Math.min(pasoX, pasoZ) / paso)
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          dibujar(
            box.minX + margen + pasoX * (i + 0.5),
            box.minZ + margen + pasoZ * (j + 0.5),
            escala,
          )
        }
      }
    }

    for (const box of this.boxes) {
      const sup = box.superficie
      if (!sup) continue
      const y = box.top + SURFACES.marcaY

      if (sup.tipo === 'rebote') {
        /**
         * **Un muelle**, que es lo que dice «esto te lanza» sin tener que
         * conocer el juego. La hélice va en líneas porque su gracia es la
         * forma, y la base va rellena para que se lea desde arriba — que es
         * desde donde se mira un suelo.
         */
        const m = SURFACES.marca.muelle
        const alto = Math.min(Math.max(sup.fuerza * 0.1, m.altoMin), m.altoMax)
        porLaCara(box, (cx, cz, escala) => {
          const radio = m.radio * escala
          const pasos = Math.max(6, Math.round(m.lados * m.vueltas))
          let px = cx + radio
          let pz = cz
          let py = y
          for (let k = 1; k <= pasos; k++) {
            const t = k / pasos
            const a = t * m.vueltas * Math.PI * 2
            const qx = cx + Math.cos(a) * radio
            const qz = cz + Math.sin(a) * radio
            const qy = y + alto * escala * t
            linea(px, py, pz, qx, qy, qz)
            px = qx; py = qy; pz = qz
          }
          // La tapa de arriba, que es lo que cierra la silueta del muelle.
          linea(px, py, pz, cx, py, cz)
          // Y el anillo de la base, grueso: la huella vista desde arriba.
          const lados = 8
          for (let k = 0; k < lados; k++) {
            const a = (k / lados) * Math.PI * 2
            const b = ((k + 1) / lados) * Math.PI * 2
            trazo(
              cx + Math.cos(a) * radio, cz + Math.sin(a) * radio,
              cx + Math.cos(b) * radio, cz + Math.sin(b) * radio,
              y, SURFACES.marca.galon.grosor * escala * 0.8,
            )
          }
        })
        continue
      }

      if (sup.tipo === 'hielo') {
        /**
         * **Un cristal**, que es lo que dice «esto resbala» sin leer nada. No
         * es una flecha ni un muelle a propósito: la regla de la vuelta 67 es
         * que lo que distingue los dispositivos es **la forma**, y un hielo no
         * te lanza a ninguna parte — no tiene dirección que dibujar.
         */
        const c = SURFACES.marca.cristal
        porLaCara(box, (cx, cz, escala) => {
          const r = c.radio * escala
          for (let k = 0; k < c.brazos; k++) {
            const a = (k / c.brazos) * Math.PI * 2
            trazo(cx, cz, cx + Math.cos(a) * r, cz + Math.sin(a) * r, y, c.grosor * escala)
          }
        })
        continue
      }

      if (sup.tipo === 'velocidad') {
        /**
         * **Galones gruesos hacia donde lanza.** El rumbo es el de una cámara
         * —mira a −Z con yaw 0—, así que la dirección es (−sin, −cos):
         * escribirlo al revés es el error de 180° de la vuelta 60.
         */
        const dx = -Math.sin(sup.rumbo)
        const dz = -Math.cos(sup.rumbo)
        // Perpendicular en planta.
        const px = -dz
        const pz = dx
        const g = SURFACES.marca.galon
        porLaCara(box, (cx, cz, escala) => {
          const l = g.largo * escala
          const a = g.ancho * escala * 0.5
          const tipX = cx + dx * l
          const tipZ = cz + dz * l
          // Las dos alas de la uve, cada una un trazo grueso.
          trazo(tipX, tipZ, cx - dx * l + px * a, cz - dz * l + pz * a, y, g.grosor * escala)
          trazo(tipX, tipZ, cx - dx * l - px * a, cz - dz * l - pz * a, y, g.grosor * escala)
        })
      }
    }

    /**
     * **Un ventilador se dibuja como lo que hace: flechas subiendo** (vuelta
     * 83, norma permanente de la 82). Van en varias capas de altura dentro del
     * volumen, para que se lea que el empuje ocupa un espacio y no una losa —
     * que es exactamente lo que lo distingue de un rebote—. Y la rejilla de la
     * planta sale de `FANS.marca.paso`, como los galones: un ventilador del
     * tamaño de media sala se ve entero.
     */
    for (const v of this.ventiladores) {
      const m = FANS.marca
      const nx = Math.max(1, Math.round(v.w / m.paso))
      const nz = Math.max(1, Math.round(v.d / m.paso))
      const pasoX = v.w / nx
      const pasoZ = v.d / nz
      const alto = Math.min(m.altoFlecha, v.alto / (m.capas + 1))
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const cx = v.x + pasoX * (i + 0.5)
          const cz = v.z + pasoZ * (j + 0.5)
          for (let k = 0; k < m.capas; k++) {
            const y0 = v.base + (v.alto * (k + 0.5)) / m.capas - alto / 2
            linea(cx, y0, cz, cx, y0 + alto, cz)
            for (const d of [-1, 1]) {
              linea(cx, y0 + alto, cz, cx + d * 0.2, y0 + alto - 0.3, cz)
              linea(cx, y0 + alto, cz, cx, y0 + alto - 0.3, cz + d * 0.2)
            }
          }
        }
      }
      // Y la huella al ras, para saber dónde acaba el empuje mirando el suelo.
      const x2 = v.x + v.w
      const z2 = v.z + v.d
      const y = v.base + SURFACES.marcaY
      linea(v.x, y, v.z, x2, y, v.z)
      linea(x2, y, v.z, x2, y, z2)
      linea(x2, y, z2, v.x, y, z2)
      linea(v.x, y, z2, v.x, y, v.z)
    }

    /**
     * **Una tirolina se dibuja entera: el cable, sus dos anclajes y su
     * sentido** (vuelta 83, norma permanente de la 82).
     *
     * Las tres cosas hacen falta y ninguna sobra. El **cable** es lo único que
     * dice que ahí arriba se puede ir a algún sitio; los **anclajes** dicen
     * dónde ponerse a la altura de la cabeza para engancharse, que es la
     * pregunta que se hace quien la ve por primera vez; y las **flechas**
     * dicen hacia dónde lleva, que en un cable de un solo sentido no es
     * decoración: sin ellas, la mitad de los que la usen la mirarán desde el
     * extremo equivocado.
     *
     * Va en líneas y no en franjas gruesas a propósito: una tirolina se mira
     * **desde lejos y contra el cielo**, y un trazo de dos triángulos visto de
     * canto desaparece — el grosor de una franja vive en el plano del suelo.
     */
    for (const t of this.tirolinas) {
      const m = ZIPLINES.marca
      const { x: x1, y: y1, z: z1 } = t.desde
      const { x: x2, y: y2, z: z2 } = t.hasta
      linea(x1, y1, z1, x2, y2, z2)
      // Los dos anclajes: una cruz en tres ejes, que se lee desde cualquier
      // ángulo sin ser una esfera de treinta triángulos.
      for (const p of [t.desde, t.hasta]) {
        const r = m.anclaje
        linea(p.x - r, p.y, p.z, p.x + r, p.y, p.z)
        linea(p.x, p.y - r, p.z, p.x, p.y + r, p.z)
        linea(p.x, p.y, p.z - r, p.x, p.y, p.z + r)
      }
      /**
       * **Y el sentido, repartido por el cable.** Una sola flecha en el medio
       * no se ve desde el extremo del que se sale, que es justo el sitio desde
       * el que hay que poder leerla.
       *
       * Los barbos salen del **plano perpendicular al cable**, no de los ejes
       * del mundo: un cable en diagonal con barbos en X daría una flecha
       * torcida. La perpendicular se saca contra el eje vertical, y contra el
       * X si el cable **es** vertical, que es el único caso degenerado.
       */
      let px = -t.dirZ, py = 0, pz = t.dirX
      let n = Math.hypot(px, pz)
      if (n < 1e-4) { px = 1; py = 0; pz = 0; n = 1 }
      px /= n; pz /= n
      // La otra perpendicular, para que la flecha tenga dos planos y no sea
      // una raya vista de canto.
      const qx = t.dirY * pz - t.dirZ * py
      const qy = t.dirZ * px - t.dirX * pz
      const qz = t.dirX * py - t.dirY * px
      for (let i = 1; i <= m.flechas; i++) {
        const d = (t.largo * i) / (m.flechas + 1)
        const cx = x1 + t.dirX * d
        const cy = y1 + t.dirY * d
        const cz = z1 + t.dirZ * d
        const bx = cx - t.dirX * m.flecha
        const by = cy - t.dirY * m.flecha
        const bz = cz - t.dirZ * m.flecha
        const a = m.flecha * 0.45
        linea(cx, cy, cz, bx + px * a, by + py * a, bz + pz * a)
        linea(cx, cy, cz, bx - px * a, by - py * a, bz - pz * a)
        linea(cx, cy, cz, bx + qx * a, by + qy * a, bz + qz * a)
        linea(cx, cy, cz, bx - qx * a, by - qy * a, bz - qz * a)
      }
    }

    // **Un anillo es una puerta.** Se pinta en el área de entrada y otro en el
    // destino: los dos se ven, porque llegar sin saber dónde has llegado es lo
    // mismo que no verlo salir.
    for (const tp of this.teletransportes) {
      this._pintarAnillo(lineas, tp.x + tp.w / 2, tp.z + tp.d / 2, Math.min(tp.w, tp.d) * 0.4)
      this._pintarAnillo(lineas, tp.destino.x, tp.destino.z, 0.9)
    }

    if (lineas.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3))
      const material = new THREE.LineBasicMaterial({ color: COLORS.electric })
      this.group.add(new THREE.LineSegments(geometry, material))
      this.geometries.push(geometry)
      this.materials.push(material)
    }

    if (caras.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(caras, 3))
      const material = new THREE.MeshBasicMaterial({
        color: COLORS.electric,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      })
      const malla = new THREE.Mesh(geometry, material)
      // **Fuera de los oclusores, como todo lo de esta función.** Si entrara,
      // sería una lámina que para balas a tres centímetros del suelo.
      this.group.add(malla)
      this.geometries.push(geometry)
      this.materials.push(material)
    }
  }

  /** Un anillo al ras del suelo, en segmentos. Sin malla: son líneas. */
  _pintarAnillo(puntos, cx, cz, radio, lados = 16) {
    const y = SURFACES.marcaY
    for (let i = 0; i < lados; i++) {
      const a = (i / lados) * Math.PI * 2
      const b = ((i + 1) / lados) * Math.PI * 2
      puntos.push(
        cx + Math.cos(a) * radio, y, cz + Math.sin(a) * radio,
        cx + Math.cos(b) * radio, y, cz + Math.sin(b) * radio,
      )
    }
  }

  /**
   * **El cable que tienes al alcance, o `null`** (vuelta 83).
   *
   * Se mide contra **los ojos** y no contra los pies: un cable se agarra con
   * las manos, y con los pies de referencia habría que ponerse debajo de él —
   * o sea justo donde no se ve—.
   *
   * Y devuelve un objeto, que en este proyecto siempre pide explicación: esto
   * **no es del bucle caliente**. Se pregunta una vez por pulsación de la tecla
   * contextual, no dos veces por paso y por jugador como el suelo (vuelta 80),
   * así que aquí no hay basura que evitar y sí un segundo valor —dónde has
   * enganchado— que devolver.
   *
   * Gana **el más cercano**, no el primero: con dos cables cruzándose, «el
   * primero de la lista» sería el orden en que se escribieron en el fichero.
   */
  tirolinaAlAlcance(x, y, z) {
    let mejor = null
    for (let i = 0; i < this.tirolinas.length; i++) {
      const t = this.tirolinas[i]
      // Proyección sobre la recta del cable, acotada al segmento.
      const vx = x - t.desde.x
      const vy = y - t.desde.y
      const vz = z - t.desde.z
      let d0 = vx * t.dirX + vy * t.dirY + vz * t.dirZ
      if (d0 < 0) d0 = 0
      else if (d0 > t.largo) d0 = t.largo
      // **Y si no queda cable por delante, no hay nada que enganchar.** Sin
      // esto, agarrarse en el extremo de llegada sería engancharse y soltarse
      // en el mismo paso, que es un ruido y un destello por pulsación.
      if (t.largo - d0 < 0.5) continue
      const px = t.desde.x + t.dirX * d0
      const py = t.desde.y + t.dirY * d0
      const pz = t.desde.z + t.dirZ * d0
      const dist = Math.hypot(x - px, y - py, z - pz)
      if (dist > ZIPLINES.alcanceU) continue
      if (!mejor || dist < mejor.dist) mejor = { i, d0, dist }
    }
    return mejor
  }

  /**
   * **A dónde lleva el área en la que estás, o `null`.** Es una comprobación de
   * caja en planta más la altura: un teletransporte es una puerta, no un techo,
   * así que sólo cuenta si los pies están dentro de su volumen.
   */
  teletransporteEn(x, z, feetY) {
    for (let i = 0; i < this.teletransportes.length; i++) {
      const tp = this.teletransportes[i]
      if (x < tp.x || x > tp.x + tp.w || z < tp.z || z > tp.z + tp.d) continue
      if (feetY < -TELEPORTS.alto || feetY > TELEPORTS.alto) continue
      return tp
    }
    return null
  }

  /**
   * **La fuerza del ventilador en el que estás, o 0** (vuelta 83).
   *
   * Es una comprobación de caja en planta más la franja de alturas, igual que
   * `teletransporteEn`. Se suman los que se solapen: dos ventiladores encarados
   * son un ventilador más fuerte, que es lo que espera quien los pone.
   *
   * Se pregunta **una vez por paso**, así que el bucle caliente sigue sin
   * asignar: no devuelve objeto, devuelve un número.
   */
  ventiladorEn(x, z, feetY) {
    let fuerza = 0
    for (let i = 0; i < this.ventiladores.length; i++) {
      const v = this.ventiladores[i]
      if (x < v.x || x > v.x + v.w || z < v.z || z > v.z + v.d) continue
      if (feetY < v.base || feetY > v.base + v.alto) continue
      fuerza += v.fuerza
    }
    return fuerza
  }

  /**
   * **Y hasta dónde llega el que estás usando**, para saber por dónde se sale.
   * Lo pide el cálculo del ápice: con la gravedad efectiva en negativo la
   * parábola no tiene máximo, y el máximo de verdad está **encima del
   * ventilador**, volando ya con la gravedad de siempre.
   */
  techoDeVentiladorEn(x, z, feetY) {
    let techo = -Infinity
    for (let i = 0; i < this.ventiladores.length; i++) {
      const v = this.ventiladores[i]
      if (x < v.x || x > v.x + v.w || z < v.z || z > v.z + v.d) continue
      if (feetY < v.base || feetY > v.base + v.alto) continue
      const t = v.base + v.alto
      if (t > techo) techo = t
    }
    return techo
  }

  /**
   * Altura del suelo bajo un punto.
   *
   * Para las **cajas** no hay nada que decidir: si el punto cae dentro de la
   * huella, lo que hay bajo los pies es su techo. Estar dentro de la huella de
   * una caja sólo puede pasar habiendo entrado por arriba —la colisión mantiene
   * el centro del jugador a un radio de cualquier cara—, así que tratarlas como
   * muro ahí no protegía de nada y sí dejaba un agujero: la horizontal admite el
   * paso cuando el techo queda a menos de un escalón de los pies, pero corre
   * **antes** que la vertical, y un frame de caída bastaba para que al llegar ya
   * no diese el escalón. El jugador se quedaba hundido dentro del cajón en vez
   * de aterrizar encima. Los dos sistemas tienen que admitir los mismos sitios.
   *
   * Para las **rampas** sí se mira el escalón: su huella es transitable de
   * verdad por la parte baja, y la cuña no puede levantar a nadie de golpe.
   *
   * @param {number} feetY altura actual de los pies, para decidir qué pisa
   */
  groundHeightAt(x, z, feetY) {
    let ground = 0
    const reach = feetY + COVER.stepHeight
    // **Y de paso se queda con la pieza que gana** (vuelta 80). Es una
    // asignación dentro del barrido que ya existe, así que el suelo sigue
    // costando lo mismo y el bucle caliente sigue sin asignar memoria: lo que
    // se guarda es la referencia a la superficie que ya está en la caja.
    let superficie = null

    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
      if (box.top <= ground) continue
      // **Y una pieza que empieza por encima de tu cabeza no es tu suelo**
      // (vuelta 83). Esto no estaba, y no hacía falta: hasta ahora ninguna
      // pieza tenía la base en el aire, así que `bottom` valía cero en todas.
      // Desde que un mapa puede declarar un dintel, sin esta línea pasar por
      // debajo de uno **te subía a su techo de golpe**: el suelo te daba 3.6
      // estando a 0.2. Es la otra mitad de la deuda de la vuelta 69, y la que
      // no estaba escrita en ninguna parte.
      if (box.bottom > reach) continue
      ground = box.top
      superficie = box.superficie
    }

    /**
     * **Un prisma se pisa igual que una caja** (vuelta 83), y con la misma
     * regla: dentro de su huella lo que hay bajo los pies es su techo, sin
     * mirar el escalón. Estar dentro de la huella de un sólido sólo puede
     * pasar habiendo entrado por arriba —la horizontal mantiene el centro a un
     * radio de cualquier cara— y los dos sistemas tienen que admitir los
     * mismos sitios, que es lo que ya valía para las cajas.
     */
    for (let i = 0; i < this.prismas.length; i++) {
      const prisma = this.prismas[i]
      if (x < prisma.minX || x > prisma.maxX || z < prisma.minZ || z > prisma.maxZ) continue
      if (prisma.top <= ground) continue
      if (prisma.bottom > reach) continue
      if (!dentroDePrisma(prisma.caras, x, z)) continue
      ground = prisma.top
      superficie = prisma.superficie
    }

    for (let i = 0; i < this.ramps.length; i++) {
      const height = this._rampHeightAt(this.ramps[i], x, z)
      if (height === null || height > reach || height <= ground) continue
      ground = height
      // Una rampa no tiene superficie: lo que se pisa en ella es la cuña.
      superficie = null
    }

    this._superficieDelSuelo = superficie
    return ground
  }

  /**
   * **La superficie de la última consulta de suelo** (vuelta 80), o `null`.
   *
   * Sale por aquí y no como segundo valor de retorno porque el suelo se
   * pregunta dos veces por paso **y por jugador**, y devolver un objeto sería
   * basura para el recolector justo en el bucle caliente.
   *
   * A cambio hay una regla que respetar y es la única: **vale para la llamada
   * inmediatamente anterior**, la tuya. Quien lo lee lo hace en la línea de al
   * lado de su propio `groundHeightAt`, con la misma posición. Es la misma
   * disciplina que la pose interpolada de la vuelta 44 —vive lo que dura el
   * dibujado— aplicada a una consulta.
   */
  get superficieDelSuelo() {
    return this._superficieDelSuelo ?? null
  }

  /**
   * **El techo más bajo que hay encima de los pies, o `Infinity`** (vuelta 83).
   *
   * Esto es la deuda que la vuelta 69 dejó anotada y que `slide69` [9] llevaba
   * cuatro vueltas guardando: la colisión **sabe** pasar por debajo de algo
   * (`box.bottom >= headY`), pero nadie comprobaba que no te levantaras ahí
   * debajo. Hasta ahora no podía pasar porque ninguna pieza de ningún mapa
   * tenía la base en el aire; desde que el editor deja subirlas (vuelta 76) y
   * desde que hay prismas girados (ésta), sí.
   *
   * Se mide **en el centro del jugador**, como `groundHeightAt` y por lo mismo:
   * los dos sistemas tienen que admitir los mismos sitios, y mirar medio cuerpo
   * alrededor aquí sería más severo que el suelo de al lado.
   *
   * Y sólo cuenta lo que está **por encima de los pies**: una pieza cuya base
   * queda por debajo no es un techo, es donde estás metido, y tratarla como
   * techo dejaría al jugador aplastado dentro de su propio suelo.
   */
  techoSobre(x, z, feetY) {
    let techo = Infinity
    const suelo = feetY + 1e-4
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      if (box.bottom <= suelo || box.bottom >= techo) continue
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue
      techo = box.bottom
    }
    for (let i = 0; i < this.prismas.length; i++) {
      const prisma = this.prismas[i]
      if (prisma.bottom <= suelo || prisma.bottom >= techo) continue
      if (x < prisma.minX || x > prisma.maxX || z < prisma.minZ || z > prisma.maxZ) continue
      if (!dentroDePrisma(prisma.caras, x, z)) continue
      techo = prisma.bottom
    }
    return techo
  }

  /** Altura de una rampa en un punto, o null si el punto queda fuera de ella. */
  _rampHeightAt(ramp, x, z) {
    if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) return null
    const span = ramp.toZ - ramp.fromZ
    if (span === 0) return ramp.top
    let t = (z - ramp.fromZ) / span
    if (t < 0) t = 0
    else if (t > 1) t = 1
    return ramp.top * t
  }

  /**
   * Resuelve la colisión horizontal **en un solo eje**. Llamarla una vez por
   * eje —primero X con la Z vieja, luego Z con la X ya corregida— es lo que
   * hace que rozar un muro deslice en lugar de frenar en seco.
   *
   * Dos reglas que vienen de bugs reales y siguen en pie: **nunca se empuja
   * hacia atrás** —sacar al jugador por la cara más próxima parece razonable
   * hasta que la caja es enorme: la plataforma del Balcón ocupa el ancho entero
   * de la sala, y a quien quedara dentro de su huella lo escupía cuarenta
   * unidades de golpe, contra la pared— y **a quien ya esté metido se le deja
   * salir**, por la cara que tenga más cerca.
   *
   * Las dos reglas salen de una sola cuenta. En cada eje la caja ocupa la banda
   * `[minA - radio, maxA + radio]` —la huella, engordada el cuerpo del jugador—
   * y lo único que se decide es si el paso **mete más** al jugador en ella:
   *
   *  - si el destino no toca la banda, no hay choque;
   *  - si venía de fuera, se frena en la cara por la que entraba;
   *  - si ya estaba dentro de la banda, no se le empuja: sólo se le impide
   *    hundirse más hacia la cara que tiene más cerca. Salir siempre se puede.
   *
   * Nada de esto compara la caja expandida con la posición de partida, que es
   * donde estaba el fallo: `from + radius > minA` parece equivalente a «ya
   * estaba dentro» y no lo es. Al frenar, `from` queda exactamente en
   * `minA - radius`, y sumarle el radio **no siempre devuelve `minA`** en coma
   * flotante — con la Media de x −1, −1.4 + 0.4 da −0.9999999999999999, mayor
   * que −1. El muro dejaba de bloquear al segundo frame de contacto y se entraba
   * andando. Pasaba en esa cara y no en las demás, que redondeaban al otro lado.
   *
   * Y la banda tampoco vale como «ya estaba dentro»: tras un salto se aterriza
   * rozando una pieza —el centro fuera, el cilindro dentro—, y tratar eso como
   * «dentro» abría la puerta de par en par. Por eso la regla no es «dentro o
   * fuera» sino «más adentro o no».
   *
   * @param {'x'|'z'} axis
   * @param {number} from posición en ese eje antes de moverse
   * @param {number} to posición propuesta
   * @param {number} other posición en el otro eje
   * @param {number} feetY altura de los pies
   * @param {number} headY altura de la coronilla
   * @returns {number} la posición admitida
   */
  resolveAxis(axis, from, to, other, feetY, headY) {
    const delta = to - from
    if (delta === 0) return to

    const radius = COVER.playerRadius
    const reach = feetY + COVER.stepHeight
    let resolved = to

    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i]
      // Ni suelo que se pisa ni techo bajo el que se pasa: sólo estorba lo que
      // corta a la altura del cuerpo.
      if (box.top <= reach || box.bottom >= headY) continue

      const minB = axis === 'x' ? box.minZ : box.minX
      const maxB = axis === 'x' ? box.maxZ : box.maxX
      if (other + radius <= minB || other - radius >= maxB) continue

      const lo = (axis === 'x' ? box.minX : box.minZ) - radius
      const hi = (axis === 'x' ? box.maxX : box.maxZ) + radius
      resolved = clampAgainstBand(resolved, from, lo, hi)
    }

    /**
     * **Y los prismas, que es una pasada más y no un `resolveAxis` nuevo**
     * (vuelta 83).
     *
     * Ésa era la condición que `CLAUDE.md` le ponía a esta vuelta —«un OBB
     * suelto resuelve el 20% de los casos y paga el 90% del precio, que es
     * reescribir `resolveAxis`»— y se cumple porque lo que un prisma aporta es
     * **su banda**, que es exactamente lo que una caja aporta: `lo` y `hi` en
     * el eje que se mueve. De ahí para abajo, la misma `clampAgainstBand` con
     * sus dos reglas de siempre (nunca empuja hacia atrás, a quien está dentro
     * se le deja salir).
     *
     * Un mapa sin prismas recorre un bucle vacío, así que el camino de las
     * cajas sigue costando lo que costaba — medido en `curva83`.
     */
    for (let i = 0; i < this.prismas.length; i++) {
      const prisma = this.prismas[i]
      if (prisma.top <= reach || prisma.bottom >= headY) continue

      // Descarte barato por la envolvente, antes de mirar N caras.
      const minB = axis === 'x' ? prisma.minZ : prisma.minX
      const maxB = axis === 'x' ? prisma.maxZ : prisma.maxX
      if (other + radius <= minB || other - radius >= maxB) continue

      if (!bandaDePrisma(prisma.caras, axis, other, radius, _banda)) continue
      resolved = clampAgainstBand(resolved, from, _banda.lo, _banda.hi)
    }

    // Las rampas también son sólidas. No estaban en `boxes` —sólo las usaba
    // `groundHeightAt`— así que no bloqueaban nada: se entraba andando dentro de
    // la cuña, de pie y agachado, y se salía por el otro lado.
    for (let i = 0; i < this.ramps.length; i++) {
      const ramp = this.ramps[i]
      const minA = axis === 'x' ? ramp.minX : ramp.minZ
      const maxA = axis === 'x' ? ramp.maxX : ramp.maxZ
      const minB = axis === 'x' ? ramp.minZ : ramp.minX
      const maxB = axis === 'x' ? ramp.maxZ : ramp.maxX
      if (other + radius <= minB || other - radius >= maxB) continue

      const lo = minA - radius
      const hi = maxA + radius
      if (resolved <= lo || resolved >= hi) continue

      // El punto de la cuña que el jugador pisaría, acotado a su huella. Se
      // mide en el **centro**, no en el borde del cilindro: `groundHeightAt`
      // decide el suelo por el centro, y si aquí se mirase medio cuerpo por
      // delante este test sería más severo que aquél — a pocos FPS el primer
      // paso dentro de la rampa veía ya 0.26 u de cuña y la declaraba muro,
      // dejando la subida bloqueada desde el primer escalón.
      const leadA = clamp(resolved, minA, maxA)
      const sideB = clamp(other, minB, maxB)
      const toX = axis === 'x' ? leadA : sideB
      const toZ = axis === 'x' ? sideB : leadA
      const fromX = axis === 'x' ? from : other
      const fromZ = axis === 'x' ? other : from
      if (!this._rampBlocks(ramp, toX, toZ, fromX, fromZ, feetY)) continue

      resolved = clampAgainstBand(resolved, from, lo, hi)
    }

    return resolved
  }

  /** Cuánto sube una rampa por unidad recorrida. */
  _rampSlope(ramp) {
    const span = Math.abs(ramp.toZ - ramp.fromZ)
    return span === 0 ? Infinity : ramp.top / span
  }

  /**
   * ¿La cuña `ramp` corta el cuerpo al ir de (fromX,fromZ) a (x,z)?
   *
   * La regla es **sólo por encima**: estorba cuando su superficie en el punto de
   * llegada sube por encima de lo que el jugador ya pisa más de lo que puede
   * subir en ese tramo — un escalón, más lo que la propia rampa gana de altura
   * en la distancia recorrida.
   *
   * Ese segundo término es lo que hace que subir la rampa **no dependa del
   * refresco**: a 60 Hz el paso es 0.11 u y la rampa gana 0.05, pero con el
   * delta máximo que admite el bucle el paso es 0.65 y gana 0.28, más que el
   * escalón. Sin el término, la rampa se volvía intransitable a pocos FPS.
   *
   * Pero **sólo cuenta si ya se está encima**: al entrar desde fuera no hay
   * crédito de pendiente. Si lo hubiera, este test sería más permisivo que
   * `groundHeightAt` —que no lo tiene— y se podría poner un pie en un punto de
   * la cuña que el suelo luego se niega a levantar: el jugador se quedaba
   * enterrado unos centímetros. Los dos sistemas tienen que admitir exactamente
   * los mismos sitios.
   *
   * Y el término de comparación es la altura de la rampa **donde está** el
   * jugador, no su altura de pies a secas — salvo que esté enterrado en ella,
   * en cuyo caso mandan los pies y no puede seguir hundiéndose.
   */
  _rampBlocks(ramp, x, z, fromX, fromZ, feetY) {
    const ahead = this._rampHeightAt(ramp, x, z)
    if (ahead === null) return false
    const under = this._rampHeightAt(ramp, fromX, fromZ)
    const supported = under !== null && under <= feetY + COVER.stepHeight
    const base = supported ? Math.max(feetY, under) : feetY
    const climb = supported ? this._rampSlope(ramp) * Math.abs(z - fromZ) : 0
    return ahead > base + COVER.stepHeight + climb
  }

  /**
   * ¿Acabar en (x,z) viniendo de (fromX,fromZ) dejaría el cuerpo dentro de una
   * cuña? La colisión se resuelve **un eje cada vez**, y eso valida cada eje con
   * la coordenada del otro a medias: una diagonal contra el costado de una rampa
   * podía colarse una fracción de paso por la esquina. Esto es el cierre: lo que
   * la resolución por ejes deje pasar, no se admite.
   */
  rampBlocksMove(x, z, fromX, fromZ, feetY) {
    for (let i = 0; i < this.ramps.length; i++) {
      if (this._rampBlocks(this.ramps[i], x, z, fromX, fromZ, feetY)) return true
    }
    return false
  }

  dispose() {
    this.fondo?.dispose()
    this.fondo = null
    this.scene.remove(this.group)
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.geometries.length = 0
    this.materials.length = 0
    this.occluders.length = 0
    this.boxes.length = 0
    this.ramps.length = 0
    this.routes.length = 0
    this.points.length = 0
  }
}
