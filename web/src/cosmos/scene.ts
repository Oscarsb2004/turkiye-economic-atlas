/**
 * scene.ts — from the Earth's surface to 700 megaparsecs, in one WebGL scene.
 *
 * THE PROBLEM THIS FILE EXISTS FOR
 *
 * The span is 10^19: the Earth's radius is 6 371 km and the farthest 2MASS
 * galaxy is 740 Mpc. A GPU draws in 32-bit floats, seven significant digits,
 * so no single set of coordinates holds both — place the Earth in parsecs and
 * it is a rounding error; place the galaxies in kilometres and they overflow
 * the depth buffer. Two techniques, both standard, make it one scene:
 *
 *   A FLOATING ORIGIN. Every position is kept in 64-bit JavaScript numbers,
 *   in kilometres from the solar system's barycentre, and the scene is built
 *   around the CAMERA each frame: an object is drawn at (where it is − where
 *   the eye is), so whatever is near the eye is always near the origin, where
 *   32-bit floats are precise.
 *
 *   A MOVING UNIT. The render unit is the eye's distance from the Earth. The
 *   Earth is therefore always about one unit away, whatever the zoom, and a
 *   catalogue kept in its own unit — stars in parsecs, galaxies in megaparsecs
 *   — is one group scaled by (its unit / the render unit) rather than 73 000
 *   positions rewritten every frame.
 *
 * A logarithmic depth buffer does the rest: near and far can be 10^18 apart.
 *
 * WHAT IS DRAWN, AND FROM WHAT
 *
 *   the Earth           GIBS Black Marble tiles, assembled (earthTexture.ts),
 *                       turned by Greenwich sidereal time on the epoch
 *   the Sun, the planets, Pluto, the Moon and their orbits
 *                       JPL Horizons positions on the epoch; the orbit is
 *                       Horizons' own positions, joined
 *   the stars           Hipparcos, at 1000/parallax parsecs, each as bright
 *                       as its magnitude makes it FROM WHERE THE EYE IS
 *   the galaxies        2MASS Redshift Survey, at velocity/H0
 *   the Milky Way glow  NASA SVS Deep Star Maps, on the sky, faded out once
 *                       the eye is far enough from the Sun that it is not
 *                       the sky any more
 *
 * The planets' colours are the one thing not from a dataset: at the scales
 * they are seen at here they are points, and a flat tint names which is which.
 */

import * as THREE from "three";

import type { Cosmos } from "../data/bundle";
import {
  MPC_KM,
  PC_KM,
  absoluteMagnitude,
  colourFromBV,
  gmstDegrees,
  icrf,
  megaparsecsFromVelocity,
  parsecsFromParallax,
  toScene,
} from "./units";

export type Vec = [number, number, number];

/** Vertical field of view, degrees — MapLibre's own, so the hand-off matches. */
export const FOV = 36.87;

/** A body the scene draws, and where it is in scene axes, km, from the barycentre. */
interface Body {
  id: string;
  name: { tr: string; en: string };
  radius: number;
  position: Vec;
  mesh: THREE.Mesh;
  marker: THREE.Points;
}

/** Flat tints for the bodies, which are points at the scales they are seen at. */
const TINT: Record<string, string> = {
  "10": "#fff4d6", "199": "#a8a29a", "299": "#e8d3a2", "399": "#6aa9ff",
  "499": "#d4704a", "599": "#d9b58c", "699": "#e5d3a1", "799": "#9fd8e0",
  "899": "#5b7fe0", "999": "#c9b8a6", "301": "#cfcfcf",
};

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec) => Math.hypot(a[0], a[1], a[2]);

/** A 64×64 soft round glow, for the Sun and for point sprites. */
function glowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.15)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Points whose size and brightness follow their magnitude FROM THE EYE.
 *
 * Each point carries its absolute magnitude, and the shader works out the
 * apparent one from the eye's position every frame: m = M + 5·log10(d/10 pc).
 * Fly towards a star and it brightens, which is the one thing a static
 * picture of the sky cannot do.
 */
