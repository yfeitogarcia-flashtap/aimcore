/**
 * Vektor — configuración central del prototipo.
 *
 * Todo lo ajustable vive aquí: ningún valor de estos debería aparecer
 * hardcodeado en otro archivo. En una fase posterior, la pantalla de opciones
 * escribirá sobre estos mismos campos (sensibilidad, crosshair, duración...).
 */

/** Paleta. Sin texturas, sin sombras, sin post-procesado. */
export const COLORS = {
  /** Fondo de la escena. */
  background: '#0A0A0A',
  /** Líneas finas de la grilla (paredes). */
  grid: '#1C1C1C',
  /** Líneas de acento cada `ROOM.accentEvery` unidades: sistema de coordenadas. */
  gridAccent: '#2E2E2E',
  /** Grilla del suelo, ligeramente más presente para anclar la profundidad. */
  gridFloor: '#2B2B2B',
  gridFloorAccent: '#454545',
  /** Naranja FlickLAB. */
  target: '#E4462B',
  /**
   * Zonas de la diana "Hitbox completo". Mismo tono que el naranja base, sólo
   * cambia el brillo: la cabeza destaca y las piernas quedan apagadas, para
   * que las tres zonas se distingan de un vistazo sin salirse de la paleta.
   */
  targetHead: '#FF7A5C',
  targetLegs: '#A5321F',
  /** Flash/pop de la diana al ser acertada. */
  targetHit: '#FFFFFF',
  /**
   * **Negro de contorno.** No es el fondo: es el filo que separa una pieza de
   * lo que tenga detrás cuando las dos son claras. Lo usa el contorno de la
   * brújula, con la misma técnica que las aristas de la cobertura.
   */
  outline: '#000000',
  /**
   * **El fogonazo de un disparo enemigo**, y el segundo blanco de la paleta.
   * No reutiliza ninguno de los que ya significan algo —naranja las dianas, rojo
   * la amenaza, ámbar el explosivo, amarillo la detección— porque no es un aviso
   * codificado: es lo que hace un arma al dispararse, y eso es blanco. Que
   * coincida con el pop del acierto no estorba: uno sale donde disparas y el
   * otro donde te disparan, y nunca en el mismo sitio.
   */
  muzzleFlash: '#FFFFFF',
  /**
   * Verde FlickLAB. Color de marca para los botones de acción principal
   * —JUGAR, REANUDAR, REINICIAR— y, desde la vuelta 38, **la brújula de
   * orientación** sobre cada muñeco. Es el único sitio donde un color de la
   * paleta significa dos cosas, y se admite porque no coinciden nunca en
   * pantalla: los botones son de menú y la brújula es del mundo.
   */
  action: '#2FCB82',
  /**
   * Ámbar del explosivo. Cuarto color de la paleta, y añadido a regañadientes:
   * el marcador no puede ser naranja —se confundiría con una diana— ni verde
   * —eso es la interfaz accionable—, y en gris desaparecería contra la
   * cobertura. El ámbar se lee como peligro y no colisiona con nada.
   */
  objective: '#E8B33A',
  /**
   * Color del crosshair. Punto único de cambio: se publica como la variable CSS
   * `--crosshair-color` (ver src/ui/Crosshair.jsx) y nadie más lo referencia.
   */
  crosshair: '#EAEAEA',
  /**
   * **Azul eléctrico.** Un solo canal para todo lo que es carga: el escudo, sus
   * recargas por el suelo, el visor y el núcleo del avatar y sus líneas de luz.
   * No compite con nada de lo demás —el naranja es de las dianas, el ámbar del
   * explosivo, el verde de los botones— y por eso puede significar una cosa
   * sola en toda la pantalla.
   */
  electric: '#6FE0FF',
  /** Vida: blanco roto. La cruz del suelo y la barra del HUD, el mismo tono. */
  health: '#F2F2F2',
  /** Equipo sin carga: el casco. Gris frío, para que no se lea como cobertura. */
  gear: '#9AA3AA',
  /**
   * **Te ha visto y aún no dispara.** Amarillo de aviso, y **no** el ámbar del
   * explosivo (`objective`, #E8B33A) aunque se parezcan: el ámbar significa una
   * cosa concreta —hay una bomba— y los dos aparecen en el mundo, no en la
   * interfaz. Éste va más limón y más claro para que no se confundan de reojo.
   */
  alert: '#FFD23F',
  /**
   * **Te está disparando.** Rojo puro, y **no** el naranja de las dianas
   * (`target`, #E4462B): el icono sale justo encima de un muñeco naranja, y un
   * aviso del color de aquello sobre lo que se dibuja no es un aviso.
   */
  threat: '#FF2D1F',
}

/** Sesión cronometrada. */
export const SESSION_DURATION_S = 30

/** Cámara. FOV vertical; a 16:9 equivale a ~103° horizontales (referencia FPS). */
export const CAMERA = {
  fov: 71,
  near: 0.1,
  far: 200,
}

/**
 * Mira. `degreesPerCount` es la convención de los FPS clásicos (0.022°/count),
 * así que `sensitivity` se puede comparar de tú a tú con la de otros juegos.
 */
export const LOOK = {
  sensitivity: 1.5,
  degreesPerCount: 0.022,
  /** Tope de cabeceo para no dar la vuelta por arriba/abajo. */
  pitchLimitDeg: 88,
}

/**
 * Sala: suelo y cuatro paredes de líneas. Sin techo — mirar hacia arriba deja
 * ver el vacío, igual que en los aim trainers de referencia, y así el borde
 * superior de las paredes hace de horizonte limpio.
 */
export const ROOM = {
  width: 80,
  depth: 80,
  height: 16,
  /** Espaciado de la grilla, en unidades. */
  step: 1,
  /** Cada cuántas unidades se dibuja una línea de acento. */
  accentEvery: 5,
}

/**
 * Sala de un escenario. La de arriba es la de la **sala vacía**, que no se
 * toca; un escenario con cobertura puede traer la suya en `room` y entonces la
 * sala entera —grilla, paredes, límites de movimiento, acotado de dianas y
 * tamaño del tablero de acciones— se monta a esa medida.
 *
 * Es lo que hace que reducir un plano lo reduzca de verdad: acercar la
 * cobertura dentro de los mismos 80×80 sólo deja un anillo de suelo vacío
 * alrededor por el que se sigue pudiendo caminar, y recorrer el mapa cuesta lo
 * mismo. El límite de la sala **es** el límite jugable.
 */
export function scenarioRoom(key) {
  const definition = SCENARIOS[key]
  return definition && definition.room ? { ...ROOM, ...definition.room } : ROOM
}

/** Dianas. */
export const TARGET = {
  /** Radio por defecto. El ajuste "tamaño de diana" escribe sobre este valor. */
  radius: 0.45,
  /** Segmentos de las mallas: suficiente para que el borde no se vea facetado. */
  widthSegments: 24,
  heightSegments: 16,
  /**
   * Dispersión de la distancia alrededor del valor base elegido en opciones:
   * las dianas salen entre `base - spread` y `base + spread`.
   */
  distanceSpread: 2.5,
  /** Franja de alturas válidas: mantiene las dianas dentro de la zona jugable. */
  yRange: { min: 1.0, max: 13.0 },
  /** Vida de cada diana. El daño por zona se descuenta de aquí. */
  maxHealth: 100,
  /**
   * Velocidad de las dianas en modo dinámico, en unidades por segundo. Es el
   * **valor por defecto** del ajuste `patrolSpeed`: el motor lee el del store,
   * no esta constante, para que el slider tenga efecto en caliente.
   */
  moveSpeed: 4.0,
  /**
   * Tiempo máximo persiguiendo un mismo destino antes de elegir otro. Sin
   * esto, un destino lejano daría carreras largas y previsibles en línea recta.
   */
  moveMaxSeconds: 2.5,
  /**
   * A qué ritmo gira un muñeco hacia donde quiere mirar, en grados por segundo.
   *
   * **No cambia nada de su comportamiento**: dispara igual mire donde mire, y su
   * cuerpo no gira —las piezas del hitbox son simétricas—. Es un dato, y lo lee
   * la brújula de `markers.js`. Va integrado a ritmo acotado y no puesto de
   * golpe porque una brújula que salta 180° en un frame no se lee, se pierde.
   */
  turnRateDeg: 300,
  /**
   * **Prefijo del nick provisional** de un muñeco (`VK-01`, `VK-02`…). La ficha
   * flotante necesita un nombre y hoy no hay cuentas: el número es la ranura del
   * pool. Cuando existan identidades de verdad, lo que cambia es quién escribe
   * el campo, no quién lo lee.
   */
  nickPrefix: 'VK',
}

/**
 * Reglas de aparición propias del tipo "Hitbox completo".
 *
 * Un dummy humanoide de pie en el suelo pide otra distribución que una esfera
 * flotante: un abanico frontal mucho más ancho y, sobre todo, profundidad
 * variable. Con una distancia única todos acababan alineados en el mismo arco.
 *
 * Todo esto es horizontal —ángulo y distancia en X/Z—; la altura la sigue
 * poniendo el suelo.
 */
export const HITBOX = {
  /**
   * Semiángulo del abanico frontal, en grados. 55° hace un frente de 110°:
   * bastante más que los 36° de Clásica y Cono, pero sigue siendo frontal.
   * Se llama "half" por coherencia con `SPAWN.coneHalfAngleDeg`.
   */
  spawnConeHalfAngleDeg: 55,
  /**
   * Cada dummy sortea su propia distancia entre estas fracciones del valor
   * que marca el slider. Con el slider en 20: entre 12 y 28 unidades.
   */
  distanceScale: { min: 0.6, max: 1.4 },
  /** Suelo absoluto: por corto que quede el slider, nunca aparece encima. */
  minSpawnDistance: 8,
}

/**
 * Tipos de diana.
 *
 * Cada tipo se describe con piezas ("partes"). Todas las medidas —radio,
 * altura, desplazamiento vertical— van en **múltiplos del radio** elegido en
 * opciones, así que el slider de tamaño escala la figura entera sin tocar sus
 * proporciones.
 *
 * `damage` se descuenta de `TARGET.maxHealth`: con 100 de vida, 100 mata de un
 * disparo, 50 en dos y 34 en tres, y las combinaciones entre zonas salen solas.
 *
 * `anchor` decide dónde está el origen de la figura y, con él, cómo se coloca:
 *  - `'center'`: el origen es el centro. La altura sale del cono, así que la
 *    diana puede aparecer a cualquier altura.
 *  - `'feet'`: el origen es la base. La diana se apoya siempre en el suelo y
 *    el cono sólo decide su posición horizontal; los `offsetY` de sus piezas
 *    se miden desde el suelo hacia arriba.
 *
 * `spawn`, si está, sustituye las reglas de aparición generales de `SPAWN` y
 * `TARGET.distanceSpread` por las del propio tipo. Así el gestor de dianas no
 * necesita saber qué tipo es cuál: mira si hay perfil y lo usa.
 */
export const TARGET_TYPES = {
  classic: {
    label: 'Clásica',
    /** Distancia base al elegir este tipo. */
    defaultDistance: 15.5,
    anchor: 'center',
    /** Semialtura de la figura, en múltiplos del radio. Evita que atraviese el suelo. */
    halfHeight: 1,
    parts: [
      { zone: 'single', shape: 'sphere', radius: 1, offsetY: 0, damage: 100, color: COLORS.target },
    ],
  },
  cone: {
    label: 'Cono',
    defaultDistance: 15.5,
    anchor: 'center',
    halfHeight: 1.3,
    parts: [
      {
        zone: 'single',
        shape: 'cone',
        radius: 1,
        height: 2.6,
        offsetY: 0,
        damage: 100,
        color: COLORS.target,
      },
    ],
  },
  hitbox: {
    label: 'Hitbox completo',
    /** Aparece más lejos que los otros dos: acertar la cabeza tiene que costar. */
    defaultDistance: 20,
    /** De pie en el suelo, nunca flotando: es una figura humana. */
    anchor: 'feet',
    /** Abanico ancho y profundidad variable, en lugar de las reglas generales. */
    spawn: HITBOX,
    halfHeight: 2,
    // Proporciones humanoides medidas desde el suelo: con el radio por defecto
    // (0.45) la figura mide 1.8 unidades de alto y la cabeza 0.25 de diámetro.
    // `shape: 'body'` desde la vuelta 38: las tres zonas son **bandas de un
    // mismo perfil** (ver `AVATAR.body` y `src/game/body.js`), no una esfera,
    // una cápsula y un cilindro sueltos. El modelo de zonas no cambia —las
    // alturas, las alturas de corte y el daño son los de siempre—, cambia la
    // silueta, y cambia para los dos que la usan: la diana y el avatar.
    //
    // `radius` se queda aunque ya no dibuje nada: de él salen la altura total
    // (`offsetY + radius` de la cabeza) y el escalado de las zonas del jugador
    // en `player.js`.
    parts: [
      {
        zone: 'head',
        shape: 'body',
        radius: 0.278,
        offsetY: 3.723,
        damage: 100,
        color: COLORS.targetHead,
      },
      {
        zone: 'torso',
        shape: 'body',
        radius: 0.489,
        height: 1.556,
        offsetY: 2.667,
        damage: 50,
        color: COLORS.target,
      },
      {
        zone: 'legs',
        shape: 'body',
        radius: 0.356,
        height: 1.889,
        offsetY: 0.9445,
        damage: 34,
        color: COLORS.targetLegs,
      },
    ],
  },
}

/**
 * Pausa sin disparar que reinicia el patrón de retroceso. Cada ráfaga vuelve a
 * empezar por el primer disparo del patrón.
 */
export const RECOIL_RESET_MS = 200

/**
 * Panel de acciones rápidas: un tablero dentro de la sala que se acciona a
 * tiros, sin gesto para abrirlo.
 *
 * Se dibuja con CSS3DRenderer —es DOM de verdad colocado en el espacio— para
 * reutilizar la tipografía y el verde de marca sin repintarlos en WebGL. Va a
 * la derecha del punto de aparición, fuera del abanico de las dianas, y a una
 * altura desde la que se ve girando la cabeza sin buscarlo.
 *
 * **Hoy está apagado** (`enabled: false`). Las medidas se quedan enteras a
 * propósito: `clearVolume` sigue reservando su hueco y las auditorías del mapa
 * lo siguen comprobando, así que volver a encenderlo es cambiar este flag y no
 * encontrarse el tablero dentro de una caja.
 */
export const ACTION_PANEL = {
  /**
   * Si el tablero existe en el mundo. Apagado no entra en ninguna de las dos
   * escenas —ni DOM en 3D ni planos de impacto—, no se sigue al jugador ni se
   * maqueta por frame, y un disparo sobre su sitio es un disparo normal.
   */
  enabled: false,
  /** Tamaño del tablero en píxeles CSS. */
  widthPx: 1800,
  heightPx: 300,
  /**
   * Unidades de mundo por píxel CSS. Con la sala a 80 de ancho, la pared queda
   * lejos: el tablero tiene que ser grande para leerse desde el centro.
   */
  scale: 0.011,
  /** Altura del centro del tablero sobre el suelo. */
  height: 4,
  /**
   * Sala para la que están medidos `scale`, `distance`, `minDistance` y
   * `height`. En una sala más pequeña los cuatro se reducen en la misma
   * proporción (ver `actionPanelMetrics`): un tablero de 19.8 u de ancho en una
   * sala de 40 ocuparía media planta. Escalando, el tablero se ve **igual de
   * grande desde el jugador** —mismo ángulo, misma altura de mirada— en
   * cualquier sala, y con la de 80 salen exactamente los valores de siempre.
   */
  referenceRoomWidth: 80,
  /**
   * Distancia a la derecha del punto de aparición. El tablero se ancla al
   * spawn y no a una esquina de la sala: ahora que el jugador la recorre
   * entera, una coordenada fija podía quedar a medio mapa o en las narices.
   */
  distance: 18,
  /**
   * Nunca más cerca del jugador que esto. Si se acerca andando, el tablero se
   * aparta manteniendo la distancia en lugar de plantársele delante.
   */
  minDistance: 11,
  /** Separación respecto a la pared, para que no haga z-fighting con la grilla. */
  wallOffset: 0.6,
  /**
   * Antirrebote entre activaciones. Sin esto, mantener el gatillo sobre un
   * botón con un arma automática lo repetiría a 600 RPM.
   */
  cooldownMs: 280,
}

/**
 * Medidas del tablero de acciones en una sala concreta. Punto único: el panel,
 * la auditoría y cualquier comprobación de estorbo leen de aquí, así que no hay
 * dos versiones de la escala que se puedan desincronizar.
 */
