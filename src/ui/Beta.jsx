import { useEffect, useRef, useState } from 'react'
import { BETA_UI } from '../config.js'
import { comoSeJuegaVisto, datosDeFeedback, enviarFeedback } from '../beta.js'
import { keyLabel, keysOf } from '../keybinds.js'

/**
 * **Cómo se juega, en veinte segundos** (vuelta 107, lo imprescindible de la
 * beta). Sale la primera vez que alguien pulsa «Jugar ahora» y después se abre
 * cuando se quiera desde la portada. Cuatro cosas y ni una más: qué se hace,
 * cómo se mueve uno, dónde está el equipo y cómo se para. **Las teclas salen
 * del bind** (vuelta 97): un rótulo que no acierta con los ajustes de fábrica
 * de la app no sirve.
 */
export function ComoSeJuega({ binds, onCerrar }) {
  const tecla = (accion) => keyLabel(keysOf(accion, binds)[0])
  const mover = ['forward', 'left', 'back', 'right'].map(tecla).join(' ')
  const cerrar = () => {
    comoSeJuegaVisto()
    onCerrar()
  }
  useEffect(() => {
    const alTeclear = (evento) => {
      if (evento.key !== 'Escape' && evento.key !== 'Enter') return
      evento.preventDefault()
      evento.stopPropagation()
      cerrar()
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  })
  const bloques = [
    ['Apunta y dispara', <>El ratón apunta; <kbd className="cab-tecla">{tecla('shoot')}</kbd> dispara y <kbd className="cab-tecla">{tecla('reload')}</kbd> recarga. El clic derecho es la segunda función del arma: mirilla o silenciador.</>],
    ['Muévete', <><kbd className="cab-tecla">{mover}</kbd> para andar, <kbd className="cab-tecla">{tecla('jump')}</kbd> salta y <kbd className="cab-tecla">{tecla('crouch')}</kbd> agacha. Corriendo, agacharse te hace deslizar; en el aire, gira el ratón hacia donde estrafeas para ganar velocidad.</>],
    ['Equípate', <><kbd className="cab-tecla">{tecla('armoury')}</kbd> abre la armería. <kbd className="cab-tecla">{tecla('primary')}</kbd> principal, <kbd className="cab-tecla">{tecla('secondary')}</kbd> pistola, <kbd className="cab-tecla">{tecla('melee')}</kbd> cuchillo. <kbd className="cab-tecla">{tecla('use')}</kbd> usa lo que tengas delante.</>],
    ['Para cuando quieras', <><kbd className="cab-tecla">ESC</kbd> abre la pausa, con Opciones y «Enviar feedback»: cuéntanos lo que no funcione.</>],
  ]
  return (
    <div className="panel panel--como" role="dialog" aria-labelledby="como-titulo" onMouseDown={(e) => e.stopPropagation()}>
      <h2 className="panel__title" id="como-titulo">Cómo se juega</h2>
      <p className="panel__body">
        <b>Entrenamiento</b>: dispara a las dianas y, en la ronda con explosivo, desactívalo antes de que estalle.{' '}
        <b>Multijugador</b>: crea una sala, manda el enlace, pulsad LISTO y a jugar.
      </p>
      <ol className="como">
        {bloques.map(([titulo, texto]) => (
          <li key={titulo} className="como__bloque cab-superficie">
            <h3 className="cab-rotulo">{titulo}</h3>
            <p>{texto}</p>
          </li>
        ))}
      </ol>
      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={cerrar} autoFocus>Entendido</button>
      </div>
    </div>
  )
}

/**
 * **Enviar feedback** (vuelta 107). Un texto, lo que viaja con él dicho en la
 * propia pantalla, y un resultado que se lee: enviado, o por qué no. Va dentro
 * de Opciones —que es un solo componente en los dos modos (vuelta 92)— y en la
 * barra de la cabina.
 */
export function Feedback({ onCerrar }) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState(null)
  const area = useRef(null)
  useEffect(() => { area.current?.focus() }, [])
  // ESC vuelve a lo de debajo, y **en captura**: si no, cerraría también las
  // opciones que tiene detrás.
  useEffect(() => {
    const alTeclear = (evento) => {
      if (evento.key !== 'Escape') return
      evento.preventDefault()
      evento.stopImmediatePropagation()
      onCerrar()
    }
    window.addEventListener('keydown', alTeclear, true)
    return () => window.removeEventListener('keydown', alTeclear, true)
  }, [onCerrar])
  const mandar = async () => {
    if (!texto.trim() || estado === 'enviando') return
    setEstado('enviando')
    const r = await enviarFeedback(texto)
    setEstado(r.ok ? 'enviado' : `error:${r.error}`)
    if (r.ok) setTexto('')
  }
  const d = datosDeFeedback('')
  const viaja = [d.donde, d.modo, d.mapa].filter(Boolean).join(' · ') || 'la pantalla'
  return (
    <div className="panel panel--feedback" role="dialog" aria-labelledby="fb-titulo" onMouseDown={(e) => e.stopPropagation()}>
      <h2 className="panel__title panel__title--small" id="fb-titulo">Enviar feedback</h2>
      <p className="panel__body">Qué ha pasado, qué esperabas y qué harías distinto. Lo lee quien hace el juego.</p>
      <textarea
        ref={area}
        className="feedback__texto"
        rows={6}
        maxLength={BETA_UI.feedbackMax}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); if (estado && estado !== 'enviando') setEstado(null) }}
        placeholder="p. ej. en El Espejo, al reaparecer, no veía mi arma"
      />
      <p className="panel__hint">
        Se envía tu texto con {viaja} y la versión del juego. Nada más: ni tu nombre, ni tu correo, ni cookies.
      </p>
      {estado === 'enviado' && <p className="panel__hint feedback__ok" role="status">Enviado. Gracias.</p>}
      {estado?.startsWith('error:') && <p className="panel__hint panel__hint--alerta" role="status">No se ha enviado: {estado.slice(6)}.</p>}
      <div className="panel__actions">
        <button type="button" className="button button--primary" onClick={mandar} disabled={!texto.trim() || estado === 'enviando'}>
          {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" className="button button--quiet" onClick={onCerrar}>Volver</button>
      </div>
    </div>
  )
}
