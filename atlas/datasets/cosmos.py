"""
atlas.datasets.cosmos — where the atlas lies, from the Earth outwards.

    python -m atlas.run cosmos

WHAT THIS IS FOR

The atlas is a globe, and past the globe the owner asked for the rest of it:
zoom out from Türkiye to the Earth, the Moon and the planets, the stars around
the Sun, and the galaxies around the Milky Way. Every one of those is drawn
from a NASA-published dataset, and none of it is invented to fill a gap.

    solar-system.json  the Sun, the planets, Pluto and the Moon, where JPL's
                       Horizons puts them on one date, with one orbit each
                       sampled from Horizons as well — published positions,
                       not an ellipse this project computed
    stars.json         the new reduction of Hipparcos (van Leeuwen 2007), as
                       HEASARC serves it: every star whose parallax is known to
                       better than 10%
    galaxies.json      the 2MASS Redshift Survey (Huchra et al. 2012), as
                       HEASARC serves it: every galaxy receding from us
    milky-way.jpg      the diffuse light of the Milky Way from NASA's Deep Star
                       Maps 2020 — the glow of the stars no catalogue resolves

WHAT IS OURS, AND SAYS SO

A distance from a parallax (1000 / parallax in mas = parsecs) and a distance
from a recession velocity (velocity / H0) are arithmetic, stated in the file
beside the rows. The rows themselves are the catalogues' own columns, so the
app does the arithmetic and a reader can redo it. H0 is WMAP's nine-year value,
stated with its reference, because a distance scale needs one and NASA's own
cosmology mission is the NASA source for it.

Both rules have known limits, and the file says them: 1/parallax is biased as
errors grow, which is why the cut is 10%; and velocity / H0 misplaces the
nearest galaxies, whose own motion is a large fraction of their recession.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from urllib.parse import urlencode

from atlas.core import clock
from atlas.core import registry as R
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import heasarc

log = logging.getLogger(__name__)

OUT = R.DATA_DIR / "cosmos"

HEASARC_KEY = "nasa_heasarc"
HORIZONS_KEY = "jpl_horizons"
SVS_KEY = "nasa_svs"

# ── Stars ─────────────────────────────────────────────────────────────────────

#: Every star with a positive parallax known to better than 10%. At 20% the
#: count doubles (60 186) and so does the bias of 1/parallax as a distance; 10%
#: is where the distance is honest enough to draw a star in 3D at it.
STAR_QUERY = (
    "SELECT hip_number, ra, dec, parallax, parallax_error, hip_mag, bv_color "
    "FROM hipnewcat WHERE parallax > 0 AND parallax_error < 0.1 * parallax"
)

# ── Galaxies ──────────────────────────────────────────────────────────────────

#: Every 2MRS galaxy receding from us. A negative velocity is a galaxy falling
#: towards the Local Group — real, but with no Hubble-law distance at all.
GALAXY_QUERY = (
    "SELECT name, ra, dec, radial_velocity, ks_mag_0_tot "
    "FROM twomassrsc WHERE radial_velocity > 0"
)

#: Decimal places a direction is published to. 0.001° is 6 kpc at 100 Mpc and
#: 0.01 pc at 600 pc — below a pixel at every distance either catalogue is
#: drawn from — and each further digit was 43 507 more characters in the file.
DIRECTION_DP = 3

#: WMAP nine-year H0, km/s/Mpc, as NASA's LAMBDA archive publishes it for the
#: ΛCDM model fitted to WMAP9 data alone: "H0 70.0 ± 2.2 km/s/Mpc" in
#: lambda.gsfc.nasa.gov/product/wmap/dr5/params/lcdm_wmap9.pdf (read 2026-09-24).
#: The one number here that is not a catalogue's column, which is why it
#: carries where it was read.
H0 = 70.0
H0_SOURCE = ("WMAP nine-year, ΛCDM fitted to WMAP9 alone, 70.0 ± 2.2 km/s/Mpc: "
             "lambda.gsfc.nasa.gov/product/wmap/dr5/params/lcdm_wmap9.pdf")

# ── The solar system ──────────────────────────────────────────────────────────

HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"

#: (Horizons id, Turkish name, English name, days one orbit is sampled over).
#: The span is a sampling choice, rounded UP from each body's sidereal period —
#: a little more than one orbit closes the ring, and it is not a figure the
#: atlas publishes. The Moon's orbit is sampled about the Earth, the rest about
#: the solar system's barycentre.
#:
#: Each orbit is sampled CENTRED on the epoch, half a span either side, rather
#: than forward from it: Horizons' Pluto ephemeris stops at 2199, and a Pluto
#: orbit forward from 2026 would need 2274. Centred, the middle sample is the
#: epoch itself, so it is also the position.
BODIES = (
    ("10", "Güneş", "Sun", 0),
    ("199", "Merkür", "Mercury", 89),
    ("299", "Venüs", "Venus", 226),
    ("399", "Dünya", "Earth", 366),
    ("499", "Mars", "Mars", 688),
    ("599", "Jüpiter", "Jupiter", 4333),
    ("699", "Satürn", "Saturn", 10760),
    ("799", "Uranüs", "Uranus", 30690),
    ("899", "Neptün", "Neptune", 60190),
    ("999", "Plüton", "Pluto", 90560),
    ("301", "Ay", "Moon", 28),
)

#: How many intervals each orbit is sampled in.
ORBIT_STEPS = 180

#: Where each body's position is measured from. Everything is the solar
#: system's barycentre except the Moon, which is the Earth.
CENTRE = {"301": "500@399"}
BARYCENTRE = "500@0"

#: A mean radius as Horizons writes it in a body's header. The wording varies
#: by body — "Vol. Mean Radius (km)", "Mean radius (km)", "Vol. mean radius, km"
#: — so the pattern takes all three, and a body where it matches nothing is
#: refused rather than drawn at an invented size.
RADIUS = re.compile(r"(?:vol\.\s*)?mean\s+radius,?\s*\(?km\)?\s*=\s*([\d.]+)", re.I)


def _horizons(ctx: Context, **params: str) -> str:
    """One Horizons request, as text, refused if Horizons reports an error."""
    query = {"format": "json", **{k: f"'{v}'" for k, v in params.items()}}
    answer = ctx.fetch.json(f"{HORIZONS}?{urlencode(query)}")
    if "error" in answer:
        raise ValueError(f"Horizons refused {params.get('COMMAND')}: {answer['error']}")
    return str(answer["result"])


def _vectors(text: str) -> list[list[float]]:
    """The x, y, z of every row between $$SOE and $$EOE, in kilometres."""
    try:
        block = text[text.index("$$SOE") + 5:text.index("$$EOE")]
    except ValueError:
        raise ValueError(f"Horizons answered without an ephemeris: {text[:300]!r}") from None
    rows = []
    for line in block.strip().splitlines():
        cells = [cell.strip() for cell in line.split(",")]
        rows.append([round(float(cells[2]), 1), round(float(cells[3]), 1), round(float(cells[4]), 1)])
    if not rows:
        raise ValueError("Horizons answered with an empty ephemeris")
    return rows


def build_solar_system(ctx: Context, *, dataset: str, epoch: str) -> Built:
    """The Sun, the planets, Pluto and the Moon on one date, and an orbit each."""
    src = R.source(HORIZONS_KEY)
    retrieved = clock.now_iso()
    start = date.fromisoformat(epoch)

    bodies = []
    for ident, name_tr, name_en, span in BODIES:
        centre = CENTRE.get(ident, BARYCENTRE)
        half = timedelta(days=-(-span // 2))          # half the span, rounded up
        first, last = (start - half, start + half) if span else (start, start + timedelta(days=1))
        text = _horizons(
            ctx, COMMAND=ident, OBJ_DATA="YES", MAKE_EPHEM="YES", EPHEM_TYPE="VECTORS",
            CENTER=centre, START_TIME=first.isoformat(), STOP_TIME=last.isoformat(),
            STEP_SIZE=str(ORBIT_STEPS if span else 1), REF_PLANE="FRAME", VEC_TABLE="1",
            OUT_UNITS="KM-S", CSV_FORMAT="YES",
        )
        found = RADIUS.search(text)
        if not found:
            raise ValueError(f"Horizons' header for {name_en} ({ident}) states no mean radius this "
                             f"reader recognises; a body is not drawn at an invented size")
        vectors = _vectors(text)
        bodies.append({
            "id": ident,
            "name": {"tr": name_tr, "en": name_en},
            "radius_km": float(found.group(1)),
            "centre": centre,
            # Where it is on the epoch — the middle sample of a centred orbit,
            # or the only one for the Sun — and the orbit around it.
            "position_km": vectors[ORBIT_STEPS // 2] if span else vectors[0],
            "orbit_km": vectors if span else [],
        })

    payload = {
        "generated_at": retrieved,
        "epoch": epoch,
        "frame": {
            "axes": "ICRF — the equatorial frame of J2000, the same axes as the star and galaxy catalogues",
            "origin": "the solar system's barycentre, except the Moon, which is geocentric",
            "unit": "km",
        },
        "orbits": {
            "provenance": Provenance.OFFICIAL_DATASET.value,
            "rule": (f"{ORBIT_STEPS} positions Horizons publishes over a little more than one sidereal "
                     f"period from the epoch; the line through them is the orbit"),
        },
        "bodies": bodies,
        "sources": [SourceRef(url=src["page"], retrieved_at=retrieved,
                              provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict()],
    }
    log.info("solar system: %d bodies on %s, orbits of %d positions each", len(bodies), epoch, ORBIT_STEPS + 1)
    return Built(outputs=[(OUT / "solar-system.json", payload)],
                 receipt={"epoch": epoch, "bodies": [b["id"] for b in bodies]})


def _tap(ctx: Context, adql: str) -> list[dict]:
    """One HEASARC TAP query, through the cache, decoded."""
    url = f"{heasarc.ENDPOINT}?{urlencode(heasarc.query_params(adql))}"
    _, rows = heasarc.rows(ctx.fetch.bytes(url, force=ctx.refresh))
    return rows


def build_stars(ctx: Context, *, dataset: str) -> Built:
    """Every Hipparcos star whose parallax is known to better than 10%."""
    src = R.source(HEASARC_KEY)
    retrieved = clock.now_iso()
    rows = _tap(ctx, STAR_QUERY)
    stars = sorted(
        [int(r["hip_number"]), round(r["ra"], DIRECTION_DP), round(r["dec"], DIRECTION_DP),
         round(r["parallax"], 3),
         None if r["hip_mag"] is None else round(r["hip_mag"], 2),
         None if r["bv_color"] is None else round(r["bv_color"], 3)]
        for r in rows
    )
    payload = {
        "generated_at": retrieved,
        "catalogue": {
            "table": "hipnewcat",
            "title": "Hipparcos, the New Reduction (van Leeuwen 2007)",
            "query": STAR_QUERY,
            "selection": {"provenance": Provenance.DERIVED.value,
                          "rule": "parallax > 0 and its formal error < 10% of it"},
            "distance": {"provenance": Provenance.DERIVED.value,
                         "formula": "parsecs = 1000 / parallax in milliarcseconds",
                         "caution": "1/parallax is biased as the error grows, which is why the cut is 10%"},
        },
        "columns": ["hip", "ra_deg", "dec_deg", "parallax_mas", "hip_mag", "b_v"],
        "stars": stars,
        "sources": [SourceRef(url=src["page"], retrieved_at=retrieved,
                              provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict()],
    }
    log.info("stars: %d from hipnewcat, nearest %.2f pc, farthest %.0f pc",
             len(stars), 1000 / max(s[3] for s in stars), 1000 / min(s[3] for s in stars))
    return Built(outputs=[(OUT / "stars.json", payload)], receipt={"stars": len(stars)})


def build_galaxies(ctx: Context, *, dataset: str) -> Built:
    """Every 2MASS Redshift Survey galaxy that is receding from us."""
    src = R.source(HEASARC_KEY)
    retrieved = clock.now_iso()
    rows = _tap(ctx, GALAXY_QUERY)
    galaxies = sorted(
        [r["name"], round(r["ra"], DIRECTION_DP), round(r["dec"], DIRECTION_DP), int(r["radial_velocity"]),
         None if r["ks_mag_0_tot"] is None else round(r["ks_mag_0_tot"], 2)]
        for r in rows
    )
    payload = {
        "generated_at": retrieved,
        "catalogue": {
            "table": "twomassrsc",
            "title": "2MASS Redshift Survey (Huchra et al. 2012)",
            "query": GALAXY_QUERY,
            "selection": {"provenance": Provenance.DERIVED.value, "rule": "radial_velocity > 0"},
            "distance": {"provenance": Provenance.DERIVED.value,
                         "formula": f"megaparsecs = radial_velocity (km/s) / H0, H0 = {H0} km/s/Mpc",
                         "h0_source": H0_SOURCE,
                         "caution": ("the Hubble law misplaces the nearest galaxies, whose own motion is "
                                     "a large part of their velocity")},
        },
        "columns": ["name", "ra_deg", "dec_deg", "velocity_km_s", "ks_mag"],
        "galaxies": galaxies,
        "sources": [SourceRef(url=src["page"], retrieved_at=retrieved,
                              provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict()],
    }
    log.info("galaxies: %d from twomassrsc, out to %d km/s", len(galaxies), max(g[3] for g in galaxies))
    return Built(outputs=[(OUT / "galaxies.json", payload)], receipt={"galaxies": len(galaxies)})


#: NASA's Deep Star Maps 2020, the Milky Way's diffuse light alone, as the SVS
#: publishes it for the web. 1024×512 — enough for a glow, which is all this is;
#: the stars themselves are the catalogue, drawn as points in front of it.
MILKY_WAY = "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_print.jpg"


def build_sky(ctx: Context, *, dataset: str) -> Built:
    """The Milky Way's glow, because the SVS does not serve it to a browser."""
    src = R.source(SVS_KEY)
    retrieved = clock.now_iso()
    body = ctx.fetch.bytes(MILKY_WAY, force=ctx.refresh)
    if not body.startswith(b"\xff\xd8"):
        raise ValueError(f"{MILKY_WAY} is not a JPEG: it starts {body[:8]!r}")
    payload = {
        "generated_at": retrieved,
        "milky_way": {
            "file": "cosmos/milky-way.jpg",
            "from": MILKY_WAY,
            "bytes": len(body),
            "projection": "equirectangular, celestial (ICRS) coordinates, 0h right ascension at the centre, "
                          "right ascension increasing to the LEFT",
            "why_carried": ("the SVS sends no CORS header a browser would accept, so the image cannot be "
                            "used as a texture straight from NASA; it is reproduced here unchanged"),
        },
        "sources": [SourceRef(url=src["page"], retrieved_at=retrieved,
                              provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict()],
    }
    return Built(outputs=[(OUT / "sky.json", payload)],
                 blobs=[(OUT / "milky-way.jpg", body)],
                 receipt={"milky_way_bytes": len(body)})
