/**
 * App.tsx — the map, the overlay on it, and what is known about a province.
 *
 * TWO OVERLAYS, ONE MAP
 *
 * The map shades provinces by whatever overlay is chosen: TÜİK's GDP per
 * capita, or one candidate's or party's share of the vote in one election. Both
 * go through the same banding, the same ramp and the same legend, so a reader
 * learns one way of reading the map and it keeps working.
 *
 * ONE OPTION AT A TIME, DELIBERATELY
 *
 * An election map is not coloured by winner. The 2023 parliamentary ballot had
 * 29 parties and the validated palette holds five categorical colours, so a
 * winner map would mean inventing 24 more (CLAUDE.md §9). Shading one option's
 * share on a sequential ramp answers "where did they do well" directly, at any
 * number of parties.
 *
 * A province with no published figure is never drawn as zero (CLAUDE.md §10).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  ELECTIONS,
  applyPalette,
  latestFigure,
  loadElection,
  loadGeo,
  loadMeta,
  loadPalette,
  loadPerCapitaGdp,
  provinceName,
  t,
  voteShare,
  type Election,
  type Geo,
  type Lang,
  type Meta,
  type Palette,
  type PerCapitaGdp,
  type ProvinceProps,
} from "./data/bundle";
import { LANGUAGE_NAME, formatInt, formatMoney, formatPercent, initialLang, rememberLang, stringsFor } from "./i18n";
import { Legend } from "./map/Legend";
import { ProvinceMap } from "./map/ProvinceMap";
import { quantileBands } from "./map/bins";

type Overlay = "gdp" | "election";

/** TÜİK's figures for one province, in every currency it publishes. */
function GdpFigures({ gdp, plaka, lang }: { gdp: PerCapitaGdp; plaka: number; lang: Lang }) {
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
            <dt>{currency} · {figure.year}</dt>
            <dd>{formatMoney(figure.value, currency, lang)}</dd>
          </Fragment>
        ))}
      </dl>
      <p className="notice">{s.perCapitaNote}</p>
    </section>
  );
}

/** One province's result: the chosen option's votes and share, and the turnout. */
function ElectionFigures({ election, option, plaka, lang }: {
  election: Election; option: string; plaka: number; lang: Lang;
}) {
  const s = stringsFor(lang);
  const province = election.provinces.find((p) => p.plaka === plaka);
  if (!province) return <p className="notice">{s.noFigures}</p>;
  const share = voteShare(election, plaka, option);

  return (
    <section className="figures">
      <h3 className="figures__label">{option}</h3>
      <dl className="panel__facts">
        <dt>{s.votes}</dt>
        <dd>{formatInt(province.votes[option] ?? 0, lang)}</dd>
        <dt>{s.share}</dt>
        <dd>{share === null ? "—" : formatPercent(share, lang)}</dd>
        <dt>{s.turnoutValid}</dt>
        <dd>{formatInt(province.turnout.valid, lang)}</dd>
        <dt>{s.turnoutRegistered}</dt>
        <dd>{formatInt(province.turnout.registered, lang)}</dd>
      </dl>
      <p className="notice">{s.shareNote}</p>
      {province.provenance === "derived" && <p className="notice">{s.summedNote}</p>}
    </section>
  );
}