export function actionPanelMetrics(room = ROOM) {
  const k = room.width / ACTION_PANEL.referenceRoomWidth
  return {
    scale: ACTION_PANEL.scale * k,
    distance: ACTION_PANEL.distance * k,
    minDistance: ACTION_PANEL.minDistance * k,
    height: ACTION_PANEL.height * k,
    halfSpan: (ACTION_PANEL.widthPx * ACTION_PANEL.scale * k) / 2,
    halfHeight: (ACTION_PANEL.heightPx * ACTION_PANEL.scale * k) / 2,
    maxX: room.width / 2 - ACTION_PANEL.wallOffset,
  }
}

/** Mensajes de ayuda del HUD. */
export const HELP = {
  /** Fracción del cargador por debajo de la cual se avisa de que toca recargar. */
  lowAmmoRatio: 0.2,
  /** Cuánto se queda en pantalla un aviso antes de irse solo. */
  messageDurationMs: 2600,
}

/**
 * Roster de armas.
 *
 * - `mode`: `'semi'` dispara una vez por click; `'auto'` dispara en continuo
 *   mientras se mantenga pulsado.
 * - `magazine`: balas por cargador; `reloadMs`, lo que tarda en recargarse.
 * - `supportsSuppressor`: si admite silenciador. Desde la vuelta 41 lo admiten
 *   las tres —cada una trae su silueta `ghost-<arma>`—, pero el campo se queda:
 *   lo que decide es el dato, no cuántas armas hay hoy.
 * - `rpm`: disparos por minuto. Fija el intervalo mínimo entre disparos, y en
 *   las semiautomáticas actúa además de tope por si se hace clic muy rápido.
 * - `weight`: **lo que pesa, en kilos**, y de ahí sale cuánto frena al que la
 *   lleva (`weaponSpeedFactor`). Va en kilos y no en un número abstracto de 0 a
 *   1 por dos motivos: se puede enseñar tal cual en la armería, y al añadir un
 *   lanzacohetes se sabe qué escribir sin tener que recalibrar la escala entera.
 * - `recoil`: patrón de retroceso, un `[pitch, yaw]` en **grados** por cada
 *   disparo consecutivo de la ráfaga. Son incrementos, no posiciones: el motor
 *   los va sumando. Pitch positivo sube, yaw positivo desvía a la izquierda.
 *   Agotado el patrón deja de acumularse: ese es el techo del arma. Un array
 *   vacío significa sin retroceso.
 *
 * Los números son un punto de partida con el carácter descrito; se calibran
 * jugando, igual que la sensibilidad o el tamaño de diana.
 */
export const WEAPONS = {
  'pulse': {
    label: 'Pulse',
    character: 'sin retroceso',
    /**
     * **La ranura en la que se lleva.** Es lo único que decide qué arma compite
     * por la tecla 1 y cuál va siempre en la 2: no hay una segunda lista de
     * armas principales en ningún sitio, se deriva de aquí (`PRIMARY_WEAPONS`,
     * `SECONDARY_WEAPON`). La Pulse es la pistola, y por eso **desapareció
     * del desplegable de arma principal**: se lleva siempre, elijas lo que
     * elijas, así que ofrecerla también como principal era ofrecer llevar dos
     * pistolas.
     */
    slot: 'secondary',
    mode: 'semi',
    rpm: 500,
    magazine: 18,
    reloadMs: 1200,
    supportsSuppressor: true,
    /**
     * Precisión que se considera "dominar esta arma". La puntuación normaliza
     * contra este número, así que exigir 85% con un arma sin retroceso pesa lo
     * mismo que exigir 40% con una que sacude: cada arma se juzga contra lo que
     * es razonable en ella, no contra un listón único.
     */
    precisionTarget: 0.85,
    /**
     * **Cuánto daño al cuerpo se come el escudo** cuando el que dispara lleva
     * esta arma, en tanto por uno. Fijo por arma y **sin variación por
     * distancia** todavía: es la primera versión de la mecánica. El escudo
     * cubre torso y piernas; la cabeza no, y por eso esto no la toca.
     */
    shieldAbsorb: 0.5,
    /**
     * **Peso, en kilos.** Una pistola: por debajo de `MOVEMENT.load.free`, así
     * que no frena nada. Que la que se lleva siempre no cueste velocidad es
     * deliberado — el coste lo paga la principal que elijas, que es la decisión.
     */
    weight: 1.1,
    // Arquetipo por defecto: se dispara exactamente como antes de que hubiera
    // armas. Sin patrón, no hay empuje de cámara en absoluto.
    recoil: [],
  },
  'rift': {
    label: 'Rift',
    character: 'rifle',
    /** Ver `slot` de Pulse. */
    slot: 'primary',
    mode: 'auto',
    rpm: 600,
    magazine: 30,
    reloadMs: 2300,
    // Desde la vuelta 41 **sí** lo admite: la referencia de Rift trae su
    // variante silenciada (`ghost-rift.png`) como las otras dos, así que ya no
    // hay ningún arma del arsenal sin silueta con silenciador.
    supportsSuppressor: true,
    /** Ver `precisionTarget` de Pulse. */
    precisionTarget: 0.5,
    /**
     * **Cuánto daño al cuerpo se come el escudo** cuando el que dispara lleva
     * esta arma, en tanto por uno. Fijo por arma y **sin variación por
     * distancia** todavía: es la primera versión de la mecánica. El escudo
     * cubre torso y piernas; la cabeza no, y por eso esto no la toca.
     */
    shieldAbsorb: 0.45,
    /**
     * **Peso, en kilos.** La más pesada del arsenal: es el rifle, y lo que se
     * paga por su cargador de 30 y su alcance es ir un 10% más lento que quien
     * sólo lleva la pistola.
     */
    weight: 3.6,
    // Subida vertical marcada durante los primeros ocho disparos —el pico está
    // en el cuarto— y a partir de ahí la vertical se apaga y el arma deriva
    // hacia la izquierda. Techo vertical ≈ 7.2°, deriva ≈ 2.6° a la izquierda.
    recoil: [
      [0.7, 0.02],
      [0.85, -0.03],
      [0.95, 0.04],
      [1.0, -0.02],
      [0.92, 0.05],
      [0.8, 0.08],
      [0.62, 0.14],
      [0.45, 0.22],
      [0.3, 0.3],
      [0.2, 0.34],
      [0.14, 0.36],
      [0.1, 0.34],
      [0.07, 0.3],
      [0.05, 0.26],
      [0.04, 0.22],
    ],
  },
  'volt': {
    label: 'Volt',
    character: 'SMG',
    /** Ver `slot` de Pulse. */
    slot: 'primary',
    mode: 'auto',
    rpm: 800,
    magazine: 25,
    reloadMs: 1800,
    supportsSuppressor: true,
    /** Ver `precisionTarget` de Pulse. */
    precisionTarget: 0.4,
    /**
     * **Cuánto daño al cuerpo se come el escudo** cuando el que dispara lleva
     * esta arma, en tanto por uno. Fijo por arma y **sin variación por
     * distancia** todavía: es la primera versión de la mecánica. El escudo
     * cubre torso y piernas; la cabeza no, y por eso esto no la toca.
     */
    shieldAbsorb: 0.35,
    /** **Peso, en kilos.** Un subfusil: entre la pistola y el rifle. */
    weight: 2.6,
    // Patada más inmediata que la del Rift —el primer disparo ya empuja más—
    // pero con la mitad de techo vertical (≈ 3.9°). El bamboleo lateral
    // alterna lado a lado y suma más recorrido que la vertical (≈ 4.4°), sin
    // deriva neta hacia ningún lado.
    recoil: [
      [0.8, -0.25],
      [0.75, 0.38],
      [0.62, -0.42],
      [0.48, 0.45],
      [0.35, -0.4],
      [0.25, 0.36],
      [0.18, -0.32],
      [0.12, 0.3],
      [0.09, -0.28],
      [0.06, 0.26],
      [0.05, -0.24],
      [0.04, 0.22],
      [0.03, -0.2],
      [0.02, 0.18],
      [0.02, -0.16],
    ],
  },
}

/**
 * **Los nombres viejos del arsenal, y a qué se llaman ahora.**
 *
 * En la vuelta 41 las tres armas cambiaron de nombre —Scalar-2 → Pulse, Axis-7
 * → Rift, Vertex-9 → Volt— sin tocar ni una estadística. El problema es que la
 * clave vieja está **guardada en el navegador de quien ya jugó**, y el saneado,
 * que no conoce esa clave, la tiraría al valor de fábrica: quien tuviera puesto
 * el Vertex-9 abriría el juego con el Rift y sin explicación.
 *
 * Así que se traduce antes de sanear. Es una tabla de renombrado, no un
 * catálogo: no añade armas ni opciones, sólo dice cómo se llamaba cada una.
 * `scalar-2` no está porque desde la vuelta 39 la pistola ya no era un valor
 * válido de este ajuste — ésa cae a fábrica como cualquier clave obsoleta.
 */
export const LEGACY_WEAPON_KEYS = {
  'axis-7': 'rift',
  'vertex-9': 'volt',
}

/**
 * **Las dos ranuras de equipo**, derivadas del `slot` de cada arma. No son una
 * segunda lista: si un arma cambia de ranura, cambia aquí sola.
 *
 * La **principal** es la que se elige en opciones y sale con la tecla 1; la
 * **secundaria** va siempre encima, sin elegirla, y sale con la 2. Que la
 * pistola no se elija es justo lo que la hace una pistola: es el arma con la
 * que te quedas cuando la principal está vacía o no es la adecuada para la
 * distancia, y para eso tiene que estar siempre.
 */
export const PRIMARY_WEAPONS = Object.fromEntries(
  Object.entries(WEAPONS).filter(([, weapon]) => weapon.slot === 'primary'),
)

/** La pistola, la única de su ranura. */
export const SECONDARY_WEAPON = Object.keys(WEAPONS).find(
  (key) => WEAPONS[key].slot === 'secondary',
)

/**
 * **Cuánto frena un arma por lo que pesa**, en tanto por uno sobre la marcha.
 *
 * Es la **única** fuente del efecto: lo usan el movimiento, para ir más lento, y
 * la armería, para decir cuánto. Dos cuentas separadas —una que frena y otra que
 * lo enseña— es como acabas con un panel que promete un 10% y unas piernas que
 * dan un 6%.
 *
 * La regla vive en `MOVEMENT.load`; aquí sólo se aplica.
 *
 * @param {number} weightKg lo que pesa el arma equipada
 * @returns {number} factor entre `MOVEMENT.load.minFactor` y 1
 */
export function weaponSpeedFactor(weightKg) {
  const load = MOVEMENT.load
  const over = Math.max(0, (Number.isFinite(weightKg) ? weightKg : 0) - load.free)
  return Math.max(load.minFactor, 1 - over * load.perKg)
}

/**
 * Variante con movimiento del jugador.
 *
 * `enabled` es el único interruptor: con `false` el prototipo se comporta
 * exactamente igual que la línea base de puntería pura (jugador clavado en el
 * centro y cono de aparición siguiendo la mirada). Con `true` se activan
 * teclado, salto y agachado, y el cono pasa a apuntar en una dirección fija
 * del mundo.
 */
/**
 * **Asignación de teclas: un solo bloque, una sola fuente de verdad.** De aquí
 * salen el movimiento, las acciones de arma, la acción contextual y las teclas
 * que todavía no hacen nada. Antes estaban repartidas entre `MOVEMENT.keys`,
 * `WEAPON_KEYS` y `OBJECTIVE.defuseKeys`, cada una con su formato.
 *
 * Cada acción tiene **una** tecla reasignable (`default`, y lo que el jugador
 * haya guardado encima) y, opcionalmente, `extra`: alternativas fijas que el
 * juego acepta y el panel no deja tocar. Las flechas y el Shift derecho están
 * ahí porque funcionaban desde la primera vuelta y quitarlos sería una pérdida
 * silenciosa; no son binds, son cortesías.
 *
 * - `reserved: true` — la tecla se reserva pero **no hace nada todavía**. Está
 *   aquí para que el mapa de controles sea el definitivo desde el principio y
 *   nadie se encuentre luego con que su bind favorito ya está cogido.
 * - `contextual: true` — la misma acción hace cosas distintas según el
 *   contexto. Es **una** acción bindable, no dos peleándose por la tecla.
 * - `pointer: true` — se asigna a un botón del ratón (`Mouse0`, `Mouse1`…).
 *
 * **Escape no está y no puede estar**: es la salida del pointer lock y la pausa,
 * y el navegador la resuelve antes que la página. El panel lo dice.
 *
 * Ojo con los modificadores: ninguna acción puede ir en Ctrl, Alt o Meta, ni en
 * una combinación con ellos. **Ctrl+W cierra la pestaña** y el navegador no deja
 * impedirlo — está contado en `docs/decisions.md` §27. El saneado y el panel lo
 * bloquean por separado.
 */
export const KEYBINDS = {
  forward: { label: 'Adelante', default: 'KeyW', extra: ['ArrowUp'], group: 'Movimiento' },
  back: { label: 'Atrás', default: 'KeyS', extra: ['ArrowDown'], group: 'Movimiento' },
  left: { label: 'Izquierda', default: 'KeyA', extra: ['ArrowLeft'], group: 'Movimiento' },
  right: { label: 'Derecha', default: 'KeyD', extra: ['ArrowRight'], group: 'Movimiento' },
  jump: { label: 'Saltar', default: 'Space', group: 'Movimiento' },
  crouch: { label: 'Agacharse', default: 'KeyC', group: 'Movimiento' },
  walk: { label: 'Caminar', default: 'ShiftLeft', extra: ['ShiftRight'], group: 'Movimiento' },

  shoot: { label: 'Disparar', default: 'Mouse0', pointer: true, group: 'Combate' },
  reload: { label: 'Recargar', default: 'KeyR', group: 'Combate' },
  cycleWeapon: { label: 'Cambiar de arma', default: 'KeyQ', group: 'Combate' },
  /**
   * **El silenciador se mudó a la V en la vuelta 42.** Tenía la B desde que
   * existía, y la B es la de la armería —la pidió el encargo y es la inicial del
   * panel—. El cambio no se puede hacer sólo aquí: la B del silenciador está
   * guardada en el navegador de quien ya jugó, y el saneado, que respeta lo
   * guardado, se la dejaría puesta y **dejaría la armería sin tecla** (la
   * invariante es que dos acciones nunca comparten tecla, y la que llega segunda
   * se queda sin asignar). Por eso está en `LEGACY_KEYBINDS`: es la misma idea
   * que `LEGACY_WEAPON_KEYS`, una tabla de lo que se movió.
   */
  suppressor: { label: 'Silenciador', default: 'KeyV', group: 'Combate' },
  /**
   * **La acción contextual.** Dentro del radio de algo con lo que se puede
   * interactuar —hoy sólo el explosivo— desactiva, y **nunca hace otra cosa ahí
   * dentro**: que la misma tecla saque un artilugio a un metro de la bomba es
   * como se pierden rondas. Fuera de ese radio equipa el lanzacohetes, que
   * todavía no existe.
   */
  use: { label: 'Usar / artilugio', default: 'KeyE', contextual: true, group: 'Combate' },

  // La 1 y la 2 dejan de estar reservadas en la vuelta 39: equipan de verdad,
  // cada una su ranura. La 3 sigue siendo sólo tecla.
  primary: { label: 'Arma principal', default: 'Digit1', group: 'Equipo' },
  secondary: { label: 'Pistola', default: 'Digit2', group: 'Equipo' },
  melee: { label: 'Cuerpo a cuerpo', default: 'Digit3', reserved: true, group: 'Equipo' },
  // El escudo tampoco está reservado: aplica una carga del inventario (ver
  // `PLAYER.shield`). El cuerpo a cuerpo, el artilugio y el arrojadizo siguen
  // siendo sólo tecla.
  shield: { label: 'Escudo', default: 'Digit4', group: 'Equipo' },
  gadget: { label: 'Artilugio', default: 'Digit5', reserved: true, group: 'Equipo' },
  throwable: { label: 'Arrojadizo', default: 'KeyG', reserved: true, group: 'Equipo' },

  /**
   * **El marcador, mientras se mantenga pulsada.** Va en su propio grupo porque
   * no es ni movimiento ni combate ni equipo: es la interfaz.
   *
   * TAB **sí** se puede interceptar, al contrario que Ctrl+W (ver la regla de la
   * vuelta 27): el navegador la usa para mover el foco, y eso lo cancela
   * `preventDefault()` porque el evento llega a la página antes. Comprobado
   * jugando en `marcador41.mjs`, no supuesto.
   */
  scoreboard: { label: 'Marcador', default: 'Tab', group: 'Interfaz' },

  /**
   * **La armería.** Abre el panel de equipo y, jugando, **pausa**: elegir arma
   * con ocho muñecos disparándote no es una decisión, es una ruleta. Es el mismo
   * camino que Escape —se suelta el ratón—, así que no hay una segunda idea de
   * «pausa» en el motor.
   */
  armoury: { label: 'Armería', default: 'KeyB', group: 'Interfaz' },

  avatarDebug: { label: 'Vista del avatar', default: 'F3', group: 'Depuración' },
}

