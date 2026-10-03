from pathlib import Path
import os,json,io,zipfile,subprocess,socket,time,traceback,shutil,tempfile,re,csv
import fitz
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
PROJECT=Path(__file__).resolve().parents[1]
OUT=PROJECT/'qa/browser-output';OUT.mkdir(exist_ok=True)
checks=[]
def record(name,fn):
 try:checks.append({'name':name,'status':'PASS','detail':fn()});print('PASS',name,flush=True)
 except Exception as e:checks.append({'name':name,'status':'FAIL','error':str(e),'trace':traceback.format_exc()});print('FAIL',name,str(e)[:400],flush=True)
 (OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
def png():
 image=Image.new('RGBA',(200,100),(0,0,0,0));ImageDraw.Draw(image).rectangle((40,20,160,80),fill=(255,0,0,255));b=io.BytesIO();image.save(b,'PNG');return {'name':'alpha.png','mimeType':'image/png','buffer':b.getvalue()}
def jpg():
 image=Image.new('RGB',(360,240),(40,100,170));exif=Image.Exif();exif[274]=6;exif[315]='SYNTHETIC QA';b=io.BytesIO();image.save(b,'JPEG',exif=exif);return {'name':'rotated.jpg','mimeType':'image/jpeg','buffer':b.getvalue()}
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
isolated=Path(tempfile.mkdtemp(prefix=PROJECT.name+'-browser-isolated-'))/'project';shutil.copytree(PROJECT,isolated)
env={**os.environ,'PORT':str(port)};node=os.environ.get('NODE_BINARY','node')
server=subprocess.Popen([node,'scripts/serve.mjs','--dist'],cwd=isolated,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
base=f'http://127.0.0.1:{port}'
try:
 for _ in range(100):
  try:
   c=socket.create_connection(('127.0.0.1',port),timeout=.1);c.close();break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
  context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  page=context.new_page();accept_dialog=lambda d:d.accept();page.on('dialog',accept_dialog);errors=[];requests=[];responses=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append([r.method,r.url]));page.on('response',lambda r:responses.append([r.status,r.url]))
  def go(lang='ko'):
   page.goto(base+('/?lang=en' if lang=='en' else '/'));page.locator('.workspace').wait_for();page.evaluate('document.fonts.ready')
  def btn(name):return page.get_by_role('button',name=name,exact=True)
  def save(name,file):
   with page.expect_download() as d:btn(name).click()
   d.value.save_as(OUT/file);assert d.value.failure() is None;return OUT/file
  def select_field(label,value):
   page.locator('label').filter(has=page.get_by_text(label,exact=True)).locator('select').select_option(value)
  def printed(name,file,needle):
   btn(name).click();frame=page.locator('.aux-print-frame').last;expect(frame).to_be_attached();html=frame.get_attribute('srcdoc');assert needle in html
   rendered=context.new_page();rendered.set_content(html);rendered.pdf(path=str(OUT/file),prefer_css_page_size=True);rendered.close()
   doc=fitz.open(OUT/file);assert needle in ''.join(p.get_text() for p in doc);doc[0].get_pixmap().save(OUT/(file+'.png'));return len(doc)
  def functional():
   go('en');page.get_by_label('Original text',exact=True).fill('  한글  \n  한글  \n\ne\u0301 👨‍👩‍👧‍👦 ')
   for name in ['Trim each line','Remove empty lines','Keep the first exact duplicate line']:page.get_by_label(name,exact=True).check()
   btn('Clean text').click();expect(page.get_by_label('Cleaned text',exact=True)).to_have_value('한글\ne\u0301 👨‍👩‍👧‍👦');path=save('Download TXT','cleaned.txt');assert path.read_text()=='한글\ne\u0301 👨‍👩‍👧‍👦'
   page.get_by_label('Original text',exact=True).fill('x\n'*1000);page.evaluate("()=>{const b=[...document.querySelectorAll('button')];b.find(x=>x.textContent==='Clean text').click();b.find(x=>x.textContent==='Cancel').click()}");expect(page.locator('.workspace [role=status]')).to_contain_text('Cancelled');btn('Clean text').click();expect(btn('Download TXT')).to_be_enabled();btn('Clear all').click();expect(page.get_by_label('Original text',exact=True)).to_have_value('');return 'Unicode/TXT parity, real Worker cancellation, rerun and clear'
  record('text output, download, cancellation and rerun',functional)
  def errors_and_recovery():
   go('en');source=page.get_by_label('Original text',exact=True);source.fill('preserve me')
   invalid=[('wrong.csv',b'a','Choose a TXT file'),('large.txt',b'x'*1048577,'File limit'),('invalid.txt',bytes([0xc3,0x28]),'UTF-8 decoding failed'),('lines.txt',b'x\n'*2000,'2,000 lines')]
   for name,data,message in invalid:
    page.locator('input[type=file]').set_input_files({'name':name,'mimeType':'text/plain','buffer':data})
    expect(page.locator('.workspace [role=status]')).to_contain_text(message)
    expect(source).to_have_value('preserve me');expect(btn('Download TXT')).to_be_disabled()
   page.screenshot(path=OUT/'input-error.png',full_page=True)
   page.locator('input[type=file]').set_input_files({'name':'valid.txt','mimeType':'text/plain','buffer':'  한글  '.encode()})
   expect(source).to_have_value('  한글  ');page.get_by_label('Trim each line',exact=True).check();btn('Clean text').click()
   expect(page.get_by_label('Cleaned text',exact=True)).to_have_value('한글')
   path=save('Download TXT','recovered.txt');assert path.read_bytes()=='한글'.encode()
   btn('Restore original').click();expect(page.get_by_label('Cleaned text',exact=True)).to_have_value('  한글  ')
   btn('Reset rules').click();btn('Clean text').click();expect(page.get_by_label('Cleaned text',exact=True)).to_have_value('  한글  ')
   page.screenshot(path=OUT/'recovered.png',full_page=True)
   return 'Four rejected file inputs preserve original; valid import, TXT bytes, restore and reset recover'
  record('invalid file inputs and successful recovery',errors_and_recovery)
  def language_boundary():
   go('en');source=page.get_by_label('Original text',exact=True);source.fill('unsaved')
   page.remove_listener('dialog',accept_dialog)
   dismiss=lambda d:d.dismiss();page.on('dialog',dismiss)
   page.get_by_role('button',name='Change language',exact=True).click()
   expect(source).to_have_value('unsaved');assert page.locator('html').get_attribute('lang')=='en'
   page.remove_listener('dialog',dismiss);page.on('dialog',lambda d:d.accept())
   page.get_by_role('button',name='Change language',exact=True).click()
   expect(page.get_by_label('원문',exact=True)).to_have_value('');assert page.locator('html').get_attribute('lang')=='ko'
   page.get_by_label('원문',exact=True).fill('작업');page.evaluate("()=>{const b=[...document.querySelectorAll('button')];b.find(x=>x.textContent==='정리 실행').click();document.querySelector('[aria-label=\"언어 변경\"]').click()}")
   expect(page.get_by_label('Original text',exact=True)).to_have_value('');expect(page.get_by_label('Cleaned text',exact=True)).to_have_value('');expect(btn('Download TXT')).to_be_disabled()
   return 'Language dialog dismiss preserves input; accept clears input; switch during worker leaves no stale result'
  record('language navigation and active worker disposal',language_boundary)
  def responsive():
   screenshots=[]
   for lang in ['ko','en']:
    for width in [1440,390,320]:
     page.set_viewport_size({'width':width,'height':1000});go(lang);assert page.locator('html').get_attribute('lang')==lang
     assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
     file=f'{lang}-{width}.png';page.screenshot(path=OUT/file,full_page=True);screenshots.append(file)
   return screenshots
  record('Korean/English at 1440, 390 and 320 pixels',responsive)
  def isolation():
   assert not errors,errors;assert all(url.startswith(base) or url.startswith(('blob:','data:')) for _,url in requests),requests;assert not [r for r in responses if r[0]>=400],responses;assert not [r for r in requests if r[0] not in ['GET','HEAD']];assert page.locator('nav').count()==0
   return {'page_errors':errors,'requests':len(requests),'external_requests':0,'server_posts':0,'siblings_present':False,'isolated_path':str(isolated)}
  record('standalone browser dependencies and zero external traffic',isolation)
  browser.close()
finally:
 server.terminate();server.wait(timeout=5)
if any(x['status']!='PASS' for x in checks):raise SystemExit(1)
