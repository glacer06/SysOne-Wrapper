# bandwise unloaded ants, revision 4

A side-view and C top-down ants, facing right or up-right, in light and dark.
Each SVG separates body and six leg groups, with pivot metadata for animation. PNG masters are transparent. These are static animation-ready assets, not a finished walk cycle.

All six feet taper to points. Body, eye and antennae are retained from the supplied artwork. A includes an independent straight trail of 18 equal circles with equal spacing, clear of the feet, followed by the larger teal endpoint. C has no trail.

A SVG viewBox: 1400 square; PNG: 1800 square. C SVG viewBox: 1200 square; PNG: 1600 square.

## Shared leg IDs (v1.6)

Both A and C use `leg-front-1`, `leg-front-2`, `leg-middle-1`, `leg-middle-2`, `leg-rear-1`, and `leg-rear-2`. The neutral side numbers work across the side-view A and top-down C without implying a shared camera angle.

Mapping from v1.5: A far = 1, near = 2; C left = 1, right = 2. Those are source-view sides, not screen-left after rotating the scene. Geometry, transforms and pivot metadata are unchanged. Alternate tripod sets: front-1 / middle-2 / rear-1 and front-2 / middle-1 / rear-2.

A keeps its `front-far-pose` and `front-near-pose` resting-pose wrappers; animate the inner leg groups around their supplied pivots. C has direct leg groups under `ant`. No walk-cycle implementation is included.
