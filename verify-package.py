from pathlib import Path
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
