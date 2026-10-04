from pathlib import Path
import os,json,io,zipfile,subprocess,socket,time,traceback,shutil,tempfile
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
isolated=Path(tempfile.mkdtemp(prefix='image-browser-isolated-'))/'project';shutil.copytree(PROJECT,isolated)
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
  page=context.new_page();page.on('dialog',lambda d:d.accept());errors=[];requests=[];responses=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append([r.method,r.url]));page.on('response',lambda r:responses.append([r.status,r.url]))
  def go(lang='ko'):
   page.goto(base+('/?lang=en' if lang=='en' else '/'));page.locator('.workspace input[type=file]').first.wait_for();page.evaluate('document.fonts.ready')
  def btn(name):return page.get_by_role('button',name=name,exact=True)
  def save(name,file):
   with page.expect_download() as d:btn(name).click()
   d.value.save_as(OUT/file);assert d.value.failure() is None;return OUT/file
  def conversion():
   go();page.get_by_label('사진 선택',exact=True).set_input_files([png(),jpg(),{'name':'third.png','mimeType':'image/png','buffer':png()['buffer']}]);btn('+ 출력 규격 추가').click()
   preset=page.locator('.preset').nth(1);preset.locator('select').nth(0).select_option('image/png');preset.locator('input[type=number]').nth(0).fill('180');preset.locator('input[type=number]').nth(0).dispatch_event('change');preset.locator('input[type=number]').nth(1).fill('180');preset.locator('input[type=number]').nth(1).dispatch_event('change')
   btn('첫 사진 변환 미리보기').click();expect(page.locator('.image-preview img')).to_be_visible();assert page.locator('.image-preview img').evaluate('(x)=>x.naturalWidth')==200
   btn('일괄 변환').click();expect(page.locator('.workspace [role=status]')).to_contain_text('저장 가능 6',timeout=30000)
   path=save('성공 파일 ZIP 저장','six-results.zip');pixels=[]
   with zipfile.ZipFile(path) as z:
    names=[n for n in z.namelist() if n.endswith(('.jpg','.png'))];assert len(names)==6 and len(set(names))==6
    for name in names:
     im=Image.open(io.BytesIO(z.read(name)));im.load();assert not im.getexif();pixels.append({'name':name,'dimensions':list(im.size),'mode':im.mode})
     if 'alpha' in name and name.endswith('.jpg'):assert all(c>=245 for c in im.convert('RGB').getpixel((0,0)))
     if 'alpha' in name and name.endswith('.png'):assert im.getpixel((0,0))[3]==0 and im.size==(180,90)
     if 'rotated' in name and name.endswith('.jpg'):assert im.size==(240,360)
   page.screenshot(path=OUT/'conversion-results.png',full_page=True);return {'zip_images':pixels,'alpha_and_exif_pixels':'PASS'}
  record('preview, six real outputs, ZIP, alpha pixels and EXIF orientation',conversion)
  def cancel_rerun():
   go();page.get_by_label('사진 선택',exact=True).set_input_files([png(),png(),jpg()]);page.evaluate("()=>{window.nativeBitmap=createImageBitmap;window.createImageBitmap=async(...args)=>{await new Promise(r=>setTimeout(r,120));return window.nativeBitmap(...args)}}")
   page.evaluate("()=>{const b=[...document.querySelectorAll('button')];b.find(x=>x.textContent==='일괄 변환').click();b.find(x=>x.textContent==='취소').click()}")
   expect(page.locator('.workspace [role=status]')).to_contain_text('미처리 2',timeout=30000);page.evaluate('()=>{window.createImageBitmap=window.nativeBitmap}');btn('일괄 변환').click();expect(page.locator('.workspace [role=status]')).to_contain_text('저장 가능 3',timeout=30000)
   btn('전체 지우기').click();expect(page.locator('.workspace [role=status]')).to_contain_text('작업 메모리를 지웠');return 'Actual asynchronous decode cancelled; full rerun and clear succeeded'
  record('cancel, rerun and clear',cancel_rerun)
  def failure_retry():
   go();page.get_by_label('사진 선택',exact=True).set_input_files([png(),{'name':'corrupt.jpg','mimeType':'image/jpeg','buffer':b'bad'}]);btn('일괄 변환').click();expect(page.locator('.workspace [role=status]')).to_contain_text('실패 1');btn('실패한 항목 재시도').click();expect(page.locator('.workspace [role=status]')).to_contain_text('저장 가능 1');expect(page.locator('.workspace [role=status]')).to_contain_text('실패 1');return 'Valid result retained while corrupt item fails on retry'
  record('corrupt input and failed-item retry',failure_retry)
  def replacement_settings():
   go();inp=page.get_by_label('사진 선택',exact=True);inp.set_input_files([jpg()]);inp.set_input_files([png()]);expect(page.locator('.file-list')).to_contain_text('alpha.png');expect(page.locator('.file-list')).not_to_contain_text('rotated.jpg')
   path=save('설정 JSON 저장','image-settings.json');data=json.loads(path.read_text());assert data['version']==1 and len(data['specs'])==1
   page.get_by_label('설정 JSON 불러오기',exact=True).set_input_files({'name':'settings.json','mimeType':'application/json','buffer':path.read_bytes()});expect(page.locator('#toast')).to_contain_text('불러왔')
   page.get_by_label('설정 JSON 불러오기',exact=True).set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"version":99}'});expect(page.locator('.workspace [role=status]')).to_contain_text('Invalid settings');return 'Latest selection wins; downloaded settings reload and malformed settings rejected'
  record('upload replacement and settings round trip',replacement_settings)
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