/**
 * Teclas que el sistema de binds no acepta nunca, pase lo que pase en
 * localStorage. Escape es la pausa y la salida del pointer lock; F5 y F12 se las
 * queda el navegador y capturarlas sólo sirve para romperle la recarga a alguien.
 */
export const FORBIDDEN_KEYS = ['Escape', 'F5', 'F11', 'F12', 'Tab']

/**
 * **Binds cuyo valor de fábrica se movió**, y con qué tecla estaban antes.
 *
 * Es la hermana de `LEGACY_WEAPON_KEYS` y resuelve el mismo problema por el otro
 * lado: allí una clave vieja se traduce a la nueva; aquí una tecla vieja se
 * **suelta**, para que la acción coja su valor de fábrica nuevo y la tecla quede
 * libre para quien la haya heredado.
 *
 * Sin esto, quien jugó antes de la vuelta 42 abriría el juego con el silenciador
 * todavía en la B —lo guardado manda— y la armería sin tecla, sin ningún aviso.
 * Y sólo se suelta **esa** tecla: a quien se la hubiera reasignado a mano no se
 * le toca nada.
 */
export const LEGACY_KEYBINDS = {
  suppressor: 'KeyB',
}

export const MOVEMENT = {
  enabled: true,

  /** Velocidad horizontal de pie, en unidades por segundo. */
  speed: 6.5,
  /**
   * Velocidad horizontal manteniendo SHIFT: un paso intermedio entre correr y
   * agachado. Es la marcha con la que se dispara con precisión completa sin
   * quedarse quieto (ver ACCURACY.speedThreshold).
   */
  walkSpeed: 4.2,
  /** Velocidad horizontal mientras se mantiene agachado. */
  crouchSpeed: 2.6,

  /**
   * **Lo que pesa lo que llevas encima** (vuelta 42).
   *
   * Un arma tiene `weight` en kilos y de ahí sale un factor que multiplica la
   * marcha —las tres: correr, andar y agachado—, así que elegir arma deja de ser
   * sólo elegir cadencia y cargador. Tres decisiones dentro:
   *
   * - **Hay peso gratis.** Hasta `free` no frena nada, y la pistola cae por
   *   debajo: la que se lleva siempre no puede costar velocidad, o el coste
   *   estaría en no haber elegido. Lo paga la principal, que es la decisión.
   * - **Es lineal por kilo**, no una tabla por arma. Una tabla se desincroniza
   *   con el peso en cuanto alguien toca un número; así el arma declara **una**
   *   cosa —lo que pesa— y el efecto sale solo.
   * - **Y tiene suelo** (`minFactor`). El lanzacohetes del futuro tiene que
   *   poder pesar de verdad sin que llevarlo sea no moverse.
   *
   * Los números son de partida y **se calibran jugando**: hoy la Rift (3.6 kg)
   * deja la carrera en 5.86 u/s contra los 6.5 de la pistola, o sea un 10% —el
   * orden de magnitud de un rifle en un shooter táctico—.
   */
  load: {
    /** Kilos que no frenan. Una pistola pesa menos que esto. */
    free: 1.2,
    /** Cuánta marcha se pierde por kilo por encima de `free`, en tanto por uno. */
    perKg: 0.04,
    /** Suelo: por debajo de esto no baja por mucho que pese. */
    minFactor: 0.75,
  },

  /** Altura de los ojos de pie. También es la altura en el modo estático. */
  standHeight: 1.7,
  /** Altura de los ojos agachado. */
  crouchHeight: 1.05,
  /**
   * A qué velocidad (unidades/s) baja y sube la cámara al agacharse. No estaba
   * en la lista de constantes pedidas, pero un cambio instantáneo de altura da
   * un tirón muy feo; con esto la transición dura ~0.1 s. Súbelo mucho para
   * volver al cambio seco.
   */
  crouchTransitionSpeed: 6.0,

  /**
   * Velocidad vertical inicial del salto, en unidades por segundo.
   * Va emparejada con `gravity`: el ápice es jumpSpeed² / (2·gravity).
   */
  jumpSpeed: 8.67,
  /**
   * Gravedad constante, en unidades por segundo al cuadrado.
   *
   * Subida de 18 a 30 junto con `jumpSpeed` para acortar el vuelo sin mover el
   * ápice: 575 ms en lugar de 746, con la misma altura de 1.25 u. El salto se
   * resuelve en forma cerrada (ver movement.js), así que subir la gravedad ya no
   * arrastra dependencia del refresco del monitor.
   */
  gravity: 30.0,

  /**
   * Ventana del **salto encadenado**, en milisegundos **a cada lado** del
   * instante de aterrizaje. Pulsar SPACE dentro de ella —justo antes de tocar
   * el suelo o justo después— encadena: el nuevo salto arranca con la marcha
   * horizontal que se traía al aterrizar en vez de recalcularla desde el suelo.
   * Fuera de la ventana, saltar al aterrizar se comporta exactamente igual que
   * siempre.
   *
   * Se mide en tiempo real contra el instante **exacto** del aterrizaje, que
   * sale de la parábola y no del frame que lo detecta (ver movement.js). Con
   * un contador de frames, 130 ms serían 8 frames a 60 Hz y 31 a 240.
   */
  chainJumpWindowMs: 130,

  /**
   * **Qué modelo de aire se usa**, mientras se decide cuál se queda:
   *
   * - `true` — **vector de velocidad**. En el aire el jugador tiene una
   *   velocidad horizontal de verdad, con dirección: sueltas W en pleno vuelo y
   *   la marcha que llevabas **sigue apuntando a donde ibas**, y el estrafe la
   *   va girando poco a poco. Es el bunny-hop de verdad.
   * - `false` — **marcha escalar**, lo que había hasta la vuelta 31: una
   *   velocidad sin dirección, que se recalcula cada frame desde las teclas. La
   *   ganancia funciona, pero soltar W te deja en lateral puro al instante.
   *
   * Los dos modelos conviven a propósito y **uno de los dos se borrará**: esto
   * es un interruptor de prueba, no una opción de juego (no está en el panel de
   * ajustes). Se lee cada frame, así que cambiarlo en caliente desde la consola
   * vale — el cambio se nota a partir del salto siguiente.
   *
   * Con el vector cambia una cosa más allá del air-strafe, y conviene saberlo:
   * **hay inercia**. Hoy, soltar las teclas en el aire te deja clavado; con el
   * vector sigues volando, como en cualquier FPS con física.
   */
  airVector: true,
  /**
   * **Aceleración aérea** del modelo vectorial, el `sv_airaccelerate` de
   * siempre. Multiplica a `airWishFactor · speed · dt` para dar la ganancia
   * por frame, y el resultado se acota además por lo que falte para llegar a la
   * velocidad deseada.
   */
  airAccel: 10,
  /**
   * Tope de la **velocidad deseada** en el aire, como fracción de la carrera.
   * Es la pieza que hace que el air-strafe funcione: el aire sólo acelera
   * mientras la proyección de tu velocidad sobre la dirección que pides sea
   * menor que esto, así que apuntar la dirección deseada casi perpendicular a
   * tu marcha —lo que se consigue girando— es lo único que deja seguir
   * sumando. Con W pulsada mirando a donde vas, la proyección ya es 6.5 y no
   * gana nada: la condición «W suelta» del modelo escalar aquí no hace falta
   * porque **sale sola de la geometría**.
   *
   * 0.12 es la proporción de Source (30 u/s de tope sobre 250 de carrera).
   * Aquí son 0.78 u/s. Punto de partida, para calibrar jugando.
   */
  airWishFactor: 0.12,
  /**
   * **Aceleración en el aire (air-strafe).** Techo de velocidad horizontal que
   * se puede alcanzar estrafeando en el aire, en unidades por segundo. Es un
   * límite duro para **los dos modelos**: ni `_airSpeed` en el escalar ni el
   * módulo del vector lo pasan nunca, así que por muchos saltos que se
   * encadenen la marcha máxima del juego es ésta.
   *
   * 9.5 frente a los 6.5 de carrera: un 46% más. Ojo con leerlo como «se cruza
   * el mapa un 46% antes»: el techo sólo se toca encadenando bien y girando
   * todo el rato, y girar **curva la trayectoria**, así que en línea recta se
   * gana bastante menos de lo que dice el número.
   */
  airStrafeMaxSpeed: 9.5,
  /**
   * Cuánta velocidad se gana por **radián girado** en la dirección correcta.
   * La ganancia va con el ángulo recorrido y no con el tiempo: lo que acelera
   * es girar el ratón hacia el lado de la tecla de estrafe, no mantenerla
   * pulsada.
   *
   * Con 0.9 y el tope de giro de abajo, un vuelo entero bien hecho (578 ms)
   * da ~1.25 u/s, así que subir de 6.5 al techo cuesta dos o tres saltos
   * seguidos: se nota el progreso sin que un salto suelto lo regale.
   */
  airStrafeGainPerRad: 0.9,
  // (sólo lo usa el modelo escalar: con vector la ganancia sale de la geometría)
  /**
   * Velocidad angular máxima que **cuenta** para la ganancia, en grados por
   * segundo. Girar más rápido que esto no da más: lo que se premia es un giro
   * sostenido y limpio, no un flick.
   *
   * Además es lo que hace la maniobra independiente del refresco: se acota
   * `rate · dt`, así que medio segundo de giro vale lo mismo a 60 que a 240 Hz.
   */
  airStrafeMaxYawRateDeg: 140,
  // (sólo lo usa el modelo escalar, por el mismo motivo)

  /**
   * **Fatiga de salto.** Saltar parado no costaba nada, así que rebotar en el
   * sitio era gratis e infinito. Lo que se desgasta es el **impulso vertical**,
   * no una cuota de saltos: se multiplica `jumpSpeed` al despegar, con lo que
   * la parábola sigue resolviéndose en forma cerrada y el salto débil se
   * comporta igual a 60 que a 240 Hz. Nada más cambia — ni la gravedad, ni el
   * encadenado, ni la colisión.
   *
   * **Lo que decide si un salto cuenta como parado es la velocidad, no la
   * distancia recorrida.** Un bhop cerrado, girando todo el rato, avanza poco
   * en línea recta pero va rápido; medir el desplazamiento neto castigaría
   * justo al que domina la técnica, que es lo contrario de lo que se quiere.
   * Se guarda la **velocidad horizontal máxima del vuelo** —un máximo, no una
   * integral, así que no depende de cuántos frames lo muestreen— y se compara
   * con `minSpeed`.
   */
  jumpFatigue: {
    /** Saltos parados que salen gratis antes de que empiece el desgaste. */
    freeJumps: 2,
    /**
     * Por debajo de esta velocidad horizontal (u/s) el vuelo cuenta como
     * «parado». 1.5 deja fuera el 0.78 u/s que el aire puede regalar desde
     * quieto (`airWishFactor · speed`) y queda muy por debajo de andar (4.2).
     */
    minSpeed: 1.5,
    /** Cuánto impulso pierde cada salto parado a partir del tercero. */
    penaltyPerJump: 0.12,
    /** Suelo del desgaste: por débil que sea, un salto sigue siendo un salto. */
    minFactor: 0.55,
    /**
     * Sin saltar durante este rato, el desgaste se olvida. Es lo que hace que
     * la fatiga sea del rebote y no del jugador: dos segundos quieto y vuelve
     * a saltar entero.
     */
    recoverMs: 1400,
  },

  /**
   * Margen que se deja libre junto a cada pared. El desplazamiento ya no está
   * acotado a un radio artificial: el jugador recorre la sala entera y lo
   * único que lo frena son las paredes.
   */
  wallMargin: 1.5,

  // Las teclas ya no viven aquí: están en `KEYBINDS`, con las de arma y las de
  // interacción, y el jugador puede reasignarlas. **CTRL sigue sin poder
  // agachar** —Ctrl+W cierra la pestaña, ver `docs/decisions.md` §27— y ahora eso
  // lo garantiza el saneado de binds en lugar de la buena voluntad de quien
  // edite este fichero.
}

/**
 * Precisión del disparo en función del movimiento.
 *
 * Encima del patrón de retroceso del arma, moverse deprisa abre el disparo: un
 * desvío aleatorio de verdad, distinto en cada disparo, que no se puede
 * aprender ni compensar. Es lo que le da sentido a caminar con SHIFT.
 */
export const ACCURACY = {
  /**
   * Velocidad horizontal por encima de la cual el disparo se abre. Igualada a
   * `MOVEMENT.walkSpeed`, de modo que caminar y agachado disparan con
   * precisión completa y sólo correr penaliza.
   */
  speedThreshold: MOVEMENT.walkSpeed,
  /**
   * Radio angular máximo del desvío, en grados. Cada disparo sortea una
   * dirección al azar y una magnitud entre 0 y este valor.
   */
  movementSpreadDeg: 1.2,
}

/** Reglas de aparición del modo Gridshot. */
export const SPAWN = {
  /**
   * Sesgo hacia delante al elegir anclaje. Sortear entre todos los visibles por
   * igual hacía que la mitad de las dianas naciera a la espalda, y girarse a
   * ciegas no es apuntar: es lotería.
   *
   * `forwardBiasConeDeg` es la **apertura total** del cono (±la mitad respecto a
   * la mirada), medida sólo en horizontal: mirar al suelo no debe dejar de
   * considerar "delante" lo que tienes delante.
   */
  forwardBiasConeDeg: 100,
  /**
   * Con esta probabilidad se sortea sólo entre los de delante; el resto de las
   * veces, entre todos los visibles. No es 1 a propósito: una sorpresa
   * ocasional a la espalda mantiene la atención, siempre que no sea lo normal.
   */
  forwardBiasChance: 0.85,

  /**
   * Con rutas curadas, lo que se espera antes de reintentar cuando ningún punto
   * válido está visible desde donde está el jugador. Sin esta espera el motor
   * volvería a comprobar visibilidad en cada frame, que es justo lo que no debe
   * hacer.
   */
  pointRetryMs: 150,
  /**
   * **Cupo de zona.** Fracción de los muñecos vivos que puede acumular una
   * misma zona del mapa. Con 0.5 —la mitad, redondeando hacia arriba— una zona
   * nunca puede tenerlos a todos en cuanto hay dos o más, así que el mapa
   * siempre está repartido entre dos zonas como mínimo.
   *
   * Nace de un fallo concreto: plantado en la pasarela del Balcón sólo se ven
   * puntos de dos zonas, y como se sortea entre los visibles, las reapariciones
   * iban cayendo todas ahí hasta vaciar el resto del mapa. Medido antes del
   * cupo: campando en el Balcón con cinco muñecos, el 10% del tiempo estaban
   * los cinco en la misma zona y sólo dos zonas del mapa llegaron a usarse.
   *
   * Subirlo a 1 devuelve el comportamiento viejo; bajarlo de 0.5 obliga a
   * repartir entre tres zonas o más, a costa de sacar muñecos donde no se ven.
   */
  zoneShare: 0.5,

  /** Semiángulo del cono frente a la cámara (cono total ≈ 36°). */
  coneHalfAngleDeg: 18,
  /**
   * El eje del cono es la dirección de la cámara con el cabeceo acotado a este
   * rango. Sin esto, mirar al suelo mandaría todas las dianas bajo el suelo.
   */
  axisPitchClampDeg: { min: -8, max: 20 },
  /** Separación angular mínima respecto a las dianas ya presentes: fuerza el flick. */
  minAngularSeparationDeg: 9,
  /** Intentos de muestreo antes de aceptar un candidato acotado. */
  maxSampleAttempts: 32,
  /**
   * Reintentos al elegir destino en modo dinámico si cae demasiado cerca de
   * otra diana. Pocos a propósito: con la sala llena hay que aceptar el
   * resultado y seguir, nunca dejar el bucle dando vueltas.
   */
  destinationAttempts: 6,
  /**
   * Dirección fija del cono en la variante de movimiento, en grados. El cono
   * nace siempre en la posición actual del jugador, pero apunta aquí pase lo
   * que pase: ni la mirada, ni el salto, ni el agachado lo rotan. Yaw 0 mira
   * hacia -Z, que es hacia donde arranca la cámara.
   */
  anchoredAxisYawDeg: 0,
  anchoredAxisPitchDeg: 10,
  /** Retardo hasta la siguiente diana tras un acierto (requisito: < 100 ms). */
  respawnDelayMs: 40,
}

