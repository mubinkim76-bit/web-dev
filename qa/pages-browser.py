"""Run every service browser regression on the same origin under /<slug>/.
Only synthetic fixtures are used; no deployment or external app requests.
"""
from pathlib import Path
import json,os,socket,subprocess,sys,time
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa/browser-output';OUT.mkdir(exist_ok=True)
projects=json.loads((ROOT/'PROJECTS.json').read_text())['projects']
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen([os.environ.get('NODE_BINARY','node'),'scripts/serve-pages.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
base=f'http://127.0.0.1:{port}'
try:
 for _ in range(100):
  try:
   with socket.create_connection(('127.0.0.1',port),timeout=.1):break
  except OSError:time.sleep(.05)
 else:raise RuntimeError('Preview server did not start')
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
  context=browser.new_context();page=context.new_page();requests=[];errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.goto(base+'/');expect(page.locator('main li')).to_have_count(11)
  # Only Gomoku writes storage. Exercise the real opt-in saved board and then
  # navigate all other apps in this SAME context/origin to detect key collisions.
  page.goto(base+'/gomoku/?lang=en');page.locator('[name=gm-mode][value=local2p]').check();page.locator('[data-action=start]').click()
  page.locator('#gm-cell-7-7').click();page.locator('[data-action=place]').click();page.locator('[name=gm-save]').check()
  snapshot=page.evaluate('JSON.stringify({...localStorage})');assert 'game11.current.v1' in snapshot
  for project in projects:
   slug=project['folder'];page.goto(base+'/'+slug+'?lang=en')
   expect(page).to_have_url(base+'/'+slug+'/?lang=en');expect(page.locator('html')).to_have_attribute('lang','en')
   page.evaluate('document.fonts.ready');assert page.evaluate('document.fonts.check("16px LocalSans")')
   assert page.evaluate('JSON.stringify({...localStorage})')==snapshot
   assert page.evaluate('sessionStorage.length')==0
  page.goto(base+'/gomoku/?lang=en');page.locator('[data-action=resume]').click();expect(page.locator('.gm-stone')).to_have_count(1)
  for width in [1440,390,320]:
   page.set_viewport_size({'width':width,'height':1000});page.goto(base+'/');assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1');page.screenshot(path=OUT/f'directory-{width}.png',full_page=True)
  assert page.goto(base+'/missing').status==404
  assert not errors,errors
  assert all(u.startswith(base+'/') or u.startswith(('data:','blob:')) for u in requests)
  assert not any(u.startswith((base+'/src/',base+'/public/')) for u in requests)
  (OUT/'pages-smoke.json').write_text(json.dumps({'status':'PASS','same_origin_storage_preserved':True,'routes':11,'root_404':True,'unscoped_asset_requests':0,'page_errors':errors,'chromium':browser.version},indent=2))
  browser.close()
 for project in projects:
  slug=project['folder'];service=ROOT/slug
  for script in sorted((service/'qa').glob('*.py')):
   if script.name in ['decoder.py','consumer_http.py']:continue
   print('Subpath browser QA:',slug,script.name,flush=True)
   subprocess.run([sys.executable,str(script)],cwd=service,env={**os.environ,'QA_BASE_URL':base+'/'+slug},check=True)
 print('PASS: all 11 subpath browser suites plus common-origin navigation/storage checks.',flush=True)
finally:server.terminate();server.wait(timeout=5)
