/**
 * **Lo imprescindible de la beta, en el huésped** (vuelta 107): el buzón de
 * feedback y el contador. Node y nada más —no lo monta el Durable Object, que
 * es respaldo—, y **sin datos de nadie**: ni cookies, ni identificadores, ni
 * direcciones guardadas. La IP se mira un instante para frenar a quien mande
 * cien mensajes, y no se escribe en ninguna parte.
 *
 * - **Feedback**: lo que se escribe en el juego llega aquí con la pantalla, el
 *   modo, el mapa y la versión, y se reenvía a un webhook si hay uno configurado
 *   (`VEKTOR_FEEDBACK_WEBHOOK`, el de un canal de Discord: se lee sin programar).
 *   Sin webhook, se guardan los últimos en memoria —y en disco si hay dónde
 *   (`VEKTOR_DATOS`)— y se leen en `/feedback/leer?clave=…` con la clave que
 *   ponga el dueño (`VEKTOR_FEEDBACK_CLAVE`). Sin clave, esa página no existe.
 * - **Contador**: salas creadas, partidas lanzadas, jugadores que entran en una
 *   partida y entrenamientos empezados, por día, y el pico de gente a la vez.
 *   Se ve en `/contador`. Son sumas: no dicen quién ni desde dónde.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BETA_UI as BETA } from '../src/config.js'

const DATOS = process.env.VEKTOR_DATOS || null
if (DATOS && !existsSync(DATOS)) {
  try { mkdirSync(DATOS, { recursive: true }) } catch { /* sin disco: sólo memoria */ }
}
const hoy = () => new Date().toISOString().slice(0, 10)
const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ----------------------------------------------------------------- contador

const FICHERO_CONTADOR = DATOS ? resolve(DATOS, 'contador.json') : null
/** `{ 'AAAA-MM-DD': { salas, partidas, jugadores, entrenos, pico } }` */
let dias = {}
try {
  if (FICHERO_CONTADOR && existsSync(FICHERO_CONTADOR)) dias = JSON.parse(readFileSync(FICHERO_CONTADOR, 'utf8'))
} catch { dias = {} }
let sucio = false

function delDia() {
  const d = hoy()
  if (!dias[d]) {
    dias[d] = { salas: 0, partidas: 0, jugadores: 0, entrenos: 0, pico: 0 }
    const claves = Object.keys(dias).sort()
    for (const vieja of claves.slice(0, Math.max(0, claves.length - BETA.contadorDias))) delete dias[vieja]
  }
  sucio = true
  return dias[d]
}

export const contador = {
  sala() { delDia().salas += 1 },
  partida(jugadores) {
    const d = delDia()
    d.partidas += 1
    d.jugadores += jugadores
  },
  entreno() { delDia().entrenos += 1 },
  /** Cuánta gente hay en partida ahora mismo: el pico del día sale de aquí. */
  ahora(n) {
    const d = dias[hoy()]
    if (n > (d?.pico ?? 0)) delDia().pico = n
  },
  get dias() { return dias },
}

// Al disco una vez por minuto, y sólo si ha cambiado algo.
if (FICHERO_CONTADOR) {
  setInterval(() => {
    if (!sucio) return
    sucio = false
    try { writeFileSync(FICHERO_CONTADOR, JSON.stringify(dias)) } catch { /* se sigue en memoria */ }
  }, 60_000).unref()
}

export function paginaDelContador() {
  const filas = Object.entries(dias).sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([d, c]) => `<tr><td>${d}</td><td>${c.salas}</td><td>${c.partidas}</td><td>${c.jugadores}</td><td>${c.entrenos}</td><td>${c.pico}</td></tr>`)
    .join('')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vektor · contador</title>