/**
 * Margen mínimo que debe quedar entre una diana y cualquier pared, en unidades.
 *
 * La sala tiene tamaño definitivo: a partir de aquí, lo que se acota es el
 * slider de distancia, no las paredes.
 */
const WALL_CLEARANCE = 5

/**
 * Radio alrededor del punto de aparición que se tiene en cuenta al acotar el
 * slider.
 *
 * El jugador puede alejarse mucho más —se mueve por toda la sala—, pero el
 * cono de aparición está anclado al centro y lo razonable es garantizar el
 * margen para el juego normal, cerca del punto de partida. Quien se vaya a
 * pegar a una pared verá las apariciones comprimirse contra ella en vez de
 * salirse de la sala, que es lo que ya hace el muestreo por su cuenta.
 */
const SPAWN_ANCHOR_MARGIN = 5

/**
 * Tope del slider de distancia de aparición. Se calcula, no se escribe a mano,
 * para que siga siendo correcto si algún día cambian la sala, los márgenes o
 * las horquillas de distancia.
 *
 * El peor caso es un jugador desplazado hasta el borde de `SPAWN_ANCHOR_MARGIN`
 * con un dummy sorteado a la distancia máxima posible y justo en la dirección
 * contraria a la pared más cercana. Incluso así tienen que sobrar
 * `WALL_CLEARANCE` unidades.
 *
 * Se toma el más restrictivo de los dos regímenes de distancia, porque el
 * slider es uno solo y vale para los tres tipos de diana:
 *  - general (Clásica y Cono): el valor del slider más `TARGET.distanceSpread`
 *  - hitbox: el valor del slider por `HITBOX.distanceScale.max`
 */
function computeMaxSpawnDistance(step) {
  const halfRoom = Math.min(ROOM.width, ROOM.depth) / 2
  // Distancia máxima que puede haber entre jugador y diana sin comerse el margen.
  const reach = halfRoom - WALL_CLEARANCE - SPAWN_ANCHOR_MARGIN
  const generalMax = reach - TARGET.distanceSpread
  const hitboxMax = reach / HITBOX.distanceScale.max
  // Redondeo hacia abajo al escalón del slider, para que el tope sea alcanzable.
  return Math.floor(Math.min(generalMax, hitboxMax) / step) * step
}

/**
 * Cuántas dianas pueden estar vivas a la vez.
 *
 * `x1` es el Gridshot de siempre: una sola diana y la siguiente espera a que
 * caiga. De `x2` en adelante van saliendo al ritmo de la cadencia aunque las
 * anteriores sigan en pie. Aplica igual a los tres tipos de diana.
 */
export const SIMULTANEOUS_TARGETS = {
  x1: { label: 'x1', count: 1 },
  x2: { label: 'x2', count: 2 },
  x3: { label: 'x3', count: 3 },
  x5: { label: 'x5', count: 5 },
  /**
   * Pensado para escenarios con anclajes: el Plano A tiene trece y con x5 la
   * mayoría se queda sin usar a la vez. En la sala vacía el cono de aparición
   * queda muy apretado a este nivel y las dianas se rozan.
   */
  x8: { label: 'x8', count: 8 },
}

/** El mayor valor elegible. Dimensiona el pool de dianas, que no se rehace al cambiar de opción. */
export const MAX_SIMULTANEOUS_TARGETS = Math.max(
  ...Object.values(SIMULTANEOUS_TARGETS).map((option) => option.count),
)

/**
 * Límite de fotogramas. `fps: 0` significa sin límite: atado sólo a
 * requestAnimationFrame, o sea al refresco del monitor.
 *
 * Las claves no son numéricas a propósito: JavaScript reordena las claves que
 * parecen enteros, y aquí el orden de declaración es el que se ve en el panel.
 */
export const FRAME_LIMITS = {
  fps60: { label: '60', fps: 60 },
  fps144: { label: '144', fps: 144 },
  fps240: { label: '240', fps: 240 },
  unlimited: { label: 'Sin límite', fps: 0 },
}

/**
 * Ajustes editables desde el panel de opciones.
 *
 * A diferencia del resto del archivo, estos valores no se leen directamente:
 * son el **punto de partida** de `src/settings.js`, que los guarda en
 * localStorage y los sirve ya validados. Editar aquí cambia el valor por
 * defecto, no el que tenga guardado un navegador que ya haya jugado.
 *
 * `min`/`max`/`step` alimentan los sliders y, sobre todo, acotan lo que se
 * lee de localStorage: ahí puede haber cualquier cosa.
 */
/**
 * **Dificultad de los muñecos.** Un nivel fija los dos parámetros **a la vez**,
 * y por eso es un catálogo y no dos sliders sueltos: precisión y reacción no son
 * independientes para quien juega —lo que se nota es «cuánto aprietan»— y con
 * dos mandos separados se acaba con combinaciones que no corresponden a ninguna
 * dificultad real (un tirador de élite que tarda un segundo en reaccionar).
 *
 * - `spreadDeg` — **precisión**: semiángulo del cono de dispersión. Parece
 *   enorme para un tirador y no lo es: el disparo es instantáneo y va a donde
 *   estás **ahora**, así que moverse no le hace fallar ni un poco. Todo lo que
 *   falla un muñeco sale de aquí. Medido de pie en el spawn del Plano A: con
 *   4.5° entra el 84% de los disparos, con 9° el 54%.
 * - `reactionMs` — **reacción**: lo que tarda en abrir fuego desde que te ve.
 *   Perderlo de vista lo reinicia, así que también es lo que mide cuánto se
 *   puede asomar uno.
 *
 * Los tres niveles son **puntos de partida a calibrar jugando**, no valores
 * medidos: Normal es exactamente lo que había hasta la vuelta 37.
 */
export const ENEMY_DIFFICULTIES = {
  easy: { label: 'Fácil', spreadDeg: 15, reactionMs: 900 },
  normal: { label: 'Normal', spreadDeg: 9, reactionMs: 650 },
  hard: { label: 'Difícil', spreadDeg: 5, reactionMs: 400 },
}

/** El nivel de partida, y el que usa quien no tenga ajuste guardado. */
export const ENEMY_DEFAULT_DIFFICULTY = 'normal'

export const SETTINGS = {
  sensitivity: {
    label: 'Sensibilidad',
    default: LOOK.sensitivity,
    min: 0.1,
    max: 6,
    step: 0.01,
    /** Decimales al mostrar y al redondear el campo numérico. */
    decimals: 2,
  },
  scenario: {
    label: 'Escenario',
    /**
     * Variante activable, no reemplazo: la sala vacía sigue siendo un escenario
     * válido y la referencia limpia de rendimiento (ver docs/decisions.md §2.1).
     */
    default: 'empty',
  },
  targetType: {
    label: 'Tipo de diana',
    default: 'classic',
  },
  /**
   * **El arma principal**, la de la tecla 1. La pistola no está aquí: se lleva
   * siempre (`SECONDARY_WEAPON`) y no se elige, así que sacarla del desplegable
   * no le quita nada a nadie.
   */
  weapon: {
    label: 'Arma principal',
    default: 'rift',
  },
  targetRadius: {
    label: 'Tamaño de diana',
    default: TARGET.radius,
    min: 0.15,
    max: 1.2,
    step: 0.01,
    decimals: 2,
  },
  spawnDistance: {
    label: 'Distancia de aparición',
    default: TARGET_TYPES.classic.defaultDistance,
    min: 8,
    /** Derivado del tamaño de la sala: ver computeMaxSpawnDistance. */
    max: computeMaxSpawnDistance(0.5),
    step: 0.5,
    decimals: 1,
  },
  spawnIntervalMs: {
    label: 'Cadencia',
    /** Por defecto, la reaparición casi instantánea del Gridshot original. */
    default: SPAWN.respawnDelayMs,
    min: 0,
    max: 1500,
    step: 10,
    decimals: 0,
  },
  simultaneousTargets: {
    label: 'Dianas simultáneas',
    default: 'x1',
  },
  frameLimit: {
    label: 'Límite de fotogramas',
    default: 'unlimited',
  },
  /**
   * **El silenciador es de cada arma, no del jugador** (vuelta 43).
   *
   * Hasta la 42 era un solo booleano que se aplicaba a lo que llevaras en la
   * mano, así que ponérselo a la Rift se lo ponía también a la pistola. En
   * cuanto la armería enseña las tres a la vez, con su interruptor en la ficha,
   * eso deja de tener sentido: lo que se ve en el panel es el arma **como la vas
   * a llevar**, silueta incluida.
   *
   * El valor sale del arsenal en vez de estar escrito a mano: añadir un arma la
   * añade aquí sola, y el saneado acota además contra `supportsSuppressor`, que
   * es quien decide de verdad.
   */
  suppressor: {
    label: 'Silenciador',
    default: Object.fromEntries(Object.keys(WEAPONS).map((key) => [key, false])),
    /** Marca para el saneado: es un mapa arma → booleano, no un interruptor. */
    perWeapon: true,
  },
  spatialAudio: {
    label: 'Audio espacial',
    /**
     * Activado, los sonidos posicionados suenan con dirección (listener en la
     * cámara). Desactivado, se cae al comportamiento anterior: sólo volumen por
     * proximidad, sin dirección.
     */
    default: true,
  },
  helpMessages: {
    label: 'Mensajes de ayuda',
    default: true,
  },
  musicVolume: {
    label: 'Música de menús',
    /**
     * Volumen de la música de inicio, opciones y pausa. Va por su propio nodo:
     * bajarla a cero no toca ni el pitido del explosivo ni los disparos.
     */
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
    decimals: 2,
  },
  /**
   * **Cuánto dura un Deathmatch.** Sólo se aplica a ese modo: la ronda con
   * explosivo la sigue midiendo el temporizador de la bomba, y el gridshot de
   * la sala vacía, `SESSION_DURATION_S`. El catálogo es `DEATHMATCH_DURATIONS`.
   */
  deathmatchDuration: {
    label: 'Duración de Deathmatch',
    default: 'none',
  },
  enemyDifficulty: {
    label: 'Dificultad de los muñecos',
    /**
     * Precisión y reacción de una vez: el catálogo es `ENEMY_DIFFICULTIES`.
     * Sólo se aplica donde hay quien dispare —escenario con cobertura y hitbox
     * completo—, igual que el bloque de vida del HUD.
     */
    default: ENEMY_DEFAULT_DIFFICULTY,
  },
  dynamic: {
    label: 'Modo dinámico',
    default: false,
  },
  patrolSpeed: {
    label: 'Velocidad de patrulla',
    /**
     * A qué velocidad recorren su ruta los muñecos con modo dinámico. El rango
     * va de **andar a correr** alrededor del valor de siempre: 1.5 es un paseo
     * que se sigue sin esfuerzo y 8 es por encima de la carrera del jugador
     * (`MOVEMENT.speed`, 6.5), que es donde deja de poder acompañarlos.
     *
     * El tope no es arbitrario del todo: con rutas de 10 u de diámetro, a 8 u/s
     * el tramo más largo se recorre en 1.25 s, y por debajo de eso el muñeco
     * cambia de rumbo más deprisa de lo que se puede leer.
     */
    default: TARGET.moveSpeed,
    min: 1.5,
    max: 8,
    step: 0.1,
    decimals: 1,
  },
}

/** Feedback visual. */
/**
 * Vocabulario de cobertura: las piezas con las que se construyen los
 * escenarios. Las alturas no son decorativas, salen de las del jugador —ojo a
 * `MOVEMENT.standHeight` de pie y `MOVEMENT.crouchHeight` agachado— y cada una
 * responde a una pregunta distinta: ¿la ves por encima?, ¿te tapa agachado?,
 * ¿te puedes subir?
 *
 * El razonamiento completo está en docs/propuestas/01-escenario-cobertura.md.
 *
 * Qué se salta, con `jumpSpeed 8.67` y `gravity 30` (ápice 1.2528 u, igual en
 * cualquier monitor desde que el salto se resuelve en forma cerrada):
 * el `bordillo` (0.6) con holgura y la cobertura `baja` (1.25) — el ápice sólo
 * la pasa por 2.8 mm, pero lo que abre la ventana de verdad es `stepHeight`:
 * basta con ir por encima de 1.00 para dejar de chocar con ella y posarse
 * encima. Verificado 12 de 12 a 60, 144 y 240 Hz. La `media` (1.9) sólo se
 * supera con la vista, subido a un bordillo. Si tocas `jumpSpeed`, `gravity` o
 * `stepHeight`, vuelve a comprobar esta lista.
 */
export const COVER = {
  /** Alturas, en unidades de mundo. */
  heights: {
    bordillo: 0.6,
    baja: 1.25,
    media: 1.9,
    alta: 3.6,
    bloque: 4.8,
    plataforma: 2.6,
    parapeto: 3.8,
  },

  /**
   * Rampa de grises: más claro = más alto = menos se pasa. Es codificación
   * funcional, no estética — el jugador aprende a leer la altura por el tono.
   *
   * Ningún naranja: `COLORS.target` es de las dianas y una estructura naranja
   * competiría con lo único que el ojo debe buscar (mismo criterio que el verde
   * de acción, ver docs/decisions.md §10.4).
   */
  colors: {
    bordillo: '#2B2B2B',
    baja: '#454545',
    media: '#6E6E6E',
    alta: '#9A9A9A',
    bloque: '#C8C8C8',
    plataforma: '#3A3A3A',
    parapeto: '#9A9A9A',
    rampa: '#4E4E4E',
  },

  /** Aristas: un tono por encima del relleno, para que el bloque tenga borde. */
  edgeLighten: 0.42,
  edgeOpacity: 0.55,

  /** Radio del cilindro del jugador para la colisión horizontal. */
  playerRadius: 0.4,

  /**
   * Escalón que el jugador sube sin saltar. Deliberadamente por debajo del
   * bordillo (0.6): sirve para no engancharse en juntas, no para convertir la
   * cobertura más baja en una rampa.
   */
  stepHeight: 0.25,

  /** Altura a la que se pone una diana de tipo esfera sobre el suelo de su anclaje. */
  targetStandY: 1.45,
}

/**
 * Aterrizaje: sonido y hundimiento de cámara al tocar el suelo tras una caída.
 *
 * Es puramente sensorial —no toca `gravity` ni `jumpSpeed`— y existe para
 * probar si el salto deja de sentirse flotante sin tocar la física.
 */
export const LANDING = {
  /** Por debajo de esta velocidad de caída no hay ni sonido ni hundimiento. */
  minSpeed: 1.5,
  /**
   * Velocidad de caída a la que el efecto llega a su máximo.
   *
   * Subida de 7.0 a 12.5 al pasar `gravity` a 30: con el valor viejo, todo lo
   * que no fuera bajarse de un bordillo saturaba, y el golpe sonaba igual
   * bajando de un cajón que del Balcón. 12.5 es justo por encima de la caída
   * más alta del Plano A (2.6 u -> 12.49 u/s), así que la escala llega entera.
   */
  fullSpeed: 12.5,
  /** Hundimiento máximo de la cámara, en unidades. Unos 9 cm. */
  dipUnits: 0.09,
  /** Lo que tarda la cámara en volver a su sitio. */
  dipMs: 110,

  /**
   * Perfil del golpe. Deliberadamente lejos del disparo silenciado de la
   * Pulse, con el que se confundía: aquel es un chasquido con pasa-banda a
   * 700 Hz y ataque de 2 ms; este es un golpe sordo —onda triangular mucho más
   * grave, ataque de 12 ms que quita todo el "clic" y una cola cuatro veces más
   * larga— y el ruido va filtrado tan abajo que suena a suela, no a percutor.
   */
  sound: {
    /** Corte del pasa-bajo del ruido de suela, en Hz. */
    scuffHz: 190,
    scuffGain: 0.1,
    scuffDecay: 0.05,
    /** Cuerpo: onda triangular que cae en picado. */
    bodyType: 'triangle',
    bodyFrom: 90,
    bodyTo: 34,
    bodyGain: 0.34,
    /** Ataque largo: es lo que separa un golpe de un clic. */
    bodyAttack: 0.012,
    bodyDecay: 0.2,
  },
}

/**
 * Altura de una pieza de cobertura: un número tal cual, o una clave del
 * vocabulario de `COVER.heights`.
 *
 * Vive aquí porque lo usan dos sitios que no se conocen entre sí —el montaje de
 * la escena y la miniatura del selector— y si cada uno tuviera su copia,
 * cambiar una altura dejaría la miniatura mintiendo.
 */
export function coverHeight(value) {
  if (typeof value === 'number') return value
  return COVER.heights[value] ?? 0
}

