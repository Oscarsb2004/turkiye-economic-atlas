/**
 * ProvinceMap.tsx — Türkiye's 81 provinces, and nothing it has not been given.
 *
 * The fill is deliberately NEUTRAL here. A province takes a colour only when
 * the reader hovers or selects it, because at T2 there is no published figure
 * to shade it by, and a map that colours provinces before it has data is
 * inventing a story. The data-driven fill arrives with the first overlay
 * (docs/PLAN.md, T4), at which point this layer's paint becomes an expression
 * over the joined value and the legend says what the shades mean.
 *
 * WHY feature-state AND NOT setPaintProperty
 *
 * Hover and selection are per-feature state, not per-layer paint. Setting paint
 * on every mouse move would rebuild the style and repaint 81 polygons; a
 * feature-state expression repaints one. `promoteId` makes the plaka code the
 * feature id, so the state key is the same number everything else joins on.
 */

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import { provinceName } from "../data/bundle";
import type { Flow, Geo, GeoJson, Lang, Marker, NetworkLine, ProvinceProps, Raster } from "../data/bundle";
import type { Shading } from "./shading";
import { fillColour, ink, mapStyle } from "./style";

/** Where the map looks if the geometry cannot say — it always can, in practice. */
const HOME = { center: [35.2, 39.0] as [number, number], zoom: 4.9 };

/**
 * The extent of a published geometry.
 *
 * The opening view is FITTED to the country rather than set to a zoom chosen by
 * hand, because the map pane is not a fixed width: the overlay rail took 220px
 * of it, and a hardcoded zoom cropped the east of the country as soon as it
 * did. Fitting derives the framing from the geometry the atlas actually ships.
 */
function extentOf(geo: GeoJson): [number, number, number, number] | null {
  let west = 180, south = 90, east = -180, north = -90;
  let seen = false;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
      seen = true;
      return;
    }
    for (const child of node) walk(child);
  };
  for (const feature of geo.features) {
    walk((feature.geometry as { coordinates?: unknown }).coordinates);
  }
  return seen ? [west, south, east, north] : null;
}

interface Props {
  geo: Geo;
  lang: Lang;
  selected: number | null;
  onSelect: (code: number | null, props: ProvinceProps | null) => void;
  /**
   * Which colour each province takes, or null when nothing is shaded.
   *
   * A band on the ramp and a categorical class arrive here as the same thing —
   * an index and the colours it points at (map/shading.ts) — so this file does
   * not know whether it is drawing an amount or a winner.
   */
  shading: Shading | null;
  /**
   * Flows to draw between provinces, or none.
   *
   * The overlay decides WHICH flows and how big (overlays/types.ts); the ends
   * are this map's business, because it is the half that holds the geometry.
   */
  flows: Flow[];
  /** Places to draw, sized by their figure: airports today, stations later. */
  markers: Marker[];
  /** Published lines to draw as they are: the railway, and later a corridor. */
  network: NetworkLine[];
  /**
   * [west, south, east, north] to frame, or none for the whole country.
   *
   * An overlay about one city has to be able to say so; leaving the reader
   * over İstanbul when they switch back to a national overlay would be worse.
   */
  focus?: number[];
  /** Imagery to draw beneath the map, from a publisher's own tile service. */
  raster?: Raster;
  /**
   * One line about the province under the cursor, or nothing.
   *
   * The map supplies the name — it holds the geometry that carries it — and
   * the overlay supplies the figure, because only the overlay knows what the
   * reader is asking about (overlays/types.ts).
   */
  hint?: (plaka: number) => string | null;
}

/**
 * The markers, as GeoJSON, sized by AREA rather than by radius.
 *
 * A circle whose radius is proportional to its figure looks like the square of
 * it: İstanbul against Sinop is 1 100 times the passengers, which as a radius
 * is a disc that swallows the country. The square root puts the figure in the
 * area, which is how a reader actually reads a circle.
 *
 * `r` is relative to the largest on screen, so sizes compare within one reading
 * and never across years — the same rule the flow widths follow.
 */
