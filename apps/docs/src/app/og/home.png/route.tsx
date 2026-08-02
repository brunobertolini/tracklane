import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import type { CSSProperties, ReactNode } from 'react';
import { readmeTagline } from '@/lib/readme';
import { appName } from '@/lib/shared';

/**
 * The hero as a card, minus the fan-out.
 *
 * The panel is the best thing on the page and the worst thing in a 1200x630
 * crop: six lines of code at a size nobody reads in a timeline. What survives
 * the crop is the headline, the sentence under it and the light behind both,
 * which is also the whole argument.
 *
 * Everything here is drawn, never fetched. Satori renders at build time with
 * no network, so a remote font or a remote logo is a build that fails on
 * someone else's outage.
 *
 * ## Why this is a route and not `opengraph-image.tsx`
 *
 * The file convention names its own output, and under `output: 'export'` that
 * name is `opengraph-image-<hash>` with no extension. GitHub Pages types an
 * extensionless file as `application/octet-stream`, and a crawler handed that
 * declines to show an image, so the card silently degrades to text on the one
 * surface it was drawn for. A route ending in `.png` exports a file ending in
 * `.png`. `/og/docs/[...slug]` is named the same way for the same reason.
 */

export const dynamic = 'force-static';

const WIDTH = 1200;
const HEIGHT = 630;

/** Kept in step with `--tl-accent` in `global.css`, which is `hsl(19, 88%, 58%)`. */
const ACCENT = '#f27136';
const BACKGROUND = '#09090b';
const FOREGROUND = '#fafafa';
const MUTED = '#a1a1aa';

/**
 * The light, in the geometry `global.css` describes: an origin at 78% by 38%,
 * a beam through it at -33deg, and the diagonals it throws.
 *
 * The stylesheet gets there with `repeating-linear-gradient`, a radial
 * `mask-image` and `filter: blur()`. Satori supports none of the three, so
 * each ray is a real element, the mask becomes a per-ray opacity, and the blur
 * becomes a soft gradient. Same picture, other means.
 */
const ORIGIN_X = 0.78 * WIDTH;
const ORIGIN_Y = 0.38 * HEIGHT;
const ANGLE = -33;
const RAY_GAP = 44;
const RAY_COUNT = 16;

/** Unit vector perpendicular to the beam: where the next ray sits. */
const NORMAL_X = Math.cos(((90 + ANGLE) * Math.PI) / 180);
const NORMAL_Y = Math.sin(((90 + ANGLE) * Math.PI) / 180);

/**
 * One element centred on a point and rotated with the beam.
 *
 * The centring is arithmetic because satori resolves a percentage `translate`
 * against the parent rather than the element, so the usual
 * `translate(-50%,-50%) rotate(...)` lands somewhere else entirely. `transform`
 * here only ever rotates, about the default centre origin.
 */
function placed(cx: number, cy: number, width: number, height: number): CSSProperties {
  return {
    position: 'absolute',
    display: 'flex',
    left: cx - width / 2,
    top: cy - height / 2,
    width,
    height,
    transform: `rotate(${ANGLE}deg)`,
  };
}

function Rays(): ReactNode {
  const rays = [];

  for (let step = -RAY_COUNT; step <= RAY_COUNT; step++) {
    const distance = step * RAY_GAP;
    // The stylesheet draws the lines twice: a faint copy across the whole hero,
    // and a bright copy only where the light reaches. One opacity, same effect.
    const nearness = Math.max(0, 1 - Math.abs(step) / (RAY_COUNT * 0.62));
    const opacity = 0.1 + 0.42 * nearness * nearness;

    rays.push(
      <div
        key={step}
        style={{
          ...placed(ORIGIN_X + distance * NORMAL_X, ORIGIN_Y + distance * NORMAL_Y, 1800, 1),
          opacity,
          backgroundImage: `linear-gradient(90deg, transparent 6%, ${ACCENT} 38%, ${ACCENT} 62%, transparent 94%)`,
        }}
      />,
    );
  }

  return <>{rays}</>;
}

