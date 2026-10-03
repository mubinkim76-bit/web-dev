"""Regenerate or verify public hashes from Git's non-ignored source inventory.

Run from any directory: python3 scripts/publication-manifest.py [--check].
Source digests exclude QA and generated metadata; the publication manifest
includes those public files but always excludes itself. Ignored dist, browser
artifacts, dependencies and environment files are never inventoried.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CHECK = '--check' in sys.argv
inventory = sorted(set(subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    cwd=ROOT).decode().strip('\0').split('\0')))
changes = []


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    if not path.exists() or path.read_bytes() != data:
        changes.append(str(path.relative_to(ROOT)))
        if not CHECK:
            path.write_bytes(data)


projects = json.loads((ROOT / 'PROJECTS.json').read_text())
for project in projects['projects']:
    folder = project['folder']
    path = ROOT / folder / 'PROJECT-MANIFEST.json'
    manifest = json.loads(path.read_text())
    old = {entry['path']: entry for entry in manifest['source_files']}
    entries = []
    excluded = {'PROJECT-MANIFEST.json', 'SOURCE-PROVENANCE.json', 'SPEC.json', 'validation.json'}
    for public_path in inventory:
        if not public_path.startswith(folder + '/'):
            continue
        relative = public_path[len(folder) + 1:]
        if relative in excluded or relative.startswith(('qa/', 'dist/', 'node_modules/')):
            continue
        data = (ROOT / public_path).read_bytes()
        previous = old.get(relative)
        origin = previous['origin'] if previous else 'independent-service-addition'
        if previous and previous['sha256'] != digest(data):
            origin = 'independent-service-revision'
        entries.append({'path': relative, 'bytes': len(data), 'sha256': digest(data), 'origin': origin})
    manifest['source_files'] = entries
    manifest['source_tree_sha256'] = digest('\n'.join(
        entry['path'] + '\0' + entry['sha256'] for entry in entries).encode())
    project['source_tree_sha256'] = manifest['source_tree_sha256']
    write(path, manifest)
    write(ROOT / folder / 'SOURCE-PROVENANCE.json', entries)
write(ROOT / 'PROJECTS.json', projects)
publication_path = ROOT / 'PUBLICATION-MANIFEST.json'
publication = json.loads(publication_path.read_text())
publication['files'] = []
for name in inventory:
    if name == 'PUBLICATION-MANIFEST.json':
        continue
    data = (ROOT / name).read_bytes()
    publication['files'].append({'path': name, 'bytes': len(data), 'sha256': digest(data)})
write(publication_path, publication)
if CHECK and changes:
    print('Stale manifests: ' + ', '.join(changes))
    sys.exit(1)
print(('Verified' if CHECK else 'Updated') + ' source and publication manifests; publication self-reference excluded.')
