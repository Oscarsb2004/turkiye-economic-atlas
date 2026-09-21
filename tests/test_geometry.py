"""
The geometry shell: joining fragments, dropping points, placing a point.

Each of the three exists because a dataset could not be published honestly
without it, and each can go wrong in a way that still draws a plausible map —
a line joined backwards, a curve straightened, a station in the wrong province.
"""

from __future__ import annotations

from atlas.shells.transform import geometry


def test_fragments_that_share_an_end_become_one_line():
    """OSM splits a railway at every bridge; the chain is what a reader names."""
    chains = geometry.stitch([
        [(0.0, 0.0), (1.0, 0.0)],
        [(1.0, 0.0), (2.0, 0.0)],
        [(2.0, 0.0), (3.0, 0.0)],
    ])
    assert chains == [[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)]]


def test_a_fragment_drawn_the_other_way_still_fits():
    """Direction is not published information about a railway."""
    chains = geometry.stitch([
        [(0.0, 0.0), (1.0, 0.0)],
        [(2.0, 0.0), (1.0, 0.0)],      # drawn towards the first one
    ])
    assert chains == [[(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)]]


def test_every_fragment_is_used_exactly_once():
    """Two separate lines stay two lines, and nothing is dropped or doubled."""
    chains = geometry.stitch([
        [(0.0, 0.0), (1.0, 0.0)],
        [(5.0, 5.0), (6.0, 5.0)],
        [(1.0, 0.0), (2.0, 0.0)],
    ])
    assert sorted(len(chain) for chain in chains) == [2, 3]
    points = [point for chain in chains for point in chain]
    assert (5.0, 5.0) in points and (2.0, 0.0) in points


def test_a_junction_of_three_is_a_fork_not_a_failure():
    """Three fragments meeting at a point cannot be one chain; the third stands alone."""
    chains = geometry.stitch([
        [(0.0, 0.0), (1.0, 0.0)],
        [(1.0, 0.0), (2.0, 0.0)],
        [(1.0, 0.0), (1.0, 1.0)],      # the branch
    ])
    assert len(chains) == 2
    assert sum(len(chain) for chain in chains) == 5


def test_simplify_keeps_the_ends_and_the_corners():
    """
    A straight run of points collapses to its two ends; a corner survives.

    The tolerance is in metres, so the numbers here are degrees apart on
    purpose: 0.01° of latitude is about 1 113 m.
    """
    straight = [(32.0, 39.0), (32.0, 39.005), (32.0, 39.01), (32.0, 39.015)]
    assert geometry.simplify(straight, 50) == [(32.0, 39.0), (32.0, 39.015)]

    cornered = [(32.0, 39.0), (32.0, 39.01), (32.02, 39.01)]
    assert geometry.simplify(cornered, 50) == cornered

    # A detour smaller than the tolerance is not a corner.
    nearly = [(32.0, 39.0), (32.000001, 39.005), (32.0, 39.01)]
    assert geometry.simplify(nearly, 50) == [(32.0, 39.0), (32.0, 39.01)]


def test_simplify_leaves_short_lines_and_zero_tolerance_alone():
    two = [(32.0, 39.0), (33.0, 40.0)]
    assert geometry.simplify(two, 500) == two
    many = [(32.0, 39.0), (32.0, 39.005), (32.0, 39.01)]
    assert geometry.simplify(many, 0) == many


def test_repeated_points_are_dropped_and_a_real_return_is_not():
    assert geometry.without_repeats([(1.0, 1.0), (1.0, 1.0), (2.0, 2.0)]) == [(1.0, 1.0), (2.0, 2.0)]
    # There and back again: the same point, but not consecutive.
    there_and_back = [(1.0, 1.0), (2.0, 2.0), (1.0, 1.0)]
    assert geometry.without_repeats(there_and_back) == there_and_back


SQUARE = {
    "properties": {"name": "square"},
    "geometry": {"type": "Polygon", "coordinates": [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],      # a hole in the middle
    ]},
}
FAR = {
    "properties": {"name": "far"},
    "geometry": {"type": "Polygon", "coordinates": [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]},
}


def test_a_point_in_a_hole_is_outside():
    assert geometry.containing((1.0, 1.0), [SQUARE, FAR])["properties"]["name"] == "square"
    assert geometry.containing((5.0, 5.0), [SQUARE, FAR]) is None, "the hole is not the polygon"
    assert geometry.containing((25.0, 25.0), [SQUARE, FAR])["properties"]["name"] == "far"
    assert geometry.containing((-1.0, -1.0), [SQUARE, FAR]) is None


def test_a_multipolygon_is_all_of_its_parts():
    islands = {
        "properties": {"name": "islands"},
        "geometry": {"type": "MultiPolygon", "coordinates": [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
        ]},
    }
    assert geometry.containing((5.5, 5.5), [islands])["properties"]["name"] == "islands"
    assert geometry.containing((3.0, 3.0), [islands]) is None


def test_a_point_just_outside_belongs_to_the_nearest_area():
    """
    Published boundaries are simplified, so a real place can sit just outside
    all of them — 18 Marmaray stations do. The nearest area within a stated
    distance is the honest answer; beyond it there is no answer.
    """
    # 0.001° of longitude at this latitude is about 111 m.
    close = (10.001, 5.0)
    where, gap = geometry.nearest(close, [SQUARE, FAR], within_m=500)
    assert where["properties"]["name"] == "square"
    assert 90 < gap < 130, gap

    far_off = (15.0, 5.0)
    assert geometry.nearest(far_off, [SQUARE, FAR], within_m=500) == (None, float("inf"))


def test_a_point_inside_is_zero_from_it():
    """So `containing` and `nearest` cannot disagree about the same point."""
    inside = (1.0, 1.0)
    assert geometry.distance_m(inside, SQUARE["geometry"]) == 0.0
    where, gap = geometry.nearest(inside, [SQUARE, FAR], within_m=1)
    assert where["properties"]["name"] == "square" and gap == 0.0