function Glow(): ReactNode {
  return (
    // Sized in pixels rather than `inset: 0`, which satori resolves to a box of
    // no size: every absolutely positioned ray inside then had nothing to be
    // positioned against and the whole effect rendered as nothing at all.
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        left: 0,
        top: 0,
        width: WIDTH,
        height: HEIGHT,
        overflow: 'hidden',
      }}
    >
      <Rays />

      {/* The haze. An ellipse where the stylesheet blurs a bar, because the
          shape of a blurred bar is an ellipse. */}
      <div
        style={{
          ...placed(ORIGIN_X, ORIGIN_Y, 1300, 170),
          opacity: 0.26,
          backgroundImage: `radial-gradient(50% 50% at 50% 50%, ${ACCENT} 0%, rgba(242,113,54,0.3) 38%, rgba(242,113,54,0) 70%)`,
        }}
      />

      {/* The beam itself: white only at the very centre, which is what stops it
          reading as a drawn line. */}
      <div
        style={{
          ...placed(ORIGIN_X, ORIGIN_Y, 1300, 2),
          backgroundImage:
            'linear-gradient(90deg, rgba(242,113,54,0) 4%, rgba(242,113,54,0.55) 30%, #ffb391 46%, #ffffff 50%, #ffb391 54%, rgba(242,113,54,0.55) 70%, rgba(242,113,54,0) 96%)',
        }}
      />

      <div
        style={{
          ...placed(ORIGIN_X, ORIGIN_Y, 250, 250),
          opacity: 0.55,
          backgroundImage: `radial-gradient(closest-side, #ffd0b5 0%, ${ACCENT} 22%, rgba(242,113,54,0) 68%)`,
        }}
      />
    </div>
  );
}

/**
 * The nav's mark, as a data URI rather than as JSX.
 *
 * Satori parses inline `<svg>` itself and got this one wrong: the strokes
 * ignored the viewBox and collapsed into a smudge. Handing it over as an image
 * sends it to the rasteriser whole, which is the same path the favicon takes.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="17 23 64 50" width="64" height="50" fill="none">
<path d="M22 48H38" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
<path d="M38 48H50" stroke="#FF7043" stroke-width="7" stroke-linecap="round"/>
<path d="M50 48C60 48 63 30 73 30" stroke="#FF7043" stroke-width="7" stroke-linecap="round"/>
<path d="M50 48H74" stroke="#FF7043" stroke-width="7" stroke-linecap="round"/>
<path d="M50 48C60 48 63 66 73 66" stroke="#FF7043" stroke-width="7" stroke-linecap="round"/>
<circle cx="23" cy="48" r="4" fill="#FFFFFF"/>
<circle cx="73" cy="30" r="5" fill="#FFFFFF"/>
<circle cx="74" cy="48" r="5" fill="#FFFFFF"/>
<circle cx="73" cy="66" r="5" fill="#FFFFFF"/>
</svg>`;

const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`;

export async function GET(): Promise<ImageResponse> {
  const [regular, semibold] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Inter-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Inter-SemiBold.ttf')),
  ]);

  return new ImageResponse(
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '64px 80px',
        backgroundColor: BACKGROUND,
        fontFamily: 'Inter',
      }}
    >
      <Glow />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13 }}>
        {/* biome-ignore lint/performance/noImgElement: satori renders to a PNG, there is no next/image here */}
        <img src={MARK_URI} width={51} height={40} alt="" />
        <span
          style={{
            display: 'flex',
            fontSize: 29,
            fontWeight: 600,
            color: FOREGROUND,
            letterSpacing: '-0.02em',
          }}
        >
          {appName}
        </span>
      </div>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Two lines, broken where the page breaks them. Left to wrap on its
            own it breaks after "gets", and the sentence stops being a pair. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 74,
            fontWeight: 600,
            color: FOREGROUND,
            lineHeight: 1.03,
            letterSpacing: '-0.035em',
          }}
        >
          <span style={{ display: 'flex' }}>Name the event once.</span>
          <span style={{ display: 'flex' }}>Every tool gets its own.</span>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 26,
            maxWidth: 700,
            fontSize: 26,
            color: MUTED,
            lineHeight: 1.45,
          }}
        >
          {readmeTagline()}
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 64,
          height: 3,
          backgroundColor: ACCENT,
        }}
      />
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
