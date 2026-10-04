"""Deterministic file-read race regression, standalone or /csv-tools/ static path."""
from pathlib import Path
import argparse, functools, http.server, json, shutil, tempfile, threading
from playwright.sync_api import sync_playwright, expect

args = argparse.ArgumentParser()
args.add_argument('--subpath', action='store_true')
args.add_argument('--subpath-dist', type=Path, help='csv-tools output from scripts/build-pages.mjs')
args.add_argument('--expect-race', action='store_true', help='Reproduce against an unmodified baseline build')
options = args.parse_args()
project = Path(__file__).resolve().parents[1]
out = project/'qa/browser-output'; out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='csv-state-qa-') as tmp:
    root = Path(tmp); prefix = 'csv-tools/' if options.subpath else ''
    if options.subpath and not options.subpath_dist: args.error('--subpath requires --subpath-dist')
    shutil.copytree(options.subpath_dist if options.subpath else project/'dist', root/prefix, dirs_exist_ok=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, chromium_sandbox=True)
            page = browser.new_page(accept_downloads=True)
            errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            page.goto(f'http://127.0.0.1:{server.server_port}/{prefix}?lang=en')
            def button(name): return page.get_by_role('button',name=name,exact=True)
            merge=button('Preview cleanup & merge'); status=page.locator('.du-status').first
            button('Load two sample files').click(); expect(merge).to_be_enabled()
            # Delay the real File read promise without replacing the application or worker.
            page.evaluate('''() => {window.pendingReads=[]; const original=File.prototype.arrayBuffer;
              File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>pendingReads.push({resolve:()=>original.call(this).then(resolve),reject:()=>reject(Error('DELAYED READ ERROR'))}));};}''')
            def read(name='latest.csv'):
                page.locator('input[type=file]').set_input_files({'name':name,'mimeType':'text/csv','buffer':b'id,name\nnew,latest'})
                button('Validate selected files').click()
            read()
            if options.expect_race:
                expect(merge).to_be_enabled(); merge.click(); expect(page.locator('.workspace')).to_contain_text('6 = 6 + 0')
                page.evaluate('pendingReads[0].resolve()'); page.wait_for_timeout(200)
                expect(page.locator('.workspace')).to_contain_text('6 = 6 + 0')
                result={'status':'REPRODUCED','old_rows':6,'new_rows_ignored':1}
            else:
                expect(merge).to_be_disabled()
                page.get_by_label('1. Trim cell whitespace',exact=True).check(); expect(merge).to_be_disabled()
                merge.dispatch_event('click'); expect(status).to_contain_text('Reading selected files')
                page.evaluate('pendingReads[0].resolve()'); expect(merge).to_be_enabled();merge.click()
                expect(page.locator('.workspace')).to_contain_text('1 = 1 + 0')
                with page.expect_download() as download: button('Download CSV').click()
                download.value.save_as(out/('state-subpath.csv' if options.subpath else 'state-root.csv'))
                assert '"new","latest"' in Path(download.value.path()).read_text(encoding='utf-8-sig')
                read('old.csv'); read('newest.csv')
                page.evaluate('pendingReads[2].resolve()');expect(merge).to_be_enabled()
                page.evaluate('pendingReads[1].reject()');page.wait_for_timeout(100);expect(status).not_to_contain_text('DELAYED READ ERROR')
                read();button('Cancel').click();page.evaluate('pendingReads[3].reject()');page.wait_for_timeout(100);expect(status).to_contain_text('Cancelled')
                read();page.evaluate('pendingReads[4].reject()');expect(status).to_contain_text('DELAYED READ ERROR');expect(button('Cancel')).to_be_disabled()
                read();read('invalid.xlsx');expect(status).to_contain_text('XLSX is not supported');page.evaluate('pendingReads[5].resolve()');page.wait_for_timeout(100);expect(status).to_contain_text('XLSX is not supported')
                read();page.evaluate('pendingReads[6].resolve()');expect(merge).to_be_enabled();merge.click();expect(page.locator('.workspace')).to_contain_text('1 = 1 + 0')
                assert not errors, errors
                result={'status':'PASS','path':'/'+prefix,'latest_rows':1,'stale_error':'ignored','cancel':'preserved','current_error':'preserved','invalid_latest_selection':'preserved','retry':'PASS','download':'PASS','page_errors':errors}
            page.screenshot(path=out/('state-subpath.png' if options.subpath else 'state-root.png'),full_page=True)
            (out/('state-subpath.json' if options.subpath else 'state-root.json')).write_text(json.dumps(result,indent=2))
            print(json.dumps(result));browser.close()
    finally:
        server.shutdown();server.server_close()
