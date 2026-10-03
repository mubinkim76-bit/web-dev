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
   go('en');page.get_by_label('Area (selected unit)',exact=True).first.fill('88');page.get_by_label('Coverage per pack (selected unit)',exact=True).fill('12');page.get_by_label('Waste (%)',exact=True).fill('10');btn('Calculate quantity').click();expect(btn('Save CSV')).to_be_enabled();path=save('Save CSV','quantity.csv');rows=list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))));assert any('10' in row for row in rows),rows;pages=printed('Print / Save as PDF','quantity.pdf','10');page.get_by_label('Area (selected unit)',exact=True).first.fill('0');btn('Calculate quantity').click();expect(page.get_by_role('alert')).to_be_visible();expect(btn('Save CSV')).to_be_disabled();return {'ceil_packages':10,'csv_rows':rows,'printed_pages':pages,'native_print_dialog':'NOT RUN'}
  record('quantity ceiling, CSV, invalid input and print rendering',functional)
  def boundaries():
   go('en')
   area=page.get_by_label('Area (selected unit)',exact=True).first
   area.fill('88');btn('Calculate quantity').click()
   page.remove_listener('dialog',accept_dialog)
   dismiss_dialog=lambda d:d.dismiss()
   page.on('dialog',dismiss_dialog);btn('Change language').click()
   assert page.locator('html').get_attribute('lang')=='en';expect(area).to_have_value('88')
   page.remove_listener('dialog',dismiss_dialog);page.on('dialog',accept_dialog)
   btn('Change language').click();assert page.locator('html').get_attribute('lang')=='ko'
   expect(page.get_by_label('면적 (선택한 단위)',exact=True).first).to_have_value('10')
   btn('언어 변경').click();assert page.locator('html').get_attribute('lang')=='en'
   area=page.get_by_label('Area (selected unit)',exact=True).first
   for invalid in ['', '-1', '0.0000001']:
    area.fill(invalid);expect(btn('Save CSV')).to_be_disabled();btn('Calculate quantity').click();expect(page.get_by_role('alert')).to_be_visible()
   area.fill('88');btn('Calculate quantity').click();expect(btn('Save CSV')).to_be_enabled()
   select_field('Material type','paint');page.get_by_label('Coats (paint only)',exact=True).fill('1.5');btn('Calculate quantity').click();expect(page.get_by_role('alert')).to_be_visible()
   page.get_by_label('Coats (paint only)',exact=True).fill('2');page.get_by_label('Coverage per pack (selected unit)',exact=True).fill('12');page.get_by_label('Price per pack (optional)',exact=True).fill('5');btn('Calculate quantity').click()
   csvfile=save('Save CSV','quantity-paint-retry.csv');rows=list(csv.reader(io.StringIO(csvfile.read_text(encoding='utf-8-sig'))));assert ['packs_rounded_up','19','packs'] in rows;assert ['estimated_cost','95','user_currency'] in rows
   page.screenshot(path=OUT/'consumer-paint-success.png',full_page=True)
   for _ in range(18):btn('+ Add room').click()
   expect(btn('+ Add room')).to_be_disabled();assert page.locator('.aux-room-row').count()==20
   for _ in range(20):btn('Remove').first.click()
   btn('Calculate quantity').click();expect(page.get_by_role('alert')).to_be_visible();expect(btn('Save CSV')).to_be_disabled()
   btn('+ Add room').click();page.get_by_label('Room / area name',exact=True).fill('Retry');page.get_by_label('Area (selected unit)',exact=True).fill('12');btn('Calculate quantity').click();expect(btn('Save CSV')).to_be_enabled()
   select_field('Unit for ALL areas and coverage','ft2');expect(btn('Save CSV')).to_be_disabled();btn('Calculate quantity').click();expect(btn('Save CSV')).to_be_enabled()
   path=save('Save CSV','quantity-unit-retry.csv');assert ['packs_rounded_up','3','packs'] in list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
   return {'language_cancel_preserves_input':True,'language_accept_resets_input':True,'invalid_cases':4,'paint_packs':19,'paint_cost':95,'room_limit':20,'delete_all_and_retry':True,'unit_change_recalculation':True,'run_cancel':'not applicable: calculation synchronous; language cancel tested'}
  record('consumer cancel, language reset, error recovery, room limits and repeat downloads',boundaries)
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