const SRGB_TO_LINEAR = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const LINEAR_TO_SRGB = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/**
 * Color de la arista de una pieza: su relleno aclarado hacia el blanco.
 *
 * La mezcla va en espacio **lineal**, no en sRGB, porque es lo que hace
 * `THREE.Color.lerp` y las dos cosas tienen que salir idénticas: la escena la
 * usa para las aristas de los bloques y la miniatura del selector para los
 * bordes de su plano. Mezclar en sRGB daría un gris bastante más oscuro en las
 * piezas bajas (#848484 en vez de #b0b0b0 para el bordillo) y la miniatura
 * dejaría de parecerse a lo que se ve en partida.
 */
export function coverEdgeColor(kind) {
  const hex = COVER.colors[kind] ?? COVER.colors.media
  const value = parseInt(hex.slice(1), 16)
  let out = ''
  for (const shift of [16, 8, 0]) {
    const channel = SRGB_TO_LINEAR(((value >> shift) & 255) / 255)
    const mixed = channel + (1 - channel) * COVER.edgeLighten
    const byte = Math.round(Math.min(1, Math.max(0, LINEAR_TO_SRGB(mixed))) * 255)
    out += byte.toString(16).padStart(2, '0')
  }
  return `#${out}`
}

/**
 * Transición al cambiar de escenario. Los tiempos viven aquí y no dentro del
 * módulo de transición para que se puedan tocar sin abrirlo, como todo lo demás.
 *
 * El total ronda el medio segundo: lo justo para tapar el cambio sin que se
 * sienta una espera.
 */
export const TRANSITION = {
  /** Lo que tarda en taparse la escena vieja. */
  outMs: 200,
  /** Pausa con la escena tapada. Es cuando se construye la nueva. */
  holdMs: 90,
  /** Lo que tarda en destaparse la escena nueva. */
  inMs: 240,
}

/**
 * Escenarios con cobertura. Cada uno es geometría + anclajes de aparición.
 *
 * Las cajas se declaran en planta (`x`/`z` son la esquina mínima, `w`/`d` el
 * tamaño) y la altura sale del vocabulario de `COVER.heights`; `base` eleva la
 * caja si se apoya sobre otra cosa, como el parapeto sobre la plataforma.
 *
 * Las rampas no son cajas: no frenan al jugador y su altura se interpola entre
 * `from` y `to` a lo largo del eje Z.
 *
 * Los anclajes son **curados**, no muestreados: el sentido de un escenario con
 * cobertura es que la diana salga donde importa —una tronera, una esquina, una
 * boca de paso—, y eso no lo da un cono. Cada uno lleva `y` (el suelo sobre el
 * que se apoya), `peek` (si exige asomarse a descubierto) y `zone`.
 */
export const SCENARIOS = {
  empty: {
    label: 'Sala vacía',
    /** Sin geometría: el Gridshot de siempre, con su muestreo por cono. */
    spawn: { x: 0, z: 0 },
    boxes: [],
    ramps: [],
    anchors: [],
  },

  largoYPuerta: {
    label: 'Largo y Puerta',
    /**
     * Ficha del selector. Versión corta de lo que dice la propuesta en
     * docs/propuestas/01-escenario-cobertura.md; la sala vacía no lleva ficha
     * porque no hay nada que explicar.
     */
    card: {
      trains:
        'Sostener y cruzar un carril largo, pre-apuntar un paso obligado y pasar de largo a corto en la misma sesión.',
      risk: 'El más cargado de geometría: hay mucho que leer antes de moverse con soltura.',
      replay: 'Alta. Tres zonas que se pueden entrenar por separado.',
    },
    /**
     * Sala propia, la mitad de lado que la de la sala vacía. El plano se montó
     * primero sobre los 80×80 de siempre y se caminaba demasiado: cruzarlo de
     * punta a punta eran ~11 s a marcha de carrera, casi todos sobre suelo
     * vacío entre pieza y pieza.
     *
     * Acercar la cobertura sin tocar la sala no lo habría arreglado: habría
     * dejado el mismo anillo de suelo caminable por fuera. Lo que se reduce es
     * **la sala**, y con ella el límite real de movimiento, el acotado de las
     * dianas y el tamaño del tablero de acciones.
     *
     * Las piezas **no se han encogido a la mitad**: las estructurales que
     * cruzan el mapa (la Espina, la divisoria, la plataforma) sí, porque su
     * trabajo es cruzarlo, pero el mobiliario conserva un tamaño de cuerpo —un
     * cajón de 3×3, una Media de 4.5×2— porque el jugador tampoco se ha
     * encogido. Misma cantidad de cobertura, la mitad de suelo entre ella.
     */
    room: { width: 40, depth: 40, height: 10 },
    /**
     * El jugador aparece en el Vestíbulo, mirando hacia -Z, que es la dirección
     * fija del cono de aparición. El panel de acciones se ancla a este punto
     * —acotado contra la pared, que desde la vuelta 43 el spawn está a 2.5 u de
     * ella y el tablero no cabe entero detrás—.
     *
     * **Pegado al fondo a propósito** (vuelta 43): el jugador sale con la pared
     * a la espalda y su muro delante, de modo que la banda que hay que reservar
     * sin muñecos son 4.8 u —el 12% de la sala— y no un tercio del mapa.
     */
    spawn: { x: 0, z: 17.5 },

    boxes: [
      // --- La Espina: parte el mapa de norte a sur. El único hueco es La
      // Puerta, de 2.5 u, entre z = -2 y z = 0.5.
      { x: -8, z: -11, w: 1.2, d: 9, kind: 'alta' },
      { x: -8, z: 0.5, w: 1.2, d: 10.5, kind: 'alta' },

      // --- **El muro de aparición.** Una sola pieza, atravesada delante del
      // punto de aparición y **más alta que cualquier jugador**, así que de
      // detrás sólo se sale rodeándola por un extremo o por el otro.
      //
      // Sustituye a dos cosas: al recinto de tres muros de la vuelta 42, que era
      // una ratonera con una única boca, y a la vieja divisoria del Vestíbulo,
      // que hacía este mismo trabajo a medias y sólo por el este. Lo que se
      // buscaba con ella —obligar a elegir salida— lo hace esto mejor, porque
      // las dos salidas son simétricas y las dos se pagan con el mismo tiempo.
      //
      // **Los tres números salen de medir**, no de elegir (`muro43.mjs`,
      // `pantalla43.mjs`; el porqué en `docs/decisions.md` §43):
      //
      //  - **14 de largo.** Por debajo de 12 el jugador plantado en el spawn ya
      //    es visible para algún punto del grafo, que es justo lo que el muro
      //    existe para impedir. Con 14 no lo ve ninguno de los 68, asomarse
      //    cuesta 0.34 s por el oeste y 0.90 por el este, y cruzarlo de punta a
      //    punta 2.38 s: se puede, y se paga.
      //  - **`media` (1.9) y no `alta` (3.6).** Con 3.6 a metro y medio de la
      //    cara el muro ocupa **el 100% del encuadre**: se aparece mirando una
      //    pared gris. Con 1.9 ocupa el 60% y por encima se ve el mapa, y sigue
      //    tapando igual — una recta entre dos puntos por debajo de 1.9 que
      //    cruce su huella está cortada, y tanto los ojos del jugador (1.7) como
      //    los de un muñeco (1.44) están por debajo.
      //  - **A 2.3 u del spawn.** Más cerca y no se puede uno mover detrás; más
      //    lejos y el muro deja de tapar el punto de reaparición.
      { x: -7, z: 15.2, w: 14, d: 1, kind: 'media' },

      // --- El Largo: tres Media escalonadas a un lado y otro del carril. La
      // del fondo se queda a x -15.5 y no más al oeste: por x -19..-16 sube la
      // rampa nueva del Balcón y una Media ahí la tapaba a media altura.
      { x: -18, z: 3, w: 4.5, d: 2, kind: 'media' },
      { x: -13, z: -4, w: 4.5, d: 2, kind: 'media' },
      { x: -15.5, z: -10, w: 4.5, d: 2, kind: 'media' },

      // --- Aproximación a La Puerta, una por cada boca. Van escalonadas sobre
      // el eje del spawn a propósito: sin ellas, abrir la divisoria por el
      // oeste deja un carril recto de 26 u desde el punto de aparición hasta la
      // cara del Balcón, que es medio mapa de galería de tiro.
      { x: -1, z: -5, w: 3, d: 1.5, kind: 'media' },
      { x: -4, z: 1, w: 3, d: 1.5, kind: 'media' },

      // --- Los Cajones: racimo de corta distancia, separaciones de 2 a 5 u.
      { x: -5, z: 8, w: 3, d: 3, kind: 'baja' },
      { x: 3, z: 2.5, w: 3, d: 3, kind: 'baja' },
      { x: 11, z: 4.5, w: 3, d: 3, kind: 'baja' },
      { x: 15, z: 0.5, w: 3, d: 3, kind: 'baja' },
      { x: 0, z: 4.5, w: 3.5, d: 2, kind: 'bordillo' },
      { x: 4.5, z: 8.5, w: 3.5, d: 2, kind: 'bordillo' },
      // Divisoria que parte la zona en dos bolsas.
      { x: 6.5, z: 1.5, w: 1.5, d: 5, kind: 'alta' },

      // --- Pasillo trasero: ruta de rotación.
      { x: 2, z: -7, w: 4, d: 2, kind: 'media' },

      // --- El Balcón: plataforma corrida al fondo.
      // Llega hasta ±19 y z -19 a propósito: el jugador se puede acercar a las
      // paredes hasta room/2 - MOVEMENT.wallMargin (±18.5), y si la plataforma
      // se quedase corta habría una rendija por la que caerse por detrás.
      { x: -19, z: -19, w: 38, d: 7, kind: 'plataforma' },
      // Parapeto sobre el borde delantero, con dos troneras abiertas entre
      // x -13.5..-9.5 y x -6.5..-2.5. Por ahí, y sólo por ahí, se ve el Largo.
      // Miden 4 u y no 2.5: por una tronera no sólo se dispara, también se
      // sale a patrullar, y un muñeco tiene 1.2 u de cuerpo. Con 2.5 el hueco
      // dejaba 0.65 u a cada lado y las salidas en diagonal rozaban el labio, y
      // con ellas se caía el grupo de patrulla compartido del Balcón.
      // Los dos extremos —x -19..-16 y x 16..19— quedan libres a propósito:
      // son las bocas de las dos rampas.
      { x: -16, z: -13.2, w: 2.5, d: 1.2, kind: 'parapeto', base: 'plataforma' },
      { x: -9.5, z: -13.2, w: 3, d: 1.2, kind: 'parapeto', base: 'plataforma' },
      { x: -2.5, z: -13.2, w: 18.5, d: 1.2, kind: 'parapeto', base: 'plataforma' },
    ],

    ramps: [
      // Dos accesos al Balcón, uno en cada extremo. Con uno solo, subir desde
      // el lado equivocado era cruzar el mapa entero por delante del parapeto.
      // Suben de 0 en z = -6 a 2.6 en z = -12, donde enganchan con el borde.
      { x: 16, z: -12, w: 3, d: 6, fromZ: -6, toZ: -12, top: 'plataforma' },
      { x: -19, z: -12, w: 3, d: 6, fromZ: -6, toZ: -12, top: 'plataforma' },
    ],

    /**
     * **La banda de aparición del jugador**, y lo que la hace banda: de aquí
     * sale la exclusión del grafo de rutas. `scenario.js` descarta **cualquier**
     * punto de ruta que caiga dentro, con el radio del muñeco de margen, así que
     * no hay forma de que uno aparezca —ni patrulle— donde reaparece el jugador.
     *
     * **Cruza la sala de lado a lado**, y eso es la regla de la vuelta 43: de la
     * línea del muro hacia atrás no aparece nadie, no sólo dentro de una bolsa
     * alrededor del spawn. Una bolsa dejaba muñecos a los costados, que es lo
     * que hacía imposible estar del todo tapado al reaparecer.
     *
     * Empieza exactamente en la cara del muro: el muro es lo que la hace creíble
     * —lo que se ve— y la banda es lo que la hace cierta.
     *
     * Va en los datos del escenario y no en una constante global porque cada
     * plano tiene la suya: un escenario futuro declara la suya y hereda la regla
     * sin tocar ni una línea de código.
     *
     * Se lee **como una caja** —esquina mínima, ancho y fondo—, con la misma
     * convención que `boxes`: son datos del mismo escenario y leerlos con dos
     * convenciones distintas es un error que no da la cara.
     */
    spawnZone: { x: -20, z: 15.2, w: 40, d: 4.8 },

    /**
     * Sitios posibles del explosivo, curados igual que los anclajes. Repartidos
     * por zonas distintas para que buscarlo sea un recorrido real, y ninguno en
     * el Vestíbulo: aparecer encima del spawn no es un objetivo, es un regalo.
     */
    objectiveSites: [
      { id: 'largo-fondo', x: -13, y: 0, z: -11, zone: 'El Largo' },
      { id: 'balcon', x: -12, y: 'plataforma', z: -16.5, zone: 'El Balcón' },
      { id: 'cajones-este', x: 17, y: 0, z: 6.5, zone: 'Los Cajones' },
      { id: 'puerta-sur', x: -4, y: 0, z: -8, zone: 'La Puerta' },
      { id: 'pasillo', x: 9, y: 0, z: -10, zone: 'Pasillo trasero' },
    ],

    /**
     * **Recogibles.** Cruces de vida, cargas de escudo y el casco.
     *
     * Las coordenadas son **puntos de ruta**, no números nuevos: de esos ya se
     * sabe —lo mide `rutas.mjs`— que tienen suelo a nivel y cuerpo libre, así
     * que un recogible ahí no puede acabar dentro de una caja. Elegir
     * coordenadas a mano era abrir la puerta a un casco dentro de la Espina.
     *
     * El reparto es el del mapa: nada en el Vestíbulo —donde aparece el
     * jugador—, vida y escudo repartidos por las zonas que hay que cruzar, y el
     * **casco arriba, en el Balcón**: lo que mejor protege es lo que más lejos
     * está del sitio seguro.
     */
    pickups: [
      { id: 'casco-balcon', kind: 'helmet', x: 10.5, y: 'plataforma', z: -14.5, zone: 'El Balcón' },
      { id: 'escudo-cajones', kind: 'shield', x: 5.5, y: 0, z: 1.5, zone: 'Los Cajones' },
      { id: 'escudo-pasillo', kind: 'shield', x: 12.5, y: 0, z: -2.5, zone: 'Pasillo trasero' },
      { id: 'escudo-largo', kind: 'shield', x: -13.5, y: 0, z: -0.5, zone: 'El Largo' },
      { id: 'escudo-puerta', kind: 'shield', x: -2.5, y: 0, z: -2.5, zone: 'La Puerta' },
      { id: 'vida-largo', kind: 'health', x: -11.5, y: 0, z: 8.5, zone: 'El Largo' },
      { id: 'vida-cajones', kind: 'health', x: 18.5, y: 0, z: 4.5, zone: 'Los Cajones' },
      { id: 'vida-pasillo', kind: 'health', x: 3.5, y: 0, z: -9.5, zone: 'Pasillo trasero' },
    ],

    /**
     * **Rutas.** Un escenario con cobertura declara rutas, y una ruta es un
     * conjunto de puntos donde **cada par es alcanzable en línea recta** sin
     * cruzar geometría ni cambiar de nivel de suelo.
     *
     * No hay dos clases de punto: **cualquier punto de cualquier ruta es un
     * sitio de aparición**, y el mismo punto sirve de destino de patrulla. Antes
     * eran dos listas —anclajes curados por un lado, grupos de patrulla por
     * otro— con dos vocabularios y dos auditorías para lo mismo, y con el efecto
     * raro de que un muñeco podía patrullar por sitios donde nunca nacía.
     *
     * Lo que garantiza la ruta es lo que permite mover sin pathfinding: elegir
     * otro punto y andar, sin comprobaciones en el bucle ni atascos posibles.
     *
     * Cuántas rutas y cuántos puntos caben **no se decidió, se midió**. Barriendo
     * la sala en rejilla de 1 u y exigiendo a la vez: suelo a nivel, cuerpo de
     * 0.6 u libre de geometría, fuera del volumen del tablero de acciones, a más
     * de `sala/8` del punto de aparición del jugador, 2.5 u de separación entre
     * puntos, 10 u de diámetro máximo por ruta —una ruta es una zona de patrulla,
     * no una carrera de punta a punta— y áreas de rutas disjuntas, en el Plano A
     * a 40×40 entran **14 rutas y 69 puntos**. Ésos son.
     *
     * `zone` y `peek` son de la ruta entera, no del punto: describen dónde está
     * y si obliga a asomarse. `y` eleva la ruta a una plataforma.
     */
    routes: [
      {
        id: 'balcon-1',
        zone: 'El Balcón',
        y: 'plataforma',
        peek: false,
        points: [
          { id: 'balcon-1-a', x: 6.5, z: -17.5 },
          { id: 'balcon-1-b', x: 9.5, z: -18.5 },
          { id: 'balcon-1-c', x: 12.5, z: -18.5 },
          { id: 'balcon-1-d', x: 10.5, z: -14.5 },
          { id: 'balcon-1-e', x: 6.5, z: -14.5 },
          { id: 'balcon-1-f', x: 3.5, z: -14.5 },
        ],
      },
      {
        id: 'balcon-2',
        zone: 'El Balcón',
        y: 'plataforma',
        peek: false,
        points: [
          { id: 'balcon-2-a', x: -9.5, z: -16.5 },
          { id: 'balcon-2-b', x: -6.5, z: -16.5 },
          { id: 'balcon-2-c', x: -3.5, z: -17.5 },
          { id: 'balcon-2-d', x: 0.5, z: -16.5 },
          { id: 'balcon-2-e', x: -1.5, z: -14.5 },
          { id: 'balcon-2-f', x: -5.5, z: -13.5 },
        ],
      },
      {
        id: 'balcon-3',
        zone: 'El Balcón',
        y: 'plataforma',
        peek: false,
        points: [
          { id: 'balcon-3-a', x: -18.5, z: -17.5 },
          { id: 'balcon-3-b', x: -12.5, z: -18.5 },
          { id: 'balcon-3-c', x: -14.5, z: -16.5 },
          { id: 'balcon-3-d', x: -12.5, z: -14.5 },
          { id: 'balcon-3-e', x: -16.5, z: -14.5 },
        ],
      },
      {
        id: 'balcon-4',
        zone: 'El Balcón',
        y: 'plataforma',
        peek: false,
        points: [
          { id: 'balcon-4-a', x: 15.5, z: -18.5 },
          { id: 'balcon-4-b', x: 18.5, z: -18.5 },
          { id: 'balcon-4-c', x: 18.5, z: -12.5 },
          { id: 'balcon-4-d', x: 16.5, z: -15.5 },
        ],
      },
      {
        id: 'cajones-1',
        zone: 'Los Cajones',
        peek: true,
        points: [
          { id: 'cajones-1-a', x: 3.5, z: -1.5 },
          { id: 'cajones-1-b', x: 6.5, z: -1.5 },
          { id: 'cajones-1-c', x: 5.5, z: 1.5 },
          { id: 'cajones-1-d', x: 1.5, z: 1.5 },
        ],
      },
      {
        id: 'cajones-2',
        zone: 'Los Cajones',
        peek: true,
        points: [
          { id: 'cajones-2-a', x: 15.5, z: 4.5 },
          { id: 'cajones-2-b', x: 18.5, z: 4.5 },
          { id: 'cajones-2-c', x: 18.5, z: 7.5 },
          { id: 'cajones-2-d', x: 15.5, z: 7.5 },
        ],
      },
      {
        id: 'cajones-3',
        zone: 'Los Cajones',
        peek: true,
        points: [
          { id: 'cajones-3-a', x: -5.5, z: 3.5 },
          { id: 'cajones-3-b', x: -2.5, z: 4.5 },
          { id: 'cajones-3-c', x: -0.5, z: 7.5 },
          { id: 'cajones-3-d', x: -4.5, z: 6.5 },
        ],
      },
      {
        id: 'largo-1',
        zone: 'El Largo',
        peek: false,
        points: [
          { id: 'largo-1-a', x: -13.5, z: 10.5 },
          { id: 'largo-1-b', x: -11.5, z: 5.5 },
          { id: 'largo-1-c', x: -11.5, z: 8.5 },
          { id: 'largo-1-d', x: -9.5, z: 12.5 },
          { id: 'largo-1-e', x: -14.5, z: 13.5 },
          { id: 'largo-1-f', x: -17.5, z: 13.5 },
        ],
      },
      {
        id: 'largo-2',
        zone: 'El Largo',
        peek: false,
        points: [
          { id: 'largo-2-a', x: -16.5, z: -0.5 },
          { id: 'largo-2-b', x: -18.5, z: -3.5 },
          { id: 'largo-2-c', x: -13.5, z: -0.5 },
          { id: 'largo-2-d', x: -10.5, z: 1.5 },
          { id: 'largo-2-e', x: -18.5, z: 1.5 },
        ],
      },
      {
        id: 'pasillo-1',
        zone: 'Pasillo trasero',
        peek: false,
        points: [
          { id: 'pasillo-1-a', x: 10.5, z: -4.5 },
          { id: 'pasillo-1-b', x: 14.5, z: -5.5 },
          { id: 'pasillo-1-c', x: 18.5, z: -5.5 },
          { id: 'pasillo-1-d', x: 17.5, z: -2.5 },
          { id: 'pasillo-1-e', x: 11.5, z: 0.5 },
          { id: 'pasillo-1-f', x: 12.5, z: -2.5 },
        ],
      },
      {
        id: 'pasillo-2',
        zone: 'Pasillo trasero',
        peek: false,
        points: [
          { id: 'pasillo-2-a', x: 0.5, z: -9.5 },
          { id: 'pasillo-2-b', x: 3.5, z: -9.5 },
          { id: 'pasillo-2-c', x: 6.5, z: -10.5 },
          { id: 'pasillo-2-d', x: 9.5, z: -9.5 },
          { id: 'pasillo-2-e', x: 7.5, z: -7.5 },
        ],
      },
      {
        id: 'puerta-1',
        zone: 'La Puerta',
        peek: true,
        points: [
          { id: 'puerta-1-a', x: -4.5, z: -9.5 },
          { id: 'puerta-1-b', x: -2.5, z: -5.5 },
          { id: 'puerta-1-c', x: -2.5, z: -2.5 },
          { id: 'puerta-1-d', x: -4.5, z: -0.5 },
          { id: 'puerta-1-e', x: -5.5, z: -4.5 },
        ],
      },
      // **Las dos del Vestíbulo cambiaron de lado en la vuelta 43.** Estaban
      // detrás del muro de aparición —donde ya no puede haber nadie— y se
      // rebarrieron con `rutas43.mjs` sobre lo que quedó libre delante de él.
      // Son las dos primeras que se encuentran al asomarse, una por cada
      // extremo del muro: salir por el oeste y salir por el este llevan a sitios
      // distintos, que es lo que hace que elegir lado signifique algo.
      {
        id: 'vestibulo-1',
        zone: 'Vestíbulo',
        peek: false,
        points: [
          { id: 'vestibulo-1-a', x: 6.5, z: 14.5 },
          { id: 'vestibulo-1-b', x: 8, z: 12 },
          { id: 'vestibulo-1-c', x: 10.5, z: 8.5 },
          { id: 'vestibulo-1-d', x: 13, z: 8.5 },
        ],
      },
      {
        id: 'vestibulo-2',
        zone: 'Vestíbulo',
        peek: false,
        points: [
          { id: 'vestibulo-2-a', x: -3.5, z: 12 },
          { id: 'vestibulo-2-b', x: -4.5, z: 14.5 },
          { id: 'vestibulo-2-c', x: -7, z: 13 },
          { id: 'vestibulo-2-d', x: -11.5, z: 14.5 },
        ],
      },
    ],
  },
}

