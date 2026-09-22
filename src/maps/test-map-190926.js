/** Mapa de Vektor. Lo escribe el editor (/editor/); el formato, en src/maps/formato.js. */
export default {
  clave: "test-map-190926",
  label: "Mapa nuevo",
  publicado: false,
  room: {"width":80,"depth":80,"height":60},
  spawn: {"x":0,"z":16},
  boxes: [
    {"x":-2,"z":12,"w":4,"d":2,"kind":"media"},
    {"x":-2,"z":10,"w":4,"d":2,"kind":"alta"},
    {"x":0,"z":0,"w":4,"d":2,"kind":"media"},
    {"x":-19,"z":3.5,"w":6.5,"d":5,"kind":0.2,"superficie":{"tipo":"hielo","fuerza":1.6}},
    {"x":-18,"z":18.5,"w":4,"d":4,"kind":0.2,"superficie":{"tipo":"velocidad","fuerza":50.14,"rumbo":0,"salto":4}},
    {"x":-5.5,"z":-17.5,"w":4,"d":4,"kind":0.2,"superficie":{"tipo":"rebote","fuerza":23.96}},
  ],
  prismas: [],
  ramps: [],
  tubos: [],
  ventiladores: [
    {"x":-18,"z":-18,"w":6,"d":6,"base":0,"alto":10,"fuerza":42},
  ],
  tirolinas: [
    {"desde":{"x":-16,"y":7,"z":-3.5},"hasta":{"x":0,"y":2.5,"z":-3.5},"velocidad":14},
  ],
  teletransportes: [],
  spawnZone: [],
  objectiveSites: [],
  pickups: [],
  routes: [],
}