function markersOf(markers: Marker[]): GeoJson {
  // A marker with no figure against it gets r = 0, which the paint draws at its
  // smallest radius: a place, not a quantity (data/bundle.ts, Marker.value).
  const most = Math.max(1, ...markers.map((marker) => marker.value ?? 0));
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature" as const,
      properties: {
        r: marker.value ? Math.sqrt(marker.value / most) : 0,
        label: marker.label,
        value: marker.value ?? null,
      },
      geometry: { type: "Point" as const, coordinates: marker.point },
    })),
  } as GeoJson;
}

/** Published lines, as they were published, each carrying its palette slot. */
function networkOf(lines: NetworkLine[]): GeoJson {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature" as const,
      properties: { tone: line.tone ?? 0 },
      geometry: { type: "LineString" as const, coordinates: line.line },
    })),
  } as GeoJson;
}

/**
 * The arcs, as GeoJSON, between the provinces' own inner points.
 *
 * `points.json` carries a point INSIDE each province, built from the same
 * simplified polygons (scripts/build_geo.mjs), so an arc leaves the province it
 * says it leaves rather than a bounding box's middle — which for Muğla or
 * Hatay is out at sea.
 *
 * A flow whose province has no point is DROPPED rather than drawn from
 * somewhere plausible. `w` is the flow against the largest flow on screen, so
 * the widths compare within one reading and never across years.
 */
function arcsOf(points: GeoJson, flows: Flow[]): GeoJson {
  const at = new Map<number, [number, number]>();
  for (const feature of points.features ?? []) {
    const code = Number((feature.properties as { code?: number } | null)?.code);
    const where = (feature.geometry as { coordinates?: unknown })?.coordinates;
    if (Number.isFinite(code) && Array.isArray(where) && where.length >= 2) {
      at.set(code, [Number(where[0]), Number(where[1])]);
    }
  }
  const most = Math.max(1, ...flows.map((flow) => flow.value));
  return {
    type: "FeatureCollection",
    features: flows.flatMap((flow) => {
      const from = at.get(flow.from);
      const to = at.get(flow.to);
      if (!from || !to) return [];
      return [{
        type: "Feature" as const,
        properties: { w: flow.value / most, tone: flow.tone, value: flow.value },
        geometry: { type: "LineString" as const, coordinates: [from, to] },
      }];
    }),
  } as GeoJson;
}



/**
 * Put data on a source as soon as the source exists, and never wait for "load".
 *
 * THE TRAP, WHICH COST AN HOUR
 *
 * `map.once("load", ...)` sounds like "when the map is ready". It is not: the
 * load event needs a rendered FRAME, and a browser pane that is hidden gives no
 * animation frames at all — `map.loaded()` and `isStyleLoaded()` both stay
 * false indefinitely while the style, the sources and the paint are all fine.
 * Flows and markers queued behind "load" then never appear, silently, on a map
 * that is otherwise drawing correctly (the province shading survived because it
 * listens for `sourcedata` instead).
 *
 * `getSource` answers as soon as the style's sources are registered, which does
 * not need a frame, so the rule is: try now, and retry on `styledata` until it
 * answers. Returns the cleanup for the listener it may have added.
 */
function feedSource(instance: maplibregl.Map, id: string, data: GeoJson): () => void {
  return whenReady(instance, () => {
    const source = instance.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (!source) return false;
    source.setData(data as never);
    return true;
  });
}

/**
 * Do something to the style as soon as the style will take it.
 *
 * `apply` returns whether it managed; if it did not, it is tried again on every
 * `styledata` AND every `sourcedata` until it does. See feedSource for why this
 * is not `once("load")`.
 *
 * THE SECOND TRAP, WHICH LOOKED EXACTLY LIKE THE FIRST
 *
 * `styledata` alone is not enough, and the failure is the same blank-looking
 * map: an unshaded country, a correct legend, correct feature-state, and a
 * clean console. `styledata` STOPS FIRING once the style has settled, so a test
 * that was false when the listener went on — `isStyleLoaded()`, a frame later
 * than it looks — and true a moment afterwards never gets a retry. The pending
 * listener is still attached, waiting for an event that will not come again.
 *
 * Two changes, either of which would have been enough: `sourcedata` keeps
 * firing (which is why the feature-state effect below never had this bug), and
 * the callers now test for the LAYER rather than for a loaded style, because
 * `getLayer` answers as soon as the style is parsed.
 */
