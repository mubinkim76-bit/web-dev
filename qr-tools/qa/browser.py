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
  page=context.new_page();dialog_decision={'accept':True};page.on('dialog',lambda d:d.accept() if dialog_decision['accept'] else d.dismiss());errors=[];requests=[];responses=[]
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
   from decoder import decode
   go('en');select_field('Content type','text');page.get_by_label('QR data',exact=True).fill('한글 😀');btn('Generate QR').click();expect(btn('Save SVG')).to_be_enabled();svg=save('Save SVG','code.svg');assert '<svg' in svg.read_text();pngpath=save('Save PNG','code.png');im=Image.open(pngpath);im.load();found=decode(im);assert len(found)==1 and found[0]=='한글 😀';page.get_by_label('QR data',exact=True).fill('한'*167);btn('Generate QR').click();expect(page.get_by_role('alert')).to_be_visible();expect(btn('Save PNG')).to_be_disabled();return {'independent_decoder':'libzbar','decoded':'한글 😀','png_dimensions':list(im.size),'over_500_bytes':'blocked'}
  record('static QR PNG/SVG, independent decode and byte limit',functional)
  def boundaries():
   from decoder import decode
   go('en');field=page.get_by_label('QR data',exact=True)
   for value in ['', 'javascript:alert(1)', 'https://u:p@example.com', ' https://example.com', 'https://example.com/a b']:
    field.fill(value);btn('Generate QR').click();expect(page.get_by_role('alert')).to_be_visible();expect(btn('Save PNG')).to_be_disabled();expect(btn('Save SVG')).to_be_disabled()
   field.fill('https://example.com/a?b=1&c=2');btn('Generate QR').click();expect(btn('Save PNG')).to_be_enabled()
   f=save('Save PNG','url.png');assert decode(Image.open(f))==['https://example.com/a?b=1&c=2']
   field.fill('https://example.com/changed');expect(btn('Save PNG')).to_be_disabled();btn('Generate QR').click();btn('Clear').click();expect(field).to_have_value('');expect(btn('Save SVG')).to_be_disabled();expect(field).to_be_focused()
   select_field('Content type','text');field.fill('a'*500);btn('Generate QR').click();f=save('Save PNG','500-bytes.png');assert decode(Image.open(f))==['a'*500]
   field.fill('한'*167);btn('Generate QR').click();expect(page.get_by_role('alert')).to_be_visible();field.fill('retry 한글 😀');btn('Generate QR').click();expect(page.get_by_role('alert')).to_be_hidden()
   for size in ['256','512','1024']:
    select_field('Output size',size);expect(btn('Save PNG')).to_be_disabled();btn('Generate QR').click();f=save('Save PNG','size-'+size+'.png');im=Image.open(f);assert im.width>=int(size);assert decode(im)==['retry 한글 😀'];svg=save('Save SVG','size-'+size+'.svg');assert 'width="'+size+'"' in svg.read_text()
   page.screenshot(path=OUT/'success-qr.png',full_page=True)
   return {'invalid_inputs':5,'exact_500_bytes':'decoded','over_500_bytes':'rejected','clear_edit_rerun':'PASS','output_sizes':[256,512,1024]}
  record('URL and text boundaries, clear, rerun, three PNG/SVG sizes',boundaries)
  def language():
   go('en');field=page.get_by_label('QR data',exact=True);field.fill('https://example.com/keep');btn('Generate QR').click()
   dialog_decision['accept']=False;page.get_by_role('button',name='Change language',exact=True).click();assert page.locator('html').get_attribute('lang')=='en';expect(field).to_have_value('https://example.com/keep');expect(btn('Save PNG')).to_be_enabled()
   dialog_decision['accept']=True;page.get_by_role('button',name='Change language',exact=True).click();assert page.locator('html').get_attribute('lang')=='ko';expect(page.get_by_label('QR에 넣을 데이터',exact=True)).to_have_value('https://example.com');expect(btn('PNG 저장')).to_be_disabled();btn('QR 생성').click();expect(btn('PNG 저장')).to_be_enabled()
   page.get_by_role('button',name='언어 변경',exact=True).click();assert page.locator('html').get_attribute('lang')=='en'
   return {'cancel_preserves_input_and_result':True,'accept_clears_and_remounts':True,'korean_rerun':True}
  record('language confirmation cancel and accept, remount and rerun',language)
  def async_cancel_and_errors():
   go('en');downloads=[];listener=lambda d:downloads.append(d.suggested_filename);page.on('download',listener)
   for action in ['clear','language']:
    if page.locator('html').get_attribute('lang')!='en':go('en')
    page.get_by_label('QR data',exact=True).fill('https://example.com/cancel');btn('Generate QR').click()
    page.evaluate("() => {window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){window.originalToBlob.call(this,blob=>{window.pendingPNG=()=>cb(blob)},...args)}}")
    btn('Save PNG').click()
    for _ in range(100):
     if page.evaluate('() => typeof window.pendingPNG === "function"'):break
     page.wait_for_timeout(20)
    assert page.evaluate('() => typeof window.pendingPNG === "function"')
    if action=='clear':btn('Clear').click()
    else:page.get_by_role('button',name='Change language',exact=True).click()
    page.evaluate('() => {window.pendingPNG();window.pendingPNG=null;HTMLCanvasElement.prototype.toBlob=window.originalToBlob}');page.wait_for_timeout(250);assert not downloads,downloads
   go('en');btn('Generate QR').click();page.evaluate('() => {window.originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb){cb(null)}}');btn('Save PNG').click();expect(page.get_by_role('alert')).to_have_text('Could not create the PNG. Please try again.');page.screenshot(path=OUT/'png-error.png',full_page=True);page.evaluate('() => {HTMLCanvasElement.prototype.toBlob=window.originalToBlob}');btn('Generate QR').click();expect(page.get_by_role('alert')).to_be_hidden();save('Save PNG','retry-after-png-error.png');assert len(downloads)==1;page.remove_listener('download',listener)
   return {'delayed_png_cancel_on_clear':True,'delayed_png_cancel_on_language':True,'null_blob_error_and_retry':True}
  record('pending PNG cancellation and forced export failure recovery',async_cancel_and_errors)
  def print_document():
   go('en');btn('Generate QR').click();pages=printed('Print / Save as PDF','qr-print.pdf','QR');assert pages==1
   return {'print_document_pages':pages,'physical_print':'NOT_RUN'}
  record('print document and rendered PDF',print_document)
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
