/**
 * App.tsx — the map, the reader's language, and what is known about a province.
 *
 * Small on purpose. At T2 the atlas has geometry and nothing else, so the panel
 * says so rather than showing an empty chart frame: a province with no
 * published figure is not a province with a figure of zero (CLAUDE.md §10).
 */

import { useCallback, useEffect, useState } from "react";

import { loadGeo, provinceName, type Geo, type Lang, type ProvinceProps } from "./data/bundle";
import { LANGUAGE_NAME, formatInt, initialLang, rememberLang, stringsFor } from "./i18n";
import { ProvinceMap } from "./map/ProvinceMap";

export function App() {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [selected, setSelected] = useState<{ code: number; props: ProvinceProps } | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    loadGeo().then(setGeo, (error: Error) => setFailed(error.message));
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
              <p className="notice">{s.noFigures}</p>
            </>
          ) : (
            <p className="notice">{s.noSelection}</p>
          )}
          <footer className="panel__sources">
            <h3>{s.sources}</h3>
            <p>{s.geometrySource}</p>
            <p>{s.dataComingSoon}</p>
          </footer>
        </aside>
      </main>
    </div>
  );
}
