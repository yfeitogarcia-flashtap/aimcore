// cpu103 — CPU del huésped (proceso node net/servidor.mjs) con dos jugadores,
// lejos y cerca peleando. Lee /proc/<pid>/stat antes y después de cada tramo.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const pid = execSync("pgrep -f 'net/servidor\\.mjs' | head -1").toString().trim()
const hz = Number(execSync('getconf CLK_TCK').toString())
const cpu = () => { const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / hz }
const lanzar = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const BASE = 'http://localhost:5199'
const tramo = async (et, fn) => { const c0 = cpu(), t0 = Date.now(); await fn(); const s = (Date.now() - t0) / 1000; console.log(et.padEnd(30), `${((cpu() - c0) / s * 100).toFixed(1)} % de un núcleo`) }
const [na, nb] = await Promise.all([lanzar(), lanzar()])
const A = await na.newPage({ viewport: { width: 640, height: 400 } }), B = await nb.newPage({ viewport: { width: 640, height: 400 } })
await tramo('sala vacía', () => A.waitForTimeout(4000))
await A.goto(`${BASE}/duelo/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(2500)
const enlace = await A.evaluate(() => document.querySelector('#enlace').value)
await B.goto(enlace, { waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
for (const p of [A, B]) { await p.mouse.click(30, 30); await p.waitForTimeout(400) }
const colocar = (p, x, z, yaw) => p.evaluate(({ x, z, yaw }) => { window.vektorNet.cliente.transporte.send(JSON.stringify({ t: 'c', x, z })); window.vektorNet.motor.controls.lookAt(yaw) }, { x, z, yaw })
await colocar(A, -15, 15, 0); await colocar(B, 15, -15, Math.PI); await A.waitForTimeout(1500)
await tramo('dos, lejos', () => A.waitForTimeout(8000))
await colocar(A, 0, 4, 0); await colocar(B, 0, -2, Math.PI); await A.waitForTimeout(1500)
await tramo('dos, cerca quietos', () => A.waitForTimeout(8000))
await tramo('dos, cerca disparando', async () => { for (let i = 0; i < 20; i++) { await A.mouse.down(); await B.mouse.down(); await A.waitForTimeout(150); await A.mouse.up(); await B.mouse.up(); await A.waitForTimeout(250) } })
await na.close(); await nb.close()
