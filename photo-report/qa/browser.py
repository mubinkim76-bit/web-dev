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
   go('en');page.get_by_label('Choose report photos',exact=True).set_input_files([png(),jpg()]);expect(page.locator('.photo-row')).to_have_count(2);page.locator('.photo-row textarea').first.fill('합성 한글 캡션');btn('Generate all-page preview').click();expect(page.locator('.page-previews img')).to_have_count(1,timeout=30000);expect(btn('Download reviewed PDF')).to_be_disabled();page.get_by_label('I reviewed photos, captions and cropping on every page',exact=True).check();path=save('Download reviewed PDF','photo-report.pdf');doc=fitz.open(path);assert len(doc)==1;pix=doc[0].get_pixmap();pix.save(OUT/'photo-report-page.png');assert len(set(pix.samples))>20
   page.locator('.photo-row textarea').first.fill('changed');expect(btn('Download reviewed PDF')).to_be_disabled();btn('Clear all').click();expect(page.locator('.photo-row')).to_have_count(0);return {'pdf_pages':len(doc),'pdf_size':path.stat().st_size,'review_gate':'PASS','caption_edit_invalidation':'PASS'}
  record('photo/caption preview, reviewed PDF and invalidation',functional)
  def errors_retry():
   go('en')
   upload=page.get_by_label('Choose report photos',exact=True)
   upload.set_input_files({'name':'broken.png','mimeType':'image/png','buffer':b'not an image'})
   expect(page.locator('.photo-row')).to_have_count(0)
   expect(page.locator('.workspace [role=status]')).to_contain_text('broken.png')
   upload.set_input_files([png()]);expect(page.locator('.photo-row')).to_have_count(1)
   page.get_by_label('Caption CSV',exact=True).set_input_files({'name':'bad.csv','mimeType':'text/csv','buffer':b'wrong,header\nalpha.png,test'})
   expect(page.locator('.workspace [role=status]')).to_contain_text('Headers must')
   page.get_by_label('Caption CSV',exact=True).set_input_files({'name':'good.csv','mimeType':'text/csv','buffer':b'file_name,caption,work_date\nalpha.png,recovered,2026-10-03'})
   expect(page.locator('.photo-row textarea')).to_have_value('recovered')
   page.locator('.photo-row textarea').fill('x'*301);btn('Generate all-page preview').click()
   expect(page.locator('.workspace [role=status]')).to_contain_text('300-character')
   page.locator('.photo-row textarea').fill('recovered');btn('Generate all-page preview').click()
   expect(page.locator('.page-previews img')).to_have_count(1,timeout=30000)
   return {'invalid_image':'PASS','invalid_csv_then_retry':'PASS','caption_limit_then_retry':'PASS'}
  record('consumer invalid inputs and retries',errors_retry)
  def cancel_rerun():
   go('en');page.get_by_label('Choose report photos',exact=True).set_input_files([png(),jpg()]);expect(page.locator('.photo-row')).to_have_count(2)
   page.evaluate("""() => { const buttons=[...document.querySelectorAll('button')]; buttons.find(b=>b.textContent==='Generate all-page preview').click(); buttons.find(b=>b.textContent==='Cancel').click(); }""")
   expect(btn('Generate all-page preview')).to_be_enabled(timeout=30000)
   expect(page.locator('.page-previews img')).to_have_count(0);expect(btn('Download reviewed PDF')).to_be_disabled()
   btn('Generate all-page preview').click();expect(page.locator('.page-previews img')).to_have_count(1,timeout=30000)
   page.get_by_label('I reviewed photos, captions and cropping on every page',exact=True).check()
   path=save('Download reviewed PDF','consumer-rerun.pdf');doc=fitz.open(path);assert len(doc)==1
   btn('Clear all').click();expect(page.locator('.photo-row')).to_have_count(0);expect(btn('Download reviewed PDF')).to_be_disabled()
   return {'cancel_then_rerun':'PASS','download_bytes':path.stat().st_size,'clear':'PASS'}
  record('consumer preview cancellation rerun download and clear',cancel_rerun)
  def language_boundary():
   go('en');page.get_by_label('Choose report photos',exact=True).set_input_files([png()]);expect(page.locator('.photo-row')).to_have_count(1)
   page.remove_listener('dialog',accept_dialog)
   def dismiss(d):d.dismiss()
   page.on('dialog',dismiss);btn('Change language').click();expect(page.locator('html')).to_have_attribute('lang','en');expect(page.locator('.photo-row')).to_have_count(1)
   page.remove_listener('dialog',dismiss);page.on('dialog',accept_dialog);btn('Change language').click()
   expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.locator('.photo-row')).to_have_count(0)
   return {'dismiss_preserves_input':'PASS','confirm_clears_input':'PASS'}
  record('consumer language transition confirm and cancel',language_boundary)
  def narrow_limit():
   page.set_viewport_size({'width':320,'height':1000});go('en')
   photos=[{**png(),'name':f'{i}.png'} for i in range(11)]
   page.get_by_label('Choose report photos',exact=True).set_input_files(photos)
   expect(page.locator('.workspace [role=status]')).to_contain_text('Maximum 10 images');expect(page.locator('.photo-row')).to_have_count(0)
   page.get_by_label('Choose report photos',exact=True).set_input_files(photos[:3]);expect(page.locator('.photo-row')).to_have_count(3)
   select_field('Layout','2');select_field('Paper','Letter');btn('Generate all-page preview').click();expect(page.locator('.page-previews img')).to_have_count(2,timeout=30000)
   page.get_by_label('I reviewed photos, captions and cropping on every page',exact=True).check();path=save('Download reviewed PDF','consumer-letter-2pages.pdf')
   doc=fitz.open(path);assert len(doc)==2;assert round(doc[0].rect.width)==612 and round(doc[0].rect.height)==792
   page.screenshot(path=OUT/'consumer-320-filled.png',full_page=True);doc[0].get_pixmap().save(OUT/'consumer-letter-page.png')
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
   return {'limit_recovery':'PASS','letter_pdf_pages':len(doc),'width':320}
  record('consumer narrow limit recovery and multipage Letter download',narrow_limit)
  def csv_latest_request():
   results=[]
   for completion in ['A-first','B-first','stale-error','clear-pending']:
    go('en');page.get_by_label('Choose report photos',exact=True).set_input_files([png()]);expect(page.locator('.photo-row')).to_have_count(1)
    page.evaluate("""() => {
     window.pendingCsv=[]; const original=File.prototype.arrayBuffer;
     File.prototype.arrayBuffer=function(){
      if(!this.name.endsWith('.csv')) return original.call(this);
      return new Promise((resolve,reject)=>pendingCsv.push({name:this.name,finish:()=>original.call(this).then(resolve,reject),fail:()=>reject(new Error('stale CSV failure'))}));
     };
    }""")
    csv_input=page.get_by_label('Caption CSV',exact=True)
    for name in ['A','B']:
     csv_input.set_input_files({'name':name+'.csv','mimeType':'text/csv','buffer':('file_name,caption,work_date\nalpha.png,'+name+',2026-10-04').encode()})
    page.wait_for_function('pendingCsv.length === 2')
    if completion=='clear-pending':
     btn('Clear all').click()
     page.evaluate('async()=>{await pendingCsv[0].finish();await pendingCsv[1].finish()}')
     expect(page.locator('.photo-row')).to_have_count(0);expect(page.locator('.workspace [role=status]')).to_have_text('Workspace cleared')
    else:
     first=0 if completion=='A-first' else 1
     page.evaluate('(i)=>pendingCsv[i].finish()',first)
     expect(page.locator('.photo-row textarea')).to_have_value('' if first==0 else 'B')
     if first==0:assert csv_input.evaluate('(e)=>e.files[0]?.name')=='B.csv'
     page.evaluate('(fail)=>fail ? pendingCsv[0].fail() : pendingCsv['+str(1-first)+'].finish()',completion=='stale-error')
     expect(page.locator('.photo-row textarea')).to_have_value('B')
     expect(page.locator('.workspace [role=status]')).to_contain_text('1 captions linked')
    results.append(completion)
   return {'latest_request_only':results}
  record('latest CSV request wins regardless of completion order',csv_latest_request)
  def clear_details():
   for lang in ['en','ko']:
    go(lang);page.evaluate("window.dirtyEvents=[];window.addEventListener('workspace-dirty',e=>dirtyEvents.push(e.detail))")
    fields=page.locator('.grid-2 input');fields.nth(0).fill('custom title');fields.nth(1).fill('custom author')
    page.locator('.grid-2 select').nth(0).select_option('Letter');page.locator('.grid-2 select').nth(1).select_option('2')
    page.get_by_role('button',name='Clear all' if lang=='en' else '전체 지우기',exact=True).click()
    expect(fields.nth(0)).to_have_value('Site photo report' if lang=='en' else '현장 사진대지');expect(fields.nth(1)).to_have_value('')
    expect(page.locator('.grid-2 select').nth(0)).to_have_value('A4');expect(page.locator('.grid-2 select').nth(1)).to_have_value('4')
    assert page.evaluate('dirtyEvents.at(-1) === false')
   return {'localized_defaults':'PASS','author_cleared':'PASS','dirty_false':'PASS'}
  record('clear all restores report details and clean state',clear_details)
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
