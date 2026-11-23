"""Build the delivery artifact: MANIFEST.txt + mystery-island-3d-delivery.zip.

    python3 make_delivery.py

The manifest lists every payload file with its sha256 and size. The archive
contains those same files plus MANIFEST.txt itself, so the CEO can extract and
run verify_delivery.py with no other files to hand.
"""
import hashlib
import os
import zipfile

ROOT = '.'
ZIP = 'mystery-island-3d-delivery.zip'
MANIFEST = 'MANIFEST.txt'
SKIP_DIRS = {'node_modules', '.git', '__pycache__'}


def payload_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, name), ROOT)
            if rel in (ZIP, MANIFEST):
                continue
            out.append(rel)
    return sorted(out)


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


files = payload_files()

lines = [
    'Mystery Island 3D — delivery manifest',
    'Version: 0.9.0-prototype   Three.js: 0.157.0 (vendored)',
    '',
    'sha256                                                            bytes  path',
    '',
]
for rel in files:
    lines.append('%s  %6d  %s' % (sha(rel), os.path.getsize(rel), rel))
lines.append('')
lines.append('%d payload files. This manifest is included in the archive as' % len(files))
lines.append('mystery-island-3d/MANIFEST.txt. Run `python3 verify_delivery.py` to re-check.')
with open(MANIFEST, 'w') as fh:
    fh.write('\n'.join(lines) + '\n')

with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as archive:
    for rel in files + [MANIFEST]:
        archive.write(rel, os.path.join('mystery-island-3d', rel))

print('payload files : %d' % len(files))
print('archive       : %s (%d entries, %.0f KB)'
      % (ZIP, len(zipfile.ZipFile(ZIP).namelist()), os.path.getsize(ZIP) / 1024))
print('manifest      : %s' % MANIFEST)
