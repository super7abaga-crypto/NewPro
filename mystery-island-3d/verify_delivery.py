"""Cross-check the delivery archive against MANIFEST.txt.

    python3 verify_delivery.py
"""
import hashlib
import os
import re
import zipfile

ZIP = 'mystery-island-3d-delivery.zip'


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


rows = []
with open('MANIFEST.txt') as fh:
    for line in fh:
        m = re.match(r'^([0-9a-f]{64})\s+(\d+)\s+(\S+)$', line.strip())
        if m:
            rows.append(m.groups())

print('manifest entries      :', len(rows))

bad = []
for digest, size, path in rows:
    if not os.path.exists(path):
        bad.append((path, 'missing'))
    elif sha(path) != digest:
        bad.append((path, 'hash differs'))
    elif os.path.getsize(path) != int(size):
        bad.append((path, 'size differs'))
print('manifest vs disk      :', 'ALL MATCH' if not bad else bad)

archive = zipfile.ZipFile(ZIP)
print('archive integrity     :', archive.testzip() or 'no corrupt entries')

names = set(archive.namelist())
expected = {os.path.join('mystery-island-3d', p) for _, _, p in rows}
expected.add(os.path.join('mystery-island-3d', 'MANIFEST.txt'))  # the manifest travels inside
print('archive entries       :', len(names))
print('missing from archive  :', sorted(expected - names) or 'none')
print('extra in archive      :', sorted(names - expected) or 'none')

mismatch = []
for name in sorted(names):
    disk = os.path.join('.', name[len('mystery-island-3d/'):])
    if not os.path.exists(disk):
        mismatch.append((name, 'not on disk'))
    elif sha(disk) != hashlib.sha256(archive.read(name)).hexdigest():
        mismatch.append((name, 'bytes differ'))
print('archived bytes        :', 'IDENTICAL TO DISK' if not mismatch else mismatch)

for entry in ('dist/index.html', 'index.html', 'build.mjs', 'package.json',
              'README.md', 'VERIFICATION.md', 'vendor/three.min.js'):
    print(('present  ' if entry in {n[len('mystery-island-3d/'):] for n in names} else 'MISSING  '), entry)