function magnitudePoints(
  positions: Float32Array, absolute: Float32Array, colours: Float32Array,
  unitPc: number, reference: number, sprite: THREE.Texture,
): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("absMag", new THREE.BufferAttribute(absolute, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      eye: { value: new THREE.Vector3() },
      unitPc: { value: unitPc },
      reference: { value: reference },
      fade: { value: 1 },
      pixelRatio: { value: window.devicePixelRatio || 1 },
      sprite: { value: sprite },
    },
    vertexShader: `
      attribute float absMag;
      uniform vec3 eye;
      uniform float unitPc;
      uniform float reference;
      uniform float fade;
      uniform float pixelRatio;
      varying vec3 vColour;
      varying float vAlpha;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        float d = max(length(position - eye) * unitPc, 1e-6);
        float apparent = absMag + 5.0 * (log(d / 10.0) / log(10.0));
        float bright = pow(10.0, -0.4 * (apparent - reference));
        gl_PointSize = clamp(1.4 * pow(bright, 0.25), 1.0, 5.5) * pixelRatio;
        vAlpha = clamp(sqrt(bright), 0.08, 1.0) * fade;
        vColour = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D sprite;
      varying vec3 vColour;
      varying float vAlpha;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(sprite, gl_PointCoord).a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColour, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export class CosmosScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 1e14);
  private readonly scene = new THREE.Scene();
  private readonly bodies: Body[] = [];
  private readonly orbits = new THREE.Group();
  private readonly moonOrbit = new THREE.Group();
  private readonly stars: THREE.Points;
  private readonly galaxies: THREE.Points;
  private readonly sky: THREE.Mesh;
  private readonly earthAtmosphere: THREE.Mesh;
  private readonly sunGlow: THREE.Sprite;
  private readonly earthMaterial: THREE.ShaderMaterial;
  private readonly sprite = glowTexture();
  /** Where the Earth is, scene axes, km from the barycentre. */
  readonly earth: Vec;
  /** The Earth's radius, km, as Horizons publishes it. */
  readonly earthRadius: number;

  constructor(canvas: HTMLCanvasElement, data: Cosmos) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0x000000, 1);

    // ── The sky: the Milky Way's glow, drawn first and behind everything ─────
    const skyTexture = new THREE.TextureLoader().load(data.milkyWay);
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: skyTexture }, fade: { value: 1 } },
        // The SVS map is centred on 0h with right ascension increasing to the
        // LEFT, in celestial coordinates — so each fragment's direction is
        // turned back into RA and Dec, and the texture read at those.
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: `
          uniform sampler2D map;
          uniform float fade;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            // Scene (x, y, z) is ICRF (x, -z, y): see units.ts, toScene.
            float ra = atan(-d.z, d.x);
            float dec = asin(clamp(d.y, -1.0, 1.0));
            vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
            gl_FragColor = vec4(texture2D(map, uv).rgb * fade, 1.0);
          }`,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ── The solar system ────────────────────────────────────────────────────
    const byId = new Map(data.solarSystem.bodies.map((body) => [body.id, body]));
    const sceneOf = (km: [number, number, number]): Vec => toScene(km[0], km[1], km[2]);
    const earthBody = byId.get("399");
    if (!earthBody) throw new Error("solar-system.json has no Earth");
    this.earth = sceneOf(earthBody.position_km);
    this.earthRadius = earthBody.radius_km;

    // The Earth: its night texture arrives later, from GIBS (setEarthTexture).
    // Until then it is a dark sphere, which is the Earth at night unlit.
    const gmst = gmstDegrees(new Date(`${data.solarSystem.epoch}T00:00:00Z`)) * (Math.PI / 180);
    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, hasMap: { value: 0 }, gmst: { value: gmst } },
      vertexShader: `
        varying vec3 vNormal;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vNormal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      // Scene -> ICRF, then turned back by sidereal time into the Earth's own
      // frame, where longitude and latitude read the equirectangular texture.
      fragmentShader: `
        uniform sampler2D map;
        uniform float hasMap;
        uniform float gmst;
        varying vec3 vNormal;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vNormal);
          vec3 c = vec3(n.x, -n.z, n.y);
          float lon = atan(c.y, c.x) - gmst;
          lon = mod(lon + 3.1415927, 6.2831853) - 3.1415927;
          float lat = asin(clamp(c.z, -1.0, 1.0));
          vec2 uv = vec2((lon + 3.1415927) / 6.2831853, (lat + 1.5707963) / 3.1415927);
          vec3 night = hasMap > 0.5 ? texture2D(map, uv).rgb : vec3(0.02, 0.03, 0.06);
          gl_FragColor = vec4(night, 1.0);
        }`,
    });

    for (const body of data.solarSystem.bodies) {
      const centre = body.centre === "500@399" ? earthBody.position_km : [0, 0, 0];
      const km: [number, number, number] = [
        body.position_km[0] + centre[0], body.position_km[1] + centre[1], body.position_km[2] + centre[2],
      ];
      const tint = new THREE.Color(TINT[body.id] ?? "#ffffff");
      const material = body.id === "399"
        ? this.earthMaterial
        : new THREE.MeshBasicMaterial({ color: tint });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, body.id === "399" ? 128 : 48, body.id === "399" ? 64 : 24), material);
      this.scene.add(mesh);
      // A body is a disc when it is close and a point of light when it is not:
      // the marker keeps it visible at the scales where its disc is sub-pixel.
      const marker = new THREE.Points(
        new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3)),
        new THREE.PointsMaterial({
          color: tint, size: body.id === "10" ? 9 : 5, sizeAttenuation: false,
          map: this.sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      marker.frustumCulled = false;
      this.scene.add(marker);
      this.bodies.push({ id: body.id, name: body.name, radius: body.radius_km, position: sceneOf(km), mesh, marker });

      if (body.orbit_km.length > 1) {
        const points = new Float32Array(body.orbit_km.flatMap((p) => sceneOf(p)));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(points, 3)),
          new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.35 }),
        );
        line.frustumCulled = false;
        (body.centre === "500@399" ? this.moonOrbit : this.orbits).add(line);
      }
    }
    this.scene.add(this.orbits, this.moonOrbit);

    // A thin blue rim of atmosphere, brighter at the limb.
    this.earthAtmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.015, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying float vRim;
          #include <common>
          #include <logdepthbuf_pars_vertex>
          void main() {
            vec3 n = normalize(normalMatrix * normal);
            vec3 v = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
            vRim = pow(1.0 - abs(dot(n, v)), 3.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `
          varying float vRim;
          #include <logdepthbuf_pars_fragment>
          void main() {
            #include <logdepthbuf_fragment>
            gl_FragColor = vec4(0.35, 0.6, 1.0, vRim * 0.8);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      }),
    );
    this.scene.add(this.earthAtmosphere);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.sprite, color: 0xfff1c9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.sunGlow);

    // ── The stars: Hipparcos, in parsecs from the barycentre ────────────────
    const rows = data.stars.stars;
    const starPositions = new Float32Array(rows.length * 3);
    const starAbsolute = new Float32Array(rows.length);
    const starColours = new Float32Array(rows.length * 3);
    rows.forEach(([, ra, dec, parallax, mag, bv], i) => {
      const pc = parsecsFromParallax(parallax);
      const [x, y, z] = toScene(...icrf(ra, dec, pc));
      starPositions.set([x, y, z], i * 3);
      starAbsolute[i] = absoluteMagnitude(mag ?? 9, pc);
      starColours.set(colourFromBV(bv), i * 3);
    });
    this.stars = magnitudePoints(starPositions, starAbsolute, starColours, 1, 5.5, this.sprite);
    this.scene.add(this.stars);

    // ── The galaxies: 2MRS, in megaparsecs, by the Hubble law ───────────────
    const galaxyRows = data.galaxies.galaxies;
    const galaxyPositions = new Float32Array(galaxyRows.length * 3);
    const galaxyAbsolute = new Float32Array(galaxyRows.length);
    const galaxyColours = new Float32Array(galaxyRows.length * 3);
    galaxyRows.forEach(([, ra, dec, velocity, ks], i) => {
      const mpc = megaparsecsFromVelocity(velocity, data.h0);
      const [x, y, z] = toScene(...icrf(ra, dec, mpc));
      galaxyPositions.set([x, y, z], i * 3);
      galaxyAbsolute[i] = absoluteMagnitude(ks ?? 11.75, mpc * 1e6);
      // Near-infrared light, drawn a warm white: a galaxy's old stars.
      galaxyColours.set([1.0, 0.86, 0.72], i * 3);
    });
    this.galaxies = magnitudePoints(galaxyPositions, galaxyAbsolute, galaxyColours, 1e6, 14.5, this.sprite);
    this.scene.add(this.galaxies);
  }

  /** The night Earth, once the tiles have been assembled into one image. */
  setEarthTexture(canvas: HTMLCanvasElement): void {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.earthMaterial.uniforms.map.value = texture;
    this.earthMaterial.uniforms.hasMap.value = 1;
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /**
   * One frame, from `eye` (scene axes, km from the barycentre) facing along
   * `orientation`. Everything is placed relative to the eye, in units of the
   * eye's distance from the Earth — see the header.
   */
  render(eye: Vec, orientation: THREE.Quaternion): void {
    const unit = Math.max(length(sub(this.earth, eye)), 1);
    const place = (object: THREE.Object3D, at: Vec, scale: number) => {
      const r = sub(at, eye);
      object.position.set(r[0] / unit, r[1] / unit, r[2] / unit);
      object.scale.setScalar(scale / unit);
    };

    this.camera.quaternion.copy(orientation);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld();

    for (const body of this.bodies) {
      place(body.mesh, body.position, body.radius);
      place(body.marker, body.position, 1);
      body.marker.scale.setScalar(1);
    }
    place(this.earthAtmosphere, this.earth, this.earthRadius);
    const sun = this.bodies.find((body) => body.id === "10");
    if (sun) {
      place(this.sunGlow, sun.position, sun.radius * 6);
    }

    // The orbits come in and go out with the scale they belong to. Near the
    // Earth the planets' orbits are straight lines slashing across the view —
    // the Earth's own runs through the planet — so they arrive once the eye
    // is a hundredth of an AU out, and leave past 2 000 AU, where they are a
    // knot of lines on top of the Sun. The Moon's orbit has its own, smaller
    // window, from a few Earth radii to half an AU.
    const au = length(eye) / 149_597_870.7;
    const fromEarthAu = unit / 149_597_870.7;
    const orbitFade = THREE.MathUtils.clamp(1 - Math.log10(Math.max(au, 1) / 200) / 1, 0, 1)
      * THREE.MathUtils.smoothstep(Math.log10(fromEarthAu), -2.3, -1.3);
    const moonFade = THREE.MathUtils.smoothstep(Math.log10(unit), 4.4, 5.0)
      * (1 - THREE.MathUtils.smoothstep(Math.log10(fromEarthAu), -1.3, -0.3));
    place(this.orbits, [0, 0, 0], 1);
    place(this.moonOrbit, this.earth, 1);
    for (const line of this.orbits.children) {
      ((line as THREE.Line).material as THREE.LineBasicMaterial).opacity = 0.35 * orbitFade;
    }
    for (const line of this.moonOrbit.children) {
      ((line as THREE.Line).material as THREE.LineBasicMaterial).opacity = 0.35 * moonFade;
    }
    for (const body of this.bodies) {
      (body.marker.material as THREE.PointsMaterial).opacity = body.id === "10" ? 1 : orbitFade;
    }

    // Catalogues: one group each, in its own unit.
    const eyePc = length(eye) / PC_KM;
    place(this.stars, [0, 0, 0], PC_KM);
    place(this.galaxies, [0, 0, 0], MPC_KM);
    const starUniforms = (this.stars.material as THREE.ShaderMaterial).uniforms;
    starUniforms.eye.value.set(eye[0] / PC_KM, eye[1] / PC_KM, eye[2] / PC_KM);
    const galaxyUniforms = (this.galaxies.material as THREE.ShaderMaterial).uniforms;
    galaxyUniforms.eye.value.set(eye[0] / MPC_KM, eye[1] / MPC_KM, eye[2] / MPC_KM);
    // The galaxies come in as the eye leaves the Milky Way's scale; seen from
    // inside the solar system they would only be specks among the stars.
    galaxyUniforms.fade.value = THREE.MathUtils.smoothstep(Math.log10(eyePc), 3.3, 4.7);
    starUniforms.fade.value = 1 - 0.6 * THREE.MathUtils.smoothstep(Math.log10(eyePc), 4.0, 5.5);
    // The glow is the sky AS SEEN FROM THE SUN; once the eye is hundreds of
    // parsecs away it is the wrong sky, so it goes.
    const sky = this.sky.material as THREE.ShaderMaterial;
    sky.uniforms.fade.value = 0.8 * (1 - THREE.MathUtils.smoothstep(Math.log10(eyePc), 1.5, 2.8));

    this.renderer.render(this.scene, this.camera);
  }

  /** Where a body is on screen, or null when it is behind the eye. */
  project(id: string, eye: Vec, width: number, height: number): { x: number; y: number } | null {
    const body = this.bodies.find((entry) => entry.id === id);
    if (!body) return null;
    const unit = Math.max(length(sub(this.earth, eye)), 1);
    const r = sub(body.position, eye);
    const v = new THREE.Vector3(r[0] / unit, r[1] / unit, r[2] / unit).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height };
  }

  /** The bodies, for labels: id and name. */
  names(): Array<{ id: string; name: { tr: string; en: string } }> {
    return this.bodies.map(({ id, name }) => ({ id, name }));
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
  }
}
