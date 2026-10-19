/**
 * EarthViewer.tsx — the cosmic viewer: the Earth, lit by the Sun where it is.
 *
 * WHAT IT DRAWS
 *
 * One sphere, three NASA images and a light:
 *
 *   by day     Blue Marble Next Generation, GIBS's geographic tiles
 *   by night   Black Marble, the newest composite GIBS publishes
 *   relief     NASA Earth Observatory's GEBCO topography, greyscale
 *   the light  the Sun's real direction at the instant shown (sun.ts)
 *
 * The relief is not raised: it tilts the surface normal, so a slope facing the
 * Sun is brighter and one facing away is darker. That is what makes the Andes
 * and the Himalaya read at dawn and go flat at noon — the terrain is shaded by
 * the angle of the Sun, which is the point of the view. The page publishes no
 * scale from grey level to metres, so the relief is exaggerated by a factor
 * the reader chooses and no height is claimed from it.
 *
 * THE FRAME
 *
 * Everything is in the Earth's own frame: the globe does not turn, the Sun and
 * the sky do. The Milky Way behind it is the cosmos view's own glow (NASA SVS),
 * placed by right ascension and declination and turned by sidereal time, so
 * the stars behind the Earth are the ones actually there.
 *
 * WHY TILES AND NOT ONE IMAGE
 *
 * Blue Marble's single-image editions are served without a CORS header, and
 * WebGL refuses an image that lacks one. GIBS serves the same product as tiles
 * with `Access-Control-Allow-Origin: *`, already in latitude/longitude, so the
 * texture is those tiles laid side by side — 10 × 5 of them, 5 120 px around.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { earthTiles, type Earth } from "../data/bundle";
import { subsolarPoint } from "./sun";
import { gmstDegrees } from "./units";

const RAD = Math.PI / 180;

/** A direction in the Earth's frame, in the axes three's SphereGeometry maps its texture to. */
function direction(lat: number, lon: number): THREE.Vector3 {
  const phi = lat * RAD, lambda = lon * RAD;
  return new THREE.Vector3(Math.cos(phi) * Math.cos(lambda), Math.sin(phi), -Math.cos(phi) * Math.sin(lambda));
}

/** Every tile of a layer, drawn side by side into one equirectangular canvas. */
async function mosaic(rows: string[][], tile: number, limit: number): Promise<HTMLCanvasElement> {
  const columns = rows[0].length;
  // Never larger than the GPU takes: a texture over the limit is a black globe.
  const scale = Math.min(1, limit / (columns * tile));
  const size = Math.floor(tile * scale);
  const canvas = document.createElement("canvas");
  canvas.width = size * columns;
  canvas.height = size * rows.length;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D canvas");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(rows.flatMap((row, y) => row.map((url, x) => new Promise<void>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => { context.drawImage(image, x * size, y * size, size, size); resolve(); };
    // One missing tile is a dark square on a planet still worth looking at.
    image.onerror = () => resolve();
    image.src = url;
  }))));
  return canvas;
}

