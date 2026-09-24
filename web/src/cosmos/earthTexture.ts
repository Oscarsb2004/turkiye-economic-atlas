/**
 * earthTexture.ts — the Earth at night as one image, from NASA's own tiles.
 *
 * WHY NOT A COMMITTED IMAGE
 *
 * NASA Earth Observatory publishes Black Marble as a single 3600×1800 JPEG,
 * and it is the obvious texture for an Earth seen from space — but it is
 * served without a CORS header, and WebGL refuses an image that lacks one.
 * GIBS serves the SAME product as tiles with `Access-Control-Allow-Origin: *`,
 * which is how the globe draws it already. So the texture is assembled here
 * from those tiles: nothing committed, and the Earth in space shows exactly
 * the night the map was showing.
 *
 * THE ONE TRANSFORM
 *
 * The tiles are Web Mercator and a sphere wants equirectangular. Longitude is
 * the same in both, so each output row is one strip of the Mercator mosaic,
 * picked by the latitude that row stands for:
 *
 *     y_mercator = (1 − ln(tan(π/4 + φ/2)) / π) / 2
 *
 * Mercator stops at ±85.05°; the rows beyond it are left black, which at
 * night over the poles is what is there anyway.
 */

/** Zoom level of the mosaic: 8×8 tiles, 2 048 px around the equator. */
const ZOOM = 3;
const TILE = 256;

/** Every tile at ZOOM, drawn into one Web Mercator mosaic. */
async function mosaic(template: string): Promise<HTMLCanvasElement> {
  const count = 2 ** ZOOM;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = count * TILE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D canvas");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const loads: Array<Promise<void>> = [];
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      const url = template.replace("{z}", String(ZOOM)).replace("{y}", String(y)).replace("{x}", String(x));
      loads.push(new Promise<void>((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          context.drawImage(image, x * TILE, y * TILE);
          resolve();
        };
        // A missing tile is a black square on the night side of a planet —
        // the texture is still worth having, so it does not fail the whole.
        image.onerror = () => resolve();
        image.src = url;
      }));
    }
  }
  await Promise.all(loads);
  return canvas;
}

/**
 * The night Earth, equirectangular, 2 048 × 1 024, west edge at −180°.
 *
 * `template` is a tile URL with {z}/{y}/{x}, as data/bundle.ts builds for the
 * nightlights layer.
 */
export async function nightEarth(template: string): Promise<HTMLCanvasElement> {
  const source = await mosaic(template);
  const width = source.width;
  const height = width / 2;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const context = out.getContext("2d");
  if (!context) throw new Error("no 2D canvas");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);

  for (let row = 0; row < height; row += 1) {
    // The latitude at the middle of this output row, north at the top.
    const latitude = (90 - ((row + 0.5) / height) * 180) * (Math.PI / 180);
    const y = (1 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / Math.PI) / 2;
    if (!(y >= 0 && y < 1)) continue;                // beyond Mercator's ±85.05°
    context.drawImage(source, 0, Math.floor(y * source.height), width, 1, 0, row, width, 1);
  }
  return out;
}
