/**
 * Motor del prototipo: render, sesión, input y detección de aciertos.
 *
 * Vive completamente fuera de React. React sólo pinta el HUD y recibe avisos
 * por callback, de modo que el bucle de render nunca provoca re-renders.
 *
 * Contrato de rendimiento del bucle:
 *  - Un único `requestAnimationFrame`, atado al refresco real del monitor.
 *  - Nada de alocaciones ni de creación de geometría por frame.
 *  - El único trabajo por frame es: animar los pops, comprobar el reloj y
 *    renderizar.
 */

import * as THREE from 'three'
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { ACCURACY, ACTION_PANEL, AVATAR, CAMERA, CLAVADAS, COVER, EDITOR, FOOTSTEPS, FRAME_LIMITS, GRENADES, HELP, IMPACTS, LOOK, MELEE_WEAPON, MOVEMENT, NET, OBJECTIVE, PLAYER, PROJECTILES, RECOIL_RESET_MS, RENDER, SCOPE, SECONDARY_WEAPON, SESSION_DURATION_S, SESSION_DURATIONS, SESSION_MODES, SIM, SIM_STEP_MS, SURFACES, TARGET, TEAMS, THROWABLE_WEAPONS, TRAJECTORY, WEAPONS, weaponSpeedFactor } from '../config.js'
import { createScene } from './scene.js'
import { Scenario } from './scenario.js'
import { Scope } from './scope.js'
import { Slash } from './slash.js'
import { Granadas } from './granadas.js'
import { hasLineOfSight } from './sight.js'
import { Objective, OUTCOME } from './objective.js'
import { computeScore } from './scoring.js'
import { createSceneTransition } from './transition.js'
import { LookControls } from './lookControls.js'
import { MovementController } from './movement.js'
import { TargetManager } from './targets.js'
import { initAudio, playBow, playDamage, playEquip, playGrenade, playRocket, playThrow, playDevice, playFootstep, playHeal, playHelmetCrack, playHit, playKill, playLanding, playMelee, playObjectiveDefused, playObjectiveExplosion, playShieldCharge, playUiConfirm } from '../audio/sfx.js'
import { loadWeaponSamples, playDrySound, playWeaponReload, playWeaponShot } from '../audio/samples.js'
import { attachListener, createEmitter, detachListener, setSpatialEnabled } from '../audio/spatial.js'
import { ActionPanel } from './actionPanel.js'
import { Avatar } from './avatar.js'
import { EnemyFire } from './enemyFire.js'
import { DummyMarkers, facingDesdeCamara } from './markers.js'
import { MuzzleFlash } from './muzzleFlash.js'
import { Dispositivos } from './dispositivos.js'
import { Impacts } from './impacts.js'
import { Proyectiles, caidaDeArea, lanzamientoDeArma } from './proyectiles.js'
import { Trayectoria } from './trayectoria.js'
import { direccionDeMira, perdigonDeSemilla } from '../../net/disparo.js'
import { Clavadas } from './clavadas.js'
import { VueloDeProyectiles } from './vuelo.js'
import { SpawnCone } from './spawnCone.js'
import { PickupField } from './pickups.js'
import { PlayerStatus, esPorLaEspalda, hitPlayer, playerBody } from './player.js'
import { getSettings, subscribeSettings, updateSettings } from '../settings.js'
import { eventCode, getKeybinds, keysOf, subscribeKeybinds, typingInField } from '../keybinds.js'

/** Centro exacto de la pantalla: el crosshair no se mueve, así que es constante. */
const SCREEN_CENTER = new THREE.Vector2(0, 0)

/**
 * Cámara de mentira para pedirle a `playerBody` el cuerpo del rival sin alocar
 * nada por paso. Es la misma idea que `net/pose.js`, aquí porque el motor no
 * importa de `net/` — la red vive en `net/` y no entra en el juego (vuelta 45).
 */
const _cuerpoDelRival = { position: { x: 0, y: 0, z: 0 } }

const DEG_TO_RAD = Math.PI / 180

// Vectores de módulo para desviar el rayo: el disparo no aloca nada.
const _spreadU = new THREE.Vector3()
/** Eje del cono de aparición. De módulo: el bucle caliente no asigna. */
const _ejeCono = new THREE.Vector3()
const _spreadV = new THREE.Vector3()
const _spreadUp = new THREE.Vector3(0, 1, 0)
const _spreadFallback = new THREE.Vector3(1, 0, 0)
/** Para convertir rumbo+cabeceo en vector, desviarlo y volver. Ver `_miraConDesvio`. */
const _miraDir = new THREE.Vector3()
const _mira = { yaw: 0, pitch: 0 }
/** Hacia dónde mira la cámara, para saber de qué lado te han disparado. */
const _bearingForward = new THREE.Vector3()
/**
 * Lo que devuelve `_superficieBajoElRayo`, reutilizado: el bucle caliente no
 * asigna, y esto se consume en el acto.
 */
const _impacto = { punto: new THREE.Vector3(), normal: new THREE.Vector3(), distancia: 0 }
const _normales = new THREE.Matrix3()
const _dir = new THREE.Vector3()
/** Temporales del vuelo de un proyectil: el bucle caliente no asigna. */
const _punto = new THREE.Vector3()
const _origenRayo = new THREE.Vector3()
const _dirRayo = new THREE.Vector3()
/** Hacia dónde mira la cámara. Lo pregunta la ceguera, una vez por estallido. */
const _mirada = new THREE.Vector3()
const _golpeDeProyectil = { t: 0, victima: null, zona: null }
const _velSalida = { x: 0, y: 0, z: 0 }
const _desvio = { x: 0, y: 0, z: 0 }
const _lanzamiento = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, tipo: null, fuerza: 0, intensidad: 0 }

/**
 * **La fase de un rival real, que hoy no existe** (vuelta 56). `markers.js`
 * pide quién está en alerta y quién disparando, y eso es el estado de la
 * máquina de `enemyFire`: una persona no la tiene. Deducirlo desde fuera
 * mirando relojes sería la segunda copia que la vuelta 37 se negó a tener, así
 * que los dos iconos se quedan apagados hasta que el disparo del rival viaje en
 * la foto. La brújula y la ficha no dependen de esto.
 */
const _sinFase = () => 'idle'

/**
 * Desvía una dirección un ángulo aleatorio dentro de un cono de `spreadDeg`.
 *
 * Se aplica **al rayo, no a la cámara**: la dispersión es una desviación del
 * disparo, no un temblor de la mira. El retroceso sí mueve la cámara, así que
 * al desviar la dirección que ya lleva ese empuje los dos offsets se suman.
 *
 * @param {THREE.Vector3} direction se modifica en el sitio; queda normalizada
 */
function applySpread(direction, spreadDeg) {
  const theta = Math.random() * spreadDeg * DEG_TO_RAD
  if (theta <= 0) return
  const phi = Math.random() * Math.PI * 2

  // Base ortonormal perpendicular a la dirección de tiro.
  const reference = Math.abs(direction.y) > 0.99 ? _spreadFallback : _spreadUp
  _spreadU.crossVectors(reference, direction).normalize()
  _spreadV.crossVectors(direction, _spreadU).normalize()

  const sin = Math.sin(theta)
  direction
    .multiplyScalar(Math.cos(theta))
    .addScaledVector(_spreadU, sin * Math.cos(phi))
    .addScaledVector(_spreadV, sin * Math.sin(phi))
    .normalize()
}

export const PHASE = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
}