function whenReady(instance: maplibregl.Map, apply: () => boolean): () => void {
  if (apply()) return () => undefined;
  const retry = () => {
    if (!apply()) return;
    instance.off("styledata", retry);
    instance.off("sourcedata", retry);
  };
  instance.on("styledata", retry);
  instance.on("sourcedata", retry);
  return () => {
    instance.off("styledata", retry);
    instance.off("sourcedata", retry);
  };
}


export function ProvinceMap({ geo, lang, selected, onSelect, shading, flows, markers, network, focus, raster, hint }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const hovered = useRef<number | null>(null);
  const chosen = useRef<number | null>(null);
  // The map is built once, so its handlers read these rather than their own
  // closure: a new overlay or a new language reaches the cursor without the
  // map being rebuilt under the reader's pan.
  const hinting = useRef<Props["hint"]>(undefined);
  const reading = useRef<Lang>(lang);
  /** What the map is meant to be showing, so a resize can show it again. */
  const framing = useRef<[number, number, number, number] | null>(null);
  /** True once the READER has moved the map. After that the view is theirs. */
  const touched = useRef(false);
  hinting.current = hint;
  reading.current = lang;

  // One effect builds the map; the language and selection effects below only
  // update it. Rebuilding on every prop change would reset the reader's pan.
  useEffect(() => {
    if (!container.current || map.current) return;

    const extent = extentOf(geo.turkiye);
    /** Put the label beside the cursor, and inside the map rather than off it. */
    const place = (at: { x: number; y: number }) => {
      const node = tip.current;
      if (!node) return;
      const box = container.current?.getBoundingClientRect();
      const right = box ? at.x > box.width - node.offsetWidth - 24 : false;
      node.style.left = String(right ? at.x - node.offsetWidth - 14 : at.x + 14) + "px";
      node.style.top = String(at.y + 14) + "px";
    };

    /**
     * What the cursor is over, in words, or nothing.
     *
     * Built with textContent, never innerHTML: the name comes from published
     * geometry and the figure from a published file, and neither is markup.
     */
    const say = (props: ProvinceProps, code: number, at: { x: number; y: number }) => {
      const node = tip.current;
      if (!node) return;
      const line = hinting.current ? hinting.current(code) : null;
      if (line === null) {
        node.hidden = true;
        return;
      }
      node.textContent = "";
      const name = document.createElement("strong");
      name.textContent = provinceName(props, reading.current);
      const figure = document.createElement("span");
      figure.textContent = line;
      node.append(name, figure);
      node.hidden = false;
      place(at);
    };

    const instance = new maplibregl.Map({
      container: container.current,
      ...(extent
        ? { bounds: extent, fitBoundsOptions: { padding: 16 } }
        : { center: HOME.center, zoom: HOME.zoom }),
      attributionControl: false,
      style: mapStyle(geo),
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("mousemove", "provinces-fill", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const code = Number(feature.id);
      if (hovered.current === code) return;
      if (hovered.current !== null) {
        instance.setFeatureState({ source: "provinces", id: hovered.current }, { hover: false });
      }
      hovered.current = code;
      instance.setFeatureState({ source: "provinces", id: code }, { hover: true });
      instance.getCanvas().style.cursor = "pointer";
      say(feature.properties as unknown as ProvinceProps, code, event.point);
    });
    // Moving WITHIN one province still has to carry the label along, and the
    // handler above returns early as soon as the province stops changing.
    instance.on("mousemove", "provinces-fill", (event) => {
      if (tip.current && !tip.current.hidden) place(event.point);
    });
    instance.on("mouseleave", "provinces-fill", () => {
      if (hovered.current !== null) {
        instance.setFeatureState({ source: "provinces", id: hovered.current }, { hover: false });
      }
      hovered.current = null;
      instance.getCanvas().style.cursor = "";
      if (tip.current) tip.current.hidden = true;
    });
    instance.on("click", "provinces-fill", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const code = Number(feature.id);
      onSelect(code, feature.properties as unknown as ProvinceProps);
    });
    // A click on the sea clears the selection, so there is always a way out.
    instance.on("click", (event) => {
      const hits = instance.queryRenderedFeatures(event.point, { layers: ["provinces-fill"] });
      if (hits.length === 0) onSelect(null, null);
    });

    // A map the reader has not moved is the atlas's framing, and it is kept
    // through every change of size. Once they pan or zoom it is theirs, and
    // nothing here moves it again. `originalEvent` is what separates the two:
    // fitBounds raises the same events, without one.
    const byHand = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) touched.current = true;
    };
    instance.on("dragstart", byHand);
    instance.on("zoomstart", byHand);

    /** Show what the map is meant to be showing, at whatever size it now is. */
    const reframe = () => {
      if (touched.current || !framing.current) return;
      instance.fitBounds(framing.current, { padding: 16, duration: 0 });
    };

    // MapLibre sizes its canvas once and does not watch its container, so a
    // pane that changes width leaves the map drawing at the old size — the
    // country slides out of frame without anything erroring. Observing the
    // container keeps the two in step, and resize() also gives the map the
    // paint it needs after a spell where the page was not drawing at all.
    //
    // AND TWO THINGS CHANGE THIS CONTAINER'S SIZE ON PURPOSE
    //
    // Selecting a province opens a 320px panel beside the map and folding the
    // rail gives 174px back, so the map is a different width several times in
    // a reading. Keeping the centre and the zoom through that crops the east of
    // the country off the screen; refitting keeps the whole country in view,
    // which is what an untouched map is for.
    //
    // It also repairs a map built into a container that had NO size yet.
    // `bounds` is turned into a centre and a zoom against the VIEWPORT, and a
    // viewport of 0×0 makes that arithmetic meaningless: the map opens at the
    // centre of the world with the country three pixels across, nothing errors,
    // and no later resize fixes it. In dev the stylesheet arrives after the
    // first render often enough that this is the usual case, not the rare one.
    const observer = new ResizeObserver(() => {
      instance.resize();
      reframe();
    });
    observer.observe(container.current);

    framing.current = extent;
    map.current = instance;
    // A handle for the console while developing, and nothing in a build: the
    // "load never fires in a hidden pane" bug above was invisible without one.
    if (import.meta.env.DEV) (window as unknown as { __map?: unknown }).__map = instance;
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [geo, onSelect]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (chosen.current !== null) {
      instance.setFeatureState({ source: "provinces", id: chosen.current }, { selected: false });
    }
    chosen.current = selected;
    if (selected !== null) {
      instance.setFeatureState({ source: "provinces", id: selected }, { selected: true });
    }
  }, [selected]);

  // The colours arrive with palette.json, after the map is already on screen,
  // and change again when an overlay shades by class instead of by band, so the
  // paint is updated rather than the map rebuilt — rebuilding would throw away
  // the reader's pan and zoom.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !shading || shading.colours.length === 0) return;
    return whenReady(instance, () => {
      if (!instance.getLayer("provinces-fill")) return false;
      instance.setPaintProperty(
        "provinces-fill", "fill-color",
        fillColour(ink("--accent-9", "#0090ff"), ink("--no-figure", "#2a2a2a"), shading.colours),
      );
      return true;
    });
  }, [shading]);

  // Each province's band, as feature-state. Set per feature rather than baked
  // into the source, so changing currency or year repaints without rebuilding
  // the GeoJSON.
  //
  // WAITING FOR THE SOURCE, NOT THE STYLE
  //
  // `isStyleLoaded()` goes true while a GeoJSON source is still parsing, and
  // feature state set before its source has data is dropped without an error.
  // The map then paints every province in the "no figure" colour, which is a
  // plausible-looking map of nothing: shades gone, legend intact, console
  // clean. It survived a first look only because the source happened to win
  // the race that time.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
      // Nothing to shade: the fills go transparent so whatever is under them —
      // the nightlights, İstanbul's lines — is what the reader sees. They stay
      // in the style, so hover, selection and clicking still work.
      instance.setPaintProperty(
        "provinces-fill", "fill-opacity",
        shading ? ["interpolate", ["linear"], ["zoom"], 4, 0.85, 7, 0.95] : 0,
      );
      for (const feature of geo.provinces.features ?? []) {
        const plaka = Number((feature.properties as { code: number }).code);
        const band = shading?.byProvince.get(plaka);
        instance.setFeatureState(
          { source: "provinces", id: plaka },
          // undefined would leave the previous band in place; null is what the
          // expression's coalesce reads as "no figure published".
          { band: band === undefined ? null : band },
        );
      }
    };

    if (instance.isStyleLoaded() && instance.isSourceLoaded("provinces")) {
      apply();
      return;
    }
    const whenReady = () => {
      if (!instance.isStyleLoaded() || !instance.isSourceLoaded("provinces")) return;
      apply();
      instance.off("sourcedata", whenReady);
    };
    instance.on("sourcedata", whenReady);
    return () => {
      instance.off("sourcedata", whenReady);
    };
  }, [shading, geo]);

  // Where the map is looking. An overlay that is about one city says so with a
  // focus; without one the frame is the country, so switching back comes back.
  const framed = useRef<string>("");
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const extent = (focus && focus.length === 4 ? focus : extentOf(geo.turkiye)) as
      [number, number, number, number] | null;
    if (!extent) return;
    const key = extent.join(",");
    if (framed.current === key) return;
    framing.current = extent;
    // The first framing is the one the map was built with; only a CHANGE moves
    // the reader, and never while they are reading the same overlay. An overlay
    // that asks for a different part of the country is asking on the reader's
    // behalf, so it overrides a pan they made under the previous one.
    if (framed.current !== "") {
      touched.current = false;
      instance.fitBounds(extent, { padding: 24, duration: 600 });
    }
    framed.current = key;
  }, [focus, geo]);

  // Imagery under the map. Added and removed rather than kept empty: a raster
  // source with no tiles is not a thing MapLibre will hold, and only one
  // overlay at a time wants one.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return whenReady(instance, () => {
      // The layer the imagery is inserted UNDER has to exist before it can be.
      if (!instance.getLayer("world")) return false;
      const existing = instance.getSource("imagery") as maplibregl.RasterTileSource | undefined;
      if (!raster) {
        if (existing) {
          if (instance.getLayer("imagery")) instance.removeLayer("imagery");
          instance.removeSource("imagery");
        }
        return true;
      }
      if (existing) {
        existing.setTiles([raster.tiles]);
        instance.setPaintProperty("imagery", "raster-opacity", raster.opacity ?? 1);
        return true;
      }
      instance.addSource("imagery", {
        type: "raster",
        tiles: [raster.tiles],
        tileSize: 256,
        maxzoom: raster.maxZoom,
        attribution: raster.attribution,
      });
      // Under everything the atlas draws, over the background: the imagery is
      // the map, and the borders are drawn on top of it.
      instance.addLayer(
        { id: "imagery", type: "raster", source: "imagery",
          paint: { "raster-opacity": raster.opacity ?? 1 } },
        "world",
      );
      return true;
    });
  }, [raster]);

  // The flows for the selected province, and the places an overlay wants drawn.
  // Both go on their source rather than into the style, so drawing them never
  // disturbs the reader's pan or zoom.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "flows", arcsOf(geo.points, flows));
  }, [flows, geo]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "markers", markersOf(markers));
  }, [markers]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "network", networkOf(network));
  }, [network]);

  // The language does not change the map today — province labels arrive with
  // the first overlay — but the effect is here so the map is not rebuilt when
  // it does.
  useEffect(() => void lang, [lang]);

  return (
    <div className="map">
      <div ref={container} className="map__canvas" />
      {/* Filled by the hover handler above rather than by React: a label that
          re-renders the map on every mouse move is a label nobody can
          afford. */}
      <div ref={tip} className="maptip" hidden />
    </div>
  );
}
