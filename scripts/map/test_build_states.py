"""Checks the merge rules in build_states.py. Run: python3 -m unittest scripts/map/test_build_states.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from build_states import merge_places, osm_rows, same_place, us_phone  # noqa: E402


def place(name, y, x, kind="s", source="o", **extra):
    return {"k": kind, "y": y, "x": x, "n": name, "a": None, "p": None, "w": None, "h": None, "f": 0, "c": 0, "s": source, **extra}


class MergeRules(unittest.TestCase):
    def test_same_shop_with_close_names_merges(self):
        self.assertTrue(same_place(place("Bike Bling", 32.0, -117.0), place("BikeBling", 32.0001, -117.0001)))
        self.assertTrue(same_place(place("The Bike Shop", 32.0, -117.0), place("The Bike Shop Temecula Valley", 32.0001, -117.0)))
        self.assertTrue(same_place(place("Chainline Bikes", 32.0, -117.0), place("Chainline Bikes", 32.0007, -117.0)))

    def test_different_shops_or_far_apart_stay_apart(self):
        self.assertFalse(same_place(place("Moment Bicycles", 32.0, -117.0), place("Electric Bike Central", 32.0003, -117.0)))
        self.assertFalse(same_place(place("Summer Cycles", 32.0, -117.0), place("Summer Cycles", 32.01, -117.0)))

    def test_merge_prefers_osm_fields_and_fills_gaps_and_keeps_the_repair_flag(self):
        osm = [place("Spoke", 32.0, -117.0, p="555"), place(None, 32.5, -117.5, kind="st")]
        ov = [place("Spoke Shop", 32.0001, -117.0, kind="r", source="v", a="1 Main St", p="(858) 555-0100"),
              place("Far Away Bikes", 33.0, -118.0, source="v")]
        merged, matched = merge_places(osm, ov)
        self.assertEqual(matched, 1)
        self.assertEqual(len(merged), 3)
        self.assertEqual(merged[0], {"k": "s", "y": 32.0, "x": -117.0, "n": "Spoke", "a": "1 Main St", "p": "555", "f": 1, "s": "ov"})

    def test_osm_rows_sort_racks_shops_repair_shops_and_stands(self):
        racks, places = osm_rows([
            {"type": "node", "id": 1, "lat": 32.123456, "lon": -117.1, "tags": {"amenity": "bicycle_parking", "capacity": "8", "covered": "yes", "access": "customers"}},
            {"type": "way", "id": 2, "center": {"lat": 32.2, "lon": -117.2}, "tags": {"shop": "bicycle", "name": "A", "service:bicycle:repair": "yes"}},
            {"type": "node", "id": 3, "lat": 32.3, "lon": -117.3, "tags": {"shop": "sports", "service:bicycle:repair": "yes", "name": "B"}},
            {"type": "node", "id": 4, "lat": 32.4, "lon": -117.4, "tags": {"amenity": "bicycle_repair_station"}},
            {"type": "node", "id": 4, "lat": 32.4, "lon": -117.4, "tags": {"amenity": "bicycle_repair_station"}},
        ])
        self.assertEqual(racks, [[32.12346, -117.1, 8, 5]])
        self.assertEqual([(p["k"], p["f"]) for p in places], [("s", 1), ("r", 0), ("st", 0)])

    def test_us_phone(self):
        self.assertEqual(us_phone("+18589976783"), "(858) 997-6783")
        self.assertIsNone(us_phone(None))


if __name__ == "__main__":
    unittest.main()
