import sys, json
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/CochesAI-web/'
def run(p, name, launcher, ctxargs, decode=True):
    b = launcher.launch(); c = b.new_context(**ctxargs); pg = c.new_page()
    errs, music = [], []
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: '/music/' in r.url and music.append(r.url.split('/music/')[1]))
    pg.goto(URL); pg.wait_for_timeout(1500)
    pre = pg.evaluate("({ctx: !!window.__COCHES__.audio.ctx, req: 0})")
    pre_music = list(music)
    pg.locator('#btn-day').click()  # user gesture
    if decode: pg.wait_for_function("window.__COCHES__.audio.music.current?.name === 'menu_garaje'", timeout=20000)
    else: pg.wait_for_timeout(1500)
    st = pg.evaluate("({state: window.__COCHES__.audio.ctx.state, ready: window.__COCHES__.audio.music.ready, want: window.__COCHES__.audio.music._want, loop: window.__COCHES__.audio.music.current?.name, ls: window.__COCHES__.audio.music.current?.src.loopStart, le: window.__COCHES__.audio.music.current?.src.loopEnd, ext: window.__COCHES__.audio.music.ext})")
    # toggle off/on
    pg.locator('#btn-music-menu').click(); pg.wait_for_timeout(300)
    off = pg.evaluate("[window.__COCHES__.audio.music.enabled, localStorage.getItem('cochesai-music'), document.querySelector('#btn-music-menu').textContent, window.__COCHES__.audio.music._target()]")
    pg.locator('#btn-music-menu').click(); pg.wait_for_timeout(300)
    on = pg.evaluate("[window.__COCHES__.audio.music.enabled, localStorage.getItem('cochesai-music'), window.__COCHES__.audio.music._target()]")
    pg.evaluate("window.__COCHES_APP__.ui.onStartSolo('sierra')")
    pg.wait_for_function("window.__COCHES__.state === 'racing'" + (" && window.__COCHES__.audio.music.current?.name === 'carrera_sierra'" if decode else ""), timeout=30000)
    race = pg.evaluate("({state: window.__COCHES__.state, want: window.__COCHES__.audio.music._want, loop: window.__COCHES__.audio.music.current?.name, le: window.__COCHES__.audio.music.current?.src.loopEnd, cd: window.__COCHES__._musicCountdown})")
    pg.locator('#btn-pause').click(); pg.wait_for_timeout(200)
    duck = pg.evaluate("window.__COCHES__.audio.music.duck")
    pg.locator('#btn-resume').click()
    pg.keyboard.press('KeyM'); mute = pg.evaluate("window.__COCHES__.audio.music._target()"); pg.keyboard.press('KeyM')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'/workspace/CochesAI-web/shots-v2/music-{name}.png')
    res = dict(browser=name, ctxBeforeGesture=pre['ctx'], musicReqBeforeGesture=pre_music, afterGesture=st, toggleOff=off, toggleOn=on, race=race, pauseDuck=duck, mutedTarget=mute, fetched=sorted(set(music)), errors=errs)
    print(json.dumps(res, ensure_ascii=False)); b.close()
    return not errs and not pre['ctx'] and not pre_music and ('carrera_sierra.' + st['ext']) in music and not any(x.startswith(('carrera_norte','carrera_costa','carrera_bosque')) for x in music) and off[0] is False and on[0] is True and duck < 1 and mute == 0
with sync_playwright() as p:
    ok1 = run(p, 'chromium', p.chromium, {})
    ok2 = run(p, 'webkit', p.webkit, dict(p.devices['iPhone 13 Pro']), decode=False)
    print('OK' if ok1 and ok2 else 'FAIL'); sys.exit(0 if ok1 and ok2 else 1)
