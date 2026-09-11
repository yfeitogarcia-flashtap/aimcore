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
   * Verde FlickLAB. Color de marca para los botones de acción principal
   * —JUGAR, REANUDAR, REINICIAR—. No se usa en ningún otro sitio: el naranja
   * sigue siendo el acento de la interfaz y el HUD se queda en blanco y gris.
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
  /** Velocidad de las dianas en modo dinámico, en unidades por segundo. */
  moveSpeed: 4.0,
  /**
   * Tiempo máximo persiguiendo un mismo destino antes de elegir otro. Sin
   * esto, un destino lejano daría carreras largas y previsibles en línea recta.
   */
  moveMaxSeconds: 2.5,
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
    parts: [
      {
        zone: 'head',
        shape: 'sphere',
        radius: 0.278,
        offsetY: 3.723,
        damage: 100,
        color: COLORS.targetHead,
      },
      {
        zone: 'torso',
        shape: 'capsule',
        radius: 0.489,
        height: 1.556,
        offsetY: 2.667,
        damage: 50,
        color: COLORS.target,
      },
      {
        zone: 'legs',
        shape: 'cylinder',
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

/** Teclas de acción del arma, en códigos físicos. */
export const WEAPON_KEYS = {
  reload: ['KeyR'],
}

/**
 * Panel de acciones rápidas: un tablero dentro de la sala que se acciona a
 * tiros, sin gesto para abrirlo.
 *
 * Se dibuja con CSS3DRenderer —es DOM de verdad colocado en el espacio— para
 * reutilizar la tipografía y el verde de marca sin repintarlos en WebGL. Va a
 * la derecha del punto de aparición, fuera del abanico de las dianas, y a una
 * altura desde la que se ve girando la cabeza sin buscarlo.
 */
export const ACTION_PANEL = {
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
 * - `supportsSuppressor`: si admite silenciador. El interruptor del panel sólo
 *   aparece con un arma que lo admita.
 * - `rpm`: disparos por minuto. Fija el intervalo mínimo entre disparos, y en
 *   las semiautomáticas actúa además de tope por si se hace clic muy rápido.
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
  'scalar-2': {
    label: 'Scalar-2',
    character: 'sin retroceso',
    mode: 'semi',
    rpm: 500,
    magazine: 18,
    reloadMs: 1200,
    supportsSuppressor: true,
    // Arquetipo por defecto: se dispara exactamente como antes de que hubiera
    // armas. Sin patrón, no hay empuje de cámara en absoluto.
    recoil: [],
  },
  'axis-7': {
    label: 'Axis-7',
    character: 'rifle',
    mode: 'auto',
    rpm: 600,
    magazine: 30,
    reloadMs: 2300,
    supportsSuppressor: false,
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
  'vertex-9': {
    label: 'Vertex-9',
    character: 'SMG',
    mode: 'auto',
    rpm: 800,
    magazine: 25,
    reloadMs: 1800,
    supportsSuppressor: true,
    // Patada más inmediata que la del Axis-7 —el primer disparo ya empuja más—
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
 * Variante con movimiento del jugador.
 *
 * `enabled` es el único interruptor: con `false` el prototipo se comporta
 * exactamente igual que la línea base de puntería pura (jugador clavado en el
 * centro y cono de aparición siguiendo la mirada). Con `true` se activan
 * teclado, salto y agachado, y el cono pasa a apuntar en una dirección fija
 * del mundo.
 */
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
   * Margen que se deja libre junto a cada pared. El desplazamiento ya no está
   * acotado a un radio artificial: el jugador recorre la sala entera y lo
   * único que lo frena son las paredes.
   */
  wallMargin: 1.5,

  /**
   * Teclas por acción, en códigos físicos (`KeyboardEvent.code`): funcionan
   * igual en QWERTY, AZERTY o Dvorak.
   *
   * Ojo con CTRL: el navegador se queda con algunos atajos. `preventDefault`
   * neutraliza Ctrl+A/S/D, pero **Ctrl+W cierra la pestaña en Chrome y no hay
   * forma de impedirlo desde la página** — y agacharse avanzando es
   * justamente Ctrl+W. Por eso `KeyC` va también mapeado a agacharse. Quítalo
   * de la lista si prefieres sólo CTRL.
   */
  keys: {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    walk: ['ShiftLeft', 'ShiftRight'],
    crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
  },
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
   * Con anclajes curados, lo que se espera antes de reintentar cuando ninguno
   * está visible desde donde está el jugador. Sin esta espera el motor volvería
   * a comprobar visibilidad en cada frame, que es justo lo que no debe hacer.
   */
  anchorRetryMs: 150,

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
  weapon: {
    label: 'Arma',
    default: 'scalar-2',
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
  suppressor: {
    label: 'Silenciador',
    default: false,
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
  dynamic: {
    label: 'Modo dinámico',
    default: false,
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
   * Scalar-2, con el que se confundía: aquel es un chasquido con pasa-banda a
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
     * El jugador aparece en el Vestíbulo, mirando hacia -Z, que es la dirección
     * fija del cono de aparición. El panel de acciones se ancla a este punto.
     */
    spawn: { x: 0, z: 28 },

    boxes: [
      // --- La Espina: parte el mapa de norte a sur. El único hueco es La
      // Puerta, de 4 u, entre z = -4 y z = 0.
      { x: -15, z: -22, w: 1.5, d: 18, kind: 'alta' },
      { x: -15, z: 0, w: 1.5, d: 22, kind: 'alta' },

      // --- Vestíbulo: la divisoria que obliga a elegir salida.
      { x: -4, z: 22, w: 20, d: 1.5, kind: 'alta' },

      // --- El Largo: tres Media escalonadas a un lado y otro del carril.
      { x: -36, z: 6, w: 7, d: 3, kind: 'media' },
      { x: -24, z: -8, w: 7, d: 3, kind: 'media' },
      { x: -34, z: -22, w: 7, d: 3, kind: 'media' },

      // --- Aproximación a La Puerta, una por cada boca.
      { x: -11, z: -9, w: 4, d: 3, kind: 'media' },
      { x: -12, z: 2, w: 4, d: 3, kind: 'media' },

      // --- Los Cajones: racimo de corta distancia, separaciones de 4 a 7 u.
      { x: -10, z: 16, w: 5, d: 5, kind: 'baja' },
      { x: 6, z: 5, w: 5, d: 5, kind: 'baja' },
      { x: 22, z: 14, w: 5, d: 5, kind: 'baja' },
      { x: 30, z: 3, w: 5, d: 5, kind: 'baja' },
      { x: 0, z: 9, w: 6, d: 4, kind: 'bordillo' },
      { x: 15, z: 18, w: 6, d: 4, kind: 'bordillo' },
      // Divisoria que parte la zona en dos bolsas.
      { x: 13, z: 4, w: 3, d: 10, kind: 'alta' },

      // --- Pasillo trasero: ruta de rotación.
      { x: 4, z: -14, w: 7, d: 3, kind: 'media' },

      // --- El Balcón: plataforma corrida al fondo.
      // Llega hasta ±39 y z -39 a propósito: el jugador se puede acercar a las
      // paredes hasta ROOM/2 - MOVEMENT.wallMargin (±38.5), y si la plataforma
      // se quedase corta habría una rendija por la que caerse por detrás.
      { x: -39, z: -39, w: 78, d: 11, kind: 'plataforma' },
      // Parapeto sobre el borde delantero, con dos troneras abiertas entre
      // x -34..-30 y x -24..-20. Por ahí, y sólo por ahí, se ve el Largo.
      { x: -39, z: -29.5, w: 5, d: 1.5, kind: 'parapeto', base: 'plataforma' },
      { x: -30, z: -29.5, w: 6, d: 1.5, kind: 'parapeto', base: 'plataforma' },
      { x: -20, z: -29.5, w: 40, d: 1.5, kind: 'parapeto', base: 'plataforma' },
    ],

    ramps: [
      // Acceso al Balcón por la derecha: sube de 0 en z = -16 a 2.6 en z = -28,
      // donde engancha con el borde de la plataforma.
      { x: 26, z: -28, w: 6, d: 12, fromZ: -16, toZ: -28, top: 'plataforma' },
    ],

    /**
     * Sitios posibles del explosivo, curados igual que los anclajes. Repartidos
     * por zonas distintas para que buscarlo sea un recorrido real, y ninguno en
     * el Vestíbulo: aparecer encima del spawn no es un objetivo, es un regalo.
     */
    objectiveSites: [
      { id: 'largo-fondo', x: -30, y: 0, z: -25, zone: 'El Largo' },
      { id: 'balcon', x: -28, y: 'plataforma', z: -33, zone: 'El Balcón' },
      { id: 'cajones-este', x: 26, y: 0, z: 8, zone: 'Los Cajones' },
      { id: 'puerta-sur', x: -10, y: 0, z: -16, zone: 'La Puerta' },
      { id: 'pasillo', x: 16, y: 0, z: -22, zone: 'Pasillo trasero' },
    ],

    anchors: [
      // --- El Largo: lo lejano, detrás de la cobertura escalonada.
      { id: 'largo-1', x: -32, y: 0, z: -14, zone: 'El Largo', peek: true },
      { id: 'largo-2', x: -20, y: 0, z: -24, zone: 'El Largo', peek: true },
      { id: 'largo-3', x: -34, y: 0, z: 2, zone: 'El Largo', peek: true },

      // --- Troneras del Balcón: elevadas, en los huecos del parapeto.
      { id: 'tronera-o', x: -32, y: 'plataforma', z: -29, zone: 'El Balcón', peek: false },
      { id: 'tronera-e', x: -22, y: 'plataforma', z: -29, zone: 'El Balcón', peek: false },

      // --- Bocas de La Puerta, una a cada lado de la Espina.
      { id: 'puerta-o', x: -18, y: 0, z: -2, zone: 'La Puerta', peek: false },
      { id: 'puerta-e', x: -9, y: 0, z: -2, zone: 'La Puerta', peek: false },

      // --- Los Cajones: corta distancia, asomada agachado.
      { id: 'cajon-1', x: -7, y: 0, z: 13, zone: 'Los Cajones', peek: true },
      { id: 'cajon-2', x: 8, y: 0, z: 2, zone: 'Los Cajones', peek: true },
      { id: 'cajon-3', x: 24, y: 0, z: 11, zone: 'Los Cajones', peek: true },
      { id: 'cajon-4', x: 33, y: 0, z: 10, zone: 'Los Cajones', peek: false },

      // --- Vestíbulo. Los dos tienen que verse **desde el propio spawn**: la
      // divisoria tapa todo lo que hay de frente, así que sin ellos la sesión
      // arrancaría sin ninguna diana a la vista hasta que el jugador se moviera.
      //
      // El este estaba en la boca de salida, en x 22, y quedaba **detrás del
      // tablero de acciones** —que ocupa de x 18 a la pared—: una diana pegada a
      // un botón hace imposible pulsarlo. Se movió al otro lado del tablero y
      // por detrás del spawn, donde está a 10 u de la pizarra y a 41° de ella
      // vista desde el punto de aparición. De paso obliga a girarse, que en un
      // aim trainer no sobra.
      { id: 'vestibulo-o', x: -12, y: 0, z: 22.7, zone: 'Vestíbulo', peek: false },
      { id: 'vestibulo-e', x: 8, y: 0, z: 35, zone: 'Vestíbulo', peek: false },
    ],
  },
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
  /** Tecla de desactivación. Soltar cancela el progreso, sin penalización. */
  defuseKeys: ['KeyE'],

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
    /** RESERVADO: daño recibido. La mecánica no existe todavía. */
    damage: 0,
    /** RESERVADO: muertes y reinicios. La mecánica no existe todavía. */
    deaths: 0,
  },

  /**
   * Referencias para normalizar las variables reservadas cuando se implementen.
   * Con peso 0 no se usan, pero dejarlas escritas evita tener que inventarlas
   * más tarde.
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
