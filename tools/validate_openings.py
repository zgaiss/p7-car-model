#!/usr/bin/env python3
"""Independently validate the generated P7 rig against its original GLB.

Run: python tools/validate_openings.py
Requires numpy and scipy. Checks exact per-material triangle attribute bytes,
material JSON, closed world placement, triangle count and orphan nodes.
"""
import json, struct, numpy as np, hashlib
from pathlib import Path
from scipy.spatial.transform import Rotation
root = Path(__file__).resolve().parents[1] / 'app/src/main/assets/model'

def read(p):
    b = p.read_bytes()
    n = struct.unpack_from('<I', b, 12)[0]
    return (json.loads(b[20:20 + n]), b[28 + n:])

def array(j, b, i):
    a = j['accessors'][i]
    v = j['bufferViews'][a['bufferView']]
    dt = np.dtype({5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']])
    nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.ndarray((a['count'], nc), dtype=dt, buffer=b, offset=v.get('byteOffset', 0) + a.get('byteOffset', 0), strides=(v.get('byteStride', dt.itemsize * nc), dt.itemsize))

def tris(j, b):
    result = {}
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            idx = array(j, b, p['indices']).reshape(-1, 3)
            a = np.concatenate([array(j, b, ai)[idx].reshape(len(idx), -1).view('u1') for _, ai in sorted(p['attributes'].items())], axis=1)
            result.setdefault(p['material'], []).append(a)
    return {m: np.sort(np.ascontiguousarray(np.concatenate(rows)).view(np.dtype((np.void, rows[0].shape[1]))).ravel()) for m, rows in result.items()}
s, sb = read(root / 'XPP7_Model_v4.glb')
r, rb = read(root / 'XPP7_Model_openings.glb')
a = tris(s, sb)
b = tris(r, rb)
assert s['materials'] == r['materials']
assert a.keys() == b.keys()
for mat in a:
    assert np.array_equal(a[mat], b[mat]), f'Attribute triangle mismatch for material {mat}'
source = {n['name']: n for n in s['nodes']}
maxerr = 0.0
count = 0
for n in r['nodes']:
    if 'mesh' not in n:
        continue
    old = source[n['extras']['sourceNode']]
    group = n['extras']['openingPart']
    parent = next((p for p in r['nodes'] if p['name'] == 'opening_' + group), {})
    for p in r['meshes'][n['mesh']]['primitives']:
        v = array(r, rb, p['attributes']['POSITION'])
        count += len(array(r, rb, p['indices'])) // 3

        def world(node):
            return v * np.asarray(node.get('scale', [1, 1, 1])) @ Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix().T + node.get('translation', [0, 0, 0])
        maxerr = max(maxerr, float(np.abs(world(old) - (world(n) + parent.get('translation', [0, 0, 0]))).max()))
assert maxerr < 1e-12
assert count == 256181
roots = r['scenes'][r.get('scene', 0)]['nodes']
reach = set(roots)
for n in r['nodes']:
    reach.update(n.get('children', []))
assert len(reach) == len(r['nodes'])
print(json.dumps({'triangles': count, 'allTriangleAttributesPerMaterialByteIdentical': True, 'materialDefinitionsIdentical': True, 'maxClosedWorldCoordinateDeviation': maxerr, 'nodes': len(r['nodes']), 'meshes': len(r['meshes']), 'orphanNodes': 0, 'sha256': hashlib.sha256((root / 'XPP7_Model_openings.glb').read_bytes()).hexdigest()}, indent=2))
