"""Build a developer handoff without runtime data or account configuration.
Run from a git checkout; see --help. Only Python's standard library is used.
"""
from pathlib import Path, PurePosixPath
import argparse, hashlib, io, json, re, sqlite3, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--date', required=True, help='YYYY-MM-DD release date')
parser.add_argument('--output', type=Path, default=ROOT / 'outputs')
parser.add_argument('--validation-dir', type=Path)
parser.add_argument('--private-config', type=Path, help='Optional local JSON used only to detect leaked secrets; never copied')
parser.add_argument('--private-db', type=Path, help='Optional local SQLite used only to detect leaked real passport numbers; never copied')
args = parser.parse_args()
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
    raise SystemExit('Invalid release date')
forbidden = []
if args.private_config:
    for key, value in json.loads(args.private_config.read_text()).items():
        if isinstance(value, str) and len(value) >= 8 and re.search(r'TOKEN|PASSWORD|SECRET|API_KEY', key):
            forbidden.append(value.encode())
if args.private_db:
    db = sqlite3.connect(args.private_db.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        for (data,) in db.execute('SELECT data FROM applications'):
            value = json.loads(data).get('passportNumber', '')
            if len(value) >= 8:
                forbidden.append(value.encode())
    finally:
        db.close()

paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
allowed_roots = {'agent','app','build','components','db','drizzle','examples','hooks','lib','public','scripts','test','vendor','windows','.github','handoff'}
allowed_top = {'.gitignore','.npmrc','README.md','package.json','package-lock.json','cloudflare-env.d.ts','components.json','drizzle.config.ts','eslint.config.mjs','next.config.ts','postcss.config.mjs','tsconfig.json','vite.config.ts'}
blocked_parts = {'node_modules','data','saudi-profile','__pycache__','.venv','.git','.openai','.codex','.agents'}
blocked_suffixes = {'.sqlite','.db','.pem','.key','.log','.mp4','.jpg','.jpeg','.png','.zip','.pyc','.tsbuildinfo'}
source = {}
for name in sorted(set(paths)):
    if not name:
        continue
    rel = PurePosixPath(name)
    if rel.parts[0] not in allowed_roots and name not in allowed_top:
        continue
    if any(p in blocked_parts for p in rel.parts) or rel.suffix.lower() in blocked_suffixes:
        continue
    if rel.name.startswith('.env') and name != 'agent/.env.example':
        continue
    file = ROOT / name
    if file.is_symlink():
        raise SystemExit('Unexpected symlink in package source: ' + name)
    if not file.is_file():
        continue
    source[name] = file.read_bytes()

required = ['agent/index.mjs','agent/review-queue.mjs','agent/local-store.mjs','agent/package-lock.json','agent/.env.example','agent/evisa-operator.user.js','agent/face_detection_yunet_2023mar.onnx','agent/YUNET-LICENSE.txt','lib/domain.ts','scripts/test-agent.mjs','test/review-queue.test.mjs','test/detect_face_test.py','windows/Install.cmd','windows/Install.ps1','handoff/README-FIRST-UZ.md','handoff/07-TEKSHIRUV.md']
for name in required:
    if name not in source:
        raise SystemExit('Missing source file: ' + name)

windows = {n:d for n,d in source.items() if n.startswith('windows/') or n=='lib/domain.ts' or (len(PurePosixPath(n).parts)==2 and n.startswith('agent/') and PurePosixPath(n).suffix in {'.mjs','.js','.py','.json','.txt','.html','.onnx'})}
# Active and legacy relative .mjs imports must resolve inside the Windows bundle.
for name, data in windows.items():
    if not name.endswith('.mjs'):
        continue
    for _, rel in re.findall(r'''(?:from\s*|import\s*\()(['"])(\.\.?/[^'"]+)\1''', data.decode()):
        resolved = (ROOT / name).parent.joinpath(rel.split('?')[0]).resolve().relative_to(ROOT).as_posix()
        if resolved not in windows:
            raise SystemExit('Windows import missing: ' + resolved)
windows['README-UZ.md'] = source['windows/README-UZ.md']
windows['Ornatish.cmd'] = b'@echo off\r\ncall "%~dp0windows\\Install.cmd"\r\n'
for name, data in list(windows.items()):
    if name.endswith(('.cmd','.ps1')):
        windows[name] = data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')

def zip_bytes(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            archive.writestr(name, data)
    with zipfile.ZipFile(io.BytesIO(output.getvalue())) as archive:
        if archive.testzip() is not None:
            raise SystemExit('ZIP integrity check failed')
    return output.getvalue()

files = {'source/' + n:d for n,d in source.items()}
files['README-FIRST-UZ.md'] = source['handoff/README-FIRST-UZ.md']
for name, data in source.items():
    if name.startswith('handoff/') and name != 'handoff/README-FIRST-UZ.md':
        files['docs/' + PurePosixPath(name).name] = data
files['artifacts/evisa-operator-windows.zip'] = zip_bytes(windows)
files['artifacts/evisa-operator.user.js'] = source['agent/evisa-operator.user.js']
if args.validation_dir:
    for item in sorted(args.validation_dir.iterdir()):
        if item.is_file() and item.suffix in {'.txt','.json'}:
            files['validation/' + item.name] = item.read_bytes()

# Check uncompressed source and nested installer contents. Do not print matches.
patterns = [rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}', rb'\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
for name, data in list(files.items()) + [('windows/' + n,d) for n,d in windows.items()]:
    if name.endswith(('.onnx','.zip')):
        continue
    if any(secret in data for secret in forbidden) or any(re.search(pattern,data) for pattern in patterns):
        raise SystemExit('Sensitive literal detected; review file locally: ' + name)

verifier = '''from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent
manifest=json.loads((root/'FILE-MANIFEST.json').read_text())
for entry in manifest['files']:
    rel=Path(entry['path'])
    if rel.is_absolute() or '..' in rel.parts:raise SystemExit('Unsafe manifest path')
    f=root/rel
    if not f.is_file() or f.stat().st_size!=entry['bytes'] or hashlib.sha256(f.read_bytes()).hexdigest()!=entry['sha256']:
        raise SystemExit('Verification failed: '+entry['path'])
print('OK: '+str(len(manifest['files']))+' files verified.')
'''
files['verify-package.py'] = verifier.encode()
manifest = {'releaseDate':args.date,'purpose':'developer handoff','sourceSnapshot':'working tree, including uncommitted and untracked code','runtimeDataIncluded':False,'files':[{'path':n,'bytes':len(d),'sha256':hashlib.sha256(d).hexdigest()} for n,d in sorted(files.items())]}
files['FILE-MANIFEST.json'] = (json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
files['SHA256SUMS.txt'] = ''.join(hashlib.sha256(d).hexdigest()+'  '+n+'\n' for n,d in sorted(files.items())).encode()
name='evisa-dasturchi-'+args.date
payload=zip_bytes({name+'/'+n:d for n,d in files.items()})
args.output.mkdir(parents=True, exist_ok=True)
archive_path=args.output/(name+'.zip')
archive_path.write_bytes(payload)
(args.output/(name+'.zip.sha256')).write_text(hashlib.sha256(payload).hexdigest()+'  '+archive_path.name+'\n')
print(json.dumps({'archive':str(archive_path),'files':len(files),'sourceFiles':len(source),'windowsFiles':len(windows),'bytes':len(payload),'secretsAndPassportNumbersChecked':bool(forbidden),'runtimeDataIncluded':False}))
