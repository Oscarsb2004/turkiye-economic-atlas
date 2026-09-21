/**
 * Sources.tsx — who published what, folded away until it is asked for.
 *
 * WHY IT IS NOT IN THE PROVINCE PANEL ANY MORE
 *
 * It used to sit under whatever the reader had selected, which put it behind a
 * click on the map: no province, no credits. Attribution that appears only
 * sometimes is not attribution. It lives at the foot of the overlay rail now,
 * where it is always present — and folded, because it is a claim about where
 * the atlas got its figures, not something to read every time.
 *
 * ONE LINE PER PUBLISHER AND LICENCE, NOT PER SOURCE CARD
 *
 * TÜİK's GDP bulletin and its migration portal are two sources under one name
 * and one set of terms, and saying so twice reads as a bug. Every card is still
 * represented — the line is just shared.
 */

import type { Lang, Meta } from "./data/bundle";
import { stringsFor } from "./i18n";

interface Props {
  meta: Meta | null;
  lang: Lang;
}

export function Sources({ meta, lang }: Props) {
  const s = stringsFor(lang);
  const named = meta
    ? [...new Map(Object.values(meta.sources).map((source) => [
        `${source.publisher}|${source.licence}`, source,
      ])).values()]
    : [];

  return (
    <details className="sources">
      <summary className="sources__title">
        {s.sources}
        {named.length > 0 && <span className="sources__count">{named.length}</span>}
      </summary>
      <p>{s.geometrySource}</p>
      {meta
        ? named.map((source) => (
            <p key={`${source.publisher}|${source.licence}`}>
              {source.publisher} — {meta.licences[source.licence]?.name ?? source.licence}
            </p>
          ))
        : <p>{s.dataComingSoon}</p>}
    </details>
  );
}
