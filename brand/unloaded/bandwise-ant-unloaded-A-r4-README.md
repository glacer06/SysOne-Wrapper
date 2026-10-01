# bandwise unloaded A ants, revision 4

Four side-view A variants: horizontal right and diagonal up-right, each in light and dark. This revision replaces A r3. The top-down C set also has pointed foot ends.

## Trail correction

The trail is independent of the ant. All 18 small dots have the same radius and equal center spacing along one straight line. There are no missing dots beneath the feet. The teal endpoint remains larger. The horizontal trail is flat; the diagonal trail rises up-right. All feet are separate from the dots, with visible clearance above the line. All six foot ends taper to points; round foot caps removed.

## Files

Each SVG has a 1400 x 1400 viewBox. Transparent PNG masters are 1800 x 1800. Theme-background previews are 1000 x 1000.

## Layers for animation

- `scene`: overall placement and orientation
- `trail`: independent dots and teal endpoint
- `ant`: ant shapes
- `body`: head with eye knockout, thorax and abdomen
- `leg-rear-far`, `leg-rear-near`, `leg-middle-far`, `leg-middle-near`, `leg-front-far`, `leg-front-near`: six leg groups with `data-pivot-x` and `data-pivot-y` metadata

The front-leg groups sit inside `front-far-pose` and `front-near-pose` wrappers. Preserve those resting-pose transforms and animate the inner leg groups around their indicated shoulder pivots. These are static animation-ready assets, not a completed walk cycle.

Palette, ant outlines and eye come from the supplied brand kit. Trail dots were rebuilt as equal circles to make the line uniform, continuous and independent of the feet. Included in kit v1.5.
