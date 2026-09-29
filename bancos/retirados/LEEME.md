# Bancos retirados

Miden una regla que el juego enmendó a propósito, así que ya no pueden salir en
verde y tampoco dicen nada del juego de hoy. Se guardan para poder leer cómo se
medía, no para pasarlos (auditoría de la vuelta 105: ningún rojo «esperado»).

- `arm90.mjs` — la armería de catorce fichas en una rejilla; desde la vuelta 92
  va por categorías y lo que mide sus solapes es `arm95`.
- `esc89b.mjs`, `esc91.mjs` — la regla de ESC de las vueltas 89 y 91 (una
  pulsación dentro de la espera del navegador se tiraba). La 101 la cambió: ESC
  acaba siempre en la partida, y lo mide `esc101`.

- `piloto105.mjs` y `lamina105b.mjs` — el piloto de la silueta con grosor por
  zonas (Krakov y Pulse), que Yago anuló en la misma vuelta: tal como está, el
  juego se ve mejor sin arma. El código se quitó; esto se guarda por si se
  retoma.

Y en la vuelta 106, al mover los bancos a `bancos/`:

- `esc89.mjs` — un informe (no afirmaba nada) sobre si el `keydown` de ESC llega
  a la página en un navegador sin interfaz. La respuesta de ese navegador no es
  la de Chrome, que es lo que la vuelta 105 aprendió: lo que mide volver desde
  la pausa con las reglas de verdad es `esc105`.
- `holo105`, `lamina104`, `lamina105`, `lamina105c`, `mosaico105`,
  `siluetas105`, `vista102`, `vista104` y `vista105` — el arma en pantalla, que
  se cerró en la vuelta 106 (`docs/decisions.md` §106.2). El código sigue en el
  juego, apagado (`VIEWMODEL.disponible`); si el tema se reabre, sus medidas
  están aquí.
- `alto.mjs` — un informe de la vuelta 92 sobre el alto de las fichas de la
  armería, que llegaba a ella por el botón del paso 2 del menú. Desde Cabina
  (vuelta 99) se llega por el raíl, y lo que guarda que las fichas quepan son
  `arm95` y `cabina99b`.
- `combo93.mjs` — las combinaciones de la tienda de la 93 («5 1» era la Scout).
  La 98 rehízo la tabla —la categoría es la ranura y el código el orden de la
  ficha— y la que la mide arma a arma y en los tres sitios es `armeria98`.
- `menu89.mjs`, `menu94.mjs` — la pantalla de inicio de antes de Cabina (el
  rótulo bajo el logo, los dos modos como botones). La 99 la rehízo, y lo que
  guarda las mismas reglas —las dos puertas iguales, Jugar a la vista, las
  filas inertes y ningún «por defecto» encendido— es `cabina99b`.
