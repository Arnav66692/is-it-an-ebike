"""Checks qlever_racks.py: the point a way stands for, the answer's cells, and one state per spot.
Run: python3 -m unittest scripts/map/test_qlever_racks.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from qlever_racks import by_state, query, term, wkt_point  # noqa: E402

WKT = '"%s"^^<http://www.opengis.net/ont/geosparql#wktLiteral>'


class Centroid(unittest.TestCase):
    def assertPoint(self, got, lat, lon):
        self.assertAlmostEqual(got[0], lat, places=9)
        self.assertAlmostEqual(got[1], lon, places=9)

    def test_a_node_is_its_own_point(self):
        self.assertPoint(wkt_point("POINT(-77.1 38.88)"), 38.88, -77.1)

    def test_a_square_way_stands_at_its_middle(self):
        self.assertPoint(wkt_point("POLYGON((0 0,4 0,4 4,0 4,0 0))"), 2, 2)

    def test_an_l_shaped_way_uses_its_area_not_the_mean_of_its_corners(self):
        # A 2 by 1 block with a 1 by 1 block on its left end: (2 * 1 + 1 * 0.5) / 3 across, the same up.
        self.assertPoint(wkt_point("POLYGON((0 0,2 0,2 1,1 1,1 2,0 2,0 0))"), 2.5 / 3, 2.5 / 3)

    def test_a_small_rack_way_in_arlington_drawn_either_way_round(self):
        ring = [(-77.1, 38.88), (-77.0998, 38.88), (-77.0998, 38.8801), (-77.1, 38.8801), (-77.1, 38.88)]
        text = ",".join("%s %s" % p for p in ring)
        backwards = ",".join("%s %s" % p for p in reversed(ring))
        self.assertPoint(wkt_point("POLYGON((%s))" % text), 38.88005, -77.0999)
        self.assertPoint(wkt_point("POLYGON((%s))" % backwards), 38.88005, -77.0999)

    def test_a_hole_is_ignored_and_a_multipolygon_weighs_each_part_by_area(self):
        self.assertPoint(wkt_point("POLYGON((0 0,4 0,4 4,0 4,0 0),(0 0,1 0,1 1,0 1,0 0))"), 2, 2)
        # A 2 by 2 square at the origin and a 1 by 1 square at x 10: (4 * 1 + 1 * 10.5) / 5 across.
        got = wkt_point("MULTIPOLYGON(((0 0,2 0,2 2,0 2,0 0)),((10 0,11 0,11 1,10 1,10 0)))")
        self.assertPoint(got, (4 * 1 + 1 * 0.5) / 5, (4 * 1 + 1 * 10.5) / 5)

    def test_a_line_or_a_flat_polygon_takes_the_mean_of_its_vertices(self):
        self.assertPoint(wkt_point("LINESTRING(0 0,2 0,4 2)"), 2 / 3, 2)
        self.assertPoint(wkt_point("POLYGON((0 0,2 0,4 0,0 0))"), 0, 2)

    def test_no_point_from_an_empty_or_broken_geometry(self):
        self.assertIsNone(wkt_point("POLYGON EMPTY"))
        self.assertIsNone(wkt_point(""))
        self.assertIsNone(wkt_point("POINT(500 500)"))


class Answers(unittest.TestCase):
    def test_cells_read_as_plain_text(self):
        self.assertEqual(term('"US-VA"'), "US-VA")
        self.assertEqual(term("<https://www.openstreetmap.org/way/5>"), "https://www.openstreetmap.org/way/5")
        self.assertEqual(term(WKT % "POINT(1 2)"), "POINT(1 2)")
        self.assertEqual(term("4"), "4")
        self.assertEqual(term('"Joe\\"s \\\\ Bikes"'), 'Joe"s \\ Bikes')
        self.assertIsNone(term(""))

    def test_every_spot_lands_in_one_state_and_territories_are_left_out(self):
        tsv = "\n".join([
            "?iso\t?osm\t?wkt\t?t0\t?t1\t?t2",
            '"US-VA"\t<https://www.openstreetmap.org/node/1>\t%s\t8\t"yes"\t' % (WKT % "POINT(-77.1 38.88)"),
            '"US-DC"\t<https://www.openstreetmap.org/way/2>\t%s\t\t\t"private"' % (WKT % "POLYGON((-77.03 38.9,-77.02 38.9,-77.02 38.91,-77.03 38.91,-77.03 38.9))"),
            '"US-MD"\t<https://www.openstreetmap.org/node/1>\t%s\t\t\t' % (WKT % "POINT(-77.1 38.88)"),
            '"US-GU"\t<https://www.openstreetmap.org/node/3>\t%s\t\t\t' % (WKT % "POINT(144.7 13.4)"),
            "",
        ])
        found, stats = by_state("racks", tsv)
        self.assertEqual(sorted(found), ["DC", "VA"])
        self.assertEqual(found["VA"], [{"type": "node", "id": 1, "lat": 38.88, "lon": -77.1,
                                        "tags": {"amenity": "bicycle_parking", "capacity": "8", "covered": "yes"}}])
        self.assertEqual(found["DC"][0]["center"], {"lat": 38.905, "lon": -77.025})
        self.assertEqual(found["DC"][0]["tags"]["access"], "private")
        self.assertEqual(stats, {"rows": 4, "kept": 2, "repeat": 1, "territory": 1, "bad": 0})

    def test_each_query_joins_the_state_boundary_and_reads_the_geometry(self):
        for layer in ("racks", "stations", "shops"):
            text = query(layer)
            self.assertIn("ISO3166-2> ?iso", text)
            self.assertIn("ogc:sfContains ?osm", text)
            self.assertIn("geo:hasGeometry/geo:asWKT ?wkt", text)


if __name__ == "__main__":
    unittest.main()
