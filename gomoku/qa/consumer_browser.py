"""Actual sandbox-enabled Chromium consumer boundary QA; local synthetic inputs only."""
from pathlib import Path
import os,json,socket,subprocess,time,traceback
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'qa/consumer-output/browser';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def record(name,fn):
 try: detail=fn();checks.append({'name':name,'status':'pass','detail':detail});print('PASS',name,flush=True)
 except Exception as e: checks.append({'name':name,'status':'fail','error':str(e),'trace':traceback.format_exc()});print('FAIL',name,str(e),flush=True)
 (OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
s=socket.socket();s.bind(('127.0.0.1',0));port=s.getsockname()[1];s.close()
server=subprocess.Popen(['node','scripts/serve.mjs','--dist'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
base=os.environ.get('QA_BASE_URL',f'http://127.0.0.1:{port}').rstrip('/')
try:
 for _ in range(100):
  try:
   with socket.create_connection(('127.0.0.1',port),timeout=.1):break
  except OSError:time.sleep(.05)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,chromium_sandbox=True)
  context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  page=context.new_page();errors=[];requests=[];downloads=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.on('download',lambda d:downloads.append(d.suggested_filename))
  def action(name):return page.locator('[data-action='+name+']').first
  def reset(lang='en',local=True):
   page.goto(base+'/?lang='+lang);page.evaluate('localStorage.clear()');page.reload();page.locator('.gm-setup').wait_for()
   if local:page.locator('[name=gm-mode][value=local2p]').check()
   action('start').click()
  def stones(n):expect(page.locator('.gm-stone')).to_have_count(n)
  def place(r,c):page.locator(f'#gm-cell-{r}-{c}').click();action('place').click()
  def shot(name):
   page.evaluate('window.scrollTo(0,0)');page.wait_for_function('scrollY===0');page.wait_for_timeout(200);page.screenshot(path=OUT/(name+'.png'),full_page=True)
  def win():
   reset();assert page.get_by_role('gridcell').count()==225
   place(0,0);expect(action('place')).to_be_disabled();page.locator('.gm-board').press('Enter');stones(1)
   for r,c in [(2,0),(0,1),(2,1),(0,2),(2,2),(0,3),(2,3),(0,4)]:place(r,c)
   expect(page.locator('#gm-status')).to_have_text('Black wins');stones(9)
   page.locator('#gm-cell-14-14').click();expect(action('place')).to_be_disabled();page.locator('.gm-board').press('Enter');stones(9);shot('won-locked-board')
   action('restart').click();stones(0);return 'Nine legal moves, win line, duplicate/post-win rejection and replay'
  record('two-player win, duplicate input and replay',win)
  def confirmations():
   reset();place(7,7);action('undo').click();expect(page.get_by_role('alertdialog')).to_be_visible();action('confirm-no').click();stones(1)
   action('undo').click();action('confirm-yes').click();stones(0);place(7,7)
   action('restart').click();action('confirm-no').click();stones(1);action('restart').click();action('confirm-yes').click();stones(0)
   place(7,7);action('setup').click();expect(page.locator('.gm-setup')).to_be_visible();action('continue').click();stones(1);shot('continue-game')
   return 'Undo/restart cancel and confirm, setup/continue retain state'
  record('confirmation cancel, restart and screen navigation',confirmations)
  def cancel_ai():
   reset(local=False)
   page.evaluate("() => {document.querySelector('[data-action=place]').click();document.querySelector('[data-action=restart]').click();}")
   action('confirm-no').click();stones(2)
   page.evaluate("() => {document.querySelector('[data-action=hint]').click();document.querySelector('[data-action=hint]').click();}")
   expect(page.locator('.is-hint')).to_have_count(0);stones(2)
   action('hint').click();expect(page.locator('.is-hint')).to_have_count(1);stones(2)
   action('restart').click();action('confirm-yes').click();stones(0);place(7,7);stones(2);shot('ai-rerun')
   return 'Real Worker cancelled on restart, new Worker completes; hint cancellation/rerun does not add stones'
  record('AI cancellation, hint cancellation and rerun',cancel_ai)
  def worker_error():
   reset(local=False)
   route='**/gomoku-worker.js';page.route(route,lambda r:r.abort())
   place(7,7);expect(page.locator('.gm-error')).to_be_visible();stones(1);shot('worker-error')
   page.unroute(route);action('retry').click();stones(2);expect(page.locator('.gm-error')).to_have_count(0)
   return 'Controlled Worker resource failure is visible and Retry recovers; one intentional aborted request'
  record('Worker load error and retry',worker_error)
  def storage():
   reset();place(7,7);page.locator('[name=gm-save]').check();page.reload();action('resume').click();stones(1)
   page.locator('[name=gm-save]').uncheck();assert page.evaluate("localStorage.getItem('game11.current.v1')") is None
   page.evaluate("localStorage.setItem('game11.current.v1','{broken')");page.once('dialog',lambda d:d.accept());page.reload()
   expect(page.locator('.gm-warning')).to_contain_text('could not be restored');page.locator('[name=gm-mode][value=local2p]').check();action('start').click();place(0,0);stones(1);shot('malformed-save-recovered')
   page.locator('summary').click();action('delete-save').click();action('confirm-no').click();assert page.evaluate("localStorage.getItem('game11.current.v1')")=='{broken'
   page.locator('summary').click();action('delete-save').click();action('confirm-yes').click();assert page.evaluate("localStorage.getItem('game11.current.v1')") is None;stones(1)
   return 'Save/resume, opt-out deletion, corrupt input recovery, delete cancellation/confirmation'
  record('local saving and malformed input recovery',storage)
  def language():
   reset();place(7,7)
   page.once('dialog',lambda d:d.dismiss());page.get_by_role('button',name='Change language',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','en');stones(1)
   page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Change language',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.locator('.gm-setup')).to_be_visible();shot('language-confirmed')
   return 'Language change cancellation preserves play; confirmation resets unsaved board'
  record('language-switch cancel and confirm',language)
  def responsive():
   captures=[]
   for lang in ['ko','en']:
    for width in [1440,390,320]:
     page.set_viewport_size({'width':width,'height':1000});reset(lang);place(14,14);stones(1)
     assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
     action('zoom').click();page.locator('#gm-cell-0-0').click();action('place').click();stones(2)
     assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
     action('zoom').click();name=f'play-{lang}-{width}';shot(name);captures.append(name+'.png')
   return captures
  record('Korean/English gameplay and zoom at 1440/390/320',responsive)
  def isolation():
   assert not errors,errors;assert all(u.startswith(base) or u.startswith(('blob:','data:')) for u in requests),requests
   assert not downloads;assert page.locator('a[download]').count()==0
   return {'page_errors':errors,'external_requests':0,'request_count':len(requests),'download':'not-applicable: no export/download UI or implementation','browser':browser.version}
  record('browser errors, local traffic and download scope',isolation)
  browser.close()
finally:server.terminate();server.wait(timeout=5)
if any(c['status']!='pass' for c in checks):raise SystemExit(1)
