from pathlib import Path
import os,json,io,zipfile,subprocess,socket,time,traceback,shutil,tempfile,re,csv
import fitz
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
PROJECT=Path(__file__).resolve().parents[1]
OUT=PROJECT/'qa/consumer-output';OUT.mkdir(exist_ok=True)
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
   go('en');page.get_by_label('Choose receipt images',exact=True).set_input_files([png(),jpg()]);expect(page.locator('.photo-row')).to_have_count(2)
   for i,(currency,amount) in enumerate([('USD','12.50'),('EUR','30.25')]):
    row=page.locator('.photo-row').nth(i);row.get_by_label('Transaction date · manual',exact=True).fill('2026-10-03');row.locator('select').select_option(currency);row.get_by_label('Final paid amount',exact=True).fill(amount);row.get_by_label('I checked the date, amount and currency against the source',exact=True).check()
   path=save('Confirmed totals by currency CSV','totals.csv');rows=list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))));assert ['USD','12.50','1'] in rows and ['EUR','30.25','1'] in rows
   path=save('Create evidence PDF from confirmed values','receipts.pdf');doc=fitz.open(path);assert len(doc)==1;doc[0].get_pixmap().save(OUT/'receipt-page.png');page.locator('.photo-row').first.get_by_label('Final paid amount',exact=True).fill('13.00');expect(page.locator('.photo-row').first.get_by_label('I checked the date, amount and currency against the source',exact=True)).not_to_be_checked();btn('Clear all').click();expect(page.locator('.photo-row')).to_have_count(0);return {'totals':rows,'pdf_pages':len(doc),'confirmation_invalidated_on_edit':True,'automatic_OCR':False}
  record('manual confirmations, separate currencies, CSV/PDF and edit invalidation',functional)
  def errors_and_retry():
   go('en');btn('Confirmed totals by currency CSV').click();expect(page.get_by_role('status')).to_contain_text('No receipts')
   inp=page.get_by_label('Choose receipt images',exact=True)
   inp.set_input_files({'name':'broken.png','mimeType':'image/png','buffer':b'not a real image'});expect(page.get_by_role('status')).to_contain_text('0 images ready');expect(inp).to_be_enabled()
   inp.set_input_files([png() for _ in range(11)]);expect(page.get_by_role('status')).to_contain_text('Maximum 10')
   inp.set_input_files(png());expect(page.locator('.photo-row')).to_have_count(1)
   row=page.locator('.photo-row');check=row.get_by_role('checkbox');check.click();expect(check).not_to_be_checked();expect(page.get_by_role('status')).to_contain_text('actual transaction date')
   row.get_by_label('Transaction date · manual',exact=True).fill('2026-10-03')
   for bad in ['-1','abc','1.01']:
    row.get_by_label('Final paid amount',exact=True).fill(bad);check.click();expect(check).not_to_be_checked()
   row.get_by_label('Final paid amount',exact=True).fill('1200');check.check()
   f=save('Confirmed totals by currency CSV','retry.csv');assert 'KRW,1200,1' in f.read_text(encoding='utf-8-sig')
   page.set_viewport_size({'width':320,'height':1000});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1');page.screenshot(path=OUT/'en-320-filled.png',full_page=True)
   btn('Clear all').click();inp.set_input_files(jpg());expect(page.locator('.photo-row')).to_have_count(1)
   return {'invalid_image':True,'image_limit':True,'invalid_date_amount':True,'retry_csv':'KRW,1200,1','filled_320_no_overflow':True}
  record('invalid files and values, input limit, retry and filled narrow screen',errors_and_retry)
  def cancel_loading():
   go('en');page.evaluate("""()=>{window.originalBitmap=createImageBitmap; window.createImageBitmap=async(...args)=>{await new Promise(r=>setTimeout(r,400));return window.originalBitmap(...args)}}""")
   inp=page.get_by_label('Choose receipt images',exact=True);inp.set_input_files([png(),jpg()]);expect(inp).to_be_disabled();btn('Clear all').click();expect(inp).to_be_enabled();page.wait_for_timeout(600);expect(page.locator('.photo-row')).to_have_count(0)
   inp.set_input_files(png());expect(page.locator('.photo-row')).to_have_count(1)
   return {'clear_during_decode':True,'stale_rows_absent':True,'rerun':True}
  record('cancel image decoding and rerun without stale rows',cancel_loading)
  def language_guard():
   go('en');page.get_by_label('Choose receipt images',exact=True).set_input_files(png());expect(page.locator('.photo-row')).to_have_count(1)
   page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda d:d.dismiss());page.get_by_label('Change language',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','en');expect(page.locator('.photo-row')).to_have_count(1)
   page.on('dialog',accept_dialog);page.get_by_label('Change language',exact=True).click();expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.locator('.photo-row')).to_have_count(0)
   return {'decline_preserves_input':True,'accept_clears_input':True}
  record('language change cancellation and confirmed navigation',language_guard)
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
