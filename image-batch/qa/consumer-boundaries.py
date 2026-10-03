from pathlib import Path
import json,io,os,socket,subprocess,time
from PIL import Image
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1];out=root/'qa/browser-output';out.mkdir(exist_ok=True)
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
server=subprocess.Popen([os.environ.get('NODE_BINARY','node'),'scripts/serve.mjs','--dist'],cwd=root,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
try:
 for _ in range(100):
  try:
   with socket.create_connection(('127.0.0.1',port),.1):break
  except OSError:time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
  page=browser.new_page(accept_downloads=True)
  page.goto(f'http://127.0.0.1:{port}')
  image=Image.new('RGB',(80,40),'blue');b=io.BytesIO();image.save(b,'PNG')
  page.get_by_label('사진 선택',exact=True).set_input_files({'name':'consumer.png','mimeType':'image/png','buffer':b.getvalue()})
  page.once('dialog',lambda d:d.dismiss());page.get_by_label('언어 변경',exact=True).click()
  expect(page.locator('html')).to_have_attribute('lang','ko');expect(page.locator('.file-list')).to_contain_text('consumer.png')
  page.get_by_role('button',name='일괄 변환',exact=True).click();expect(page.locator('.workspace [role=status]')).to_contain_text('저장 가능 1')
  with page.expect_download() as download:page.get_by_role('button',name='저장',exact=True).click()
  target=out/'consumer-individual.jpg';download.value.save_as(target)
  im=Image.open(target);im.load();assert im.size==(80,40) and im.format=='JPEG'
  page.once('dialog',lambda d:d.accept());page.get_by_label('언어 변경',exact=True).click()
  expect(page.locator('html')).to_have_attribute('lang','en');expect(page.locator('.file-list')).to_be_empty();expect(page.locator('.result-table')).to_have_count(0)
  page.get_by_label('Choose images',exact=True).set_input_files({'name':'again.png','mimeType':'image/png','buffer':b.getvalue()})
  page.get_by_role('button',name='Convert batch',exact=True).click();expect(page.locator('.workspace [role=status]')).to_contain_text('1 available')
  page.screenshot(path=out/'consumer-language-rerun.png',full_page=True)
  (out/'consumer-boundaries.json').write_text(json.dumps({'status':'PASS','checks':['dismiss language switch retains input','individual JPEG download decoded at 80x40','accept language switch clears input and results','conversion after language switch succeeds'],'chromium':browser.version},indent=2))
  print('PASS: 4 consumer boundary checks; Chromium',browser.version);browser.close()
finally:server.terminate();server.wait()
