/**
 * Vektor — configuración central del prototipo.
 *
 * Todo lo ajustable vive aquí: ningún valor de estos debería aparecer
 * hardcodeado en otro archivo. En una fase posterior, la pantalla de opciones
 * escribirá sobre estos mismos campos (sensibilidad, crosshair, duración...).
 */

import { MAPAS_DE_FICHERO } from './maps/index.js'

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
   * **Lo que un mapa te hace al pisarlo** (vuelta 84). Las marcas de los
   * dispositivos —galones, muelles, cristales, anillos de puerta y la rejilla
   * de un ventilador— iban en azul eléctrico desde la vuelta 80, y jugándolo
   * se vio que ahí el argumento estaba mal planteado: no competía con otro
   * **significado**, competía con el **fondo**. Un mapa de Vektor no tiene ni
   * texturas ni luces, así que es gris y negro entero, y un cian apagado sobre
   * gris es un tono frío sobre otro tono frío.
   *
   * Es el tercer color de la paleta que significa dos cosas, y se admite por lo
   * mismo que los dos anteriores —el verde de la brújula y el azul de la
   * carga—: **no coinciden nunca**. `alert` (#FFD23F) es el `?` de «te ha
   * visto», un billboard que flota sobre un muñeco y sólo existe en el
   * entrenamiento; esto está pintado en el suelo, bajo los pies, y existe en
   * los dos modos. Y lo que de verdad los separa es la forma, que es la regla
   * de la vuelta 67: un signo de interrogación no se confunde con un galón.
   *
   * Va más ámbar que el limón de `alert` justo para que, en el único sitio
   * donde podrían salir a la vez, no sean el mismo amarillo.
   */
  dispositivo: '#FFC21E',
  /**
   * **Te está disparando.** Rojo puro, y **no** el naranja de las dianas
   * (`target`, #E4462B): el icono sale justo encima de un muñeco naranja, y un
   * aviso del color de aquello sobre lo que se dibuja no es un aviso.
   */
  threat: '#FF2D1F',
  /**
   * **Pizarra: el «no, gracias»** (vuelta 55). Es el segundo botón del cartel de
   * votación, y el encargo pedía que no fuese rojo — el rojo es «te están
   * disparando», y declinar una pausa no es una amenaza.
   *
   * No es un gris por pereza: **no queda un tono libre**. Medido en CIELAB, que
   * es donde una diferencia de color se parece a lo que ve un ojo, el violeta
   * que parecía el hueco obvio de la paleta (`#8B5CF6`) se queda a **ΔE 24.8**
   * del azul de equipo — la mitad de los 51 que separan a los dos equipos entre
   * sí y muy lejos de los 79 con que se eligieron contra los reservados. El
   * naranja, el rojo, el verde, el ámbar, el amarillo, el azul y el magenta ya
   * significan algo cada uno, así que lo único que queda sin dueño es el eje que
   * nadie ha pedido: el neutro. Éste mide **ΔE 68** contra el más cercano de
   * todos ellos, y a L* 56 admite texto oscuro encima.
   *
   * Y dice lo que tiene que decir: aceptar es la acción —verde— y declinar es
   * seguir jugando, que es no hacer nada.
   */
  decline: '#7C8899',
}

/** Sesión cronometrada. */
export const SESSION_DURATION_S = 30

/** Cámara. FOV vertical; a 16:9 equivale a ~103° horizontales (referencia FPS). */
export const CAMERA = {
  /**
   * El encuadre normal. Con mirilla se baja al `scope.fov` del arma y se vuelve
   * a subir aquí, interpolando — y lo escribe **sólo** el motor, en
   * `_updateScope`: dos sitios escribiendo el FOV es una cámara que se queda a
   * medio camino el día que uno de los dos no se entere de un cambio de arma.
   */
  fov: 71,
  near: 0.1,
  far: 200,
}

/**
 * Mira. `degreesPerCount` es la convención de los FPS clásicos (0.022°/count),
 * así que `sensitivity` se puede comparar de tú a tú con la de otros juegos.
 */
/**
 * **La mirilla ampliada** (vuelta 70), hoy exclusiva de los rifles de
 * francotirador: el arma la pide con su bloque `scope` y aquí está lo que es
 * igual para todas.
 *
 * Es la **primera y única** del juego, y por eso el interruptor no es un modo
 * aparte: es el **clic derecho**, el mismo gesto que pone y quita el supresor.
 * Un arma tiene una segunda función o no la tiene, y cuál es lo dice el arma —
 * la Scout no admite supresor y sí mirilla, así que el gesto no se pisa nunca.
 */
export const SCOPE = {
  /**
   * **Cuánto dura la transición**, en ms. No es instantánea a propósito —un
   * corte seco se lee como un fallo de dibujado— y no puede ser lenta: 140 ms
   * es lo que hace falta para que un *quickscope* asomándose siga siendo un
   * gesto y no una espera. Se anima **por paso de mundo**, así que dura lo
   * mismo en cualquier monitor.
   */
  transitionMs: 140,
  /**
   * Grosor de la cruceta y del punto, en píxeles de pantalla. Fina a propósito:
   * lo que se apunta con una mirilla es un punto, y una cruz gruesa tapa
   * exactamente lo que se está mirando.
   */
  lineaPx: 1,
  puntoPx: 2,
  /** Hueco central de la cruceta: el punto rojo no puede quedar dentro de una X. */
  huecoPx: 9,
  /**
   * Radio de la lente, en porcentaje del lado corto de la pantalla. Lo de fuera
   * es negro macizo — que es lo que hace que apuntar **cueste** visión
   * periférica, y lo que equilibra que una bala mate de un tiro.
   */
  radioVmin: 38,
}

/**
 * **Los proyectiles: lo primero de Vektor que tarda en llegar** (vuelta 85).
 *
 * Hasta aquí **todo el juego era impacto instantáneo**. Una bala se resuelve
 * con un rayo en el mismo paso en que sale: por eso el netcode del duelo pudo
 * construirse alrededor de «rebobino al instante que el tirador tenía en
 * pantalla y contesto» (vuelta 46), y por eso no había nada en el mundo que
 * durase entre dos pasos. Un arco y un cohete rompen eso, y por eso esto es
 * una pieza de ingeniería nueva y no una ficha más del catálogo.
 *
 * Tres reglas, y las tres salen de lo que el juego ya es:
 *
 * - **La trayectoria está en forma cerrada**, `p(t) = p0 + v0·t + ½·a·t²`, y
 *   no se integra paso a paso. Es la misma decisión que la parábola del salto
 *   (vuelta 27) y por la misma razón: integrar por Euler acumula error y ese
 *   error va con el tamaño del paso. Aquí además es lo que permite **dibujar
 *   la curva antes de disparar** sin simularla — el láser del arco evalúa la
 *   misma fórmula en veinte puntos, así que lo que se ve y lo que pasa no
 *   pueden discrepar.
 * - **La gravedad de un proyectil la declara el arma, no el mapa.** Es la
 *   excepción deliberada a la física de la vuelta 72, y no es un olvido: un
 *   mapa decide cuánto pesas tú, y eso es una decisión sobre tu cuerpo. Si
 *   decidiera además cómo cae tu flecha, **aprender el arco en un mapa no
 *   serviría en otro**, y la curva de un arco es exactamente lo que hay que
 *   aprender.
 * - **Y nada de esto viaja por la red.** Lo que viaja es el lanzamiento —de
 *   dónde, hacia dónde y con cuánta fuerza—, y de ahí los dos extremos derivan
 *   la misma trayectoria porque dan los mismos pasos de 60 Hz contra el mismo
 *   mapa. Es el patrón de la física de la vuelta 72 aplicado a algo que se
 *   mueve solo.
 */
export const PROJECTILES = {
  /**
   * Cuántos pueden estar volando a la vez **por jugador**. Un arco dispara uno
   * cada 1.1 s y el más lento tarda 1.3 s en cruzar el mapa, así que con ocho
   * no se llena ni disparando a ciegas; el tope existe para que un fichero roto
   * o un cliente que mienta no pueda sembrar el mundo.
   */
  pool: 8,
  /**
   * **Cuánto vive uno que no da en nada.** No puede pasar —la sala es una caja
   * cerrada y `cortarSegmento` siempre encuentra su pared— pero un tope es lo
   * que separa un fallo de una fuga: sin él, un proyectil con velocidad cero se
   * quedaría en el pool para siempre.
   */
  vidaMaxMs: 9000,
  /**
   * **El radio con el que un proyectil toca un cuerpo**, en unidades. No es el
   * tamaño del dibujo: es cuánto perdona. A cero habría que acertar con una
   * recta de grosor nulo contra una silueta que en la cabeza mide 0.137
   * (vuelta 65), y eso con una parábola y tiempo de vuelo no es puntería, es
   * lotería. 0.10 es la mitad del ancho de una muñeca.
   */
  radio: 0.1,
  /**
   * **Lo que se dibuja de uno que vuela.**
   *
   * `largo` es el de un proyectil flojo y `porFuerza` lo que crece con la
   * carga: una flecha a tope se ve **casi el doble de larga**, y eso no es
   * decoración — es la mitad de que un arma con tiempo de vuelo sea justa.
   * Quien la ve venir tiene que poder distinguir de un vistazo la que le va a
   * quitar media vida de la que lo mata, y a veinte unidades el único canal que
   * queda es la silueta (que es la regla de la vuelta 38: sin luces, lo único
   * que distingue una cosa de otra es su forma).
   */
  estela: { largo: 0.9, radio: 0.04, porFuerza: 0.8 },
}

/**
 * **El láser que dibuja la curva antes de soltarla** (vuelta 85).
 *
 * Es la convención de la vuelta 78 —«todo lo configurable se coloca viendo el
 * efecto»— aplicada por primera vez **dentro de la partida** y no en el editor.
 * Un arma de tiro curvo sin la curva delante es un arma que se aprende
 * fallando, y el mismo argumento que hizo que una salida de duelo se arrastre
 * en vez de escribirse vale aquí: el número —45 grados, 32 u/s— no dice *dónde
 * cae* hasta que se prueba.
 *
 * **Sale de la misma fórmula que el vuelo**, evaluada en `puntos` instantes. No
 * es una aproximación de la trayectoria: es la trayectoria, muestreada — así
 * que el láser no puede mentir por mucho que se toque el arma.
 */
export const TRAJECTORY = {
  /**
   * Cuántos puntos tiene la curva. Veinticuatro segmentos es lo que hace falta
   * para que una parábola larga no se vea como una línea quebrada; por encima
   * no se nota y es geometría que se reescribe sesenta veces por segundo.
   */
  puntos: 24,
  /**
   * **Hasta dónde se dibuja**: la curva se corta donde el proyectil chocaría,
   * y este es el tope por si no choca con nada dentro de la sala. En segundos
   * de vuelo, no en unidades: lo que importa es cuánto de la trayectoria se
   * enseña, y eso es tiempo.
   */
  segundosMax: 2.6,
  /** Grosor del punto de caída, en unidades. Es donde va a aterrizar. */
  radioDeCaida: 0.22,
  /**
   * **De dónde parece salir la curva, y en cuántos puntos deja de importar**
   * (vuelta 85).
   *
   * El problema: una curva que nace exactamente en el punto de vista **se
   * proyecta de punta**. En pantalla no es una curva, es un segmento vertical
   * de treinta píxeles bajo la cruz de la mira, porque está entera en el plano
   * que contiene la dirección de la vista. Se vio mirando una captura, que es
   * lo único que lo enseña.
   *
   * Lo que **no** se hizo, habiéndolo probado: sacar el **proyectil** de donde
   * estaría el arma. Con él desplazado 22 cm a la derecha, apuntar al centro de
   * un cuerpo a doce unidades **falla** —la cabeza mide 0.137 de radio (vuelta
   * 65), o sea la mitad del desplazamiento— y lo cazó `red85` con el rival a la
   * vista y la flecha pasando de largo. Un arma que no acierta donde apunta la
   * mira es un fallo mayor que un dibujo que arranca torcido.
   *
   * Y lo que **sí**: el proyectil sale del ojo, como el rayo de cualquier
   * disparo, y **la curva arranca en la boca del arma y converge a la de
   * verdad** en `convergeEn` puntos. Así el arranque se ve —sale de abajo a la
   * derecha, que es de donde saldría— y de ahí en adelante, incluido **el punto
   * de caída, que es lo que de verdad se apunta**, lo que se dibuja es la
   * trayectoria exacta. Es la regla del fogonazo de la vuelta 40 —mover el
   * dibujo, no la bala— con la mitad que allí no hizo falta: volver.
   */
  desdeArma: { lado: 0.26, abajo: 0.22, delante: 0.1 },
  convergeEn: 7,
  /**
   * **La luz que sube por el láser mientras se carga.** Es lo que convierte el
   * láser en un indicador de potencia sin añadir una barra al HUD: sube desde
   * el jugador hasta la punta, y llegar arriba **es** la señal de carga
   * completa. `colaPuntos` es lo largo que es el trazo encendido.
   */
  colaPuntos: 5,
}

/**
 * **El destello de un golpe de cuchillo** (vuelta 71). Lo dibuja
 * `src/game/slash.js`; aquí están los números.
 *
 * Existe por una decisión vieja: **Vektor no dibuja el arma en la mano**
 * (vuelta 38), así que un arma cuerpo a cuerpo se queda sin lo que en otros
 * juegos lo cuenta todo —la animación— y hay que decir con la pantalla que has
 * golpeado, qué golpe ha sido y si ha entrado por la espalda.
 */
export const MELEE_FX = {
  /** El arco del golpe flojo: fino, pequeño y corto. */
  grosorFinoPx: 2,
  diametroFinoPx: 210,
  duracionFinoMs: 170,
  /** El del fuerte: más grueso, más grande y un pelo más largo. */
  grosorFuertePx: 4,
  diametroFuertePx: 280,
  duracionFuerteMs: 230,
  /**
   * Cuánto gira el arco mientras pasa, en grados. Es lo que lo convierte en un
   * filo que barre en vez de en una luz que aparece: sin giro, los dos golpes
   * se distinguirían sólo por el grosor.
   */
  barridoDeg: 26,
}

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
/**
 * **Un escenario puede no venir de una clave** (vuelta 74).
 *
 * Hasta aquí un escenario *era* una entrada de `SCENARIOS`, y eso vale mientras
 * todos los mapas estén escritos en este fichero. Un mapa recién dibujado en el
 * editor no está en ningún catálogo todavía, así que quien monta un escenario
 * tiene que aceptar **la definición** igual que acepta su nombre.
 *
 * Son dos preguntas y por eso son dos funciones: *qué* mapa es y *cómo se
 * llama*. Lo segundo hace falta porque la bienvenida de una partida manda la
 * clave (`partida.js`) y el motor compara claves para no remontar el mundo sin
 * motivo.
 */
export function definicionDeEscenario(escenario) {
  if (escenario && typeof escenario === 'object') return escenario
  return SCENARIOS[escenario] ?? SCENARIOS.empty
}

/**
 * La clave de un escenario. Una definición suelta declara la suya (`clave`),
 * que es la misma que la del fichero del que sale: **el mapa dice cómo se
 * llama**, y no su nombre de fichero ni quien lo carga.
 */
export function claveDeEscenario(escenario) {
  if (escenario && typeof escenario === 'object') return escenario.clave ?? '(sin guardar)'
  return SCENARIOS[escenario] ? escenario : 'empty'
}

