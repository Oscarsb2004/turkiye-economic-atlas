/**
 * Cosmos.tsx — past the globe: the Moon, the planets, the stars, the galaxies.
 *
 * TETHERED, THEN FREE
 *
 * The owner's words: for a while the view should centre on the Earth, and then
 * the reader should be able to explore as an untethered viewer. So there are
 * two ways the camera moves, and the switch between them is a distance:
 *
 *   TETHERED, out to 200 AU — past Pluto, the whole of the planets. The camera
 *   orbits the Earth: drag turns it around the planet, scroll moves it nearer
 *   or further. The Earth is always in the middle of the screen, which is
 *   what "centred on the Earth" means.
 *
 *   FREE, beyond. The camera is let go where it is, still facing home. Drag
 *   turns the view; scroll moves along it; W A S D Q E fly. Every step is a
 *   fraction of the distance from home, so a scroll crosses the solar system,
 *   the stars and the galaxies at the same pace — the only way a range of
 *   10^19 fits under one wheel.
 *
 * "Back to Earth" flies home and re-tethers. Scroll back in past where the
 * globe was and the map returns, looking at the same place it was left from.
 *
 * THE HAND-OFF
 *
 * The map is left at its widest zoom, where MapLibre draws the globe with a
 * radius of 512·2^zoom / 2π pixels. The camera here starts at the distance at
 * which a sphere of the Earth's radius has that same radius on screen, looking
 * down on the same longitude and latitude, north up — so zooming out of the map
 * lands on the same planet the same size, and not on a jump cut.
 */

import * as THREE from "three";
import { useEffect, useRef, useState } from "react";

import { loadCosmos, loadNightlights, tilesFor, type Cosmos as CosmosData, type Lang } from "../data/bundle";
import { stringsFor } from "../i18n";
import { nightEarth } from "./earthTexture";
import { CosmosScene, FOV, type Vec } from "./scene";
import { AU_KM, MPC_KM, PC_KM, describeDistance, gmstDegrees, megaparsecsFromVelocity, toScene } from "./units";

/** Where the camera stops being tethered to the Earth. */
const TETHER_KM = 200 * AU_KM;

/** How fast a wheel notch moves the camera: a fraction of the distance home. */
const WHEEL = 0.0012;

/**
 * How far out the camera may go, as a multiple of the farthest galaxy drawn.
 *
 * Past the catalogue's own reach there is nothing drawn, and with nothing to
 * stop it the wheel took the camera to 22 billion light-years, where 43 507
 * galaxies were one small ball. Three times the survey's radius keeps the
 * whole of it in view and no emptier than that.
 */
const REACH = 3;

/**
 * Which labels win when two would overlap, and how close is overlapping.
 *
 * Seen from out past Neptune the inner planets are a knot at the centre, and
 * five names on top of each other read as none. Home first, then the Sun, then
 * the planets from the outside in, because the outer ones are the ones still
 * apart on screen.
 */
const LABEL_ORDER = ["399", "10", "999", "899", "799", "699", "599", "499", "299", "199", "301"];
const LABEL_APART = 34;

export interface Arrival {
  lon: number;
  lat: number;
  /** The globe's radius on screen, in CSS pixels, when the map was left. */
  radiusPx: number;
  /** The map's height when it was left, which that radius was measured in. */
  heightPx: number;
}

interface Props {
  lang: Lang;
  arrival: Arrival;
  /** Tile URL ({z}/{y}/{x}) for the Earth's night texture; Black Marble 2016 if absent. */
  earthTiles?: string;
  /** Back to the map, looking at this longitude and latitude. */
  onReturn: (lon: number, lat: number) => void;
  /** Who published what is drawn, resolved from meta.json by the caller. */
  credit: string;
}

type Mode = "tethered" | "free";

const up = new THREE.Vector3(0, 1, 0);

/** Earth-fixed longitude and latitude as a scene direction, on the epoch. */
function directionOf(lon: number, lat: number, gmst: number): THREE.Vector3 {
  const lambda = (lon * Math.PI) / 180 + gmst;
  const phi = (lat * Math.PI) / 180;
  const [x, y, z] = toScene(Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi));
  return new THREE.Vector3(x, y, z).normalize();
}

/** A scene direction back to Earth-fixed longitude and latitude. */
function lonLatOf(direction: THREE.Vector3, gmst: number): [number, number] {
  // Scene (x, y, z) is ICRF (x, -z, y).
  const x = direction.x, y = -direction.z, z = direction.y;
  const lat = Math.asin(THREE.MathUtils.clamp(z, -1, 1)) * (180 / Math.PI);
  let lon = (Math.atan2(y, x) - gmst) * (180 / Math.PI);
  lon = ((lon + 540) % 360) - 180;
  return [lon, lat];
}

