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
   go('en');btn('Load two sample files').click();expect(btn('Preview cleanup & merge')).to_be_enabled();page.locator('label').filter(has_text=re.compile(r'^1\. id$')).last.locator('input').check();select_field('4. Duplicate policy','first');btn('Preview cleanup & merge').click();expect(page.locator('.workspace')).to_contain_text('6 = 4 + 2');expect(btn('Download CSV')).to_be_disabled();page.get_by_label('I confirm excluding 2 proposed duplicate rows',exact=True).check();select_field('Export mode','protected');expect(btn('Download CSV')).to_be_enabled();path=save('Download CSV','merged.csv');rows=list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))));assert len(rows)==5 and rows[1][0]=='000123';assert any(any(cell.startswith("'") for cell in row) for row in rows)
   select_field('Choose the delimiter explicitly',';');expect(page.get_by_role('button',name='Preview cleanup & merge',exact=True,include_hidden=True)).to_be_disabled();btn('Clear all').click();return {'rows':rows,'duplicate_and_formula_approval':'PASS','format_invalidation':'PASS'}
  record('CSV mapping, approved duplicates, protected download and invalidation',functional)
  def errors_and_retry():
   go('en')
   cases=[('bad.csv',b'a,b\n"unclosed','Error'),('bad.csv',b'a,b\n1,2,3','Error'),('bad.csv',b'a\n\xff','Error'),('empty.csv',b'','empty file'),('bad.xlsx',b'a\n1','XLSX is not supported')]
   for name,data,message in cases:
    page.locator('input[type=file]').set_input_files({'name':name,'mimeType':'text/csv','buffer':data})
    btn('Validate selected files').click();expect(page.locator('.du-status').first).to_contain_text(message)
    expect(page.get_by_role('button',name='Preview cleanup & merge',exact=True,include_hidden=True)).to_be_disabled()
   page.locator('input[type=file]').set_input_files([{'name':f'{i}.csv','mimeType':'text/csv','buffer':b'a\n1'} for i in range(4)])
   btn('Validate selected files').click();expect(page.locator('.du-status').first).to_contain_text('Maximum 3 files')
   page.locator('input[type=file]').set_input_files({'name':'valid.csv','mimeType':'text/csv','buffer':'id,name\n0001, 한글 \n0002,민수'.encode()})
   btn('Validate selected files').click();expect(btn('Preview cleanup & merge')).to_be_enabled()
   page.get_by_label('1. Trim cell whitespace',exact=True).check();btn('Preview cleanup & merge').click()
   expect(btn('Download CSV')).to_be_enabled()
   file=save('Download CSV','retry-cleaned.csv');rows=list(csv.reader(io.StringIO(file.read_text(encoding='utf-8-sig'))));assert rows==[['id','name'],['0001','한글'],['0002','민수']],rows
   audit=json.loads(save('Download full audit JSON','retry-audit.json').read_text());assert audit['outputRows']==2 and len(audit['changes'])==1
   page.screenshot(path=OUT/'retry-cleaned.png',full_page=True)
   return {'rejections':6,'rows':rows,'audit_changes':len(audit['changes'])}
  record('Malformed, uneven, invalid UTF8, empty, XLSX, file limit and retry downloads',errors_and_retry)
  def cancellation():
   go('en');btn('Load two sample files').click();expect(btn('Preview cleanup & merge')).to_be_enabled()
   page.evaluate("""() => {const b=t=>[...document.querySelectorAll('button')].find(x=>x.textContent===t);b('Preview cleanup & merge').click();if(b('Cancel').disabled)throw Error('cancel unavailable');b('Cancel').click();}""")
   expect(page.locator('.du-status').first).to_contain_text('Cancelled');expect(btn('Preview cleanup & merge')).to_be_enabled();assert btn('Download CSV').count()==0
   btn('Preview cleanup & merge').click();expect(page.locator('.workspace')).to_contain_text('6 = 6 + 0')
   expect(btn('Download CSV')).to_be_disabled();page.get_by_label('I understand formula execution and auto-formatting risks and want the raw-value CSV',exact=True).check()
   rows=list(csv.reader(io.StringIO(save('Download CSV','raw-approved.csv').read_text(encoding='utf-8-sig'))));assert len(rows)==7 and any('=1+1' in row for row in rows)
   btn('Clear all').click();assert btn('Download CSV').count()==0
   page.evaluate("""() => {const b=t=>[...document.querySelectorAll('button')].find(x=>x.textContent===t);b('Load two sample files').click();b('Cancel').click();}""")
   expect(page.locator('.du-status').first).to_contain_text('Cancelled')
   btn('Load two sample files').click();expect(btn('Preview cleanup & merge')).to_be_enabled()
   return {'cancel_parse':'PASS','cancel_merge':'PASS','rerun':'PASS','raw_approval_and_download':'PASS'}
  record('Cancel parsing and merging, rerun, raw approval and clear',cancellation)
  def language_transition():
   go('en');btn('Load two sample files').click();expect(btn('Preview cleanup & merge')).to_be_enabled()
   page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda d:d.dismiss());page.get_by_role('button',name='Change language',exact=True).click()
   assert page.locator('html').get_attribute('lang')=='en';expect(btn('Preview cleanup & merge')).to_be_enabled()
   page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Change language',exact=True).click();assert page.locator('html').get_attribute('lang')=='ko'
   expect(page.get_by_role('button',name='정리·병합 미리보기',exact=True,include_hidden=True)).to_be_disabled()
   page.on('dialog',accept_dialog);page.get_by_role('button',name='언어 변경',exact=True).click();assert page.locator('html').get_attribute('lang')=='en'
   btn('Load two sample files').click();expect(btn('Preview cleanup & merge')).to_be_enabled();page.reload();expect(page.get_by_role('button',name='Preview cleanup & merge',exact=True,include_hidden=True)).to_be_disabled()
   return {'dismiss_preserves_input':'PASS','accept_clears_input':'PASS','reload_clears_input':'PASS'}
  record('Language transition confirm/cancel and refresh clear inputs',language_transition)
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
