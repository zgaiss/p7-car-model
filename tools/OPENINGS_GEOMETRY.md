# P7 opening geometry

`prepare_openings.py` generates `app/src/main/assets/model/XPP7_Model_openings.glb` from the unchanged `XPP7_Model_v4.glb`. Requires Python 3, NumPy and SciPy; generation does not require Blender. Run it from any directory. `--details /path/to/audit.json` optionally records every original geometry island's assignment. The source SHA-256 is checked before geometry work; a different source requires reinspecting and updating the extraction map.

## Runtime interface

Six root groups: `opening_front_left`, `opening_front_right`, `opening_rear_left`, `opening_rear_right`, `opening_hood`, `opening_trunk`. Their initial translation is the hinge point. Rotate the indicated local axis from zero; do not reset their translation. `openings-manifest.json` gives pivots and full-open angles. Coordinates are glTF +Y up, +Z front, +X left. These are visually calibrated demonstration hinges, not manufacturer kinematic measurements.

Child `extras.openingPart` identifies the moving group; `extras.sourceNode` records the original material-batched node. Original material definitions/names are retained. Both `light_on` and `light_off` can occur on multiple meshes after splitting; toggle every matching mesh. Mirror reflections must follow the same group rotations.

## Preparation and verification

- Uses original indexed connectivity, never positional welding across coincident door seams
- Regroups painted skins/returns, four movable panes, inner door trims, handles, mirror covers/mounts, hood surfaces/emblem and trunk surfaces/central trim/light portions
- Keeps body pillars, quarter glass, under-hood covers, cabin, trunk cavity and longitudinal rocker/sill strips stationary
- Retains source triangle count: 256,181; generated scene: 113 mesh objects and 119 nodes, including six pivot groups
- Closed world-space maximum coordinate difference: 8.88e-16 (numerical roundoff)
- Independent `python tools/validate_openings.py` verifies byte-identical per-material triangle vertex attributes (including normals/UVs), identical material JSON, closed placement and no orphan nodes
- Blender visual QA covered all six groups open from front, rear and side, plus closed state. QA identified and corrected wrongly assigned rocker strips, rear inner beltline seals and inner mirror supports
- Original GLB is not overwritten. Generated file is roughly 10.3 MB; compact source accessors and indices are reused/split without adding new surface triangles

## Remaining limits

The asset already includes cabin/door interiors, an under-hood compartment with covers, and a rear trunk cavity. No new storage interior was modeled. The hood opening exposes the existing front covers; it should not be presented as a newly modeled empty front storage bin. These low-poly interior surfaces and some narrow seal/edge details may look rough in close-up. Opening limits and pivots were visually checked, but this is not a physical hinge simulation or exhaustive collision test. UI animation, repeated interactions, paint changes and reflection behavior require runtime tests separately.
