from pathlib import Path
import os,json,io,zipfile,subprocess,socket,time,traceback,shutil,tempfile,re,csv
import fitz
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
PROJECT=Path(__file__).resolve().parents[1]
OUT=PROJECT/'qa/consumer-browser-output';OUT.mkdir(exist_ok=True)
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
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,chromium_sandbox=True)
  context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
  page=context.new_page();dialog_handler=lambda d:d.accept();page.on('dialog',dialog_handler);errors=[];requests=[];responses=[]
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
   go('en');zone=page.get_by_label('Reference zone (IANA)',exact=True);local=page.get_by_label('Local reference date / time',exact=True);zone.fill('America/New_York');local.fill('2026-03-08T02:30');btn('Convert / Find overlap').click();expect(page.get_by_role('alert')).to_contain_text('does not exist');zone.fill('Asia/Seoul');local.fill('2026-10-03T12:00');btn('Convert / Find overlap').click();expect(btn('Save selected time as ICS')).to_be_enabled();path=save('Save selected time as ICS','meeting.ics');ics=path.read_bytes().decode();assert 'DTSTART:20261003T030000Z' in ics and '\r\n' in ics;zone.fill('America/New_York');local.fill('2026-11-01T01:30');btn('Convert / Find overlap').click();expect(page.get_by_role('alert')).to_contain_text('occurs twice');expect(btn('Save selected time as ICS')).to_be_disabled();return 'DST gap blocked, UTC ICS exact, DST fold requires explicit occurrence'
  record('IANA conversion, DST gap/fold and ICS download',functional)
  def setup():
   go('en');page.get_by_label('Reference zone (IANA)',exact=True).fill('UTC');page.get_by_label('Local reference date / time',exact=True).fill('2026-10-03T09:00')
  def run():
   btn('Convert / Find overlap').click();expect(btn('Convert / Find overlap')).to_be_enabled()
  def errors_retry():
   setup();zone=page.get_by_label('Reference zone (IANA)',exact=True);zone.fill('Invalid/Zone');run();expect(page.get_by_role('alert')).to_contain_text('valid IANA');expect(btn('Save selected time as ICS')).to_be_disabled()
   zone.fill('UTC');page.get_by_label('Local reference date / time',exact=True).fill('');run();expect(page.get_by_role('alert')).to_contain_text('Enter a date')
   page.get_by_label('Local reference date / time',exact=True).fill('2026-10-03T09:00')
   row=page.locator('.aux-zone-row').first;row.locator('[data-key=end]').fill('09:00');run();expect(page.get_by_role('alert')).to_contain_text('must differ');row.locator('[data-key=end]').fill('17:00');run();expect(btn('Save selected time as ICS')).to_be_enabled()
   for _ in range(3):btn('+ Add zone').click()
   expect(btn('+ Add zone')).to_be_disabled();assert page.locator('.aux-zone-row').count()==6
   for _ in range(6):btn('Remove').first.click()
   run();expect(page.get_by_role('alert')).to_contain_text('1–6');btn('+ Add zone').click();run();expect(btn('Save selected time as ICS')).to_be_enabled()
   return 'Invalid IANA, missing date, equal hours, 0/6 zones and recovery verified'
  record('consumer error boundaries and retries',errors_retry)
  def overlap_download():
   setup()
   while page.locator('.aux-zone-row').count()>1:btn('Remove').last.click()
   row=page.locator('.aux-zone-row').first;row.locator('[data-key=zone]').fill('UTC');row.locator('[data-key=start]').fill('09:00');row.locator('[data-key=end]').fill('10:00');select_field('Search horizon','1');run()
   expect(btn('Save this time')).to_have_count(1)
   page.get_by_label('ICS title (local file only)',exact=True).fill('회의, A; B')
   f=save('Save this time','overlap.ics');data=f.read_bytes();assert b'DTSTART:20261003T090000Z\r\n' in data and b'DTEND:20261003T100000Z\r\n' in data
   assert 'SUMMARY:회의\\, A\\; B' in data.decode();assert all(len(line)<=75 for line in data.split(b'\r\n'))
   select_field('Meeting duration','120');expect(btn('Save selected time as ICS')).to_be_disabled();run();expect(page.get_by_text('No overlap found. Widen availability or the search period.',exact=True)).to_be_visible()
   page.screenshot(path=OUT/'no-overlap.png',full_page=True)
   return 'Exact overlap download UTC start/end/title escaping; changing duration clears stale export; no overlap shown'
  record('consumer overlap ICS and no-overlap boundary',overlap_download)
  def fold_choices():
   setup();page.get_by_label('Reference zone (IANA)',exact=True).fill('America/New_York');page.get_by_label('Local reference date / time',exact=True).fill('2026-11-01T01:30');run()
   choice=page.locator('label').filter(has=page.get_by_text('Choose the DST occurrence',exact=True)).locator('select')
   for index,stamp in [(1,'20261101T053000Z'),(2,'20261101T063000Z')]:
    choice.select_option(index=index);expect(btn('Save selected time as ICS')).to_be_enabled();f=save('Save selected time as ICS',f'fold-{index}.ics');assert f'DTSTART:{stamp}\r\n' in f.read_bytes().decode()
   page.screenshot(path=OUT/'fold-choice.png',full_page=True)
   return 'Both repeated local-time occurrences exported to distinct correct UTC files'
  record('consumer explicit DST fold choice and downloads',fold_choices)
  def cancel_rerun():
   setup()
   page.evaluate('''() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Convert / Find overlap'); b.click(); const input=document.querySelector('input[type="datetime-local"]'); input.value='2026-10-03T10:00'; input.dispatchEvent(new Event('input',{bubbles:true})); }''')
   expect(btn('Convert / Find overlap')).to_be_enabled();expect(btn('Save selected time as ICS')).to_be_disabled();expect(page.get_by_text('Enter a date, time, and zones, then convert.',exact=True)).to_be_visible();run();expect(btn('Save selected time as ICS')).to_be_enabled();f=save('Save selected time as ICS','rerun.ics');assert b'DTSTART:20261003T100000Z' in f.read_bytes()
   return 'Synchronous input change cancels pending run; stale export disabled; rerun uses updated date'
  record('consumer cancellation via input and rerun',cancel_rerun)
  def language_transition():
   setup();title=page.get_by_label('ICS title (local file only)',exact=True);title.fill('KEEP IF CANCELLED')
   page.remove_listener('dialog',dialog_handler);page.once('dialog',lambda d:d.dismiss());page.get_by_role('button',name='Change language',exact=True).click();expect(title).to_have_value('KEEP IF CANCELLED');assert page.locator('html').get_attribute('lang')=='en'
   page.once('dialog',lambda d:d.accept());page.get_by_role('button',name='Change language',exact=True).click();assert page.locator('html').get_attribute('lang')=='ko';expect(page.get_by_label('ICS 제목 (로컬 파일에만 포함)',exact=True)).to_have_value('회의')
   page.on('dialog',dialog_handler);page.get_by_role('button',name='언어 변경',exact=True).click();assert page.locator('html').get_attribute('lang')=='en'
   page.evaluate('''() => { [...document.querySelectorAll('button')].find(x=>x.textContent==='Convert / Find overlap').click(); document.querySelector('[aria-label="Change language"]').click(); }''')
   expect(page.get_by_role('button',name='선택 시각 ICS 저장',exact=True)).to_be_disabled();expect(page.get_by_text('시각과 지역을 입력하고 변환하세요.',exact=True)).to_be_visible()
   return 'Language confirmation cancel preserves input; accept resets; navigation during calculation leaves clean new workspace'
  record('consumer language cancel, confirm and active-run navigation',language_transition)
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
   return {'page_errors':errors,'requests':len(requests),'external_requests':0,'server_posts':0,'siblings_present':False}
  record('standalone browser dependencies and zero external traffic',isolation)
  browser.close()
finally:
 server.terminate();server.wait(timeout=5)
if any(x['status']!='PASS' for x in checks):raise SystemExit(1)
