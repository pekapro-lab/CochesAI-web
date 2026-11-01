import sys, json, time
from playwright.sync_api import sync_playwright
import os; URL=os.environ.get('URL','http://localhost:8765/CochesAI-web/'); tag=sys.argv[1]
FPS="new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<4000)requestAnimationFrame(f);else r(Math.round(n*1000/(performance.now()-t0)))};requestAnimationFrame(f)})"
out={}
with sync_playwright() as p:
  for bname in (sys.argv[2:] or ['chromium','webkit']):
    if bname=='chromium': b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':960,'height':540})
    else: b=p.webkit.launch(); ctx=b.new_context(**p.devices['iPhone 13 Pro'] | {'viewport':{'width':844,'height':390}})
    for tod in ['night','day']:
      for tr in ['norte','costa','bosque','sierra']:
        pg=ctx.new_page(); errs=[]
        pg.on('console',lambda m: m.type=='error' and errs.append(m.text)); pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.add_init_script(f"localStorage.setItem('cochesai-tod','{tod}')")
        pg.goto(URL); pg.wait_for_timeout(1200)
        pg.evaluate(f"window.__COCHES_APP__.ui.onStartSolo('{tr}')")
        pg.wait_for_function("window.__COCHES__.state==='racing'",timeout=60000); pg.evaluate("window.__COCHES__.cameraMode='chase'")
        pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(2500); pg.keyboard.up('ArrowUp')
        fps=pg.evaluate(FPS)
        if bname=='chromium' or tr=='norte': pg.screenshot(path=f'/workspace/CochesAI-web/shots/refl-{tag}-{bname}-{tr}-{tod}.png')
        out[f'{bname}-{tr}-{tod}']={'fps':fps,'errors':errs[:3]}
        print(bname,tr,tod,fps,errs[:2],flush=True); pg.close()
    b.close()
json.dump(out,open(f'/workspace/CochesAI-web/shots/refl-{tag}.json','w'),indent=1)