/**
 * **¿Este escenario tiene cobertura?** Mismo criterio que `scenario.hasGeometry`
 * pero sobre los datos, sin montar nada: lo necesita la pantalla de inicio para
 * saber si el segundo botón es Deathmatch o práctica libre, y montar un
 * escenario para preguntárselo sería montar el mundo entero por un rótulo.
 */
export function scenarioHasCover(key) {
  const definition = SCENARIOS[key] ?? SCENARIOS.empty
  return (definition.boxes?.length ?? 0) > 0 || (definition.ramps?.length ?? 0) > 0
}

/**
 * **Los dos modos de sesión**, con nombre propio desde la vuelta 41.
 *
 * Antes eran un booleano (`endless`) y el nombre salía del botón que lo
 * encendía. Con el explosivo y las duraciones de Deathmatch por medio eso ya no
 * daba: «sin cronómetro» y «sin explosivo» dejaron de ser la misma cosa el día
 * que un Deathmatch pudo durar cinco minutos.
 *
 *  - `timed` — lo de siempre: cronómetro corto y, con escenario, **explosivo**.
 *    Es la ronda con objetivo.
 *  - `deathmatch` — escenario sin bomba. Dura lo que diga
 *    `SETTINGS.deathmatchDuration`, incluido «sin límite», que es la práctica
 *    libre de toda la vida. En la sala vacía se llama así, práctica libre: sin
 *    cobertura ni muñecos que disparen no hay deathmatch que valga.
 *
 * `endless` sigue existiendo en el motor y sigue significando exactamente una
 * cosa —**esta sesión no acaba sola**—, que es lo que leen el HUD y el resumen.
 */
export const SESSION_MODES = {
  timed: { label: 'Jugar ahora' },
  deathmatch: { label: 'Deathmatch', plainLabel: 'Práctica libre ∞' },
}

/**
 * Duraciones de Deathmatch. `seconds: 0` es «sin límite», que es el modo con el
 * que nació y por eso sigue siendo el valor de fábrica: quien ya lo usaba no se
 * encuentra con un cronómetro que no pidió.
 */
export const DEATHMATCH_DURATIONS = {
  none: { label: 'Sin límite', seconds: 0 },
  m3: { label: '3 minutos', seconds: 180 },
  m5: { label: '5 minutos', seconds: 300 },
  m10: { label: '10 minutos', seconds: 600 },
}

/**
 * Explosivo de escenario. Sólo existe con un escenario con cobertura montado y
 * en sesiones con cronómetro: la práctica libre no acaba sola por definición, y
 * un explosivo que la cierre rompería ese contrato.
 *
 * El jugador **no tiene ayuda de interfaz** para encontrarlo: ni indicador en el
 * HUD ni marcador en pantalla. La única pista es el pitido, que sube de volumen
 * al acercarse y de tempo y tono según se acaba el tiempo. El marcador existe en
 * el mundo, así que se ve si se mira hacia él, pero hay que buscarlo.
 */
/**
 * Audio espacial. Los sonidos que deben percibirse **con dirección** se enrutan
 * por un `THREE.PositionalAudio` colocado en el mundo, con el listener en la
 * cámara; el resto sigue yendo directo al máster.
 *
 * Los valores del panner están elegidos para que, apagado el audio espacial, la
 * caída de volumen por distancia se parezca a la que había antes: con el modelo
 * `linear`, la ganancia es `1 - rolloff·(d − ref)/(max − ref)`, así que a
 * `maxDistance` queda en 0.1, el mismo mínimo que usa el pitido sin espacializar.
 */
export const SPATIAL = {
  /** HRTF da dirección de verdad; `equalpower` sólo reparte izquierda/derecha. */
  panningModel: 'HRTF',
  distanceModel: 'linear',
  /** A esta distancia o menos, volumen pleno. */
  refDistance: 4,
  /** Más allá de aquí ya no baja más. */
  maxDistance: 55,
  rolloffFactor: 0.9,
}

export const OBJECTIVE = {
  /** Cuenta atrás desde que aparece. También es el reloj de la sesión. */
  timerMs: 45000,
  /** Lo que hay que mantener pulsada la tecla, seguido. */
  defuseMs: 3000,
  /** Distancia máxima a la que se puede desactivar. */
  defuseRadius: 3.0,
  // La tecla de desactivar es la acción contextual `use` de `KEYBINDS`. Soltar
  // cancela el progreso, sin penalización.

  /** Marcador: un octaedro con arista, parpadeando. */
  markerRadius: 0.42,
  markerHeight: 0.9,
  blinkHz: 2.0,
  /** Opacidad mínima y máxima del parpadeo. Nunca llega a cero: no desaparece. */
  blinkMin: 0.35,
  blinkMax: 1.0,

  beep: {
    /** Intervalo entre pitidos al principio y al final de la cuenta atrás. */
    slowIntervalMs: 1150,
    fastIntervalMs: 130,
    /** Tono al principio y al final, en Hz. */
    lowHz: 620,
    highHz: 1280,
    durationS: 0.07,
    /** A esta distancia o menos suena al máximo; a partir de la otra, al mínimo. */
    nearDistance: 4,
    farDistance: 55,
    minVolume: 0.1,
    maxVolume: 1.0,
  },
}

/**
 * **El jugador como blanco.** Vida, escudo y casco.
 *
 * La geometría contra la que se resuelve un disparo recibido **no se declara
 * aquí**: sale de `TARGET_TYPES.hitbox.parts`, las mismas tres zonas con las que
 * se dispara a un muñeco, escaladas a la altura de ojos que tenga el jugador en
 * ese momento (ver `src/game/player.js`). Es el sistema de daño por zona de
 * siempre, mirando en la otra dirección: si mañana el torso empieza más arriba,
 * cambia para los dos lados a la vez.
 *
 * El reparto es el que pide el modelo: la **cabeza** no la cubre el escudo —de
 * eso se encarga el casco, y es binario— y el **cuerpo** sí, absorbiendo el
 * porcentaje que diga el arma que dispara (`WEAPONS[x].shieldAbsorb`).
 */
export const PLAYER = {
  /** Vida base. Es también la referencia del daño por zona: cabeza = 100 = muerte. */
  maxHealth: 100,
  /**
   * **El nick del jugador, y hoy es un placeholder.** No hay cuentas ni nombres
   * configurables —eso depende de un backend que esta fase no tiene— así que el
   * marcador enseña una ranura, igual que los muñecos enseñan `VK-01`. Que sea
   * `VK-00` no es un guiño: es decir «tú eres el cero de esta lista» con el
   * mismo vocabulario, para que el día que haya nombres de verdad se note que
   * esto era el sitio donde iba uno.
   */
  nick: 'VK-00',
  /**
   * Por debajo de esto **y sin escudo**, el HUD parpadea en rojo. Es el mismo
   * mecanismo del cargador corto: estado derivado del frame, sin temporizador
   * aparte.
   */
  lowHealth: 45,

  shield: {
    /** Lo que rellena una carga, y el tope de las tres juntas. */
    segment: 50,
    max: 150,
    /** Cargas que caben en el inventario. */
    maxCharges: 5,
    /** Lo que tarda en aplicarse una, con su sonido eléctrico encima. */
    applyMs: 2000,
    /**
     * Con qué se empieza la sesión mientras no haya economía ni partidas: un
     * segmento puesto y el inventario vacío. Lo demás se recoge del suelo.
     */
    startSegments: 1,
    startCharges: 0,
  },

  /**
   * **Casco: binario.** El primer disparo a la cabeza lo rompe —y se para ahí,
   * el jugador no recibe daño— y el siguiente mata, porque la cabeza vale 100 de
   * 100 en el modelo de zonas y el escudo no la cubre. No se repara ni se
   * rellena: se recoge otro o se juega sin él.
   */
  helmet: { startsEquipped: false },

  /** Lo que cura una cruz del suelo. */
  healthPickup: 50,

  /**
   * **Reaparición.** Un solo número que sube y baja, no una racha contada
   * aparte: morir lo sube `stepMs` (con tope), y una baja lo baja `killCreditMs`
   * **sólo si está por encima de `killCreditAboveMs`**. Así «+2 s por cada
   * muerte consecutiva sin baja entre medias» sale del propio acumulador, sin
   * un segundo contador que se pueda desincronizar del primero.
   */
  respawn: {
    baseMs: 3000,
    stepMs: 2000,
    maxMs: 15000,
    killCreditMs: 3000,
    killCreditAboveMs: 10000,
    /**
     * **Invulnerabilidad al reaparecer.** Reaparecer donde estabas, con los
     * mismos muñecos mirando al mismo sitio, es morir otra vez antes de ver la
     * pantalla: sin esto la segunda muerte llega en menos de lo que se tarda en
     * girar. Dos segundos es lo que cuesta orientarse y echar a andar.
     *
     * Va **por delta como el resto de relojes de `player.js`**: en pausa no
     * corre, así que abrir las opciones no se come el margen.
     */
    invulnerableMs: 2000,
  },
}

/**
 * **Dummies que disparan.** Sólo con escenario montado y muñecos de hitbox
 * completo: una esfera flotante no dispara, y sin cobertura no habría de dónde
 * cubrirse.
 *
 * Dispara **con el modelo de arma que ya existe** —cadencia, cargador, recarga y
 * sonido salen de `WEAPONS`—, así que no hay una segunda idea de lo que es un
 * arma. Lo único propio del enemigo es la puntería: apunta al jugador y desvía
 * el disparo dentro de un cono, igual que la dispersión por movimiento del
 * jugador desvía el suyo.
 *
 * **Los dos parámetros de dificultad** —cuánto falla y cuánto tarda en
 * reaccionar— no viven aquí desde la vuelta 37: son un ajuste del panel y salen
 * de `ENEMY_DIFFICULTIES`, justo debajo. La velocidad de movimiento tampoco
 * está aquí y por lo mismo: ya es el ajuste `patrolSpeed`, y tener dos sitios
 * donde se decide lo mismo es como se desincronizan.
 */
