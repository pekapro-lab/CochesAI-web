import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
const ROOT='/workspace/CochesAI-web/dist'
const server = createServer((req, res) => { let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/CochesAI-web')) url = url.slice(13) || '/'; let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(5202, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto('http://127.0.0.1:5202/CochesAI-web/'); await page.waitForFunction(() => window.__PEKA_R__)
await page.evaluate(() => { const g = window.__PEKA_R__; g.startTrack(process?.x||'norte') }).catch(async()=>page.evaluate(() => window.__PEKA_R__.startTrack('norte')))
await page.waitForFunction(() => window.__PEKA_R__.state === 'racing', null, {timeout: 30000})
await page.keyboard.down('ArrowUp')
for (let i=0;i<10;i++){ await page.waitForTimeout(300); console.log(await page.evaluate(()=>{const g=window.__PEKA_R__,b=g.car.chassisBody,q=b.quaternion; return [ (Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.x*q.x))*57.3).toFixed(1), b.position.x.toFixed(1), b.position.z.toFixed(1), g.car.speedKmh|0, g.car.wheelsOnGround()].join(' ')})) }
await browser.close(); server.close()
