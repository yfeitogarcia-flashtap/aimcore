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
    /** Ver `precisionTarget` de Scalar-2. */
    precisionTarget: 0.5,
    /**
     * **Cuánto daño al cuerpo se come el escudo** cuando el que dispara lleva
     * esta arma, en tanto por uno. Fijo por arma y **sin variación por
     * distancia** todavía: es la primera versión de la mecánica. El escudo
     * cubre torso y piernas; la cabeza no, y por eso esto no la toca.
     */
    shieldAbsorb: 0.45,
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
    /** Ver `precisionTarget` de Scalar-2. */
    precisionTarget: 0.4,
    /**
     * **Cuánto daño al cuerpo se come el escudo** cuando el que dispara lleva
     * esta arma, en tanto por uno. Fijo por arma y **sin variación por
     * distancia** todavía: es la primera versión de la mecánica. El escudo
     * cubre torso y piernas; la cabeza no, y por eso esto no la toca.
     */
    shieldAbsorb: 0.35,
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
  suppressor: { label: 'Silenciador', default: 'KeyB', group: 'Combate' },
  /**
   * **La acción contextual.** Dentro del radio de algo con lo que se puede
   * interactuar —hoy sólo el explosivo— desactiva, y **nunca hace otra cosa ahí
   * dentro**: que la misma tecla saque un artilugio a un metro de la bomba es
   * como se pierden rondas. Fuera de ese radio equipa el lanzacohetes, que
   * todavía no existe.
   */
  use: { label: 'Usar / artilugio', default: 'KeyE', contextual: true, group: 'Combate' },

  primary: { label: 'Arma principal', default: 'Digit1', reserved: true, group: 'Equipo' },
  secondary: { label: 'Pistola', default: 'Digit2', reserved: true, group: 'Equipo' },
  melee: { label: 'Cuerpo a cuerpo', default: 'Digit3', reserved: true, group: 'Equipo' },
  // El escudo ya no está reservado: aplica una carga del inventario (ver
  // `PLAYER.shield`). Las otras cuatro y el arrojadizo siguen siendo sólo tecla.
  shield: { label: 'Escudo', default: 'Digit4', group: 'Equipo' },
  gadget: { label: 'Artilugio', default: 'Digit5', reserved: true, group: 'Equipo' },
  throwable: { label: 'Arrojadizo', default: 'KeyG', reserved: true, group: 'Equipo' },

  avatarDebug: { label: 'Vista del avatar', default: 'F3', group: 'Depuración' },
}

/**
 * Teclas que el sistema de binds no acepta nunca, pase lo que pase en
 * localStorage. Escape es la pausa y la salida del pointer lock; F5 y F12 se las
 * queda el navegador y capturarlas sólo sirve para romperle la recarga a alguien.
 */
