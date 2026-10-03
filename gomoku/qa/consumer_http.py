"""Loopback HTTP and static dependency checks; explicitly not browser QA."""
from pathlib import Path
import json, os, re, socket, subprocess, time, urllib.request, urllib.error

root=Path(__file__).resolve().parents[1]
out=root/'qa/consumer-output';out.mkdir(parents=True,exist_ok=True)
checks=[]
for mode in ['start','preview']:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    with (out/f'{mode}.log').open('w') as log:
        server=subprocess.Popen(['npm', 'start'] if mode=='start' else ['npm','run','preview'],cwd=root,env={**os.environ,'PORT':str(port)},stdout=log,stderr=log,start_new_session=True)
        base=f'http://127.0.0.1:{port}'
        def get(path,method='GET'):
            try: response=urllib.request.urlopen(urllib.request.Request(base+path,method=method),timeout=3)
            except urllib.error.HTTPError as error: response=error
            with response: return response.status,dict(response.headers),response.read()
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.1): break
                except OSError: time.sleep(.05)
            served=root if mode=='start' else root/'dist'
            for item in [served/'index.html', *sorted((served/'src').rglob('*')), *sorted((served/'public').rglob('*'))]:
                if not item.is_file(): continue
                rel='/'+item.relative_to(served).as_posix()
                status,headers,body=get(rel)
                assert status==200 and body==item.read_bytes(), rel
                assert headers['X-Content-Type-Options']=='nosniff'
                assert headers['Cache-Control']=='no-store'
                if item.suffix=='.js': assert headers['Content-Type'].startswith('text/javascript')
                checks.append({'mode':mode,'path':rel,'status':'pass','bytes':len(body)})
            for path,method,status in [('/', 'GET',200),('/?lang=en','GET',200),('/index.html','HEAD',200),('/', 'POST',405),('/%ZZ','GET',400),('/package.json','GET',404),('/tests/gomoku.test.mjs','GET',404),('/.env','GET',404),('/missing','GET',404),('/src/../../../etc/passwd','GET',404)]:
                actual,headers,body=get(path,method);assert actual==status,(mode,path,actual,status)
                if method=='HEAD': assert not body
                checks.append({'mode':mode,'method':method,'path':path,'status':'pass','http_status':actual})
        finally:
            import signal
            os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=5)

imports=[]
for p in (root/'src').rglob('*'):
    if p.suffix not in ['.js','.css']: continue
    text=p.read_text()
    refs=re.findall(r"(?:from\s*|import\s*|new URL\(\s*)['\"]([^'\"]+)['\"]",text) if p.suffix=='.js' else re.findall(r"url\(['\"]?([^'\")]+)",text)
    for ref in refs:
        target=(root/ref.lstrip('/')) if ref.startswith('/') else (p.parent/ref).resolve()
        assert target.is_relative_to(root) and target.is_file(),(str(p),ref)
        imports.append({'source':str(p.relative_to(root)),'reference':ref})
result={'status':'pass','http_checks':len(checks),'dependency_references':len(imports),'checks':checks,'imports':imports,'browser_qa':False}
(out/'http-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['checks','imports']}))
