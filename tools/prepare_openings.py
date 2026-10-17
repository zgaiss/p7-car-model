#!/usr/bin/env python3
"""Prepare independently hinged P7 panels without modifying the original asset.

Run from any directory: python tools/prepare_openings.py
Dependencies: Python 3, numpy, scipy (no Blender dependency for generation).
Optional: --details /path/to/components.json writes per-island audit data.
The checked source hash deliberately rejects changed topology: this extraction
map is specific to XPP7_Model_v4.glb. UVs, normals and material JSON are preserved.
"""
import json, struct, numpy as np
from pathlib import Path
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial.transform import Rotation
ROOT = Path(__file__).resolve().parents[1]
P = ROOT / 'app/src/main/assets/model/XPP7_Model_v4.glb'
b = P.read_bytes()
n = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20 + n])
binary = b[28 + n:]

def arr(ai):
    """Decode one source accessor, honoring byte offsets and interleaved strides."""
    a = j['accessors'][ai]
    bv = j['bufferViews'][a['bufferView']]
    dt = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
    nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    return np.ndarray((a['count'], nc), dtype=dt, buffer=binary, offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0), strides=(bv.get('byteStride', np.dtype(dt).itemsize * nc), np.dtype(dt).itemsize)).copy()

def parts():
    """Enumerate original indexed connected islands without positional welding."""
    for ni, node in enumerate(j['nodes']):
        if 'mesh' not in node:
            continue
        prim = j['meshes'][node['mesh']]['primitives'][0]
        v = arr(prim['attributes']['POSITION'])
        f = arr(prim['indices']).reshape(-1, 3)
        rot = Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix()
        w = v * np.array(node.get('scale', [1, 1, 1])) @ rot.T + node.get('translation', [0, 0, 0])
        a = f[:, [0, 1, 2]].reshape(-1)
        bb = f[:, [1, 2, 0]].reshape(-1)
        nn, lab = connected_components(coo_matrix((np.ones(len(a)), (a, bb)), shape=(len(v), len(v))), directed=False)
        cs = sorted([np.flatnonzero(lab == i) for i in range(nn)], key=len, reverse=True)
        fi = [np.flatnonzero(np.isin(f[:, 0], c)) for c in cs]
        yield (ni, node, prim, v, w, f, cs, fi)
from scipy.spatial import cKDTree
import copy, hashlib, argparse
EXPECTED_SOURCE_HASH = '7b710700dfe8d003a56e10e322774aceaa3069875210f395439674f400faad5d'
GROUPS = {'front_left': {'pivot': [1.59, 1.1, 1.85], 'axis': 'y', 'angleDegrees': -62}, 'front_right': {'pivot': [-1.685, 1.1, 1.85], 'axis': 'y', 'angleDegrees': 62}, 'rear_left': {'pivot': [1.67, 1.1, -0.39], 'axis': 'y', 'angleDegrees': -58}, 'rear_right': {'pivot': [-1.765, 1.1, -0.39], 'axis': 'y', 'angleDegrees': 58}, 'hood': {'pivot': [-0.0478, 1.88, 2.16], 'axis': 'x', 'angleDegrees': -48}, 'trunk': {'pivot': [-0.0478, 2.3, -3.55], 'axis': 'x', 'angleDegrees': 55}}