export const FORBIDDEN_KEYS = ['Escape', 'F5', 'F11', 'F12', 'Tab']

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
     * fija del cono de aparición. El panel de acciones se ancla a este punto.
     */
    spawn: { x: 0, z: 14 },

    boxes: [
      // --- La Espina: parte el mapa de norte a sur. El único hueco es La
      // Puerta, de 2.5 u, entre z = -2 y z = 0.5.
      { x: -8, z: -11, w: 1.2, d: 9, kind: 'alta' },
      { x: -8, z: 0.5, w: 1.2, d: 10.5, kind: 'alta' },

      // --- Vestíbulo: la divisoria que obliga a elegir salida. Va entera al
      // este del spawn y deja abierto el paso central: es lo que hace que desde
      // el punto de aparición se vea de verdad hacia delante en lugar de tener
      // un muro a dos metros (ver el comentario de los anclajes). Y arranca en
      // x 2.5, no en x 1: a media sala de distancia, un muro Alta que empieza a
      // 24° de la mirada inicial se come un tercio de la pantalla. Desde 2.5
      // entra a 43°, ya en el borde del encuadre.
      { x: 2.5, z: 10, w: 6, d: 1.3, kind: 'alta' },

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
      {
        id: 'vestibulo-1',
        zone: 'Vestíbulo',
        peek: false,
        points: [
          { id: 'vestibulo-1-a', x: 6.5, z: 12.5 },
          { id: 'vestibulo-1-b', x: 7.5, z: 15.5 },
          { id: 'vestibulo-1-c', x: 5.5, z: 17.5 },
          { id: 'vestibulo-1-d', x: 2.5, z: 18.5 },
        ],
      },
      {
        id: 'vestibulo-2',
        zone: 'Vestíbulo',
        peek: false,
        points: [
          { id: 'vestibulo-2-a', x: -5.5, z: 15.5 },
          { id: 'vestibulo-2-b', x: -4.5, z: 18.5 },
          { id: 'vestibulo-2-c', x: -8.5, z: 18.5 },
          { id: 'vestibulo-2-d', x: -11.5, z: 18.5 },
          { id: 'vestibulo-2-e', x: -14.5, z: 18.5 },
        ],
      },
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
 * **Dos parámetros de dificultad**, que son los que hay que tocar para hacerlo
 * más fácil o más difícil: `spreadDeg` (cuánto falla) y `reactionMs` (cuánto
 * tarda en reaccionar). La velocidad de movimiento no está aquí a propósito: ya
 * es un ajuste del panel (`patrolSpeed`), y tener dos sitios donde se decide lo
 * mismo es como se desincronizan.
 */
export const ENEMY = {
  /** Con qué disparan. Una entrada de `WEAPONS`, sin copiar ni un número. */
  weapon: 'axis-7',
  /**
   * Distancia de enganche, en unidades. Más allá no disparan aunque vean: el
   * mapa mide 40 y sin este límite un muñeco del fondo del Balcón hostigaría
   * desde el primer segundo.
   */
  engageRange: 24,

  /**
   * DIFICULTAD 1 — **precisión**: semiángulo del cono de dispersión.
   *
   * Parece enorme para un tirador, y no lo es: el disparo es instantáneo y va
   * a donde estás **ahora**, así que moverse no le hace fallar ni un poco. Todo
   * lo que falla un muñeco sale de aquí. Medido de pie en el spawn del Plano A:
   * con 4.5° entra el 84% de los disparos, con 9° el 54%.
   */
  spreadDeg: 9,
  /** DIFICULTAD 2 — **reacción**: lo que tarda en abrir fuego desde que te ve. */
  reactionMs: 650,

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
   * A qué parte del jugador apuntan, como fracción de su altura: 0 los pies, 1
   * la coronilla. **Al centro del cuerpo, y no más arriba**: la cabeza empieza
   * en 0.86 y vale 100 de 100, así que apuntar al pecho alto convertía cada
   * ráfaga en una lotería de muertes instantáneas. Medido de pie en el spawn del
   * Plano A con ocho muñecos: apuntando a 0.78 el 11% de los impactos eran a la
   * cabeza —y cada uno mata—; a 0.55, el 4%. El cono se reparte entre torso y
   * piernas y la cabeza vuelve a ser lo que tiene que ser: mala suerte.
   */
  aimHeightFactor: 0.55,
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
export const AVATAR = {
  /**
   * Piel base: negro. **Una variable, no un sistema de skins** —eso depende de
   * economía y cuentas, que no existen—. `setColor()` cambia ésta y con ella
   * todos los paneles; la luz se queda como está.
   */
  color: '#101014',
  /**
   * **Canal de luz**, hoy fijo y mañana el color de equipo: las dos líneas
   * continuas —por delante y por detrás—, el visor y el núcleo. El mismo azul
   * eléctrico del escudo y de sus recargas.
   */
  teamColor: COLORS.electric,
  /**
   * Filo de los paneles. Un gris de la misma rampa, **un escalón por encima** de
   * la grilla del cuerpo: con la piel en negro, el filo es lo que dibuja la
   * silueta, y si se iguala con la rejilla el modelo se lee como una mancha.
   */
  edgeColor: '#6E6E6E',
  /**
   * La grilla del cuerpo, con **el par del suelo** y no el de las paredes: es
   * el más presente de los dos (ver `COLORS`), y sobre negro el de las paredes
   * no se ve. Misma grilla, mismo generador, el par que se lee.
   */
  gridColor: COLORS.gridFloor,
  gridAccentColor: COLORS.gridFloorAccent,
  /**
   * Paso de la grilla sobre el cuerpo. La sala usa 1 u, que sobre un torso de
   * 0.35 daría **ninguna** línea: es la misma grilla a escala de cuerpo, no otra.
   *
   * Bajó de 0.12 a 0.045 al pasar el cuerpo de cajas a prismas de seis y ocho
   * caras: con ocho caras, cada una mide 0.145 de ancho, y un paso de 0.12 sólo
   * cabía una vez. La referencia tiene del orden de ocho subdivisiones a lo
   * ancho del cuerpo, y eso es 0.045.
   */
  gridStep: 0.045,
  gridAccentEvery: 4,
  /**
   * Tonos por pieza, como factor de brillo sobre la piel. Con la piel en negro
   * apenas separan; están por lo que pase el día que alguien pinte el avatar de
   * un color con recorrido.
   */
  shades: { chest: 1, limb: 0.62, joint: 0.34, boot: 0.26 },

  /**
   * **La figura, medida sobre las referencias.**
   *
   * Todo lo de aquí sale de medir píxel a píxel —barriendo la silueta fila a
   * fila— y **no de elegir números bonitos**. Son dos referencias y cada una
   * pone lo suyo: `player-avatar-style.png` es una vista frontal y de ahí salen
   * `levels`, `widths`, `armX`, `legX` y el recorrido de las líneas;
   * `player-avatar-turnaround.png` trae seis vistas y de sus dos perfiles sale
   * `depths`, que hasta la vuelta 36 era lo único estimado. Está en
   * **fracciones de la altura total**, que es lo que hace que las proporciones
   * aguanten aunque el muñeco cambie de tamaño: la altura la sigue poniendo
   * `TARGET_TYPES.hitbox`, la forma la pone esto.
   *
   * `levels` va desde el suelo (0) a la coronilla (1). `widths` es el ancho de
   * la pieza a esa altura. Los sitios donde una extremidad se estrecha y los
   * sitios donde se ensancha están medidos por separado a propósito: **esa
   * diferencia es la anatomía**, y es justo lo que no tenía el modelo de cajas.
   */
  figure: {
    /**
     * Alturas, del suelo (0) a la coronilla (1). Las tres que marcan zona
     * —barbilla 0.869, cadera 0.470— caen sobre las bandas del hitbox (0.861 y
     * 0.472) sin forzar nada: la referencia y el muñeco tienen las mismas
     * proporciones humanas.
     */
    levels: {
      ankle: 0.070,
      calf: 0.193,
      knee: 0.255,
      thighNarrow: 0.317,
      hip: 0.470,
      wrist: 0.505,
      waist: 0.640,
      elbow: 0.607,
      armNarrow: 0.690,
      ribs: 0.660,
      chest: 0.750,
      shoulder: 0.790,
      neck: 0.845,
      chin: 0.869,
      temples: 0.938,
    },
    widths: {
      // Cabeza: ancha en las sienes, cerrada arriba y en la barbilla.
      crown: 0.082,
      temples: 0.103,
      chin: 0.062,
      neck: 0.081,
      // Tronco: reloj de arena. La cintura es el punto más estrecho (0.134
      // contra 0.202 del pecho), y de ahí se abre otra vez a la cadera.
      chest: 0.202,
      ribs: 0.160,
      waist: 0.134,
      hip: 0.195,
      crotch: 0.175,
      // Hombrera: la pieza más ancha del cuerpo, y va por fuera del brazo.
      pauldron: 0.117,
      shoulderSpan: 0.284,
      // Brazo: 0.036 arriba, 0.028 justo antes del codo, 0.059 **en** el codo.
      // Esa diferencia es la articulación, y es lo que no tenían las cajas.
      armUpper: 0.036,
      armNarrow: 0.028,
      elbow: 0.059,
      forearm: 0.039,
      wrist: 0.030,
      hand: 0.050,
      // Dedos: la mano mide 0.050 de ancho y son cuatro, así que el dedo sale
      // en 0.0105 y la separación entre ejes en 0.0118.
      finger: 0.0105,
      fingerTip: 0.0078,
      thumb: 0.015,
      // Pierna: 0.086 en la cadera, 0.058 antes de la rodilla, 0.086 en ella.
      thighTop: 0.086,
      thighNarrow: 0.058,
      knee: 0.086,
      shinTop: 0.078,
      calf: 0.065,
      ankle: 0.042,
      boot: 0.078,
      // Talón: más estrecho que el antepié. Sale de la vista inferior, que es
      // la primera que enseña la suela.
      heel: 0.060,
    },
    /**
     * **Profundidad a cada altura, medida — por fin — sobre las dos vistas de
     * perfil.**
     *
     * Hasta la vuelta 36 esto eran siete multiplicadores sobre el ancho («el
     * torso es 0.74 de lo que mide de ancho») y era **lo único de `figure` que
     * no salía de una imagen**: la referencia de estilo es una vista frontal, y
     * de frente no hay profundidad que medir. Con las dos vistas de perfil de
     * `Reference/Avatar/player-avatar-turnaround.png` esto pasa a las mismas
     * unidades que `widths`: **fracciones de la altura total**, no factores.
     *
     * Lo que cambió al medirlo no es un retoque. El fondo del torso es **casi
     * constante** de pecho a cadera (0.134 → 0.122) mientras el ancho hace un
     * reloj de arena (0.202 → 0.134 → 0.195): un multiplicador único no puede
     * dar eso, y por eso la cintura salía plana y la cadera hinchada. Y la bota
     * medía 0.148 de largo contra los 0.180 de la referencia, con el pie mucho
     * menos adelantado de lo que está.
     *
     * **El brazo es la excepción, y está marcada.** De perfil cuelga por delante
     * del torso y no hay **ni una fila** en la que sea él quien pone la silueta:
     * ni umbral ni relleno lo separan. Sus valores salen de la única pieza del
     * brazo que sí se mide —la hombrera, 0.137 de fondo contra 0.117 de ancho—
     * y se afinan de ahí a la muñeca. Da igual de cara al banco de siluetas:
     * dentro del contorno del torso, un error de fondo en el brazo no se ve ni
     * de frente ni de perfil.
     */
    depths: {
      // Cabeza: el casco es lo más profundo del cuerpo después de la hombrera,
      // y su punto máximo está en las sienes (0.938), no arriba.
      crown: 0.075,
      temples: 0.119,
      headMid: 0.107,
      jaw: 0.103,
      chin: 0.082,
      neck: 0.087,
      neckBase: 0.113,
      // Tronco.
      torsoTop: 0.126,
      chest: 0.134,
      ribs: 0.120,
      waist: 0.112,
      hip: 0.122,
      crotch: 0.125,
      // Deltoides: el punto más profundo de todo el cuerpo (nivel 0.79).
      pauldron: 0.137,
      // Brazo: ver la nota de arriba. Es lo que el perfil no da.
      armUpper: 0.041,
      armNarrow: 0.032,
      elbow: 0.062,
      forearm: 0.041,
      wrist: 0.030,
      hand: 0.028,
      finger: 0.020,
      // Pierna: el cuádriceps a 0.101 y el gemelo a 0.067, los dos medidos.
      thighTop: 0.101,
      thighMid: 0.079,
      thighNarrow: 0.076,
      knee: 0.084,
      shinTop: 0.084,
      calf: 0.067,
      ankle: 0.044,
      // Bota: lo que más cambió. La suela mide 0.180 de la puntera al talón.
      bootShaft: 0.052,
      bootAnkle: 0.068,
      bootInstep: 0.074,
      bootFoot: 0.146,
      sole: 0.136,
      heel: 0.049,
    },
    /**
     * **La bota, medida de perfil y por debajo.** Alturas en fracciones de la
     * altura total y `z` el desplazamiento **hacia delante** del centro de cada
     * anillo: el pie no está centrado en el eje de la pierna, la suela sale
     * 0.066 por delante y el talón se queda 0.020 por detrás. Medido igual en
     * las dos vistas de perfil, hasta el cuarto decimal.
     *
     * De la vista inferior sale lo otro que no se veía: la **suela es una pieza
     * aparte del pie y el talón otra**, y el talón es más estrecho que el
     * antepié (0.060 contra 0.078).
     */
    boot: {
      shaftTop: 0.105,
      instep: 0.062,
      toe: 0.026,
      soleTop: 0.014,
      heelTop: 0.042,
      z: { shaft: 0.002, ankle: 0.005, instep: 0.012, foot: 0.054, sole: 0.066, heel: -0.020 },
    },
    /**
     * **La mano, con los dedos separados.** `knuckles` es la altura de los
     * nudillos, `length` lo que bajan los dedos desde ahí y `spread` la
     * separación entre ejes. Cuatro dedos de distinto largo y un pulgar que sale
     * por delante: la palma mira hacia atrás, como en la referencia.
     */
    hand: {
      knuckles: 0.455,
      length: 0.037,
      spread: 0.0118,
      largo: [0.86, 1, 0.96, 0.8],
      thumbY: 0.474,
      thumbLength: 0.028,
    },
    /**
     * **Dónde cae el eje de cada brazo**, medido fila a fila sobre la
     * referencia: no cuelga recto, se abre de 0.136 en el hombro a 0.177 en la
     * muñeca. Es la pose en A de siempre, y sin ella los brazos se meten dentro
     * del tronco —que mide 0.101 de medio ancho en el pecho— o quedan pegados
     * como dos tablas.
     */
    armX: { shoulder: 0.136, elbow: 0.152, wrist: 0.177 },
    /**
     * La hombrera va **por dentro**: su centro cae a 0.086 y su borde exterior a
     * 0.145, que es la mitad de la envergadura. Es una tapa sobre el hombro, no
     * una pieza colgada del brazo.
     */
    pauldronX: 0.086,
    /**
     * **El eje de cada pierna no es vertical**: se abre de 0.069 en la cadera a
     * 0.100 en la suela. Salió de comparar siluetas a la misma altura —las
     * pantorrillas nos salían un 25% estrechas y no era el grosor, era que las
     * dos piernas estaban demasiado juntas—. La postura de la referencia apoya
     * más ancho de lo que arranca.
     */
    legX: { hip: 0.069, thighNarrow: 0.071, knee: 0.077, calf: 0.092, ankle: 0.098, sole: 0.100 },
    /**
     * Caras de cada prisma: más en el tronco, menos en las extremidades.
     *
     * La hombrera pasó a ocho en la vuelta 36 y no por gusto: **la vista cenital
     * la enseña por arriba**, y con seis caras y una sola pieza se leía como una
     * tapa lisa. Con ocho y partida en dos —casquete y alerón— tiene facetas que
     * se ven desde arriba, que es de donde se miran.
     *
     * El pie va aparte del resto de la bota (`foot`) y también a ocho, y por lo
     * contrario: con cuatro, la puntera es un filo y la bota entera se lee como
     * una cuña de cartón. Ocho caras le dan chaflán. Seis no valen para ninguna
     * de las dos cosas: con los vértices a medio paso, un prisma de seis tiene
     * **vértice** al frente y uno de ocho tiene **cara**.
     */
    sides: { torso: 8, head: 6, limb: 6, joint: 6, boot: 4, foot: 8, pauldron: 8, finger: 4 },
  },

  /**
   * El núcleo del pecho, en fracciones de la altura total. Es la pista visual
   * de la carga eléctrica del escudo, y lo único del canal de luz que no es
   * una línea.
   */
  coreRadius: 0.032,

  /**
   * **Las dos líneas de luz.** No son tramos sueltos por las piezas: son dos
   * filamentos **continuos** que bajan de la coronilla a las botas —cara,
   * esternón, ingle y cara interna de cada pierna— separándose por el camino, y
   * **el mismo par por la espalda**, para que el color de equipo se reconozca
   * igual de frente que de espaldas.
   *
   * Los `spread` son la separación entre las dos líneas en cada altura, en
   * fracciones de la altura total: la inclinación de cada tramo sale de unir un
   * punto con el siguiente, no de un ángulo escrito a mano.
   *
   * `width` va fino a propósito: es un filamento, no una pechera; con el doble
   * de grosor el azul se comía el modelo entero.
   */
  stripWidth: 0.0085,
  /**
   * **Por dónde pasan**, nivel a nivel y en fracciones de la altura: la
   * separación de cada línea respecto al eje. Está medida sobre la referencia
   * igual que los anchos —las líneas son el único azul saturado de la imagen, así
   * que se localizan por tono— y no es una interpolación entre tres números.
   *
   * El recorrido tiene una forma que no se adivina: **se abren en el collar
   * (0.056), se cierran en el ombligo (0.035) y a partir de ahí sólo se
   * separan** hasta la bota. Con tres valores sueltos salía al revés —cerradas
   * en el pecho y abiertas en la cintura— y el pecho se leía como una X.
   */
  stripSpread: {
    crown: 0.029,
    chin: 0.050,
    shoulder: 0.056,
    chest: 0.042,
    waist: 0.035,
    hip: 0.062,
    thighNarrow: 0.080,
    knee: 0.084,
    calf: 0.092,
    ankle: 0.102,
  },
  stripOffset: 0.004,
  /**
   * **El canal de la línea de luz.** Desde la vuelta 36 la línea no va pegada
   * *sobre* la piel: va **dentro de una hendidura** que corre por el mismo
   * recorrido medido, y su cara exterior queda a ras de cuerpo mientras los
   * labios del canal sobresalen.
   *
   * Con piezas opacas y sin CSG, un canal no se puede **restar**: un hueco
   * tallado en un prisma sigue tapado por la propia cara del prisma y no se ve.
   * Así que se levanta: dos labios a los lados del recorrido y la barra al
   * fondo. El relieve es el mismo, y lo que se buscaba también —de refilón el
   * labio tapa la línea, y la línea deja de flotar por encima de la piel—.
   *
   * `width` es el hueco libre entre labios, `rail` el grosor de cada labio y
   * `rise` lo que sobresalen: la barra queda `rise - stripOffset` por debajo del
   * borde, que es el fondo del canal.
   */
  lightChannel: { width: 0.018, rail: 0.005, rise: 0.006 },

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
