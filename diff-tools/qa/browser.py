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
base=os.environ.get('QA_BASE_URL',f'http://127.0.0.1:{port}').rstrip('/')
try:
 for _ in range(100):
  try:
   c=socket.create_connection(('127.0.0.1',port),timeout=.1);c.close();break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
  context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  accept_dialog=lambda d:d.accept()
  page=context.new_page();page.on('dialog',accept_dialog);errors=[];requests=[];responses=[]
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
   go('en');inputs=page.locator('.workspace input[type=file]');inputs.nth(0).set_input_files({'name':'before.txt','mimeType':'text/plain','buffer':b'a\nb'});inputs.nth(1).set_input_files({'name':'after.txt','mimeType':'text/plain','buffer':b'a\nc'});expect(page.get_by_label('Before',exact=True)).to_have_value('a\nb');expect(page.get_by_label('After',exact=True)).to_have_value('a\nc');btn('Compare').click();expect(btn('Download full diff JSON')).to_be_enabled();r=json.loads(save('Download full diff JSON','diff.json').read_text());assert r['added']==1 and r['removed']==1
   page.locator('.workspace select').first.select_option('csv');page.get_by_label('Before',exact=True).fill('id,v\na,1\nb,2');page.get_by_label('After',exact=True).fill('id,v\nb,3\na,1');btn('Compare').click();expect(btn('Download full diff JSON')).to_be_enabled();r=json.loads(save('Download full diff JSON','diff-csv.json').read_text());assert r['changed']==1
   page.get_by_label('After',exact=True).fill('id,v\na,1\na,2');btn('Compare').click();expect(page.locator('.workspace [role=status]')).to_contain_text('duplicate');btn('Clear all').click();return 'Independent text+CSV Worker, simultaneous file inputs, exact JSON and duplicate rejection'
  record('text/CSV file comparison and downloads',functional)
  def boundaries():
   go('en');before=page.get_by_label('Before',exact=True);after=page.get_by_label('After',exact=True);status=page.locator('.workspace [role=status]')
   before.fill('old');after.fill('new')
   # Same browser event turn guarantees cancellation while the real Worker is pending.
   page.evaluate("""() => { const b = name => [...document.querySelectorAll('button')].find(x=>x.textContent===name); b('Compare').click(); if(b('Cancel').disabled) throw Error('Cancel not enabled'); b('Cancel').click(); }""")
   expect(status).to_contain_text('Comparison cancelled');expect(before).to_have_value('old');expect(btn('Download full diff JSON')).to_be_disabled()
   btn('Compare').click();expect(status).to_contain_text('Comparison complete');r=json.loads(save('Download full diff JSON','rerun.json').read_text());assert r['added']==1 and r['removed']==1
   btn('Clear all').click();before.fill('x\n'*2000);expect(status).to_contain_text('2,000 lines');expect(before).to_have_value('');expect(after).to_have_value('');expect(btn('Download full diff JSON')).to_be_disabled()
   before.fill('keep');inputs=page.locator('.workspace input[type=file]')
   for name,data,needle in [('bad.bin',b'a','supported extension'),('bad.txt',b'\xff','UTF-8'),('large.txt',b'x'*(1048576+1),'size limit')]:
    inputs.nth(0).set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':data});expect(status).to_contain_text(needle);expect(before).to_have_value('keep')
   page.locator('.workspace select').first.select_option('csv');before.fill('id,v\na,1');after.fill('id,v\na,"unterminated');btn('Compare').click();expect(status).to_contain_text('Error');expect(btn('Download full diff JSON')).to_be_disabled()
   after.fill('id,v\na,2');btn('Compare').click();expect(status).to_contain_text('Comparison complete')
   page.set_viewport_size({'width':320,'height':1000});page.evaluate('window.scrollTo(0,0)');page.screenshot(path=OUT/'csv-result-320.png',full_page=True);assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   return 'Real Worker cancel/rerun; JSON inspected; clear+oversize regression; invalid extension/UTF-8/size/CSV then retry; 320px result'
  record('cancel, retry, clear regression and invalid inputs',boundaries)
  def language_boundary():
   go('en');page.get_by_label('Before',exact=True).fill('preserve on dismissed language change')
   page.remove_listener('dialog',accept_dialog);dismiss=lambda d:d.dismiss();page.on('dialog',dismiss)
   try:
    page.get_by_role('button',name='Change language',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','en');expect(page.get_by_label('Before',exact=True)).to_have_value('preserve on dismissed language change')
   finally:page.remove_listener('dialog',dismiss);page.on('dialog',accept_dialog)
   page.evaluate("""() => { [...document.querySelectorAll('button')].find(x=>x.textContent==='Compare').click(); document.querySelector('[aria-label="Change language"]').click(); }""")
   expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.get_by_label('이전 원문',exact=True)).to_have_value('');expect(page.get_by_role('button',name='전체 변경내역 JSON 저장',exact=True)).to_be_disabled()
   page.get_by_label('이전 원문',exact=True).fill('가');page.get_by_label('이후 원문',exact=True).fill('나');btn('비교 실행').click();expect(page.locator('.workspace [role=status]')).to_contain_text('비교 완료');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=OUT/'ko-result-320.png',full_page=True)
   return 'Language confirmation dismissal preserves inputs; acceptance during pending Worker resets workspace; Korean rerun succeeds'
  record('language switch cancellation and accepted navigation',language_boundary)
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
   return {'page_errors':errors,'requests':len(requests),'external_requests':0,'server_posts':0,'siblings_present':bool(os.environ.get('QA_BASE_URL')),'isolated_path':str(isolated)}
  record('service asset isolation and zero external traffic',isolation)
  browser.close()
finally:
 server.terminate();server.wait(timeout=5)
if any(x['status']!='PASS' for x in checks):raise SystemExit(1)