/** One image as a texture, scaled down only if the GPU cannot take it whole. */
function picture(url: string, limit: number): Promise<HTMLCanvasElement | HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (image.width <= limit) return resolve(image);
      const canvas = document.createElement("canvas");
      canvas.width = limit;
      canvas.height = Math.round((limit * image.height) / image.width);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D day;
  uniform sampler2D night;
  uniform sampler2D relief;
  uniform float hasDay;
  uniform float hasNight;
  uniform float hasRelief;
  uniform vec2 reliefTexel;
  uniform float reliefScale;
  uniform vec3 sun;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(vNormal);
    float lat = asin(clamp(n.y, -1.0, 1.0));
    float lon = atan(-n.z, n.x);
    vec3 east = vec3(-sin(lon), 0.0, -cos(lon));
    vec3 north = vec3(-sin(lat) * cos(lon), cos(lat), sin(lat) * sin(lon));

    // The relief tilts the normal: height differences across one texel, east
    // and north, as a slope in radians of the Earth's own curvature.
    vec3 surface = n;
    float h = 0.0;
    if (hasRelief > 0.5) {
      h = texture2D(relief, vUv).r;
      float hE = texture2D(relief, vUv + vec2(reliefTexel.x, 0.0)).r;
      float hW = texture2D(relief, vUv - vec2(reliefTexel.x, 0.0)).r;
      float hN = texture2D(relief, vUv + vec2(0.0, reliefTexel.y)).r;
      float hS = texture2D(relief, vUv - vec2(0.0, reliefTexel.y)).r;
      float gx = (hE - hW) / (2.0 * reliefTexel.x * 6.2831853 * max(cos(lat), 0.08));
      float gy = (hN - hS) / (2.0 * reliefTexel.y * 3.1415927);
      surface = normalize(n - reliefScale * (gx * east + gy * north));
    }

    float sunUp = dot(n, sun);                         // the smooth sphere: where it is day
    float lit = max(dot(surface, sun), 0.0);           // the relief: which way a slope faces
    float daylight = smoothstep(-0.08, 0.12, sunUp);

    vec3 dayColour = hasDay > 0.5 ? texture2D(day, vUv).rgb : vec3(0.05, 0.09, 0.16);
    vec3 colour = dayColour * (0.03 + 1.15 * lit) * daylight;

    // The Sun's glint off open water: dark, blue and at sea level in the relief.
    vec3 view = normalize(cameraPosition - vWorld);
    float water = (1.0 - step(0.012, h)) * step(dayColour.r + 0.02, dayColour.b);
    float glint = pow(max(dot(reflect(-sun, n), view), 0.0), 60.0);
    colour += vec3(1.0, 0.93, 0.8) * glint * water * 0.55 * daylight;

    // Dusk along the terminator: a soft warm glow, strongest where the Sun
    // is on the horizon and gone within a few degrees either side.
    float dusk = exp(-pow(sunUp / 0.06, 2.0));
    colour += dayColour * vec3(0.9, 0.35, 0.12) * dusk * 0.35;

    // The night side: the lights, where the Sun is down.
    if (hasNight > 0.5) {
      float dark = 1.0 - smoothstep(-0.12, 0.06, sunUp);
      vec3 lights = texture2D(night, vUv).rgb;
      colour += lights * vec3(1.15, 0.95, 0.7) * dark * 1.3;
    }
    gl_FragColor = vec4(colour, 1.0);
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 sun;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), view)), 3.0);
    float lit = smoothstep(-0.35, 0.45, dot(normalize(vNormal), sun));
    vec3 colour = mix(vec3(0.02, 0.04, 0.12), vec3(0.35, 0.6, 1.0), lit);
    gl_FragColor = vec4(colour * rim * (0.25 + lit), rim);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform sampler2D milkyWay;
  uniform float gmst;
  uniform float hasSky;
  varying vec3 vNormal;
  void main() {
    if (hasSky < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 d = normalize(vNormal);
    float dec = asin(clamp(d.y, -1.0, 1.0));
    float ra = atan(-d.z, d.x) + gmst;                 // the Earth's frame, turned back to the sky's
    // The SVS map: 0h at the centre, right ascension increasing to the LEFT.
    float u = fract(0.5 - ra / 6.2831853);
    float v = 0.5 + dec / 3.1415927;
    gl_FragColor = vec4(texture2D(milkyWay, vec2(u, v)).rgb * 0.45, 1.0);
  }
`;

interface Props {
  earth: Earth;
  /** The instant the Sun is placed for. */
  at: Date;
  /** How strongly the relief tilts the surface: 1 is the default exaggeration. */
  relief: number;
  /** The Milky Way's glow, from the cosmos view's own dataset. */
  milkyWay: string;
  /** Where to look from first: Türkiye. */
  start: { lat: number; lon: number };
  hint: string;
}

export default function EarthViewer({ earth, at, relief, milkyWay, start, hint }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const uniforms = useRef<{ earth: Record<string, THREE.IUniform>; air: Record<string, THREE.IUniform>; sky: Record<string, THREE.IUniform> } | null>(null);

  useEffect(() => {
    const holder = box.current;
    if (!holder) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    holder.appendChild(renderer.domElement);
    const limit = Math.min(renderer.capabilities.maxTextureSize, 8192);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    camera.position.copy(direction(start.lat, start.lon).multiplyScalar(3.4));

    const earthUniforms: Record<string, THREE.IUniform> = {
      day: { value: null }, night: { value: null }, relief: { value: null },
      hasDay: { value: 0 }, hasNight: { value: 0 }, hasRelief: { value: 0 },
      reliefTexel: { value: new THREE.Vector2(1 / 5400, 1 / 2700) },
      reliefScale: { value: 0.02 },
      sun: { value: new THREE.Vector3(1, 0, 0) },
    };
    const airUniforms: Record<string, THREE.IUniform> = { sun: earthUniforms.sun };
    const skyUniforms: Record<string, THREE.IUniform> = {
      milkyWay: { value: null }, gmst: { value: 0 }, hasSky: { value: 0 },
    };
    uniforms.current = { earth: earthUniforms, air: airUniforms, sky: skyUniforms };

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 256, 128),
      new THREE.ShaderMaterial({ uniforms: earthUniforms, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT }),
    );
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: airUniforms, vertexShader: EARTH_VERTEX, fragmentShader: ATMOSPHERE_FRAGMENT,
        transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
      }),
    );
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(100, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms, vertexShader: EARTH_VERTEX, fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide, depthWrite: false,
      }),
    );
    scene.add(sky, globe, air);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.25;
    controls.maxDistance = 9;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.6;

    let alive = true;
    const texture = (source: HTMLCanvasElement | HTMLImageElement, srgb: boolean) => {
      const made = new THREE.Texture(source);
      made.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      made.anisotropy = renderer.capabilities.getMaxAnisotropy();
      made.wrapS = THREE.RepeatWrapping;
      made.needsUpdate = true;
      return made;
    };
    const { grid } = earth;
    mosaic(earthTiles(earth.day, grid), grid.tile_px, limit).then((canvas) => {
      if (!alive) return;
      earthUniforms.day.value = texture(canvas, true);
      earthUniforms.hasDay.value = 1;
    });
    mosaic(earthTiles(earth.night, grid), grid.tile_px, limit).then((canvas) => {
      if (!alive) return;
      earthUniforms.night.value = texture(canvas, true);
      earthUniforms.hasNight.value = 1;
    });
    picture(earth.relief.url, limit).then((image) => {
      if (!alive) return;
      earthUniforms.relief.value = texture(image, false);
      earthUniforms.reliefTexel.value.set(1 / image.width, 1 / image.height);
      earthUniforms.hasRelief.value = 1;
    }, () => undefined);
    picture(milkyWay, limit).then((image) => {
      if (!alive) return;
      skyUniforms.milkyWay.value = texture(image, true);
      skyUniforms.hasSky.value = 1;
    }, () => undefined);

    const fit = () => {
      const width = holder.clientWidth || 1, height = holder.clientHeight || 1;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(holder);

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      alive = false;
      watch.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
      for (const key of ["day", "night", "relief"]) (earthUniforms[key].value as THREE.Texture | null)?.dispose();
      (skyUniforms.milkyWay.value as THREE.Texture | null)?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The scene is built once; the Sun and the relief move through uniforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earth, milkyWay]);

  // The Sun, and the sky turned by sidereal time, for the instant shown.
  useEffect(() => {
    const current = uniforms.current;
    if (!current) return;
    const { lat, lon } = subsolarPoint(at);
    (current.earth.sun.value as THREE.Vector3).copy(direction(lat, lon));
    current.sky.gmst.value = gmstDegrees(at) * RAD;
  }, [at, earth]);

  useEffect(() => {
    if (uniforms.current) uniforms.current.earth.reliefScale.value = 0.02 * relief;
  }, [relief, earth]);

  return (
    <div className="cosmic">
      <div className="cosmic__canvas" ref={box} />
      <p className="cosmic__hint">{hint}</p>
    </div>
  );
}
