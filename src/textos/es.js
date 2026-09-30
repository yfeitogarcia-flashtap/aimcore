/**
 * **Español neutro: la fuente** (vuelta 108, propuesta 18).
 *
 * Es el idioma principal y el que manda: cualquier otro catálogo sólo puede
 * tener claves que estén aquí, con los mismos huecos (`textos108` lo mide), y lo
 * que le falte a otro idioma sale de aquí.
 *
 * **Neutro quiere decir que lo lea igual alguien de México, de Colombia, de
 * Argentina o de España**: se tutea (tú, y ustedes para el plural, nunca
 * vosotros), «mouse» y no «ratón», «clic» y no «pinchar», «archivo» y no
 * «fichero», «caminar» y no «andar», y **nunca «coger»**, que en buena parte de
 * Latinoamérica es vulgar: «recoger», «tomar» o «agarrar» según el caso.
 * `textos108` rechaza cualquier «coger» que se cuele aquí.
 *
 * **Todavía no lo lee ninguna pantalla.** Lo que hay es el primer trozo que se
 * va a mudar —los paneles de la beta, el aviso de la peana y los motivos que
 * manda el servidor— ya escrito en neutro, para que la mudanza de cada zona sea
 * cambiar un texto escrito a mano por su `t('clave')` y nada más.
 */
export default {
  comun: {
    volver: 'Volver',
    entendido: 'Entendido',
    enviar: 'Enviar',
    enviando: 'Enviando…',
  },

  // Cómo se juega (src/ui/Beta.jsx, vuelta 107). Los huecos son teclas: las
  // pone quien pinta, sacadas del bind (vuelta 97), nunca escritas aquí.
  como: {
    titulo: 'Cómo se juega',
    entrenamiento: '{entrenamiento}: dispara a las dianas y, en la ronda con explosivo, desactívalo antes de que estalle.',
    multijugador: '{multijugador}: crea una sala, comparte el enlace, que cada uno marque LISTO y a jugar.',
    nombreEntrenamiento: 'Entrenamiento',
    nombreMultijugador: 'Multijugador',
    apunta: {
      titulo: 'Apunta y dispara',
      texto: 'El mouse apunta; {disparar} dispara y {recargar} recarga. El clic derecho es la segunda función del arma: mira telescópica o silenciador.',
    },
    muevete: {
      titulo: 'Muévete',
      texto: '{mover} para caminar, {saltar} salta y {agacharse} te agacha. Corriendo, agacharte te hace deslizar; en el aire, gira el mouse hacia el lado al que te desplazas para ganar velocidad.',
    },
    equipate: {
      titulo: 'Equípate',
      texto: '{armeria} abre la armería. {principal} principal, {pistola} pistola, {cuchillo} cuchillo. {usar} usa lo que tengas enfrente.',
    },
    para: {
      titulo: 'Pausa cuando quieras',
      texto: '{esc} abre la pausa, con Opciones y «Enviar feedback»: cuéntanos lo que no funcione.',
    },
  },

  // Enviar feedback (src/ui/Beta.jsx).
  feedback: {
    titulo: 'Enviar feedback',
    intro: 'Qué pasó, qué esperabas y qué harías distinto. Lo lee quien hace el juego.',
    ejemplo: 'p. ej. en El Espejo, al reaparecer, no veía mi arma',
    viaja: 'Se envía tu texto con {contexto} y la versión del juego. Nada más: ni tu nombre, ni tu correo, ni cookies.',
    laPantalla: 'la pantalla',
    enviado: 'Enviado. Gracias.',
    noEnviado: 'No se envió: {error}.',
  },

  // El aviso bajo la mira al apuntar a una peana (engine.js, vuelta 106). Es
  // el «coger» que más se ve del juego, y aquí ya no está.
  peana: {
    recoger: '{tecla} · Recoger {arma}',
    recargar: '{tecla} · Recargar {arma}',
    lleno: '{arma} · lleno',
    // Hoy el jugador lee «No se puede coger: lejos» (engine.js), con el código
    // del servidor pegado detrás. Con el catálogo, el servidor manda el código y
    // aquí está la frase entera de cada uno.
    noSePuede: {
      lejos: 'Estás demasiado lejos para recogerla',
      pared: 'Hay una pared en medio',
      noEsArma: 'Eso no se puede recoger',
      granadas: { one: 'Solo puedes llevar {n} tipo de granada', other: 'Solo puedes llevar {n} tipos de granada' },
    },
  },

  // Lo que el servidor manda redactado en un ADIOS (config.js, vuelta 107).
  // Con el catálogo, el servidor manda la clave y el cliente la traduce.
  motivo: {
    noListo: 'No marcaste LISTO',
    sacado: 'El anfitrión te sacó de la sala',
    inactividad: 'Te expulsamos por inactividad',
  },

  // La sala del multijugador (src/ui/Lobby.jsx y net/lobby.js). Son los
  // «vosotros» y los «pincha» que la auditoría marca como obligatorios.
  sala: {
    // Un plural, con la forma que tendrán todos: hoy el lobby lo arma a mano.
    faltan: { one: 'Falta {n} jugador', other: 'Faltan {n} jugadores' },
    siguiente: 'Cuando termine, el anfitrión puede lanzar la siguiente con quienes estén listos.',
    desequilibrado: 'Dos equipos de hasta {porEquipo}, a {rondas} rondas. Se puede empezar con equipos desiguales: basta un listo en cada equipo.',
    cambiarLugar: 'Haz clic en un lugar libre para cambiarte.',
    mezclar: 'Puedes mezclar los equipos.',
    cambiarColor: 'Haz clic en un lugar libre para cambiar de color.',
    // Lo redacta hoy el servidor, con el plural a mano: aquí la clave y los datos.
    noCaben: {
      one: 'Hay {enSala} en la sala y en este mapa caben {huecos}: elige uno con más salidas o que salga {n}',
      other: 'Hay {enSala} en la sala y en este mapa caben {huecos}: elige uno con más salidas o que salgan {n}',
    },
    enJuego: 'Hay una partida en juego',
  },
}
