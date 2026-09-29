import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 860 }]) {
  const page = await browser.newPage({ viewport: vp })
  await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.click('.panel button')
  await page.waitForTimeout(300)
  await page.evaluate(() => [...document.querySelectorAll('.panel button')].find((b) => b.textContent.trim() === 'Armería').click())
  await page.waitForTimeout(500)
  const r = await page.evaluate(() => {
    const p = document.querySelector('.panel--armoury')
    const card = document.querySelector('.armoury__card')
    const trozos = [...card.children].map((c) => ({
      clase: c.className.replace('armoury__', ''),
      h: Math.round(c.getBoundingClientRect().height),
    }))
    return {
      panel: { scrollH: p.scrollHeight, clientH: p.clientHeight, sobra: p.scrollHeight - p.clientHeight },
      card: Math.round(card.getBoundingClientRect().height),
      trozos,
    }
  })
  console.log(`\n${vp.width}x${vp.height}:`, JSON.stringify(r.panel), 'ficha', r.card)
  console.log('  ', r.trozos.map((t) => `${t.clase}=${t.h}`).join(' '))
  await page.close()
}
await browser.close()
