---
name: paper-shaders
description: Animated WebGL backgrounds (gradients, grain, halftone, liquid metal, god rays, dithering, noise, water...) with @paper-design/shaders-react. Use when a composition, landing page or scene needs a moving background or texture instead of a flat colour or video.
---

# Paper Shaders

Zero-dependency canvas/WebGL shaders by Paper. Installed in this project as
`@paper-design/shaders-react` (the vanilla core `@paper-design/shaders` comes with it).

## Critical rule inside Remotion

Paper shaders animate off wall-clock time by default. Inside Remotion that renders
non-deterministically (duplicated or jittery frames). Always freeze the clock and drive
the animation from `useCurrentFrame()`:

```tsx
import {useCurrentFrame, useVideoConfig, AbsoluteFill} from 'remotion';
import {MeshGradient} from '@paper-design/shaders-react';

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill>
      <MeshGradient
        style={{width: '100%', height: '100%'}}
        colors={['#e0eaff', '#241d9a', '#f75092', '#9f50d3']}
        distortion={1}
        swirl={0.8}
        speed={0}                      // freeze the internal clock
        frame={(frame / fps) * 1000}   // drive it from Remotion, in milliseconds
      />
    </AbsoluteFill>
  );
};
```

`speed` and `frame` exist on every animated shader (`ShaderMotionParams`). Verified working
with `npx remotion still` / `npx remotion render` on the bundled Chrome Headless Shell — no
extra `--gl` flag needed.

Outside Remotion (Next.js pages in `src/app`), drop the `speed={0}` / `frame` pair and let
the shader animate on its own.

## Available components

`ColorPanels` `Dithering` `DotGrid` `DotOrbit` `FlutedGlass` `GemSmoke` `GodRays`
`GrainGradient` `HalftoneCmyk` `HalftoneDots` `ImageDithering` `LensDistortion`
`LiquidMetal` `MeshGradient` `Metaballs` `NeuroNoise` `PaperTexture` `PerlinNoise`
`PulsingBorder` `SimplexNoise` `SmokeRing` `Spiral` `StaticMeshGradient`
`StaticRadialGradient` `Swirl` `Voronoi` `Warp` `Water` `Waves`

`Static*` variants have no motion — use them for stills and posters.

Each shader ships presets: `import {meshGradientPresets} from '@paper-design/shaders-react'`
and spread `presets[0].params`. Props are typed; read
`node_modules/@paper-design/shaders-react/dist/shaders/<name>.d.ts` for the exact uniforms
of a shader before guessing prop names.

## Performance

Cap resolution on big canvases with `maxPixelCount` / `minPixelRatio` rather than scaling the
element — rendering a 4K shader per frame is the usual cause of slow Remotion renders.

Visual param editor and gallery: https://paper.design/shaders