export const ENEMY = {
  /** Con qué disparan. Una entrada de `WEAPONS`, sin copiar ni un número. */
  weapon: 'rift',
  /**
   * Distancia de enganche, en unidades. Más allá no disparan aunque vean: el
   * mapa mide 40 y sin este límite un muñeco del fondo del Balcón hostigaría
   * desde el primer segundo.
   */
  engageRange: 24,

  /**
   * Cada cuánto se recomprueba la línea de visión. **No es por frame**: es un
   * raycast contra toda la geometría del escenario y eso no cabe en el
   * presupuesto (misma regla que la visibilidad de los puntos de aparición). Se
   * reparte además entre muñecos, para que ocho no la comprueben todos en el
   * mismo frame.
   */
  sightCheckMs: 180,
  /**
   * Y cuántas caben **en un mismo frame**. Repartir por tiempo no basta: ocho
   * muñecos que aparecen juntos acaban con los ocho relojes en fase y ocho
   * rayos en el mismo frame —medido, 0.03 ms cada uno, o sea 0.24 ms de golpe
   * contra un presupuesto de 0.2—. Lo que no cabe se queda con la vista del
   * frame anterior y se mira en el siguiente: con dos por frame, ocho muñecos
   * se despachan en 67 ms a 60 Hz, muy por debajo de los 180 del ciclo.
   */
  sightChecksPerFrame: 2,

  /**
   * Ráfagas. Sin ellas un arma automática vacía el cargador de una sentada y no
   * hay hueco para responder ni para cubrirse.
   */
  burstShots: 4,
  burstPauseMs: 900,

  /**
   * Cuánto del daño por zona llega al **cuerpo** del jugador. La cabeza no se
   * escala: vale 100 y mata, que es de lo que depende la regla del casco. El
   * cuerpo sí, porque el jugador —a diferencia de un muñeco— tiene que cruzar el
   * mapa bajo fuego de varios a la vez.
   */
  bodyDamageScale: 0.32,

  /** Altura de la boca del arma sobre los pies del muñeco, en fracción de su altura. */
  muzzleHeightFactor: 0.72,
  /**
   * **Cuánto sale la boca por delante del pecho**, en fracción de la altura del
   * muñeco y en la dirección del disparo.
   *
   * Sólo lo usa el **fogonazo**: la bala sigue saliendo del eje del cuerpo, que
   * es de donde salía antes de que hubiera fogonazo, y esto no cambia ni una
   * trayectoria. Existe porque un destello en el eje del cuerpo se dibuja
   * **dentro** del muñeco y lo tapa su propia malla: medido, de 342 píxeles
   * esperados a 6 u se veían 24, los de las esquinas. Con la boca por delante
   * del pecho —que es donde está la boca de un arma— se ve entera.
   */
  muzzleForwardFactor: 0.24,
  /**
   * A qué parte del jugador apuntan, como fracción de su altura: 0 los pies, 1
   * la coronilla. **Al centro del cuerpo, y no más arriba**: la cabeza empieza
   * en 0.86 y vale 100 de 100, así que apuntar al pecho alto convertía cada
   * ráfaga en una lotería de muertes instantáneas. Medido de pie en el spawn del
   * Plano A con ocho muñecos: apuntando a 0.78 el 11% de los impactos eran a la
   * cabeza —y cada uno mata—; a 0.55, el 4%. El cono se reparte entre torso y
   * piernas y la cabeza vuelve a ser lo que tiene que ser: mala suerte.
   */
  aimHeightFactor: 0.55,

  /**
   * **La bala que pasa cerca.** Un disparo que falla pero te roza el oído tiene
   * que sonar, y sonar **desde el lado por el que pasó**: es la otra mitad de
   * saber que te disparan sin estar mirando al que dispara. El silbido es una
   * voz propia (`playBulletWhizz`), no el disparo con otro volumen: lo que dice
   * no es «alguien ha disparado» sino «esa bala venía a por ti».
   *
   * Se mide contra **los oídos**, o sea contra la cámara, y no contra el cuerpo:
   * lo que se está modelando es el chasquido al pasar, que se oye donde se oye.
   * El emisor se coloca en el **punto de máxima aproximación** de la trayectoria,
   * que es exactamente por donde pasó.
   */
  whizz: {
    /** A cuánto del oído tiene que pasar para oírse, en unidades. */
    radius: 1.8,
    /**
     * Y a cuánto tiene que estar el que dispara. De cerca el propio disparo ya
     * te dice de dónde viene, y encima el punto de máxima aproximación cae casi
     * encima de la cámara: serían dos sonidos fuertes a la vez diciendo lo mismo.
     */
    minShooterDistance: 5,
    /**
     * **Rayos por frame**, como los de visión y los de la ficha flotante. Con
     * ocho muñecos a 600 RPM salen 1.3 disparos por frame a 60 Hz y **cuatro de
     * cada diez fallan cerca** (medido: 13.8 disparos y 5.7 silbidos por
     * segundo), así que sin tope un frame malo puede pagar ocho rayos de golpe
     * —0.24 ms, todo el presupuesto— por un sonido.
     *
     * Lo que se pierde al tocar el tope es un silbido, no una bala: si tres
     * balas te pasan cerca en el mismo frame, se oyen dos y la información
     * —«te están pasando cerca, por ahí»— llega igual.
     */
    raysPerFrame: 2,
  },
}

/**
 * **Lo que se ve encima de un muñeco**: la brújula de orientación y los dos
 * iconos de estado. Todo en el mundo, nada en la interfaz.
 *
 * Son dos cosas distintas y se comportan distinto a propósito:
 *
 * - **La brújula es pasiva y siempre está.** No avisa de nada: dice hacia dónde
 *   mira el muñeco, lo mire a donde lo mire. Por eso **no se billboardea**: va
 *   paralela al suelo y gira sólo en yaw, de modo que se lee como una brújula
 *   —la punta es la dirección— desde cualquier sitio desde el que se mire. Si
 *   girara hacia la cámara dejaría de decir nada.
 * - **Los iconos son situacionales y sí se billboardean**, como cualquier icono
 *   flotante: lo que tienen que hacer es leerse, no orientar.
 *
 * `rise` es lo único que no es evidente. Con la brújula **perfectamente plana**,
 * el jugador la ve de canto —su cabeza y la del muñeco están a la misma altura—
 * y desaparece; medido, ver `docs/decisions.md` §37. Levantar los dos vértices
 * de la cola le da un perfil de cuña que sigue diciendo hacia dónde apunta
 * cuando se mira casi al ras, sin dejar de ser un triángulo visto desde arriba.
 *
 * Las medidas van en **fracciones de la altura del muñeco**, como todo lo demás
 * del avatar: cambiar `targetRadius` no descoloca el marcador.
 */
export const MARKERS = {
  /**
   * **La brújula**, un volumen de verdad: una cuña de sección triangular que
   * baja de la cola a la punta, con la punta hacia donde mira el muñeco (ver
   * `Reference/Avatar/avatar-compass.png`).
   *
   * Que sea volumen y no un triángulo plano no es un capricho: un triángulo
   * plano a la altura de los ojos —que es la altura normal, porque la cabeza
   * del muñeco y la del jugador están a la misma— se ve **de canto**, y de
   * canto ocupa cero píxeles. Está medido en `docs/decisions.md` §37.4. Con
   * volumen, lo que se ve al ras es su perfil de cuña, que sigue diciendo hacia
   * dónde apunta.
   *
   * Las medidas van en **fracciones de la altura del muñeco**, como todo lo
   * demás: cambiar `targetRadius` no descoloca el marcador. Las proporciones
   * entre las tres —largo/alto 2.72, largo/ancho 3.1— salen de la referencia; el
   * tamaño, de medirlo.
   *
   * **Y se midió porque la primera versión salió del tamaño del muñeco.** Con
   * `length` a 0.34 la cuña ocupaba, de lado, **más ancho en pantalla que el
   * propio muñeco** (105% de su silueta a 4 u, 108% a 8 u): lo primero que se
   * veía de un rival era su brújula. Lo que se barrió (`brujula39.mjs`) fueron
   * ocho tamaños contra siete distancias del Plano A, midiendo dos cosas a la
   * vez sobre los píxeles exactos del marcador —los que cambian entre dibujar el
   * frame con brújula y sin ella—:
   *
   *  - **Discreción**: el largo aparente de la cuña contra el ancho de la
   *    silueta del muñeco. A 0.6 del tamaño original queda en el **61%**, que es
   *    un marcador encima de un muñeco y no al revés.
   *  - **Legibilidad**: el área en píxeles a media distancia. El listón es el de
   *    la vuelta 37 —80 px es legible, 28 no (`docs/decisions.md` §37.4)— y a
   *    0.6 quedan **105 px a 12 u y 106 a 20 u**, porque más allá de
   *    `referenceDistance` el marcador deja de encoger. Un paso más abajo (0.5)
   *    se queda en 72 px, por debajo del listón.
   */
  compass: {
    length: 0.204,
    width: 0.066,
    height: 0.075,
    /**
     * **La tapa de la cola va más oscura.** Justo de frente y justo de espaldas
     * la silueta de una cuña es la misma —su rectángulo de cola— y en esta
     * escena no hay ni una luz, así que no hay sombreado que las separe: un
     * muñeco encarado y uno de espaldas se verían igual. Con la cola en un verde
     * al 45%, de frente se ve el claro y de espaldas el oscuro.
     */
    tailShade: 0.45,
    /**
     * **Cuánto cae el morro**, en fracciones de `height`, medido desde la media
     * altura de la cola: 0 deja la cuña simétrica —como hasta la vuelta 39— y
     * 0.5 pone la punta al ras de la base.
     *
     * Es una **segunda señal de orientación, de forma**, que convive con la de
     * tono (`tailShade`). No sobra: el tono se lee de frente y de espaldas, que
     * es cuando la silueta es la misma; la pendiente se lee **de perfil**, que es
     * justo donde el tono no dice nada porque se ven las dos caras a la vez.
     */
    noseDrop: 0.5,
    /**
     * **Opacidad del contorno, que es lo único que se puede afinar de él.**
     *
     * En WebGL el grosor de una línea no se toca: `linewidth` se ignora y todas
     * salen de un píxel. Así que «contorno más fino» sólo puede significar
     * «menos opaco», y eso se midió (`br41.mjs`) con las dos cifras que se
     * pelean, a la vez:
     *
     *  - **Área del marcador contra el fondo oscuro** (el listón de 80 px de la
     *    vuelta 37): 117 px sin contorno, **116 a 0.5** y 75 a opacidad plena.
     *    El contorno negro entero borraba el anillo exterior; a media opacidad
     *    ese anillo vuelve a ser verde a medias en vez de desaparecer.
     *  - **Filo contra la cobertura clara**: 1.23 sin contorno, **6.54 a 0.5** y
     *    6.84 a opacidad plena, contra el gris más claro del plano. O sea que a
     *    media opacidad se conserva el 96% de lo que compra el negro entero.
     *
     * Medio contorno se lleva casi todo el beneficio y devuelve casi toda el
     * área. Y una cifra que corrige lo que decía la vuelta 40: contra el gris
     * `alta` el filo se queda en **2.69** aunque el contorno sea negro puro, no
     * en los 7.46 que da la comparación de colores sobre el papel — una línea de
     * un píxel con antialias nunca llega a pintarse negra del todo.
     */
    outlineOpacity: 0.5,
    /** Por encima de la coronilla. */
    gap: 0.06,
  },
  icon: {
    /** Alto del glifo, en alturas de muñeco. */
    size: 0.26,
    /** Por encima de la brújula. */
    gap: 0.05,
  },
  /**
   * **La ficha flotante**: arma arriba, nick debajo, por encima de todo lo
   * demás. Es DOM en el espacio (`CSS3DRenderer`), como lo era el tablero de
   * acciones, y por el mismo motivo: reutiliza la tipografía y la silueta del
   * arma que ya existen en vez de repintarlas en WebGL.
   *
   * **No sale por estar a la vista**: sale tras mantener la mira encima
   * `dwellMs`. Una ficha por cada muñeco visible sería una pantalla de rótulos;
   * el gesto de apuntar es lo que dice a cuál estás mirando.
   */
  nameplate: {
    /** Cuánto hay que sostener la mira encima para que salga. */
    dwellMs: 350,
    /** Cuánto sigue puesta al dejar de apuntar: evita el parpadeo al rozarla. */
    holdMs: 260,
    /**
     * Medio ángulo del cono que cuenta como «la mira está encima», en grados.
     * Se mide por ángulo y no con un raycast: un rayo por muñeco y por frame es
     * justo lo que el presupuesto no admite (misma regla que la visión del
     * enemigo). Lo de si hay cobertura por medio ya lo contesta `sight`, que es
     * la misma pregunta y se hace una sola vez por muñeco.
     */
    coneDeg: 2.6,
    /** Por encima de los iconos, hasta **el centro** de la ficha. */
    gap: 0.20,
    /**
     * Escala del DOM a unidades de mundo: cuántos píxeles de la ficha entran en
     * una unidad. Medido sobre la ficha real (70 × 40 px de DOM): con 70, a
     * siete unidades ocupa unos 40 px de pantalla, que es lo que hace falta para
     * leer un nick de cinco caracteres.
     */
    pixelsPerUnit: 70,
  },
  /**
   * **Tamaño aparente mínimo.** Un marcador en el mundo encoge con la
   * distancia, y a 30 u —el largo del Plano A— un icono de 0.3 de muñeco son
   * cuatro píxeles: no se cuenta lo que no se ve. A partir de
   * `referenceDistance` el marcador crece con la distancia, de modo que **deja
   * de encoger** y conserva su tamaño en pantalla, con un tope para que de
   * cerca no se coma al muñeco.
   */
  referenceDistance: 8,
  maxScale: 3.4,

  /**
   * **Visibilidad real de la brújula** (vuelta 42).
   *
   * La brújula es el único marcador del mundo que estaba puesto siempre, y
   * puesto siempre significaba también **sobre un muro**: se veía la cuña verde
   * flotando encima de la Espina y se sabía que había alguien detrás y hacia
   * dónde miraba. Eso es un aviso de rayos X, y el juego no lo da por ningún
   * otro canal — el `?` y el `!` sólo salen cuando ya te ha visto, y la cuña
   * roja sólo cuando ya te ha dado.
   *
   * Ahora sale **sólo a quien se ve de verdad**, y las dos mitades de «se ve»
   * son las que hay que cumplir a la vez: dentro del encuadre **y** sin
   * geometría por medio. El rayo es el mismo de `sight.js` que decide dónde
   * puede nacer un muñeco: si el sistema de aparición considera que un sitio no
   * se ve, el marcador no puede decir lo contrario.
   *
   * Los iconos `?` y `!` **no** pasan por aquí, y no es un olvido: dicen cosas
   * distintas. La brújula es información pasiva sobre un cuerpo que tienes
   * delante; los iconos son avisos de que te han visto o de que te están
   * disparando, y un aviso que sólo llega cuando ya puedes ver al que dispara
   * llega tarde.
   */
  sight: {
    /**
     * A qué altura del muñeco se mira, en fracciones de su altura: **a la
     * cabeza**. Asomado por encima de una caja, lo que se ve de un muñeco es la
     * cabeza — un rayo al pecho choca contra la caja y borraría el marcador
     * justo al que estás mirando. Es también el punto al que apunta el cono de
     * la ficha: un solo sitio del muñeco que vale por «él».
     */
    heightFactor: 0.92,
    /**
     * Cada cuánto se recomprueba. **No es por frame**: es un raycast contra
     * toda la geometría del escenario, la misma regla y el mismo número que la
     * visión del enemigo (`ENEMY.sightCheckMs`).
     */
    recheckMs: 180,
    /**
     * Y cuántos caben en un mismo frame. Repartir sólo por tiempo no basta:
     * ocho muñecos que aparecen juntos acaban con los ocho relojes en fase.
     * A quien no le toca presupuesto **no se le mueve el reloj**: se queda con
     * lo que sabía y se mira en el frame siguiente.
     *
     * **Uno, la mitad que la visión del enemigo** (`ENEMY.sightChecksPerFrame`),
     * y a propósito: ocho muñecos en fase se despachan en ocho frames, o sea 133
     * ms a 60 Hz, todavía por debajo del ciclo de 180. Esos dos rayos que no se
     * lanzan aquí no cuestan nada visible —una brújula que tarda un frame más en
     * encenderse no se ve— y sí se notan en el frame de combate, que ya paga los
     * de la visión.
     */
    raysPerFrame: 1,
  },
}

