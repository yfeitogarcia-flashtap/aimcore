import * as THREE from 'three'
import { MovementController } from '../src/game/movement.js'
import { Scenario } from '../src/game/scenario.js'
import { crearPose } from '../net/pose.js'
import { SIM } from '../src/config.js'
const DT = 1 / SIM.hz, NOW = 1000 / SIM.hz
const mapa = { clave: 't', nombre: 'T', sala: { lado: 60, alto: 16 }, spawnZone: [], boxes: [] }
const pose = crearPose()
const mov = new MovementController(pose)
mov.setScenario(new Scenario(new THREE.Scene(), mapa))
mov.reset()
mov.setEnabled(true)
console.log('inicio', pose.position.x.toFixed(3), pose.position.z.toFixed(3), 'keys===input', mov.keys === mov.input)
pose.rotation.y = 0
mov.input.forward = true
let now = 1000
for (let i = 0; i < 60; i++) { now += NOW; mov.update(DT, now) }
console.log('tras 1 s', pose.position.x.toFixed(3), pose.position.z.toFixed(3))