export class Engine {
  /**
   * **¿Admite esta plataforma el movimiento sin ajustar?** Se descubre al
   * primer intento y se recuerda para todos: es una propiedad del navegador, no
   * de una partida. Ver `requestLock`.
   */
  static _sinMovimientoCrudo = false

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onPhaseChange?: (phase: string) => void,
   *   onFrame?: (stats: object) => void,
   *   onShot?: (hit: boolean) => void,
   *   onFinish?: (summary: object) => void,
   * }} callbacks
   */
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [callbacks]
   * @param {{escenario?: string|object, dianas?: boolean}} [opciones] `escenario`
   *   **fija** el mapa y deja fuera el ajuste del jugador; `dianas: false` monta
   *   el mismo mundo sin muñecos. Las dos son opciones **del mundo que se monta**,
   *   no preferencias de nadie.
   */
  constructor(canvas, callbacks = {}, opciones = {}) {
    this.canvas = canvas
    this.callbacks = callbacks
    /**
     * **El escenario del duelo no es una preferencia del jugador** (vuelta 60).
     * Hasta la 58 la página del duelo lo conseguía llamando a `updateSettings`
     * antes de construir el motor, y eso tenía dos precios que se pagaban
     * callando: **le reescribía al jugador su escenario guardado** en cada
     * visita a un enlace de duelo —que es la mitad del «no se guarda la
     * configuración» que se veía jugando— y dejaba el mapa colgando del store,
     * así que cualquier cambio de ajuste en mitad de un duelo (la **V** del
     * silenciador, sin ir más lejos) reconstruía el escenario al del jugador
     * **en mitad de la partida**.
     *
     * Con esto el duelo dice qué mapa juega y no toca nada de nadie.
     */
    this._escenarioFijo = opciones.escenario ?? null

    /**
     * **Con esto puesto, disparar es apuntar** (vuelta 77): ver
     * `_shoot`. Lo enciende y lo apaga el editor en caliente, así que es un
     * campo y no una opción de construcción.
     */
    this.tiroDeHerramienta = false
    this._siguientePlantado = 0

    /**
     * **Que un mundo tenga muñecos es del mundo, no del jugador** (vuelta 76).
     *
     * Lo pide el editor —probar un mapa es medir su geometría, y un muñeco
     * disparándote mientras mides estorba— y entra por la misma puerta que el
     * escenario, por la misma razón: el ajuste `simultaneousTargets` es del
     * jugador y reescribírselo sería el fallo de la vuelta 60 otra vez.
     *
     * Y es esto y no quitarle las rutas al mapa: sin rutas las dianas **no
     * desaparecen**, se muestrean por cono como en la sala vacía. Lo que se
     * apaga aquí es el cupo (`maxAlive`) y la siembra, que es donde nacen.
     */
    this._conDianas = opciones.dianas !== false

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: RENDER.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio))

    const { scene, setRoom, setMuros, dispose: disposeScene } = createScene()
    this.scene = scene
    this._setRoom = setRoom
    this._setMuros = setMuros
    this._disposeScene = disposeScene

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
    /**
     * **La mirilla ampliada** (vuelta 70). `_scopeOn` es lo que el jugador
     * quiere y `_scopeT` dónde va la transición: 0 sin mirilla, 1 puesta. El
     * encuadre y la sensibilidad se interpolan con ese mismo número, así que no
     * pueden quedarse a medio camino el uno del otro.
     *
     * Las dos sensibilidades se guardan aquí y **se aplican siempre por
     * `_aplicarSensibilidad`**: `_applySettings` escribía directamente en los
     * controles, y eso, con la mirilla puesta, devolvía la de a pelo en cuanto
     * alguien tocara cualquier opción.
     */
    this._scopeOn = false
    this._scopeT = 0
    /**
     * **¿Hay alguien a distancia de cuchillo?** (vuelta 71). Es lo único que un
     * arma sin modelo en la mano puede decir **antes** de golpear, y por eso es
     * la mitad de su feedback: la mira lo dice cambiando de forma.
     */
    this._meleeRange = false
    /** Y si además está de espaldas: la otra mitad del aviso (vuelta 73). */
    this._meleeBack = false
    this._sensNormal = LOOK.sensitivity
    this._sensMirilla = LOOK.sensitivity

    this.controls = new LookControls(this.camera)

    // El escenario se monta antes que el movimiento: de él salen la colisión y
    // el punto de aparición.
    this.scenario = new Scenario(this.scene, this._escenarioFijo ?? getSettings().scenario)
    // La sala la manda el escenario: la grilla y las paredes se montan a su
    // medida, y con ellas el límite real de movimiento.
    this._setRoom(this.scenario.room)
    // **Con fondo, la rejilla de los muros no se dibuja** (vuelta 78): el
    // decorado viste la pared, y una rejilla por delante sería el interior de
    // la caja encima del paisaje.
    this._setMuros(!this.scenario.tieneFondo)

    this.movement = new MovementController(this.camera)
    this.movement.setScenario(this.scenario)
    this.movement.reset()
    // Con la variante de movimiento activa el cono deja de seguir la mirada:
    // nace en la posición del jugador y apunta a una dirección fija del mundo.
    this.targets = new TargetManager(this.scene, getSettings(), {
      anchoredAxis: MOVEMENT.enabled,
    })
    this.raycaster = new THREE.Raycaster()

    // Capa CSS3D: escena propia y renderizador propio, montados sobre el
    // canvas y con los eventos de puntero desactivados —el panel se dispara,
    // no se pulsa—.
    this.cssScene = new THREE.Scene()
    this.cssRenderer = new CSS3DRenderer()
    const cssElement = this.cssRenderer.domElement
    cssElement.className = 'app__css3d'
    // El único contrato con el motor es run(build): cómo se presente el cambio
    // es asunto exclusivo del módulo. Ver src/game/transition.js.
    this.transition = createSceneTransition({
      host: canvas.parentElement ?? document.body,
      scene: this.scene,
      camera: this.camera,
    })

    this.objective = new Objective(this.scene, COVER.heights)
    this.objective.setSites(this.scenario.objectiveSites)

    /**
     * **El jugador como blanco.** Vida, escudo, casco y reaparición; el módulo
     * no sabe de motor y el motor no sabe de fórmulas de daño.
     */
    this.status = new PlayerStatus()
    /** Los muñecos disparando, y los recogibles que hacen falta para aguantarlo. */
    /** El fogonazo de cada disparo enemigo. Sólo dibuja: el aviso viene de fuera. */
    this.muzzleFlash = new MuzzleFlash(this.scene)
    /**
     * **Las marcas de bala**, que son del motor y no de un modo (vuelta 64):
     * el mismo pool dibuja el disparo que se come la Espina entrenando y el que
     * se la come en un duelo. El pool se monta una vez y no depende de cuántos
     * muñecos haya, porque una marca es de la **superficie**, no de quien
     * dispara.
     */
    this.impacts = new Impacts(this.scene)
    /**
     * **El destello de usar un dispositivo** (vuelta 82). Vive en el motor, así
     * que sale igual entrenando y en el duelo — la convención de la 63.
     */
    this.dispositivos = new Dispositivos(this.scene)
    /**
     * **Lo que vuela y tarda en llegar** (vuelta 85). El modelo va aquí y no en
     * el arma: un proyectil sobrevive al arma que lo lanzó —y al jugador, que
     * es la mitad de lo que hace interesante un cohete— así que su dueño es el
     * mundo. Las dos piezas de dibujo son suyas y salen en los dos modos, que
     * es la convención de la vuelta 63.
     */
    this.proyectiles = new Proyectiles()
    this.vuelo = new VueloDeProyectiles(this.scene)
    /**
     * **Los cuchillos clavados** (vuelta 90). Cuelgan del mundo y no del
     * jugador, por lo mismo que el pool de proyectiles desde la vuelta 85: un
     * cuchillo que falló sigue ahí aunque quien lo tiró haya muerto — y eso es
     * justo lo que lo convierte en algo a lo que volver.
     *
     * **En red no los planta el motor**: los planta el servidor y llegan por
     * mensaje (ver `usarRed`). Aquí se dibujan y, en el entrenamiento, también
     * se recogen.
     */
    this.clavadas = new Clavadas(CLAVADAS.pool)
    this.trayectoria = new Trayectoria(this.scene)
    /**
     * **La carga del arma de tiro curvo**, en tiempo de **mundo**: en pausa un
     * arco a medio tensar se queda a medio tensar. `-Infinity` es «no se está
     * cargando», como `_jumpPressedAt` en el movimiento (vuelta 68).
     */
    this._cargaDesde = -Infinity
    /**
     * **Si lo que se está tensando es un tiro corto** (vuelta 87), o sea si la
     * carga empezó con el clic derecho. Es del gesto en curso y no del arma: la
     * misma granada se lanza de las dos maneras, y lo que cambia es el ángulo
     * de salida y la velocidad.
     */
    this._cargaCorta = false
    /**
     * **La reserva de las armas que la tienen** (vuelta 86), por clave. Vacío
     * quiere decir «lo de fábrica»: `reservaDe` lo siembra al preguntarlo, que
     * es lo que hace que un arma sin reserva no pague nada por esto.
     */
    this._reserva = {}
    /**
     * **Los silbidos vivos, por número de serie** (vuelta 86). Un cohete que
     * vuela suena, y ese sonido hay que poder pararlo: la clave es la serie y
     * no la ranura del pool, porque una ranura se reutiliza y un cohete nuevo
     * heredaría el silbido del anterior.
     */
    this._silbidos = new Map()
    /**
     * Emisor para la voz de un dispositivo, **con su propia curva**. Se coloca
     * por uso, así que sirve para el tuyo y para el que use un rival a doce
     * unidades: lo que decide de dónde suena es dónde se pone, no de quién es.
     */
    this._emisorDispositivo = createEmitter(this.scene, {
      refDistance: SURFACES.audio.fullDistanceU,
      maxDistance: SURFACES.audio.maxDistanceU,
      rolloffFactor: 1,
    })
    /**
     * **El abanico de aparición, dibujado** (vuelta 78). Vive en el motor —y no
     * en React— por lo de siempre: es geometría del mundo, y la pinta el mismo
     * bucle que dibuja todo lo demás. Lo enciende el panel de opciones.
     */
    this.spawnCone = new SpawnCone(this.scene)
    this._verCono = false
    this.impacts.build()
    this.dispositivos.build()
    this.enemyFire = new EnemyFire(
      this.scene,
      (hit) => this._onPlayerHit(hit),
      (x, y, z, now) => this.muzzleFlash.flash(x, y, z, now),
    )
    /** Brújula e iconos de estado sobre cada muñeco. Sólo dibuja; no decide. */
    this.markers = new DummyMarkers(this.scene, this.cssScene)
    // Enlazado una vez: pasarlo como flecha en el bucle sería una función nueva
    // por frame, y el bucle caliente no aloca.
    this._enemyPhase = (instance, now) => this.enemyFire.phaseOf(instance, now)
    this.pickups = new PickupField(this.scene, COVER.heights, (kind) => this._collect(kind))
    this.pickups.setSites(this.scenario.pickupSites)
    this.enemyFire.setOccluders(this.scenario.occluders)
    this.markers.setOccluders(this.scenario.occluders)
    /** Mando del zumbido de carga, mientras dure. */
    this._shieldSound = null

    this.actionPanel = new ActionPanel(this.scene, this.cssScene)
    this.actionPanel.setAnchor(this.scenario.spawn, this.scenario.room)
    this.targets.setRoutes(this.scenario.routes, this.scenario.points, this.scenario.occluders, this.scenario.room)
    /**
     * Asignación de teclas vigente. El motor la lee para sus acciones y se la
     * empuja al movimiento, igual que hace con los ajustes: los subsistemas no
     * van a buscar el store por su cuenta.
     */
    this._binds = getKeybinds()
    this.movement.setKeybinds(this._binds)
    this._unsubscribeKeybinds = subscribeKeybinds((binds) => {
      this._binds = binds
      this.movement.setKeybinds(binds)
    })

    /** Última activación del panel, para el antirrebote. */
    this._lastPanelActionAt = -Infinity
    /** Si la pulsación en curso ya se gastó en el panel, no dispara. */
    this._triggerConsumedByPanel = false

    /**
     * **La partida en red, o null.** Lo pone `usarRed()` antes de `start()`, y
     * de él cuelga todo lo que la vuelta 56 saca del motor: quién decide el
     * movimiento, el disparo, la vida y la reaparición.
     */
    this.net = null
    /** El cuerpo del rival y su época de pose, para no interpolar un salto. */
    this._rivalAvatar = null
    /** Adaptador rival→instancia para `markers`. Ver `_syncRival`. */
    this._rivalInstancia = null
    /** Vida del servidor en la foto anterior, para saber si te han dado. */
    this._vidaPrevia = PLAYER.maxHealth
    /** ¿Estaba abatido en el frame anterior? Para no repetir el abatimiento. */
    this._abatidoEnRed = false

    this.phase = PHASE.IDLE
    this.durationMs = SESSION_DURATION_S * 1000
    /**
     * **El modo de la sesión** (`SESSION_MODES`): `timed` es la ronda con
     * cronómetro —y con explosivo, donde lo haya— y `deathmatch` es el
     * escenario sin bomba, que dura lo que diga su ajuste.
     */
    this.mode = 'timed'
    this._pendingMode = 'timed'
    /**
     * **El reloj del mundo.** Milisegundos de *juego*: avanza con el delta del
     * frame **sólo mientras se juega**, así que en pausa no se mueve. De él
     * cuelgan todos los tiempos del combate —cadencia y recarga del arma,
     * visión, reacción y ráfagas de los muñecos, apariciones, pops— para que
     * pausar congele el mundo entero y no sólo las partes que se acordaron de
     * usar el delta.
     *
     * El de fuera (`performance.now()`) se queda donde tiene que estar: el
     * limitador de FPS, la media de frames y el movimiento, que compara contra
     * el `timeStamp` de los eventos del navegador y **tiene** que ir en el mismo
     * origen de tiempos que ellos.
     */
    this.gameTime = 0
    /**
     * Sesión sin cronómetro: no termina sola, la cierra el jugador. Se deriva
     * del modo y su duración, y sigue significando **sólo** eso, que es lo que
     * leen el HUD y el resumen.
     */
    this.endless = false
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0

    /**
     * **Dos ranuras, y la pistola no se elige.** La principal es la del ajuste
     * `weapon` y sale con la tecla 1; la secundaria va siempre puesta y sale
     * con la 2. `weaponKey` sigue siendo el arma vigente, que es lo que lee
     * todo lo demás —las RPM, el retroceso, el silenciador—: la ranura sólo
     * dice de dónde salió.
     */
    /**
     * **Tres ranuras desde la vuelta 71.** La de cuerpo a cuerpo llevaba su
     * tecla reservada desde la 27 y sin nada detrás; ahora tiene el cuchillo, y
     * se deriva del catálogo igual que la pistola — no hay una segunda lista.
     */
    /**
     * **Cuatro ranuras desde la vuelta 87.** La cuarta es la granada, y su
     * tecla —la **G**— llevaba reservada sin lógica desde la vuelta 27,
     * exactamente como la 3 hasta que llegó el cuchillo en la 71.
     */
    /**
     * **Y desde la vuelta 90 la pistola también sale de un ajuste**, porque hay
     * dos en su ranura. Lo que no cambia es que **siempre hay una**: la de
     * serie es el valor de fábrica del ajuste y lo que el saneado devuelve ante
     * cualquier clave que no sea de esta ranura, así que `slots.secondary` no
     * puede quedarse vacío ni empuñando algo que no exista — que es justo lo
     * que la convierte en la ranura a la que se cae cuando falla otra.
     */
    /**
     * **Y cinco desde la vuelta 92**, con la especial en la tecla 5 —que
     * llevaba reservada sin lógica desde la 27, como la 3 hasta el cuchillo y
     * la G hasta las granadas—. El arco y el U2 salieron de la principal: lo
     * que la ranura compra es que se lleven **además de** un rifle y no en vez
     * de él, y lo que lo acota es el precio, no el hueco.
     */
    this.slots = {
      primary: getSettings().weapon,
      secondary: getSettings().secondary || SECONDARY_WEAPON,
      melee: MELEE_WEAPON,
      throwable: getSettings().throwable,
      special: getSettings().special,
    }
    /**
     * **Las clases de granada que llevas** (vuelta 88), en el orden en que se
     * ciclan. `slots.throwable` es **cuál de ellas** está elegida, que es lo
     * que la ranura significaba ya.
     *
     * Fuera de red es una sola —la que diga la armería—; en el duelo la manda
     * el servidor, que desde esta vuelta guarda varias. El motor no sabe cuál
     * de los dos casos es: lee una lista y la tecla la recorre.
     */
    this._granadas = this.slots.throwable ? [this.slots.throwable] : []
    this.slot = 'primary'
    /**
     * **El arma que dejas se queda como estaba.** Aquí se guarda el cargador de
     * la que no llevas encima y **lo que le faltaba de recarga**, no la fecha en
     * la que acababa: una recarga no avanza en la espalda, se reanuda donde se
     * quedó al volver a equiparla. Con una fecha absoluta, cambiar de arma
     * cinco segundos sería recargar gratis — el mismo agujero que ya se cerró
     * con la cuenta atrás del explosivo.
     */
    this._stowed = {}

    /** Arma vigente y estado de la ráfaga en curso. */
    this.weaponKey = this.slots.primary
    this._triggerHeld = false
    this._lastShotAt = -Infinity
    /** Momento en el que toca el siguiente disparo, según las RPM del arma. */
    this._nextShotAt = -Infinity
    /** Disparos consecutivos de la ráfaga: indexa el patrón de retroceso. */
    this._sprayIndex = 0

    /** Cargador y recarga. */
    this.ammo = 0
    this.reloadEndsAt = 0
    this.reloadStartedAt = 0
    /** Si ya se avisó de munición baja en este cargador, para no repetirlo. */
    this._lowAmmoWarned = false
    this.suppressorEnabled = false
    this.helpMessagesEnabled = true

    /** Tecla de desactivar mantenida. */
    this._defuseHeld = false
    /** Marcador abierto: la tecla del marcador está pulsada ahora mismo. */
    this._scoreboardHeld = false
    /** Desenlace del explosivo de la sesión, o null si no hubo explosivo. */
    this.objectiveOutcome = null

    // Objeto de estadísticas reutilizado: el HUD lo lee sin que se genere
    // basura en cada frame.
    this.stats = {
      phase: this.phase,
      fps: 0,
      endless: false,
      timeLeftMs: this.durationMs,
      hits: 0,
      misses: 0,
      shots: 0,
      kills: 0,
      accuracy: 0,
      ammo: 0,
      magazine: 0,
      reloading: false,
      reloadProgress: 0,
      /** El cronómetro cuenta hacia arriba: práctica libre y modo escenario. */
      countUp: false,
      /** Hay puntuación por estrellas que enseñar. */
      scoring: false,
      stars: 5,
      /** Marcador abierto, y lo que enseña. */
      scoreboard: false,
      nick: PLAYER.nick,
      deaths: 0,
      /** Estado del jugador. Sólo tiene sentido con muñecos que disparan. */
      combat: false,
      health: PLAYER.maxHealth,
      maxHealth: PLAYER.maxHealth,
      shield: 0,
      shieldSegments: 0,
      maxSegments: 3,
      charges: 0,
      helmet: false,
      applying: false,
      applyProgress: 0,
      alive: true,
      respawnLeftMs: 0,
      respawnMs: PLAYER.respawn.baseMs,
      /** Segundos de gracia que quedan tras reaparecer. */
      invulnerableLeftMs: 0,
      invulnerableMs: PLAYER.respawn.invulnerableMs,
      lowHealth: false,
    }

    this._rafId = 0
    this._lastFrameTime = 0
    this._running = false

    /** Intervalo objetivo entre fotogramas, en ms. Cero = sin límite. */
    this._frameIntervalMs = 0
    /** Acumulador del limitador: reparte los ticks de rAF entre fotogramas. */
    this._frameAccumulator = 0
    this._lastRafTime = 0

    /**
     * **El acumulador del mundo** (vuelta 44). Mismo mecanismo que el limitador
     * de fotogramas —sumar el tiempo real, descontar un intervalo cada vez que
     * toca y **guardar el sobrante**—, sólo que aquí lo que se reparte son
     * pasos de simulación y no dibujados.
     */
    this._simAccumulator = 0
    /**
     * Reloj del mundo, en el origen de tiempos de `performance.now()`. Avanza
     * de paso en paso, así que el final del último paso queda un
     * `_simAccumulator` por detrás de este frame. **No es un reloj aparte**: es
     * un instante real, y por eso el aterrizaje que se despeja de la parábola
     * se compara sin traducir con el `timeStamp` de un evento de teclado.
     */
    this._simTime = 0

    /**
     * **Las dos poses entre las que se dibuja.** La simulación va a 60 Hz y el
     * monitor puede ir a 240: sin interpolar, la cámara daría cuatro pasos
     * iguales y uno de salto. `_simPrev` es dónde estaba el jugador al empezar
     * el último paso, `_simCurr` dónde acabó, y lo que se dibuja es el punto
     * intermedio que toque según lo que lleve acumulado el frame.
     *
     * **La posición autoritativa sigue siendo `camera.position`**, no esta copia:
     * la interpolada se pone justo antes de dibujar y se quita justo después
     * (`_applyRenderPose` / `_restoreSimPose`), así que fuera de esas tres
     * líneas la cámara está donde el jugador está de verdad y cualquiera puede
     * escribirla sin que el frame siguiente se la pise.
     */
    this._simPrev = new THREE.Vector3()
    this._simCurr = new THREE.Vector3()
    /** Épocas de pose vistas: si el movimiento teletransporta, no se interpola. */
    this._simPoseEpoch = -1
    /** ¿La cámara lleva ahora mismo la pose de dibujado en vez de la buena? */
    this._interpolating = false

    // Media móvil de FPS sobre una ventana corta de fotogramas ya dibujados.
    this._frameSamples = new Float32Array(RENDER.fpsSampleFrames)
    this._frameSampleIndex = 0
    this._frameSampleCount = 0
    this._frameSampleSum = 0
    this.fps = 0

    // Al final del constructor a propósito: reparte los ajustes guardados
    // sobre un estado ya completo. Hacerlo antes dejaba el límite de
    // fotogramas a cero, pisado por su propia inicialización.
    this._applySettings(getSettings())

    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onWindowBlur = this._onWindowBlur.bind(this)
    this._onContextMenu = this._onContextMenu.bind(this)
    this._onPointerLockChange = this._onPointerLockChange.bind(this)
    this._onResize = this._onResize.bind(this)
    this._loop = this._loop.bind(this)
  }

  /** Engancha listeners, ajusta tamaño y arranca el bucle de render. */
  /**
   * **Conecta el motor a una partida en red** (vuelta 56, la «Opción B»).
   *
   * El motor no construye el cliente ni sabe de sockets: lo recibe ya montado.
   * Es la misma regla de siempre —la red vive en `net/`— llevada hasta donde se
   * puede llevar: `net/prueba.js` ensambla el transporte y el `ClienteRed` con
   * la cámara, el movimiento y los oclusores **de este motor**, y a partir de
   * ahí el motor le habla por tres verbos (`pasosDeFrame`, `dar`, `disparar`) y
   * le lee tres estados (`vida`, `vivoEn`, `poseDelRival`).
   *
   * Lo que cambia con esto no es un modo de juego: es de dónde sale la verdad.
   * Movimiento, disparo, vida y reaparición dejan de decidirse aquí y pasan a
   * obedecer al servidor; el arma —cargador, recarga, retroceso, sonido— se
   * queda del lado del cliente, y lo único que el servidor le exige es la
   * cadencia (ver `NET.shotRateSlackTicks`).
   *
   * **Las teclas pasan a ser el mismo objeto**, no una copia: el cliente las
   * empaqueta desde `movement.keys` y las desempaqueta encima. Dos objetos que
   * hay que copiar en cada paso es cómo se desincronizan, y además deja que los
   * bancos sigan escribiendo en `cliente.teclas` como han hecho desde la 45.
   *
   * Se llama **antes** de `start()`.
   */
  usarRed(cliente) {
    this.net = cliente
    /**
     * **Las teclas del cliente son la intención, no lo que se ejecuta.** Son el
     * mismo objeto que el del movimiento —una copia por paso es justo lo que el
     * bucle caliente no hace— pero el desdoblado importa: la reconciliación
     * reejecuta entradas guardadas y llena `movement.keys` con máscaras del
     * pasado, así que apuntar aquí a `keys` borraba sesenta veces por segundo la
     * tecla que el jugador tenía pulsada. Medido: con W apretada el jugador no
     * se movía en absoluto. Ver `movement.separateInput`.
     */
    cliente.teclas = this.movement.separateInput()
    /**
     * **La sesión de red empieza con la bienvenida, no con el clic** (vuelta
     * 56). Fuera de la red el clic es lo que arranca una ronda; aquí la ronda ya
     * está corriendo al otro lado, y un jugador conectado que no manda entradas
     * es un jugador al que el servidor deja parado — y que, si le matan, no
     * reaparece nunca, porque la reaparición cuelga de sus propias entradas. El
     * clic enciende el mando; la bienvenida enciende el mundo.
     *
     * Y va **en el mismo turno** que la bienvenida, no en el frame siguiente:
     * `_beginSession` suelta las teclas, así que arrancar un frame tarde puede
     * comerse una tecla pulsada justo al entrar. Se encadena con lo que la
     * página ya hubiera puesto —por eso se asigna después de ella—, que es la
     * forma de no pelearse por un callback que usan los dos.
     */
    /**
     * **Y un proyectil del rival se pone a volar aquí** (vuelta 85). Se
     * encadena con lo que la página hubiera puesto, que es la forma de no
     * pelearse por un callback que usan dos (vuelta 67).
     *
     * `adelantoS` es lo que el mensaje ha tardado en llegar, y se gasta
     * **avanzando el vuelo** en vez de arrancándolo desde cero: si no, un
     * cohete se dibujaría saliendo de donde el rival estaba hace 25 ms e iría
     * por detrás de la realidad todo el trayecto. Es la misma cuenta que hace
     * `poseDelRival` con el reloj de las fotos.
     */
    /**
     * **Y los cuchillos del mundo los pone el servidor** (vuelta 90). Los tres
     * verbos del mensaje —plantar, quitar y limpiar— se distinguen por su
     * forma, que es como llegan del otro lado (ver `MSG.CLAVADA`). Aquí no se
     * decide nada: esto sólo mantiene el suelo igual al del servidor.
     *
     * Se encadena, como `onBienvenida` y `onEconomia`, porque la página del
     * duelo puede querer escucharlo también: asignarlo sin encadenar se llevó
     * por delante al motor en la vuelta 67, y es la misma trampa.
     */
    const suyaClavada = cliente.onClavada
    cliente.onClavada = (m) => {
      suyaClavada?.(m)
      if (m.l) { this.clavadas.limpiar(); return }
      if (m.q) { this.clavadas.quitar(m.i); return }
      this.clavadas.plantar({ id: m.i, x: m.x, y: m.y, z: m.z, dx: m.dx, dy: m.dy, dz: m.dz })
    }

    const suyoProyectil = cliente.onProyectil
    cliente.onProyectil = (m, adelantoS) => {
      suyoProyectil?.(m, adelantoS)
      const esGranada = Boolean(this._tiroDe(m.k)?.granada)
      const i = this.proyectiles.lanzar({
        tipo: m.k,
        dueno: m.de ?? 'rival',
        x: m.x, y: m.y, z: m.z,
        vx: m.vx, vy: m.vy, vz: m.vz,
        g: m.g,
        // **El daño no viaja**, y eso no es un olvido: quién recibe cuánto lo
        // decide el servidor (vuelta 56). Esto es un dibujo.
        fuerza: 0,
        intensidad: m.i ?? 1,
        /**
         * **Y una granada rebota igual en las dos pantallas** (vuelta 87).
         * Los tres números del rebote salen de `GRENADES`, que los dos
         * extremos leen del mismo módulo, así que no viajan. **La mecha sí**,
         * y es la única excepción: la decide cuánto la ha tenido en la mano su
         * dueño, y eso no está en ninguna entrada que este cliente ejecute.
         */
        rebote: esGranada ? GRENADES.rebote.restitucion : 0,
        roce: esGranada ? GRENADES.rebote.roce : 0,
        reposoU: esGranada ? GRENADES.rebote.reposoU : 0,
        mechaS: Number.isFinite(m.m) ? m.m : Infinity,
      })
      if (i && adelantoS > 0) this.proyectiles.adelantar(i, adelantoS)
    }

    const suyo = cliente.onBienvenida
    cliente.onBienvenida = (m) => {
      suyo?.(m)
      /**
       * **Con economía se sale con la pistola** (vuelta 64): la ranura principal
       * empieza vacía y la llena lo que compres. Sin economía —el huésped de los
       * bancos, `VEKTOR_RONDAS=0`— el arma sigue siendo la del ajuste del
       * jugador, que es como funcionaba hasta la 63: vaciarla allí dejaría a los
       * bancos de netcode midiendo el peso y la cadencia de una pistola.
       *
       * Va aquí y no en `usarRed` porque **quién manda se sabe al entrar**, no
       * al enchufar el cliente: la bienvenida lo dice (`eco`).
       */
      if (m.eco) {
        this.slots.primary = null
        if (this.slot === 'primary') {
          this.slot = 'secondary'
          this.weaponKey = this.slots.secondary
          this._cancelReload()
          this._refillMagazine()
        }
        this._aplicarInventario(cliente.economia?.inv)
      }
      if (this.phase !== PHASE.RUNNING) this._beginSession()
    }

    // **El veredicto lo cuenta el motor**, que es de quien son los contadores y
    // el audio: aciertos, bajas y sus dos voces. Quien lo quiera para pintar
    // una marca lo recibe por callback, igual que el daño.
    cliente.onVeredicto = (v) => this._onVerdict(v)
    /**
     * **Y la marca en la pared**, que la pone el veredicto **local** y no el del
     * servidor: lo que dice dónde acabó tu bala es el rayo que tú disparaste,
     * mientras que el del servidor llega un viaje después y dice otra cosa —si
     * le diste—. Si le diste, no hay marca: el rival no la necesita, que para
     * eso está el anillo de la mira.
     */
    cliente.onTiroLocal = (veredicto, d) => {
      /**
       * **Y con el cuchillo, el destello y el sonido** (vuelta 71). Van aquí y
       * no donde se golpea por la misma razón que la marca de bala: quien sabe
       * si has conectado —y si ha sido por la espalda— es el veredicto contra el
       * rival **que estabas viendo**, no el del servidor, que llega un viaje
       * después. Un cuchillazo no deja marca en la pared: lo que dice dónde ha
       * ido es el arco.
       */
      if (d.m) {
        const tipo = d.m === 2 ? 'fuerte' : 'luz'
        playMelee(tipo, Boolean(veredicto.impacto), Boolean(veredicto.espalda))
        this.slash?.show(tipo, Boolean(veredicto.espalda))
        return
      }
      /**
       * **Y un lanzamiento no deja marca de bala** (vuelta 91). Lo que sale de
       * un arma con bloque `tiro` es un proyectil que tarda en llegar, así que
       * quien pinta dónde acabó es `_impactoDeProyectil` cuando aterriza. Sin
       * esta guarda salían **dos marcas por flecha**: la del rayo instantáneo
       * aquí y la de verdad medio segundo después. El veredicto lo declara
       * (`proyectil`) porque quien resuelve el disparo es quien sabe si hubo
       * rayo — deducirlo aquí sería una segunda idea de qué arma lanza.
       */
      if (veredicto.proyectil) return
      if (!veredicto.impacto) this._impactoDeRed(d.yaw, d.pitch)
    }

    /**
     * **En red lo que llevas no es un ajuste tuyo: es lo que has comprado**
     * (vuelta 64). La ranura principal sale del inventario del servidor, y con
     * ella el supresor de cada arma. Se arranca **sin principal** —la ronda 1 se
     * juega con la pistola— y cada `MSG.ECONOMIA` la vuelve a poner.
     */
    this._invRed = null
    cliente.onEconomia = (eco) => this._aplicarInventario(eco.inv)
    return cliente
  }

  /**
   * **Lo comprado, puesto** (vuelta 64). Es el único camino por el que cambia el
   * arma principal en red: ni el ajuste del jugador ni la armería local pintan
   * nada aquí, porque en una partida con economía lo que llevas lo decide el
   * servidor.
   *
   * Si te quedas sin principal —morir cuesta el equipo— y la llevabas en la
   * mano, se saca la pistola: quedarse empuñando un arma que ya no existe es la
   * versión silenciosa del mismo fallo.
   */
  _aplicarInventario(inv) {
    if (!inv) return
    this._invRed = inv
    /**
     * **Y la reserva la manda el servidor** (vuelta 86), como todo lo demás que
     * se tiene en una partida (vuelta 64). Lo que el motor lleva en local es
     * una predicción —baja al recargar— y esto la corrige: cuántos cohetes te
     * quedan lo decide quien reparte, no tu pantalla. Llega en el inventario y
     * no en la foto porque cambia cada pocos disparos, y **por destinatario**,
     * que los del rival no se enseñan.
     */
    if (inv.reserva) {
      for (const [clave, n] of Object.entries(inv.reserva)) this._reserva[clave] = n
    }
    /**
     * **La pistola va primero, y el orden es la regla** (vuelta 90). Desde el
     * Reaper la ranura secundaria también la manda el inventario, y el bloque
     * de la principal de aquí abajo **se cae a ella** cuando te quedas sin arma
     * larga: leerla después dejaría en la mano la pistola de la ronda anterior
     * durante un paso, que es exactamente el hueco por el que se empuña algo
     * que ya no se tiene.
     *
     * Y **comprar una pistola no te la pone en la mano**, al revés que la
     * principal (vuelta 67) y como la granada (vuelta 87): la principal es con
     * lo que sales a la ronda y una pistola es a lo que te cambias. Lo único
     * que pasa si la llevabas empuñada es que la ranura cambia de arma, que es
     * lo que esa ranura significa.
     */
    const pistolaAntes = this.slots.secondary
    this.slots.secondary = inv.secundaria ?? SECONDARY_WEAPON
    if (pistolaAntes !== this.slots.secondary) {
      delete this._stowed[pistolaAntes]
      if (this.slot === 'secondary') {
        this.weaponKey = this.slots.secondary
        this._cancelReload()
        this._refillMagazine()
      }
    }
    const antes = this.slots.primary
    this.slots.primary = inv.primaria ?? null
    if (antes && antes !== this.slots.primary) delete this._stowed[antes]
    if (this.slot === 'primary' && !this.slots.primary) {
      this.slot = 'secondary'
      this.weaponKey = this.slots.secondary
      this._cancelReload()
      this._refillMagazine()
    } else if (this.slot === 'primary' && this.weaponKey !== this.slots.primary) {
      this.weaponKey = this.slots.primary
      this._cancelReload()
      this._refillMagazine()
    } else if (this.slots.primary && this.slots.primary !== antes) {
      /**
       * **Lo que acabas de comprar se te pone en la mano** (vuelta 67). Hasta
       * aquí la compra entraba en el inventario y el jugador seguía con la
       * pistola hasta que se acordaba de pulsar el 1 — y en una fase de compra
       * de quince segundos eso es salir a la ronda con el arma de antes.
       *
       * **La condición es que la principal haya cambiado**, no que llegue un
       * mensaje de economía: llegan también al cobrar la ronda y al conmutar el
       * supresor, y arrancarle el arma de la mano a alguien que acaba de
       * cambiar a la pistola a propósito sería el mismo fallo por el otro lado.
       * Comprar es la única forma de que esa clave cambie.
       */
      this.slot = 'primary'
      this.weaponKey = this.slots.primary
      this._cancelReload()
      this._refillMagazine()
    }
    /**
     * **Y la granada, igual** (vuelta 87), con una diferencia que **es** una
     * decisión: comprar una **no** te la pone en la mano. Una principal sí,
     * porque es con lo que vas a salir a la ronda; una granada es lo que sacas
     * cuando toca, y arrancarte el rifle de las manos a mitad de una fase de
     * compra por haber comprado una Blind sería un control que hace lo que
     * nadie pidió.
     *
     * Lo que sí pasa es lo contrario: si te quedas sin ella y la llevabas en la
     * mano, se vuelve a la pistola — empuñar un arma que ya no existe es la
     * versión silenciosa del mismo fallo.
     */
    const granadaAntes = this.slots.throwable
    /**
     * **Y desde la vuelta 88 son varias.** Lo que elige cuál queda en la ranura
     * es **seguir con la que llevabas si sigue en la lista**: comprar una Blind
     * teniendo una KO elegida no puede cambiarte de granada por detrás, que es
     * la misma regla por la que comprar una granada no te arranca el rifle de
     * la mano.
     */
    this._granadas = [...(inv.granadas ?? [])]
    this.slots.throwable = this._granadas.includes(granadaAntes)
      ? granadaAntes
      : (this._granadas[0] ?? null)
    // Lo que ya no se lleva no guarda cargador: volver a comprarla es volver a
    // sacarla llena, como cualquier arma que sale por primera vez.
    for (const clave of Object.keys(this._stowed)) {
      if (THROWABLE_WEAPONS[clave] && !this._granadas.includes(clave)) delete this._stowed[clave]
    }
    if (this.slot === 'throwable' && !this.slots.throwable) {
      this.slot = 'secondary'
      this.weaponKey = this.slots.secondary
      this._cancelReload()
      this._refillMagazine()
    } else if (this.slot === 'throwable' && this.weaponKey !== this.slots.throwable) {
      this.weaponKey = this.slots.throwable
      this._cancelReload()
      this._refillMagazine()
    }
    /**
     * **Y la especial** (vuelta 92), con la regla de la granada y no la de la
     * principal: comprar un arco **no** te lo pone en la mano. La principal es
     * con lo que sales a la ronda; la especial es lo que sacas cuando toca, y
     * arrancarte el rifle por haber comprado un cohete sería lo que la vuelta
     * 87 ya decidió que no.
     *
     * Lo que sí pasa es lo contrario: perderla teniéndola empuñada devuelve a
     * la pistola, porque empuñar un arma que ya no existe es la versión
     * silenciosa del mismo fallo.
     */
    const especialAntes = this.slots.special
    this.slots.special = inv.especial ?? null
    if (especialAntes && especialAntes !== this.slots.special) {
      delete this._stowed[especialAntes]
      delete this._reserva[especialAntes]
    }
    if (this.slot === 'special' && !this.slots.special) {
      this.slot = 'secondary'
      this.weaponKey = this.slots.secondary
      this._cancelReload()
      this._refillMagazine()
    } else if (this.slot === 'special' && this.weaponKey !== this.slots.special) {
      this.weaponKey = this.slots.special
      this._cancelReload()
      this._refillMagazine()
    }
    this._publishWeapon(getSettings())
  }

  /**
   * Qué pasó con uno de tus disparos, según el servidor. **El del servidor y no
   * el tuyo**: la marca de impacto tiene que decir que le has dado de verdad,
   * no que a ti te lo pareció (vuelta 46).
   */
  _onVerdict(v) {
    if (v.impacto) {
      this.hits += 1
      playHit()
    }
    if (v.baja) {
      this.kills += 1
      playKill()
    }
    this.callbacks.onVerdict?.(v)
  }

  /** ¿Hay una partida en red al otro lado? Lo preguntan los seis adaptados. */
  get enRed() {
    return this.net !== null
  }

  start() {
    if (this._running) return
    this._running = true

    this.canvas.addEventListener('mousedown', this._onMouseDown)
    // El "soltar" se escucha en la ventana: si el botón se libera fuera del
    // canvas, el arma tiene que dejar de disparar igualmente.
    window.addEventListener('mouseup', this._onMouseUp)
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onWindowBlur)
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.connect(document)
    this.movement.connect(window)

    this._unsubscribeSettings = subscribeSettings((settings) => this._applySettings(settings))

    const parent = this.canvas.parentElement
    if (parent) parent.appendChild(this.cssRenderer.domElement)
    // La lente va donde el lienzo, no en el HUD: es parte de lo que se ve.
    this.scope = new Scope(parent || document.body)
    // Y el destello del cuchillo, por lo mismo: es del mundo, no del HUD.
    this.slash = new Slash(parent || document.body)
    // **Del motor, como el tajo y la mirilla**, así que sale en los dos modos.
    this.granadas = new Granadas(parent || document.body)

    this._resizeObserver = new ResizeObserver(this._onResize)
    this._resizeObserver.observe(this.canvas.parentElement || this.canvas)
    this._onResize()

    this._lastFrameTime = performance.now()
    this._lastRafTime = this._lastFrameTime
    this._simTime = this._lastFrameTime
    this._rafId = requestAnimationFrame(this._loop)
  }

  dispose() {
    this.scope?.dispose()
    this.scope = null
    this.slash?.dispose()
    this.slash = null
    this.granadas?.dispose()
    this.granadas = null
    this._running = false
    cancelAnimationFrame(this._rafId)
    this.canvas.removeEventListener('mousedown', this._onMouseDown)
    window.removeEventListener('mouseup', this._onMouseUp)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onWindowBlur)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
    this.controls.disconnect()
    this.movement.disconnect()
    if (this._unsubscribeSettings) this._unsubscribeSettings()
    if (this._unsubscribeKeybinds) this._unsubscribeKeybinds()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.avatar?.dispose()
    this._stopShieldSound()
    this.enemyFire.dispose()
    this.markers.disposeMaterials()
    this.muzzleFlash.dispose()
    this.impacts.dispose()
    this.dispositivos.dispose()
    this.vuelo.dispose()
    this.clavadas.limpiar()
    this.trayectoria.dispose()
    this.spawnCone.dispose()
    this.pickups.dispose()
    this.actionPanel.dispose()
    this.cssRenderer.domElement.remove()
    this.targets.dispose()
    this.objective.dispose()
    detachListener()
    this.scenario.dispose()
    this.transition.dispose()
    this._disposeScene()
    this.renderer.dispose()
  }

  /** ¿Tenemos el ratón capturado? */
  get isLocked() {
    return document.pointerLockElement === this.canvas
  }

  /**
   * Pide el Pointer Lock. Debe llamarse desde un gesto del usuario.
   * `unadjustedMovement` desactiva la aceleración del sistema operativo, que es
   * justo lo que queremos en un aim trainer; si el navegador no lo soporta,
   * caemos al modo normal.
   */
  requestLock() {
    initAudio()
    // Las muestras de disparo, si las hay, también necesitan el contexto. No se
    // espera a que lleguen: hasta que estén, se dispara sintetizado.
    loadWeaponSamples()
    // El listener necesita el contexto de audio, que no existe hasta este
    // gesto. Es idempotente: llamarla en cada click no cuesta nada.
    attachListener(this.camera)
    const element = this.canvas
    const fallback = () => {
      try {
        element.requestPointerLock()
      } catch {
        /* El navegador puede rechazarlo (p. ej. cooldown tras Escape). */
      }
    }
    // **Y si esta plataforma no admite la opción, no se vuelve a pedir**
    // (vuelta 62). `unadjustedMovement` es de Chromium y en algunos sistemas
    // —este contenedor, sin ir más lejos— se rechaza con `NotSupportedError`.
    // El rechazo llega **en una promesa**, o sea un turno después, y para
    // entonces el gesto del usuario ya se ha gastado: el reintento de dentro del
    // `catch` sale rechazado **sin decir nada**, y el jugador se queda sin poder
    // recuperar el ratón por más que pinche. Medido: cinco clics en diez
    // segundos, ninguno captura.
    //
    // Preguntar antes no se puede —no hay detección de característica— así que
    // se pregunta **una vez** y se recuerda. Se paga un clic la primera vez y
    // ninguno después.
    if (Engine._sinMovimientoCrudo) {
      fallback()
      return
    }
    try {
      const result = element.requestPointerLock({ unadjustedMovement: true })
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          if (error?.name === 'NotSupportedError') Engine._sinMovimientoCrudo = true
          fallback()
        })
      }
    } catch {
      Engine._sinMovimientoCrudo = true
      fallback()
    }
  }

  /**
   * Arranca una sesión nueva desde la pantalla de resumen. Deja la fase como
   * está a propósito: si el navegador rechaza la captura (hay un cooldown tras
   * pulsar Escape), el resumen sigue en pantalla con su botón en lugar de
   * dejar al jugador mirando un canvas vacío. La sesión empieza de verdad
   * cuando llega el evento de pointerlock.
   */
  restart() {
    // Reiniciar conserva el modo: quien estaba en Deathmatch sigue en él.
    this._pendingMode = this.mode
    this.controls.reset()
    this.requestLock()
  }

  /**
   * Pide la captura del ratón para arrancar una sesión en el modo indicado.
   * El modo se guarda aquí y lo recoge `_beginSession` cuando llega el evento
   * de pointerlock, que es cuando la sesión empieza de verdad.
   */
  requestStart(mode = 'timed') {
    this._pendingMode = SESSION_MODES[mode] ? mode : 'timed'
    this.controls.reset()
    this.requestLock()
  }

  /**
   * Vuelve a la pantalla de inicio. Con dos modos de sesión hace falta un
   * camino de vuelta: desde el resumen sólo se podía reiniciar el mismo modo.
   */
  goToStart() {
    this.controls.enabled = false
    this.movement.setEnabled(false)
    this._releaseTrigger()
    this._cancelReload()
    this.targets.clear()
    this.pickups.clear()
    this.muzzleFlash.clear()
    this.impacts.clear()
    this.dispositivos.clear()
    this._stopShieldSound()
    if (this.isLocked) document.exitPointerLock()
    this._setPhase(PHASE.IDLE)
  }

  /**
   * Cierra la sesión a mano y saca el resumen. Es la única forma de terminar
   * una práctica libre, y también vale para abandonar una cronometrada.
   */
  finishSession() {
    if (this.phase !== PHASE.RUNNING && this.phase !== PHASE.PAUSED) return
    this._finishSession()
  }

  /**
   * Reparte los ajustes del panel de opciones entre quien los usa.
   *
   * Cambiar el tipo o el tamaño de diana rehace las mallas. El panel sólo se
   * abre con la partida parada (antes de empezar o en pausa), así que esa
   * reconstrucción nunca cae dentro del bucle caliente; si había dianas en
   * pantalla se vuelven a repartir, porque las viejas dejan de existir.
   */
  _applySettings(settings) {
    // Con escenario fijo el ajuste del jugador no manda aquí: ver `_escenarioFijo`.
    this._applyScenario(this._escenarioFijo ?? settings.scenario)
    setSpatialEnabled(settings.spatialAudio)
    this._sensNormal = settings.sensitivity
    this._sensMirilla = settings.scopeSensitivity
    this._aplicarSensibilidad()
    const limit = FRAME_LIMITS[settings.frameLimit].fps
    this._frameIntervalMs = limit > 0 ? 1000 / limit : 0
    this._frameAccumulator = 0
    this.helpMessagesEnabled = settings.helpMessages
    // Cambiar de arma principal cambia la ranura, no el arma vigente: si en ese
    // momento llevabas la pistola, la principal nueva te espera en la tecla 1.
    // Y espera **llena**: el cargador guardado era el de la que ya no llevas.
    // **En red la principal no sale de los ajustes: sale de lo que has comprado**
    // (vuelta 64). Sin esta condición, el ajuste guardado del jugador le
    // devolvía el rifle en cuanto se aplicaba cualquier opción — o sea, un arma
    // que no ha pagado y que el servidor no le reconoce.
    if (!this.enRed && settings.weapon !== this.slots.primary) {
      delete this._stowed[this.slots.primary]
      delete this._stowed[settings.weapon]
      this.slots.primary = settings.weapon
      if (this.slot === 'primary') {
        this.weaponKey = settings.weapon
        this._releaseTrigger()
        this._cancelReload()
        this._refillMagazine()
      }
    }
    /**
     * **Y lo mismo con la pistola** (vuelta 90). La condición de red es la de
     * siempre y aquí importa más que en ninguna otra ranura: sin ella, tocar
     * cualquier opción en mitad de un duelo le devolvería al jugador el Reaper
     * guardado en su navegador aunque en esa partida no lo haya comprado.
     */
    if (!this.enRed && settings.secondary && settings.secondary !== this.slots.secondary) {
      delete this._stowed[this.slots.secondary]
      delete this._stowed[settings.secondary]
      this.slots.secondary = settings.secondary
      if (this.slot === 'secondary') {
        this.weaponKey = settings.secondary
        this._releaseTrigger()
        this._cancelReload()
        this._refillMagazine()
      }
    }
    /**
     * **Y lo mismo con la granada** (vuelta 87), por lo mismo y con la misma
     * condición: en red lo que llevas lo dice el inventario del servidor. Es la
     * ranura la que cambia, no lo que tienes en la mano — si estabas empuñando
     * una, la nueva sale llena por el camino de siempre.
     */
    if (!this.enRed && settings.throwable !== this.slots.throwable) {
      delete this._stowed[this.slots.throwable]
      delete this._stowed[settings.throwable]
      delete this._reserva[this.slots.throwable]
      this.slots.throwable = settings.throwable
      this._granadas = settings.throwable ? [settings.throwable] : []
      if (this.slot === 'throwable') {
        this.weaponKey = settings.throwable
        this._releaseTrigger()
        this._cancelReload()
        this._refillMagazine()
      }
    }
    /**
     * **Y lo mismo con la especial** (vuelta 92). Misma forma que la pistola y
     * la granada, y la condición de red por el mismo motivo: en un duelo el
     * arco o el cohete se compran, y un ajuste guardado no puede devolverte un
     * arma que no has pagado.
     */
    if (!this.enRed && settings.special && settings.special !== this.slots.special) {
      delete this._stowed[this.slots.special]
      delete this._stowed[settings.special]
      delete this._reserva[this.slots.special]
      this.slots.special = settings.special
      if (this.slot === 'special') {
        this.weaponKey = settings.special
        this._releaseTrigger()
        this._cancelReload()
        this._refillMagazine()
      }
    }
    this._publishWeapon(settings)
    // Los muñecos disparan **sólo con escenario y hitbox completo**: sin
    // cobertura no habría dónde meterse, y una esfera flotante no dispara.
    this.enemyFire.setEnabled(!this.enRed && this.scenario.hasGeometry && settings.targetType === 'hitbox')
    this.enemyFire.setRadius(settings.targetRadius)
    this.enemyFire.setDifficulty(settings.enemyDifficulty)
    const hadSession = this.targets.sessionActive
    // **Volver a sembrar sólo si el tablero ha dejado de valer.** `configure`
    // dice si hubo que rehacer las mallas, que es el único caso en que las
    // dianas en pantalla ya no existen. Hasta la vuelta 42 se sembraba con
    // **cualquier** ajuste: tocar el silenciador en la pausa, con tres muñecos
    // ya abatidos, borraba la ronda y la volvía a llenar entera —y con el
    // jugador parado en su zona, encima de él—.
    const rebuilt = this.targets.configure(settings)
    // Sin dianas el cupo es cero, así que `update` no siembra nunca: es el
    // mismo mecanismo de siempre en su extremo, no un segundo camino.
    if (!this._conDianas) this.targets.maxAlive = 0
    this._syncMarkers(settings)
    // El cupo de ronda sí se recalcula siempre: cambiar el selector de
    // simultáneas con el explosivo puesto cambia cuántos quedan por salir, y
    // eso no necesita rehacer nada.
    if (hadSession) {
      this.targets.setRoundBudget(this.objectiveRunning ? this.targets.maxAlive : 0)
    }
    // Con un cambio de escenario en marcha la siembra la hace `_buildScenario`,
    // ya con el mundo nuevo montado: sembrar aquí usaría los anclajes viejos.
    if (hadSession && rebuilt && !this.transition.active) {
      this.targets.beginSession(this.camera, this.gameTime)
    }
  }

  /**
   * Pide un cambio de escenario. El montaje va dentro de una transición, pero
   * aquí no se sabe de qué tipo: sólo que `_buildScenario` se llamará en algún
   * momento con el jugador sin ver la escena.
   *
   * Se guarda la clave pedida en lugar de capturarla: si llegan varias mientras
   * la transición corre, se monta la última y no una intermedia.
   */
  _applyScenario(key) {
    this._wantedScenarioKey = key
    if (this.scenario.key === key && !this.transition.active) return
    this.transition.run(() => this._buildScenario(this._wantedScenarioKey))
  }

  /**
   * Monta el escenario nuevo. Cambia el mundo entero bajo los pies del jugador,
   * así que además de la geometría recoloca al jugador, reancla el panel y
   * repone los anclajes de aparición.
   */
  _buildScenario(key) {
    if (this.scenario.key === key) return
    const hadSession = this.targets.sessionActive

    this.scenario.dispose()
    this.scenario = new Scenario(this.scene, key)
    this._setRoom(this.scenario.room)
    // **Con fondo, la rejilla de los muros no se dibuja** (vuelta 78): el
    // decorado viste la pared, y una rejilla por delante sería el interior de
    // la caja encima del paisaje.
    this._setMuros(!this.scenario.tieneFondo)
    this.movement.setScenario(this.scenario)
    this.movement.reset()
    this.camera.updateMatrixWorld()
    this.actionPanel.setAnchor(this.scenario.spawn, this.scenario.room)
    this.targets.setRoutes(this.scenario.routes, this.scenario.points, this.scenario.occluders, this.scenario.room)
    this.objective.setSites(this.scenario.objectiveSites)
    this.pickups.setSites(this.scenario.pickupSites)
    this.enemyFire.setOccluders(this.scenario.occluders)
    this.markers.setOccluders(this.scenario.occluders)
    this.enemyFire.setEnabled(!this.enRed && this.scenario.hasGeometry && getSettings().targetType === 'hitbox')
    this._syncMarkers(getSettings())

    // Las dianas vivas estaban ancladas a un mundo que ya no existe. Si había
    // sesión en marcha se vuelve a sembrar desde la posición nueva del jugador,
    // con el cupo de ronda recalculado como en cualquier otra resiembra.
    if (hadSession) {
      this.targets.setRoundBudget(this.objectiveRunning ? this.targets.maxAlive : 0)
      this.targets.beginSession(this.camera, this.gameTime)
    }
  }

  /** El arma vigente, tal cual está descrita en config.js. */
  get weapon() {
    return WEAPONS[this.weaponKey]
  }

  /**
   * **Equipar una ranura.** Guarda el arma que se deja tal cual estaba —balas y
   * lo que le faltase de recarga— y saca la otra como la dejaste.
   *
   * Suelta el gatillo y pone el patrón de retroceso a cero: cambiar de arma no
   * puede heredar la ráfaga de la anterior, que es de otra arma.
   */
  /**
   * **La tecla de granada: la saca, y si ya la llevas, pasa a la siguiente**
   * (vuelta 88).
   *
   * Es lo que la ranura prometía y no hacía: hasta aquí el servidor guardaba
   * **una sola clase**, así que la tecla no tenía entre qué ciclar y comprar
   * una segunda sustituía a la primera en silencio. Medido jugando: «comprado
   * 1 KO + 2 Blind, la tecla de granadas no cicla entre ellas».
   *
   * Dos reglas de forma, y las dos salen de qué gesto es cada pulsación:
   *
   * - **La primera saca, las siguientes ciclan.** Con la pistola en la mano, G
   *   es «saca la granada» y tiene que dar la que ya llevabas elegida; sólo con
   *   una granada ya empuñada significa «la otra». Ciclando siempre, sacar una
   *   concreta sería cuestión de contar pulsaciones.
   * - **Y ciclar con una sola clase no es un `return` mudo**: es sacar la que
   *   hay, que es lo que la tecla hace el 90% del tiempo.
   */
  _granadaSiguiente() {
    const llevo = this._granadas
    if (llevo.length === 0) {
      // **Una tecla que no responde sin explicar por qué parece rota** (vuelta
      // 86). En el duelo se compran; entrenando se eligen en la armería.
      this._showHelp(
        this.enRed
          ? 'No llevas granadas: cómpralas en la tienda'
          : 'No llevas granadas: elígelas en la armería',
      )
      return
    }
    if (this.slot !== 'throwable') {
      // Sacar la que estuviera elegida; si el inventario la quitó, la primera.
      if (!llevo.includes(this.slots.throwable)) this.slots.throwable = llevo[0]
      this._equipSlot('throwable')
      return
    }
    if (llevo.length === 1) return
    const i = llevo.indexOf(this.weaponKey)
    this.slots.throwable = llevo[(i + 1) % llevo.length]
    this._equipSlot('throwable')
  }

  _equipSlot(slot) {
    const key = this.slots[slot]
    if (!key || key === this.weaponKey) return
    // Del reloj del mundo, como el resto de los tiempos del arma: lo que se
    // guarda de una recarga a medias es lo que le faltaba, y eso no puede
    // medirse en un reloj que sigue corriendo con el juego parado.
    const now = this.gameTime
    this._stowed[this.weaponKey] = {
      ammo: this.ammo,
      // Lo que le faltaba, no cuándo acababa: guardada así, la recarga se
      // congela mientras el arma está en la espalda.
      reloadLeftMs: this.reloading ? Math.max(0, this.reloadEndsAt - now) : 0,
      lowAmmoWarned: this._lowAmmoWarned,
    }
    this._releaseTrigger()
    this._sprayIndex = 0
    // **Cambiar de arma baja la mirilla.** Es del arma, no del jugador: sacar
    // la pistola apuntando con la del fusil sería llevar puesto el visor de un
    // arma que ya no tienes en la mano.
    this._ponerMirilla(false)
    this.slot = slot
    this.weaponKey = key
    const stowed = this._stowed[key]
    if (!stowed) {
      // La primera vez que sale, sale llena.
      this._cancelReload()
      this._refillMagazine()
    } else {
      this.ammo = stowed.ammo
      this._lowAmmoWarned = stowed.lowAmmoWarned
      if (stowed.reloadLeftMs > 0) {
        // Se reanuda donde se quedó: el progreso que enseña el HUD sale de
        // `reloadStartedAt`, así que se retrasa lo ya recorrido.
        this.reloadStartedAt = now - (this.weapon.reloadMs - stowed.reloadLeftMs)
        this.reloadEndsAt = now + stowed.reloadLeftMs
      } else {
        this._cancelReload()
      }
    }
    this._publishWeapon(getSettings())
  }

  /**
   * **La dotación de salida**: las dos armas llenas y la principal en la mano.
   * Se llama al empezar una sesión, no al reaparecer —morir no te cambia el
   * arma que llevabas—.
   */
  _resetLoadout() {
    this._stowed = {}
    // **Se puede no tener principal** (vuelta 64): en el duelo la ranura 1
    // empieza vacía y se llena comprando. Poner la mano en una ranura vacía deja
    // `weapon` sin definir, y eso se manifiesta lejos —en el HUD, leyendo el
    // cargador de un arma que no existe— así que la dotación empieza en la
    // ranura que de verdad tiene algo.
    this.slot = this.slots.primary ? 'primary' : 'secondary'
    this.weaponKey = this.slots[this.slot]
  }

  /**
   * Publica el arma vigente: al HUD por callback y al tablero de acciones.
   *
   * Va por callback y no por `stats` a propósito. El HUD se actualiza por refs
   * en cada frame, pero la silueta del arma y su rótulo son React: cambian
   * cuando se cambia de arma —una pulsación—, no sesenta veces por segundo.
   */
  _publishWeapon(settings) {
    // El silenciador sólo cuenta si el arma **vigente** lo admite: la pistola lo
    // lleva y el Rift no, así que esto cambia al cambiar de ranura.
    // **Con economía el supresor es del inventario, no del ajuste guardado**: es
    // del arma de esta partida, y quien lleva la cuenta de lo que tienes es el
    // servidor (vuelta 64). Sin ella sigue siendo el ajuste de siempre.
    //
    // **Y la pregunta es si hay inventario, no si hay red** (vuelta 72): un
    // huésped sin rondas no manda ninguno, así que con `enRed` a secas esto
    // leía un `null` y el supresor no se podía poner **de ninguna manera** —ni
    // por el ajuste, que se ignoraba, ni por el servidor, que no contesta—. Se
    // deduce del dato que llega, que es la regla de la casa: un segundo
    // interruptor de «aquí hay economía» sería otra cosa que se desincroniza.
    const puesto = this._invRed
      ? Boolean(this._invRed.supresor?.[this.weaponKey])
      : Boolean(settings.suppressor[this.weaponKey])
    this.suppressorEnabled = puesto && this.weapon.supportsSuppressor
    // **Y lo que pesa se nota al andar.** Va aquí y no en `_equipSlot` porque
    // éste es el único sitio por el que pasan los tres caminos que cambian el
    // arma vigente: la tecla, el ajuste de principal y la armería.
    this.movement.setWeaponWeight(this.weapon.weight)
    this.actionPanel.update({
      weaponLabel: this.weapon.label,
      suppressorSupported: this.weapon.supportsSuppressor,
      suppressorEnabled: this.suppressorEnabled,
    })
    // **Y la red se entera de qué arma se empuña**, porque viaja en cada entrada:
    // el peso frena y el servidor le exige su cadencia (vuelta 56). Se pone
    // aquí porque éste es el único sitio por el que pasan los tres caminos que
    // cambian el arma vigente.
    if (this.enRed) this.net.arma = this.weaponKey
    this.callbacks.onWeapon?.({
      weaponKey: this.weaponKey,
      suppressed: this.suppressorEnabled,
    })
  }

  /** ¿Hay una recarga en curso? */
  get reloading() {
    return this.reloadEndsAt > 0
  }

  /** Deja el cargador lleno y el aviso de munición baja rearmado. */
  _refillMagazine() {
    /**
     * **Y hay armas con reserva** (vuelta 86). Hasta el U2 todas recargaban
     * infinito porque `magazine` era la única cuenta que existía; un
     * lanzacohetes con munición infinita no tiene la decisión que el arma es
     * —lanzar ahora o guardárselo—, así que lo que se mete en el tubo **sale de
     * algún sitio**.
     *
     * Un arma sin `reserva` recorre exactamente el camino de antes: se llena y
     * ya. Nada de lo calibrado hasta hoy se mueve.
     */
    const reserva = this.armaDeTiro?.reserva
    if (!reserva) {
      this.ammo = this.weapon.magazine
      this._lowAmmoWarned = false
      return
    }
    /**
     * **Y lo que ya había se acota al cargador** (vuelta 87). Esto decía
     * `magazine - this.ammo` a secas, y `this.ammo` es el del arma **que
     * acabas de dejar**: sacando el U2 (cargador 1) con el Rift en la mano y
     * treinta balas dentro, `mete` salía **−29** y la línea de abajo se lo
     * sumaba a la reserva — treinta cohetes de la nada, sin un error en ninguna
     * pantalla. Lo cazó `gran87nav` contando granadas: quedaba una de más
     * después de tirar las dos.
     *
     * La regla que lo cierra es la de siempre: un número que viene de fuera se
     * acota antes de usarlo, y aquí «fuera» es el arma anterior.
     */
    const tenia = Math.max(0, Math.min(this.ammo, this.weapon.magazine))
    this.ammo = tenia
    const quedan = this.reservaDe(this.weaponKey)
    if (quedan <= 0) return
    const mete = Math.min(this.weapon.magazine - tenia, quedan)
    this.ammo = tenia + mete
    this._reserva[this.weaponKey] = quedan - mete
    this._lowAmmoWarned = false
  }

  /**
   * **Cuánta reserva queda de un arma.** La primera vez sale de su
   * `reserva.inicial`, que es lo que trae al comprarse; en red manda el
   * servidor, que es quien decide lo que tienes (vuelta 64).
   */
  reservaDe(clave) {
    if (this._reserva[clave] === undefined) {
      this._reserva[clave] = WEAPONS[clave]?.tiro?.reserva?.inicial ?? 0
    }
    return this._reserva[clave]
  }

  /**
   * **Un cohete que mata repone uno** (vuelta 86), con tope.
   *
   * Es la regla entera, y dicha así cumple lo que se pidió sin necesitar otra:
   * hacen falta **dos cohetes con baja** para llegar a cuatro, porque cada uno
   * repone como mucho uno — matar a dos de un solo cohete sigue valiendo uno.
   * Lo que se gana matando no se acumula entre vidas: `reiniciarReserva` lo
   * devuelve a lo de fábrica al empezar una ronda y al morir con él en la mano.
   */
  premiarBajaDeProyectil(clave) {
    const r = WEAPONS[clave]?.tiro?.reserva
    if (!r) return
    const tiene = this.reservaDe(clave) + this.ammo
    if (tiene >= r.maxima) return
    this._reserva[clave] = Math.min(r.maxima - this.ammo, this.reservaDe(clave) + r.porBaja)
  }

  /** Devuelve la reserva de un arma a lo que trae de fábrica. */
  reiniciarReserva(clave) {
    const r = WEAPONS[clave]?.tiro?.reserva
    if (!r) return
    this._reserva[clave] = r.inicial
  }

  /**
   * **Todas las reservas a lo de fábrica** (vuelta 87). Lo llaman empezar una
   * sesión y reaparecer, que es lo que la vuelta 86 dejó escrito del U2 —«lo
   * que se gana matando no se acumula entre vidas»— **y no llegó a llamar**:
   * `reiniciarReserva` existía y no la usaba nadie, así que en el
   * entrenamiento un jugador que muriese con dos cohetes ganados se los
   * quedaba. Con las granadas eso sería peor todavía, porque su reserva no se
   * repone de ninguna otra manera.
   *
   * Recorre el catálogo y no una lista: el día que un arma nueva tenga reserva,
   * se reinicia sola.
   */
  _reiniciarReservas() {
    // **En red no**: lo que tienes lo dice el inventario del servidor (vuelta
    // 64), y pisarlo aquí sería devolverle cohetes a quien el servidor sabe
    // que no los tiene.
    if (this.enRed) return
    for (const clave of Object.keys(WEAPONS)) this.reiniciarReserva(clave)
  }

  /**
   * Arranca una recarga. No hace nada si ya hay una en curso —pulsar R varias
   * veces ni la reinicia ni la acumula— ni con el cargador ya lleno.
   */
  _startReload(now) {
    if (this.reloading || this.phase !== PHASE.RUNNING) return
    if (this.ammo >= this.weapon.magazine) return
    // **Sin reserva no hay recarga**, y se dice: un arma que no responde a la R
    // sin explicar por qué es un arma que parece rota (vuelta 86).
    if (this.armaDeTiro?.reserva && this.reservaDe(this.weaponKey) <= 0) {
      // **Y lo dice el arma**, no esta línea: el U2 se repone matando y una
      // granada no se repone de ninguna manera, así que un aviso escrito aquí
      // mentiría en una de las dos.
      //
      // **Y un arma que se recoge tiene dos** (vuelta 91): «recoge uno del
      // suelo» es un consejo mientras quede alguno, y una mentira en cuanto el
      // suelo está limpio —que es lo que deja una ronda nueva—. Cuál toca lo
      // decide el mundo y no el catálogo, porque es el mundo lo que cambia.
      const r = this.armaDeTiro.reserva
      const enElSuelo = this.clavadas.vivas > 0
      this._showHelp(
        (enElSuelo ? r.aviso : (r.avisoSinNada ?? r.aviso)) ?? 'Sin munición de reserva',
      )
      return
    }
    this.reloadStartedAt = now
    this.reloadEndsAt = now + this.weapon.reloadMs
    // Suena **una vez, al empezar**, y no se corta si la recarga se cancela: lo
    // que se grabó es un gesto entero. Sin muestra no suena nada, que es lo que
    // hacía hasta la vuelta 63.
    playWeaponReload(this.weaponKey)
  }

  _cancelReload() {
    this.reloadEndsAt = 0
    this.reloadStartedAt = 0
  }

  /** Cierra la recarga cuando le toca: cargador lleno y patrón desde cero. */
  _updateReload(now) {
    if (!this.reloading || now < this.reloadEndsAt) return
    /**
     * **Y una escopeta mete un cartucho, no un cargador** (vuelta 91).
     *
     * Se ofrecían las dos formas y ésta es la que **crea una decisión**: con
     * tres dentro y un ruido en el pasillo, meter dos y salir o meter los ocho
     * y llegar tarde es una pregunta que una recarga de bloque no hace nunca.
     * Y no necesita ningún estado nuevo — es el mismo temporizador de siempre
     * rearmado mientras quepa algo—, que es lo que hace que interrumpirla sea
     * gratis: disparar ya cancela una recarga.
     */
    if (this.weapon.recargaPorCartucho) {
      this.ammo = Math.min(this.weapon.magazine, this.ammo + 1)
      this._lowAmmoWarned = false
      this._sprayIndex = 0
      if (this.ammo < this.weapon.magazine) {
        this.reloadStartedAt = now
        this.reloadEndsAt = now + this.weapon.reloadMs
        return
      }
      this._cancelReload()
      return
    }
    this._cancelReload()
    this._refillMagazine()
    // El patrón de retroceso vuelve al principio: un cargador nuevo es una
    // ráfaga nueva.
    this._sprayIndex = 0
  }

  /** Lanza un aviso temporal al HUD, si el jugador los tiene activados. */
  _showHelp(text) {
    if (!this.helpMessagesEnabled) return
    this.callbacks.onHelp?.(text, HELP.messageDurationMs)
  }

  /**
   * Radio angular del desvío que le toca al próximo disparo, en grados.
   *
   * Se abre corriendo —por encima del umbral de velocidad— y también en el
   * aire, donde no hay marcha que valga: saltar penaliza como correr. Caminar
   * con SHIFT y agacharse quedan por debajo del umbral, así que disparan con
   * precisión completa, igual que estar quieto.
   */
  get currentSpreadDeg() {
    const movement = this.movement
    // **El aire tiene su número** (vuelta 88): saltar no es correr deprisa, es
    // haberse quitado el suelo, y lo que cuesta es más. Va primero porque en el
    // aire la marcha también supera el umbral, así que con el orden al revés el
    // desvío del aire no se aplicaría nunca.
    if (movement.airborne) return ACCURACY.airSpreadDeg
    if (movement.horizontalSpeed > ACCURACY.speedThreshold) {
      return ACCURACY.movementSpreadDeg
    }
    return 0
  }

  /**
   * **El rumbo y el cabeceo con los que sale una bala en red**, o sea los de la
   * cámara con el desvío ya sorteado encima.
   *
   * Existe porque hasta la vuelta 88 **el duelo no tenía dispersión en
   * absoluto**: `_shoot` mandaba `camera.rotation.y/x` crudos y `applySpread`
   * sólo corría por la rama del entrenamiento. O sea que el ajuste existía, el
   * panel lo daba por bueno y el modo donde de verdad importa no lo aplicaba —
   * el fallo de la vuelta 67 por la puerta de la red.
   *
   * Se desvía **el vector y no los dos ángulos por separado**, y luego se
   * vuelve: un cono en yaw/pitch se estrecha con el cabeceo, así que apuntando
   * a los pies el desvío sería otro. `direccionDeMira` es la conversión de ida
   * y la usan los dos extremos (`net/disparo.js`), así que la vuelta es su
   * inversa y no una segunda idea de hacia dónde mira alguien.
   *
   * Y lo sortea **el cliente**, que es lo correcto aquí: lo que viaja es el
   * rumbo con el que salió la bala, uno solo, y los dos extremos resuelven ese
   * mismo rayo. Sortearlo en el servidor sería un tirador que ve su bala ir a
   * un sitio y recibe un veredicto de otro.
   */
  _miraConDesvio(out) {
    const yaw = this.camera.rotation.y
    const pitch = this.camera.rotation.x
    const spread = this.currentSpreadDeg
    out.yaw = yaw
    out.pitch = pitch
    if (!(spread > 0)) return out
    direccionDeMira(yaw, pitch, _miraDir)
    applySpread(_miraDir, spread)
    out.pitch = Math.asin(Math.max(-1, Math.min(1, _miraDir.y)))
    out.yaw = Math.atan2(-_miraDir.x, -_miraDir.z)
    return out
  }

  _setPhase(phase) {
    if (this.phase === phase) return
    this.phase = phase
    this.stats.phase = phase
    // El zumbido del escudo va con el estado, no por su cuenta: la carga se
    // congela en pausa —va por delta— y el sonido tiene que congelarse con
    // ella. Al reanudar se relanza por lo que quede, que es lo que evita que
    // una carga termine en silencio.
    if (phase !== PHASE.RUNNING) this._stopShieldSound()
    else if (this.status.applying) {
      this._shieldSound = playShieldCharge(this.status.applyLeftMs / 1000)
    }
    // Salir de la partida cierra el marcador: si no, quedaría abierto sobre el
    // resumen con los datos de una sesión que ya terminó.
    if (phase !== PHASE.RUNNING) this._scoreboardHeld = false
    this.callbacks.onPhaseChange?.(phase)
  }

  _beginSession() {
    this.mode = this._pendingMode
    // **La duración sale del modo**, y «sin cronómetro» es una duración más, no
    // un modo aparte: un Deathmatch de cinco minutos y uno sin límite son el
    // mismo modo con dos relojes. `endless` queda como lo que siempre fue —esta
    // sesión no acaba sola— para el HUD y el resumen.
    //
    // **Y desde la vuelta 78 la elige el jugador en cualquier modo.** Hasta
    // aquí la duración del panel sólo la leía el Deathmatch, así que ponerla en
    // «sin límite» con dianas clásicas dejaba el cronómetro contando los 30 s
    // de siempre: un control puesto que el juego ignoraba. `mode` —el valor de
    // fábrica— es «la del modo» y devuelve exactamente lo de antes, así que
    // quien no lo toque no nota nada.
    const elegida = SESSION_DURATIONS[getSettings().sessionDuration]
    const segundos =
      elegida.seconds ?? (this.mode === 'deathmatch' ? 0 : SESSION_DURATION_S)
    // **En red la sesión no acaba sola** (vuelta 56): la partida dura lo que
    // dure la sala, que es lo único que hoy existe al otro lado. Un cronómetro
    // local cerraría la sesión de uno y dejaría al otro jugando.
    this.endless = this.enRed || segundos === 0
    this.durationMs = this.enRed ? Infinity : segundos * 1000
    this.stats.endless = this.endless
    this.elapsedMs = 0
    this.shots = 0
    this.hits = 0
    this.kills = 0
    this.controls.enabled = true
    this._releaseTrigger()
    this._cancelReload()
    this._resetLoadout()
    this._reiniciarReservas()
    this._refillMagazine()
    this.granadas?.limpiar()
    /**
     * **Y el suelo se limpia de cuchillos** (vuelta 90). Va aquí, en empezar
     * una **sesión**, y no al reaparecer: un cuchillo se queda donde cayó
     * mientras dure la partida, que es lo que lo convierte en algo a lo que
     * volver. Al reaparecer la reserva vuelve a fábrica y los que quedaran en
     * el suelo siguen ahí — recogerlos no sube por encima del tope, así que no
     * hay nada que acumular.
     */
    this.clavadas.limpiar()
    this._publishWeapon(getSettings())
    this._lastShotAt = -Infinity
    this._nextShotAt = -Infinity
    this.movement.reset()
    this.movement.setEnabled(true)
    this._defuseHeld = false
    this.objectiveOutcome = null
    // Vida, escudo y casco vuelven a la dotación de salida, y los recogibles a
    // su sitio. El combate se enciende solo: `enemyFire` ya sabe si toca.
    this.status.reset()
    this._stopShieldSound()
    this.muzzleFlash.clear()
    this.impacts.clear()
    this.dispositivos.clear()
    this.camera.updateMatrixWorld()

    // **Una sesión de red no siembra nada** (vuelta 56). Ni dianas, ni
    // explosivo, ni recogibles, ni muñecos que disparen: el único blanco es el
    // rival y lo pone el servidor. Se apagan aquí y no en `_applySettings`
    // porque es la sesión la que decide qué se monta, y el motor le sigue
    // hablando a los cuatro módulos desde los mismos sitios de siempre.
    if (this.enRed) {
      this.targets.clear()
      this.objective.clear()
      this.pickups.clear()
      this.enemyFire.setEnabled(false)
      this._prepararRival()
      // **Y se empieza en la ranura que el servidor ha dado**, no en el spawn
      // del escenario: `movement.reset()` conoce uno solo y el servidor reparte
      // dos, separados para no aparecer uno dentro del otro. Sin esto, el primer
      // paso de cada partida llegaba con 2.5 u de error y su corrección.
      this.net.colocarEnSalida()
      this.camera.updateMatrixWorld()
      // Encendido para toda la partida: ver `_onPointerLockChange`.
      this.movement.setEnabled(true)
      if (!this.isLocked) this.movement.disconnect()
      // **Y se entra en paso con el servidor.** Mientras se estaba en el menú el
      // contador propio no avanzaba: empezar desde ahí sería mandar entradas
      // selladas con pasos que el servidor dejó atrás hace rato.
      if (this.net.relojFresco()) this.net.reanclar(this.net.pasoObjetivo())
      this.net.soltarAcumulador()
      this._simAccumulator = 0
      this._simPoseEpoch = -1
      this._setPhase(PHASE.RUNNING)
      return
    }

    this.enemyFire.begin()
    this.pickups.begin()
    // La primera diana nace en la posición ya reseteada del jugador.
    const now = this.gameTime
    // **Con explosivo armado no hay reaparición**: el selector de simultáneas
    // pasa a decir cuántos muñecos hay *en toda la ronda*, no cuántos a la vez.
    // Es lo que convierte la ronda en una ronda —se acaban— en vez de en una
    // fuente infinita mientras corre la cuenta atrás. Se decide **antes** de
    // sembrar, porque la primera diana sale dentro de `beginSession`.
    /**
     * **Y sin límite no hay explosivo** (vuelta 88). La bomba **es** el reloj de
     * su sesión —45 s y se acabó—, así que armarla con «sin límite» puesto era
     * el mismo fallo que la vuelta 78 vino a cerrar por la otra punta: un
     * control que promete lo que el juego ignora. Y era peor de leer que aquél,
     * porque aquí lo que ignoraba el ajuste no era el cronómetro sino **un
     * objetivo entero**, con su pitido y su cuenta atrás, cerrando a los 45 s
     * una partida que decía no acabarse. Se mira `endless`, que es el mismo
     * campo del que cuelgan el HUD y el resumen: una segunda condición sería
     * una segunda idea de qué significa «sin límite».
     */
    const conExplosivo = this.mode === 'timed' && !this.endless && this.objective.available
    this.targets.setRoundBudget(conExplosivo ? this.targets.maxAlive : 0)
    // La primera diana la siembra `beginSession` por su cuenta, así que un
    // mundo sin dianas tampoco puede pasar por aquí.
    if (this._conDianas) this.targets.beginSession(this.camera, now)
    else this.targets.clear()
    // El explosivo sólo existe con escenario y con cronómetro. En práctica libre
    // no: esa modalidad existe para no terminar sola, y un explosivo que la
    // cerrase a los 45 s rompería su único contrato.
    this.objective.clear()
    if (conExplosivo) this.objective.begin(now)
    this._setPhase(PHASE.RUNNING)
  }

  /** ¿Es el explosivo quien lleva el reloj de esta sesión? */
  get objectiveRunning() {
    return this.objective.active
  }

  _finishSession() {
    this.controls.enabled = false
    this._releaseTrigger()
    this._defuseHeld = false
    this.movement.setEnabled(false)
    this.targets.clear()
    this.objective.clear()
    this.pickups.clear()
    this._stopShieldSound()
    this._setPhase(PHASE.FINISHED)
    if (this.isLocked) document.exitPointerLock()

    // En práctica libre, y con explosivo, el ritmo se mide contra lo que la
    // sesión haya durado de verdad, no contra la duración nominal.
    const openEnded = this.endless || this.objectiveOutcome !== null
    const seconds = (openEnded ? this.elapsedMs : this.durationMs) / 1000
    // Detonar no puntúa: es un resultado de fallo aparte, no una estrella baja.
    const score = this.objectiveOutcome === OUTCOME.DEFUSED ? this._currentScore() : null
    this.callbacks.onFinish?.({
      objectiveOutcome: this.objectiveOutcome,
      stars: score ? score.stars : 0,
      scoreValue: score ? score.value : 0,
      scoreParts: score ? score.parts : null,
      endless: this.endless,
      mode: this.mode,
      deaths: this.status.deaths,
      hits: this.hits,
      misses: this.shots - this.hits,
      shots: this.shots,
      // Con el hitbox, impactos y dianas abatidas dejan de coincidir: la
      // precisión mide los disparos que entraron, el ritmo mide las bajas.
      kills: this.kills,
      accuracy: this.shots > 0 ? (this.hits / this.shots) * 100 : 0,
      targetsPerSecond: seconds > 0 ? this.kills / seconds : 0,
      durationS: seconds,
    })
  }

  _onContextMenu(event) {
    event.preventDefault()
  }

  /**
   * Pone o quita el supresor del arma **que se lleva en la mano**, que es la
   * regla de la vuelta 43: el supresor es de cada arma y no del jugador. Un arma
   * que no lo admite no hace nada — y hoy las tres lo admiten.
   */
  _alternarSupresor() {
    const arma = this.weapon
    if (!arma?.supportsSuppressor) return
    if (this._invRed) {
      // Con inventario del servidor se pide: lo que tienes lo lleva él. Y la
      // condición es tener inventario y no estar en red, por lo mismo que en
      // `_publishWeapon` (vuelta 72).
      this.net.comprar('supresor', this.weaponKey)
      return
    }
    const settings = getSettings()
    updateSettings({ suppressor: { ...settings.suppressor, [this.weaponKey]: !settings.suppressor[this.weaponKey] } })
  }

  /**
   * **Pone o quita la mirilla.** Lo que cambia es la intención; la transición
   * la corre `_updateScope` con el reloj del mundo.
   */
  _alternarMirilla() {
    this._ponerMirilla(!this._scopeOn)
  }

  /**
   * La intención, y el aviso a la página. `onScope` es una **pulsación**, no un
   * valor por frame: se manda al cambiar de idea y no sesenta veces por
   * segundo, así que puede ser estado de React sin saltarse la regla del HUD.
   * Cada página lo usa para apagar **su** mira, que es lo único de esto que no
   * es del motor.
   */
  _ponerMirilla(puesta) {
    const quiere = Boolean(puesta) && Boolean(this.weapon.scope)
    if (quiere === this._scopeOn) return
    this._scopeOn = quiere
    /**
     * **Y en red se dice, porque el destello lo tiene que ver el rival**
     * (vuelta 90). Va aquí, en el único sitio que escribe `_scopeOn`, y no en
     * un campo que se calcule por frame: así todos los caminos que bajan la
     * mirilla —cambiar de arma, pausar, morir, soltar el ratón— apagan el
     * destello sin que ninguno tenga que acordarse.
     *
     * **Sólo lo declaran las armas que lo llevan** (`scope.destello`): la
     * Scout apunta en silencio, y ésa es la mitad de lo que separa a las dos.
     */
    if (this.enRed) this.net.mirilla = quiere && Boolean(this.weapon.scope?.destello)
    this.callbacks.onScope?.(quiere)
  }

  /**
   * **La transición, con el reloj del mundo.** Va en el paso fijo y no en el
   * frame: así dura los mismos 140 ms en cualquier monitor, que es la regla de
   * la casa para todo lo temporizado. Y de ella cuelgan las tres cosas a la
   * vez —lente, encuadre y sensibilidad—, de modo que no pueden quedarse a
   * medio camino la una de la otra.
   *
   * Cuando no hay nada que animar no toca nada: ni el FOV, ni la matriz de
   * proyección, ni las variables CSS.
   */
  _updateScope(stepMs) {
    const objetivo = this._scopeOn ? 1 : 0
    if (this._scopeT === objetivo) return
    const paso = SCOPE.transitionMs > 0 ? stepMs / SCOPE.transitionMs : 1
    const t = objetivo > this._scopeT
      ? Math.min(objetivo, this._scopeT + paso)
      : Math.max(objetivo, this._scopeT - paso)
    this._scopeT = t
    this.scope?.set(t)
    const fovMirilla = this.weapon.scope?.fov ?? CAMERA.fov
    this.camera.fov = CAMERA.fov + (fovMirilla - CAMERA.fov) * t
    this.camera.updateProjectionMatrix()
    this._aplicarSensibilidad()
  }

  /**
   * **La sensibilidad vigente sale de un solo sitio.** Con la mirilla a medio
   * poner se interpola entre las dos, porque el encuadre también está a medio
   * camino: cambiarla de golpe en el instante del clic es un tirón justo en el
   * gesto que se hace para afinar.
   */
  _aplicarSensibilidad() {
    const t = this._scopeT
    this.controls.setSensitivity(this._sensNormal + (this._sensMirilla - this._sensNormal) * t)
  }

  _onMouseDown(event) {
    /**
     * **El clic derecho pone y quita el supresor del arma que llevas**
     * (vuelta 64). Es el mismo gesto en los dos modos —ahí está la convención de
     * la 63— y lo que cambia es quién lleva la cuenta: fuera de la red, el
     * ajuste de siempre; en red, el inventario del servidor, que contesta con
     * `MSG.ECONOMIA` y de ahí vuelve por `_aplicarInventario`.
     *
     * Va antes del filtro del gatillo porque no es disparar, y pide el ratón
     * capturado por lo mismo que lo pide disparar: con el ratón suelto estás en
     * un menú.
     */
    if (event.button === 2) {
      event.preventDefault()
      if (!this.isLocked || this.phase !== PHASE.RUNNING) return
      /**
       * **Y desde la vuelta 70 también pone y quita la mirilla**, en las armas
       * que la tienen. No son dos gestos peleándose por el mismo botón: el clic
       * derecho es «la segunda función del arma que llevas», y un arma tiene
       * una u otra. La Scout no admite supresor y sí mirilla, así que la
       * decisión la toma el dato del arma y no un modo.
       */
      // **Y en un cuchillo es el golpe fuerte** (vuelta 71). Sigue siendo la
      // misma regla —«la segunda función del arma que llevas»— y por eso no hay
      // un tercer sitio donde decidirlo: mirilla, supresor o golpe fuerte, lo
      // dice el arma.
      if (this.weapon.melee) {
        const ts = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : performance.now()
        this._tryMelee('fuerte', this.gameTime, ts)
        return
      }
      /**
       * **Y en una granada es el tiro corto** (vuelta 87), que es la cuarta
       * cosa que puede haber detrás de este botón y sigue siendo la misma
       * regla: *la segunda función del arma que llevas*, y lo dice el dato.
       * Una granada no admite supresor ni tiene mirilla, así que el botón
       * estaba libre.
       *
       * Lo que resuelve está en el encargo con todas las letras: para dejar
       * caer una granada a tus pies hay que mirar al suelo, **y mirar al suelo
       * es perder el horizonte**. Con esto se apunta a donde se estaba mirando
       * y la granada sale con el ángulo ya bajado.
       */
      if (this.weapon.tiro?.granada) {
        this._empezarCarga(this.gameTime, true)
        return
      }
      if (this.weapon.scope) this._alternarMirilla()
      else this._alternarSupresor()
      return
    }
    if (!this._isBind('shoot', event)) return

    // Sin el ratón capturado, el click sirve para capturarlo: no dispara.
    // Así el click que arranca (o reanuda) la sesión nunca cuenta como fallo,
    // y mantener pulsado durante ese click tampoco arranca una ráfaga: el
    // gatillo sólo se considera apretado desde aquí.
    if (!this.isLocked) {
      this.requestLock()
      return
    }
    if (this.phase !== PHASE.RUNNING) return

    this._triggerHeld = true
    const now = this.gameTime
    // **El instante real del clic**, que es de donde sale la fracción de paso
    // del disparo en red. Fuera de la red no se usa y no cuesta nada.
    const ts = Number.isFinite(event.timeStamp) && event.timeStamp > 0
      ? event.timeStamp
      : performance.now()

    // Darle a un botón es accionarlo, no disparar: no cuenta como acierto ni
    // como fallo, no gasta munición y no mueve la cámara. Pero sólo gana si es
    // lo más cercano bajo el punto de mira — ver `_tryPanelAction`.
    if (this._tryPanelAction(now)) {
      this._triggerConsumedByPanel = true
      return
    }

    // **Un cuchillo no tiene cargador que sonar en seco** (vuelta 71): el clic
    // izquierdo es el golpe flojo y no hay munición de por medio. Va antes de
    // la comprobación de abajo por eso mismo — con `magazine: 0`, un cuchillo
    // estaría siempre «vacío».
    if (this.weapon.melee) {
      this._tryMelee('luz', now, ts)
      return
    }

    // Con el cargador vacío el gatillo suena en seco, una vez por pulsación:
    // el fuego automático no repite el clic, que sería insufrible.
    //
    // **Y suena también durante la recarga**, que es lo único que hay con el
    // cargador a cero: la última bala arranca la recarga sola (`_consumeAmmo`),
    // así que «vacío y sin recargar» es un estado que el juego no produce nunca.
    // Mientras esta condición pedía `!this.reloading`, el clic existía, sonaba
    // en una prueba que ponía ese estado a mano, y no se podía oír jugando.
    if (this.ammo <= 0) {
      playDrySound()
      // Pedir R mientras la recarga ya corre sería un mal consejo: el HUD
      // enseña su barra y no hay nada que pulsar.
      if (!this.reloading) this._showHelp('Pulsa R para recargar')
      return
    }
    /**
     * **Con un arma de carga la pulsación no dispara: empieza a tensar**
     * (vuelta 85). Es lo que hace de `carga` un modo y no un `semi` con un
     * adorno: en `semi` la pulsación **es** el disparo, y aquí es el principio
     * de otra cosa que puede durar tres cuartos de segundo y que se puede
     * abortar. Lo que dispara es soltar, en `_onMouseUp`.
     *
     * **Y lo decide el modo, no tener bloque `tiro`** (vuelta 86). Esto decía
     * `armaDeTiro` y con el U2 —que lanza pero no carga— el clic entraba por
     * aquí: `cargaActual` dividía por un `cargaMs` que no existe, salía `NaN`,
     * y el cohete nacía con velocidad `NaN`. Un proyectil así **no choca con
     * nada** —ninguna comparación con `NaN` es cierta— así que volaba para
     * siempre con su silbido detrás, y lo que se veía por fuera eran sesenta
     * errores de audio por segundo en una consola que nadie mira. Lo cazó la
     * guarda de `spatial.setPosition`.
     */
    if (this.weapon.mode === 'carga') {
      this._empezarCarga(now)
      return
    }
    this._tryShoot(now, ts)
  }

  _onMouseUp(event) {
    /**
     * **Y el clic derecho también suelta** (vuelta 87), porque con una granada
     * es el otro lanzamiento. La condición es qué botón empezó la carga y no
     * cuál se levanta: soltar el izquierdo no puede tirar el corto que estabas
     * tensando con el derecho.
     */
    if (event.button === 2) {
      if (this.cargando && this._cargaCorta) this._soltarCarga(this.gameTime)
      return
    }
    if (!this._isBind('shoot', event)) return
    // **Soltar el botón es lo que dispara un arma de carga** (vuelta 85), y va
    // antes de `_releaseTrigger`, que es quien aborta lo que quede tensado.
    if (this.cargando && !this._cargaCorta && !this._triggerConsumedByPanel) {
      this._soltarCarga(this.gameTime)
    }
    this._releaseTrigger()
  }

  /**
   * ¿Este evento —de teclado o de ratón— es la acción pedida? Un solo sitio
   * donde se compara input contra binds, y usa el mismo vocabulario de códigos
   * que el panel de controles.
   */
  _isBind(action, event) {
    return keysOf(action, this._binds).includes(eventCode(event))
  }

  /**
   * Avanza el explosivo y cierra la sesión cuando se resuelve. Desactivarlo y
   * que detone terminan igual de rápido: los dos son un final, no un evento.
   */
  _updateObjective(now, deltaSeconds) {
    if (!this.objective.active) return
    // En pausa el explosivo se congela entero, cuenta atrás y pitido incluidos,
    // igual que las dianas. El progreso de desactivación se conserva: pausar no
    // es soltar la tecla.
    if (this.phase !== PHASE.RUNNING) return
    const outcome = this.objective.update(now, deltaSeconds, this.camera, this._defuseHeld)
    if (!outcome) return

    this.objectiveOutcome = outcome
    if (outcome === OUTCOME.DEFUSED) playObjectiveDefused()
    else playObjectiveExplosion()
    this._finishSession()
  }

  /**
   * **Combate.** Los relojes del jugador, el fuego enemigo y los recogibles.
   *
   * Va con el delta de juego y no con `performance.now()` para los dos relojes
   * que pueden esperar —la carga del escudo y la reaparición—, así que pausar no
   * regala una reaparición de quince segundos.
   *
   * @param {number} deltaMs tiempo de juego del frame; cero en pausa
   */
  _updateCombat(now, deltaMs) {
    // **En red el combate no se simula: se obedece** (vuelta 56). No hay
    // muñecos a los que dar un paso ni una cuenta de reaparición que descontar
    // —las dos cosas las lleva el servidor—, así que lo que queda es leer lo
    // que ha llegado y ponerlo en pantalla.
    if (this.enRed) {
      this._syncRival(now, deltaMs)
      return
    }
    const status = this.status
    const { shieldReady, respawnReady } = status.tick(deltaMs)
    if (shieldReady) this._stopShieldSound()
    if (respawnReady) this._respawnPlayer()

    // El cuerpo sale del movimiento, no de la cámara: entre las dos está el
    // hundimiento del aterrizaje.
    const body = status.alive
      ? playerBody(this.camera, this.movement.eyeHeight, this.movement.feetY)
      : null
    this.enemyFire.update(now, this.targets.instances, body)
    // Los marcadores van **después** del fuego: enseñan el estado de este frame,
    // no el del anterior.
    this.markers.update(now, deltaMs, this.targets.instances, this.camera, this._enemyPhase)
    // Los fogonazos van con `now` y no con el delta de juego: son de los
    // disparos que acaban de salir, y en pausa no sale ninguno.
    this.muzzleFlash.update(now, this.camera)
    this.pickups.update(now, deltaMs / 1000, this.camera)
  }

  /**
   * Los marcadores siguen al pool: mismas ranuras, mismo radio y la misma
   * condición de encendido que el fuego enemigo —sin quien dispare no hay
   * estado que enseñar, y una brújula sobre una esfera flotante no dice nada—.
   *
   * Se reconstruyen sólo cuando cambia el tamaño o el número de ranuras, no por
   * frame ni por sesión.
   */
  _syncMarkers(settings) {
    // **En red hay un solo blanco y es una persona** (vuelta 56). Los
    // marcadores no se enteran: siguen recibiendo una lista de instancias con
    // la misma forma de siempre, y el adaptador que la fabrica está en
    // `_syncRival`. Una ranura, del tamaño del cuerpo de un jugador.
    if (this.enRed) {
      this.markers.setEnabled(true)
      if (this.markers.slots.length !== 1 || this.markers.radius !== TARGET.radius) {
        this.markers.build(1, TARGET.radius)
      }
      return
    }
    const enabled = this.enemyFire.enabled
    this.markers.setEnabled(enabled)
    if (!enabled) return
    const slots = this.targets.instances.length
    if (this.markers.slots.length !== slots || this.markers.radius !== settings.targetRadius) {
      this.markers.build(slots, settings.targetRadius)
      // El pool de fogonazos va con el mismo disparador y por el mismo motivo:
      // una ranura por muñeco y el tamaño escalado con el suyo.
      this.muzzleFlash.build(slots, settings.targetRadius)
    }
  }

  /**
   * **El rival de carne y hueso, y los marcadores puestos encima** (vuelta 56).
   *
   * Aquí está el adaptador que pedía la evaluación: `markers.update` espera una
   * lista de instancias con `{ state, group.position, facing, friendly, nick,
   * weaponKey }` y lo que hay es la pose interpolada de una persona. Se fabrica
   * **una sola instancia, reutilizada**, y el cuerpo del rival es el objeto que
   * la lleva: así la brújula gira con su rumbo de verdad y la ficha flotante
   * sale apuntándole, con su arma y su ranura, sin que `markers.js` sepa que al
   * otro lado hay una red.
   *
   * Dos cosas que no son evidentes:
   *
   * - **Un cadáver no se dibuja, y tampoco se marca.** `poseDelRival` publica
   *   `vivo` del lado viejo de la interpolación (vuelta 52), y de ahí sale el
   *   `state` que apaga la ranura entera — brújula, iconos y ficha.
   * - **Los iconos `?` y `!` se quedan apagados**, y es a propósito: dicen «te
   *   ha visto» y «te está disparando», y eso es estado de una máquina que hoy
   *   sólo existe para los muñecos. Deducirlo desde fuera mirando relojes sería
   *   la segunda copia que la vuelta 37 se negó a tener. El día que el disparo
   *   del rival viaje en la foto, la fase sale de ahí y no de una suposición.
   */
  _syncRival(now, deltaMs) {
    this._leerEstadoDeRed()
    const pose = this.net.poseDelRival()
    const avatar = this._rivalAvatar
    const instancia = this._rivalInstancia
    if (!avatar || !instancia) return
    if (!pose || !pose.vivo) {
      avatar.group.visible = false
      instancia.state = 'down'
      // Un abatido no pisa, y al reaparecer lo hace en otro sitio: sin esto, el
      // salto del teletransporte contaría como suelo andado y sonaría una
      // ráfaga de pisadas en el punto de aparición.
      this._rivalPrevX = null
      this._rivalPrevZ = null
      /** La época de pose del rival en el frame anterior. Ver `_pisadasDelRival`. */
      this._rivalEpoca = null
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      this._rivalPisadaT = 0
    } else {
      avatar.group.visible = true
      avatar.group.position.set(pose.x, pose.feetY, pose.z)
      avatar.group.rotation.y = pose.yaw
      avatar.setEyeHeight(pose.eyeHeight)
      instancia.state = 'alive'
      // **El yaw del rival es el de su cámara, y `facing` es de un marcador.**
      // Son convenciones opuestas —una mira a −Z y la otra a +Z— y pasarlo tal
      // cual pintaba la brújula apuntando a su espalda. El cuerpo se queda con
      // el yaw crudo a propósito: es un sólido de revolución, así que su giro
      // no se ve, y ponerle el de la brújula sería decir que tiene frente.
      instancia.facing = facingDesdeCamara(pose.yaw)
      instancia.weaponKey = this.net.rival.arma ?? instancia.weaponKey
      /**
       * **Y si está mirando por un visor que brilla** (vuelta 90). Es el
       * primer campo de esta instancia que dice lo que el rival **está
       * haciendo** y no lo que es: la brújula dice hacia dónde mira y la ficha
       * qué lleva. Va aquí, en el adaptador, para que `markers.js` siga sin
       * saber que al otro lado hay una red — un muñeco no lo pone nunca y su
       * marcador sale apagado solo.
       */
      instancia.mirilla = this.net.rival.mirilla === true
      this._pisadasDelRival(pose)
    }
    this.markers.update(now, deltaMs, this._rivalInstancias, this.camera, _sinFase)
  }

  /**
   * **Las pisadas del rival** (vuelta 60), que es lo que deja oír a alguien que
   * no ves. Se apoyan en la pose que ya se está dibujando, así que no piden ni
   * un dato más al protocolo ni un rayo por frame.
   *
   * Tres cosas que son el mecanismo:
   *
   * - **El paso se mide en suelo andado, no en tiempo.** Una zancada es un trozo
   *   de suelo (`FOOTSTEPS.strideU`), así que agacharse o andar bajan el ritmo
   *   solos, sin una segunda tabla de cadencias. Por tiempo, un agachado pisaría
   *   igual de rápido que uno corriendo, que es como se oye que las pisadas son
   *   de mentira.
   * - **Un teletransporte no es suelo andado.** La época de pose ya dice cuándo
   *   el rival ha saltado (vuelta 50) y aquí se traduce en olvidar la referencia:
   *   si no, reaparecer sonaría a media docena de pisadas de golpe.
   * - **Y el jugador no oye las suyas.** Esto sólo mira al rival. Las propias no
   *   dicen nada que no sepas —estás pulsando la tecla— y taparían justo lo que
   *   se quiere oír.
   * - **Sólo se oye a quien corre** (vuelta 63). Andar con SHIFT y agacharse no
   *   suenan **en absoluto**: es lo que promete la tecla, y lo que cuesta es la
   *   velocidad. Antes sonaban más bajo, que es otra cosa — con el volumen de
   *   un rival a doce unidades por medio, «más bajo» se oye igual.
   * - **Y hay un radio.** Fuera de `FOOTSTEPS.maxDistanceU`, silencio; dentro,
   *   el panner del emisor sube con la cercanía hasta el techo de
   *   `AUDIO.footstepVolume` y no pasa de ahí.
   */
  /**
   * **La puerta de un rival se oye desde cerca** (vuelta 82).
   *
   * Un teletransporte del rival no viaja como tal: lo que viaja es que su
   * época ha cambiado, y eso también lo hace una reaparición. Distinguirlos no
   * pide un campo nuevo — pide **preguntarle al mapa**, que los dos extremos
   * montan igual: si de donde saltó había un área de teletransporte, fue una
   * puerta. Es el mismo patrón que la física de la vuelta 72 y las superficies
   * de la 80: no viaja ningún número.
   *
   * Suena en **el sitio del que se fue** y no donde apareció: quien está cerca
   * de la entrada es quien tiene derecho a enterarse de que alguien acaba de
   * cruzar por ahí.
   */
  _puertaDelRival(desdeX, desdeZ, pose) {
    if (!this.scenario?.teletransportes?.length) return
    const tp = this.scenario.teletransporteEn(desdeX, desdeZ, pose.feetY)
    if (!tp) return
    const lejos = Math.hypot(desdeX - this.camera.position.x, desdeZ - this.camera.position.z)
    if (lejos > SURFACES.audio.maxDistanceU) return
    this.dispositivos.emitir('tp-entrada', desdeX, pose.feetY, desdeZ, 0, this.gameTime)
    this.dispositivos.emitir('tp-salida', pose.x, pose.feetY, pose.z, pose.yaw ?? 0, this.gameTime)
    this._emisorDispositivo.setPosition(desdeX, pose.feetY + 1, desdeZ)
    playDevice('puerta', this._emisorDispositivo)
  }

  _pisadasDelRival(pose) {
    const emisor = this._rivalEmisor
    if (!emisor) return

    const previaX = this._rivalPrevX
    const previaZ = this._rivalPrevZ
    const ahora = performance.now()
    const antes = this._rivalPisadaT
    this._rivalPrevX = pose.x
    this._rivalPrevZ = pose.z
    // Sin referencia —acaba de entrar, de reaparecer o de saltar— este frame
    // sólo sirve para sembrarla.
    if (previaX === null) {
      this._rivalPisadaT = ahora
      return
    }

    const avance = Math.hypot(pose.x - previaX, pose.z - previaZ)
    // **La pose del rival se mueve con el frame, no con el paso de mundo**, y
    // este método corre dentro del paso: en un frame que gasta dos pasos, el
    // segundo ve exactamente la misma pose que el primero. Así que aquí no se
    // usa el `stepMs` —dividir el avance de un frame entre un paso infla la
    // velocidad, y con frames largos la inflaba por encima del techo del aire y
    // el guardia de teletransporte borraba la cuenta en cada frame: medido,
    // **cero pisadas** con el rival andando de verdad—. El reloj de esto es el
    // de pared, que es el que mueve lo que se está midiendo.
    if (avance === 0) return
    this._rivalPisadaT = ahora
    const dt = ahora - antes
    if (dt <= 0) return
    const velocidad = (avance / dt) * 1000

    /**
     * **Un salto de pose no es suelo andado, y lo dice la época** (vuelta 82).
     *
     * Hasta aquí se deducía de la velocidad —«más del doble del techo del
     * aire»— y eso dejó de valer en esta misma vuelta: una plataforma de
     * velocidad puede lanzar a 60 u/s, así que **un lanzamiento se leía como un
     * teletransporte**. La época es el dato que de verdad dice que no hubo
     * camino (vuelta 50), y es exactamente la razón por la que existe en vez de
     * mirar cuánto se ha movido alguien.
     */
    if (pose.epoca !== undefined && pose.epoca !== this._rivalEpoca) {
      const antes = this._rivalEpoca
      this._rivalEpoca = pose.epoca
      // Y si el salto salió de una puerta del mapa, se oye desde donde se fue.
      // No hace falta un campo en el protocolo: los dos extremos montan el
      // mismo mapa, así que preguntarle dónde estaba es preguntárselo al mapa.
      if (antes !== null && previaX !== null) this._puertaDelRival(previaX, previaZ, pose)
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      return
    }

    // **Agachado no se oye** (vuelta 63), y sale de la altura de ojos, que ya
    // viaja en la foto: es el mismo dato del que el cuerpo saca su achatamiento,
    // así que no hace falta un campo nuevo. Va como regla propia y no confiada
    // al umbral de abajo —que también lo dejaría fuera por lento— porque es lo
    // que promete la tecla: subir `crouchSpeed` algún día no puede devolverle el
    // ruido a quien se agacha.
    if (pose.eyeHeight <= (MOVEMENT.crouchHeight + MOVEMENT.standHeight) / 2) return

    // Fuera del radio, silencio total. El panner ya llega a cero justo aquí
    // (`fullDistanceU`/`maxDistanceU`), así que esto no cambia lo que se oye:
    // ahorra el trabajo y, sobre todo, **dice la regla** en un sitio donde se
    // lee. Las dos puntas tienen que decir lo mismo.
    const lejos = Math.hypot(pose.x - this.camera.position.x, pose.z - this.camera.position.z)
    if (lejos > FOOTSTEPS.maxDistanceU) return

    // **Una zancada es lo que te has movido, no lo que ha sumado el dibujo.** El
    // rival se interpola entre fotos y esa trayectoria tiembla: sumando el
    // avance de cada frame, el camino sale más largo que el recorrido y las
    // pisadas salen de más —medido, 11 en 13.3 u con una zancada de 1.9, o sea
    // media docena de sobra—. Se mide contra dónde se dio la última.
    if (this._rivalPasoX === null) {
      this._rivalPasoX = pose.x
      this._rivalPasoZ = pose.z
      this._rivalPasoT = ahora
      return
    }
    const zancada = Math.hypot(pose.x - this._rivalPasoX, pose.z - this._rivalPasoZ)
    if (zancada < FOOTSTEPS.strideU) return
    const zancadaMs = ahora - this._rivalPasoT
    this._rivalPasoX = pose.x
    this._rivalPasoZ = pose.z
    this._rivalPasoT = ahora

    // **Y sólo se oye a quien corre**, medido **sobre la zancada** y no sobre el
    // frame. Andar con SHIFT compra **silencio**, no un volumen más bajo: para
    // eso está la tecla, y lo que cuesta es la velocidad.
    //
    // La marcha de un frame no sirve para decidirlo: el rival se dibuja
    // interpolando entre fotos y esa trayectoria **tiembla**, así que un paseo
    // de 3.8 u/s pica por encima del umbral cada pocos frames y sonaba igual —
    // medido, 4 pisadas andando con la regla puesta sobre el frame. La zancada
    // es una ventana de un tercio de segundo, que es justo lo que promedia ese
    // temblor: la idea de la vuelta 60 —una zancada es un trozo de suelo—
    // aplicada también al **cuánto tardó** en darla.
    //
    // El umbral es fracción de **su** carrera, con el peso de su arma contado
    // por la misma función que frena al jugador: contra los 6.5 de la pistola,
    // un rival con la Rift (5.88) correría en silencio.
    const suArma = WEAPONS[this.net?.rival?.arma]
    const suCarrera = MOVEMENT.speed * weaponSpeedFactor(suArma?.weight ?? 0)
    const marchaDeZancada = zancadaMs > 0 ? (zancada / zancadaMs) * 1000 : 0
    if (marchaDeZancada < suCarrera * FOOTSTEPS.runFraction) return

    // **Todas las pisadas que suenan son de alguien corriendo**, así que todas
    // suenan al techo: lo que cambia entre una y otra es la distancia, y de eso
    // se encarga el panner (la regla de siempre — con panner, atenuar además a
    // mano sería atenuar dos veces).
    this._rivalPisadas += 1
    playFootstep(1, emisor)
  }

  /**
   * Monta el cuerpo del rival y su instancia de marcador. Se llama al empezar
   * la sesión de red: el nick sale de la ranura que el servidor haya dado, que
   * es la misma de la que sale su color.
   */
  _prepararRival() {
    // `TEAMS` va por nombre y la ranura es un número: el orden de las claves es
    // el mismo que usa el servidor para repartirlas (ver `salidas`).
    const suyo = TEAMS[Object.keys(TEAMS)[this.net.equipoRival % Object.keys(TEAMS).length]]
    if (!this._rivalAvatar) {
      this._rivalAvatar = new Avatar(TARGET.radius, suyo.color)
      this._rivalAvatar.group.visible = false
      this.scene.add(this._rivalAvatar.group)
      this._rivalInstancia = {
        state: 'down',
        group: this._rivalAvatar.group,
        facing: 0,
        friendly: false,
        nick: '',
        weaponKey: null,
      }
      this._rivalInstancias = [this._rivalInstancia]
      /**
       * **El emisor cuelga del cuerpo del rival**, así que se mueve con él y
       * nadie tiene que acordarse de colocarlo. Se crea una vez: un emisor por
       * pisada serían sesenta nodos de audio por segundo.
       *
       * **Y lleva la curva de las pisadas, no la de la sala** (vuelta 63): pleno
       * hasta `FOOTSTEPS.fullDistanceU` y apagado del todo en `maxDistanceU`.
       * Con la de `SPATIAL` —pensada para que un sonido se oiga de punta a punta
       * de un mapa de 55 u— una pisada a doce unidades salía a un decibelio de
       * una a cuatro, que es un radar y no una pista. Por eso este emisor es
       * hoy **el de las pisadas**: si el rival gana otra voz posicionada (su
       * disparo, un grito), va en un emisor suyo, con su curva.
       */
      this._rivalEmisor = createEmitter(this._rivalAvatar.group, {
        refDistance: FOOTSTEPS.fullDistanceU,
        maxDistance: FOOTSTEPS.maxDistanceU,
        rolloffFactor: 1,
      })
      /**
       * Dónde y cuándo se dio la última pisada. Una zancada es **distancia**, y
       * lo que tardó en darse es lo que dice si el rival corre o pasea: el frame
       * suelto tiembla demasiado para decidirlo (vuelta 63).
       */
      this._rivalPasoX = null
      this._rivalPasoZ = null
      this._rivalPasoT = 0
      this._rivalPrevX = null
      this._rivalPrevZ = null
      /** Cuándo se leyó la pose del rival por última vez, en reloj de pared. */
      this._rivalPisadaT = 0
      /** Cuántas pisadas del rival se han soltado. Lo miran los bancos. */
      this._rivalPisadas = 0
    }
    this._rivalAvatar.setColor(suyo.color)
    this._rivalInstancia.nick = this.net.nickRival
    this._syncMarkers(getSettings())
  }

  /**
   * Un disparo enemigo ha entrado. Aquí se decide qué significa; el módulo que
   * dispara sólo sabe de geometría.
   */
  _onPlayerHit({ zone, damage, weaponKey, fromX, fromZ }) {
    const result = this.status.takeHit(zone, damage, weaponKey)
    // En los segundos de gracia el disparo no existe: ni daño, ni sonido, ni
    // anillo. Un anillo de daño sin daño enseñaría lo contrario de lo que pasa.
    if (result.blocked) return
    const bearing = this._bearingTo(fromX, fromZ)
    if (result.helmetBroken) {
      // El único aviso de que la cabeza se ha quedado descubierta.
      playHelmetCrack()
      this.callbacks.onDamage?.(0, bearing)
      return
    }
    playDamage(Math.min(1, damage / PLAYER.maxHealth))
    this.callbacks.onDamage?.(damage / PLAYER.maxHealth, bearing)
    if (!result.killed) return
    this._downPlayer()
  }

  /**
   * **Hacia dónde queda un punto del mundo, desde donde miras ahora.** Cero es
   * justo delante, positivo a la derecha, π a la espalda.
   *
   * Se mide **en horizontal**, con la misma razón que el cono de aparición: un
   * disparo que llega desde arriba sigue llegando desde un lado, y mirar al
   * suelo no puede cambiar de qué lado. Y sale del vector de la cámara y no de
   * su `rotation.y` porque el empuje del retroceso también mueve la mira: lo que
   * hay que contestar es hacia dónde girar **desde lo que se ve**.
   */
  _bearingTo(x, z) {
    this.camera.getWorldDirection(_bearingForward)
    const fx = _bearingForward.x
    const fz = _bearingForward.z
    const flat = Math.hypot(fx, fz)
    if (flat < 1e-6) return 0
    const dx = x - this.camera.position.x
    const dz = z - this.camera.position.z
    // Derecha de la cámara, en el plano: forward × arriba.
    return Math.atan2((-fz * dx + fx * dz) / flat, (fx * dx + fz * dz) / flat)
  }

  /**
   * **El estado de red, leído de la foto** (vuelta 56). Se llama una vez por
   * paso, desde `_syncRival`, y es el único sitio donde vida, abatido y
   * reaparición entran en el motor.
   *
   * Los tres métodos de abajo no cambian de forma: lo que cambia es **quién los
   * llama**. Fuera de la red los llama `status`, que lleva la cuenta; en red
   * los llama esto, que no lleva ninguna — el servidor ya la lleva, y una
   * segunda cuenta local es exactamente la que acaba discrepando.
   *
   * Y el aviso de daño sale de comparar la vida con la de la foto anterior, no
   * de un evento: un campo que ya viaja dice lo mismo que un mensaje nuevo, y
   * perder una foto no pierde el golpe porque la siguiente trae la vida igual.
   * Lo que se pierde es **de cuántos golpes** venía, que no es lo que el anillo
   * de la mira enseña.
   */
  _leerEstadoDeRed() {
    const vida = this.net.vida
    const abatido = vida <= 0
    if (vida < this._vidaPrevia) {
      const pose = this.net.poseDelRival()
      const rumbo = pose ? this._bearingTo(pose.x, pose.z) : 0
      const cuanto = (this._vidaPrevia - vida) / PLAYER.maxHealth
      playDamage(Math.min(1, cuanto))
      this.callbacks.onDamage?.(cuanto, rumbo)
    }
    this._vidaPrevia = vida
    if (abatido && !this._abatidoEnRed) {
      this._abatidoEnRed = true
      this._downPlayer()
      return
    }
    if (!abatido && this._abatidoEnRed) {
      this._abatidoEnRed = false
      this._respawnPlayer()
    }
  }

  /** Abatido: se congela al jugador y arranca la cuenta de reaparición. */
  _downPlayer() {
    this._ponerMirilla(false)
    // **En red la muerte ya la ha decidido el servidor**: `status` no lleva la
    // cuenta de nada y llamarle aquí arrancaría una reaparición local que iría
    // por su lado. Lo demás —soltar el gatillo, cancelar la recarga— sí es del
    // cliente y se hace igual.
    if (!this.enRed) this.status.die()
    this._stopShieldSound()
    this._releaseTrigger()
    this._cancelReload()
    this._defuseHeld = false
    // La mirada se queda: ver quién te ha matado es información. Lo que se
    // apaga es andar y disparar. **En red no**: quien decide que un muerto no
    // se mueve es el servidor, que ignora sus entradas hasta `vivoEn` (vuelta
    // 52), y apagar además el movimiento local dejaría de producir entradas —y
    // sin entradas suyas no reaparece nunca, porque la reaparición cuelga de
    // ellas—. El resultado se ve igual: 0.00 u con la tecla pulsada.
    if (!this.enRed) this.movement.setEnabled(false)
  }

  _respawnPlayer() {
    // **La reaparición en red ya ha ocurrido**: la hizo `_aplicar` al ejecutar
    // la primera entrada que alcanzaba `vivoEn`, y con ella el `reset()` que
    // sube la época de pose. Repetirla aquí sería un segundo teletransporte, y
    // encima uno que el servidor no predijo.
    if (!this.enRed) {
      this.status.respawn()
      this.movement.reset()
    }
    this.movement.setEnabled(this.phase === PHASE.RUNNING)
    // Las dos armas llenas, pero en la mano sigue la que llevabas: reaparecer
    // repone munición, no te cambia de arma.
    this._stowed = {}
    this._reiniciarReservas()
    this._refillMagazine()
    // **Y la pantalla se limpia**: heredar la ceguera de la vida anterior sería
    // aparecer sin poder ver por algo que le pasó a un cuerpo que ya no existe.
    this.granadas?.limpiar()
    this.camera.updateMatrixWorld()
  }

  /**
   * Un recogible bajo los pies. Devuelve si se consume: con el inventario lleno
   * o la vida al máximo, el objeto se queda donde está para cuando haga falta.
   */
  _collect(kind) {
    const status = this.status
    if (!status.alive) return false
    if (kind === 'health') {
      if (!status.heal()) return false
      playHeal()
      this._showHelp('Vida recuperada')
      return true
    }
    if (kind === 'helmet') {
      if (!status.equipHelmet()) return false
      playUiConfirm()
      this._showHelp('Casco equipado')
      return true
    }
    if (!status.addCharge()) return false
    playUiConfirm()
    this._showHelp('Carga de escudo · pulsa 4 para aplicarla')
    return true
  }

  /**
   * Puntuación viva de la sesión. Se recalcula cada vez que se pide, que es en
   * cada frame: son cuatro divisiones y una media, muy por debajo de lo que
   * costaría guardarla y mantenerla sincronizada.
   */
  /**
   * **Enseña o esconde el cono de aparición** (vuelta 78). Lo llama el panel de
   * opciones al abrirse y al cerrarse.
   *
   * No se enciende donde no significa nada: con un escenario montado las dianas
   * salen en puntos de ruta y el cono no decide nada, así que dibujarlo sería
   * prometer un sitio de aparición que no existe — la misma razón por la que el
   * panel ya avisa de que ahí la distancia tampoco se aplica.
   */
  mostrarConoDeAparicion(visible) {
    this._verCono = Boolean(visible)
    if (!this._verCono) this.spawnCone.setVisible(false)
  }

  _actualizarCono() {
    const ver = this._verCono && this.targets.muestreaPorCono && !this.enRed
    this.spawnCone.setVisible(ver)
    if (!ver) return
    const [cerca, lejos] = this.targets.rangoDeDistancia()
    this.spawnCone.configurar(this.targets.coneHalfAngle, cerca, lejos)
    this.targets.ejeDeAparicion(this.camera, _ejeCono)
    this.spawnCone.colocar(this.camera.position, _ejeCono)
  }

  _currentScore() {
    return computeScore({
      shots: this.shots,
      hits: this.hits,
      elapsedMs: this.elapsedMs,
      // Cada arma se juzga contra lo que es razonable acertar con ella.
      precisionTarget: this.weapon.precisionTarget,
      // Ya no son reservadas: desde que los muñecos disparan, esto son datos.
      damageTaken: this.status.damageTaken,
      deaths: this.status.deaths,
    })
  }

  _onWindowBlur() {
    // Alt-tab con E pulsada dejaría el explosivo desactivándose solo.
    this._defuseHeld = false
    // Y con TAB pulsada —que es justo la mitad de un alt-tab— dejaría el
    // marcador abierto para siempre: la tecla se suelta fuera de la ventana y
    // el `keyup` no llega nunca.
    this._scoreboardHeld = false
  }

  _onKeyUp(event) {
    if (typingInField()) return
    if (this._isBind('use', event)) {
      this._defuseHeld = false
      // Y la tecla del movimiento se suelta **siempre**, se hubiera escrito o
      // no: una que se queda marcada es un enganche de tirolina que no llega.
      this.movement.input.use = false
    }
    if (this._isBind('scoreboard', event)) this._scoreboardHeld = false
  }

  /**
   * Abre o cierra la armería. **Pausa como Escape**: se suelta el ratón y el
   * cambio de fase lo hace `_onPointerLockChange`, que es el único sitio del
   * motor que sabe pasar a pausa. Duplicar ahí una segunda forma de pausar es
   * como acaban dos estados que no coinciden.
   */
  _toggleArmoury() {
    if (this.isLocked) document.exitPointerLock()
    // **En red la armería no pausa** (vuelta 64). Una pausa es parar el mundo de
    // los dos y sólo la decide el servidor (vuelta 53): abrir tu panel de compra
    // no puede congelarle la partida a nadie — y durante la fase de compra el
    // mundo ya está haciendo lo suyo, con cada uno en su caja. Lo que sí se hace
    // es soltar el ratón, porque comprar con el ratón pide poder pinchar.
    if (this.enRed) {
      this.callbacks.onArmoury?.()
      return
    }
    // Y se pausa aquí mismo, sin esperar al evento de pointer lock: el cambio de
    // captura es asíncrono y hasta que llega seguiría corriendo el reloj —y con
    // él los muñecos—. Es el mismo `_suspend` que usa Escape, no una segunda
    // pausa.
    this._suspend()
    this.callbacks.onArmoury?.()
  }

  _onKeyDown(event) {
    // **Escribiendo en un campo no se juega** (vuelta 56). El juego no tiene ni
    // un campo de texto y por eso hasta aquí no hacía falta; la página del duelo
    // sí —el código de la sala—, y con el motor completo teclear ahí era jugar:
    // la `B` abría la armería y `preventDefault` se comía lo escrito.
    if (typingInField()) return
    /**
     * **La pulsación de salto viaja, y con su instante real** (vuelta 56). El
     * movimiento también la anota por su cuenta con `event.timeStamp`, pero esa
     * marca está en el reloj local y `movement.update` la va a comparar contra
     * el reloj **compartido** de los pasos; la entrada la vuelve a poner en el
     * bueno (`_aplicar` llama a `pressJump` antes de `update`, así que la pisa
     * antes de que nadie la use). Sin esto los dos extremos de la ventana de
     * encadenado vivirían en relojes distintos — ver `net/protocolo.js`.
     */
    if (this.enRed && !event.repeat && this._isBind('jump', event)) {
      const ts = Number.isFinite(event.timeStamp) && event.timeStamp > 0
        ? event.timeStamp
        : performance.now()
      this.net.pulsarSalto(ts)
    }
    // La vista del avatar es de depuración: se abre esté como esté la partida,
    // que para eso existe — inspeccionar el modelo sin montar un multijugador.
    if (this._isBind('avatarDebug', event) && !event.repeat) {
      event.preventDefault()
      this._toggleAvatarDebug()
      return
    }
    // **El marcador se abre mientras se mantenga la tecla.** Va antes del filtro
    // de `repeat` porque el navegador repite TAB mientras está pulsada y cada
    // repetición hay que cancelarla también: sin `preventDefault` en todas, el
    // foco se pasea por la página por debajo del juego.
    // **La armería se abre esté como esté la partida.** Jugando pausa —por el
    // mismo camino que Escape, soltando el ratón— y en el menú o en la pausa
    // sólo abre, que ahí no hay nada que parar. Va antes del filtro de fase por
    // eso mismo.
    if (this._isBind('armoury', event) && !event.repeat) {
      event.preventDefault()
      this._toggleArmoury()
      return
    }
    if (this._isBind('scoreboard', event)) {
      // **Fuera de la partida, TAB es del navegador.** En la pausa y en
      // opciones es como se recorre un panel con el teclado, y quedárnosla ahí
      // dejaría los ajustes sin navegación. Sólo se intercepta jugando, que es
      // donde no hay nada que enfocar y sí un marcador que enseñar.
      if (this.phase !== PHASE.RUNNING) return
      event.preventDefault()
      this._scoreboardHeld = true
      return
    }
    if (this.phase !== PHASE.RUNNING || !this.isLocked || event.repeat) return

    /**
     * **La acción contextual, y ahora reparte tres cosas** (vuelta 27; la
     * tercera, de la 83). El orden **es** la regla, y no cambia:
     *
     * 1. **Dentro del radio del explosivo, `use` desactiva y nada más.** Que
     *    ahí dentro sacara un artilugio —o te colgara de un cable— sería perder
     *    la ronda por un reflejo.
     * 2. **Fuera, manda el cable que tengas al alcance**, porque es lo que
     *    tienes delante y lo estás mirando.
     * 3. **Y si no hay cable, el artilugio**, que todavía no existe: la tecla
     *    está reservada y el hueco, hecho.
     *
     * La tirolina se resuelve **dentro del movimiento**, por el flanco de
     * `keys.use`, que es lo que hace que viaje por la red como una tecla más;
     * aquí lo único que se decide es si esa tecla llega a escribirse. Y quién
     * dice que hay cable al alcance es el propio movimiento, no una segunda
     * cuenta desde fuera.
     */
    if (this._isBind('use', event)) {
      event.preventDefault()
      this._defuseHeld = true
      if (this.objective.isPlayerInRange(this.camera)) return
      this.movement.input.use = true
      if (!this.movement.hayTirolinaAlAlcance()) this._equipUltimate()
      return
    }

    if (this._isBind('reload', event)) {
      event.preventDefault()
      this._startReload(this.gameTime)
      return
    }

    // **Las dos ranuras.** La 1 saca la principal y la 2 la pistola, siempre la
    // misma: la 2 no depende de lo que haya elegido nadie en opciones.
    if (this._isBind('primary', event)) {
      event.preventDefault()
      this._equipSlot('primary')
      return
    }

    if (this._isBind('secondary', event)) {
      event.preventDefault()
      this._equipSlot('secondary')
      return
    }

    // **Y la tercera**, que hasta la vuelta 71 era una tecla sin efecto.
    if (this._isBind('melee', event)) {
      event.preventDefault()
      this._equipSlot('melee')
      return
    }

    // **Y la cuarta** (vuelta 87), que hasta aquí era una tecla sin efecto.
    if (this._isBind('throwable', event)) {
      event.preventDefault()
      // **Y si no llevas ninguna, se dice.** Una tecla que no responde sin
      // explicar por qué es una tecla que parece rota (vuelta 86).
      this._granadaSiguiente()
      return
    }

    // **Y la quinta** (vuelta 92), que hasta aquí era una tecla sin efecto.
    if (this._isBind('special', event)) {
      event.preventDefault()
      if (this.slots.special) this._equipSlot('special')
      else this._showHelp('No llevas arma especial.')
      return
    }

    if (this._isBind('cycleWeapon', event)) {
      event.preventDefault()
      this._runPanelAction('weapon')
      return
    }

    if (this._isBind('suppressor', event)) {
      event.preventDefault()
      this._runPanelAction('suppressor')
      return
    }

    // **Aplicar una carga de escudo.** La tecla 4 deja de estar reservada: es
    // la primera de las seis de equipo que hace algo. No se puede cancelar y no
    // frena al jugador — lo que cuesta son los dos segundos de zumbido, que en
    // campo abierto se oyen desde lejos.
    if (this._isBind('shield', event)) {
      event.preventDefault()
      this._applyShield()
    }
  }

  /** Arranca una carga de escudo, si hay carga y hay hueco. */
  _applyShield() {
    if (!this.status.beginShieldApply()) return
    this._stopShieldSound()
    this._shieldSound = playShieldCharge(PLAYER.shield.applyMs / 1000)
  }

  _stopShieldSound() {
    this._shieldSound?.stop()
    this._shieldSound = null
  }

  /**
   * Equipar el lanzacohetes/ultimate. **Reservado**: la tecla existe y el hueco
   * está hecho, pero no hay artilugio que equipar todavía. Se deja como función
   * y no como comentario suelto para que el día que exista se vea de dónde
   * cuelga — y para que la acción contextual ya tenga sus dos ramas escritas.
   */
  _equipUltimate() {}

  /**
   * **Vista del avatar** (depuración). Planta el modelo delante y gira la cámara
   * a su alrededor, para poder mirarlo sin esperar a que exista el multijugador.
   *
   * Sólo fuera de una sesión en marcha: durante la partida la cámara es del
   * jugador y el cronómetro corre, y una vista de depuración no puede costar
   * segundos de ronda. Con la partida parada —inicio, pausa o resumen— no hay
   * nada que estropear.
   */
  _toggleAvatarDebug() {
    if (this._avatarDebug) {
      this._exitAvatarDebug()
      return
    }
    if (this.phase === PHASE.RUNNING) return
    this._enterAvatarDebug()
  }

  _enterAvatarDebug() {
    if (!this.avatar) {
      this.avatar = new Avatar(TARGET.radius)
      this.scene.add(this.avatar.group)
    }
    // Se planta en el punto de aparición, mirando al sitio desde el que se le va
    // a mirar: la cámara orbita, el modelo no se mueve.
    const spawn = this.scenario.spawn
    const ground = this.scenario.groundHeightAt(spawn.x, spawn.z, 0)
    this.avatar.group.position.set(spawn.x, ground, spawn.z)
    this.avatar.group.visible = true

    this._avatarDebug = true
    this._avatarAngle = 0
    // Se guarda la cámara entera para devolverla exactamente donde estaba.
    this._cameraBeforeDebug = {
      position: this.camera.position.clone(),
      rotation: this.camera.rotation.clone(),
    }
    this.controls.enabled = false
    this.movement.setEnabled(false)
    this.callbacks.onAvatarDebug?.(true)
  }

  _exitAvatarDebug() {
    this._avatarDebug = false
    if (this.avatar) this.avatar.group.visible = false
    const saved = this._cameraBeforeDebug
    if (saved) {
      this.camera.position.copy(saved.position)
      this.camera.rotation.copy(saved.rotation)
      this.camera.updateMatrixWorld()
    }
    this._cameraBeforeDebug = null
    this.controls.enabled = this.isLocked
    this.movement.setEnabled(this.phase === PHASE.RUNNING)
    this.callbacks.onAvatarDebug?.(false)
  }

  /** Órbita lenta alrededor del avatar. Sólo corre con la vista abierta. */
  _updateAvatarDebug(deltaSeconds) {
    this._avatarAngle += (AVATAR.debugRpm / 60) * Math.PI * 2 * deltaSeconds
    const target = this.avatar.group.position
    const distance = AVATAR.debugDistance
    this.camera.position.set(
      target.x + Math.sin(this._avatarAngle) * distance,
      target.y + AVATAR.debugHeight,
      target.z + Math.cos(this._avatarAngle) * distance,
    )
    this.camera.lookAt(target.x, target.y + AVATAR.debugHeight * 0.78, target.z)
    this.camera.updateMatrixWorld()
  }

  /** Suelta el gatillo y deja el patrón de retroceso listo para otra ráfaga. */
  _releaseTrigger() {
    /**
     * **Y aquí una carga se aborta, nunca se dispara** (vuelta 85). Por este
     * método pasan **todas** las formas de soltar el gatillo que no son soltar
     * el botón —perder el foco, pausar, morir, cambiar de arma— y en las cuatro
     * lo correcto es que la flecha no salga: soltar el ratón para abrir el menú
     * no puede disparar, y guardarse un arco tensado y sacarlo después sería
     * una flecha que sale sola. Disparar es cosa de `_onMouseUp`, que es el
     * único que sabe que el gesto ha terminado de verdad.
     */
    this._cargaDesde = -Infinity
    this._cargaCorta = false
    this._triggerHeld = false
    this._triggerConsumedByPanel = false
    this._sprayIndex = 0
  }

  /**
   * Raycast propio contra el panel de acciones, sin pasar por nada del arma.
   * Usa la mira limpia: la dispersión por movimiento desvía balas, no la
   * intención de pulsar un botón.
   *
   * @returns {boolean} si la pulsación se ha gastado en el panel
   */
  _tryPanelAction(now) {
    if (now - this._lastPanelActionAt < ACTION_PANEL.cooldownMs) return false
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
    const panelHit = this.actionPanel.raycast(this.raycaster)
    if (!panelHit) return false
    // El tablero no tiene prioridad por ser el tablero: sólo se acciona si no
    // hay nada por delante. Con una diana o un muro entre medias, el disparo es
    // un disparo. Antes bastaba con que el rayo tocase el tablero en algún
    // punto, así que una diana pegada a un botón era imposible de matar.
    if (this._isNearerThanPanel(panelHit.distance)) return false

    this._lastPanelActionAt = now
    playUiConfirm()
    this._runPanelAction(panelHit.buttonId)
    return true
  }

  /**
   * ¿Hay una diana o una estructura más cerca que el tablero, sobre el mismo
   * rayo? Se mide con el rayo limpio de la cámara, no con el desviado por
   * retroceso y dispersión: la decisión es "a qué está apuntando el jugador",
   * y a un botón no se le falla por ir corriendo.
   */
  _isNearerThanPanel(panelDistance) {
    if (this.targets.hasActive) {
      this.targets.updateMatrices()
      const hit = this.targets.raycast(this.raycaster)
      if (hit && hit.distance < panelDistance) return true
    }

    const occluders = this.scenario.occluders
    if (occluders.length > 0) {
      this.raycaster.near = 0
      this.raycaster.far = panelDistance
      const blockers = this.raycaster.intersectObjects(occluders, false)
      this.raycaster.far = Infinity
      if (blockers.length > 0) return true
    }

    return false
  }

  _runPanelAction(buttonId) {
    switch (buttonId) {
      case 'pause':
        // Mismo camino que Escape: soltar el ratón pausa el cronómetro.
        if (this.isLocked) document.exitPointerLock()
        break
      case 'restart':
        // Ya estamos capturados, así que la sesión arranca aquí mismo en vez
        // de esperar al evento de pointerlock.
        this._beginSession()
        break
      case 'weapon':
        // **Alterna ranura, no recorre el catálogo.** Antes esto cambiaba el
        // ajuste, así que «cambiar de arma» en mitad de una partida se guardaba
        // como preferencia; ahora es lo que hace cambiar de arma en un juego:
        // sacar la otra de las dos que llevas.
        this._equipSlot(this.slot === 'primary' ? 'secondary' : 'primary')
        break
      // **Se conmuta el del arma que llevas**, no un interruptor del jugador:
      // desde la vuelta 43 cada arma tiene el suyo y la armería enseña los tres.
      // Un arma que no lo admita no se toca.
      // **Y por el mismo camino que el clic derecho** (vuelta 72). Aquí había una
      // segunda copia que escribía el ajuste siempre, y en una partida con
      // economía el ajuste no es lo que se lleva: el supresor salía con el clic
      // derecho y **no con su tecla**, que es la diferencia entre modos que la
      // vuelta 63 llama fallo de producto.
      case 'suppressor':
        this._alternarSupresor()
        break
      case 'options':
        if (this.isLocked) document.exitPointerLock()
        this.callbacks.onOpenOptions?.()
        break
      default:
        break
    }
  }

  /**
   * Dispara si la cadencia del arma lo permite. Es el único camino hacia
   * `_shoot`: tanto el click como el fuego automático pasan por aquí, así que
   * las RPM acotan por igual a las dos.
   *
   * @returns {boolean} si el disparo llegó a salir
   */
  _tryShoot(now, instanteReal = this._simTime) {
    // Recargando o sin munición no sale nada. El aviso del cargador vacío lo
    // da la pulsación del gatillo, no este camino.
    if (this.reloading) {
      /**
       * **Salvo con una recarga por cartuchos y algo dentro** (vuelta 91). Esa
       * recarga es una sucesión de pasos cortos, así que la mitad del arma es
       * poder cortarla: obligar a terminar los ocho sería una escopeta que se
       * queda mirando mientras alguien dobla la esquina. Con el tubo vacío no
       * hay nada que interrumpir y se sigue esperando.
       */
      if (!(this.weapon.recargaPorCartucho && this.ammo > 0)) return false
      this._cancelReload()
    }
    if (this.ammo <= 0) return false
    // Abatido tampoco: el arma se calla hasta reaparecer. En red, quien dice
    // si estás vivo es el servidor.
    if (this.enRed ? this.net.vida <= 0 : !this.status.alive) return false

    /**
     * **La herramienta corta aquí, antes de que esto sea un arma** (vuelta
     * 77). Debajo hay cadencia, retroceso, patrón y munición, y una
     * herramienta no tiene ninguna de las cuatro: lo único que necesita es el
     * rayo, y eso lo da `_shoot`.
     *
     * Lo que sí lleva es un ritmo propio, y no el del arma que tengas en la
     * mano — con la Scout serían 1.25 s entre muñeco y muñeco, y con la pistola
     * ocho por segundo con el botón apoyado.
     */
    if (this.tiroDeHerramienta) {
      if (now < this._siguientePlantado) return false
      this._siguientePlantado = now + EDITOR.plantarMs
      this._shoot(instanteReal)
      return true
    }

    const weapon = this.weapon
    const intervalMs = 60000 / weapon.rpm
    if (now < this._nextShotAt) return false

    // El siguiente disparo se cuenta desde el momento en que ESTE tocaba, no
    // desde el frame en que ha salido. Sin esto, el redondeo al refresco del
    // monitor infla el intervalo y las RPM reales dependerían de los Hz de la
    // pantalla. Si vamos más de un intervalo tarde —una pausa, un cambio de
    // arma— se reancla en `now` para no soltar una ráfaga de golpe.
    const scheduled = now - this._nextShotAt > intervalMs ? now : this._nextShotAt
    this._nextShotAt = scheduled + intervalMs

    // Una pausa lo bastante larga cierra la ráfaga: la siguiente vuelve a
    // empezar por el primer disparo del patrón.
    if (now - this._lastShotAt > RECOIL_RESET_MS) this._sprayIndex = 0
    this._lastShotAt = now

    // El orden importa: primero se dispara desde donde apunta la mira ahora
    // —con el retroceso ya acumulado de los disparos anteriores— y después el
    // arma empuja. Así el primer disparo de cada ráfaga sale limpio.
    this._shoot(instanteReal)
    this._applyRecoil(weapon)
    this._sprayIndex += 1
    this._consumeAmmo(weapon, now)
    return true
  }

  /**
   * **Un golpe de cuchillo** (vuelta 71). Es `_tryShoot` sin nada de lo que un
   * cuchillo no tiene: ni munición, ni recarga, ni patrón de retroceso.
   *
   * **El ritmo lo pone el golpe, no el arma**, y se mide desde el anterior:
   * flojo cada 400 ms, fuerte cada 857. Que el reloj sea el mismo para los dos
   * es lo que impide alternarlos para pegar el doble de rápido — y es
   * exactamente lo que hace el servidor con la misma cuenta (`_cadenciaValida`),
   * así que lo que el cliente predice es lo que el otro extremo acepta.
   *
   * **No cuenta como disparo.** Ni sube `shots` ni `hits`: la precisión de la
   * sesión es la de la puntería, y meter ahí los cuchillazos la convertiría en
   * otra cosa.
   *
   * @param {'luz'|'fuerte'} tipo
   */
  _tryMelee(tipo, now, instanteReal = this._simTime) {
    const datos = this.weapon.melee
    if (!datos) return false
    // Abatido, el cuchillo se calla igual que el arma. En red manda el servidor.
    if (this.enRed ? this.net.vida <= 0 : !this.status.alive) return false

    const golpe = datos[tipo] ?? datos.luz
    const intervalMs = 60000 / golpe.rpm
    if (now < this._lastShotAt + intervalMs) return false
    this._lastShotAt = now
    // Se deja también en el reloj del arma de fuego: cambiar del cuchillo a la
    // pistola no puede regalar el disparo que el cuchillo acababa de gastar.
    this._nextShotAt = now + intervalMs

    this._golpear(tipo, instanteReal)
    // **El golpe empuja la cámara**, que es el otro sustituto de la animación
    // que no hay: es el mismo camino que el retroceso de un arma, así que se
    // siente como algo que ha salido de tus manos aunque no se vea nada.
    this.controls.applyRecoil(golpe.kick[0], golpe.kick[1])
    return true
  }

  /**
   * Resuelve el golpe y da la cara: sonido, destello y —en red— el aviso al
   * servidor. En red el veredicto bueno llega un viaje después; lo que decide
   * **qué destello y qué sonido** es el local, que es el que sabe contra qué
   * estabas pegando. Es la misma regla que la marca de bala de la vuelta 64.
   */
  _golpear(tipo, instanteReal = this._simTime) {
    if (this.enRed) {
      this.camera.updateMatrixWorld()
      this.net.disparar(instanteReal, this.camera.rotation.y, this.camera.rotation.x, tipo === 'fuerte' ? 2 : 1)
      return
    }

    this.camera.updateMatrixWorld()
    const hit = this._blancoACuchillo()
    let espalda = false
    if (hit) {
      const datos = this.weapon.melee
      const instancia = hit.instance
      /**
       * **El `facing` de un muñeco mira a +Z**, al revés que el yaw de una
       * cámara (ver `facingDesdeCamara`, en `markers.js`). La conversión va
       * aquí, donde está la convención, y no dentro de `esPorLaEspalda`, que la
       * llaman los dos.
       */
      const fx = Math.sin(instancia.facing ?? 0)
      const fz = Math.cos(instancia.facing ?? 0)
      // Un muñeco guarda su sitio en el grupo, que es lo que se mueve: no hay
      // un `position` suelto que pueda quedarse viejo.
      const p = this.camera.position
      const q = instancia.group.position
      espalda = tipo === 'fuerte' && esPorLaEspalda(p.x, p.z, q.x, q.z, fx, fz, datos.backArcDeg)
      const golpe = datos[tipo] ?? datos.luz
      const { killed } = this.targets.applyMelee(hit, this.gameTime, espalda ? Infinity : golpe.dano)
      if (killed) {
        this.kills += 1
        this.status.onKill()
      }
    }
    playMelee(tipo, Boolean(hit), espalda)
    this.slash?.show(tipo, espalda)
  }

  /**
   * **Contra qué se está pegando**, si es que hay algo. Es el mismo rayo que
   * resuelve el golpe, acotado al alcance del arma, y **corre una vez por paso
   * de mundo y sólo con el cuchillo en la mano**: ni por frame ni con un arma
   * de fuego equipada, que es lo que lo deja fuera del presupuesto caliente.
   */
  _blancoACuchillo() {
    const datos = this.weapon.melee
    if (!datos || !this.targets.hasActive) return null
    this.targets.updateMatrices()
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
    const hit = this.targets.raycast(this.raycaster)
    if (!hit || hit.distance > datos.rangeU) return null
    // A metro y medio casi nunca habrá una caja en medio, y «casi nunca» no es
    // nunca: asomando por encima de una se puede estar a distancia de cuchillo
    // de alguien que está al otro lado.
    const superficie = this._superficieBajoElRayo()
    if (superficie && superficie.distancia < hit.distance) return null
    return hit
  }

  /**
   * El aviso de «hay alguien a distancia de cuchillo». **Es una pulsación**, no
   * un valor por frame: se manda al entrar y al salir del alcance, así que la
   * página puede pintarlo con una clase sin repintar nada sesenta veces por
   * segundo.
   */
  _updateMeleeRange() {
    let dentro = false
    let espalda = false
    if (this.weapon.melee && this.phase === PHASE.RUNNING) {
      /**
       * **Y si además le ves la espalda** (vuelta 73). Un golpe fuerte por
       * detrás mata lleve lo que lleve el otro (vuelta 71), así que es la
       * diferencia más grande que hay entre dos golpes — y hasta aquí la
       * pantalla no la decía **antes**, sólo después, con el doble arco.
       *
       * Sale del **mismo rayo** que ya decide si llegas y del mismo
       * `esPorLaEspalda` que decide el instakill: no hay una segunda cuenta que
       * pueda decir que sí mientras el servidor dice que no. Es la regla de la
       * vuelta 71 —«lo publica quien lo tiene»— llevada un paso antes en el
       * tiempo, que es donde sirve.
       */
      if (this.enRed) {
        const pose = this._rivalACuchillo() ? this.net?.poseDelRival?.() : null
        dentro = Boolean(pose)
        if (pose) {
          const p = this.camera.position
          // **El rival es una cámara y una cámara mira a −Z**, al revés que el
          // `facing` de un muñeco. La conversión va aquí y es la misma que hace
          // `resolverCuchillada` con el mismo rumbo: si se escribiera distinta,
          // la mira diría espalda y el veredicto diría frente.
          espalda = esPorLaEspalda(
            p.x, p.z, pose.x, pose.z,
            -Math.sin(pose.yaw ?? 0), -Math.cos(pose.yaw ?? 0),
            this.weapon.melee.backArcDeg,
          )
        }
      } else {
        const hit = this._blancoACuchillo()
        dentro = hit !== null
        if (hit) {
          const q = hit.instance.group.position
          const p = this.camera.position
          espalda = esPorLaEspalda(
            p.x, p.z, q.x, q.z,
            Math.sin(hit.instance.facing ?? 0), Math.cos(hit.instance.facing ?? 0),
            this.weapon.melee.backArcDeg,
          )
        }
      }
    }
    if (dentro === this._meleeRange && espalda === this._meleeBack) return
    this._meleeRange = dentro
    this._meleeBack = espalda
    this.callbacks.onMeleeRange?.(dentro, espalda)
  }

  /**
   * Lo mismo contra el rival del duelo, con el cuerpo **tal como se dibuja** —el
   * mismo que resolvería el golpe— y con la dirección que ya tiene el
   * `raycaster`, que lleva el cabeceo dentro. El cuerpo sale de `playerBody`,
   * que es la única fórmula: montar aquí una segunda serían dos siluetas.
   */
  _rivalACuchillo() {
    const pose = this.net?.poseDelRival?.()
    if (!pose || pose.vivo === false) return false
    const datos = this.weapon.melee
    _cuerpoDelRival.position.x = pose.x
    _cuerpoDelRival.position.z = pose.z
    const cuerpo = playerBody(_cuerpoDelRival, pose.eyeHeight, pose.feetY)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
    return Boolean(hitPlayer(this.camera.position, this.raycaster.ray.direction, cuerpo, datos.rangeU))
  }

  /**
   * Descuenta la bala y avisa cuando el cargador se queda corto. El aviso sale
   * una sola vez por cargador: al bajar del umbral, o al vaciarse si se pasó
   * de largo entre disparos.
   */
  _consumeAmmo(weapon, now) {
    this.ammo -= 1
    // Al vaciarse, la recarga arranca sola: quedarse mirando un gatillo muerto
    // no aporta nada. R sigue sirviendo para recargar antes de tiempo.
    if (this.ammo <= 0) {
      this._startReload(now)
      return
    }
    if (this._lowAmmoWarned) return
    const lowThreshold = Math.max(1, Math.floor(weapon.magazine * HELP.lowAmmoRatio))
    if (this.ammo > lowThreshold) return
    this._lowAmmoWarned = true
    this._showHelp('Pulsa R para recargar')
  }

  /**
   * Empuja la cámara según el disparo que toque del patrón.
   *
   * **El retroceso es una fuerza continua, no una animación con final** (vuelta
   * 61). Hasta la 60, agotado el patrón dejaba de empujar, y eso no se leía como
   * «ha llegado a su techo»: se leía como que **el arma se controla sola**. Con
   * la Rift —15 pasos de patrón y cargador de 30— eran **quince disparos
   * seguidos sin retroceso ninguno**, clavados en el mismo punto, o sea media
   * ráfaga convertida en un láser.
   *
   * Lo que no había, y el síntoma hacía sospechar, es una recuperación: la mira
   * **nunca vuelve sola** (ver `applyRecoil` en `lookControls.js`). Lo que había
   * era un array que se acababa.
   */
  _applyRecoil(weapon) {
    const pattern = weapon.recoil
    if (!pattern.length) return
    const step = pattern[this._pasoDelPatron(weapon)]
    this.controls.applyRecoil(step[0], step[1])
  }

  /**
   * Qué paso del patrón toca. Dentro del patrón, el que dice el índice; pasado
   * el final, **la cola en bucle** (`recoilLoopFrom`): la subida es de una vez y
   * el vaivén no se acaba mientras se mantenga el gatillo.
   *
   * Sin `recoilLoopFrom` la cola es el último paso, así que un arma a la que se
   * le olvide el número sigue empujando en vez de quedarse quieta. Que el
   * retroceso no pare es la regla; dónde repite es tuning.
   */
  _pasoDelPatron(weapon) {
    const pattern = weapon.recoil
    if (this._sprayIndex < pattern.length) return this._sprayIndex
    const desde = Math.min(
      Math.max(0, weapon.recoilLoopFrom ?? pattern.length - 1),
      pattern.length - 1,
    )
    const largo = pattern.length - desde
    return desde + ((this._sprayIndex - pattern.length) % largo)
  }

  _shoot(instanteReal = this._simTime) {
    /**
     * **El tiro de herramienta no es un disparo: es una pregunta** (vuelta 77).
     *
     * El editor lo usa para plantar un muñeco donde apuntas, y para eso hace
     * falta una sola cosa que el motor ya calcula y nadie más puede calcular
     * sin repetirse: **dónde acaba el rayo**. Lanzar un segundo rayo desde
     * fuera es justo lo que la vuelta 64 prohibió —«dos rayos para dos
     * preguntas sobre la misma recta es cómo se acaban contestando
     * distinto»— y encima la sala no se raycastea, se resuelve en aritmética.
     *
     * Así que se sale **antes de que esto sea un disparo**: sin munición, sin
     * sonido, sin retroceso, sin marca de bala y sin contar en la precisión.
     * Lo único que hace es publicar la superficie. No lleva `enRed` porque una
     * herramienta no existe en una partida: es del editor y de nadie más.
     */
    if (this.tiroDeHerramienta) {
      this.camera.updateMatrixWorld()
      this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
      const superficie = this._superficieBajoElRayo()
      if (superficie) this.callbacks.onSuperficie?.(superficie.punto, superficie.normal)
      return
    }

    /**
     * **Un arma de proyectil lanza en vez de resolver un rayo** (vuelta 86), y
     * el desvío va aquí arriba para que lo compartan los dos modos que pueden
     * tenerla: `carga` —el arco, que llega por `_soltarCarga`— y `semi` —el U2,
     * que llega por `_tryShoot` como cualquier otra arma—. Lo que decide no es
     * el modo: es tener bloque `tiro`, igual que `melee` decide que un arma es
     * un cuchillo (vuelta 71).
     *
     * `_lanzarProyectil` cuenta el disparo, así que aquí se sale antes de
     * `shots += 1`: contarlo dos veces sería una precisión que no cuadra.
     */
    const tiro = this.armaDeTiro
    if (tiro) {
      this._lanzarProyectil(tiro, 0, instanteReal)
      return
    }

    this.shots += 1

    /**
     * **En red el disparo no se resuelve aquí: se manda** (vuelta 56). Quién
     * ha recibido el tiro lo decide el servidor rebobinando, y el veredicto
     * vuelve por `onVeredicto`; lo que se resuelve en local —contra el rival
     * tal como está dibujado ahora mismo— ya lo hace `net/cliente.js`, que es
     * el mismo código que corre el servidor (`net/disparo.js`). Duplicarlo aquí
     * serían dos fórmulas y una discrepancia que no diría nada de la red.
     *
     * El instante es **real**, no de juego: de él sale la fracción de paso con
     * la que viaja el disparo, y ésa es la mitad de la compensación de retraso.
     * Un clic trae el suyo del evento; el fuego automático, el del paso.
     */
    if (this.enRed) {
      this.camera.updateMatrixWorld()
      // **Con el desvío puesto** (vuelta 88): hasta aquí el duelo mandaba los
      // ángulos crudos y era el único modo del juego sin dispersión ninguna.
      const mira = this._miraConDesvio(_mira)
      // **Y con escopeta viaja además la semilla del patrón** (vuelta 91): los
      // ocho perdigones los derivan los dos extremos de ese número.
      this.net.disparar(instanteReal, mira.yaw, mira.pitch, 0, 0, null, this._semillaDePerdigones())
      playWeaponShot(this.weaponKey, this.suppressorEnabled)
      this.callbacks.onShot?.(false)
      // La marca en la pared no se pone aquí: se pone cuando el cliente resuelve
      // este disparo contra el rival que estabas viendo (`onTiroLocal`, un paso
      // después). Si le diste, no hay marca — y quién recibió el tiro no lo
      // decide el motor, que es la regla de la vuelta 56.
      return
    }

    // **Una escopeta resuelve ocho rayos, no uno** (vuelta 91). Va aquí, tras
    // el camino de red y tras `shots += 1`, porque un perdigonazo **es un
    // disparo**: lo que cambia es contra qué se resuelve, no cuántos cuenta.
    if (this.weapon.perdigones) {
      this._perdigonazoLocal(this.weapon.perdigones)
      return
    }

    let hit = null
    if (this.targets.hasActive) {
      // Las matrices se actualizan a mano: el disparo ocurre entre frames y la
      // cámara puede haber rotado con el último mousemove.
      this.camera.updateMatrixWorld()
      this.targets.updateMatrices()
      this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
      // La cámara ya lleva el retroceso acumulado; encima se le suma el
      // desvío por movimiento, que es distinto en cada disparo.
      applySpread(this.raycaster.ray.direction, this.currentSpreadDeg)
      hit = this.targets.raycast(this.raycaster)
    } else {
      this.camera.updateMatrixWorld()
      this.raycaster.setFromCamera(SCREEN_CENTER, this.camera)
      applySpread(this.raycaster.ray.direction, this.currentSpreadDeg)
    }

    // **Dónde acaba la bala si no da en un muñeco**, con el rayo ya desviado
    // por retroceso y dispersión. De aquí salen las dos cosas que antes se
    // preguntaban por separado: si la cobertura tapa el tiro —sin esto se
    // mataría a través de la Espina y el escenario dejaría de significar algo—
    // y dónde poner la marca. Es **un** rayo por disparo, no dos, y nunca por
    // frame.
    const superficie = this._superficieBajoElRayo()
    if (hit && superficie && superficie.distancia < hit.distance) hit = null
    if (!hit && superficie) this.impacts.spawn(superficie.punto, superficie.normal, this.gameTime)

    // El sonido de disparo suena siempre; el de acierto se superpone.
    // Con muestra grabada suena la muestra; sin ella, la síntesis de siempre.
    // Quien dispara no elige: eso lo decide `samples.js`.
    playWeaponShot(this.weaponKey, this.suppressorEnabled)
    if (hit) {
      this.hits += 1
      const { killed } = this.targets.applyHit(hit, this.gameTime, this.weaponKey)
      if (killed) {
        this.kills += 1
        // Una baja perdona parte de la espera, si es que hay algo que perdonar.
        this.status.onKill()
      }
      playHit()
    }

    this.callbacks.onShot?.(hit !== null)
  }


  /**
   * **La semilla del patrón de perdigones**, o 0 si el arma no es una escopeta.
   *
   * Se sortea **aquí y una vez por disparo**, que es el mismo sitio donde ya
   * se sortea el desvío por movimiento (vuelta 88): lo que el cliente decide
   * de una bala lo sigue decidiendo el cliente. Lo que viaja es este número, y
   * de él salen los ocho rayos a los dos lados.
   *
   * Nunca vale 0 a propósito: ése es el valor que significa «este disparo no
   * es de escopeta», y lo que vale su valor de fábrica no viaja (vuelta 83).
   */
  _semillaDePerdigones() {
    if (!this.weapon.perdigones) return 0
    return (1 + Math.floor(Math.random() * 0xfffffffe)) >>> 0
  }

  /**
   * **El perdigonazo del entrenamiento**, contra muñecos y contra el mapa.
   *
   * Es el disparo de siempre repetido `n` veces con el mismo rumbo central y
   * el cono derivado de una semilla, y de ahí salen las tres cosas que hacen
   * falta: cada perdigón pregunta a los muñecos **y** a la geometría, gana lo
   * más cercano —que es la regla de la vuelta 64, «un rayo, dos respuestas»— y
   * el que no da en nadie deja su marca en la pared. Ocho marcas de un golpe
   * es exactamente lo que se quiere ver: **el patrón**.
   *
   * Y lo que se cuenta es **el disparo**: uno en `shots` (ya sumado por
   * `_shoot`) y uno en `hits` si entró alguno. La precisión de la sesión mide
   * puntería, y un arma que reparte ocho rayos la inflaría hasta dejar de
   * decir nada — es la misma razón por la que un cuchillazo no cuenta como
   * disparo (vuelta 71).
   */
  _perdigonazoLocal(perd) {
    this.camera.updateMatrixWorld()
    if (this.targets.hasActive) this.targets.updateMatrices()
    // El rumbo central lleva ya el retroceso (está en la cámara) y el desvío
    // por movimiento: el cono de los perdigones se abre **encima** de él.
    const centro = this._miraConDesvio(_mira)
    const semilla = this._semillaDePerdigones()
    let tocado = false
    for (let i = 0; i < perd.n; i++) {
      const dir = perdigonDeSemilla(semilla, i, perd.conoGrados, centro.yaw, centro.pitch)
      this.camera.getWorldPosition(this.raycaster.ray.origin)
      this.raycaster.ray.direction.set(dir.x, dir.y, dir.z)
      let hit = this.targets.hasActive ? this.targets.raycast(this.raycaster) : null
      const superficie = this._superficieBajoElRayo()
      if (hit && superficie && superficie.distancia < hit.distance) hit = null
      if (!hit) {
        if (superficie) this.impacts.spawn(superficie.punto, superficie.normal, this.gameTime)
        continue
      }
      tocado = true
      const { killed } = this.targets.applyHit(hit, this.gameTime, this.weaponKey)
      if (killed) {
        this.kills += 1
        this.status.onKill()
      }
    }
    playWeaponShot(this.weaponKey, this.suppressorEnabled)
    if (tocado) {
      this.hits += 1
      playHit()
    }
    this.callbacks.onShot?.(tocado)
  }

  /**
   * **El arma que llevas, ¿lanza algo?** (vuelta 85). Lo dice el dato y no el
   * nombre ni la ranura, igual que `melee` decide que un arma es un cuchillo.
   */
  get armaDeTiro() {
    return this.weapon?.tiro ?? null
  }

  /** ¿Se está tensando ahora mismo? */
  get cargando() {
    return Number.isFinite(this._cargaDesde)
  }

  /**
   * **Cuánto lleva cargado, de 0 a 1.** Va con el **reloj del mundo**
   * (`gameTime`), como todo lo temporizado del motor desde la vuelta 42: en
   * pausa no sube, que es lo que impide cargar un arco desde el menú.
   */
  get cargaActual() {
    const tiro = this.armaDeTiro
    if (!tiro || !this.cargando) return 0
    const k = (this.gameTime - this._cargaDesde) / tiro.cargaMs
    return k < 0 ? 0 : k > 1 ? 1 : k
  }

  /** Empieza a tensar. Una sola vez por pulsación: es un flanco. */
  _empezarCarga(now, corta = false) {
    if (this.cargando || this.weapon.mode !== 'carga' || !this.armaDeTiro?.cargaMs) return
    // El tiro corto es de las granadas y de nadie más: con cualquier otra arma
    // de carga el clic derecho sigue haciendo lo que hacía.
    if (corta && !this.armaDeTiro.granada) return
    if (!this.isLocked || this.phase !== PHASE.RUNNING) return
    /**
     * **No se tensa antes de que el arma esté lista**, y eso es lo que hace que
     * soltar dispare **siempre**. La alternativa —dejar tensar durante el
     * enfriamiento y comerse la flecha al soltar— es un arma que a veces no
     * hace nada sin decir por qué. Encajar otra flecha cuesta lo que dice la
     * cadencia, y tensar viene después: es el orden de los dos gestos.
     */
    if (now < this._nextShotAt || this.reloading || this.ammo <= 0) return
    this._cargaDesde = now
    this._cargaCorta = corta
    /**
     * **El Fang no suena, ni al armar el brazo ni al clavarse** (vuelta 90), y
     * eso no es un detalle de mezcla: es la mitad del arma. Lo que compra un
     * cuchillo arrojadizo es matar a alguien que no sabía que estabas ahí, y el
     * oído es el único canal que no hay que apuntar a ninguna parte (vuelta
     * 73) — un chasquido al tensar sería exactamente el aviso que el arma
     * promete no dar.
     */
    if (!this.armaDeTiro?.clavable) playBow('tensar')
  }

  /**
   * **Suelta lo que hubiera cargado.** Devuelve si ha salido algo.
   *
   * Lo que sale **no depende de cuánto se haya tardado en apretar el botón**
   * sino de `cargaActual`, que está acotada a 1: pasado el techo, seguir
   * aguantando no aporta nada y eso es deliberado (ver `WEAPONS.bow`).
   */
  _soltarCarga(now, instanteReal = this._simTime) {
    if (!this.cargando) return false
    const carga = this.cargaActual
    /**
     * **Cuánto la has tenido en la mano, sin techo** (vuelta 87), que es otra
     * cosa que la carga: la carga se llena en `cargaMs` y **la mecha sigue
     * corriendo**. De ahí sale la decisión entera del cocinado — pasado el
     * medio segundo, aguantar ya no da alcance, sólo quita aviso.
     */
    const sostenidoS = Math.max(0, (now - this._cargaDesde) / 1000)
    const corto = this._cargaCorta
    this._cargaDesde = -Infinity
    this._cargaCorta = false
    const tiro = this.armaDeTiro
    if (!tiro) return false
    // La cadencia se comprueba **al soltar**, que es cuando sale la flecha.
    if (now < this._nextShotAt) return false
    if (this.reloading || this.ammo <= 0) return false
    if (this.enRed ? this.net.vida <= 0 : !this.status.alive) return false
    this._nextShotAt = now + 60000 / this.weapon.rpm
    this._lanzarProyectil(tiro, carga, instanteReal, { corto, sostenidoS })
    this._applyRecoil(this.weapon)
    this._sprayIndex += 1
    this._consumeAmmo(this.weapon, now)
    return true
  }

  /**
   * **Lanza el proyectil del arma que llevas.**
   *
   * Sale de los ojos y hacia donde mira la cámara **con el retroceso ya
   * aplicado**, que es de donde sale el rayo de cualquier disparo. Lo que no
   * lleva es dispersión: una flecha no se desvía por correr, y eso no es un
   * olvido — `ACCURACY` describe lo que le pasa a una bala en el cañón de un
   * arma que sacude, y tensar un arco corriendo lo que hace es que el láser se
   * mueva, que ya es el castigo.
   */
  _lanzarProyectil(tiro, carga, instanteReal = this._simTime, opciones = null) {
    this.camera.updateMatrixWorld()
    const yaw = this.camera.rotation.y
    const pitch = this.camera.rotation.x
    /**
     * **De dónde sale y con qué velocidad lo dice `lanzamientoDeArma`**, que es
     * la misma función que llama el servidor (vuelta 85). Es lo que permite que
     * en red no viaje la trayectoria: los dos extremos la derivan de los mismos
     * cinco números. Escrita dos veces sería una flecha que el tirador ve dar y
     * el servidor ve fallar.
     */
    const l = lanzamientoDeArma(this.weapon, carga, this.camera.position, yaw, pitch, _lanzamiento, opciones)
    if (!l) return
    /**
     * **En red el lanzamiento se manda; el vuelo lo derivan los dos.** Es el
     * patrón de la vuelta 72 con una pieza más: lo único que viaja es de dónde,
     * hacia dónde y con cuánta carga, y de ahí los dos extremos dan los mismos
     * pasos de 60 Hz contra el mismo mapa y sacan la misma parábola. Un campo
     * con la posición del proyectil en la foto sería sesenta correcciones por
     * segundo de algo que no necesita ninguna.
     */
    /**
     * **Y con una granada viajan dos cosas más**: cuánto se ha sostenido y si
     * fue el tiro corto. No viaja la mecha ya calculada, que es lo que un
     * cliente podría mentir: los dos extremos la **derivan** con
     * `mechaDeGranada`, que tiene el suelo de un segundo dentro.
     */
    if (this.enRed) {
      this.net.disparar(instanteReal, yaw, pitch, 0, carga, opciones ?? null)
    }
    const serie = this.proyectiles.lanzar({
      tipo: l.tipo,
      dueno: this.enRed ? this.net.id : 'yo',
      x: l.x, y: l.y, z: l.z,
      vx: l.vx, vy: l.vy, vz: l.vz,
      g: l.g,
      fuerza: l.fuerza,
      intensidad: l.intensidad,
      rebote: l.rebote,
      roce: l.roce,
      reposoU: l.reposoU,
      mechaS: l.mechaS,
    })
    /**
     * **Y un lanzamiento no cuenta como disparo** (vuelta 87). Es la regla del
     * cuchillazo de la vuelta 71: la precisión de la sesión es la de la
     * puntería, y meter ahí las granadas —que ni siquiera preguntan a los
     * cuerpos por el camino— la convertiría en otra cosa.
     */
    if (!tiro.granada) this.shots += 1
    /**
     * **Cada proyectil suena como lo que es**, y lo decide su clase y no el
     * arma: un cohete no es un arco con otro volumen (la regla de la vuelta 40).
     * Y el cohete estrena lo que no había: **un sonido que dura mientras
     * vuela**, con su asa para pararlo al estallar.
     */
    if (l.tipo === 'cohete') {
      this._emisorDispositivo.setPosition(l.x, l.y, l.z)
      playRocket('salida', this._emisorDispositivo)
      this._encenderSilbido(serie)
    } else if (tiro.granada) {
      playGrenade('lanzar')
    } else if (tiro.clavable) {
      /**
       * **Y el cuchillo sí suena al salir** (vuelta 91), que enmienda a media
       * la 90. Allí quedó mudo entero con el argumento de que lo que compra un
       * arrojadizo es que no te oigan — y eso sigue siendo cierto **para el
       * rival**, que no oye ni el brazo ni el clavado porque las voces de un
       * proyectil no viajan. Lo que la 90 no vio es que el silencio también se
       * lo aplicaba **al que lanza**, y ahí no compra nada: lanzar sin oír nada
       * se juega como un arma que no ha respondido.
       */
      playThrow(carga)
    } else {
      playBow('soltar', carga)
    }
    /**
     * **Y a carga llena, un destello sutil** (lo pidió quien lo juega). Es el
     * anillo de `dispositivos.js`, que ya es un pool aditivo del motor: un
     * efecto nuevo para esto habría sido un segundo sistema de anillos. Sale
     * **sólo a tope**, que es lo que lo convierte en información —«ha salido
     * cargada del todo»— en vez de en adorno, y **no pegado a la cara**: medio
     * metro de radio a treinta centímetros del ojo tapa la pantalla entera.
     */
    if (carga >= 1 && !opciones?.corto) {
      const d = SURFACES.destello.arcoLleno.adelanteU
      const n = Math.hypot(l.vx, l.vy, l.vz) || 1
      this.dispositivos.emitir(
        'arcoLleno',
        l.x + (l.vx / n) * d, l.y + (l.vy / n) * d, l.z + (l.vz / n) * d,
        yaw, this.gameTime,
      )
    }
    this.callbacks.onShot?.(false)
  }

