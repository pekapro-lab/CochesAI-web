import sys, json
from playwright.sync_api import sync_playwright
tag=sys.argv[1]; URL=sys.argv[2]
FPS="new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<4000)requestAnimationFrame(f);else r(Math.round(n*1000/(performance.now()-t0)))};requestAnimationFrame(f)})"
out={}
with sync_playwright() as p:
  for bname in ['chromium','webkit']:
    if bname=='chromium': b=p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':960,'height':540})
    else: b=p.webkit.launch(); ctx=b.new_context(**p.devices['iPhone 13 Pro'] | {'viewport':{'width':844,'height':390}})
    for tod in ['day','night']:
      pg=ctx.new_page(); errs=[]; warns=[]
      pg.on('console',lambda m: (m.type=='error' and errs.append(m.text)) or ('realista' in m.text and warns.append(m.text)))
      pg.on('pageerror',lambda e: errs.append(str(e)))
      pg.add_init_script(f"localStorage.setItem('cochesai-tod','{tod}')")
      pg.goto(URL); pg.wait_for_timeout(1500)
      pg.evaluate("window.__COCHES_APP__.ui.onStartSolo('norte')")
      pg.wait_for_function("window.__COCHES__.state==='racing'",timeout=90000); pg.evaluate("window.__COCHES__.cameraMode='chase'")
      pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(3000); pg.keyboard.up('ArrowUp')
      fps=pg.evaluate(FPS)
      real=pg.evaluate("!!window.__COCHES__.car?.realModel")
      pg.screenshot(path=f'/workspace/CochesAI-web/shots/realista-{tag}-{bname}-{tod}.png')
      out[f'{bname}-{tod}']={'fps':fps,'real':real,'errors':errs[:3],'warn':warns[:2]}
      print(bname,tod,fps,real,errs[:2],warns[:1],flush=True); pg.close()
    b.close()
json.dump(out,open(f'/workspace/CochesAI-web/shots/realista-{tag}.json','w'),indent=1)
