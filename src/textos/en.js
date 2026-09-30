/**
 * **English** (vuelta 108, propuesta 18). Sólo claves que existan en `es.js`,
 * con los mismos huecos: `textos108` lo mide. Lo que falte aquí sale en español.
 *
 * Hoy lleva el mismo primer trozo que la fuente, para que el mecanismo se pueda
 * ver funcionando en los dos sentidos antes de mudar ninguna pantalla.
 */
export default {
  comun: {
    volver: 'Back',
    entendido: 'Got it',
    enviar: 'Send',
    enviando: 'Sending…',
  },

  como: {
    titulo: 'How to play',
    entrenamiento: '{entrenamiento}: shoot the targets and, in the bomb round, defuse it before it goes off.',
    multijugador: '{multijugador}: create a room, share the link, everyone marks READY and play.',
    nombreEntrenamiento: 'Training',
    nombreMultijugador: 'Multiplayer',
    apunta: {
      titulo: 'Aim and shoot',
      texto: 'The mouse aims; {disparar} shoots and {recargar} reloads. Right-click is the weapon’s second function: scope or silencer.',
    },
    muevete: {
      titulo: 'Move',
      texto: '{mover} to walk, {saltar} jumps and {agacharse} crouches. Crouching while running makes you slide; in the air, turn the mouse towards the side you’re strafing to gain speed.',
    },
    equipate: {
      titulo: 'Gear up',
      texto: '{armeria} opens the armory. {principal} primary, {pistola} pistol, {cuchillo} knife. {usar} uses whatever is in front of you.',
    },
    para: {
      titulo: 'Pause any time',
      texto: '{esc} opens the pause menu, with Options and “Send feedback”: tell us what isn’t working.',
    },
  },

  feedback: {
    titulo: 'Send feedback',
    intro: 'What happened, what you expected and what you would do differently. The people making the game read it.',
    ejemplo: 'e.g. on El Espejo, after respawning, I couldn’t see my weapon',
    viaja: 'Your text is sent with {contexto} and the game version. Nothing else: not your name, not your email, no cookies.',
    laPantalla: 'the screen',
    enviado: 'Sent. Thank you.',
    noEnviado: 'Not sent: {error}.',
  },

  peana: {
    recoger: '{tecla} · Pick up {arma}',
    recargar: '{tecla} · Reload {arma}',
    lleno: '{arma} · full',
    noSePuede: {
      lejos: 'You’re too far away to pick it up',
      pared: 'There’s a wall in the way',
      noEsArma: 'That can’t be picked up',
      granadas: { one: 'You can only carry {n} type of grenade', other: 'You can only carry {n} types of grenade' },
    },
  },

  motivo: {
    noListo: 'You didn’t mark READY',
    sacado: 'The host removed you from the room',
    inactividad: 'You were kicked for inactivity',
  },

  sala: {
    faltan: { one: '{n} more player needed', other: '{n} more players needed' },
    siguiente: 'When it ends, the host can start the next one with whoever is ready.',
    desequilibrado: 'Two teams of up to {porEquipo}, over {rondas} rounds. Uneven teams can start: one ready player per team is enough.',
    cambiarLugar: 'Click a free slot to switch.',
    mezclar: 'You can shuffle the teams.',
    cambiarColor: 'Click a free slot to change color.',
    noCaben: {
      one: 'There are {enSala} in the room and this map fits {huecos}: pick one with more spawns or {n} player has to leave',
      other: 'There are {enSala} in the room and this map fits {huecos}: pick one with more spawns or {n} players have to leave',
    },
    enJuego: 'A match is in progress',
  },
}
