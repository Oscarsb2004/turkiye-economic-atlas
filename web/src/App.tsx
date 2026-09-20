/**
 * App.tsx — the map, the reader's language, and what is known about a province.
 *
 * Small on purpose. At T2 the atlas has geometry and nothing else, so the panel
 * says so rather than showing an empty chart frame: a province with no
 * published figure is not a province with a figure of zero (CLAUDE.md §10).
 */

import { Fragment, useCallback, useEffect, useState } from "react";

import {
  latestFigure,
  loadGeo,
  loadMeta,
  loadPalette,
  loadPerCapitaGdp,
  applyPalette,
  provinceName,
  t,
  type Geo,
  type Lang,
  type Meta,
  type PerCapitaGdp,
  type ProvinceProps,
} from "./data/bundle";
import { LANGUAGE_NAME, formatInt, formatMoney, initialLang, rememberLang, stringsFor } from "./i18n";
import { ProvinceMap } from "./map/ProvinceMap";

/**
 * What a province's figures say, or that there are none.
 *
 * A province with no published figure gets a sentence saying so. It is never
 * rendered as zero, and never left blank (CLAUDE.md §10).
 */
function Figures({ gdp, plaka, lang }: { gdp: PerCapitaGdp; plaka: number; lang: Lang }) {
  const s = stringsFor(lang);
  const rows = gdp.measure.currencies
    .map((currency) => ({ currency, figure: latestFigure(gdp, plaka, currency) }))
    .filter((row): row is { currency: string; figure: { year: string; value: number } } => row.figure !== null);

  if (rows.length === 0) return <p className="notice">{s.noFigures}</p>;

  return (
    <section className="figures">
      <h3 className="figures__label">{t(gdp.measure.label, lang)}</h3>
      <dl className="panel__facts">
        {rows.map(({ currency, figure }) => (
          <Fragment key={currency}>
            <dt>
              {currency} · {figure.year}
            </dt>
            <dd>{formatMoney(figure.value, currency, lang)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="notice">{s.perCapitaNote}</p>
    </section>
  );
}

export function App() {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [gdp, setGdp] = useState<PerCapitaGdp | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [selected, setSelected] = useState<{ code: number; props: ProvinceProps } | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    loadGeo().then(setGeo, (error: Error) => setFailed(error.message));
    // The map is usable before the figures arrive, so a slow bundle does not
    // hold up the geometry; a province simply has nothing to show until it does.
    loadPerCapitaGdp().then(setGdp, (error: Error) => setFailed(error.message));
    loadMeta().then(setMeta, () => undefined);
    // The palette is data, not chrome: read it rather than keeping a second,
    // unvalidated copy of its colours in CSS.
    loadPalette().then(applyPalette, () => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    rememberLang(lang);
  }, [lang]);

  const onSelect = useCallback((code: number | null, props: ProvinceProps | null) => {
    setSelected(code === null || !props ? null : { code, props });
  }, []);

  return (
    <div className="app">
      <header className="app__bar">
        <div>
          <h1 className="app__title">{s.title}</h1>
          <p className="app__subtitle">{s.subtitle}</p>
        </div>
        <div className="app__langs" role="group" aria-label="Language">
          {(["tr", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={code === lang ? "lang lang--on" : "lang"}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
            >
              {LANGUAGE_NAME[code]}
            </button>
          ))}
        </div>
      </header>

      <main className="app__body">
        <section className="app__map">
          {failed ? (
            <p className="notice notice--bad">{s.failed}: {failed}</p>
          ) : geo ? (
            <ProvinceMap geo={geo} lang={lang} selected={selected?.code ?? null} onSelect={onSelect} />
          ) : (
            <p className="notice">{s.loading}</p>
          )}
        </section>

        <aside className="app__panel">
          {selected ? (
            <>
              <h2 className="panel__name">{provinceName(selected.props, lang)}</h2>
              <dl className="panel__facts">
                <dt>{s.plaka}</dt>
                <dd>{formatInt(selected.code, lang)}</dd>
              </dl>
              {gdp ? <Figures gdp={gdp} plaka={selected.code} lang={lang} /> : <p className="notice">{s.loading}</p>}
            </>
          ) : (
            <p className="notice">{s.noSelection}</p>
          )}
          <footer className="panel__sources">
            <h3>{s.sources}</h3>
            <p>{s.geometrySource}</p>
            {meta
              ? Object.values(meta.sources).map((source) => (
                  <p key={source.page}>
                    {source.publisher} — {meta.licences[source.licence]?.name ?? source.licence}
                  </p>
                ))
              : <p>{s.dataComingSoon}</p>}
          </footer>
        </aside>
      </main>
    </div>
  );
}
