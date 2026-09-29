import { chromium } from 'playwright-core'

const OUT = '/home/user/aimcore/scratchpad'
const errores = []

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })

await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const caja = async (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), txt: (el.textContent || '').trim().slice(0, 60) }
}, sel)

const botones = async () => page.evaluate(() =>
  [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].map((b) => ({
    txt: b.textContent.trim().replace(/\s+/g, ' ').slice(0, 44),
    verde: getComputedStyle(b).borderColor,
    w: Math.round(b.getBoundingClientRect().width),
  })))

// ---- paso 1: la marca
console.log('\n== paso 1 · marca ==')
console.log('logo:', await caja('.panel__logo'))
console.log('botones:', await botones())
console.log('texto bajo el logo (panel__body):', await caja('.panel__body'))
await page.screenshot({ path: `${OUT}/01-marca.png` })

// ---- paso 2: modos
await page.click('.panel button')
await page.waitForTimeout(400)
console.log('\n== paso 2 · modos ==')
console.log('botones:', await botones())
console.log('filas duo:', await page.evaluate(() =>
  [...document.querySelectorAll('.panel__actions--duo')].map((f) => {
    const hijos = [...f.querySelectorAll('button')]
    return { n: hijos.length, anchos: hijos.map((b) => Math.round(b.getBoundingClientRect().width)), y: Math.round(f.getBoundingClientRect().y) }
  })))
await page.screenshot({ path: `${OUT}/02-modos.png` })

// ---- paso 3: entrenamiento
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.includes('Entrenamiento')).click())
await page.waitForTimeout(500)
console.log('\n== paso 3 · entrenamiento ==')
console.log('panel:', await caja('.training'))
console.log('ajustes:', await page.evaluate(() =>
  [...document.querySelectorAll('.training .field__label')].map((l) => l.textContent.trim())))
console.log('scroll:', await page.evaluate(() => {
  const p = document.querySelector('.cab-main')
  return { scrollH: p.scrollHeight, clientH: p.clientHeight, haceScroll: p.scrollHeight > p.clientHeight + 1 }
}))
await page.screenshot({ path: `${OUT}/03-entrenamiento.png`, fullPage: false })

// ---- opciones
await page.evaluate(() => [...document.querySelectorAll('.training button')].find((b) => b.textContent.trim() === 'Volver').click())
await page.waitForTimeout(300)
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.trim() === 'Opciones').click())
await page.waitForTimeout(400)
console.log('\n== opciones ==')
console.log('ajustes:', await page.evaluate(() =>
  [...document.querySelectorAll('.panel--options .field__label')].map((l) => l.textContent.trim())))
await page.screenshot({ path: `${OUT}/04-opciones.png` })

// ---- armería
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.evaluate(() => [...document.querySelectorAll('.portada button, .panel button, .cab-rail__item')].find((b) => b.textContent.trim() === 'Armería').click())
await page.waitForTimeout(500)
console.log('\n== armería ==')
console.log('ranuras:', await page.evaluate(() =>
  [...document.querySelectorAll('.armoury__ranura')].map((b) => b.textContent.trim().replace(/\s+/g, ' '))))
const verCategoria = async () => page.evaluate(() => ({
  activa: document.querySelector('.armoury__ranura--activa')?.textContent.trim().replace(/\s+/g, ' '),
  fichas: [...document.querySelectorAll('.armoury__card')].map((c) => ({
    nombre: c.querySelector('.armoury__name')?.textContent.trim(),
    tecla: c.querySelector('.armoury__slot')?.textContent.trim(),
    precio: c.querySelector('.armoury__precio')?.textContent.trim(),
    y: Math.round(c.getBoundingClientRect().y),
  })),
  scroll: (() => { const p = document.querySelector('.panel--armoury'); return { scrollH: p.scrollHeight, clientH: p.clientHeight, haceScroll: p.scrollHeight > p.clientHeight + 1 } })(),
}))
console.log(JSON.stringify(await verCategoria(), null, 1))
await page.screenshot({ path: `${OUT}/05-armeria.png` })

for (const cat of ['Especiales', 'Arrojadizas', 'Pistolas']) {
  await page.evaluate((c) => [...document.querySelectorAll('.armoury__ranura')].find((b) => b.textContent.includes(c)).click(), cat)
  await page.waitForTimeout(350)
  console.log(`\n-- ${cat} --`)
  console.log(JSON.stringify(await verCategoria(), null, 1))
  await page.screenshot({ path: `${OUT}/05-armeria-${cat}.png` })
}

console.log('\n== errores de página:', errores.length)
for (const e of errores.slice(0, 8)) console.log('  ', e)
await browser.close()