/**
   * **El silbido de un cohete, que es el único sonido del juego que dura**
   * (vuelta 86).
   *
   * Cada vuelo tiene el suyo, con su emisor propio: se enciende al salir, su
   * emisor se mueve con él en cada frame y se apaga al estallar. La clave del
   * mapa es **el número de serie** y no la ranura del pool, porque una ranura se
   * reutiliza en cuanto queda libre: con la ranura, un cohete nuevo heredaría el
   * silbido del anterior y apagar uno callaría al otro.
   */
  _encenderSilbido(serie) {
    if (!serie) return
    const emisor = createEmitter(this.scene, SURFACES.audio)
    const voz = playRocket('silbido', emisor)
    if (!voz) { emisor.dispose(); return }
    this._silbidos.set(serie, { voz, emisor })
  }

  /** Lo apaga y suelta su emisor. Llamarlo dos veces no hace nada. */
  _apagarSilbido(serie) {
    const s = this._silbidos.get(serie)
    if (!s) return
    s.voz.parar()
    s.emisor.dispose()
    this._silbidos.delete(serie)
  }

  /**
   * **Y sigue al cohete**, que es la mitad de que sirva de algo: lo que dice de
   * dónde viene es el panner, y un panner clavado en el punto de salida dice
   * que el cohete sigue en el tubo. Va por frame y no por paso, como el dibujo,
   * porque es lo que el oído compara con lo que ve.
   */
  _moverSilbidos() {
    if (this._silbidos.size === 0) return
    const pr = this.proyectiles
    for (let i = 0; i < pr.pool; i++) {
      if (pr.estado[i] === 0) continue
      const s = this._silbidos.get(pr.serie[i])
      if (s) s.emisor.setPosition(pr.x[i], pr.y[i], pr.z[i])
    }
  }

  /**
   * **Lo que revienta alrededor de un impacto** (vuelta 86).
   *
   * Es lo mismo para el cohete y para las tres granadas que vienen, y por eso
   * la caída sale de `caidaDeArea` —una sola fórmula (vuelta 85)— y lo que
   * cambia es quién la recibe. Aquí, en el entrenamiento, los muñecos; en red
   * lo hace el servidor, que es quien decide el daño (vuelta 56).
   *
   * **El dueño no está exento**, y ésa es la mitad del nombre en clave del U2:
   * lanzarlo a tus pies te lleva por delante. Lo que se le rebaja
   * (`explosion.propio`) no es piedad, es que un arma que se suicida al primer
   * despiste es un arma que nadie saca.
   */
  _explotar(im, explosion, conVozPropia = true) {
    const ahora = this.gameTime
    // Lo que se ve y lo que se oye, en el sitio y con su distancia: una
    // explosión lejana no suena más floja, suena **más sorda** (vuelta 86).
    const d = Math.hypot(
      this.camera.position.x - im.x, this.camera.position.y - im.y, this.camera.position.z - im.z,
    )
    // Una granada llega aquí con su destello ya puesto y su voz ya sonada: el
    // Core suena a granada y no a cohete, que es la regla de la vuelta 40.
    if (conVozPropia) {
      this.dispositivos.emitir('explosion', im.x, im.y, im.z, 0, ahora)
      this._emisorDispositivo.setPosition(im.x, im.y, im.z)
      playRocket('explosion', this._emisorDispositivo, Math.min(1, d / SURFACES.audio.maxDistanceU))
    }

    if (this.enRed) return

    // **Al jugador**, si le pilla dentro. Es el mismo `encajarImpacto` que usan
    // el fuego enemigo y el duelo: dos escaleras de daño serían dos juegos.
    const alJugador = caidaDeArea(d, explosion.radioU, explosion.nucleoU)
    if (alJugador > 0 && this.status.alive) {
      const suyo = im.dueno === 'yo' ? explosion.propio : 1
      /**
       * **Y la onda entra por el torso**, que es el único camino que el motor
       * tiene para hacerle daño al jugador (`_onPlayerHit`). No es una zona
       * elegida: es que una esfera no elige, y `torso` es la que no lleva ni la
       * regla del casco ni la del blanco entero. El número ya viene resuelto.
       */
      this._onPlayerHit({
        zone: 'torso',
        damage: explosion.dano * alJugador * suyo,
        weaponKey: null,
        fromX: im.x,
        fromZ: im.z,
      })
    }

    // Y a los muñecos. Se cuenta si alguno cae, que es lo que repone un cohete.
    let mato = false
    for (const instancia of this.targets.instances) {
      if (instancia.state !== 'alive') continue
      const p = instancia.group.position
      const cerca = Math.hypot(p.x - im.x, p.y + 0.9 - im.y, p.z - im.z)
      const k = caidaDeArea(cerca, explosion.radioU, explosion.nucleoU)
      if (k <= 0) continue
      /**
       * **La onda no tiene zonas.** Un disparo elige dónde entra y una
       * explosión no: pasarla por `zoneDamage` sería decidir a qué altura te
       * pilla una onda esférica, que es una precisión que el modelo no tiene.
       * Se resta de la vida directamente, que es lo que hace `applyMelee`.
       */
      const parte = instancia.parts[0]
      if (!parte) continue
      const { killed } = this.targets.applyMelee({ instance: instancia, part: parte }, ahora, explosion.dano * k)
      if (killed) { this.kills += 1; this.status.onKill(); mato = true }
    }
    if (mato && im.dueno === 'yo') this.premiarBajaDeProyectil(this.weaponKey)
  }

  /**
   * **Lo que hace una granada al estallar** (vuelta 87), y son tres cosas
   * distintas con el mismo reparto: la caída de área de siempre
   * (`caidaDeArea`, vuelta 85) decide **cuánto**, y lo que cambia es **qué**.
   *
   * Lo que no cambia es quién manda: el daño del Core, como el del cohete, lo
   * decide el servidor en red (vuelta 56). Lo que sí sale en los dos modos es
   * lo que le pasa a **tu** pantalla —una ceguera y un aturdimiento son cosas
   * que ves tú— y por eso esa parte no pregunta por `enRed`: la calcula cada
   * cliente contra su propio pool, que los dos extremos montan igual.
   */
  _estallarGranada(im, tiro) {
    const ahora = this.gameTime
    const clase = im.tipo
    this.dispositivos.emitir('explosion', im.x, im.y, im.z, 0, ahora)
    const ojos = this.camera.position
    const d = Math.hypot(ojos.x - im.x, ojos.y - im.y, ojos.z - im.z)
    this._emisorDispositivo.setPosition(im.x, im.y, im.z)
    playGrenade(clase, this._emisorDispositivo, Math.min(1, d / SURFACES.audio.maxDistanceU))

    const suyo = im.dueno === (this.enRed ? this.net.id : 'yo')

    if (tiro.ceguera) {
      const e = tiro.ceguera
      let k = caidaDeArea(d, e.radioU, e.nucleoU) * (suyo ? e.propio : 1)
      /**
       * **Y apartar la vista sirve**, que es la mecánica entera de la Blind y
       * lo que se pidió con esas palabras. Lo que llega se multiplica por
       * cuánto la estabas mirando, con suelo en `mirandoMinimo`: de frente,
       * entera; de espaldas, un parpadeo.
       *
       * **Y pide línea de visión**, con el mismo `hasLineOfSight` que decide
       * dónde puede nacer un muñeco (vuelta 42): un destello detrás de una caja
       * no ciega a nadie, y eso es justo lo que la separa de un daño de área.
       */
      if (k > 0) k *= this._mirandoHacia(im.x, im.y, im.z)
      if (k > 0 && this.scenario && !this._veElPunto(im.x, im.y, im.z)) k = 0
      this.granadas?.cegar(ahora, e.duracionMs, k)
    }

    if (tiro.aturdimiento) {
      const e = tiro.aturdimiento
      const k = caidaDeArea(d, e.radioU, e.nucleoU) * (suyo ? e.propio : 1)
      if (k > 0) {
        this.granadas?.aturdir(ahora, e.duracionMs, k)
        /**
         * **Y el freno de la marcha sólo fuera de la red.** En el duelo el
         * movimiento lo decide el servidor (vuelta 56) y el aturdimiento viaja
         * en `movement.snapshot()`: predecirlo aquí sería una segunda idea de
         * cuándo empieza, y la diferencia entre las dos serían correcciones. Lo
         * que se pierde es el viaje de una foto sobre dos segundos y medio.
         */
        if (!this.enRed) {
          this.movement.aturdir(this._simTime + e.duracionMs, e.duracionMs, e.frenoMax * k)
        }
      }
    }

    if (tiro.explosion) this._explotar(im, tiro.explosion, false)
  }

  /**
   * **Cuánto estás mirando a un punto**, entre `mirandoMinimo` y 1. Sale del
   * ángulo entre hacia dónde miras y hacia dónde está, no de un cono con
   * borde: una cegadora que pasara de cegar del todo a no cegar nada por medio
   * grado sería una lotería, no una decisión.
   */
  _mirandoHacia(x, y, z) {
    const ojos = this.camera.position
    _dir.set(x - ojos.x, y - ojos.y, z - ojos.z)
    if (_dir.lengthSq() < 1e-9) return 1
    _dir.normalize()
    this.camera.getWorldDirection(_mirada)
    const cos = _dir.dot(_mirada)
    // De frente (cos 1) llega entero y de lado o de espaldas (cos ≤ 0) el
    // suelo. En medio, en recta.
    const suelo = GRENADES.pantalla.ceguera.mirandoMinimo
    const k = cos <= 0 ? 0 : cos
    return suelo + (1 - suelo) * k
  }

  /** ¿Se ve ese punto desde los ojos? El mismo test que la aparición. */
  _veElPunto(x, y, z) {
    _punto.set(x, y, z)
    return hasLineOfSight(this.camera.position, _punto, this.scenario.occluders)
  }

  /**
   * **Un paso de los proyectiles que hay volando.**
   *
   * Contra qué chocan lo decide el mapa; a quién hieren, quien esté jugando —el
   * entrenamiento pregunta a los muñecos y en red el veredicto lo da el
   * servidor, que es la regla de la vuelta 56—. Por eso el modelo recibe las
   * dos cosas como funciones y no se guarda ni el escenario ni las dianas.
   */
  _pasoDeProyectiles(dt) {
    if (this.proyectiles.vivos === 0) return
    const escenario = this.scenario
    if (!escenario) return
    const cuantos = this.proyectiles.paso(dt, this._cortarSegmento, this._proyectilContraCuerpos)
    /**
     * **Y una granada que bota se oye** (vuelta 87). Es el único aviso que da
     * entre que sale y estalla, y lo da por el canal que no hay que apuntar a
     * ninguna parte (vuelta 73): una que cae detrás de ti no se ve de ninguna
     * manera. El volumen sale de **lo fuerte que pegó**, así que un botazo
     * contra el suelo y un roce contra una pared no suenan igual.
     */
    const botes = this.proyectiles.cuantosBotes
    for (let i = 0; i < botes; i++) {
      const b = this.proyectiles.botes[i]
      this._emisorDispositivo.setPosition(b.x, b.y, b.z)
      playGrenade('bote', this._emisorDispositivo, 0, Math.min(1, b.fuerza / 12))
    }
    for (let i = 0; i < cuantos; i++) {
      const im = this.proyectiles.impactos[i]
      this._impactoDeProyectil(im)
    }
  }

  /**
   * **La ficha de tiro de una clase de proyectil**, o `null`. Sale del
   * catálogo de armas y no de una segunda tabla: el día que dos armas lancen
   * la misma clase, las dos revientan igual.
   *
   * Se pregunta por la **clase** y no por el arma que tengas en la mano porque
   * entre que sale y llega puedes haber cambiado — y eso con una granada de
   * cuatro segundos pasa a menudo.
   */
  _tiroDe(tipo) {
    for (const arma of Object.values(WEAPONS)) {
      if (arma.tiro?.proyectil === tipo) return arma.tiro
    }
    return null
  }

  /** Lo que le pasa a un proyectil que ha chocado. */
  _impactoDeProyectil(im) {
    // El silbido se apaga **donde revienta**, no donde salió: es lo que
    // convierte un sonido que dura en un sonido que termina.
    this._apagarSilbido(im.serie)
    /**
     * **Lo que explota, explota** (vuelta 86), y lo dice el proyectil y no el
     * arma que tengas ahora en la mano: entre que sale y llega puedes haber
     * cambiado. `_tiroDe` lo saca de su clase, que es lo único que viaja
     * con él.
     */
    const tiro = this._tiroDe(im.tipo)
    const clavable = Boolean(tiro?.clavable)
    // La marca: la misma de una bala, que es lo correcto — lo que dice es
    // «aquí acabó un tiro», y de qué arma venía no lo cambia.
    /**
     * **Y un cuchillo no deja marca de bala: se deja a sí mismo** (vuelta 90).
     * La estrella dice «aquí acabó un tiro» y dura 420 ms; aquí lo que queda es
     * el cuchillo, y queda hasta que alguien lo recoja. Dibujar las dos cosas
     * sería contar lo mismo dos veces, con la primera desmintiendo a la segunda
     * en cuanto se apagara.
     */
    if (!im.porMecha && !clavable) {
      _dir.set(im.nx, im.ny, im.nz)
      _punto.set(im.x, im.y, im.z)
      this.impacts.spawn(_punto, _dir, this.gameTime)
    }
    if (tiro?.granada) {
      this._estallarGranada(im, tiro)
      return
    }
    const explosion = tiro?.explosion ?? null
    if (explosion) {
      this._explotar(im, explosion)
      return
    }
    this._emisorDispositivo.setPosition(im.x, im.y, im.z)
    if (!clavable) playBow('clavar', 1)
    /**
     * **Acertar la gasta; fallar la deja clavada** (vuelta 90), y ésa es la
     * regla entera del Fang. Si la hoja entra en un cuerpo se acabó —está
     * dentro de alguien— y si se va a una pared se recupera andando por
     * encima. No es una compensación por fallar: es lo que convierte cada
     * lanzamiento en una apuesta con dos resultados distintos, y lo que hace
     * que valga la pena ir a buscarla.
     */
    if (clavable && !im.victima) {
      this._clavar(im)
      return
    }
    if (!im.victima) return
    this.hits += 1
    /**
     * **El daño de un proyectil sale de su fuerza, no de su arma.** Una flecha
     * a medio cargar y una a tope son la misma arma y valen distinto, así que
     * el número viaja **con el proyectil** — es lo que `damageScale` no puede
     * hacer, porque es fijo por arma (vuelta 70). Lo que no cambia es la
     * **forma** del daño: la zona sigue mandando, y la cabeza sigue valiendo
     * una vida entera y sin escalar.
     */
    const { killed } = this.targets.applyHit(im.victima, this.gameTime, this.weaponKey, im.fuerza)
    if (killed) {
      this.kills += 1
      this.status.onKill()
    }
    playHit()
  }

  /**
   * **Deja el cuchillo donde ha chocado** (vuelta 90).
   *
   * **El rumbo con el que se dibuja es la normal de la superficie del revés**,
   * y no la velocidad con la que llegó. Son casi lo mismo y la normal es la que
   * está a mano —el impacto ya la trae, porque de ella sale la marca de bala—,
   * y además da lo que se quiere ver en los dos casos que importan: en una
   * pared, la hoja metida hacia dentro; en el suelo, clavada de punta.
   *
   * **En red esto no planta nada**, y es la regla de la vuelta 64 aplicada a un
   * objeto del mundo: un cuchillo en el suelo es munición, y lo que se puede
   * tener lo decide el servidor. Si el cliente lo plantase además por su cuenta
   * habría dos cuchillos donde hay uno, y recoger el suyo no quitaría el del
   * otro. Llega por `MSG.CLAVADA`, un viaje más tarde y en el sitio exacto.
   */
  _clavar(im) {
    if (this.enRed) return
    this.clavadas.plantar({
      id: this.clavadas.nuevoId(),
      x: im.x, y: im.y, z: im.z,
      dx: -im.nx, dy: -im.ny, dz: -im.nz,
      dueno: im.dueno,
    })
  }

  /**
   * **Recoger un cuchillo es pasar por encima** (vuelta 90), sin tecla y sin
   * apuntar — que es exactamente lo que hacen los recogibles del escenario
   * desde la vuelta 33, y por la misma razón: la tecla contextual ya reparte
   * tres cosas (vuelta 83) y meterle una cuarta es como se pierde una ronda
   * por un reflejo.
   *
   * Dos condiciones, y las dos son reglas:
   *
   * - **Hay que llevar Fang.** Recoger es **recargar, no comprar**: un arma no
   *   se adquiere pisándola, o la tienda pasaría a ser una sugerencia. Quien no
   *   lo ha comprado pasa por encima y no pasa nada.
   * - **Y no se llevan más de las que se compraron.** El tope es el mismo
   *   `reserva.maxima` de siempre, así que tirar dos y recoger las dos te deja
   *   como estabas y nunca por encima.
   *
   * En red no corre: ahí lo decide el servidor, que es quien lleva el
   * inventario (vuelta 64) y el único que sabe dónde están los dos jugadores.
   */
  _recogerClavada() {
    if (this.enRed || this.clavadas.vivas === 0) return
    const clave = this._granadas.find((g) => WEAPONS[g]?.tiro?.clavable)
    if (!clave) return
    const r = WEAPONS[clave].tiro.reserva
    if (this.reservaDe(clave) >= r.maxima) return
    const p = this.camera.position
    const id = this.clavadas.alAlcanceDe(p.x, this.movement.feetY, p.z)
    if (!id) return
    this.clavadas.quitar(id)
    this._reserva[clave] = Math.min(r.maxima, this.reservaDe(clave) + 1)
    // **Y suena**, porque recogerlo es lo único del arma que sí tiene que
    // oírse: el silencio es del lanzamiento, no de la recompensa. Es la voz de
    // recoger equipo, la misma de la utilidad en la tienda (vuelta 73).
    playEquip('utilidad')
    this._publishWeapon(getSettings())
  }

  /**
   * **Contra qué choca un proyectil en el escenario.** Va enlazada porque el
   * modelo la recibe como función y no como escenario: así el servidor le pasa
   * el suyo sin que `proyectiles.js` sepa que existen dos.
   */
  _cortarSegmento = (x0, y0, z0, x1, y1, z1) =>
    this.scenario ? this.scenario.cortarSegmento(x0, y0, z0, x1, y1, z1) : null

  /**
   * **A quién le da un proyectil en el entrenamiento**: a un muñeco, con el
   * mismo `raycast` que resuelve una bala. Es el mismo corte contra las mismas
   * mallas, así que una flecha y un disparo aciertan lo mismo — que es la
   * convención de siempre: dos formas de decidir un impacto son dos juegos.
   *
   * En red esto no corre: quién ha recibido el tiro lo decide el servidor
   * (vuelta 56), y por eso devuelve `null` con `enRed`.
   */
  _proyectilContraCuerpos = (p) => {
    if (this.enRed || !this.targets?.hasActive) return null
    this.targets.updateMatrices()
    _origenRayo.set(p.x0, p.y0, p.z0)
    _dirRayo.set(p.dx, p.dy, p.dz)
    this.raycaster.set(_origenRayo, _dirRayo)
    this.raycaster.near = 0
    // **Y el alcance es el trozo de este paso, más el radio del proyectil.**
    // Sin el `far` acotado, una flecha «acertaría» a un muñeco que está diez
    // unidades por delante de donde ha llegado.
    this.raycaster.far = p.largo + PROJECTILES.radio
    const golpe = this.targets.raycast(this.raycaster)
    if (!golpe) return null
    _golpeDeProyectil.t = golpe.distance
    _golpeDeProyectil.victima = golpe
    _golpeDeProyectil.zona = golpe.part?.zone ?? null
    return _golpeDeProyectil
  }

  /**
   * **Contra qué superficie acaba el rayo que hay puesto en `this.raycaster`**:
   * una pieza de cobertura, o el suelo y las paredes de la sala. Devuelve el
   * punto, su normal y la distancia, o `null` si no hay ninguna —que fuera de
   * la sala no puede pasar, pero un escenario sin montar sí—.
   *
   * Dos mitades, y la segunda no es un rayo: **la sala es una caja y se
   * resuelve en aritmética**. Las paredes y el suelo están dibujados con líneas
   * (`grid.js`), no con mallas, así que no hay contra qué lanzar un rayo; y aun
   * habiéndolas, seis planos analíticos cuestan menos que un `intersectObjects`
   * y dan la normal exacta en vez de la de un triángulo.
   *
   * El objeto que devuelve es **de módulo y se reutiliza**: quien lo reciba lo
   * consume en el acto (la regla de cero alocaciones del bucle caliente).
   */
  _superficieBajoElRayo() {
    const ray = this.raycaster.ray
    let mejor = Infinity
    _impacto.punto.set(0, 0, 0)
    _impacto.normal.set(0, 1, 0)

    const occluders = this.scenario.occluders
    if (occluders.length > 0) {
      this.raycaster.near = 0
      this.raycaster.far = Infinity
      const golpes = this.raycaster.intersectObjects(occluders, false)
      const golpe = golpes.length > 0 ? golpes[0] : null
      if (golpe) {
        mejor = golpe.distance
        _impacto.punto.copy(golpe.point)
        if (golpe.face) {
          // De espacio de objeto a mundo. Las cajas no giran, pero las rampas
          // sí, y una normal girada a mano es la forma de dibujar una marca
          // atravesada dentro de la cuña.
          _normales.getNormalMatrix(golpe.object.matrixWorld)
          _impacto.normal.copy(golpe.face.normal).applyMatrix3(_normales).normalize()
        } else {
          _impacto.normal.copy(ray.direction).negate()
        }
      }
    }

    // La sala: el jugador está dentro de la caja, así que lo que se busca es
    // por dónde **sale** el rayo. Con el origen dentro, eso es el menor de los
    // tres cortes contra la pareja de planos de cada eje.
    const room = this.scenario.room
    const half = { x: room.width / 2, y: room.height, z: room.depth / 2 }
    const o = ray.origin
    const d = ray.direction
    let salida = Infinity
    let eje = -1
    let signo = 1
    const mirar = (dv, ov, min, max, cual) => {
      if (dv === 0) return
      const t = (dv > 0 ? max - ov : min - ov) / dv
      if (t >= 0 && t < salida) {
        salida = t
        eje = cual
        signo = dv > 0 ? -1 : 1
      }
    }
    mirar(d.x, o.x, -half.x, half.x, 0)
    mirar(d.y, o.y, 0, half.y, 1)
    mirar(d.z, o.z, -half.z, half.z, 2)

    if (salida < mejor) {
      mejor = salida
      _impacto.punto.copy(d).multiplyScalar(salida).add(o)
      _impacto.normal.set(eje === 0 ? signo : 0, eje === 1 ? signo : 0, eje === 2 ? signo : 0)
    }
    if (!Number.isFinite(mejor)) return null
    _impacto.distancia = mejor
    return _impacto
  }

  /**
   * **La marca de un disparo de red**, puesta donde el cliente ha resuelto que
   * la bala acabó. Llega un paso después de apretar —el veredicto local se saca
   * al ejecutar la entrada, que es donde lo hace el servidor— y eso son 16 ms
   * que no se ven; lo que se gana es no tener una segunda idea de «a quién le
   * has dado» dentro del motor.
   */
  _impactoDeRed(yaw, pitch) {
    if (!this.impacts.mesh) return
    // La misma dirección con la que viajó el disparo, construida igual que en
    // `net/disparo.js`: el rayo de aquí no puede apuntar a otro sitio que el
    // que se resolvió allí.
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    this.raycaster.ray.origin.copy(this.camera.position)
    this.raycaster.ray.direction.copy(_dir).normalize()
    const superficie = this._superficieBajoElRayo()
    if (superficie) this.impacts.spawn(superficie.punto, superficie.normal, this.gameTime)
  }

  _onPointerLockChange() {
    if (this.isLocked) {
      if (this.enRed) {
        // **Capturar el ratón no arranca nada: lo que arranca es la partida.**
        // Lo que se enciende aquí es el *mando* —mirar y teclear—, no el mundo:
        // el mundo lleva corriendo desde que el servidor dio la bienvenida.
        this.controls.enabled = true
        this.movement.connect(window)
        if (this.phase !== PHASE.RUNNING) this._beginSession()
        return
      }
      if (this.phase === PHASE.IDLE || this.phase === PHASE.FINISHED) this._beginSession()
      else if (this.phase === PHASE.PAUSED) {
        this.controls.enabled = true
        // Abatido se reanuda mirando, no andando: el movimiento vuelve con el
        // jugador, no con el ratón.
        this.movement.setEnabled(this.status.alive)
        this._setPhase(PHASE.RUNNING)
      }
      return
    }
    /**
     * **En red, soltar el ratón no pausa nada** (vuelta 56, y es la regla de la
     * 53). Una pausa es parar el mundo de los dos y sólo la decide el servidor;
     * un `_suspend()` aquí sería justo el «estoy en pausa» local que aquella
     * vuelta quitó — y además dejaría de producir entradas, así que un abatido
     * no volvería a reaparecer nunca: la reaparición cuelga de sus entradas.
     *
     * Lo que sí se hace es la verdad de lo que pasa: se sueltan las teclas
     * —quien abre el menú no está pulsando nada— y se apaga la mirada. El mundo
     * sigue corriendo hasta que la foto diga otra cosa.
     */
    if (this.enRed) {
      this.controls.enabled = false
      this._releaseTrigger()
      // Y se baja la mirilla, que es lo mismo que soltar el gatillo: con el
      // ratón suelto estás en un menú, y el menú no se mira por un visor.
      this._ponerMirilla(false)
      // **Se desconecta el teclado, no se apaga el movimiento.** El servidor
      // sigue ejecutando las entradas de este jugador pase lo que pase, así que
      // el cliente tiene que seguir prediciéndolas: apagar `movement` pararía
      // `update()` en este lado y sólo en éste, o sea una corrección por paso.
      // Lo que sobra con el ratón suelto son las teclas, y eso se quita
      // quitando el oyente.
      this.movement.disconnect()
      this.movement.releaseKeys()
      this.movement.releaseInput()
      return
    }
    // Perder la captura en plena partida pausa el reloj en lugar de
    // terminarla: salir con Escape no debería arruinar la sesión.
    this._suspend()
  }

  /**
   * **Soltar la partida sin terminarla.** Apaga controles y movimiento, suelta
   * el gatillo y pasa a pausa si se estaba jugando.
   *
   * Existe como método porque hay **dos** formas de dejar de jugar sin acabar
   * —Escape, que suelta el ratón, y abrir la armería— y las dos tienen que dejar
   * exactamente el mismo estado. Dos trozos de código parecidos es como acaba
   * una pausa con el gatillo todavía pulsado.
   */
  _suspend() {
    this.controls.enabled = false
    this._releaseTrigger()
    // Y se baja la mirilla: el menú no se mira por un visor, y la transición
    // corre con el reloj del mundo, que en pausa está parado.
    this._ponerMirilla(false)
    this._scopeT = 0
    this.scope?.set(0)
    this.camera.fov = CAMERA.fov
    this.camera.updateProjectionMatrix()
    this._aplicarSensibilidad()
    this.movement.setEnabled(false)
    if (this.phase === PHASE.RUNNING) this._setPhase(PHASE.PAUSED)
  }

  _onResize() {
    const parent = this.canvas.parentElement
    const width = parent ? parent.clientWidth : window.innerWidth
    const height = parent ? parent.clientHeight : window.innerHeight
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.cssRenderer.setSize(width, height)
  }

  _loop(now) {
    this._rafId = requestAnimationFrame(this._loop)

    const rafDelta = now - this._lastRafTime
    this._lastRafTime = now
    if (!this._dueThisTick(rafDelta)) return

    // El delta del juego es el tiempo real transcurrido desde el fotograma
    // anterior *dibujado*, no el intervalo objetivo: si se limita a 60 en un
    // monitor de 240, el reloj del juego tiene que seguir yendo a tiempo real.
    const delta = Math.min(now - this._lastFrameTime, SIM.maxFrameDeltaMs)
    this._lastFrameTime = now
    this._sampleFps(delta)

    this._advanceSimulation(now, delta)

    // La vista del avatar se lleva la cámara mientras esté abierta. Va después
    // del movimiento y antes de dibujar, como cualquier otra cosa que la mueva.
    if (this._avatarDebug) this._updateAvatarDebug(delta / 1000)
    // Agacharse achata el cuerpo. Va aquí y no en el movimiento porque es
    // presentación, no física: una escritura de escala con la altura de ojos
    // que el movimiento ya ha resuelto este frame.
    this.avatar?.setEyeHeight(this.movement.eyeHeight)
    // Y la cámara pasa a la pose de dibujado, que ya no es la del último paso.
    this._applyRenderPose()

    this.actionPanel.follow(this.camera)
    this.actionPanel.syncLayout()
    // El fondo panorámico va con la cámara en posición (vuelta 77): se coloca
    // con la pose ya interpolada y antes de dibujar, como todo lo demás.
    this.scenario.seguirConFondo(this.camera)
    /**
     * **Y el láser de la curva y los proyectiles se dibujan con la pose
     * interpolada** (vuelta 85), que es por lo que van aquí dentro y no en el
     * paso de mundo: la curva sale **de los ojos**, y con la pose autoritativa
     * se quedaría a tirones de 60 Hz colgando de una cámara que va a 240.
     */
    this._dibujarTrayectoria()
    this.vuelo.update(this.proyectiles)
    this.vuelo.updateClavadas(this.clavadas, this.gameTime)
    this._moverSilbidos()
    // Con el reloj del mundo, como las marcas de bala (vuelta 64): en pausa una
    // ceguera se queda quieta en vez de gastarse mirando el menú.
    if (this.granadas?.activo) this.granadas.update(this.gameTime)
    this._actualizarCono()
    this._publishStats()
    this.renderer.render(this.scene, this.camera)
    this.cssRenderer.render(this.cssScene, this.camera)

    // **Y se devuelve.** La pose interpolada vive sólo lo que dura el dibujado:
    // fuera de estas tres líneas `camera.position` es siempre la autoritativa,
    // que es lo que deja que cualquiera la escriba sin que el frame siguiente
    // se la pise.
    this._restoreSimPose()
  }

  /**
   * **El mundo avanza en pasos de tamaño fijo** (vuelta 44), y el monitor sólo
   * decide cuándo se dibuja. Es el mismo mecanismo que el limitador de
   * fotogramas —sumar el tiempo real, descontar un intervalo cuando toca y
   * **guardar el sobrante**— aplicado a la simulación en vez de al dibujado, y
   * con la misma tolerancia por la misma razón: sin ella, un monitor a 60 Hz
   * entrega frames de 16.666 ms contra un paso de 16.667 y el primer paso se
   * escaparía por los pelos.
   *
   * El porqué está en `config.js` (`SIM`): el modelo vectorial del aire es una
   * integración cuya entrada es el ratón, y con paso variable su resultado
   * dependía del refresco. Con paso fijo el juego se comporta a 240 Hz
   * exactamente como se comporta a 60.
   *
   * `delta` ya viene acotado por `SIM.maxFrameDeltaMs`, así que un parón del
   * navegador no se paga con una avalancha de pasos: seis como mucho.
   */
  _advanceSimulation(now, delta) {
    const step = SIM_STEP_MS
    // **En red el ritmo lo pone el cliente** (vuelta 56). No es el mismo
    // acumulador con otro nombre: además del sobrante lleva el enganche al
    // reloj del servidor, el re-anclaje tras un parón y el freno con suelo, que
    // son las vueltas 49 y 51 y no tienen sentido fuera de una partida. Vive en
    // `net/cliente.js` para que no haya dos copias de ese cálculo.
    if (this.enRed) {
      this._advanceNet(now, delta)
      return
    }
    const tolerance = Math.min(1, step * 0.1)
    this._simAccumulator += delta

    while (this._simAccumulator >= step - tolerance) {
      this._simAccumulator -= step
      this._simTime += step
      this._simStep(step)
    }

    // **Re-anclado del reloj del mundo.** Los pasos son fijos y los frames no,
    // así que el final del último paso queda un `_simAccumulator` por detrás de
    // este frame: `_simTime` es un **instante real**, no un reloj aparte, y por
    // eso el aterrizaje que se despeja de la parábola se puede comparar sin
    // traducir con el `timeStamp` de un evento de teclado. Por construcción
    // esta línea no cambia nada; hace falta para el caso en que `delta` se haya
    // acotado —un parón largo—, donde los dos relojes se separarían para
    // siempre si no se volvieran a juntar aquí.
    this._simTime = now - this._simAccumulator
  }

  /**
   * **Los pasos de un frame en red** (vuelta 56).
   *
   * El mundo sigue yendo a 60 Hz fijos; lo que cambia es quién decide cuántos
   * pasos caben en este frame, y la respuesta no es el acumulador solo: es el
   * acumulador **enganchado al reloj del servidor**. Eso vive en el cliente
   * (`pasosDeFrame`), que además es quien mueve al jugador dentro de cada paso.
   *
   * Tres cosas que son el mecanismo:
   *
   * - **En pausa no se gasta paso y el acumulador no guarda el rato parado.**
   *   Dejarlo acumular sería soltar un minuto de pasos de golpe al reanudar; es
   *   la misma razón por la que el motor acota el frame largo.
   * - **Un re-anclaje no se interpola.** Tras un parón el número de paso salta,
   *   y dibujar el punto intermedio sería barrer medio mapa: se suelta la pose
   *   guardada, igual que con un teletransporte.
   * - **`_simTime` se re-ancla al final**, exactamente como fuera de la red:
   *   sigue siendo un instante real un sobrante por detrás de este frame, y de
   *   ahí sale la fracción con la que viaja la pulsación de salto.
   */
  _advanceNet(now, delta) {
    // Antes de la bienvenida no hay reloj al que engancharse: consultarlo sería
    // leer un atraso que crece contra un mundo en el que nadie está jugando.
    if (this.phase !== PHASE.RUNNING || this.net.pausa.pausada) {
      this.net.soltarAcumulador()
      this._simAccumulator = 0
      this._simTime = now
      return
    }
    const { pasos, reanclado } = this.net.pasosDeFrame(now, delta)
    // **Un re-anclaje no se interpola.** Soltar la época hace que el paso
    // siguiente vuelva a sembrar las dos poses, que es el mismo mecanismo con
    // el que no se interpola un teletransporte.
    if (reanclado) this._simPoseEpoch = -1
    for (let i = 0; i < pasos; i++) {
      // Cuándo empezó **este** paso en tiempo real: de ahí sale la fracción de
      // paso con la que viajan la pulsación de salto y el clic de disparo.
      const inicio = now - this.net.acumulador - (pasos - i) * SIM_STEP_MS
      this._simTime = inicio + SIM_STEP_MS
      this._simStep(SIM_STEP_MS, inicio)
    }
    this._simAccumulator = this.net.acumulador
    this._simTime = now - this._simAccumulator
  }

  /**
   * Un paso de mundo. Es literalmente lo que hacía el frame hasta la vuelta 43,
   * con dos diferencias: el delta es fijo y las tres actualizaciones del mundo
   * —dianas, combate y objetivo— viven ya en el mismo sitio que el movimiento
   * en vez de en un segundo bloque más abajo. La condición de fase sigue siendo
   * la misma y sigue cubriéndolas a todas: **el mundo sólo avanza jugando**, y
   * pausar es dejar de sumarle al reloj (ver `CLAUDE.md`).
   */
  _simStep(stepMs, inicioDePaso = this._simTime - stepMs) {
    if (this.phase !== PHASE.RUNNING) return

    // El reloj del mundo avanza aquí y **sólo aquí**: pausar es dejar de
    // sumarle, y con eso se para todo lo que cuelga de él.
    this.gameTime += stepMs
    this._updateScope(stepMs)
    this._updateReload(this.gameTime)
    this.elapsedMs += stepMs
    // Con explosivo, el reloj de la sesión es su cuenta atrás: la duración
    // fija no se aplica, o los 30 s cortarían la partida antes de los 45.
    if (!this.endless && !this.objectiveRunning && this.elapsedMs >= this.durationMs) {
      this.elapsedMs = this.durationMs
      this._finishSession()
      return
    }

    // De dónde sale el jugador este paso. Se lee de la cámara y no de la copia
    // anterior a propósito: **la posición autoritativa es `camera.position`**,
    // y quien la escriba desde fuera —una reaparición, una prueba, la vista de
    // depuración— manda sobre lo que hubiera guardado el dibujado.
    this._simPrev.copy(this.camera.position)

    // **En red no se mueve el motor: se da un paso de red.** `dar()` muestrea
    // las teclas —que son las mismas de `movement.keys`—, predice llamando al
    // mismo `movement.update` y manda la entrada sellada con su número de paso.
    // Llamar aquí a `movement.update` además sería dar el paso dos veces.
    if (this.enRed) this.net.dar(this.net.paso + 1, inicioDePaso)
    else this.movement.update(stepMs / 1000, this._simTime)

    /**
     * **El rumbo que pide un teletransporte lo aplica el dueño del rumbo**
     * (vuelta 80). El movimiento no puede escribir `camera.rotation.y`: su
     * dueño es `LookControls` y lo reescribiría en el siguiente movimiento de
     * ratón, así que el jugador saldría mirando bien hasta que tocara el ratón
     * —o sea nunca— (vuelta 66). El movimiento lo **pide** y aquí se aplica.
     */
    const rumbo = this.movement.consumirRumboPedido()
    if (rumbo !== null && rumbo !== undefined) this.controls?.lookAt(rumbo)

    /**
     * **Y un dispositivo que actúa se ve y se oye** (vuelta 82, norma
     * permanente). El movimiento deja el recado y aquí se gasta: es el mismo
     * reparto que el rumbo —él decide lo que pasa en el mundo, el motor decide
     * lo que se pinta y lo que suena— y por eso `partida.js`, que no tiene ni
     * escena ni altavoces, no se entera de que esto existe.
     */
    const uso = this.movement.consumirUsoDeDispositivo()
    if (uso) this._dispositivoUsado(uso)

    // Y aquí queda dónde acaba. Si el movimiento ha teletransportado (`reset`),
    // la época cambia y este paso no se interpola: se dibuja donde toca en vez
    // de barrer medio mapa.
    if (this._simPoseEpoch !== this.movement.poseEpoch) {
      this._simPoseEpoch = this.movement.poseEpoch
      this._simPrev.copy(this.camera.position)
    }
    this._simCurr.copy(this.camera.position)

    const landing = this.movement.takeLandingImpact()
    if (landing > 0) playLanding(landing)
    // Fuego automático: como mucho un disparo por paso. A 60 Hz eso son 3600
    // RPM de techo, muy por encima de cualquier arma del roster — y desde la
    // vuelta 44 ese techo ya no depende del refresco ni del límite de FPS.
    if (this._triggerHeld && !this._triggerConsumedByPanel && this.weapon.mode === 'auto') {
      this._tryShoot(this.gameTime)
    }
    // **Y el cuchillo encadena flojos mientras se mantenga el botón.** Es lo
    // que hace cualquiera con un cuchillo en la mano, y el ritmo lo pone su
    // cadencia igual que a un arma automática.
    if (this._triggerHeld && !this._triggerConsumedByPanel && this.weapon.melee) {
      this._tryMelee('luz', this.gameTime)
    }
    // El aviso de «hay alguien a distancia de cuchillo», una vez por paso de
    // mundo y sólo con el cuchillo en la mano.
    this._updateMeleeRange()

    // Las marcas de bala se apagan con el **reloj del mundo** y en los dos
    // modos, así que van aquí y no dentro del combate —que en red vuelve antes—.
    // En pausa una marca se queda quieta en vez de apagarse a tus espaldas.
    this.impacts.update(this.gameTime)
    this.dispositivos.update(this.gameTime)
    /**
     * **Y los proyectiles vuelan en el paso de mundo, no en el frame** (vuelta
     * 85). Es lo que hace que una flecha llegue al mismo sitio en cualquier
     * monitor y lo que permite que en red los dos extremos deriven la misma
     * parábola sin que viaje un número. En pausa se quedan quietos en el aire,
     * como todo lo que cuelga de `gameTime`.
     */
    this._pasoDeProyectiles(stepMs / 1000)
    /**
     * **Y se recoge lo que haya debajo, en el paso y no en el frame** (vuelta
     * 90): con el jugador ya movido, y sesenta veces por segundo pase lo que
     * pase con el monitor. En pausa no se recoge nada, que es lo que hace
     * `_simStep` con todo lo demás del mundo desde la vuelta 44.
     */
    this._recogerClavada()

    // Dianas y explosivo son del entrenamiento: en red no hay ni una cosa ni
    // otra, y el combate lo sustituye el estado que llega del servidor.
    if (!this.enRed) this.targets.update(this.gameTime, stepMs / 1000, this.camera)
    // El combate va después de las dianas: los muñecos disparan desde donde
    // han quedado este paso, no desde donde estaban en el anterior.
    this._updateCombat(this.gameTime, stepMs)
    if (!this.enRed) this._updateObjective(this.gameTime, stepMs / 1000)
  }


  /**
   * **Lo que se ve y se oye cuando un dispositivo actúa** (vuelta 82).
   *
   * Norma permanente desde esta vuelta: un dispositivo nace con su destello y
   * su voz. Aquí se reparten los dos, y nada más — la decisión de qué ha
   * pasado ya la tomó el movimiento, que es quien sabe de física.
   *
   * **El emisor se coloca donde ha pasado**, no donde está el jugador: una
   * puerta suena desde su anillo, así que quien la use de espaldas la oye
   * detrás. Sin audio espacial, `input` da null y la voz cae sola al máster.
   */
  _dispositivoUsado(uso) {
    const ahora = this.gameTime
    if (uso.tipo === 'puerta') {
      // Los dos extremos, y el sonido en **los dos**: quien entra oye cerrarse
      // la puerta detrás y abrirse delante, que es lo que hace que un salto
      // instantáneo se lea como un viaje y no como un fallo de dibujado.
      this.dispositivos.emitir('tp-entrada', uso.desdeX, uso.desdeY, uso.desdeZ, uso.rumbo, ahora)
      this.dispositivos.emitir('tp-salida', uso.x, uso.y, uso.z, uso.rumbo, ahora)
      this._emisorDispositivo.setPosition(uso.x, uso.y + 1, uso.z)
      playDevice('puerta', this._emisorDispositivo)
      return
    }
    this.dispositivos.emitir(uso.tipo, uso.x, uso.y, uso.z, uso.rumbo, ahora)
    this._emisorDispositivo.setPosition(uso.x, uso.y + 0.5, uso.z)
    playDevice(uso.tipo, this._emisorDispositivo)
  }

  /**
   * **La pose con la que se dibuja este frame.** Entre dos pasos de mundo la
   * cámara se coloca en el punto intermedio que le toque, así que un monitor de
   * 240 Hz sigue viendo movimiento a 240 Hz aunque el mundo vaya a 60. La
   * rotación no entra aquí: la escribe el ratón evento a evento y ya es fina.
   *
   * Sólo mientras se juega. En pausa la cámara se queda en la última pose
   * autoritativa, que es la que de verdad ocupa el jugador, y la vista de
   * depuración (F3) mueve la cámara por su cuenta sin que esto la pise.
   */
  _applyRenderPose() {
    this._interpolating = false
    // La vista de depuración manda sobre la cámara mientras esté abierta.
    if (this._avatarDebug) return
    // Fuera de la partida no hay nada entre lo que interpolar: la cámara ya
    // está donde el jugador está de verdad.
    if (this.phase !== PHASE.RUNNING) return
    if (this._simPoseEpoch !== this.movement.poseEpoch) return
    const alpha = this._simAccumulator / SIM_STEP_MS
    this.camera.position.lerpVectors(
      this._simPrev,
      this._simCurr,
      alpha < 0 ? 0 : alpha > 1 ? 1 : alpha,
    )
    this._interpolating = true
  }

  /**
   * **La curva de lo que vas a lanzar, si es que estás tensando algo.**
   *
   * Se dibuja **sólo mientras se carga** y no siempre que lleves el arma
   * puesta. Es una decisión, no un ahorro: un láser permanente convierte el
   * arco en un arma de apuntar con una línea en vez de con la mira, y lo que se
   * quiere es que tensar **sea** el gesto de apuntar. De paso es lo que hace
   * que el rival vea venir a alguien que ya ha decidido disparar.
   */
  _dibujarTrayectoria() {
    const tiro = this.armaDeTiro
    if (!tiro || !this.cargando || this.phase !== PHASE.RUNNING || !this.scenario) {
      this.trayectoria.ocultar()
      return
    }
    const carga = this.cargaActual
    const yaw = this.camera.rotation.y
    const pitch = this.camera.rotation.x
    /**
     * **La curva sale de `lanzamientoDeArma`, no de repetir su cuenta aquí**
     * (vuelta 87). Lo era hasta el tiro corto, y con dos modos de lanzamiento
     * una copia de la fórmula es un láser que enseña la parábola larga mientras
     * el botón derecho tira la corta. Es la regla de siempre —una sola fuente
     * de verdad para lógica compartida— aplicada a lo único que no podía
     * permitirse discrepar: **el dibujo de lo que va a pasar**.
     */
    const l = lanzamientoDeArma(
      this.weapon, carga, this.camera.position, yaw, pitch, _lanzamiento,
      { corto: this._cargaCorta },
    )
    if (!l) { this.trayectoria.ocultar(); return }
    _velSalida.x = l.vx; _velSalida.y = l.vy; _velSalida.z = l.vz
    const cp = Math.cos(pitch)
    const fx = -Math.sin(yaw) * cp
    const fy = Math.sin(pitch)
    const fz = -Math.cos(yaw) * cp
    /**
     * **De cuánto se separa el dibujo del arranque de verdad.** La boca del
     * arma: a la derecha, abajo y un poco por delante. El porqué —y por qué el
     * proyectil **no** sale de ahí— está en `TRAJECTORY.desdeArma`. Frente y
     * derecha como dos vectores, y se suman (vuelta 77).
     */
    const { lado, abajo, delante } = TRAJECTORY.desdeArma
    _desvio.x = Math.cos(yaw) * lado + fx * delante
    _desvio.y = -abajo + fy * delante
    _desvio.z = -Math.sin(yaw) * lado + fz * delante
    this.trayectoria.dibujar(
      this.camera.position, _velSalida, tiro.gravedad, carga, this._cortarSegmento, _desvio,
    )
  }

  /** Devuelve la cámara a la pose autoritativa en cuanto se ha dibujado. */
  _restoreSimPose() {
    if (!this._interpolating) return
    this._interpolating = false
    this.camera.position.copy(this._simCurr)
  }

  /**
   * Decide si a este tick de rAF le toca dibujar.
   *
   * En vez de saltarse fotogramas a lo bruto, se acumula el tiempo y se
   * descuenta un intervalo objetivo cada vez que se dibuja, guardando el
   * sobrante. Así el ritmo medio sale exacto aunque el objetivo no sea un
   * divisor del refresco del monitor, y el movimiento no va a tirones.
   *
   * La tolerancia evita el fallo clásico de pedir el mismo límite que el
   * refresco de la pantalla: un tick de 4.166 ms no llega por los pelos a un
   * objetivo de 4.167 y el ritmo se quedaría a la mitad.
   */
  _dueThisTick(rafDelta) {
    const interval = this._frameIntervalMs
    if (interval <= 0) return true

    this._frameAccumulator += rafDelta
    const tolerance = Math.min(1, interval * 0.1)
    if (this._frameAccumulator < interval - tolerance) return false

    this._frameAccumulator -= interval
    // Si el monitor no da para el límite pedido, no se acumula una deuda
    // imposible de pagar: se dibuja en cada tick y ya está.
    if (this._frameAccumulator > interval) this._frameAccumulator = interval
    return true
  }

  /** Media móvil de los últimos fotogramas dibujados. */
  _sampleFps(delta) {
    if (delta <= 0) return
    const samples = this._frameSamples
    const index = this._frameSampleIndex
    this._frameSampleSum += delta - samples[index]
    samples[index] = delta
    this._frameSampleIndex = (index + 1) % samples.length
    if (this._frameSampleCount < samples.length) this._frameSampleCount += 1
    this.fps = this._frameSampleSum > 0 ? (this._frameSampleCount * 1000) / this._frameSampleSum : 0
  }

  _publishStats() {
    const stats = this.stats
    stats.fps = this.fps
    stats.ammo = this.ammo
    stats.magazine = this.weapon.magazine
    stats.reloading = this.reloading
    stats.reloadProgress = this.reloading
      ? Math.min(1, (this.gameTime - this.reloadStartedAt) / this.weapon.reloadMs)
      : 0
    stats.endless = this.endless
    // El cronómetro cuenta hacia arriba en práctica libre y también con
    // explosivo: enseñar lo que queda sería un temporizador de bomba en el HUD,
    // y la cuenta atrás sólo se puede oír, no leer.
    stats.countUp = this.endless || this.objectiveRunning
    stats.timeLeftMs = stats.countUp
      ? this.elapsedMs
      : Math.max(0, this.durationMs - this.elapsedMs)
    stats.hits = this.hits
    stats.shots = this.shots
    stats.misses = this.shots - this.hits
    stats.kills = this.kills
    stats.accuracy = this.shots > 0 ? (this.hits / this.shots) * 100 : 0
    // **El marcador**, con los datos de la sesión y no con una copia aparte:
    // bajas y precisión ya estaban aquí, y muertes es el único dato nuevo.
    // Sólo se abre jugando; en pausa y en el resumen hay paneles de verdad.
    stats.scoreboard = this._scoreboardHeld && this.phase === PHASE.RUNNING
    stats.deaths = this.status.deaths
    stats.nick = PLAYER.nick
    // Estrellas en vivo: sólo hay puntuación donde hay objetivo que puntuar.
    stats.scoring = this.objective.active
    if (stats.scoring) stats.stars = this._currentScore().stars

    // **En red la vida la dice el servidor** (vuelta 56), y el bloque de
    // vitales sale siempre: hay quien dispare por definición. Escudo y casco se
    // quedan a cero a propósito — esta vuelta es sólo vida.
    if (this.enRed) {
      stats.combat = true
      stats.health = this.net.vida
      // **Escudo y casco existen en red desde la vuelta 64**, porque hay una
      // tienda que los vende. Las cargas no: recargar el chaleco a mano es del
      // entrenamiento, y en el duelo se compra entre rondas.
      stats.shield = this.net.escudo ?? 0
      stats.shieldSegments = Math.ceil((this.net.escudo ?? 0) / PLAYER.shield.segment)
      stats.maxSegments = Math.round(PLAYER.shield.max / PLAYER.shield.segment)
      stats.charges = 0
      stats.helmet = !!this.net.casco
      stats.applying = false
      stats.applyProgress = 0
      stats.alive = this.net.vida > 0
      stats.respawnLeftMs = this.net.restaReaparicionMs()
      stats.respawnMs = NET.respawnMs
      // **Y la gracia de salida sale del servidor** (vuelta 78). El marco azul y
      // su cuenta existen en el HUD desde el entrenamiento; lo único que
      // faltaba en el duelo era el número, que hasta aquí iba en cero fijo.
      stats.invulnerableLeftMs = this.net.invulnerableMs ?? 0
      stats.invulnerableMs = this.scenario.invulnerabilidadDeDuelo
      stats.lowHealth = this.net.vida > 0 && this.net.vida < PLAYER.lowHealth
      stats.deaths = this.net.muertes ?? 0
      stats.kills = this.net.bajas ?? this.kills
      this.callbacks.onFrame?.(stats)
      return
    }
    // Vida y escudo: el bloque sólo aparece donde hay quien dispare.
    const status = this.status
    stats.combat = this.enemyFire.enabled
    stats.health = status.health
    stats.shield = status.shield
    stats.shieldSegments = status.shieldSegments
    stats.maxSegments = status.maxSegments
    stats.charges = status.charges
    stats.helmet = status.helmet
    stats.applying = status.applying
    stats.applyProgress = status.applyProgress
    stats.alive = status.alive
    stats.respawnLeftMs = status.respawnLeftMs
    stats.respawnMs = status.respawnMs
    stats.invulnerableLeftMs = status.invulnerableLeftMs
    stats.invulnerableMs = PLAYER.respawn.invulnerableMs
    stats.lowHealth = status.lowHealth
    this.callbacks.onFrame?.(stats)
  }
}
