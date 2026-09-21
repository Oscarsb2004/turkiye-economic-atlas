/**
 * BaseLayer.tsx — the reference layer, which is not an overlay.
 *
 * Every overlay is exclusive: one subject at a time, or the map says two things
 * at once. Place names and roads are not a subject. They are how a reader works
 * out WHERE a railway goes or which end of the country a flow left, so they
 * have to be available under whatever is on screen — which makes them a switch
 * rather than another tab.
 *
 * It is off by default. The atlas's first answer to "what does this show" should
 * be the thing it shows, not a road map with something on it.
 */

import type { Lang } from "./data/bundle";
import { stringsFor } from "./i18n";

interface Props {
  on: boolean;
  onToggle: (on: boolean) => void;
  /** How many places are being drawn right now, once they have loaded. */
  labelled: number | null;
  lang: Lang;
}

export function BaseLayer({ on, onToggle, labelled, lang }: Props) {
  const s = stringsFor(lang);

  return (
    <section className="rail__group">
      <h2 className="rail__heading">{s.basemap}</h2>
      <label className="switch">
        <input
          type="checkbox"
          className="switch__box"
          checked={on}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="switch__name">{s.basemapPlaces}</span>
      </label>
      {on && (
        <p className="notice rail__note">
          {s.basemapNote}
          {labelled !== null && <><br />{s.basemapShown}: {labelled}</>}
        </p>
      )}
    </section>
  );
}
