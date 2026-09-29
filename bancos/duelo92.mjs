import { chromium } from 'playwright-core'
const OUT = '/home/user/aimcore/scratchpad/ui92'
const errores = []
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()) })
await page.goto('http://127.0.0.1:5192/duelo/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

console.log('invita:', await page.evaluate(() => document.querySelector('.invita')?.textContent.trim()))
console.log('campo de código a mano:', await page.evaluate(() => Boolean(document.querySelector('#otro') || document.querySelector('#entrar'))))
console.log('filas del menú:', await page.evaluate(() =>
  [...document.querySelectorAll('#sala .fila')].map((f) => ({
    rotulo: f.children[0]?.textContent.trim(),
    y: Math.round(f.getBoundingClientRect().y),
    controles: [...f.querySelectorAll('select')].map((s) => s.id),
  }))))
console.log('alto del menú:', await page.evaluate(() => Math.round(document.querySelector('#aviso > div').getBoundingClientRect().height)))
console.log('errores:', errores.length, errores.slice(0, 5))
await page.screenshot({ path: `${OUT}/06-duelo.png` })
await browser.close()
