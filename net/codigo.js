/**
 * **El código de sala** (vuelta 47). Lo que convierte «vamos a jugar» en una
 * partida: un jugador lo crea, se lo pasa al otro por donde sea —voz, chat, un
 * enlace— y los dos acaban en el mismo Durable Object.
 *
 * Vive aquí, y no en el cliente ni en el Worker, porque **lo tocan los dos**:
 * el cliente lo genera y lo mete en la URL, el Worker lo saca de la ruta y se
 * lo da a `idFromName`. Si cada lado normalizara a su manera, escribir el
 * código en minúsculas llevaría a una sala distinta que escribirlo en
 * mayúsculas y las dos personas se quedarían solas en su sala mirando el
 * contador de jugadores. La misma regla de siempre: cálculo compartido, una
 * sola función.
 *
 * **El alfabeto no tiene letras que se confundan al dictarlas.** Fuera la O y
 * el 0, la I, la L y el 1, la S y el 5, la B y el 8. Un código se lee en voz
 * alta por el chat de voz antes que copiarse, y un código que hay que deletrear
 * dos veces es un código mal elegido. Quedan 27 símbolos; con seis, 387 millones
 * de combinaciones, que para partidas privadas entre amigos sobra —no es un
 * secreto criptográfico, es un identificador—.
 *
 * Y **la forma de la ruta también es de aquí** (`rutaDeSala`): el Worker la
 * reconoce y el cliente la construye, así que es otro cálculo compartido.
 */

/** 27 símbolos sin parejas que se confundan al dictar. */
export const ALFABETO = 'ACDEFGHJKMNPQRTUVWXYZ234679'

export const LARGO = 6

/**
 * Un código nuevo. `crypto.getRandomValues` está en el navegador, en Node y en
 * workerd, así que no hace falta un `Math.random` distinto por huésped.
 */
export function generarCodigo() {
  const bytes = new Uint8Array(LARGO)
  crypto.getRandomValues(bytes)
  let salida = ''
  for (let i = 0; i < LARGO; i++) salida += ALFABETO[bytes[i] % ALFABETO.length]
  return salida
}

/**
 * **Lo que se teclea mal se traduce, no se rechaza.** Un código se dicta por
 * voz, y quien lo escribe pone lo que oye: un cero donde se dijo «o», una ele
 * donde se dijo «i». Esos símbolos no están en el alfabeto justamente porque se
 * confunden, así que cada uno se manda a aquel con el que se confunde y que sí
 * existe. La alternativa —«código no válido»— castiga a quien lo dictó bien.
 */
const EQUIVALENCIAS = { O: 'Q', '0': 'Q', I: 'J', L: 'J', '1': 'J', S: 'Z', '5': 'Z', B: '6', '8': '6' }

/**
 * Normaliza lo que teclea una persona. Devuelve el código en mayúsculas, o
 * cadena vacía si no queda un código válido.
 */
export function normalizarCodigo(texto) {
  if (typeof texto !== 'string') return ''
  let salida = ''
  for (const bruto of texto.toUpperCase()) {
    const c = EQUIVALENCIAS[bruto] ?? bruto
    if (ALFABETO.includes(c)) salida += c
    // Cualquier otra cosa —espacios, guiones, la almohadilla del enlace— se cae
    // sola: un código dictado llega con separadores y no es culpa de quien lo
    // teclea.
  }
  return salida.length === LARGO ? salida : ''
}

export function esCodigo(texto) {
  return normalizarCodigo(texto) !== ''
}

/** La ruta del WebSocket de una sala. La construye el cliente, la reconoce el Worker. */
export function rutaDeSala(codigo) {
  return `/sala/${codigo}`
}