export function scenarioRoom(escenario) {
  const definition = definicionDeEscenario(escenario)
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
    /**
     * **Apertura del abanico de aparición al elegir este tipo**, en grados
     * totales (vuelta 78). Es el valor de fábrica de `SETTINGS.spawnConeDeg`, y
     * cambiar de tipo lo arrastra como ya arrastraba la distancia: un frente de
     * 36° y uno de 110° son dos ejercicios distintos, no el mismo con otro
     * número.
     */
    spawnConeDeg: 36,
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
    spawnConeDeg: 36,
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
    /**
     * Frente de 110°: bastante más que los 36 de Clásica y Cono, y por encima
     * del encuadre horizontal a propósito — en el modo de muñecos alguno puede
     * nacer justo fuera del cuadro, que es parte de lo que se entrena aquí.
     */
    spawnConeDeg: 110,
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
 *   Un array vacío significa sin retroceso.
 * - `recoilLoopFrom`: **desde qué paso se repite el patrón cuando se acaba**
 *   (vuelta 61). El patrón describe la **subida**, que es de una vez; la cola
 *   describe el **vaivén**, que no se acaba nunca. Agotado el patrón se vuelve
 *   a este índice y se recorre la cola en bucle hasta que se suelte el gatillo.
 *
 *   Hasta la vuelta 60 el retroceso **se paraba** al agotarse el patrón, y eso
 *   convertía media ráfaga en un láser: la Rift tiene 15 pasos y un cargador de
 *   30, así que **quince disparos salían sin retroceso ninguno** y clavados en
 *   el mismo punto. Se veía exactamente como lo que parecía —«el arma se
 *   autocontrola sobre el disparo 17»— y no había ninguna recuperación por
 *   medio: simplemente se acababa la animación.
 *
 *   Sin declararlo, la cola es **el último paso**, así que un arma nueva nunca
 *   se queda quieta aunque se olvide poner el número.
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
    /**
     * La subida son los diez primeros pasos; de aquí en adelante la Rift ya no
     * sube, **deriva**. Repetir esos cinco da ~0.08° de pitch y ~0.30° de yaw
     * por disparo mientras se mantenga el gatillo: una deriva a la izquierda
     * que se contrarresta con el ratón y que **nunca se detiene**. Punto de
     * partida; se calibra jugando.
     */
    recoilLoopFrom: 10,
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
    /**
     * La Volt no deriva: **zigzaguea**, y su cola son los cuatro últimos pasos,
     * que ya alternan el signo del yaw. En bucle eso es un vaivén de ±0.2°
     * alrededor del punto al que haya subido, con el pitch casi a cero — que es
     * su carácter: sube poco y no se está quieta. Punto de partida.
     */
    recoilLoopFrom: 11,
  },
  /**
   * **La Scout: el primer rifle de francotirador** (vuelta 70).
   *
   * Es la primera arma que necesita dos cosas que el arsenal no tenía: **daño
   * propio** —una bala al cuerpo mata a quien no lleve chaleco— y una **mirilla
   * ampliada**. Las dos están declaradas aquí abajo y las dos son datos del
   * arma, no ramas en quien dispara.
   */
  'scout': {
    label: 'Scout',
    character: 'francotirador',
    slot: 'primary',
    /**
     * De cerrojo: un disparo por clic. `semi` es exactamente eso — lo que
     * separa un cerrojo de una pistola aquí es la cadencia, no el modo.
     */
    mode: 'semi',
    /** 48 RPM = 1250 ms entre disparos. Fallar cuesta un segundo y cuarto. */
    rpm: 48,
    magazine: 10,
    reloadMs: 2600,
    /**
     * **Sin silenciador, y por eso el clic derecho es suyo para otra cosa.** No
     * hay `ghost-scout.png` y no tiene que haberlo: el trazado de siluetas
     * deriva las variantes de este mismo campo.
     */
    supportsSuppressor: false,
    /** Un arma de un disparo se juzga contra acertar: el listón sube. */
    precisionTarget: 0.75,
    /**
     * Lo que se come el chaleco. Más bajo que el de la Volt a propósito: un
     * chaleco tiene que **cambiar el número de balas** que hacen falta, no
     * volverlas inofensivas — con 0.45 son dos al cuerpo con chaleco y una sin
     * él, que es exactamente lo que se pidió.
     */
    shieldAbsorb: 0.45,
    /**
     * **Un fusil de francotirador ligero.** 3.2 kg → 5.98 u/s, entre la Volt
     * (6.14) y la Rift (5.88): es un arma de mapa abierto, y un sniper que no
     * se puede mover no reposiciona.
     */
    weight: 3.2,
    /**
     * **El daño propio del arma** (vuelta 70). El modelo de zonas sigue
     * diciendo la **forma** del daño —cabeza 100, torso 50, piernas 34— y esto
     * dice cuánto vale una bala de ésta: 50 × 2.2 = **110 al torso**, que es
     * más de una vida.
     *
     * **No toca la cabeza**, por la misma razón que `ENEMY.bodyDamageScale` no
     * la toca: la cabeza vale 100 de 100 y de ahí cuelga la regla del casco.
     * Escalarla convertiría el casco en papel con unas armas y en muro con
     * otras.
     *
     * Con chaleco (50 de escudo) y 0.45 de absorción: la primera bala deja 60
     * de daño a la vida y la segunda mata. Sin chaleco, la primera ya mata. A
     * las piernas (34 × 2.2 = 74.8) hacen falta dos sin chaleco y tres con él.
     * Las otras tres armas no declaran este campo y valen 1, así que **nada de
     * lo calibrado hasta hoy se mueve**.
     */
    damageScale: 2.2,
    /**
     * **La mirilla.** Que exista y a qué encuadre lleva es del arma; cómo se
     * dibuja y cuánto tarda, de `SCOPE`. Un arma sin este bloque no tiene
     * mirilla y su clic derecho sigue siendo el supresor.
     *
     * 22° contra los 71 de serie es **3.2 aumentos**. El número sale de lo que
     * hace falta para que valga la pena: a 40 u —el largo de un mapa— un cuerpo
     * ocupa 12 px de alto sin mirilla y 39 con ella.
     */
    scope: { fov: 22 },
    /**
     * **Una patada sola y grande**, no un patrón que se aprende: un cerrojo no
     * tiene ráfaga que controlar. Sube 2.4° de golpe y el resto del patrón es la
     * caída, que no se llega a ver porque entre disparo y disparo pasan 1250 ms
     * y el retroceso se reinicia solo a los `RECOIL_RESET_MS`.
     */
    recoil: [
      [2.4, 0.18],
      [2.2, -0.16],
      [2.0, 0.14],
    ],
    /**
     * La cola es su último paso, que es lo que toca cuando el patrón no
     * describe una ráfaga: si alguien consigue encadenar dos disparos dentro de
     * la ventana, el segundo empuja como el primero.
     */
    recoilLoopFrom: 2,
  },
  /**
   * **Bow: el arco** (vuelta 85). La primera arma de Vektor con **proyectil de
   * verdad**, y por eso su bloque propio es `tiro` y no `melee` ni `scope`:
   * lo que convierte un arma en arma de proyectil es tenerlo, igual que lo que
   * convierte un arma en cuerpo a cuerpo es tener `melee` (vuelta 71). El
   * motor mira el dato, no el nombre.
   *
   * **Se dispara por carga**: se mantiene el gatillo y se suelta. Y las dos
   * decisiones que había que tomar están tomadas así:
   *
   * **Apuntar es la dirección y cargar es la velocidad de salida.** Las dos
   * cosas hacen la misma parábola y ninguna es un modificador de la otra:
   * mirando más arriba la flecha llega más lejos (hasta los 45°, que es lo que
   * dice la física y no una regla), y cargando más se estira y se aplana. Se
   * eligió así porque es lo único que deja que **el láser no mienta**: si la
   * carga cambiara el daño y no la curva, el dibujo sería el mismo para un tiro
   * flojo y uno fuerte, y entonces lo que enseña no sería lo que va a pasar.
   * El daño sube con la carga **porque sube la velocidad**, que es lo que
   * pasaría de verdad.
   *
   * **Y sí hay techo de carga** (`cargaMs`). Sin él no habría forma de saber
   * cuándo se ha terminado de tensar, y mantener el botón un segundo de más
   * sería una ventaja sin coste. Con techo, llenarse **es** una señal: la luz
   * que sube por el láser llega a la punta y ahí se queda, y el destello de
   * salida a carga máxima confirma lo que ya se había visto.
   */
  'bow': {
    label: 'Bow',
    character: 'arco',
    slot: 'primary',
    /**
     * **El cuarto modo.** `auto` suelta mientras se aprieta, `semi` uno por
     * clic, `melee` es el cuchillo, y `carga` es éste: **el disparo ocurre al
     * soltar**. No es `semi` con un adorno — en `semi` la pulsación *es* el
     * disparo, y aquí la pulsación es el principio de otra cosa.
     */
    mode: 'carga',
    /**
     * 55 «RPM» = 1090 ms entre flechas, y eso **no es la carga**: es lo que
     * cuesta encajar la siguiente. Cargar del todo son 750, así que un tiro a
     * tope sale cada 1.1 s y uno instantáneo también — el arco no premia
     * disparar flojo y rápido, que es lo que lo convertiría en una pistola.
     */
    rpm: 55,
    /** Un carcaj, no un cargador. Y sacar doce flechas cuesta lo suyo. */
    magazine: 12,
    reloadMs: 2200,
    /**
     * **No admite silenciador, y no por falta de arte.** Un arco ya es el arma
     * silenciosa: ponerle un tubo sería quitarle lo que es. Eso además le deja
     * el clic derecho libre, como a la Scout.
     */
    supportsSuppressor: false,
    /** Acertar con una parábola y tiempo de vuelo es otra cosa: el listón baja. */
    precisionTarget: 0.45,
    /** Un chaleco contra una flecha: la mitad larga. */
    shieldAbsorb: 0.4,
    /**
     * 2.8 kg → 6.03 u/s. Entre la Volt y la Scout: es un arma de moverse y
     * buscar el ángulo, no de aguantar un pasillo.
     */
    weight: 2.8,
    /**
     * El empuje de la cámara al soltar la cuerda. Pequeño y hacia arriba: lo
     * que sacude un arco es la cuerda, no una explosión.
     */
    recoil: [
      [0.7, 0.1],
      [0.6, -0.08],
    ],
    recoilLoopFrom: 1,
    /**
     * **Lo que hace el arco.** Que exista este bloque es lo que dice que esta
     * arma lanza algo en vez de resolver un rayo.
     */
    tiro: {
      /** El proyectil que sale, como clase: lo que decide qué se dibuja y qué suena. */
      proyectil: 'flecha',
      /**
       * **Cuánto se tarda en tensar del todo**, en ms de **mundo**. Un arco
       * real se tensa rápido; 750 ms es lo que hace falta para que la decisión
       * de soltar ya o esperar sea una decisión, y no tanto como para que
       * cargar sea comprometerse a morir.
       */
      cargaMs: 750,
      /**
       * **La velocidad de salida, de vacío a lleno.** Los dos números salen de
       * una cuenta con la gravedad de abajo, disparando **horizontal** desde la
       * altura de ojos (1.7): sin cargar, la flecha recorre **15.2 u** antes de
       * tocar el suelo; cargada del todo, **30.3 u**, que es cruzar el Plano A
       * de punta a punta. O sea: el tiro rápido es de cerca y el cargado es de
       * mapa entero, sin que haya que escribir esa regla en ninguna parte.
       */
      vMin: 26,
      vMax: 52,
      /**
       * **La gravedad de la flecha, y la declara el arma** (ver `PROJECTILES`).
       * Es un tercio de la del jugador a propósito: con los 30 de `MOVEMENT` la
       * curva es un desplome y el arco se convierte en un arma de tres metros;
       * con 10 la caída se ve, se aprende y se compensa mirando más arriba, que
       * es lo que tiene que ser una curva.
       */
      gravedad: 10,
      /**
       * **Lo que vale una flecha al torso**, de vacío a lleno. 45 es lo que se
       * pidió para el tiro instantáneo —dos y media para una vida— y 110 es lo
       * mismo que la Scout: **mata de un tiro a quien no lleve chaleco**, dos
       * con él. Que el máximo iguale al rifle de francotirador no es casualidad:
       * son las dos armas que matan de una, y la diferencia es que a ésta hay
       * que cargarla y adelantar a un blanco que se mueve.
       *
       * A la **cabeza** mata siempre, cargada o no, y eso sale solo: la cabeza
       * vale 100 de 100 y **lo que ya vale una vida entera no se escala**
       * (vuelta 70). Con casco hacen falta dos, que es la regla de siempre.
       */
      danoMin: 45,
      danoMax: 110,
    },
  },
  /**
   * **U2: el lanzacohetes** (vuelta 86). El nombre en clave con el que llegó
   * el encargo era «yo muero, pero tú también», y eso **no es una frase: es la
   * mecánica**. Un cohete tarda en llegar, así que quien lo lanza puede caer
   * por otro disparo mientras el suyo sigue volando — y matar igual. Por eso
   * el pool de proyectiles cuelga del mundo y no del jugador (vuelta 85): una
   * baja no apaga lo que ya salió.
   *
   * Dos cosas lo separan del arco, y las dos son suyas:
   *
   * **Explota en un área** (`explosion`), no en un punto. La caída es la misma
   * que usarán las granadas (`caidaDeArea`, en `proyectiles.js`): lineal, con
   * un núcleo donde vale entero — que es lo que hace que el impacto directo
   * mate y rozar no.
   *
   * **Y tiene reserva**, que es lo primero del juego que la tiene. Hasta aquí
   * todas las armas recargaban infinito porque `magazine` era la única cuenta;
   * aquí hay **un cohete en el tubo y una reserva de cuatro como mucho**, y de
   * ahí sale la decisión que el arma pide: lanzar ahora o guardárselo.
   */
  'u2': {
    label: 'U2',
    character: 'lanzacohetes',
    slot: 'primary',
    /**
     * **Semi, no carga.** Un cohete sale con la fuerza que tiene el motor: no
     * hay nada que tensar, y cargar aquí sería un gesto sin significado. Lo que
     * decide dónde cae es **apuntar**, y para eso está el láser.
     */
    mode: 'semi',
    /** 40 «RPM» = 1500 ms. No es la cadencia: es que sólo hay uno en el tubo. */
    rpm: 40,
    /** **Uno en el tubo.** La recarga es sacar otro de la espalda. */
    magazine: 1,
    reloadMs: 2000,
    supportsSuppressor: false,
    /** Con dos cohetes y un área de cinco unidades, el listón es acertar. */
    precisionTarget: 0.5,
    /**
     * **Un chaleco no para una onda expansiva**, y por eso es cero y no un
     * número pequeño (vuelta 86). Con 0.25 el chaleco se comía 30 de los 120
     * del núcleo y **el impacto directo dejaba vivo con 10** — medido en
     * `u286`, y eso contradice lo único que el arma promete: que dar de pleno
     * mata. Un chaleco es una placa delante del pecho: para lo que llega por
     * delante en línea recta, y una explosión no llega por delante, llega de
     * todas partes a la vez.
     *
     * Y lo que se paga está medido y es justo: a media distancia la onda quita
     * 79, o sea **cuatro quintos de una vida y ni una más**. Que ignore el
     * chaleco no la hace matar más lejos, la hace matar **donde ya mataba**.
     */
    shieldAbsorb: 0,
    /** 5.4 kg → 5.53 u/s, la más lenta del arsenal. Un tubo pesa. */
    weight: 5.4,
    /** Una patada grande y hacia arriba, como la Scout pero más. */
    recoil: [
      [3.2, 0.4],
      [2.6, -0.3],
    ],
    recoilLoopFrom: 1,
    tiro: {
      proyectil: 'cohete',
      /**
       * **Sin carga**, y por eso las dos velocidades son la misma: `mode` ya
       * dice que se dispara al pulsar, pero estos dos números los lee
       * `lanzamientoDeArma`, que es la misma función para todas las armas de
       * proyectil. Iguales quiere decir «la carga no hace nada aquí».
       */
      vMin: 34,
      vMax: 34,
      /**
       * **Un cohete cae poco**, que es lo que lo distingue de una flecha: tiene
       * motor. 3.5 contra los 10 del arco son 35 u de alcance en tiro plano
       * —casi el Plano A entero— con una curva que se ve pero que no obliga a
       * apuntar al cielo.
       */
      gravedad: 3.5,
      /**
       * **El impacto directo**, aparte del área. 100 al torso es una vida
       * entera: lo que se pidió es que dar de pleno mate, y esto es la mitad —
       * la otra es el núcleo de la explosión, que suma.
       */
      danoMin: 100,
      danoMax: 100,
      /**
       * **Y lo que revienta alrededor** (vuelta 86). `radioU` es hasta dónde
       * llega algo, `nucleoU` el trozo central donde llega **entero** y `dano`
       * lo que vale ahí.
       *
       * Los tres números salen de una cuenta, no del gusto: con 120 en el
       * núcleo, **pillar de pleno mata aunque lleves chaleco y casco**, que es
       * lo que se pidió; a mitad de radio quedan 60, o sea media vida, y en el
       * borde cero. Y 5 u de radio es poco más que el ancho de un pasillo del
       * Plano A: una explosión que cubriera un cuarto del mapa no sería un arma,
       * sería un impuesto.
       *
       * **El dueño no está exento**, y eso es la mitad del nombre en clave: si
       * lo tiras a tus pies, te llevas la onda entera. `propio` es cuánto de
       * ella te toca — 0.7 y no 1, porque un lanzacohetes que se suicida al
       * primer despiste es un arma que nadie saca.
       */
      explosion: { radioU: 5, nucleoU: 1.2, dano: 120, propio: 0.7 },
      /**
       * **La reserva, y cómo se gana** (vuelta 86). Es lo primero del juego que
       * tiene munición contada: hasta aquí toda arma recargaba infinito.
       *
       * Se compra con `inicial` (2) y el tope es `maxima` (4). Lo que abre los
       * otros dos es **un cohete que mata**: cada uno que consiga al menos una
       * baja repone uno, con tope. Dicho así cumple lo que se pidió sin una
       * regla más —hacen falta **dos cohetes con baja**, porque cada uno repone
       * como mucho uno, así que matar a dos de un solo cohete sigue valiendo
       * uno—.
       *
       * Y **se reinicia al empezar una ronda y al morir con él equipado**: lo
       * que se gana matando no se acumula entre vidas.
       */
      reserva: { inicial: 2, maxima: 4, porBaja: 1 },
    },
  },
  /**
   * **Vanta: el cuchillo** (vuelta 71). La tercera ranura, la que llevaba
   * reservada desde la vuelta 27 con su tecla (**3**) y sin lógica detrás.
   *
   * Dos ataques y ninguna tabla de combos: **clic izquierdo flojo, clic derecho
   * fuerte**, y los dos restan de la misma vida. Que «dos fuertes matan» y
   * «cuatro flojos matan» no son dos reglas, son 55 y 25 contra 100 — y un
   * flojo más un fuerte suman solos, sin que nadie tenga que escribir esa
   * combinación en ninguna parte.
   *
   * La puñalada por la espalda **no es más daño: es muerte**, pase lo que pase
   * y lleve lo que lleve. Por eso vive en `encajarImpacto` como un caso propio
   * y no como un número grande: un número grande lo pararía un chaleco.
   */
  'vanta': {
    label: 'Vanta',
    character: 'cuchillo',
    slot: 'melee',
    mode: 'melee',
    /**
     * Un cuchillo no tiene cargador ni recarga, y aquí van en cero **dichos**
     * en vez de ausentes: el HUD y la armería preguntan por estos campos, y un
     * `undefined` se dibuja como un hueco que parece un fallo. Cero es un dato.
     */
    magazine: 0,
    reloadMs: 0,
    supportsSuppressor: false,
    precisionTarget: 0.9,
    /** Un chaleco para un cuchillo es lo que es: la mitad. */
    shieldAbsorb: 0.5,
    /** 600 g: por debajo del peso gratis, así que con el cuchillo se corre. */
    weight: 0.6,
    /**
     * El retroceso de un arma de fuego no se le aplica a un cuchillo: lo que
     * empuja la cámara es el golpe, y eso lo declara cada ataque en su `kick`.
     */
    recoil: [],
    recoilLoopFrom: 0,
    /**
     * **Lo que hace el cuchillo.** Que exista este bloque es lo que convierte a
     * un arma en cuerpo a cuerpo: el motor no mira la ranura ni el nombre.
     */
    melee: {
      /**
       * Alcance, en unidades. 1.6 es poco más que un brazo —el cuerpo mide 0.29
       * de ancho y el jugador 1.8 de alto—: hay que llegar, y llegar es el
       * riesgo que se paga por lo que vale acertar.
       */
      rangeU: 1.6,
      /**
       * **El arco de espalda**, en grados y centrado en la nuca. 120° es lo que
       * un jugador llamaría «por detrás»: no vale de costado, y no hace falta
       * estar clavado en el eje. Se mide contra el rumbo **rebobinado** de la
       * víctima, que es hacia dónde miraba cuando le dieron.
       */
      backArcDeg: 120,
      /**
       * Flojo: 25 contra 100 de vida son cuatro, y con chaleco seis. Rápido
       * —150 «RPM», o sea uno cada 400 ms— porque es el que se encadena.
       */
      luz: { dano: 25, rpm: 150, kick: [0.5, -0.7] },
      /**
       * Fuerte: 55, o sea dos. A la mitad de ritmo que el flojo (uno cada 857
       * ms), que es lo que impide que el fuerte sea simplemente el bueno: se
       * falla y se ha perdido casi un segundo.
       */
      fuerte: { dano: 55, rpm: 70, kick: [1.4, 1.1] },
    },
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
/**
 * **La física de un mapa** (vuelta 72), con `MOVEMENT` como valor por defecto.
 *
 * Hasta aquí la gravedad, el impulso del salto y el techo del aire eran del
 * juego. Con un mapa pensado para volar —gravedad baja y air-strafe, al estilo
 * de los mapas de francotirador de Counter-Strike— pasan a ser **del mapa**, y
 * `MOVEMENT` pasa a ser lo que vale si el mapa no dice otra cosa.
 *
 * **Sale del escenario y no de un ajuste ni de un modo**, y eso es lo que la
 * hace segura en red: los dos extremos montan el mismo mapa —lo dice la sala— y
 * derivan los mismos números sin que viaje ninguno. Un campo de física en el
 * protocolo sería una física que se puede mentir.
 *
 * Y son **tres números y no cuatro**: el modelo del aire (`airVector`), la
 * aceleración aérea y el resto del movimiento siguen siendo del juego. Lo que
 * un mapa puede cambiar es cuánto pesas, cuánto saltas y hasta dónde puedes
 * acelerar en el aire; cómo se acelera, no.
 */
export function fisicaDeEscenario(escenario) {
  const propia = (escenario && definicionDeEscenario(escenario)?.fisica) || null
  return {
    gravity: propia?.gravity ?? MOVEMENT.gravity,
    jumpSpeed: propia?.jumpSpeed ?? MOVEMENT.jumpSpeed,
    airStrafeMaxSpeed: propia?.airStrafeMaxSpeed ?? MOVEMENT.airStrafeMaxSpeed,
  }
}

export const PRIMARY_WEAPONS = Object.fromEntries(
  Object.entries(WEAPONS).filter(([, weapon]) => weapon.slot === 'primary'),
)

/**
 * **El catálogo en orden, para que un arma quepa en un número** (vuelta 56).
 *
 * Cada entrada de red lleva el arma que se empuña —de ella salen la velocidad
 * que frena el peso y la cadencia que el servidor exige— y mandar la clave en
 * texto son diez bytes sesenta veces por segundo para decir lo mismo que un
 * índice. Lo que hace que el índice sea seguro es que **sale del catálogo**,
 * que es un módulo compartido por los dos extremos: no hay una segunda lista
 * que pueda quedarse a medias. Añadir un arma al final no mueve las demás; si
 * algún día se reordena, se reordena para los dos a la vez.
 */
export const WEAPON_ORDER = Object.keys(WEAPONS)

/** La pistola, la única de su ranura. */
export const SECONDARY_WEAPON = Object.keys(WEAPONS).find(
  (key) => WEAPONS[key].slot === 'secondary',
)

/**
 * **El cuerpo a cuerpo, la única de su ranura** (vuelta 71). Se deriva igual
 * que la pistola y por la misma razón: no hay una segunda lista que pueda
 * quedarse a medias, y el día que haya dos cuchillos esto será la lista de
 * ellos y no una constante que alguien se olvide de tocar.
 */
export const MELEE_WEAPON = Object.keys(WEAPONS).find(
  (key) => WEAPONS[key].slot === 'melee',
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
  // cada una su ranura. **Y la 3 en la 71**, con el cuchillo: llevaba cuarenta
  // vueltas siendo sólo tecla, que es exactamente para lo que se reservó —el
  // mapa de controles tiene que ser el definitivo desde el principio, o cuando
  // llegue la mecánica alguien ya habrá puesto ahí su bind favorito—.
  primary: { label: 'Arma principal', default: 'Digit1', group: 'Equipo' },
  secondary: { label: 'Pistola', default: 'Digit2', group: 'Equipo' },
  melee: { label: 'Cuerpo a cuerpo', default: 'Digit3', group: 'Equipo' },
  // El escudo tampoco está reservado: aplica una carga del inventario (ver
  // `PLAYER.shield`). El artilugio y el arrojadizo siguen siendo sólo tecla.
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

  /**
   * **El hielo: lo único del juego que le da velocidad al suelo** (vuelta 83).
   *
   * Y por eso estaba en el cajón de «vuelta propia» del triaje de la 79: a pie
   * en Vektor **no hay velocidad**. Un paso es `posición + dirección × marcha ×
   * dt`, así que soltar W para al jugador en ese mismo paso y «resbaladizo» no
   * es bajar un rozamiento que no existe — es estrenar un modelo.
   *
   * Lo que lo hace asumible es que el modelo nuevo está **apagado por
   * construcción**: mientras no haya hielo debajo y la velocidad de suelo valga
   * cero, `_gobiernaElHielo` se sale en la primera línea y el paso lo resuelve
   * el camino de siempre. Medido: el mismo paseo por un mapa sin hielo acaba en
   * la misma coordenada hasta el último decimal.
   *
   * **Y es una integración, como el modelo vectorial del aire** (vuelta 32): no
   * tiene forma cerrada porque la entrada son las teclas, paso a paso. Lo que
   * la hace segura es lo mismo que allí — el mundo va a 60 Hz fijos desde la
   * vuelta 44, así que los dos extremos de una partida dan los mismos pasos con
   * las mismas máscaras. La dispersión entre refrescos está medida en
   * `vent83`/`hielo83` y se anota, no se esconde.
   */
  hielo: {
    /**
     * Cuánto manda la tecla, en u/s². Bajo a propósito: lo que distingue el
     * hielo es que **lo que pides tarda en pasar**, no que vayas más despacio.
     */
    aceleracion: 9,
    /**
     * Lo que frena el suelo normal cuando sales del hielo con marcha. Alto: un
     * derrape de un par de décimas y se recupera el control. Sin esto, salir
     * del hielo sería seguir resbalando por el resto del mapa.
     */
    frenadoFuera: 26,
    /**
     * Techo de la marcha en hielo, como fracción de tu carrera. Por encima de
     * 1 a propósito —coger carrerilla en una pista es la gracia— y con techo,
     * por lo mismo que el air-strafe lo tiene.
     */
    factorMarchaMax: 1.35,
    /** Por debajo de esto la velocidad se pone a cero exacto. Ver el porqué en
     * `_gobiernaElHielo`: es lo que devuelve el paso al camino de siempre. */
    umbralParada: 0.05,
    /** Cada cuánto suena el raspado mientras se resbala de verdad. */
    pulsoMs: 300,
    /** Y a partir de qué marcha suena, en fracción de la carrera. */
    umbralSonido: 0.45,
  },

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
   * **Cuánto vive una pulsación de salto sin suelo debajo**, en milisegundos.
   *
   * El salto se dispara por **flanco**, no por tecla apretada: lo que despega
   * es una pulsación, y una pulsación se gasta una sola vez. De ahí sale sola
   * la mitad del problema que esto viene a arreglar —dejar SPACE apoyada ya no
   * rebota— y de ahí sale también que haga falta este número: pulsando un pelo
   * antes de tocar el suelo, el flanco cae en el aire y sin memoria se perdería.
   *
   * Es la mitad «antes» de `chainJumpWindowMs` **más la holgura de dos pasos**,
   * y los dos sumandos son de verdad: la pulsación tiene que seguir viva en el
   * paso que puede actuar sobre ella, y entre el instante exacto del aterrizaje
   * —que se despeja de la parábola— y ese paso caben el paso que lo detecta y
   * el siguiente. A 60 Hz son 2 × 16.67 = 33.3 ms; 130 + 33.3 = 163.3,
   * redondeado a 170.
   *
   * Por debajo de esa suma la mitad «antes» de la ventana de encadenado **se
   * recorta, y se recorta más cuanto menos refresco haya**, que es justo la
   * clase de cosa que aquí no se documenta: se arregla. Si subes
   * `chainJumpWindowMs` o bajas `SIM.hz`, rehaz la cuenta.
   */
  jumpBufferMs: 170,

  /**
   * **Gracia de borde** (*coyote time*): milisegundos que se sigue pudiendo
   * saltar después de salirse de una superficie andando, sin haber saltado.
   *
   * Sin esto, salirse de un cajón estrecho es quedarse sin salto: el paso en
   * que los pies dejan el borde marca `airborne` y la pulsación que llega
   * después —aunque sea un frame después— no encuentra suelo. Se notaba como
   * input con retraso, y no lo era: el salto llegaba a tiempo y el suelo ya no
   * estaba.
   *
   * El número no es de gusto: en 110 ms de caída libre se baja
   * ½·30·0.11² = **0.18 u**, por debajo de `COVER.stepHeight` (0.25), o sea que
   * la gracia se acaba antes de que el jugador haya bajado lo que sube de un
   * escalón — no se puede saltar desde un sitio donde ya se ve que no estás.
   * El techo de esa cuenta es `sqrt(2·stepHeight/gravity)` = 129 ms. Si tocas
   * `gravity` o `stepHeight`, vuelve a hacerla.
   */
  coyoteMs: 110,

  /**
   * **Deslizamiento** (*slide*, vuelta 69). Correr y pulsar la tecla de
   * agacharse tira al jugador al suelo conservando —y de entrada mejorando— la
   * marcha; se sale soltando la tecla, agotado el tiempo, o saltando.
   *
   * El diseño entero, con sus tres riesgos y el porqué de cada número, está en
   * `docs/propuestas/04-deslizamiento.md`.
   *
   * **`enabled` es la ventana hacia atrás, y no es un ajuste del jugador**: no
   * sale en el panel, igual que `airVector`. A `false`, `_updateSlide` es un
   * `return` en la primera línea y no hay ningún otro sitio del juego que
   * pregunte por el deslizamiento — medido: el mismo paseo por el Plano A acaba
   * en la misma coordenada hasta el último decimal que antes de escribirlo.
   */
  slide: {
    enabled: true,

    /**
     * El empujón de entrada, en múltiplos de **tu** carrera (la de tu arma).
     * 1.45 × 6.50 = **9.43 u/s**, justo por debajo del techo del aire (9.5):
     * deslizarse es ir tan rápido como un air-strafe perfecto, pero en línea
     * recta y pegado al suelo. Anclarlo ahí deja el techo de velocidad del
     * juego en un solo número, así que no hay que recalibrar nada de lo que
     * cuelga de él —las pisadas, la dispersión por velocidad, el silbido—.
     */
    boostFactor: 1.45,

    /**
     * Lo que dura, en ms. La velocidad **no se integra**: es una recta cerrada
     * en `_slideTime` que va del empujón a la marcha de agachado, así que la
     * desaceleración sale de despejarla —(9.43 − 2.60) / 0.7 = 9.76 u/s²— y no
     * de teclear un número. Lo que avanza es el área bajo esa recta: **4.2 u**,
     * dos cuerpos y medio, o sea cruzar un vano y no cruzar el mapa.
     */
    durationMs: 700,

    /**
     * **Hay que venir corriendo**, y se mide contra **tu** carrera para que el
     * peso del arma no decida quién puede deslizarse: con 0.9, andar (4.2 de
     * 6.5, o sea 0.65) no entra y correr (1.0) sí, lleves la pistola o la Rift.
     * Es la misma forma que el umbral de las pisadas de la vuelta 63.
     *
     * Y se mide sobre la marcha que tendrías **sin** la tecla de agachado: en
     * el paso del flanco esa tecla ya está pulsada, así que preguntar por la
     * marcha vigente diría «2.6» siempre y no se podría entrar nunca.
     */
    minSpeedFactor: 0.9,

    /**
     * Enfriamiento entre deslizamientos, desde que acaba uno. Sin él,
     * encadenarlos es un segundo modelo de movimiento en el que correr no se
     * usa nunca.
     */
    cooldownMs: 1200,

    /**
     * **Saltar desde un deslizamiento no se lleva su marcha**, y es la regla que
     * protege lo que ya existe: la marcha se congela al despegar, así que
     * despegar a 9.43 es volar a 9.43 y el air-strafe puede rematar hasta 9.5
     * —lo que hoy cuesta tres encadenados bien hechos—. El vuelo se siembra con
     * tu carrera. El interruptor está para poder probar lo contrario jugando;
     * el valor de fábrica es el que no regala el techo del aire.
     */
    keepSpeedOnJump: false,
  },

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

  /**
   * Semiángulo del cono frente a la cámara. **Deriva del tipo de diana y no al
   * revés** (vuelta 78): la apertura que se ve y se toca es la total, y vive en
   * `TARGET_TYPES[x].spawnConeDeg` porque cada tipo tiene la suya. Esto se
   * queda como el valor con el que nace el pool antes de que lleguen ajustes.
   */
  coneHalfAngleDeg: TARGET_TYPES.classic.spawnConeDeg / 2,
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
  /**
   * **La sensibilidad con la mirilla puesta**, independiente de la normal
   * (vuelta 70). No es un multiplicador de la otra ni sale de los aumentos: es
   * un número propio, porque apuntar con mirilla es un gesto distinto —el
   * jugador quiere poder ir más fino sin tocar su sensibilidad de siempre— y
   * derivarlo de los aumentos le quitaría esa decisión.
   *
   * De fábrica la misma que la normal, así que quien no la toque no nota nada
   * nuevo salvo el encuadre.
   */
  scopeSensitivity: {
    label: 'Sensibilidad con mirilla',
    default: LOOK.sensitivity,
    min: 0.1,
    max: 6,
    step: 0.01,
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
  /**
   * **Cuánto dura la sesión**, en el modo que sea (vuelta 78). El catálogo es
   * `SESSION_DURATIONS` y el valor de fábrica, `mode`, es «la que trae el
   * modo»: los 30 s de `SESSION_DURATION_S` jugando ahora y sin límite en
   * Deathmatch. La ronda con explosivo la sigue midiendo la bomba.
   */
  sessionDuration: {
    label: 'Duración de la sesión',
    default: 'mode',
  },
  /**
   * **La apertura del abanico de aparición, en grados totales** (vuelta 78).
   *
   * Sale al panel porque es lo que decide cuánto hay que girar entre diana y
   * diana en la sala vacía, o sea la diferencia entre entrenar el micro-ajuste
   * y entrenar el barrido — y hasta aquí era una constante. Tres cosas:
   *
   * - **Es la apertura total, no el semiángulo.** Lo que se lee en pantalla es
   *   el ancho del abanico; partirlo por dos es una cuenta que el jugador no
   *   tiene por qué hacer. `SPAWN.coneHalfAngleDeg` sigue siendo la mitad del
   *   valor de fábrica y de ahí sale.
   * - **El valor de fábrica es de cada tipo de diana**
   *   (`TARGET_TYPES[x].spawnConeDeg`) y cambiar de tipo lo arrastra, igual que
   *   la distancia desde siempre: el hitbox nació con un frente de 110° y la
   *   Clásica con 36, y son dos ejercicios distintos.
   * - **Y no se puede cerrar del todo.** Con 0 las dianas saldrían todas en la
   *   misma recta, que no es un aim trainer: es un metrónomo. El mínimo deja un
   *   abanico estrecho pero abanico.
   *
   * Con escenario no se aplica, como la distancia: ahí las dianas salen en
   * puntos de ruta.
   */
  spawnConeDeg: {
    label: 'Ancho del cono de aparición',
    default: TARGET_TYPES.classic.spawnConeDeg,
    min: 6,
    /**
     * El tope es el abanico más ancho que el juego ya produce, que es el del
     * hitbox. Queda por encima del encuadre horizontal (~103° a 16:9 con
     * `CAMERA.fov`), y eso es deliberado desde que existe ese perfil: en el modo
     * de muñecos alguno puede nacer justo fuera del cuadro. El panel lo dice.
     */
    max: TARGET_TYPES.hitbox.spawnConeDeg,
    step: 1,
    decimals: 0,
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
    /**
     * **Las dos alturas de Los Pilares** (vuelta 72). No son cobertura: son
     * suelo. Y sus números salen de la física de ese mapa, no de gusto: con su
     * gravedad un salto sube 3.26 u, así que a la **torre** (3.2) se sube desde
     * el suelo —por los pelos, contando el escalón— y a la **atalaya** (6.0)
     * sólo desde una torre. Subir es una decisión y no un paseo.
     */
    torre: 3.2,
    atalaya: 6.0,
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
    // Siguen la rampa: más alto, más claro. La atalaya es lo más claro del
    // juego porque es lo más alto, que es lo que la codificación promete.
    torre: '#8E8E8E',
    atalaya: '#D2D2D2',
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
/**
 * **El gris de una pieza, y también el de una altura suelta** (vuelta 76).
 *
 * El tono no es decoración: **dice la altura**, y el jugador aprende a leerlo.
 * Mientras todas las piezas salían del vocabulario bastaba con mirar la tabla;
 * desde que el editor deja escribir una altura en números, una pieza de 2.4
 * caía en el `?? media` y salía del mismo gris que una de 1.9 — o sea el tono
 * mintiendo.
 *
 * Un número coge el gris de **la altura del vocabulario más cercana**, que
 * conserva lo que el tono promete: más alto, más claro. Una clave sigue
 * devolviendo exactamente el suyo, así que ningún mapa de hoy cambia un píxel.
 */
export function coverColor(kind) {
  if (typeof kind !== 'number') return COVER.colors[kind] ?? COVER.colors.media
  let mejor = 'media'
  let distancia = Infinity
  for (const [clave, alto] of Object.entries(COVER.heights)) {
    if (!COVER.colors[clave]) continue
    const d = Math.abs(alto - kind)
    if (d < distancia) { distancia = d; mejor = clave }
  }
  return COVER.colors[mejor]
}

export function coverEdgeColor(kind) {
  const hex = coverColor(kind)
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
/**
 * **La simetría de un mapa de duelo sale por construcción, no por revisión**
 * (vuelta 66). Un 1v1 sólo es justo si los dos ven exactamente lo mismo, y
 * escribir dos veces cada caja —una por mitad— es escribir la ocasión de que
 * una se quede a media unidad de su pareja. Lo que se declara es **media
 * sala**, y esto añade la otra girada media vuelta.
 *
 * Es **giro de 180°, no espejo**, y la diferencia importa: un espejo cambia
 * izquierda por derecha, así que a un jugador le queda la esquina estrecha a la
 * izquierda y al otro a la derecha, y eso es un mapa distinto para cada uno. Con
 * el giro, la vista de uno **es** la del otro.
 *
 * Una caja se lee como esquina mínima más ancho y fondo, así que girarla es
 * mandar su esquina máxima al otro lado del origen.
 *
 * Una pieza **centrada en el origen se declara aparte**, en `centro`: girarla
 * daría una copia encima de sí misma.
 */
export function giro180(piezas) {
  return [
    ...piezas,
    ...piezas.map((pieza) => ({
      ...pieza,
      x: -(pieza.x + pieza.w),
      z: -(pieza.z + pieza.d),
    })),
  ]
}

/**
 * **Las herramientas del editor** (vuelta 77), y son tuning como todo lo demás.
 *
 * Van juntas y aparte del juego a propósito: **ninguna de estas dos cosas
 * existe en una partida**. No salen en ningún panel del jugador, no se guardan
 * en sus ajustes y no viajan en `snapshot()` — las enciende el editor para
 * poder medir un mapa, que es otra cosa que jugarlo.
 */
export const EDITOR = {
  /** Lo que sube y baja el vuelo, en u/s. */
  vuelo: 9,
  /**
   * Lo que se espera entre dos muñecos plantados. No es la cadencia de un arma
   * —una herramienta no dispara— sino lo que hace que mantener el botón no
   * siembre sesenta muñecos por segundo.
   */
  plantarMs: 180,
}

/**
 * **Las superficies de un mapa** (vuelta 80).
 *
 * Una pieza puede declarar `superficie` y con eso dejar de ser sólo un sitio
 * donde apoyarse: `rebote` te lanza hacia arriba al pisarla y `velocidad` te
 * lanza en la dirección que declare. Y un mapa puede declarar
 * `teletransportes`, que son áreas con destino.
 *
 * Tres cosas que **son** el diseño, y ninguna es tuning:
 *
 * - **No viaja ningún número por la red.** Es el patrón de la física de la
 *   vuelta 72: los dos extremos montan el mismo mapa —lo dice la sala— y
 *   derivan lo mismo. Un campo de empuje en el protocolo sería un empuje que
 *   se puede mentir.
 * - **El impulso se resuelve con `_takeOff`, no con una rama nueva.** Lo que
 *   hace un rebote es despegar con otra velocidad vertical, así que la
 *   parábola sigue resuelta **en forma cerrada** y un rebote se comporta igual
 *   a 60 que a 240 Hz sin hacer nada — que es la propiedad que no se puede
 *   romper (vuelta 44).
 * - **Y una plataforma de velocidad respeta el techo del aire.** Saltárselo
 *   abriría un camino para pasar de `airStrafeMaxSpeed` sin air-strafe, que es
 *   la técnica del juego. Un mapa que quiera lanzar de verdad **sube su
 *   techo**, que es la palanca que la vuelta 72 ya dejó abierta.
 */
export const SURFACES = {
  /** Los tipos que el motor sabe resolver. Un `tipo` fuera de aquí se tira y se dice. */
  tipos: ['rebote', 'velocidad', 'hielo'],
  /**
   * **El tope de fuerza no es un límite de diseño** (vuelta 82). Era 40 y, peor
   * todavía, el lanzamiento se acotaba además al techo del aire —9.5 u/s de
   * fábrica, o sea **la marcha de correr**—, así que una plataforma de
   * velocidad apenas sacaba al jugador de su propia losa. Eso se quitó: quien
   * construye decide cuánto lanza, y pasarse y bajarlo es más barato que no
   * poder llegar.
   *
   * Lo que queda aquí es un tope **del formato**, como los de `SALA`: existe
   * para que un fichero corrupto no meta un número absurdo en el mundo, no para
   * decidir a qué se juega. El número sale de lo que la colisión sigue sabiendo
   * resolver — `resolveAxis` es un barrido que acota contra la cara más
   * cercana, así que a 300 u/s un paso de 60 Hz avanza 5 u y **se sigue
   * parando en la pared**, no la atraviesa.
   */
  fuerzaMax: 300,
  /**
   * Lo que sube una plataforma de velocidad además de empujar. No es
   * decoración: **a pie no hay velocidad** —un paso es posición más dirección
   * por marcha— así que un empuje horizontal sin despegue se evaporaría en el
   * paso siguiente. Despegar es lo que lo convierte en un lanzamiento.
   */
  saltoMin: 0.5,
  /**
   * Y el impulso vertical va con su propio tope, más bajo que el horizontal:
   * son dos cosas distintas. 60 u/s con la gravedad de fábrica son 60 u de
   * ápice, que ya es el triple del alto de la sala más alta.
   */
  saltoMax: 60,
  /** Valores de partida al ponerle una superficie a una pieza en el editor. */
  porDefecto: {
    rebote: { tipo: 'rebote', fuerza: 14 },
    velocidad: { tipo: 'velocidad', fuerza: 12, rumbo: 0, salto: 4 },
    /**
     * **El hielo** (vuelta 83). Aquí `fuerza` es **el rozamiento**, en u/s² de
     * frenada: cuanto más bajo, más resbala. Se reutiliza el campo que ya
     * existe en vez de inventar uno porque es literalmente lo mismo —cuánto
     * empuja la superficie— con el signo cambiado, y así el mismo deslizador
     * del editor vale para las tres.
     */
    hielo: { tipo: 'hielo', fuerza: 1.6 },
  },
  /**
   * **El alto de la marca que se pinta encima**, sobre la cara de la pieza. No
   * es geometría: fuera de `occluders` y fuera del presupuesto. Un dedo por
   * encima para que no pelee en z con la cara de la caja.
   */
  marcaY: 0.03,

  /**
   * **Cómo se dibuja cada dispositivo sobre su losa** (vuelta 82).
   *
   * Hasta aquí era **una** flecha de líneas en el centro de la pieza, y eso
   * falla por los dos extremos: en una losa de 4×4 se lee regular, y en una
   * losa del tamaño del suelo de un mapa —que es justo lo que la 82 abre— es
   * un garabato diminuto en medio de un descampado. Ahora la marca **se
   * repite por toda la cara**, así que un mapa entero de velocidad se ve como
   * un mapa entero de velocidad.
   *
   * Y va en **triángulos y no en líneas**: en WebGL el grosor de una línea no
   * se toca —`linewidth` se ignora, como ya se midió con el contorno de la
   * brújula en la vuelta 41—, así que «franja gruesa» sólo se puede dibujar
   * rellena. Sigue sin ser geometría del mapa: ningún rayo le pregunta nada.
   */
  marca: {
    /** Cada cuánto se repite el dibujo sobre la cara, en unidades. */
    paso: 2.6,
    /** Margen contra el borde de la losa: una franja a medio salir se lee mal. */
    margen: 0.35,
    /** Techo de repeticiones por pieza. Un mapa de 200×200 son 5.900 sin esto. */
    maxRepeticiones: 700,
    /** El galón de una plataforma de velocidad: largo, ancho y grosor de trazo. */
    galon: { largo: 0.62, ancho: 0.78, grosor: 0.3 },
    /** El muelle de un rebote: una hélice de líneas con su base rellena. */
    /**
     * El muelle. **Bajo a propósito**: a 1.5 u de alto —lo que se probó
     * primero— un muelle mide casi lo que un jugador y la losa se lee como un
     * bosque de alambres. Esto es un dibujo en el suelo que dice qué pisas, no
     * una pieza del mapa.
     */
    muelle: { vueltas: 2.5, lados: 9, radio: 0.4, altoMin: 0.3, altoMax: 0.85 },
    /** El cristal de una pista de hielo: una estrella de seis brazos, al ras. */
    cristal: { brazos: 6, radio: 0.44, grosor: 0.16 },
  },

  /**
   * **Hasta dónde se oye un dispositivo** (vuelta 82). Su propia curva, no la
   * de `SPATIAL` —que está calibrada para que un sonido cruce un mapa de 55 u—
   * y no la de una pisada, que se apaga a 16. Un rebote o una puerta es un
   * suceso del mundo que cuenta **dónde está pasando algo**: treinta unidades
   * es media sala grande, o sea lo bastante lejos para que te avise de que
   * alguien acaba de cruzar por la otra punta y lo bastante cerca para que un
   * mapa de sólo rebotes no sea un zumbido continuo.
   *
   * Y va en emisor **propio**: colgarlo del emisor del rival le pondría el
   * radio de 16 u de las pisadas, que es el aviso escrito en `CLAUDE.md` desde
   * la vuelta 63.
   */
  audio: { fullDistanceU: 4, maxDistanceU: 30 },

  /**
   * **El destello de usar un dispositivo** (vuelta 82). Lo dibuja
   * `src/game/dispositivos.js`; esto es lo que dura y lo que mide.
   */
  destello: {
    /** Cuántos anillos caben a la vez. Cada uno es una instancia, no una malla. */
    pool: 16,
    duracionMs: 380,
    /** Radios de salida y de llegada de cada uno de los cuatro gestos. */
    rebote: { r0: 0.5, r1: 2.6, sube: 1.7 },
    velocidad: { r0: 1.5, r1: 0.9, avanza: 5.5 },
    ventilador: { r0: 1.1, r1: 1.7, sube: 3.4 },
    hielo: { r0: 0.35, r1: 1.4, sube: 0.12 },
    tpEntrada: { r0: 2.2, r1: 0.15, sube: 1.2 },
    tpSalida: { r0: 0.2, r1: 2.4, sube: 1.2 },
    /** La tirolina: un aro que sale disparado **por el cable**, como el de la
     *  plataforma de velocidad pero más estrecho — ahí se lanza al vacío y aquí
     *  se va por un raíl. */
    tirolina: { r0: 1.2, r1: 0.5, avanza: 4.5 },
    /**
     * **La cuerda de un arco soltada a tope** (vuelta 85). Se pidió «especial
     * pero sutil», y sutil aquí quiere decir **pequeño y corto**: sale delante
     * del arma, se abre un palmo y se apaga. Los otros gestos dicen «el mapa te
     * ha hecho algo» y se ven desde lejos; éste dice «esa flecha iba llena», y
     * eso sólo tiene que leerlo quien la tira. Lo que lo lee desde fuera es
     * **la propia flecha**, que va más larga y más clara.
     *
     * Y `adelanteU` es lo que lo hace sutil de verdad: **no sale pegado a la
     * cara**. Medio metro de radio a treinta centímetros del ojo ocupa la
     * pantalla entera —se vio mirando una captura, no leyendo el código— así
     * que sale a dos metros y pico, que es donde medio metro **mide** medio
     * metro. Es la lección de la vuelta 40 con el fogonazo del muñeco, por la
     * otra punta: allí el problema era que estaba dentro de algo, aquí que
     * estaba dentro del ojo.
     */
    arcoLleno: { r0: 0.1, r1: 0.5, avanza: 1.4, adelanteU: 2.4 },
    /**
     * **Una explosión** (vuelta 86). Un anillo tumbado que se abre hasta el
     * radio de la onda —`SURFACES.destello` sólo sabe de radios, así que esto
     * **es** el radio del U2— y no sube nada: lo que hace una explosión en el
     * suelo es extenderse. Es el gesto más grande de los seis y tiene que
     * serlo: dice hasta dónde llegó, que es exactamente lo que hay que
     * aprender de un arma de área.
     */
    explosion: { r0: 0.4, r1: 5, sube: 0.25 },
  },
}

/**
 * **Los ventiladores de un mapa** (vuelta 83). Un volumen que empuja hacia
 * arriba mientras estés dentro.
 *
 * El triaje de la vuelta 79 lo puso en «vuelta propia» y la razón está en el
 * modelo, no en el dibujo: **la vertical de Vektor está resuelta en forma
 * cerrada** —`y = y0 + v0·t − ½g·t²` desde el despegue— así que un empuje
 * sostenido no es sumar una fuerza por frame, que sería volver a integrar por
 * Euler y perder la independencia del refresco que costó la vuelta 44. Lo que
 * es, es **otra gravedad**: dentro del volumen la parábola se evalúa con
 * `gravedad − fuerza`, y cruzar la frontera **re-ancla** el vuelo.
 *
 * Y es seguro en red por lo mismo que la física de la 72 y las superficies de
 * la 80: **no viaja ningún número**. Los dos extremos montan el mismo mapa,
 * dan los mismos pasos y cruzan la frontera en el mismo paso.
 */
export const FANS = {
  /** Topes del formato, como los de `SALA`. No son límites de diseño. */
  fuerzaMax: 120,
  altoMax: 60,
  /** Valores de partida al añadir uno en el editor. */
  porDefecto: { x: -3, z: -3, w: 6, d: 6, base: 0, alto: 10, fuerza: 42 },
  /**
   * **Cada cuánto suelta una ráfaga** mientras estás dentro. Un ventilador que
   * suena una vez al entrar y luego calla no se lee como un ventilador, y un
   * bucle de verdad —arrancar y parar una fuente— es maquinaria que este
   * proyecto no tiene en ninguna otra voz. Una ráfaga cada 380 ms **es** el
   * sonido de un ventilador, y sale gratis con lo que ya hay.
   */
  pulsoMs: 380,
  /** Lo que se dibuja dentro: flechas subiendo, repetidas por la planta. */
  marca: { paso: 2.6, altoFlecha: 1.1, capas: 3 },
}

/**
 * **Los teletransportes de un mapa** (vuelta 80). Un área con destino y rumbo.
 */
export const TELEPORTS = {
  /** Alto del volumen de entrada. Un jugador mide 1.8: con esto no se salta. */
  alto: 3,
  /** Valores de partida al añadir uno en el editor. */
  porDefecto: { x: -2, z: -2, w: 4, d: 4, destino: { x: 2, z: 2, yaw: 0 } },
}

/**
 * **Las tirolinas de un mapa** (vuelta 83).
 *
 * El triaje de la vuelta 79 la puso en «vuelta propia, del tamaño del
 * deslizamiento», y lo es por la misma razón: **es un estado de movimiento
 * nuevo**, con sus campos que viajan, su forma cerrada y su regla de qué marcha
 * conserva al soltarse. No es una superficie ni un volumen — no te hace algo al
 * pisarla: te lleva.
 *
 * Cinco reglas, y ninguna es tuning:
 *
 * - **El cable es de un solo sentido.** Se declara `desde` y `hasta` y siempre
 *   se viaja en esa dirección, que es lo que deja dibujar una flecha que no
 *   miente. Un cable de doble sentido tendría que decidir por qué extremo has
 *   entrado, y entonces la flecha del editor diría una cosa distinta a cada
 *   jugador.
 * - **Se avanza en forma cerrada**, como la parábola y como el deslizamiento:
 *   `d(t) = velocidad · t` desde el instante del enganche, no `v · dt` sumado
 *   paso a paso. A velocidad constante los dos dan casi lo mismo, pero lo
 *   segundo es una integración y este proyecto ya sabe a dónde lleva.
 * - **Engancharse te pega al cable**, y eso es un salto de hasta `alcanceU`, o
 *   sea un teletransporte para quien te dibuja: sube `poseEpoch` (vueltas 44 y
 *   50) o el rival vería un barrido de dos unidades.
 * - **Soltarse conserva la velocidad del cable**, horizontal y vertical. No es
 *   la regla del deslizamiento —que siembra el vuelo con tu carrera y no con su
 *   empujón— porque aquí la velocidad **la decide el mapa**, como en la
 *   plataforma de la vuelta 82, y no una técnica del jugador.
 * - **Y es seguro en red por lo de siempre: no viaja ningún número.** Los dos
 *   extremos montan el mismo mapa, derivan la misma lista de cables y lo único
 *   que viaja es en qué cable estás (un índice) y cuánto llevas recorrido.
 */
export const ZIPLINES = {
  /**
   * A qué distancia del cable se engancha uno. 2.2 u es poco más que un brazo
   * largo, y es lo que hace que enganchar sea un gesto y no una casualidad.
   */
  alcanceU: 2.2,
  /**
   * Cuánto cuelgan los ojos por debajo del cable. Un jugador mide 1.8 y mira
   * desde 1.7: con 0.55 el cable queda **justo encima de la cabeza**, que es
   * donde tiene que estar para que se entienda de qué vas colgado.
   */
  caidaU: 0.55,
  /** Topes del formato, como los de `SALA`. No son límites de diseño. */
  velocidadMin: 1,
  velocidadMax: 60,
  /** Valores de partida al añadir una en el editor. */
  porDefecto: {
    desde: { x: -8, y: 7, z: 0 },
    hasta: { x: 8, y: 2.5, z: 0 },
    velocidad: 14,
  },
  /**
   * **Cada cuánto suena la polea** mientras viajas. Es la misma idea que el
   * pulso del ventilador y por el mismo motivo: un bucle de verdad —arrancar y
   * parar una fuente— es maquinaria que este proyecto no tiene en ninguna otra
   * voz, y una ráfaga cada 190 ms **es** el traqueteo de una polea.
   */
  pulsoMs: 190,
  /** Lo que se dibuja: el cable, sus dos anclajes y la flecha del sentido. */
  /**
   * `flechaFinal` es el múltiplo de la flecha grande de la punta (vuelta 84):
   * las repartidas se leen recorriendo el cable con la vista, y ésta dice
   * hacia dónde lleva **de un vistazo**, sin seguirlo.
   */
  marca: { grosor: 0.05, anclaje: 0.42, flechas: 5, flecha: 0.5, flechaFinal: 2.2 },
}

/**
 * **Los prismas convexos de un mapa** (vuelta 83). El último renglón del
 * triaje de la 79, y el que abre la rotación libre: `lados: 4` **es** una caja
 * girada.
 *
 * El porqué de hacerlo entero —y no un OBB suelto— está en `src/maps/prisma.js`
 * y venía escrito en `CLAUDE.md` desde la 79. Los topes son del formato, como
 * los de `SALA`: no son límites de diseño.
 */
export const PRISMAS = {
  ladosMin: 3,
  /**
   * **Veinticuatro caras, el mismo techo que un tubo.** Por encima de ahí un
   * pilar de radio normal ya da escalones por debajo de lo que un ojo separa,
   * y cada cara cuesta un producto escalar por eje, por paso y por jugador.
   */
  ladosMax: 24,
  /**
   * Valores de partida al añadir uno en el editor.
   *
   * **Y el orden de las claves importa**, que es de las cosas que no se
   * adivinan: `sanearMapa` es un **punto fijo** —sanear dos veces da lo mismo,
   * byte a byte— y eso es lo que hace que deshacer/rehacer pueda comparar dos
   * mapas con un `JSON.stringify`, que es como está escrito desde la vuelta 76.
   * Un objeto creado con las claves en otro orden rompe esa comparación sin
   * cambiar ni un dato: `ed76` [6] salió rojo con un «rehacer no devuelve el
   * mapa al dígito» y los dos mapas eran el mismo. El orden es el que emite
   * `sanearPrisma`: primero lo de una pieza, después lo que un prisma añade.
   */
  porDefecto: { x: 0, z: 0, w: 3, d: 3, kind: 'alta', lados: 8, giro: 0 },
}

/**
 * **El tubo prefabricado** (vuelta 81). Un pozo de cajas en anillo que el
 * mapa declara como **un** objeto y `Scenario` despliega al montar
 * (`src/maps/tubo.js`). Los topes son del formato, como los de `SALA`: un
 * número fuera de rango no llega al juego venga del editor o de un fichero
 * escrito a mano.
 */
export const TUBES = {
  radioMin: 0.6,
  radioMax: 24,
  grosorMin: 0.2,
  grosorMax: 6,
  /**
   * Cuántas filas tiene el anillo, o sea **lo redondo que sale**. El suelo son
   * cuatro —un pozo cuadrado— y el techo veinticuatro, que a un radio normal ya
   * da escalones por debajo de lo que un ojo separa. Cada fila cuesta dos cajas
   * salvo las dos tapas, así que el de fábrica son 22 piezas: el panel de
   * presupuesto lo dice, que es para lo que está.
   */
  carasMin: 4,
  carasMax: 24,
  altoMin: 0.5,
  altoMax: 60,
  /**
   * **`x`/`z` de un tubo es su centro**, y no su esquina mínima como en una
   * pieza. Es la única divergencia del formato y es la que tiene sentido: la
   * esquina de un círculo no significa nada, y el radio se mide desde el
   * centro.
   */
  porDefecto: { x: 0, z: 0, radio: 3, grosor: 0.6, caras: 12, alto: 8, base: 0 },
}

/**
 * **Los tiradores de la pieza elegida** (vuelta 79). Van aparte de `EDITOR`
 * porque son del gesto y no de la prueba: `EDITOR` es lo que se enciende para
 * medir jugando, y esto es cómo se agarra una caja.
 */
export const GIZMO = {
  /**
   * Cuánto hay que subir el ratón para pasar al escalón de arriba del alto.
   * El alto de una pieza no es un número libre —es una palabra de
   * `COVER.heights`— así que este tirador elige escalón en vez de estirar, y
   * esto es lo que cuesta cada uno.
   */
  pixelesPorEscalon: 26,
  /**
   * A partir de esta distancia de cámara los tiradores crecen con ella, para
   * que conserven su tamaño en pantalla. Es la misma idea que
   * `MARKERS.referenceDistance` en el mundo del juego: lo que no se ve no se
   * puede usar.
   */
  distanciaDeReferencia: 25,
  /** Y no crecen sin fin: de cerca son un cubo, no un edificio. */
  escalaMax: 4,
}

/**
 * **Los fondos panorámicos, y se dibujan en vez de descargarse** (vuelta 77).
 *
 * Lo que un mapa ve más allá de sus paredes. Tres cosas que son el diseño:
 *
 * - **No es un asset.** Vektor no tiene ni uno —ni audio, ni texturas— y un
 *   panorama fotográfico sería el primero: un fichero de varios megas que hay
 *   que descargar, decodificar y mantener, en un juego cuyo argumento es que
 *   corre en cualquier PC sin bajarse nada. Lo que hay aquí son **parámetros**,
 *   y `src/game/backdrop.js` pinta con ellos una textura en un canvas al
 *   montar el escenario. El día que se decida meter una foto, el sitio es este
 *   catálogo y la decisión es de producto, no de implementación.
 * - **No es geometría del mapa.** Va en su propia esfera vista por dentro, no
 *   entra en `occluders`, no tiene colisión y **no cuenta en el presupuesto**:
 *   una malla, un material, cero rayos. Por eso un fondo no puede tapar un
 *   disparo ni esconder a un rival, que es justo lo que haría si se montara
 *   como una pieza más.
 * - **Y el tono de la sala no se toca.** La rampa de grises de `COVER` dice la
 *   altura de una pieza (vuelta 40) y un fondo claro detrás se la comería. Los
 *   tres son oscuros a propósito, con el detalle en el horizonte.
 */
export const FONDOS = {
  noche: {
    label: 'Noche estrellada',
    tipo: 'estrellas',
    cenit: '#05070d',
    horizonte: '#0d1018',
    estrellas: 900,
  },
  ciudad: {
    label: 'Ciudad de noche',
    tipo: 'horizonte',
    cenit: '#06080e',
    horizonte: '#141826',
    /** La silueta, con su neblina naranja de ciudad justo encima de los tejados. */
    silueta: '#04060a',
    halo: '#e4462b',
    torres: 120,
    /**
     * **Lo que ocupa el horizonte se mide en ángulo, no en píxeles.** La
     * textura cubre 180° de elevación en su alto, así que 0.34 son **sesenta
     * grados** de rascacielos: no es una ciudad de fondo, es estar dentro de
     * un pozo. 0.06 son unos once grados, que es lo que ocupa un horizonte
     * urbano visto desde la calle.
     */
    alturaMax: 0.06,
  },
  volcan: {
    label: 'Volcán',
    tipo: 'horizonte',
    cenit: '#080404',
    horizonte: '#24100a',
    silueta: '#060303',
    halo: '#ff6a2b',
    torres: 34,
    alturaMax: 0.05,
  },
  sala: {
    label: 'Nave industrial',
    tipo: 'nave',
    cenit: '#0b0b0d',
    horizonte: '#17171b',
    /** Las costillas de la nave: verticales regulares, que es lo que la lee como interior. */
    costilla: '#25252b',
    costillas: 28,
  },
}

/**
 * **La carpeta de las fotos panorámicas**, servida tal cual desde `public/`.
 *
 * Es la puerta que la vuelta 77 dejó cerrada y la 78 abre **para valorarla**:
 * un panorama fotográfico es el primer asset externo del proyecto, y el
 * argumento en contra sigue siendo el que revirtió el audio grabado en la 63.
 * Lo que cambia es que ahora se puede mirar antes de decidir: se deja un
 * `.jpg` aquí, el editor lo ofrece y se juega con él puesto.
 *
 * Que un mapa lo use **se ve en su fichero**: `fondo` deja de ser una clave y
 * pasa a ser un objeto con su ruta, así que «este mapa depende de un archivo»
 * no hay que deducirlo de nada.
 */
export const FONDOS_CARPETA = '/fondos/'

/** Extensiones que se admiten como panorama. Nada que haya que decodificar en dos pasos. */
export const FONDOS_EXTENSIONES = ['.jpg', '.jpeg', '.png', '.webp', '.avif']

/**
 * ¿Es esto una foto panorámica declarada por un mapa?
 *
 * El saneado es deliberadamente estrecho: **una ruta dentro de la carpeta y con
 * extensión de imagen**, nada más. Un `fondo` con una URL arbitraria sería un
 * mapa capaz de hacer que el juego se conecte a donde sea con sólo abrirlo.
 */
export function esFotoDeFondo(valor) {
  if (!valor || typeof valor !== 'object' || valor.tipo !== 'imagen') return false
  const url = valor.url
  if (typeof url !== 'string' || !url.startsWith(FONDOS_CARPETA)) return false
  if (url.includes('..')) return false
  return FONDOS_EXTENSIONES.some((ext) => url.toLowerCase().endsWith(ext))
}

/**
 * Qué fondo se dibuja, saneado. Sin nada, ninguno.
 *
 * Dos formas y una sola función que las resuelve: **una clave del catálogo**
 * —los cuatro dibujados en un canvas— o **un objeto con la ruta de una foto**.
 * Quien dibuja no distingue: recibe un objeto con su `tipo` y ya.
 */
export function fondoDeEscenario(escenario) {
  const definition = definicionDeEscenario(escenario)
  const fondo = definition?.fondo
  if (esFotoDeFondo(fondo)) return { clave: fondo.url, tipo: 'imagen', url: fondo.url }
  return fondo && FONDOS[fondo] ? { clave: fondo, ...FONDOS[fondo] } : null
}

const ESCENARIOS_INTEGRADOS = {
  empty: {
    label: 'Sala vacía',
    /** Sin geometría: el Gridshot de siempre, con su muestreo por cono. */
    spawn: { x: 0, z: 0 },
    boxes: [],
    ramps: [],
    anchors: [],
  },

  /**
   * **El Espejo — el mapa del duelo** (vuelta 66).
   *
   * Hasta aquí el 1v1 se jugaba en el Plano A, que es un mapa de
   * **entrenamiento**: un punto de aparición, un muro delante y todo lo demás
   * repartido para que haya a quién disparar. Puesto a servir de 1v1 daba dos
   * cosas mal: los dos jugadores salían **a 5 u uno del otro** —el duelo
   * empezaba resuelto— y la mitad del mapa (el Balcón, las troneras, el
   * parapeto) es ventaja para quien sepa llegar antes, que es justo lo que un
   * duelo no puede tener.
   *
   * Éste es lo contrario en las tres cosas que importan:
   *
   * - **Simétrico por giro de 180°**, y por construcción (ver `giro180`): la
   *   vista de uno es la del otro. No es un espejo —eso le daría a cada uno la
   *   esquina estrecha por un lado distinto—, es media vuelta.
   * - **Las salidas, en extremos opuestos**: (0, 16) y (0, −16), 32 u en línea
   *   recta, con el centro tapado por medio. Primer contacto a los tres o
   *   cuatro segundos, que es lo que da tiempo a elegir carril.
   * - **Plano, sin altura y sin rampas**, a propósito. Una plataforma simétrica
   *   se puede hacer, pero la altura es donde un 1v1 se desequilibra primero
   *   —quien llega antes arriba gana el intercambio— y eso pide medirlo jugando
   *   antes de construirlo. Lo que hay es cobertura a tres alturas y dos
   *   carriles por lado.
   *
   * **No sale en el selector de escenarios** (`soloDuelo`), y no es un olvido:
   * no tiene explosivo, ni recogibles, ni nada que buscar. Es el mapa de un modo,
   * no una variante del entrenamiento.
   */
  duelo: {
    label: 'El Espejo',
    soloDuelo: true,
    /** La misma sala que el Plano A: la escala está medida y el juego calibrado. */
    room: { width: 40, depth: 40, height: 10 },
    /**
     * El punto de aparición «del jugador» es la salida del primer equipo. En una
     * partida de verdad no se usa —el servidor reparte ranura y el cliente
     * empieza en la suya (vuelta 56)—, pero el motor necesita uno para montar la
     * escena fuera de red, y que sea uno de los dos evita inventar un tercero.
     */
    spawn: { x: 0, z: 16 },
    /**
     * **Las dos salidas del duelo.** Las lee `net/partida.js` y son lo único de
     * este escenario que el servidor mira. Antes las derivaba del spawn del
     * escenario con ±2.5 en x, que es lo que ponía a los dos jugadores a cinco
     * unidades: una regla que valía para no aparecer uno dentro del otro y que
     * nunca fue un reparto de sitios.
     */
    duelo: {
      /**
       * **Y cada una con su rumbo**, que en un mapa de dos extremos deja de ser
       * un detalle: una cámara mira a −Z con yaw 0 (la convención del
       * movimiento, `forward = (−sin, −cos)`), así que sin esto el que sale en
       * el sur aparece **mirando a la pared del fondo**. En el Plano A no se
       * notaba porque los dos salían del mismo sitio mirando al mismo lado.
       */
      salidas: [
        { x: 0, z: 16, yaw: 0 },
        { x: 0, z: -16, yaw: Math.PI },
      ],
    },
    /**
     * **Media sala, y la otra media la pone el giro.** Lo que va aquí es el lado
     * del jugador que sale en (0, 16); `giro180` añade el del otro.
     *
     * `centro` es aparte porque está centrado en el origen: girarlo daría una
     * copia encima de sí mismo.
     */
    boxes: [
      ...giro180([
        // **La pantalla de aparición.** Misma idea que el muro del Plano A y por
        // el mismo motivo: nadie tiene que poder disparar al punto donde el otro
        // acaba de aparecer. `media` (1.9) y no `alta`, que a metro y medio de la
        // cara una pieza alta es una pared gris (vuelta 43).
        //
        // A z 12.4 y no más cerca: la caja de la fase de compra son 4 u
        // centradas en la salida (z 14..18), y una pared dentro del corralito
        // sería comprar dentro de un armario.
        { x: -7, z: 12.4, w: 14, d: 1, kind: 'media' },

        // **La espina del carril oeste.** Separa el corredor de la pared de todo
        // lo demás, así que ir por ahí es una decisión y no un atajo: se entra
        // por el norte —pasada la puerta— y se sale al centro por el sur.
        { x: -12.2, z: 1.5, w: 1.2, d: 9.5, kind: 'alta' },
        // Y su puerta: el tapón va **pegado a la pared**, que es lo que evita
        // una rendija de una unidad por la que el cuerpo no cabe. Lo que queda
        // libre entre él y la espina son 2.5 u, el mismo paso que La Puerta del
        // Plano A.
        { x: -20, z: 5.5, w: 5.3, d: 2, kind: 'media' },

        // El lado este es el abierto: tres piezas sueltas y ninguna pared. Cada
        // jugador tiene un lado estrecho y uno ancho, y con el giro le tocan
        // cambiados — que es lo que hace que rotar signifique algo.
        { x: 11.5, z: 8.5, w: 4.5, d: 2, kind: 'media' },
        { x: 5.5, z: 4.5, w: 3, d: 3, kind: 'baja' },
        { x: 15.5, z: -1.5, w: 4.5, d: 3, kind: 'baja' },

        // Bordillo delante del centro: se salta, y desde encima se ve por encima
        // de la cobertura baja de al lado.
        { x: -4.5, z: 5, w: 4, d: 1.5, kind: 'bordillo' },

        // **El ala del centro.** Pegada a la cara este del bloque central; con su
        // pareja girada forman una barra de 15 u que hay que rodear, y los dos
        // huecos caen en lados opuestos.
        { x: 2.5, z: -0.6, w: 5, d: 1.2, kind: 'media' },
      ]),
      // **El bloque central**, centrado en el origen y por eso fuera del giro.
      // `alta` (3.6) porque es lo único que corta la línea recta entre las dos
      // salidas — y la corta dos veces contando las pantallas.
      { x: -2.5, z: -2.5, w: 5, d: 5, kind: 'alta' },
    ],

    ramps: [],

    /**
     * **Dos bandas de aparición, una por salida**, de la cara de cada pantalla
     * hacia atrás. Es la regla de la vuelta 43 —una banda que cruza la sala, no
     * una bolsa alrededor del punto— aplicada dos veces, que es lo que pide un
     * mapa con dos salidas.
     */
    spawnZone: [
      { x: -20, z: 12.4, w: 40, d: 7.6 },
      { x: -20, z: -20, w: 40, d: 7.6 },
    ],

    /** Ni explosivo ni recogibles: el duelo no tiene objetivo ni suelo que recoger. */
    objectiveSites: [],
    pickups: [],

    /**
     * **Rutas.** El duelo no las usa —no hay muñecos— y aun así están, por dos
     * motivos: son el vocabulario con el que los bancos eligen dos puestos que
     * se ven entre sí sin escribir una coordenada a mano (vuelta 39), y son lo
     * que haría falta el día que este mapa quiera muñecos.
     *
     * Salen del mismo barrido que las del Plano A (`rutas-buscar.mjs`), con las
     * dos bandas de aparición excluidas.
     */
    routes: [],
  },

  /**
   * **Los Pilares: el mapa de francotirador** (vuelta 72).
   *
   * Inspiración declarada, no copia: los mapas de *scout* de Counter-Strike se
   * juegan con la gravedad baja, y lo que los hace lo que son no es el arma —es
   * que el aire se gobierna y llegar a un sitio alto es una decisión con
   * trayectoria—. Aquí eso sale de tres números (`fisica`) y de un plano hecho
   * para ellos: torres macizas, vanos anchos y líneas de tiro de punta a punta.
   *
   * Las mismas cuatro reglas de El Espejo (vuelta 66): **giro de 180°** y no
   * espejo, **salidas declaradas con su rumbo**, **fuera del selector de
   * escenarios** y, aquí sí, altura — que es justo lo que aquella vuelta dejó
   * para «cuando se pueda medir jugando», y lo que este mapa viene a probar.
   */
  pilares: {
    label: 'Los Pilares',
    soloDuelo: true,
    /**
     * **Sala grande y alta.** 56 de lado contra los 40 del Espejo porque una
     * línea de tiro de francotirador necesita fondo, y 20 de alto porque con
     * esta gravedad un salto encadenado desde una atalaya sube de verdad.
     */
    room: { width: 56, depth: 56, height: 20 },
    spawn: { x: 0, z: 24 },

    /**
     * **La física del mapa** (vuelta 72), y es lo único de este escenario que
     * cambia cómo se mueve el jugador. Tres números:
     *
     * - `gravity` **13** contra 30. Un salto sube 3.26 u y dura 1.42 s, contra
     *   1.25 u y 0.58 s. De ahí sale todo lo demás: los vanos, las alturas de
     *   las torres y que valga la pena coger carrerilla.
     * - `jumpSpeed` **9.2**: un pelo más que el de siempre, porque lo que
     *   decide la altura es la gravedad y este número se queda para afinar el
     *   ápice sin tocar el tiempo de vuelo.
     * - `airStrafeMaxSpeed` **12** contra 9.5. El techo del aire sube porque
     *   aquí el aire **es** el juego: con 1.42 s de vuelo, 12 u/s son 17 u de
     *   salto, que es exactamente el vano más ancho del plano. Un jugador que
     *   no estrafee cruza 13 y se queda corto.
     *
     * Lo que **no** cambia: el modelo del aire, la aceleración, las marchas de
     * a pie y el peso de las armas. Un mapa puede decir cuánto pesas y hasta
     * dónde aceleras; cómo se acelera, no.
     */
    fisica: {
      gravity: 13,
      jumpSpeed: 9.2,
      airStrafeMaxSpeed: 12,
    },

    duelo: {
      /**
       * **48 u entre salidas**, en extremos opuestos y con su rumbo. La línea
       * recta entre las dos la corta la torre central, así que el primer
       * segundo no decide la ronda.
       */
      salidas: [
        { x: 0, z: 24, yaw: 0 },
        { x: 0, z: -24, yaw: Math.PI },
      ],
      /**
       * **Aquí no se compra: se reparte** (vuelta 72). El mapa declara con qué
       * sale cada jugador en cada ronda —y al reaparecer—, y con eso el
       * servidor no necesita ni tienda ni dinero: `sinEconomia` no es «la
       * tienda cerrada», que es lo que significaba una fase de compra a cero,
       * sino que **no hay tienda**.
       *
       * Scout, chaleco y cuchillo. Sin casco a propósito: con el chaleco hacen
       * falta dos balas al cuerpo y **una a la cabeza sigue matando**, que es
       * lo que hace que un mapa de francotiradores se juegue apuntando arriba.
       */
      sinEconomia: true,
      dotacion: { arma: 'scout', chaleco: true, casco: false },
    },

    /**
     * **Media sala, y la otra media la pone el giro.** Lo de aquí es el lado
     * del que sale en (0, 24).
     *
     * Y **todas las piezas nacen en el suelo**, incluidas las torres: no hay ni
     * un voladizo. No es una limitación de estilo, es una regla con fecha —
     * `slide69` [9] la vigila—: la colisión sabe pasar por debajo de una pieza
     * con la base levantada, y el día que exista una hay que escribir la
     * comprobación de no levantarse dentro de ella. Un mapa de saltos es el
     * peor sitio para estrenar ese agujero.
     */
    boxes: [
      ...giro180([
        // **La pantalla de aparición**, como en El Espejo: desde la salida del
        // otro no se ve el punto donde apareces. `media` y no más alta por lo
        // de siempre (vuelta 43): a metro y medio de la cara, una pieza alta es
        // una pared gris.
        { x: -9, z: 19.5, w: 18, d: 1.2, kind: 'media' },

        // **Las dos torres de salida.** Lo primero a lo que se sube, y se sube
        // desde el suelo: 3.2 contra los 3.26 que da un salto aquí. Desde
        // arriba se ve el centro entero por encima de la pantalla.
        { x: -20, z: 9, w: 6, d: 6, kind: 'torre' },
        { x: 14, z: 9, w: 6, d: 6, kind: 'torre' },

        // **La atalaya del flanco.** A 6 u sólo se llega desde una torre, y de
        // una torre a ella hay 9 u de vano: se cruza estrafeando, no andando.
        // Es el sitio desde el que se domina el carril largo de ese lado.
        { x: -25, z: -4, w: 5, d: 8, kind: 'atalaya' },

        // Cobertura de a pie en el centro: lo que deja cruzar sin volar, para
        // el que prefiera jugar el mapa por abajo.
        { x: -6, z: 11, w: 5, d: 1.6, kind: 'baja' },
        { x: 6.5, z: 3.5, w: 1.6, d: 7, kind: 'media' },
        { x: -14, z: 1, w: 4, d: 1.6, kind: 'baja' },

        // Bordillo al pie de la torre del este: se salta, y desde él la torre
        // queda a un salto corto en vez de a uno justo.
        { x: 14, z: 16, w: 6, d: 1.5, kind: 'bordillo' },
      ]),

      /**
       * **La torre central**, centrada en el origen y por eso fuera del giro.
       * Es lo único que corta la recta entre las dos salidas, y es `atalaya`:
       * quien la toma ve las dos mitades, y para tomarla hay que llegar desde
       * una torre cruzando 8.5 u de vano a la vista de todos.
       */
      { x: -4, z: -4, w: 8, d: 8, kind: 'atalaya' },
    ],

    ramps: [],

    /** Una banda por salida, igual que El Espejo. */
    spawnZone: [
      { x: -28, z: 19.5, w: 56, d: 8.5 },
      { x: -28, z: -28, w: 56, d: 8.5 },
    ],

    /** Ni explosivo ni recogibles: es un mapa de duelo. */
    objectiveSites: [],
    pickups: [],
    routes: [],
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
/**
 * **Los escenarios que ofrece el entrenamiento**, que no son todos (vuelta 66).
 * Un mapa con `soloDuelo` es el de un modo, no una variante: no tiene explosivo,
 * ni recogibles, ni nada que buscar, y en el selector sería una sala vacía con
 * cajas. Se deriva del propio dato, como `PRIMARY_WEAPONS` de la ranura del
 * arma: no hay una segunda lista que mantener, y el día que un mapa cambie de
 * bando cambia en los tres sitios a la vez —el selector, el saneado y esto—.
 */
/**
 * **Los escenarios, y no todos vienen escritos aquí** (vuelta 74).
 *
 * A los cuatro de siempre se suman los que haya en `src/maps/`, que es lo que
 * escribe el editor. **Guardar y publicar son la misma acción**: no hay un paso
 * de publicación aparte que se pueda olvidar, ni un formato de exportación
 * distinto del que el motor lee — el fichero *es* el mapa.
 *
 * Los integrados van primero y los de fichero pueden pisarlos, que es lo que
 * deja abrir El Espejo en el editor, cambiarle una caja y probarlo sin tocar
 * este fichero. Para volver al de fábrica se borra el de `src/maps/`.
 */
export const SCENARIOS = { ...ESCENARIOS_INTEGRADOS, ...MAPAS_DE_FICHERO }

export const TRAINER_SCENARIOS = Object.fromEntries(
  Object.entries(SCENARIOS).filter(([, definition]) => !definition.soloDuelo),
)

/**
 * **Los mapas de duelo**, derivados del propio dato (`soloDuelo`) igual que
 * `TRAINER_SCENARIOS` se deriva de lo contrario. Desde la vuelta 72 hay dos —El
 * Espejo y Los Pilares— y por eso hace falta una lista: hasta aquí el escenario
 * del duelo era un solo nombre en `NET.escenario`.
 */
export const DUEL_SCENARIOS = Object.fromEntries(
  Object.entries(SCENARIOS).filter(([, def]) => def.soloDuelo),
)

/**
 * **Qué mapa juega una sala**, saneado. Lo miran los dos extremos —el huésped
 * al crearla y la página al montar el motor— y por eso vive aquí y no en cada
 * uno: dos saneados es como una sala acaba jugándose en dos mapas distintos, y
 * el síntoma sería una corrección por paso contra paredes que sólo existen en
 * un lado.
 */
export function escenarioDeDuelo(key) {
  return DUEL_SCENARIOS[key] ? key : NET.escenario
}

export function scenarioHasCover(escenario) {
  const definition = definicionDeEscenario(escenario)
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
 * **Cuánto dura una sesión, la elija el jugador en el modo que sea** (vuelta
 * 78). Hasta aquí esto era `DEATHMATCH_DURATIONS` y sólo lo leía el Deathmatch:
 * el gridshot cronometrado duraba `SESSION_DURATION_S` pasara lo que pasara, así
 * que poner «sin límite» con dianas clásicas dejaba el ajuste puesto y el
 * cronómetro contando igual. Un control que promete lo que el juego va a
 * ignorar es el fallo de la vuelta 67 por la puerta del panel.
 *
 * Dos cosas que son el diseño:
 *
 * - **`mode` es el valor de fábrica y significa «la del modo»**: 30 s
 *   cronometrados, Deathmatch sin límite. Es exactamente lo que hacía el juego
 *   hasta la 77, así que quien no toque el ajuste no nota nada — y es la única
 *   forma honesta de abrir el control a los dos modos sin decidir por nadie que
 *   «Jugar ahora» pasa a durar diez minutos.
 * - **La ronda con explosivo sigue siendo suya.** Su cuenta atrás *es* el reloj
 *   de esa sesión (`OBJECTIVE.timerMs`), así que la duración elegida no la
 *   corta: los 30 s de siempre habrían cerrado la partida antes de los 45 de la
 *   bomba, y eso ya estaba resuelto.
 *
 * `seconds: null` es «la del modo»; `seconds: 0`, sin límite.
 */
export const SESSION_DURATIONS = {
  mode: { label: 'La del modo', seconds: null },
  none: { label: 'Sin límite', seconds: 0 },
  s30: { label: '30 segundos', seconds: 30 },
  m1: { label: '1 minuto', seconds: 60 },
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
     * **Lo que se probó y no entró: una punta de flecha** (vuelta 73).
     *
     * La idea era añadir una tercera señal de orientación que **no** fuera
     * comparativa —barbos y muesca, para que de frente se viera una punta y de
     * espaldas una V ancha—, porque las dos que hay exigen haber visto la otra
     * vista: el tono (vuelta 39) y la pendiente (vuelta 40).
     *
     * Medida contra la cuña de siempre en el mismo banco (`brujula73`), la
     * flecha daba **+16% de área** (136 px contra 117 a 12 u) y **no mejoraba
     * nada** lo que venía a mejorar: la silueta cambia entre frente y espalda un
     * 15–24% con las dos. Y encima **costaba tono donde más importa**: a 8 u el
     * Δ de luminancia caía de 20.2 a 10.5, porque una cola en V enseña menos
     * cara oscura y más costado claro. O sea que cambiaba la señal que el
     * cuchillo necesita por área que no hacía falta.
     *
     * Se queda escrito porque el siguiente que lo piense se ahorra la vuelta: la
     * legibilidad de este marcador **no está en su forma**, está en el contraste
     * de la cola, y por ahí es por donde entró el arreglo de esta vuelta
     * (`backShade`).
     */
    /**
     * **Y cuando le ves la espalda, la cola se enciende.**
     *
     * Es la única señal del marcador que no dice *hacia dónde mira* sino *qué
     * puedes hacerle*, y por eso es la única binaria que tiene: el arco es el
     * mismo (`WEAPONS.vanta.melee.backArcDeg`) que decide la puñalada
     * instantánea y sale de la misma función (`esPorLaEspalda`). Dos cuentas
     * separadas serían una brújula que promete una espalda que el servidor no
     * da por buena.
     *
     * **Lo que cambia es el brillo de la cola, y hacia arriba.** La primera
     * versión hacía lo contrario —las caras translúcidas fuera del arco y
     * opacas dentro— y era un error de dirección: el encargo decía que el
     * marcador se lee mal, y aquello lo dejaba más apagado el 90% del tiempo
     * para poder encenderlo el 10%. Medido, hundía el Δ de tono de la vuelta 40
     * de 34 a 10. Ahora la cola pasa de `tailShade` a esto, así que fuera del
     * arco todo está exactamente como estaba y dentro **hay más luz, no menos**.
     *
     * Y sin color nuevo: en esta paleta todos los tonos significan ya algo
     * (vuelta 40) y el verde de acción es el de la propia brújula.
     */
    backShade: 1,
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
   * **El tiempo se mide contra un par, no contra el cero** (vuelta 78).
   *
   * Hasta aquí el componente era `1 − transcurrido / 45 s`, o sea que la nota
   * máxima pedía desactivar **al instante**. Sólo la pulsación de desactivar
   * dura 3 s y cruzar el Plano A en diagonal cuesta 8.1, así que una partida
   * impecable —precisión al objetivo del arma, sin recibir un tiro y sin
   * morir— que tardara 30 s se quedaba en **0.72 de nota, tres estrellas**. El
   * techo no estaba calibrado alto: estaba fuera de alcance, y de ahí venía la
   * sensación de que cinco estrellas no existen.
   *
   * `timeParMs` es lo que tarda una partida buena: por debajo, el componente
   * vale 1; de ahí a que reviente la bomba, cae en línea recta. Los 20 s salen
   * de sumar lo que cuesta llegar (~8 s en diagonal), la desactivación (3 s) y
   * un margen para el combate del camino.
   */
  timeParMs: 20000,

  /**
   * Referencias con las que se normalizan el daño y las muertes.
   *
   * **El daño dejó de ser un acantilado** (vuelta 78): con la referencia en
   * 100, una sola ráfaga de dos balas al torso ponía el componente a cero y no
   * había forma de distinguir «me han rozado» de «me han barrido». Ahora son
   * **tres barras de vida**, que es lo que encaja quien juega mal de verdad, y
   * el componente baja en proporción a lo que te han dado. Una bala al torso
   * cuesta ~0.17 de ese componente y 0.014 de la nota: no es lo que decide una
   * estrella, y ésa era la queja.
   */
  damageReference: 300,
  deathsReference: 3,

  /**
   * Cortes de estrella, de 5 a 2. Por debajo del último, 1 estrella. Que el
   * explosivo detone **no es una estrella**: es un resultado de fallo aparte.
   *
   * **Cinco estrellas es impecable y se nota en el corte** (vuelta 78): 0.95
   * deja fuera una muerte —que hunde dos componentes a la vez— y deja dentro un
   * par de balas encajadas. Los otros tres cortes bajan porque con el par de
   * tiempo la escalera entera se ha movido, y lo que se quería es que cuatro
   * estrellas fuera «he jugado bien», no «he jugado perfecto y he tardado un
   * poco». La escalera está medida, y la tabla, en `docs/decisions.md` §78.
   */
  starThresholds: [0.95, 0.78, 0.56, 0.34],
}

/**
 * **La mira, y es una sola para los dos modos** (vuelta 67). Hasta aquí el
 * entrenamiento tenía la suya en CSS (`src/styles.css`) y el duelo otra escrita
 * a mano en su página: trazos de un píxel contra dos, con punto central en una
 * y sin él en la otra. Dos miras distintas en el mismo juego es una diferencia
 * que nadie decidió, que es la definición de fallo de producto de la vuelta 63.
 *
 * Los tres números salen de aquí y los publican **las dos páginas** como
 * variables CSS, igual que el color: el día que haya una pantalla para
 * diseñarse la mira, lo que toca es esto y nada más.
 */
export const CROSSHAIR = {
  /** Hueco central, en píxeles: lo que se deja ver de lo que hay debajo. */
  gapPx: 3,
  /** Largo de cada trazo. */
  lengthPx: 7,
  /** Grosor. El del duelo era 1 y se leía peor sobre el gris del mapa. */
  thicknessPx: 2,
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
  /**
   * **El destello de la mira al disparar se retiró en la vuelta 67**, y con él
   * sus dos números: la mira es la referencia contra la que se apunta y no se
   * anima nunca. Lo que sí sigue vivo es el anillo de daño de aquí abajo, que
   * no es la mira sino un aviso dibujado alrededor de ella.
   */
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

/**
 * **La marca que deja una bala en una superficie** (vuelta 64). Un disparo que
 * no da tiene que decir **por dónde** se ha ido, o fallar contra una pared y
 * fallar al aire se ven igual. Lo dibuja `src/game/impacts.js`, y sale en los
 * dos modos porque vive en el motor: contra los muñecos y contra una persona.
 */
export const IMPACTS = {
  /**
   * Ranuras del pool. Con la vida de abajo y el arma más rápida del arsenal
   * (800 RPM, un disparo cada 75 ms) caben dieciocho balas antes de pisar la
   * primera, así que veinticuatro sobran incluso disparando a bocajarro.
   */
  pool: 24,
  /** Punta a punta, en unidades de mapa. Una bala no deja un cráter. */
  sizeU: 0.16,
  /** Lo que tarda en apagarse del todo, en tiempo de juego. */
  lifeMs: 420,
  /**
   * El primer tramo de vida va **por encima del uno**: una bala contra una
   * pared es un golpe y luego un rastro, y sin ese escalón las dos mitades se
   * ven igual. `flashPart` es qué fracción de la vida dura el golpe.
   */
  flashPart: 0.12,
  flashBoost: 2.4,
  opacity: 0.9,
  /** Separación de la cara golpeada: pegada del todo parpadea contra ella. */
  offsetU: 0.012,
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
  /** La baja: por encima del acierto, porque cierra un intercambio. */
  killVolume: 0.9,
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
  /**
   * **Las muestras grabadas están apagadas, y es una decisión de producto**
   * (vuelta 63). Se probaron las diez en juego —tres disparos, sus tres
   * silenciados, tres recargas y el gatillo en seco— y no encajan: Vektor suena
   * a sintetizado a propósito, y ese carácter es parte de lo que lo hace
   * ultraligero. Nada que descargar, nada que decodificar, nada que esperar.
   *
   * **Lo que había se queda**: los WAV siguen en `Reference/Audio/`, el
   * importador sigue existiendo y `samples.js` no ha cambiado. Volver a
   * probarlas es poner esto a `true` y pasar `npm run audio:weapons`; volver a
   * probar **una sola** es dejar sólo su fichero en `Reference/`.
   *
   * Es un booleano de código y no un ajuste del panel a propósito: decide si el
   * juego tiene ficheros de audio, no cómo suena la partida de nadie.
   */
  samplesEnabled: false,
  /**
   * **La recarga**, que hoy sólo existe si hay muestra: no hay síntesis debajo,
   * así que sin fichero es silencio, exactamente como hasta ahora. Por debajo
   * del disparo — recargar es un gesto propio y no información urgente.
   */
  reloadVolume: 0.7,
  /** El gatillo en seco. Éste sí tiene síntesis debajo: el clic de siempre. */
  dryVolume: 0.7,
  /** Daño recibido, curación y la carga eléctrica del escudo. */
  damageVolume: 0.6,
  /**
   * **El techo de una pisada de rival**, y es un techo de verdad: el panel no lo
   * sube y a bocajarro no se pasa de aquí (`FOOTSTEPS.fullDistanceU`).
   *
   * Por debajo del silbido a propósito, y desde la vuelta 63 bastante más
   * abajo: una pisada dice dónde está alguien que no ves, y para eso no hace
   * falta que suene fuerte — hace falta que suene **desde algún sitio**. A 0.42
   * y con la curva plana de antes, una pisada a doce unidades salía casi igual
   * de fuerte que una a cuatro y **se confundía con un disparo**. Se calibra
   * jugando.
   */
  /**
   * **Lo que suena al ponerte lo que has comprado** (vuelta 73). Por debajo de
   * un disparo con holgura: es interfaz, y lo que no puede es taparte a un
   * rival que entra por detrás mientras compras.
   */
  equipVolume: 0.5,
  /**
   * **El pitido del final de ronda.** Suave a propósito: avisa, no sobresalta.
   * Va aún más bajo que el de equipar porque suena **quince veces seguidas**.
   */
  roundTickVolume: 0.3,
  footstepVolume: 0.26,
  /**
   * **La voz de un dispositivo** (vuelta 82). Por encima de una pisada y por
   * debajo de un disparo: un rebote o una puerta es un suceso del mundo que
   * hay que oír aunque no lo estés mirando —y que un rival cercano tiene
   * derecho a oír—, pero no puede tapar la ráfaga que te está entrando.
   */
  deviceVolume: 0.5,
  healVolume: 0.5,
  shieldVolume: 0.42,
}

/**
 * **Las pisadas de los demás** (vuelta 60). Estaban fuera de alcance «hasta que
 * hubiera multijugador», y ya lo hay.
 *
 * Son de **los demás** y de nadie más: el jugador no oye las suyas. Las propias
 * no dicen nada que no sepas ya —estás pulsando la tecla— y a cambio enmascaran
 * justo lo que estas pisadas vienen a dejar oír. Es la misma regla que la de la
 * vuelta 40 con el silbido: lo que se añade al audio de una partida se añade
 * porque informa.
 *
 * **El paso se mide en distancia recorrida, no en tiempo.** Una zancada es un
 * trozo de suelo, así que agacharse o andar no cambian cada cuánto se pisa: bajan
 * la marcha, y con ella el ritmo, solos. Medir por tiempo habría dado el mismo
 * ritmo corriendo que agachado, que es justo lo que delata a un sistema de
 * pisadas falso.
 */
export const FOOTSTEPS = {
  /** Lo que se anda entre una pisada y la siguiente, en unidades de mapa. */
  strideU: 1.9,
  /**
   * **Sólo se oye a quien corre** (vuelta 63). Por debajo de esta fracción de su
   * marcha de carrera —la suya, con el peso de su arma ya contado— no se pisa en
   * absoluto: ni andando con SHIFT, ni agachado, ni ajustando la mira parado.
   * Andar despacio **es** la forma de no hacer ruido, así que tiene que comprar
   * silencio entero y no un volumen más bajo; lo que cuesta es la velocidad.
   *
   * El número sale del hueco que hay entre las dos marchas y no de una
   * preferencia: la carrera más lenta del arsenal es la de la Rift (5.88 u/s) y
   * el paseo más rápido es el de la pistola (4.2), así que el umbral cae en
   * 5.33 —a 0.55 u/s de cada uno— y ninguna de las dos lo cruza por el temblor
   * de la interpolación.
   */
  runFraction: 0.82,
  /**
   * **A partir de aquí no se oye nada.** No es «se oye poquísimo»: es silencio,
   * y lo garantizan las dos puntas —el motor no dispara la pisada y el panner
   * llega a cero justo aquí—. Bajó de 22 en la vuelta 63: 22 u en una sala de
   * 40×40 es media diagonal, o sea un radar; lo que tiene que decir una pisada
   * es «hay alguien cerca».
   */
  maxDistanceU: 16,
  /**
   * A esta distancia o menos suena el techo (`AUDIO.footstepVolume`), y de aquí
   * a `maxDistanceU` se apaga con la distancia. Es la curva del **emisor de las
   * pisadas**, no la de `SPATIAL`: la de la sala está calibrada para un mapa de
   * 55 u y dejaba una pisada a doce unidades a un decibelio de una a cuatro.
   */
  fullDistanceU: 2.5,
  /** Perfil del sonido. Roce de suela y un cuerpo corto y grave, como el aterrizaje. */
  sound: {
    scuffHz: 1900,
    scuffGain: 0.5,
    scuffDecay: 0.075,
    bodyType: 'triangle',
    bodyFrom: 150,
    bodyTo: 68,
    bodyAttack: 0.007,
    bodyDecay: 0.1,
    bodyGain: 0.42,
  },
  /**
   * Cuánto varía el tono de una pisada a la siguiente. Sin esto son la misma
   * muestra repetida y a la tercera se oye el bucle.
   */
  pitchJitter: 0.12,
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

/**
 * **El tick de simulación.** El mundo avanza en pasos de tamaño fijo, y el
 * monitor sólo decide cuándo se dibuja.
 *
 * Hasta la vuelta 44 el mundo avanzaba con el delta del frame: a 240 Hz se
 * simulaba en pasos de 4.17 ms y a 60 en pasos de 16.67. Casi todo el motor
 * aguantaba esa diferencia porque estaba resuelto en forma cerrada —la parábola
 * del salto, la cadencia, la ganancia por ángulo del air-strafe escalar—, pero
 * el modelo vectorial del aire es una **integración** cuya entrada es el ratón,
 * y el ratón se muestrea una vez por frame: de ahí el 1.38% de diferencia entre
 * 60 y 240 Hz que documenta `docs/decisions.md` §32. Con paso fijo esa
 * diferencia desaparece por construcción, porque el paso deja de depender del
 * refresco.
 *
 * Es además el requisito de la predicción de cliente: reejecutar las entradas
 * pendientes sobre el mismo módulo sólo converge si cliente y servidor dan los
 * mismos pasos. Ver `docs/propuestas/02-multijugador-1v1.md`.
 */
export const SIM = {
  /** Pasos de mundo por segundo. 60 es el tick de CS2; Valorant va a 128. */
  hz: 60,
  /**
   * Tope de delta por frame: evita saltos del reloj tras un parón del
   * navegador. Es también el techo de pasos por frame —seis a 60 Hz—, así que
   * un parón largo no se paga con una avalancha de simulación.
   */
  maxFrameDeltaMs: 100,
}

/** Milisegundos de un paso de mundo. Sale de `SIM.hz` y no se escribe aparte. */
export const SIM_STEP_MS = 1000 / SIM.hz

/**
 * **La partida en red.** Vuelta 45: primer 1v1 local, sólo movimiento. El
 * transporte todavía no está aislado tras una interfaz — eso viene cuando el
 * concepto esté validado; ver `docs/propuestas/02-multijugador-1v1.md`.
 *
 * El reloj de la simulación en red **es el número de paso**, no `performance.now()`
 * de nadie: cada entrada viaja sellada con su paso `n` y los dos extremos la
 * ejecutan con `now = n · SIM_STEP_MS`. Sin eso, el aterrizaje que despeja la
 * parábola en el servidor y la pulsación de salto que se selló en el cliente
 * estarían en relojes distintos y la ventana de encadenado no significaría nada.
 */
/**
 * **Las rondas del duelo** (vuelta 62). Quién gana una ronda y quién gana la
 * partida son **dos condiciones distintas**, y por eso son dos cosas aquí: una
 * ronda se gana matando o llegando al final con más vida; la partida, con la
 * mayoría de las rondas.
 *
 * Todo esto lo decide el servidor (`net/partida.js`) y nada de ello vive en el
 * motor: es una regla de juego del 1v1, no del aim trainer.
 *
 * **El reloj de una ronda es el número de paso**, como todo lo demás de la red,
 * y por eso los segundos de aquí se convierten a pasos al arrancar cada fase.
 * Con el reloj de pared, una pausa de dos minutos se comería una ronda entera
 * —el mismo agujero que ya se cerró en la cuenta atrás del explosivo—. Las
 * cuentas de la *conversación* (pausa y votación) sí van por pared, y siguen
 * donde estaban: en `PAUSE`.
 */
/**
 * **La economía del duelo** (vuelta 64). Dinero por ronda, precios y el catálogo
 * de la armería. Todo de partida y **para calibrar jugando**, como el resto del
 * tuning: lo que fija la forma no son los números sino las tres reglas de abajo.
 *
 * **Quién manda: el servidor.** El dinero, lo que llevas y lo que puedes comprar
 * viven en `net/partida.js` y viajan en la foto. El cliente dibuja el panel y
 * manda `MSG.COMPRAR`; si mintiera sobre su saldo, el servidor lo tira. Es la
 * misma regla que la cadencia (vuelta 56): el arma la lleva el cliente, lo que
 * se puede tener lo decide el servidor.
 *
 * **La ronda 1 tiene techo, y no es de dinero.** Se sale con la pistola sí o sí:
 * ninguna arma principal se puede comprar esa ronda aunque sobre el saldo. Lo
 * que sí cabe es equipo —chaleco, casco— y, cuando exista, una granada. Con eso
 * la primera ronda es una decisión de verdad (¿chaleco o casco?) en vez de una
 * carrera por el rifle.
 *
 * **Y ganar la primera ronda da un salto mayor que perderla**, que es lo que
 * hace que la ronda 2 no sea igual para los dos. Con los números de hoy, y
 * suponiendo que los dos gastan los 800 de salida:
 *
 * | | saldo en la ronda 2 | qué da de sí |
 * |---|---|---|
 * | ganador | 3200 | Rift (2900) y **casi nada más**, o Volt (1600) + compra completa |
 * | perdedor | 2400 | no llega al Rift; Volt + chaleco + granada, o ahorrar |
 *
 * El rifle cuesta 2900 y no 2700 por un número que salió midiendo: con 2700, un
 * perdedor que se hubiera guardado los 300 del chaleco llegaba **justo** —2400 +
 * 300— y la asimetría de la ronda 2 desaparecía por doscientos dólares. Ahorrar
 * la ronda entera sí da para rifle, que es la otra mitad de la decisión.
 *
 * Esa asimetría es el motor del modo: el que pierde elige entre ir corto o
 * guardar para la siguiente, y el que gana elige entre arma o utilidad.
 */
export const ECONOMY = {
  /** Con lo que se empieza la ronda 1. Es justo chaleco + granada. */
  inicial: 800,
  /** Tope de saldo. Nadie acumula una partida entera sin gastar. */
  maximo: 16000,
  premios: {
    /** Ganar la ronda. El salto grande. */
    victoria: 3200,
    /** Perderla. Da para un subfusil con algo de equipo, no para un rifle. */
    derrota: 2400,
    /**
     * Y perder **seguidas** sube el suelo: sin esto, quien encadena tres rondas
     * malas no vuelve nunca. Se suma a partir de la segunda derrota seguida y
     * no pasa de `rachaMax` escalones.
     */
    rachaDerrota: 400,
    rachaMax: 2,
    /** Por matar. En un 1v1 el que mata gana la ronda, así que se acumula. */
    baja: 300,
  },
  /**
   * **El catálogo, y su combinación de compra rápida.** Cada entrada dice su
   * categoría y su código dentro de ella, que es lo que se teclea tras la tecla
   * de la armería: la Pulse es `B 1 1`, la Volt `B 3 1` y la Rift `B 4 3`.
   *
   * Los códigos **no son correlativos a propósito**: dejan el sitio de las armas
   * que faltan (la 4 2 de otro rifle, la 2 de las escopetas), porque el día que
   * lleguen no pueden mover de sitio lo que la gente ya tiene en los dedos.
   *
   * `disponible: false` es lo que todavía no existe en el juego. Sale en el
   * panel, con su precio y su combinación, y **no se puede comprar**: prometer
   * una granada que no vuela sería peor que no enseñarla.
   */
  /**
   * **Lo que se vende, y lo que no se vende porque no se compra** (vuelta 73).
   *
   * Dos cosas quedaron fuera de esta lista y las dos por el mismo motivo: en el
   * juego son **gratis y tuyas**, así que un precio al lado decía lo contrario
   * que el juego.
   *
   * - **El supresor** estaba aquí a 250 como accesorio, y no lo es: se conmuta
   *   con el clic derecho, en los dos modos, en cualquier fase y sin coste —esa
   *   regla es de la vuelta 64, y este artículo la contradecía—. Lo que hacía
   *   falta no era un artículo sino decir con qué se pone, y eso va en la ficha
   *   del arma, que es donde se busca.
   * - **El cuchillo** no está y no puede estar: se lleva siempre, como la
   *   pistola. Y no se queda fuera por olvido sino **por construcción** —
   *   `catalogoSano()` no deja pasar un arma de cuerpo a cuerpo—, porque una
   *   lista escrita a mano es una lista donde un día se cuela algo.
   */
  catalogo: [
    { clave: 'pulse', nombre: 'Pulse', tipo: 'arma', ranura: 'secondary', categoria: 1, codigo: 1, precio: 0, deSerie: true, disponible: true },
    { clave: 'volt', nombre: 'Volt', tipo: 'arma', ranura: 'primary', categoria: 3, codigo: 1, precio: 1600, disponible: true },
    { clave: 'rift', nombre: 'Rift', tipo: 'arma', ranura: 'primary', categoria: 4, codigo: 3, precio: 2900, disponible: true },
    // **La Scout cuesta más que el rifle** porque una bala al cuerpo mata a
    // quien no lleve chaleco. Y 3100 deja intacta la regla de la ronda 2: con
    // los 2700 del que pierde no llega, guarde o no los 300 del chaleco.
    { clave: 'scout', nombre: 'Scout', tipo: 'arma', ranura: 'primary', categoria: 5, codigo: 1, precio: 3100, disponible: true },
    /**
     * **El arco y el U2** (vueltas 85 y 86), en su propia categoría: no son
     * rifles ni francotiradores, son **armas que lanzan algo**, y meterlos con
     * los otros haría que la categoría dejara de significar nada. Los códigos
     * siguen sin ser correlativos a propósito (vuelta 64): dejan sitio a lo que
     * venga sin mover de los dedos lo que la gente ya se sabe.
     *
     * El arco a 2400 —entre el subfusil y el rifle— porque mata de un tiro sólo
     * cargado y hay que adelantar a quien se mueve. El U2 a 4200, el artículo
     * más caro del catálogo: con dos cohetes y un área de cinco unidades, un
     * precio de rifle lo convertiría en el arma de todas las rondas.
     */
    { clave: 'bow', nombre: 'Bow', tipo: 'arma', ranura: 'primary', categoria: 8, codigo: 1, precio: 2400, disponible: true },
    { clave: 'u2', nombre: 'U2', tipo: 'arma', ranura: 'primary', categoria: 8, codigo: 2, precio: 4200, disponible: true },
    { clave: 'chaleco', nombre: 'Chaleco', tipo: 'equipo', categoria: 6, codigo: 1, precio: 500, disponible: true },
    { clave: 'casco', nombre: 'Casco', tipo: 'equipo', categoria: 6, codigo: 2, precio: 350, disponible: true },
    { clave: 'granada', nombre: 'Granada', tipo: 'utilidad', categoria: 7, codigo: 1, precio: 300, disponible: false },
    { clave: 'aturdidora', nombre: 'Aturdidora', tipo: 'utilidad', categoria: 7, codigo: 2, precio: 250, disponible: false },
    { clave: 'cegadora', nombre: 'Cegadora', tipo: 'utilidad', categoria: 7, codigo: 3, precio: 250, disponible: false },
  ],
  /** Cómo se llama cada categoría en el panel. */
  categorias: {
    1: 'Pistolas',
    2: 'Escopetas',
    3: 'Subfusiles',
    4: 'Rifles de asalto',
    5: 'Francotirador',
    6: 'Equipo',
    7: 'Utilidad',
    8: 'Proyectil',
  },
  /**
   * **El techo de la ronda 1**: los tipos que se pueden comprar. Sin `arma`, así
   * que la primera ronda se juega con la pistola pase lo que pase.
   */
  techoRonda1: ['equipo', 'utilidad'],
  /** Lo que da un chaleco, en puntos de escudo. Un segmento de los de siempre. */
  escudoPorChaleco: PLAYER.shield.segment,
}

/**
 * **El catálogo de verdad, saneado** (vuelta 73), y lo miran los dos extremos:
 * el cliente para montar el panel y el servidor para aceptar una compra. Es la
 * misma idea que `compraAbierta` y que `escenarioDeDuelo` — escrito en cada
 * lado se despega, y el síntoma sería el peor de los dos: un artículo que el
 * panel enseña y el servidor rechaza sin decir por qué.
 *
 * Hoy quita una sola cosa, y es la que el encargo pedía garantizar: **un arma
 * de cuerpo a cuerpo no se compra**. El Vanta se lleva siempre, como la
 * pistola, en cualquier mapa y sin coste, y que no esté en la lista de arriba
 * no basta — una lista escrita a mano es una lista donde un día se cuela algo.
 * Aquí no puede: la regla sale de `WEAPONS[clave].slot`, que es el mismo dato
 * del que salen `PRIMARY_WEAPONS`, `SECONDARY_WEAPON` y `MELEE_WEAPON`.
 */
export function catalogoDeTienda() {
  return ECONOMY.catalogo.filter((item) => WEAPONS[item.clave]?.slot !== 'melee')
}

export const ROUNDS = {
  /**
   * **Par a propósito**: con un número impar no hay empate posible y la
   * prórroga no llegaría nunca. La mayoría son ocho.
   */
  maxRondas: 14,
  /** Lo que dura una ronda si nadie muere. */
  duracionSegundos: 180,
  /**
   * **Cuándo se avisa de que la ronda se acaba** (vuelta 73). Hasta aquí no se
   * avisaba: el jugador se encontraba de vuelta en su salida sin que nada se lo
   * hubiera dicho, y con tres minutos por ronda mirar el reloj no es algo que
   * se haga en mitad de un intercambio.
   *
   * Quince segundos son los que dura una fase de compra, que es la unidad de
   * tiempo que este modo ya tiene: lo que se avisa es «te queda lo que dura
   * comprar». Por debajo de diez no da tiempo a cambiar de plan y por encima de
   * veinte el pitido se vuelve el fondo de la ronda.
   */
  avisoFinalSegundos: 15,
  /**
   * **La fase de compra, entre una ronda y la siguiente** — y desde la vuelta 64
   * esto es sólo el **valor por defecto**: quien crea la partida la elige en la
   * pantalla del duelo y viaja en la dirección del socket (`?compra=…`), como el
   * pase de reconexión y por el mismo motivo —la sala se configura al crearse,
   * antes de que llegue ningún mensaje—.
   *
   * **A cero, no hay fase de compra**: las rondas se encadenan sin pausa, que es
   * lo que hace falta para una partida rápida (y lo que necesitaban los bancos
   * que miden el motor, que hasta ahora se apañaban con `VEKTOR_RONDAS=0`).
   */
  compraSegundos: 15,
  /** Lo que ofrece el selector de la pantalla del duelo. El 0 es «sin fase». */
  compraOpciones: [0, 5, 10, 15, 20, 30],
  /**
   * **La prórroga se juega en tandas, no a muerte súbita.** Con una sola ronda
   * de desempate, las trece anteriores valdrían lo mismo que la catorceava. Al
   * final de cada tanda gana quien vaya por delante; si la tanda queda igualada,
   * otra tanda. A 1 es muerte súbita, que es lo que hay que poner si algún día
   * se decide lo contrario.
   */
  prorrogaTanda: 2,
  /**
   * **El corralito de la compra**, centrado en la salida de cada jugador. Es la
   * caja dentro de la que se puede andar mientras se compra: 4 u de lado, que
   * con las dos salidas a 5 u una de otra **no se solapan**.
   */
  cajaCompra: { ancho: 4, fondo: 4 },
  /**
   * **Cuánto se espera a que alguien vuelva de una caída** antes de dar la
   * partida por abandonada (vuelta 62). Noventa segundos: por encima de lo que
   * cuesta recargar la página y volver —de diez a veinte— y de desbloquear un
   * PC —de treinta a sesenta—, y por debajo de los 120 de una pausa libre, que
   * es el otro extremo de la misma escala. Ninguna pausa que no se elige puede
   * durar lo que una que sí.
   */
  reconexionSegundos: 90,
  /**
   * **Y el que espera no queda secuestrado.** Pasados estos segundos le sale el
   * botón de dar la partida por abandonada, que cierra la ventana cuando él
   * quiera. Es la otra mitad de la regla de la vuelta 55: parar el mundo de
   * alguien no puede ser un efecto secundario de lo que le pase a otro.
   */
  abandonoDesdeSegundos: 15,
}

export const NET = {
  /** Puerto del servidor de pruebas local (`npm run net`). */
  port: 5199,
  /**
   * **Por dónde se entra al duelo** (vuelta 66). Una ruta que no es un fichero:
   * la sirven los dos huéspedes y —desde esta vuelta— también el servidor de
   * desarrollo, así que `/duelo/` lleva a la página del 1v1 **en los tres
   * sitios**. Hasta aquí en local había que escribir `/net/prueba.html`, que es
   * una diferencia entre desarrollo y despliegue que no decidió nadie.
   *
   * Está aquí porque la miran cuatro: el botón del menú, `vite.config.js`, el
   * huésped de Node y el Worker. Cuatro literales iguales es como uno se queda
   * atrás el día que cambie.
   */
  rutaDuelo: '/duelo/',
  /**
   * **Y por dónde se vuelve al juego** (vuelta 67). El botón «Salir de la
   * partida» mandaba el adiós y dejaba al jugador mirando la misma pantalla,
   * con el menú de una partida de la que acababa de irse: irse tiene que llevar
   * a algún sitio, y el sitio es el menú principal.
   */
  rutaJuego: '/',
  /**
   * **El escenario del duelo, y es uno solo** (vuelta 66). Lo miran los dos
   * extremos —la página monta el motor con él y el huésped monta la partida— y
   * tienen que coincidir: el cliente predice su propio movimiento contra la
   * geometría que tiene montada, así que dos escenarios distintos son una
   * corrección por paso contra paredes que sólo existen en un lado.
   *
   * Hasta la 65 estaba escrito dos veces —una constante en `net/prueba.js` y
   * otra en `net/servidor.mjs`— y funcionaba porque decían lo mismo.
   */
  escenario: 'duelo',
  /**
   * **Cuánto sobrevive una sala vacía en el huésped de Node** (vuelta 58).
   *
   * No es lo mismo parar el reloj que olvidar el mundo, y hacen falta las dos
   * cosas por razones distintas. El reloj para al salir el último —una sala
   * vacía no gasta reloj— pero **el número de paso se conserva**, que es lo que
   * hace que volver a entrar con el mismo código no sea empezar otra partida.
   *
   * En Cloudflare eso salía gratis: el Durable Object se queda en memoria un
   * rato y luego la plataforma lo desaloja. Aquí el proceso es nuestro y nadie
   * desaloja nada, así que una sala por cada código que alguien haya tecleado
   * nunca se iría. Diez minutos es de sobra para que quien se cae vuelva a su
   * partida, y corto para que la memoria no crezca sola.
   */
  salaOlvidadaMs: 600000,
  /**
   * **Cada cuánto el huésped comprueba que el cable sigue vivo** (vuelta 62).
   * Un portátil que se duerme o un cable arrancado no producen cierre hasta que
   * TCP se rinde —minutos—, así que sin esto el rival se quedaría mirando a un
   * jugador congelado sin que nadie diga nada. Dos intervalos sin contestar y el
   * huésped cierra el socket; de ahí en adelante es una caída como cualquier
   * otra. Cinco segundos: el peor caso son diez para enterarse, muy por debajo
   * de los noventa de la ventana de reconexión.
   */
  pingMs: 5000,
  /**
   * Cuántas entradas acumula el servidor antes de empezar a consumir. Es el
   * colchón contra el jitter: con menos, una entrada que llega tarde deja al
   * jugador sin avanzar ese paso.
   */
  jitterBufferTicks: 2,
  /**
   * Tope de entradas que el servidor consume en un solo paso para ponerse al
   * día tras un atasco. Sin tope, un cliente que se congela y vuelve dispararía
   * una avalancha de pasos.
   */
  maxCatchUpTicks: 4,
  /** Cuánto se adelanta el cliente al servidor, en pasos, además del RTT. */
  leadTicks: 2,
  /**
   * Banda muerta al engancharse al reloj del servidor, en pasos. Por debajo de
   * esto no se corrige: el RTT se mide con ruido y perseguirlo daría tirones.
   */
  clockDeadbandTicks: 2,
  /** Entradas sin confirmar que se guardan para reejecutar. 3 s a 60 Hz. */
  maxPendingInputs: 180,
  /** Cada cuántos pasos sale una foto del mundo. 1 = una por paso. */
  snapshotEvery: 1,
  /**
   * Retardo con el que se dibuja al rival, en pasos. Se le dibuja **en el
   * pasado**, entre dos fotos ya recibidas, porque extrapolar al futuro es
   * inventarse dónde está.
   */
  interpDelayTicks: 3,
  /** Una corrección por debajo de esto no se cuenta como visible, en unidades. */
  visibleCorrection: 0.01,

  /**
   * **Cuánto rebobina el servidor, como mucho** (vuelta 46). Un disparo se
   * juzga contra lo que el tirador tenía en pantalla, y eso son `RTT +
   * interpolación` hacia atrás. Sin tope, un cliente con 800 ms de ping —o que
   * miente sobre su ping— dispararía a donde estabas hace casi un segundo.
   *
   * 200 ms es el valor de referencia de Source, y es el que acota la asimetría
   * que sufre el que recibe: «me han matado detrás de la pared» nunca puede
   * pasar de este número. El día que haya partidas públicas, además del tope
   * hará falta que el RTT lo mida el servidor —y ya lo hace: sale de qué foto
   * dice el cliente haber recibido, no de un número que mande.
   */
  maxRewindMs: 200,
  /**
   * Pasos de historial de cuerpos que guarda el servidor por jugador. Tiene que
   * cubrir el rebobinado máximo con margen: 60 pasos son un segundo.
   */
  historyTicks: 60,
  /** Alcance de un disparo, en unidades. Más allá no se comprueba nada. */
  shotRange: 60,
  /** Con la vida a cero, cuánto tarda en volver. Sin escalado todavía. */
  respawnMs: 2000,
  /**
   * **La holgura con la que el servidor valida la cadencia** (vuelta 56), en
   * pasos.
   *
   * El arma la lleva el cliente —cargador, recarga, retroceso y sonido son
   * suyos— y lo que el servidor comprueba es una sola cosa: que entre dos
   * disparos aceptados haya pasado lo que las RPM de esa arma dicen. Es el
   * reparto barato: unas cuarenta líneas aquí contra el modelo de arma entero
   * al otro lado, y cubre lo único que se gana haciendo trampa con un arma.
   *
   * La holgura es **un paso, y no un número inventado**: el cliente programa
   * sus disparos con su reloj de mundo, que avanza en pasos de `SIM_STEP_MS`,
   * así que dos disparos consecutivos caen en la rejilla de pasos y el hueco
   * real alterna entre el suelo y el techo del intervalo. Un paso es justo esa
   * cuantización. Lo que cuesta: con la Pulse (500 RPM, 120 ms) la holgura es
   * el 14% del intervalo, así que un cliente que mienta puede ganar como mucho
   * eso — no un arma automática de la nada.
   *
   * Y la cadencia se mide sobre `instanteDePaso(n)` y **no** sobre la fracción
   * del disparo: la fracción existe para el rebobinado, que necesita saber el
   * instante exacto; la cadencia sólo necesita un reloj monótono que los dos
   * extremos compartan, y el número de paso lo es (ver `protocolo.js`).
   */
  shotRateSlackTicks: 1,
  /**
   * En cuántas fotos seguidas se repite el veredicto de un disparo. Mandarlo
   * una sola vez significa que perder esa foto pierde el veredicto para
   * siempre; el cliente los descarta por número, así que repetir no cuesta.
   */
  verdictRepeats: 8,
  /**
   * Cuánto dura la marca de impacto sobre la mira (vuelta 48). Es el único
   * aviso de que le has dado a alguien, y va **corta** a propósito: lo que tiene
   * que confirmar es el disparo que acabas de hacer, no quedarse encima del
   * siguiente.
   *
   * Y va en `NET` y no en `FEEDBACK` porque es de la página del duelo, no del
   * juego: el aviso nace de un veredicto del servidor, que es algo que en el
   * juego de un solo jugador no existe.
   */
  hitMarkerMs: 140,
  /**
   * Y cuánto dura la de **baja** (vuelta 52). Más larga que la de impacto a
   * propósito: una baja es el final de algo y se mira; un impacto es
   * información de camino y no puede quedarse encima del disparo siguiente.
   */
  killMarkerMs: 420,
  /**
   * **Cuánto atraso se recupera corriendo, y a partir de dónde se re-ancla el
   * reloj** (vuelta 49).
   *
   * El cliente se engancha al reloj del servidor con `maxCatchUpTicks` pasos de
   * más por frame, y eso tapa bien un frame perdido. Lo que no tapa es una
   * pestaña en segundo plano: el navegador **para el `requestAnimationFrame`**,
   * el jugador se queda cientos o miles de pasos por detrás y al volver el
   * enganche los gasta a 240 pasos de más por segundo — medido, 320-360 pasos/s,
   * cinco o seis veces el tiempo real, y el rival viéndole correr a 25 u/s
   * contra los 6.5 de carrera.
   *
   * Por encima de este atraso no se corre: **se re-ancla**, que es lo mismo que
   * hace el motor con un frame largo (`SIM.maxFrameDeltaMs`) y el Durable Object
   * con un parón. El tiempo que has estado fuera no se recupera porque no hay
   * nada que recuperar: sin bucle no hubo entradas, y el servidor, que no
   * adivina, te dejó parado donde estabas.
   *
   * 60 pasos son un segundo de mundo y **un cuarto de segundo de enganche**
   * (60 / 240): el burst más largo que todavía se lee como un tirón y no como un
   * rebobinado.
   */
  resyncTicks: 60,
  /**
   * **Cuándo deja de ser de fiar el reloj del servidor** (vuelta 51).
   *
   * El enganche al reloj frena al cliente cuando va por delante, restándole un
   * paso por frame. Eso está bien contra un reloj que avanza; contra uno
   * **parado** es una trampa sin fondo: si dejan de llegar fotos,
   * `pasoServidor` se congela, el desfase crece hacia abajo sin límite y el
   * cliente se frena hasta **cero pasos por segundo** — medido: 60 → 3 → 0 en
   * cuatro segundos, y de ahí no sale. El jugador no se puede mover y se queda
   * clavado en el punto de aparición, que además está detrás del muro, así que
   * el rival no le ve en absoluto.
   *
   * Pasada esta silencio, el reloj del servidor no se consulta: el cliente sigue
   * prediciendo a tiempo real por su acumulador, que es lo que tiene que hacer
   * mientras no haya noticias. Son unas 15 fotos a `snapshotEvery` 1.
   */
  clockStaleMs: 250,
  /**
   * **Y cuándo se le dice al jugador que no hay conexión.** Unas 90 fotos: lo
   * bastante para no dar un susto por un hipo de medio segundo, y lo bastante
   * poco para que nadie siga jugando dos minutos contra un servidor que no está.
   * Punto de partida, a calibrar jugando.
   */
  offlineMs: 1000,
}

/**
 * **La pausa, que es una regla de juego y no del cable** (vueltas 53 y 54).
 *
 * Vivía dentro de `NET` mientras fueron dos números, y ahora son cuatro: tener
 * la mitad de lo que se toca al calibrar una pausa en un sitio y la otra mitad
 * en otro es cómo se acaba cambiando uno y olvidando el que le hacía pareja.
 * Lo que decide quién puede pausar y cuánto dura va aquí; lo que decide cómo
 * viajan los bytes sigue en `NET`.
 *
 * **Y se mide en reloj de pared, a propósito.** La convención del proyecto es
 * que los relojes que pueden esperar van por delta y en pausa no corren; éste
 * es exactamente el contrario, porque es *el de la pausa*: si se parase con el
 * mundo, la cuenta atrás no bajaría nunca y el máximo no existiría.
 */
export const PAUSE = {
  /**
   * **Pausas libres por jugador y partida** (vuelta 53).
   *
   * Pausar en un 1v1 no es gratis: para el mundo de los dos, y quien la pide
   * elige el momento. Tres sin preguntar es bastante para lo que las pausas son
   * de verdad —el timbre, un vaso de agua— y poco para usarlas como táctica.
   * A partir de la cuarta hay que pedírselo al rival, que es exactamente la
   * conversación que tendrían en la misma habitación.
   *
   * No se recuperan: son por partida, y una partida dura lo que dure la sala.
   */
  free: 3,
  /**
   * **Cuánto dura el cartel de la votación** (vuelta 55). Pasado ese tiempo la
   * votación se resuelve con lo que haya: quien no ha contestado se suma a la
   * opción que más apoyo tenga.
   *
   * Se llamaba `answerMs` y era «cuánto se espera antes de darla por negada»
   * hasta la 54. Ya no hay negativa por silencio, porque ya no hay nadie
   * esperando: quien la pide vuelve a jugar en el acto y el mundo no se para
   * mientras se decide. 15 s es lo que tarda en leerse un cartel sin dejar de
   * jugar, y poco para que se quede de adorno en pantalla.
   */
  voteWindowSeconds: 15,
  /**
   * **Cuánto puede durar una pausa libre** (vuelta 54). Al agotarse se reanuda
   * sola, y la cuenta se ve en el propio cartel.
   *
   * Una pausa sin tope no es una pausa, es un abandono con el mundo parado: el
   * rival se queda mirando un cartel sin nada que pueda hacer al respecto, y el
   * único límite que había era que el otro se dignara a volver. Dos minutos es
   * de sobra para lo que las pausas son —el timbre, un vaso de agua— y poco
   * para irse a hacer otra cosa. Punto de partida, a calibrar jugando.
   */
  freeMaxSeconds: 120,
  /**
   * **Y cuánto dura la votada**, la que el rival ha tenido que conceder. La
   * mitad, porque el que dice que sí está pagando un rato parado que no ha
   * elegido: una cosa es concederle un minuto a alguien y otra firmarle un
   * cheque en blanco. Mismo cartel y misma cuenta atrás.
   */
  votedMaxSeconds: 60,
}
