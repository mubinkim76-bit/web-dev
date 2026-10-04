from pathlib import Path
import json,traceback,os,socket,subprocess,time
from contextlib import contextmanager
from playwright.sync_api import sync_playwright,expect
PROJECT=Path(__file__).resolve().parents[1]
O=PROJECT/'qa/browser-output'; O.mkdir(exist_ok=True); checks=[]
@contextmanager
def local_server():
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
 server=subprocess.Popen([os.environ.get('NODE_BINARY','node'),'scripts/serve.mjs'],cwd=PROJECT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
 try:
  for _ in range(100):
   if server.poll() is not None: raise RuntimeError('Local server exited before readiness')
   try:
    with socket.create_connection(('127.0.0.1',port),timeout=.1): break
   except OSError: time.sleep(.05)
  else: raise RuntimeError('Local server readiness timed out')
  yield os.environ.get('QA_BASE_URL',f'http://127.0.0.1:{port}').rstrip('/')
 finally:
  server.terminate(); server.wait(timeout=5)
with local_server() as base, sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
 c=b.new_context(accept_downloads=True);page=c.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 def run(name,fn):
  try: detail=fn();checks.append({'name':name,'status':'pass','detail':detail})
  except Exception as e: checks.append({'name':name,'status':'fail','error':str(e),'trace':traceback.format_exc()})
  (O/'consumer-browser.json').write_text(json.dumps(checks,indent=2));print(checks[-1],flush=True)
 def btn(t):return page.get_by_role('button',name=t,exact=True)
 def calc():btn('Calculate / Preview').click()
 def total(t):expect(page.locator('.aux-total')).to_have_text(t)
 page.goto(base+'/?lang=en')
 def success():
  page.locator('label').filter(has=page.get_by_text('Currency',exact=True)).locator('select').select_option('USD');page.locator('[data-key=price]').fill('19.95');page.get_by_label('Document discount (%)',exact=True).fill('10');page.get_by_label('User-entered tax (%)',exact=True).fill('20');calc();total('USD 64.63')
  page.locator('label').filter(has=page.get_by_text('Document',exact=True)).locator('select').select_option('invoice');calc();expect(page.locator('.aux-preview h1')).to_have_text('Invoice')
  page.locator('[data-key=name]').fill('<img src=x onerror=alert(1)>');calc();expect(page.locator('.aux-preview img')).to_have_count(0)
  return 'USD 59.85 subtotal, discount 5.99, tax 10.77, total 64.63; invoice type; escaped input'
 run('calculation and safe rendering',success)
 def invalid():
  for v in ['0','-1','0.0000001','1000001','']:
   page.locator('[data-key=quantity]').fill(v);calc();expect(page.get_by_role('alert')).to_be_visible();expect(btn('Print / Save as PDF')).to_be_disabled()
  page.locator('[data-key=quantity]').fill('3');calc();total('USD 64.63')
  for label,value in [('Document discount (%)','101'),('User-entered tax (%)','-1'),('Date','')]:
   field=page.get_by_label(label,exact=True);old=field.input_value();field.fill(value);calc();expect(page.get_by_role('alert')).to_be_visible();field.fill(old);calc();expect(btn('Print / Save as PDF')).to_be_enabled()
  return '8 invalid inputs blocked; each category recovered'
 run('invalid boundaries and retry',invalid)
 def language():
  page.locator('[data-key=name]').fill('Preserve on cancel');page.once('dialog',lambda d:d.dismiss());btn('Change language').click();expect(page.locator('[data-key=name]')).to_have_value('Preserve on cancel');expect(page.locator('html')).to_have_attribute('lang','en')
  page.once('dialog',lambda d:d.accept());btn('Change language').click();expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.locator('[data-key=name]')).to_have_value('서비스');btn('언어 변경').click();expect(page.locator('html')).to_have_attribute('lang','en')
  return 'cancel retained input; confirmed switch cleared workspace; switch back succeeded'
 run('language cancellation and screen remount',language)
 def rows():
  btn('Remove').click();calc();expect(page.get_by_role('alert')).to_contain_text('1–100');btn('+ Add item').click();page.locator('[data-key=name]').fill('Recovery');calc();expect(btn('Print / Save as PDF')).to_be_enabled()
  for i in range(99):btn('+ Add item').click()
  expect(page.locator('.aux-item-row')).to_have_count(100);expect(btn('+ Add item')).to_be_disabled();btn('Remove').last.click();expect(btn('+ Add item')).to_be_enabled()
  page.reload();return 'empty document rejected/recovered; 100-row cap and remove recovery'
 run('item boundaries',rows)
 def headers():
  for path,code in [('/',200),('/?lang=en',200),('/index.html',200),('/src/app.js',200),('/public/fonts/NotoSansKR-Local.woff',200),('/invoice',404),('/package.json',404),('/../package.json',404)]:
   r=c.request.get(base+path);assert r.status==code,(path,r.status)
  r=c.request.get(base+'/');assert r.headers['cache-control']==('no-cache' if os.environ.get('QA_BASE_URL') else 'no-store');assert r.headers['x-content-type-options']=='nosniff'
  return 'root/query/index entry and assets work; unsupported routes/private files 404; expected cache policy/nosniff'
 run('entry routes and local headers',headers)
 def traffic():
  assert not errors,errors;assert all(x.startswith(base+'/') or x.startswith(('data:','blob:')) for x in requests)
  return {'page_errors':errors,'external_requests':0,'request_count':len(requests)}
 run('runtime isolation',traffic)
 b.close()
assert all(x['status']=='pass' for x in checks)
