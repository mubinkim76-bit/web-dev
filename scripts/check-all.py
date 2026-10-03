"""Run fresh Node, syntax, build and sandboxed browser QA for every service.

Requires Node >=20 and the Python/Chromium dependencies in each qa/README.md.
Generated browser evidence stays in each service's Git-ignored QA directory.
A failing command stops the gate and returns its nonzero exit status.
"""
from pathlib import Path
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
projects = json.loads((root / 'PROJECTS.json').read_text())['projects']
for project in projects:
    service = root / project['folder']
    commands = [['npm', 'run', 'check']]
    commands += [[sys.executable, str(script.relative_to(service))]
                 for script in sorted((service / 'qa').glob('*.py'))
                 if script.name != 'decoder.py']
    for command in commands:
        print(f"Checking {service.name}: {' '.join(command)}", flush=True)
        result = subprocess.run(command, cwd=service)
        if result.returncode:
            sys.exit(result.returncode)
print(f"PASS: {len(projects)} services completed fresh Node/build/browser checks.")
