"""Settings-only language guard in sandboxed Chromium, root and subpath.
Build the service and repository Pages output first, then run from this folder:
PAGES_IMAGE_DIR=../dist/image-batch python3 qa/settings-dirty.py
--expect-bug records the pre-fix behavior when run against baseline builds.
"""
from pathlib import Path
import functools,http.server,threading,tempfile,shutil,json,sys,os
from playwright.sync_api import sync_playwright,expect
project=Path(__file__).resolve().parents[1]
out=project/'qa/browser-output';out.mkdir(exist_ok=True)
results=[]
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp);shutil.copytree(Path(os.environ['PAGES_IMAGE_DIR']),root/'image-batch')
 for f in (project/'dist').iterdir():
  if f.is_dir():shutil.copytree(f,root/f.name)
  else:shutil.copy2(f,root/f.name)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=temp))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,chromium_sandbox=True)
   for route in ['/', '/image-batch/']:
    page=browser.new_page();requests=[];page.on('request',lambda r:requests.append(r.url));page.goto(f'http://127.0.0.1:{server.server_port}{route}')
    width=page.get_by_label('너비 px',exact=True);width.fill('777');width.blur()
    dialogs=[]
    def dismiss(d):dialogs.append(d.message);d.dismiss()
    page.on('dialog',dismiss);page.get_by_label('언어 변경',exact=True).click()
    if '--expect-bug' in sys.argv:
     assert not dialogs;expect(page.locator('html')).to_have_attribute('lang','en');expect(page.get_by_label('Width px',exact=True)).to_have_value('1200')
     results.append({'route':route,'reproduced':'777 reset to 1200 without warning'})
    else:
     assert len(dialogs)==1;expect(width).to_have_value('777');expect(page.locator('html')).to_have_attribute('lang','ko')
     page.get_by_role('button',name='전체 지우기',exact=True).click();page.get_by_label('언어 변경',exact=True).click()
     assert len(dialogs)==2;expect(width).to_have_value('777')
     page.remove_listener('dialog',dismiss);page.once('dialog',lambda d:d.accept());page.get_by_label('언어 변경',exact=True).click()
     expect(page.locator('html')).to_have_attribute('lang','en');expect(page.get_by_label('Width px',exact=True)).to_have_value('1200')
     page.on('dialog',dismiss);page.get_by_label('Change language',exact=True).click();assert len(dialogs)==2
     expect(page.locator('html')).to_have_attribute('lang','ko')
     page.screenshot(path=out/('settings-dirty-'+('root' if route=='/' else 'subpath')+'.png'),full_page=True)
     results.append({'route':route,'status':'PASS','checks':['settings-only guard','cancel retains 777','clear retains settings guard','confirm resets to 1200','fresh state switches without warning']})
    if route!='/':assert not any('/src/' in u.replace('/image-batch/src/','') or '/public/' in u.replace('/image-batch/public/','') for u in requests),requests
    page.close()
   browser.close()
 finally:server.shutdown();server.server_close()
name='settings-dirty-before.json' if '--expect-bug' in sys.argv else 'settings-dirty-after.json'
(out/name).write_text(json.dumps(results,indent=2));print(json.dumps(results))
