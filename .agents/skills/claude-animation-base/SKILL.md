---
name: claude-animation-base
description: Hand-painted cartoon animation with p5.js + p5.brush and the Clawd character (31 acted emotions, brush strokes, boiling linework, watercolour fills), rendered headlessly to MP4. Use for drawn/illustrated character animation, not for motion graphics or typography.
---

# Claude Animation Base

A standalone starter kit cloned into `./ClaudeAnimationBase` (its own repo and its own
`node_modules`, already installed). It is **not** Remotion: it paints frames with p5.brush in
headless Chrome and encodes them with ffmpeg.

## Workflow

1. **Read `ClaudeAnimationBase/ANIMATION_GUIDE.md` first.** It holds the rules (handmade,
   alive, one piece, no text, always a transition, something happens in every scene), the
   timing conventions and the full API. Do not write a scene before reading it.
2. Storyboard the film in prose before touching code.
3. Write the scene in `ClaudeAnimationBase/src/scenes/` (`demo.js` is the worked example).
4. Check your own work with a contact sheet, then render the clip.

## Commands (run from `ClaudeAnimationBase/`)

```bash
node render.mjs --sheet=0,1,2,3,4,5 --out=out/sheet.jpg   # contact sheet to self-review
node render.mjs --clip --out=out/video.mp4                # full render
node render.mjs --frames=30 --png --out=out/frame.png     # single frame
```

Useful flags: `--range`, `--fps`, `--cols`, `--crop`, `--crop-at`, `--audio`, `--loop=emotions`,
`--chrome=<path>`. `studio.html` opened in Chrome scrubs the timeline
(`?loop=emotions` / `?loop=views` show the model sheets).

## What's where

| path | what |
|---|---|
| `src/clawd.js` | Clawd: views, emotions, eyes, mouths, hats, emotes, dances |
| `src/core.js` | Painting, timing, motion helpers, camera, light, paper |
| `src/timeline.js` | Shots, loops, brush-wipe transition |
| `src/config.js` | Length and tempo |
| `docs/emotions.jpg`, `docs/views.jpg` | Model sheets — look at them before posing the character |

## Notes

- Requires Node, Google Chrome and ffmpeg. All three are present on this machine
  (Chrome at `/Applications/Google Chrome.app`, ffmpeg 9.1 via Homebrew). Verified: a
  6-frame contact sheet renders in ~0.1 s/frame.
- Watercolour fills are the slow part. On weak GPUs, swap them for flat fills.
- To use the output inside a Remotion composition, render to MP4 here and bring it in with
  `<OffthreadVideo src={staticFile('...')} />` after copying it into `public/`.