def prepare(details_path=None):
    """Classify original islands, split material batches, and package a six-pivot rig."""
    global j, binary
    if hashlib.sha256(P.read_bytes()).hexdigest() != EXPECTED_SOURCE_HASH:
        raise SystemExit('Source GLB changed. Reinspect panel topology and update the extraction map before regenerating.')
    original = copy.deepcopy(j)
    records = list(parts())
    shell = records[-1]
    trees = {name: cKDTree(shell[4][shell[6][ci]]) for name, ci in [('front_left', 6), ('front_right', 7), ('rear_left', 8), ('rear_right', 9)]}

    def door_for(points):
        side = 'left' if points[:, 0].mean() > -0.0478 else 'right'
        names = ['front_' + side, 'rear_' + side]
        return min(names, key=lambda name: float(np.mean(trees[name].query(points)[0])))

    def classify(ni, ci, points):
        """Asset-specific physical-part selection in glTF coordinates (+Y up, +Z front).

Body node 56 contains painted surfaces. Long low sills stay fixed; hood
metal and emblem, trunk metal, and short door skins are extracted separately.
Other source node sets distinguish frameless glass, mirror pieces, inner
trim and small handles/seals. Quarter glass and body pillars stay fixed.
A nearest-main-skin test assigns ambiguous door returns to front or rear.
No welding is performed: coincident vertices across door seams must remain
independent. Changing source topology requires a fresh manual inspection."""
        lo = points.min(0)
        hi = points.max(0)
        c = points.mean(0)
        span = hi - lo
        outer_side = lo[0] > 1.24 or hi[0] < -1.335
        if ni == 56 and span[2] > 2.5 and (hi[1] < 0.73):
            return 'static'
        if ni in [6, 19] and lo[2] > 4.48 and (hi[2] < 4.59) and (lo[1] > 1.48) and (lo[0] > -0.25) and (hi[0] < 0.2):
            return 'hood'
        if ni == 56 and lo[2] > 2.125 and (hi[2] < 4.69) and (lo[1] > 1.33):
            return 'hood'
        if ni == 56 and hi[2] < -3.48 and (lo[1] > 1.18) and (lo[0] > -1.37) and (hi[0] < 1.275):
            return 'trunk'
        if ni == 56 and outer_side and (lo[2] > -2.43) and (hi[2] < 1.95) and (lo[1] > 0.49) and (hi[1] < 2.17):
            return door_for(points)
        # Inner mirror mounting triangles move with the front door as well.
        if ni == 3 and (lo[0] > 1.40 or hi[0] < -1.495) and lo[2] > 1.06 and hi[2] < 1.67 and lo[1] > 1.70 and hi[1] < 2.20:
            return 'front_left' if c[0] > 0 else 'front_right'
        if ni in [3, 6, 14, 19, 21, 24, 56] and outer_side and (lo[2] > 1.03) and (hi[2] < 1.57) and (lo[1] > 1.7) and (lo[0] > 1.63 or hi[0] < -1.725):
            return 'front_left' if c[0] > 0 else 'front_right'
        if ni == 12 and outer_side and (lo[2] > -2.195) and (hi[2] < 1.27) and (lo[1] > 1.9):
            return ('front_' if c[2] > -0.6 else 'rear_') + ('left' if c[0] > 0 else 'right')
        if ni in [7, 13, 15, 16, 17, 18, 19, 20, 21, 24, 30, 39] and outer_side and (lo[2] > -2.22) and (hi[2] < 1.57) and (lo[1] > 0.73) and (hi[1] < 2.2) and (span[0] < 0.55):
            return door_for(points)
        # Rear inner beltline seal sits slightly inward of the exterior trim.
        if ni == 3 and (lo[0] > 1.40 or hi[0] < -1.495) and lo[2] > -2.25 and hi[2] < -0.60 and lo[1] > 2.0 and hi[1] < 2.15:
            return 'rear_left' if c[0] > 0 else 'rear_right'
        if ni in [3, 6, 8, 11, 22, 23, 27, 40, 47, 54] and (lo[0] > 1.48 or hi[0] < -1.575) and (lo[2] > -2.42) and (hi[2] < 1.95) and (lo[1] > 0.73) and (hi[1] < 2.18) and (span[0] < 0.38) and (span[2] < 2.45):
            return door_for(points)
        if ni in [3, 6, 8, 9, 10, 11, 19, 20, 21, 23, 24, 27, 30, 39, 41, 49, 55] and hi[2] < -3.5 and (lo[2] > -4.91) and (lo[0] > -1.37) and (hi[0] < 1.275) and (lo[1] > 1.18) and (hi[1] < 2.4):
            return 'trunk'
        return 'static'
    buf = bytearray(binary)

    def append_accessor(data, old_access):
        """Append a compact attribute/index accessor without changing source values."""
        while len(buf) % 4:
            buf.append(0)
        offset = len(buf)
        buf.extend(data.tobytes())
        bv = len(j['bufferViews'])
        j['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': data.nbytes})
        ac = copy.deepcopy(old_access)
        ac['bufferView'] = bv
        ac['byteOffset'] = 0
        ac['count'] = len(data)
        ac.pop('sparse', None)
        if ac['type'] == 'VEC3':
            ac['min'] = data.min(0).tolist()
            ac['max'] = data.max(0).tolist()
        else:
            ac.pop('min', None)
            ac.pop('max', None)
        idx = len(j['accessors'])
        j['accessors'].append(ac)
        return idx
    roots = []
    groups = {}
    manifest = []
    source_count = 0
    output_count = 0
    max_error = 0.0
    for name, config in GROUPS.items():
        groups[name] = len(j['nodes'])
        j['nodes'].append({'name': 'opening_' + name, 'translation': config['pivot'], 'children': [], 'extras': {'opening': name, **config}})
        roots.append(groups[name])
    for ni, node, prim, v, w, f, cs, fs in records:
        buckets = {}
        source_count += len(f)
        for ci, c in enumerate(cs):
            group = classify(ni, ci, w[c])
            buckets.setdefault(group, []).extend(fs[ci].tolist())
            manifest.append({'node': node['name'], 'component': ci, 'vertices': len(c), 'triangles': len(fs[ci]), 'group': group, 'min': w[c].min(0).round(6).tolist(), 'max': w[c].max(0).round(6).tolist()})
        for group, face_ids in buckets.items():
            if not face_ids:
                continue
            faces = f[np.asarray(face_ids)]
            used, remap = np.unique(faces, return_inverse=True)
            indices = remap.astype('<u4').reshape(-1, 1)
            attrs = {semantic: append_accessor(arr(ai)[used], original['accessors'][ai]) for semantic, ai in prim['attributes'].items()}
            ia = append_accessor(indices, {'componentType': 5125, 'type': 'SCALAR'})
            newprim = copy.deepcopy(prim)
            newprim['attributes'] = attrs
            newprim['indices'] = ia
            mi = len(j['meshes'])
            j['meshes'].append({'name': j['meshes'][node['mesh']]['name'] + '__' + group, 'primitives': [newprim]})
            child = copy.deepcopy(node)
            child['mesh'] = mi
            child['name'] = node['name'] + '__' + group
            child['extras'] = {'openingPart': group, 'sourceNode': node['name']}
            if group != 'static':
                pivot = np.asarray(GROUPS[group]['pivot'])
                child['translation'] = (np.asarray(node.get('translation', [0, 0, 0])) - pivot).tolist()
                reconstructed = v[used] * node.get('scale', [1, 1, 1]) @ Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix().T + child['translation'] + pivot
                max_error = max(max_error, float(np.max(np.abs(reconstructed - w[used]))))
            cn = len(j['nodes'])
            j['nodes'].append(child)
            if group == 'static':
                roots.append(cn)
            else:
                j['nodes'][groups[group]]['children'].append(cn)
            output_count += len(faces)
    j['scenes'][j.get('scene', 0)]['nodes'] = roots
    reachable = set(roots)
    for gid in groups.values():
        reachable.update(j['nodes'][gid]['children'])
    nodeids = sorted(reachable)
    nodemap = {old: new for new, old in enumerate(nodeids)}
    j['nodes'] = [j['nodes'][i] for i in nodeids]
    for n in j['nodes']:
        if 'children' in n:
            n['children'] = [nodemap[i] for i in n['children']]
    j['scenes'][j.get('scene', 0)]['nodes'] = [nodemap[i] for i in roots]
    meshids = sorted({n['mesh'] for n in j['nodes'] if 'mesh' in n})
    meshmap = {old: new for new, old in enumerate(meshids)}
    j['meshes'] = [j['meshes'][i] for i in meshids]
    for n in j['nodes']:
        if 'mesh' in n:
            n['mesh'] = meshmap[n['mesh']]
    accids = set()
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            accids.add(p['indices'])
            accids.update(p['attributes'].values())
    accids = sorted(accids)
    accmap = {old: new for new, old in enumerate(accids)}
    j['accessors'] = [j['accessors'][i] for i in accids]
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            p['indices'] = accmap[p['indices']]
            p['attributes'] = {k: accmap[v] for k, v in p['attributes'].items()}
    viewids = sorted({a['bufferView'] for a in j['accessors']} | {im['bufferView'] for im in j.get('images', []) if 'bufferView' in im})
    viewmap = {old: new for new, old in enumerate(viewids)}
    packed = bytearray()
    newviews = []
    for vi in viewids:
        view = copy.deepcopy(j['bufferViews'][vi])
        offset = view.get('byteOffset', 0)
        size = view['byteLength']
        while len(packed) % 4:
            packed.append(0)
        view['byteOffset'] = len(packed)
        packed.extend(buf[offset:offset + size])
        newviews.append(view)
    j['bufferViews'] = newviews
    for a in j['accessors']:
        a['bufferView'] = viewmap[a['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = viewmap[im['bufferView']]
    buf = packed
    j['buffers'][0]['byteLength'] = len(buf)
    assert source_count == output_count and max_error < 1e-12, (source_count, output_count, max_error)
    assert j['materials'] == original['materials'], 'Material definitions changed'
    for name, gid in groups.items():
        assert j['nodes'][nodemap[gid]]['children'], name
    jb = json.dumps(j, separators=(',', ':'), ensure_ascii=False).encode()
    jb += b' ' * (-len(jb) % 4)
    buf += b'\x00' * (-len(buf) % 4)
    out = P.with_name('XPP7_Model_openings.glb')
    out.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(jb) + len(buf)) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(buf), b'BIN\x00') + buf)
    stats = {name: sum((m['triangles'] for m in manifest if m['group'] == name)) for name in ['static', *GROUPS]}
    report = {'source': P.name, 'sourceSha256': hashlib.sha256(P.read_bytes()).hexdigest(), 'output': out.name, 'groups': GROUPS, 'triangleCounts': stats, 'sourceTriangles': source_count, 'outputTriangles': output_count, 'closedMaxWorldCoordinateDeviation': max_error, 'materialDefinitionsIdentical': True, 'components': manifest}
    if details_path:
        Path(details_path).write_text(json.dumps(report, indent=2))
    report.pop('components')
    (ROOT / 'tools/openings-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--details', help='Optional detailed component audit JSON path')
    prepare(parser.parse_args().details)