/** The camera orientation that looks from `eye` at `target`, north up. */
function lookAt(eye: THREE.Vector3, target: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(eye, target, Math.abs(eye.clone().sub(target).normalize().dot(up)) > 0.999
    ? new THREE.Vector3(0, 0, 1) : up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

export default function Cosmos({ lang, arrival, earthTiles, onReturn, credit }: Props) {
  const s = stringsFor(lang);
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CosmosData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [hud, setHud] = useState({ km: 0, mode: "tethered" as Mode });
  const returning = useRef(onReturn);
  returning.current = onReturn;
  const home = useRef<() => void>(() => undefined);

  useEffect(() => {
    loadCosmos().then(setData, (error: Error) => setFailed(error.message));
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const box = holder.current;
    if (!data || !element || !box) return;

    const scene = new CosmosScene(element, data);
    const earth = new THREE.Vector3(...scene.earth);
    const radius = scene.earthRadius;
    const gmst = gmstDegrees(new Date(`${data.solarSystem.epoch}T00:00:00Z`)) * (Math.PI / 180);

    // The night texture, from the same NASA tiles the map was showing.
    const tiles = earthTiles
      ? Promise.resolve(earthTiles)
      : loadNightlights().then((night) => tilesFor(night.black_marble, "2016-01-01"));
    tiles.then(nightEarth).then((texture) => scene.setEarthTexture(texture), () => undefined);

    // ── The camera ──────────────────────────────────────────────────────────
    // The focal length in the MAP's pixels, not this element's: this element
    // can still be mid-layout when the scene is built (it measured 27 px on
    // the first try, which put the camera 326 km above the ground), and the
    // radius being matched was measured in the map's height anyway.
    const focal = (arrival.heightPx / 2) / Math.tan((FOV / 2) * (Math.PI / 180));
    /** The distance at which the Earth has `px` pixels of radius on screen. */
    const distanceFor = (px: number) => radius * Math.sqrt(1 + (focal / Math.max(px, 1)) ** 2);
    const handoff = distanceFor(arrival.radiusPx);
    const farthest = Math.max(...data.galaxies.galaxies.map((row) => row[3]));
    const reach = REACH * megaparsecsFromVelocity(farthest, data.h0) * MPC_KM;
    /** Keep the eye within reach of home, along the line it is already on. */
    const withinReach = () => {
      const out = eye.clone().sub(earth);
      if (out.length() > reach) eye.copy(earth).addScaledVector(out.normalize(), reach);
    };

    let mode: Mode = "tethered";
    const direction = directionOf(arrival.lon, arrival.lat, gmst);   // Earth -> eye
    let distance = handoff;
    const eye = new THREE.Vector3();
    const orientation = new THREE.Quaternion();
    const tether = () => {
      eye.copy(earth).addScaledVector(direction, distance);
      orientation.copy(lookAt(eye, earth));
    };
    tether();

    let flight: { from: THREE.Vector3; fromQ: THREE.Quaternion; start: number } | null = null;
    home.current = () => {
      flight = { from: eye.clone(), fromQ: orientation.clone(), start: performance.now() };
    };

    const leave = () => {
      const [lon, lat] = lonLatOf(eye.clone().sub(earth).normalize(), gmst);
      returning.current(lon, lat);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (flight) return;
      const factor = Math.exp(event.deltaY * WHEEL * (event.shiftKey ? 0.2 : 1));
      if (mode === "tethered") {
        distance *= factor;
        if (distance < handoff * 0.92) {
          leave();
          return;
        }
        if (distance > TETHER_KM) mode = "free";
        tether();
      } else {
        // Along the view, by a fraction of the distance home.
        const step = eye.distanceTo(earth) * (factor - 1);
        eye.add(new THREE.Vector3(0, 0, 1).applyQuaternion(orientation).multiplyScalar(step));
        withinReach();
        if (eye.distanceTo(earth) < TETHER_KM * 0.5) {
          // Near enough home to be caught again, facing it.
          mode = "tethered";
          direction.copy(eye.clone().sub(earth).normalize());
          distance = eye.distanceTo(earth);
          tether();
        }
      }
    };

    let dragging: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      dragging = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging || flight) return;
      const dx = (event.clientX - dragging.x) * 0.005;
      const dy = (event.clientY - dragging.y) * 0.005;
      dragging = { x: event.clientX, y: event.clientY };
      if (mode === "tethered") {
        // Round the Earth: east-west about the pole, north-south about the
        // camera's own right, stopping short of going over a pole.
        direction.applyAxisAngle(up, -dx);
        const right = new THREE.Vector3().crossVectors(up, direction).normalize();
        const turned = direction.clone().applyAxisAngle(right, -dy);
        if (Math.abs(turned.dot(up)) < 0.985) direction.copy(turned);
        tether();
      } else {
        // In space there is no up: turn about the view's own axes.
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx);
        const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -dy);
        orientation.multiply(yaw).multiply(pitch).normalize();
      }
    };
    const onUp = (event: PointerEvent) => {
      dragging = null;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };

    const keys = new Set<string>();
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!"wasdqe".includes(key) || key.length !== 1) return;
      if (event.type === "keydown") keys.add(key); else keys.delete(key);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const resize = () => scene.setSize(box.clientWidth, box.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    resize();

    // ── The frame loop ──────────────────────────────────────────────────────
    let last = performance.now();
    let hudAt = 0;
    let frame = 0;
    const names = scene.names();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (flight) {
        // Home in log-distance, so the long way back takes the same time as
        // the short one and the stars do not blur past in the last frame.
        const t = Math.min((now - flight.start) / 2500, 1);
        const ease = t * t * (3 - 2 * t);
        const fromDir = flight.from.clone().sub(earth);
        const fromDistance = fromDir.length();
        const target = handoff * 1.4;
        const d = Math.exp(Math.log(fromDistance) + (Math.log(target) - Math.log(fromDistance)) * ease);
        eye.copy(earth).addScaledVector(fromDir.normalize(), d);
        orientation.copy(flight.fromQ).slerp(lookAt(eye, earth), Math.min(1, ease * 1.5));
        if (t >= 1) {
          flight = null;
          mode = "tethered";
          direction.copy(eye.clone().sub(earth).normalize());
          distance = d;
          tether();
        }
      } else if (mode === "free" && keys.size) {
        const speed = eye.distanceTo(earth) * 0.6 * dt;
        const move = new THREE.Vector3(
          (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0),
          (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0),
          (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0),
        ).applyQuaternion(orientation).multiplyScalar(speed);
        eye.add(move);
        withinReach();
      }

      const eyeVec: Vec = [eye.x, eye.y, eye.z];
      scene.render(eyeVec, orientation);

      // Labels for the bodies, only while the solar system is the subject,
      // and never two on top of each other (LABEL_ORDER).
      const layer = labels.current;
      if (layer) {
        const width = box.clientWidth, height = box.clientHeight;
        const far = eye.length() > 3000 * AU_KM;
        const placed: Array<{ x: number; y: number }> = [];
        for (const id of LABEL_ORDER) {
          const index = names.findIndex((entry) => entry.id === id);
          const node = layer.children[index] as HTMLElement | undefined;
          if (!node || index < 0) continue;
          const at = far ? null : scene.project(id, eyeVec, width, height);
          // The Earth is not labelled while it fills the view: the map
          // already said what it is.
          const hide = !at || (id === "399" && eye.distanceTo(earth) < 40 * radius)
            || (id === "301" && eye.distanceTo(earth) > 5 * AU_KM)
            || placed.some((p) => Math.abs(p.x - at.x) < LABEL_APART * 2 && Math.abs(p.y - at.y) < 14);
          node.style.display = hide ? "none" : "block";
          if (at && !hide) {
            placed.push(at);
            node.style.transform = `translate(${at.x + 8}px, ${at.y - 7}px)`;
          }
          const name = names[index].name;
          node.textContent = lang === "en" ? name.en : name.tr;
        }
      }
      if (now - hudAt > 120) {
        hudAt = now;
        setHud({ km: eye.distanceTo(earth), mode });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      scene.dispose();
    };
    // `arrival` and `earthTiles` are where the scene STARTS; a later change
    // to either must not rebuild it under the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const pc = hud.km / PC_KM;
  const where = hud.km < 2_000_000 ? s.cosmosEarthMoon
    : hud.km < 200 * AU_KM ? s.cosmosSolarSystem
      : pc < 0.5 ? s.cosmosBeyondPlanets
        : pc < 2_000 ? s.cosmosStars
          : pc < 1e6 ? s.cosmosMilkyWay
            : s.cosmosGalaxies;

  return (
    <div className="cosmos" ref={holder}>
      <canvas ref={canvas} className="cosmos__canvas" />
      <div ref={labels} className="cosmos__labels" aria-hidden="true">
        {Array.from({ length: 11 }, (_, i) => <span key={i} className="cosmos__label" />)}
      </div>
      <div className="cosmos__hud">
        <p className="cosmos__title">{s.cosmosTitle}</p>
        <p className="cosmos__distance">{describeDistance(hud.km, lang)} <span>{s.cosmosFromEarth}</span></p>
        <p className="cosmos__where">{where}</p>
        {failed && <p className="notice notice--bad">{s.failed}: {failed}</p>}
        {!data && !failed && <p className="notice">{s.loading}</p>}
      </div>
      <div className="cosmos__actions">
        <button type="button" className="rail__fold" onClick={() => home.current()}>{s.cosmosHome}</button>
        <button type="button" className="rail__fold" onClick={() => onReturn(arrival.lon, arrival.lat)}>
          {s.cosmosMap}
        </button>
      </div>
      <p className="cosmos__hint">{hud.mode === "tethered" ? s.cosmosHintTethered : s.cosmosHintFree}</p>
      <p className="cosmos__credit">{credit}</p>
    </div>
  );
}