export function App() {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [gdp, setGdp] = useState<PerCapitaGdp | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [currency, setCurrency] = useState("TRY");
  const [overlay, setOverlay] = useState<Overlay>("gdp");
  const [electionSlug, setElectionSlug] = useState<string>(ELECTIONS[0].slug);
  const [election, setElection] = useState<Election | null>(null);
  const [option, setOption] = useState<string>("");
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
    loadPalette().then((loaded) => {
      applyPalette(loaded);
      setPalette(loaded);
    }, () => undefined);
  }, []);

  // Elections are fetched when one is asked for: three of them is most of the
  // bundle, and a reader who never opens the overlay never pays for it.
  useEffect(() => {
    let current = true;
    loadElection(electionSlug).then(
      (loaded) => {
        if (!current) return;
        setElection(loaded);
        // The first ballot position, until the reader picks another. Changing
        // election keeps the option only if that option stood in it.
        setOption((chosen) => (loaded.options.some((o) => o.name === chosen) ? chosen : loaded.options[0].name));
      },
      (error: Error) => current && setFailed(error.message),
    );
    return () => { current = false; };
  }, [electionSlug]);

  useEffect(() => {
    document.documentElement.lang = lang;
    rememberLang(lang);
  }, [lang]);

  // The newest year TÜİK publishes for this currency, read from the data
  // rather than assumed: a year is added every December.
  const year = gdp ? (gdp.measure.years[currency] ?? []).slice(-1)[0] ?? "" : "";

  const values = useMemo(() => {
    const found = new Map<number, number | null>();
    if (overlay === "gdp") {
      if (!gdp || !year) return null;
      for (const province of gdp.provinces) {
        found.set(province.plaka, province.per_capita_gdp?.[currency]?.[year] ?? null);
      }
      return found;
    }
    if (!election || !option) return null;
    for (const province of election.provinces) {
      found.set(province.plaka, voteShare(election, province.plaka, option));
    }
    return found;
  }, [overlay, gdp, currency, year, election, option]);

  const binning = useMemo(
    () => (values ? quantileBands(values, palette?.sequential.steps.length ?? 6) : null),
    [values, palette],
  );

  const onSelect = useCallback((code: number | null, props: ProvinceProps | null) => {
    setSelected(code === null || !props ? null : { code, props });
  }, []);

  const legendTitle = overlay === "gdp"
    ? `${s.overlayGdp} · ${currency} · ${year}`
    : `${option} · ${election ? t(election.election.title, lang) : ""}`;
  const formatValue = overlay === "gdp"
    ? (value: number) => formatMoney(value, currency, lang)
    : (value: number) => formatPercent(value, lang);

  return (
    <div className="app">
      <header className="app__bar">
        <div>
          <h1 className="app__title">{s.title}</h1>
          <p className="app__subtitle">{s.subtitle}</p>
        </div>

        <div className="app__controls">
          <label className="control">
            <span className="control__label">{s.overlay}</span>
            <select className="control__select" value={overlay}
                    onChange={(event) => setOverlay(event.target.value as Overlay)}>
              <option value="gdp">{s.overlayGdp}</option>
              <option value="election">{s.overlayElection}</option>
            </select>
          </label>

          {overlay === "gdp" ? (
            <label className="control">
              <span className="control__label">{s.currency}</span>
              <select className="control__select" value={currency}
                      onChange={(event) => setCurrency(event.target.value)}>
                {(gdp?.measure.currencies ?? ["TRY"]).map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="control">
                <span className="control__label">{s.election}</span>
                <select className="control__select" value={electionSlug}
                        onChange={(event) => setElectionSlug(event.target.value)}>
                  {ELECTIONS.map((entry) => (
                    <option key={entry.slug} value={entry.slug}>{entry.slug}</option>
                  ))}
                </select>
              </label>
              <label className="control">
                <span className="control__label">{s.option}</span>
                <select className="control__select" value={option}
                        onChange={(event) => setOption(event.target.value)}>
                  {(election?.options ?? []).map((entry) => (
                    <option key={entry.column} value={entry.name}>{entry.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        <div className="app__langs" role="group" aria-label="Language">
          {(["tr", "en"] as const).map((code) => (
            <button key={code} type="button"
                    className={code === lang ? "lang lang--on" : "lang"}
                    aria-pressed={code === lang}
                    onClick={() => setLang(code)}>
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
            <>
              <ProvinceMap
                geo={geo}
                lang={lang}
                selected={selected?.code ?? null}
                onSelect={onSelect}
                binning={binning}
                ramp={palette?.sequential.steps ?? []}
              />
              {binning && palette && (
                <Legend
                  binning={binning}
                  ramp={palette.sequential.steps}
                  title={legendTitle}
                  format={formatValue}
                  lang={lang}
                />
              )}
            </>
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
              {overlay === "gdp"
                ? (gdp ? <GdpFigures gdp={gdp} plaka={selected.code} lang={lang} />
                       : <p className="notice">{s.loading}</p>)
                : (election && option
                    ? <ElectionFigures election={election} option={option} plaka={selected.code} lang={lang} />
                    : <p className="notice">{s.loading}</p>)}
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
