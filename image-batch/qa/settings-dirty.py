"""Settings-only and file-removal dirty state in sandboxed Chromium.
Run after the service build. QA_BASE_URL targets the combined subpath server;
PAGES_IMAGE_DIR optionally tests both standalone and separately copied Pages output.
--expect-bug / --expect-removal-bug are baseline reproduction modes only.
"""
from pathlib import Path
import functools,http.server,threading,tempfile,shutil,json,sys,os,io
from PIL import Image
from playwright.sync_api import sync_playwright,expect
project=Path(__file__).resolve().parents[1]
out=project/'qa/browser-output';out.mkdir(exist_ok=True)
results=[]
with tempfile.TemporaryDirectory() as temp:
 root=Path(temp)
 if os.environ.get('PAGES_IMAGE_DIR'):shutil.copytree(Path(os.environ['PAGES_IMAGE_DIR']),root/'image-batch')
 routes=['/image-batch/'] if os.environ.get('QA_BASE_URL') else (['/', '/image-batch/'] if os.environ.get('PAGES_IMAGE_DIR') else ['/'])
 for f in (project/'dist').iterdir():
  if f.is_dir():shutil.copytree(f,root/f.name)
  else:shutil.copy2(f,root/f.name)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=temp))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,chromium_sandbox=True)
   for route in routes:
    page=browser.new_page();requests=[];page.on('request',lambda r:requests.append(r.url));page.goto(os.environ['QA_BASE_URL'].rstrip('/')+'/' if os.environ.get('QA_BASE_URL') else f'http://127.0.0.1:{server.server_port}{route}')
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
   if '--expect-bug' not in sys.argv:
    image=Image.new('RGB',(80,40),'blue');data=io.BytesIO();image.save(data,'PNG')
    for route in routes:
     for edited,count,converted in [(False,1,False),(True,1,False),(False,2,False),(False,1,True),(True,1,True)]:
      page=browser.new_page();page.goto(os.environ['QA_BASE_URL'].rstrip('/')+'/' if os.environ.get('QA_BASE_URL') else f'http://127.0.0.1:{server.server_port}{route}')
      if edited:
       page.get_by_label('너비 px',exact=True).fill('777');page.get_by_label('너비 px',exact=True).blur()
      page.get_by_label('사진 선택',exact=True).set_input_files([{'name':f'synthetic-{i}.png','mimeType':'image/png','buffer':data.getvalue()} for i in range(count)])
      if converted:
       page.get_by_role('button',name='일괄 변환',exact=True).click();expect(page.locator('.workspace [role=status]')).to_contain_text('저장 가능 1')
      page.get_by_role('button',name='제외',exact=True).first.click()
      expect(page.locator('.file-row')).to_have_count(count-1);expect(page.locator('.result-table')).to_have_count(0)
      dialogs=[]
      page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
      page.get_by_label('언어 변경',exact=True).click()
      expected=edited or count>1
      if '--expect-removal-bug' in sys.argv and not expected:
       assert len(dialogs)==1;outcome='reproduced stale dirty after last removal'
      else:
       assert len(dialogs)==int(expected),(route,edited,count,converted,dialogs)
       expect(page.locator('html')).to_have_attribute('lang','ko' if expected else 'en');outcome='PASS'
       if edited:expect(page.get_by_label('너비 px',exact=True)).to_have_value('777')
      results.append({'route':route,'settings_edited':edited,'files_before':count,'converted':converted,'removal':outcome})
      page.close()
   browser.close()
 finally:server.shutdown();server.server_close()
name='settings-removal-before.json' if '--expect-removal-bug' in sys.argv else 'settings-dirty-before.json' if '--expect-bug' in sys.argv else ('settings-dirty-subpath.json' if os.environ.get('QA_BASE_URL') else 'settings-dirty-after.json')
(out/name).write_text(json.dumps(results,indent=2));print(json.dumps(results))