<style>body{background:#0a0a0a;color:#e8e8e8;font:14px/1.5 system-ui,sans-serif;margin:24px}table{border-collapse:collapse}td,th{padding:4px 12px;border-bottom:1px solid #2a2a2a;text-align:right}th{color:#9a9a9a;font-weight:600}td:first-child,th:first-child{text-align:left}p{color:#9a9a9a;max-width:60ch}</style>
<h1>Vektor · contador de la beta</h1>
<p>Sumas por día, sin cookies ni datos de nadie. «Jugadores» cuenta cada entrada en una partida (quien juega tres partidas cuenta tres). ${FICHERO_CONTADOR ? '' : 'Sin disco configurado: se pone a cero con cada despliegue.'}</p>
<table><tr><th>Día</th><th>Salas</th><th>Partidas</th><th>Jugadores</th><th>Entrenamientos</th><th>Pico a la vez</th></tr>${filas || '<tr><td colspan="6">Todavía nada.</td></tr>'}</table>`
}

// ----------------------------------------------------------------- feedback

const FICHERO_FEEDBACK = DATOS ? resolve(DATOS, 'feedback.jsonl') : null
const guardados = []
const porIp = new Map()

/** ¿Puede mandar otro? La IP se usa aquí y se olvida con su ventana. */
function admite(ip) {
  const ahora = Date.now()
  const lista = (porIp.get(ip) ?? []).filter((t) => ahora - t < BETA.feedbackVentanaMs)
  if (lista.length >= BETA.feedbackPorVentana) { porIp.set(ip, lista); return false }
  lista.push(ahora)
  porIp.set(ip, lista)
  return true
}
setInterval(() => {
  const ahora = Date.now()
  for (const [ip, lista] of porIp) if (lista.every((t) => ahora - t >= BETA.feedbackVentanaMs)) porIp.delete(ip)
}, 60_000).unref()

/** Sólo campos conocidos, cortos y en texto: lo que llega no se cree. */
function sanear(cuerpo) {
  const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim().slice(0, BETA.feedbackMax) : ''
  if (!texto) return null
  const corto = (v) => (typeof v === 'string' ? v.slice(0, 60) : '')
  return {
    cuando: new Date().toISOString(),
    texto,
    donde: corto(cuerpo.donde),
    modo: corto(cuerpo.modo),
    mapa: corto(cuerpo.mapa),
    version: corto(cuerpo.version),
    app: Boolean(cuerpo.app),
  }
}

/**
 * **Recibe un mensaje.** Devuelve `{ ok, error? }` con el código HTTP que toca.
 * El webhook va aparte y sin esperar: si Discord tarda, el jugador no lo nota.
 */
export function recibirFeedback(cuerpo, ip) {
  if (!admite(ip)) return { codigo: 429, error: 'Demasiados mensajes seguidos: espera unos minutos.' }
  const m = sanear(cuerpo)
  if (!m) return { codigo: 400, error: 'El mensaje está vacío.' }
  guardados.push(m)
  if (guardados.length > BETA.feedbackGuardados) guardados.shift()
  if (FICHERO_FEEDBACK) {
    try { appendFileSync(FICHERO_FEEDBACK, `${JSON.stringify(m)}\n`) } catch { /* queda en memoria */ }
  }
  const webhook = process.env.VEKTOR_FEEDBACK_WEBHOOK
  if (webhook) {
    const cabecera = [m.donde, m.modo, m.mapa, m.version, m.app ? 'app' : 'navegador'].filter(Boolean).join(' · ')
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` es lo que lee Discord (y Slack lee `text`): los dos, y sin menciones.
      body: JSON.stringify({ content: `**Feedback** · ${cabecera}\n${m.texto}`, text: `Feedback · ${cabecera}\n${m.texto}`, allowed_mentions: { parse: [] } }),
    }).catch(() => {})
  }
  return { codigo: 200 }
}

/** La página para leerlos, sólo con la clave del dueño. `null` si no hay clave o no coincide. */
export function paginaDeFeedback(clave) {
  const buena = process.env.VEKTOR_FEEDBACK_CLAVE
  if (!buena || clave !== buena) return null
  const filas = [...guardados].reverse().map((m) => `<article><header>${escapar(m.cuando.replace('T', ' ').slice(0, 16))} · ${escapar([m.donde, m.modo, m.mapa, m.version, m.app ? 'app' : 'navegador'].filter(Boolean).join(' · '))}</header><p>${escapar(m.texto).replace(/\n/g, '<br>')}</p></article>`).join('')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vektor · feedback</title>
<style>body{background:#0a0a0a;color:#e8e8e8;font:15px/1.5 system-ui,sans-serif;margin:24px;max-width:80ch}article{border-bottom:1px solid #2a2a2a;padding:10px 0}header{color:#9a9a9a;font-size:12px}p{margin:4px 0 0}</style>
<h1>Vektor · feedback de la beta</h1><p style="color:#9a9a9a">Los ${guardados.length} últimos, del más nuevo al más viejo.${FICHERO_FEEDBACK ? '' : ' Sin disco configurado: se pierden con cada despliegue; con el webhook puesto llegan además a su canal.'}</p>${filas || '<p>Todavía nada.</p>'}`
}
