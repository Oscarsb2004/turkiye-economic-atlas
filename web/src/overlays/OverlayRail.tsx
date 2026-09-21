/**
 * OverlayRail.tsx — the overlays, down the left, in declared groups.
 *
 * The rail renders whatever list it is handed, grouped by a declared order, so
 * a new overlay appears here by existing. `connections` is declared and empty
 * until T7; an empty group is not drawn, because a heading with nothing under
 * it describes a section the atlas does not have.
 *
 * The active overlay's own controls sit under its button rather than in the
 * title bar: a currency belongs to GDP per capita and a candidate belongs to an
 * election, and neither means anything while the other is on screen.
 *
 * The publisher line is resolved by the caller from meta.json, which the
 * pipeline generates from the source cards. The app holds no publisher names.
 */

import type { Lang } from "../data/bundle";
import { stringsFor, type Strings } from "../i18n";
import { OVERLAY_GROUPS, type Overlay, type OverlayGroup } from "./types";

/** Typed as a total map: a group added without a label fails the build. */
const GROUP_LABEL: Record<OverlayGroup, (s: Strings) => string> = {
  provinces: (s) => s.groupProvinces,
  connections: (s) => s.groupConnections,
  activity: (s) => s.groupActivity,
};

interface Props {
  overlays: Overlay[];
  activeId: string;
  onPick: (id: string) => void;
  /** A source card's publisher, from meta.json. */
  publisher: (source: string) => string;
  lang: Lang;
}

export function OverlayRail({ overlays, activeId, onPick, publisher, lang }: Props) {
  const s = stringsFor(lang);

  return (
    <nav className="rail" aria-label={s.overlay}>
      {OVERLAY_GROUPS.map((group) => {
        const members = overlays.filter((overlay) => overlay.group === group);
        if (members.length === 0) return null;
        return (
          <section className="rail__group" key={group}>
            <h2 className="rail__heading">{GROUP_LABEL[group](s)}</h2>
            {members.map((overlay) => (
              <div key={overlay.id}>
                <button
                  type="button"
                  className={overlay.id === activeId ? "rail__tab rail__tab--on" : "rail__tab"}
                  aria-pressed={overlay.id === activeId}
                  onClick={() => onPick(overlay.id)}
                >
                  <span className="rail__name">{overlay.label}</span>
                  <span className="rail__source">{publisher(overlay.source)}</span>
                </button>
                {overlay.id === activeId && (
                  <div className="rail__controls">{overlay.controls}</div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </nav>
  );
}