/**
 * **Objetos recogibles.** Cruces de vida, cargas de escudo y el casco, puestos a
 * mano en el escenario (ver `pickups` en `SCENARIOS`).
 *
 * Es la versión provisional de lo que algún día vendrá de una economía: hoy no
 * se compran, están en el suelo. Se recogen por proximidad —no hay tecla— y
 * vuelven a aparecer al cabo de un rato, porque en una sesión larga con varios
 * muñecos disparando un mapa sin recursos se queda muerto.
 */
export const PICKUPS = {
  /** A esta distancia o menos se recoge. Sin tecla y sin mirar. */
  radius: 1.1,
  /** Lo que tarda en volver a aparecer uno recogido. */
  respawnMs: 15000,
  /** Tamaño del marcador y a qué altura del suelo flota. */
  size: 0.22,
  standY: 0.55,
  /** Balanceo y giro: es lo que hace que se vea que es un objeto y no geometría. */
  bobUnits: 0.09,
  bobHz: 0.5,
  spinRpm: 9,
}

/**
 * Puntuación por estrellas de un escenario.
 *
 * La nota es una media **ponderada y normalizada por la suma de los pesos**, de
 * modo que las variables reservadas a peso 0 no arrastran el resultado hacia
 * abajo: están en la fórmula, pero no cuentan hasta que se les dé peso.
 */
export const SCORING = {
  weights: {
    /** Aciertos ÷ disparos. */
    accuracy: 0.5,
    /** Cuánto se tarda en desactivar dentro de la cuenta atrás. */
    time: 0.5,
    /**
     * Daño recibido y muertes. **Ya no están reservadas**: desde que los
     * muñecos disparan generan datos de verdad, así que se les da peso.
     *
     * Peso bajo a propósito, y de partida: la nota sigue siendo sobre todo
     * puntería y ritmo, y morir poco es un extra, no la mitad del examen. Como
     * la media se normaliza por la suma de los pesos, subirlos o bajarlos aquí
     * no obliga a retocar los otros dos.
     */
    damage: 0.1,
    deaths: 0.1,
  },

  /**
   * Referencias con las que se normalizan el daño y las muertes: encajar tanto
   * daño como vida tiene un jugador, o morir tres veces, deja ese componente
   * a cero. Estaban escritas desde que las variables eran un hueco reservado.
   */
  damageReference: 100,
  deathsReference: 3,

  /**
   * Cortes de estrella, de 5 a 2. Por debajo del último, 1 estrella. Que el
   * explosivo detone **no es una estrella**: es un resultado de fallo aparte.
   */
  starThresholds: [0.9, 0.75, 0.55, 0.35],
}

export const FEEDBACK = {
  /** Duración del pop de la diana acertada. */
  targetPopMs: 130,
  /** Escala final del pop. */
  targetPopScale: 2.0,
  /** Opacidad inicial del pop. */
  targetPopOpacity: 0.85,
  /** Nº de pops simultáneos reutilizables (pool, cero alocaciones en caliente). */
  targetPopPoolSize: 6,
  /**
   * Cuánto dura el destello blanco de una zona al recibir un impacto que no
   * mata. Es el único aviso de "le has dado pero sigue en pie".
   */
  zoneFlashMs: 110,
  /** Flash del crosshair al disparar. */
  crosshairFlashMs: 90,
  crosshairFlashOpacity: 0.9,
  /**
   * **Anillo de daño** alrededor de la mira. Es el único aviso en pantalla de
   * que te han dado, y va suave a propósito: un tinte rojo de pantalla completa
   * tapa justo lo que hay que mirar cuando te están disparando.
   */
  damageRingMs: 320,
  damageRingOpacity: 0.55,
  /**
   * **El indicador direccional de daño**: un tinte en el borde de la pantalla
   * hacia el lado real de donde vino el disparo.
   *
   * Es la respuesta a un agujero de información concreto: el anillo de la mira
   * dice *que* te han dado, y los marcadores sólo dicen algo de quien tienes
   * delante. Un tirador a la espalda no aparecía por ningún sitio, así que la
   * única forma de encontrarlo era girar a ciegas.
   *
   * Va **rojo** (`COLORS.threat`, el mismo del `!`), que en esta paleta ya
   * significa «te están disparando», y **no** naranja como el anillo de la mira:
   * son dos avisos distintos y el naranja es de las dianas.
   *
   * Y va breve y en el borde a propósito. Es la misma regla que impidió el
   * tinte rojo de pantalla completa del anillo: cuando te disparan, lo último
   * que se puede tapar es el sitio al que hay que apuntar. La cuña se pinta con
   * un `conic-gradient` centrado en el ángulo y se recorta con una máscara
   * radial, así que el centro de la pantalla queda intacto por construcción, no
   * por ajustar opacidades.
   */
  damageArcMs: 520,
  damageArcOpacity: 0.5,
  /** Medio ángulo de la cuña, en grados: cuánto abarca a cada lado. */
  damageArcSpreadDeg: 34,
  /**
   * Dónde empieza el tinte, en fracción del radio de la máscara. Por dentro de
   * eso no se pinta nada: es el hueco que deja la mira libre.
   */
  damageArcInner: 0.55,
  /**
   * **El fogonazo del muñeco que dispara.** Un plano encarado a la cámara en la
   * boca del arma, del tamaño de un puño y encendido unas decenas de
   * milisegundos. No es una luz: en esta escena no hay ninguna, así que es un
   * `MeshBasicMaterial` aditivo — el mismo truco de «emisivo» que ya usan el
   * pop de la diana y el marcador del explosivo.
   *
   * Va en **blanco** y es el único elemento del mundo que lo usa: el naranja es
   * de las dianas, el rojo del aviso de amenaza, el ámbar del explosivo y el
   * amarillo de la detección. Un fogonazo blanco no se confunde con ninguno y
   * es lo que hace un arma al dispararse.
   */
  muzzleFlashMs: 55,
  /**
   * Ancho de punta a punta, **en fracciones de la altura del muñeco**, como
   * todo lo que se dibuja encima de uno: cambiar `targetRadius` no lo descoloca.
   * A 0.12 son ~0.22 u, un puño. La primera versión iba a 0.4 u y de lejos se
   * leía como una tarjeta blanca pegada al pecho, no como un fogonazo.
   */
  muzzleFlashSize: 0.12,
  muzzleFlashOpacity: 0.85,
}

/** Sonido sintetizado (Web Audio API). Sin assets externos. */
export const AUDIO = {
  /** Volumen del explosivo: pitido, desactivación y detonación. */
  objectiveVolume: 0.4,
  /** Volumen del golpe de aterrizaje, relativo al máster. */
  landingVolume: 0.34,
  masterVolume: 0.45,
  shotVolume: 0.9,
  hitVolume: 0.8,
  /** Disparo enemigo: el mismo perfil que el del jugador, un punto más bajo. */
  enemyShotVolume: 0.62,
  /**
   * **El silbido de una bala que pasa cerca.** Por debajo del disparo: lo que
   * hace útil el silbido es de dónde viene, no cuánto suena, y a la altura del
   * disparo taparía las ráfagas de los demás.
   */
  whizzVolume: 0.5,
  /**
   * **Ajuste de nivel de las muestras grabadas** (`src/audio/samples.js`), que
   * se multiplica por el volumen del disparo. Una grabación de verdad viene
   * normalizada a tope y la síntesis no, así que a 1 una muestra suena bastante
   * más fuerte que el respaldo sintetizado y cambiar de arma sería un salto de
   * volumen. Se queda a 1 hasta que haya un fichero real con el que medirlo: lo
   * que hay que igualar es la sonoridad, y eso no se puede calibrar sin muestra.
   */
  sampleVolume: 1,
  /** Daño recibido, curación y la carga eléctrica del escudo. */
  damageVolume: 0.6,
  healVolume: 0.5,
  shieldVolume: 0.42,
}

/**
 * **Música de menús.** Sintetizada como todo lo demás: ni un fichero de audio en
 * el repositorio, aquí tampoco.
 *
 * No es un bucle grabado sino una pieza que se **genera sobre la marcha**, y por
 * eso no tiene costura: un colchón grave constante y notas sueltas de una escala
 * pentatónica, sorteadas con un sesgo hacia las graves. Dos razones para hacerlo
 * así y no con un bucle de 30 s: no hay fichero que cargar, y un bucle corto en
 * un menú donde se pasa rato se reconoce a la tercera vuelta.
 *
 * Suena en inicio, opciones y pausa, y se calla al empezar a jugar: durante la
 * partida el audio es información —el pitido del explosivo, los disparos— y una
 * base encima sólo estorba.
 */
export const MUSIC = {
  /** Nota más grave del colchón, en Hz. La A2 de toda la vida. */
  rootHz: 110,
  /**
   * Semitonos de la escala sobre la raíz. Pentatónica menor: sin semitonos
   * chocantes, que es lo que deja que las notas salgan en cualquier orden sin
   * sonar mal — justo lo que hace falta si el orden lo decide un sorteo.
   */
  scale: [0, 3, 5, 7, 10, 12, 15, 19, 24],
  /** Segundos entre nota y nota. Lento a propósito: es fondo, no melodía. */
  stepSeconds: 1.9,
  /** De cada cuántos pasos suena algo. El silencio también es parte. */
  noteChance: 0.55,
  /** Corte del filtro del colchón, en Hz, y cuánto lo pasea su LFO. */
  padCutoffHz: 420,
  padLfoHz: 0.045,
  padLfoDepth: 190,
  /** Volúmenes relativos dentro de la música, antes del volumen del jugador. */
  padGain: 0.5,
  noteGain: 0.32,
  /** Caída de cada nota, en segundos. */
  noteDecay: 3.4,
  /** Entrada y salida de la música, en segundos. Sin esto, un chasquido. */
  fadeSeconds: 1.2,
  /**
   * Cada cuánto se programan notas y cuánto se mira hacia delante, en segundos.
   * Programar con antelación contra el reloj del audio es lo que hace que el
   * ritmo no dependa de si la pestaña va justa: `setTimeout` llega tarde, pero
   * la nota ya tiene puesta su hora.
   */
  scheduleEverySeconds: 0.25,
  lookaheadSeconds: 0.6,
}

/**
 * **Avatar del jugador.** El modelo que llevará quien juegue cuando haya
 * multijugador; hoy sólo se puede mirar (ver la vista de depuración, `KEYBINDS.avatarDebug`).
 *
 * No es el muñeco de las dianas con más polígonos: es **la misma anatomía**. Las
 * tres zonas —cabeza, torso, piernas— salen de `TARGET_TYPES.hitbox.parts`, así
 * que si un día cambia dónde empieza el torso, cambia en los dos sitios a la
 * vez. Lo que añade el avatar es lo que una diana no necesita: brazos, hombros,
 * articulaciones y los paneles.
 *
 * **Tres canales, y sólo uno es personalizable:**
 *
 *  - **Piel.** Paneles planos y angulares —nada redondo— en negro, con la
 *    **misma grilla del suelo y las paredes** encima. No es una textura nueva ni
 *    una imagen: es el mismo generador de líneas de `scene.js` (ver
 *    `src/game/grid.js`), a paso de cuerpo en lugar de paso de sala. Es la skin
 *    de serie, la que se tiene sin comprar nada.
 *  - **Luz.** Líneas verticales emisivas por torso y piernas, más el visor y el
 *    núcleo. Es un canal **fijo**: el día que haya equipos, éste es el que lleva
 *    su color, y por eso `setColor` no lo toca.
 *  - **Aristas.** El filo de cada panel, en el gris de la grilla. Sin luces en
 *    la escena, con la piel en negro el tono ya no separa una pieza de otra
 *    —multiplicar negro por 0.62 sigue siendo negro—, así que lo que dibuja el
 *    volumen son las aristas y la grilla.
 */
/**
 * **Colores de equipo.** El cuerpo entero de un jugador va tintado con el suyo, y
 * es lo único que lo distingue: la forma es la misma para todos.
 *
 * La paleta que queda libre es estrecha, y no por capricho. Están cogidos el
 * **naranja** (dianas), el **rojo** (aviso de que te disparan), el **verde**
 * FlickLAB (botones de acción y, desde la vuelta 38, la brújula), el **ámbar**
 * (explosivo), el **amarillo** (te han detectado) y el **azul eléctrico**
 * (#6FE0FF, el canal de carga: escudo, recargas y núcleo). Lo que sobra es el
 * azul medio y el violeta, y ahí van los dos equipos de partida.
 *
 * Medido contra el fondo real del Plano A: ver `docs/decisions.md` §38.
 */
export const TEAMS = {
  blue: { label: 'Azul', color: '#2F6BF0' },
  magenta: { label: 'Magenta', color: '#D94BD9' },
}

/**
 * **El avatar: un cuerpo simple, y el mismo para todos.**
 *
 * Sustituye al humanoide facetado de las vueltas 33-36 —brazos, piernas,
 * articulaciones, hombreras, dedos y líneas de luz— por una cápsula con cabeza
 * ovalada. El porqué del giro está en `docs/decisions.md` §38; lo que hay que
 * saber aquí es que **la forma es una sola y se reutiliza**:
 *
 *  - Como **diana de entrenamiento** (Hitbox completo) va en el naranja de
 *    siempre, con sus tres zonas en sus tres tonos.
 *  - Como **avatar de jugador** va entera del color de su equipo.
 *
 * Y nada más cambia: ni geometría, ni escala, ni detalle. Un rival se reconoce
 * por el color, que se ve igual desde cualquier ángulo, y hacia dónde mira lo
 * dice la brújula (`MARKERS`), no el cuerpo.
 */
export const AVATAR = {
  /**
   * **El perfil del cuerpo**, medido sobre
   * `Reference/Avatar/avatar-simple-body.png` barriendo su silueta fila a fila.
   * Cada par es `[nivel, radio]` en fracciones de la altura total: el nivel va
   * del suelo (0) a la coronilla (1) y el radio es la mitad del ancho.
   *
   * Dos cosas que salen de la referencia y no de la cabeza:
   *
   *  - **El ancho máximo está a media altura** (0.163 a nivel 0.55), no en los
   *    hombros. Es lo que hace que se lea como una cápsula y no como un cono.
   *  - **La cabeza es un óvalo aparte**, y en el boceto está **separada** del
   *    cuerpo. Aquí no se separa: la banda de la cabeza y la del torso son
   *    contiguas en el modelo de zonas y un hueco entre las dos serían disparos
   *    que no dan en ninguna. Lo que se hace es **estrangular el cuello**
   *    (radio 0.030 en el nivel 0.845), que a distancia se lee igual y no deja
   *    agujeros.
   */
  body: {
    /**
     * Caras de la sección. Diez, no veinticuatro como la esfera de antes: es
     * una figura facetada, y con veinticuatro se lee como una cápsula lisa.
     */
    sides: 10,
    profile: [
      [0.000, 0.083],
      [0.050, 0.092],
      [0.100, 0.101],
      [0.150, 0.113],
      [0.205, 0.125],
      [0.260, 0.137],
      [0.330, 0.148],
      [0.400, 0.156],
      [0.470, 0.161],
      [0.550, 0.163],
      [0.650, 0.160],
      [0.700, 0.152],
      [0.740, 0.140],
      [0.770, 0.120],
      [0.800, 0.090],
      [0.830, 0.045],
      [0.845, 0.030],
      [0.870, 0.072],
      [0.905, 0.076],
      [0.940, 0.070],
      [0.970, 0.057],
      [1.000, 0.012],
    ],
  },
  /**
   * **Rampa de tono por zona**, sacada del trío de las dianas: las piernas son
   * exactamente el torso × 0.72 (medido sobre #A5321F contra #E4462B, los tres
   * canales dan 0.72) y la cabeza es el torso aclarado hacia el blanco. Con el
   * color de equipo se aplica la misma rampa, así que un avatar de equipo tiene
   * las mismas tres zonas legibles que una diana.
   */
  zone: { legsShade: 0.72, headLighten: 0.26 },
  /**
   * **Agacharse achata el cuerpo.** Sólo escala en Y —no hay esqueleto ni
   * animación— y el factor sale de la altura de ojos vigente, así que es el
   * mismo dato que ya decide dónde están las zonas de disparo. Cuesta una
   * escritura de `scale.y` por frame.
   */
  crouchSquash: true,

  /** Vista de depuración: distancia de la cámara y vueltas por minuto. */
  debugDistance: 3.2,
  debugHeight: 1.15,
  debugRpm: 4,
}

/** Render. */
export const RENDER = {
  antialias: true,
  /** Tope de devicePixelRatio: proteger el frame rate en pantallas HiDPI. */
  maxPixelRatio: 2,
  /**
   * Frames sobre los que se promedia el contador de FPS. El valor instantáneo
   * de un solo frame salta demasiado para leerlo.
   */
  fpsSampleFrames: 30,
}
