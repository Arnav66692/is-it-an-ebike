"""Checks the merge rules in build_states.py. Run: python3 -m unittest scripts/map/test_build_states.py"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from build_states import area_jobs, dedupe_osm, merge_places, osm_rows, overture_rows, same_place, us_phone  # noqa: E402


def place(name, y, x, kind="s", source="o", **extra):
    return {"k": kind, "y": y, "x": x, "n": name, "a": None, "p": None, "w": None, "h": None, "f": 0, "c": 0, "s": source, **extra}


class MergeRules(unittest.TestCase):
    def test_same_shop_with_close_names_merges(self):
        self.assertTrue(same_place(place("Bike Bling", 32.0, -117.0), place("BikeBling", 32.0001, -117.0001)))
        self.assertTrue(same_place(place("The Bike Shop", 32.0, -117.0), place("The Bike Shop Temecula Valley", 32.0001, -117.0)))
        self.assertTrue(same_place(place("Chainline Bikes", 32.0, -117.0), place("Chainline Bikes", 32.0007, -117.0)))
        moved = place("North of the Border Bicycle", 32.917, -117.237, p="(858) 452-1230")
        self.assertTrue(same_place(place("North of the Border Bike Shop", 32.905, -117.215, p="+1 858 452 1230"), moved))

    def test_different_shops_or_far_apart_stay_apart(self):
        self.assertFalse(same_place(place("Moment Bicycles", 32.0, -117.0), place("Electric Bike Central", 32.0003, -117.0)))
        self.assertFalse(same_place(place("Summer Cycles", 32.0, -117.0), place("Summer Cycles", 32.01, -117.0)))

    def test_merge_prefers_osm_fields_and_fills_gaps_and_keeps_the_repair_flag(self):
        osm = [place("Spoke", 32.0, -117.0, p="555"), place(None, 32.5, -117.5, kind="st")]
        ov = [place("Spoke Shop", 32.0001, -117.0, kind="r", source="v", a="1 Main St", p="(858) 555-0100"),
              place("Far Away Bikes", 33.0, -118.0, source="v")]
        merged, stats = merge_places(osm, ov)
        self.assertEqual(stats, {"matched": 1, "duplicate": 0})
        self.assertEqual(len(merged), 3)
        self.assertEqual(merged[0], {"k": "s", "y": 32.0, "x": -117.0, "n": "Spoke", "a": "1 Main St", "p": "555", "f": 1, "s": "ov"})

    def test_a_second_overture_copy_at_an_old_address_folds_into_the_osm_shop(self):
        osm = [place("North of the Border Bike Shop", 32.905, -117.215)]
        ov = [place("North of the Border Bicycle", 32.917, -117.237, source="v", p="(858) 452-1230", a="11855 Sorrento Valley Rd"),
              place("North Of The Border Bike Shop", 32.9051, -117.215, source="v", p="(858) 452-1230", a="4204 Sorrento Valley Blvd")]
        merged, stats = merge_places(osm, ov)
        self.assertEqual(len(merged), 1)
        self.assertEqual((merged[0]["a"], merged[0]["s"], stats["matched"]), ("4204 Sorrento Valley Blvd", "ov", 2))

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

    def test_a_state_without_osm_gets_a_shops_only_file_and_the_seed_box_its_own_full_file(self):
        box = (32.5, -124.5, 42.0, -114.1)
        seed = {"box": (32.53, -117.6, 33.51, -116.08), "elements": [{"type": "node"}], "read": "2026-10-22"}
        inside, outside = place("In", 32.8, -117.1, source="v"), place("Out", 34.0, -118.2, source="v")
        jobs = area_jobs("CA", box, None, [inside, outside], seed, True)
        self.assertEqual([(j["id"], j["racksSaved"], [p["n"] for p in j["overture"]]) for j in jobs],
                         [("CA-sd", True, ["In"]), ("CA", False, ["Out"])])
        self.assertEqual(jobs[1]["elements"], [])
        self.assertEqual([j["id"] for j in area_jobs("TX", box, None, [], None, False)], [])
        full = area_jobs("TX", box, {"elements": [], "read": "2026-10-22"}, [outside], None, True)
        self.assertEqual([(j["id"], j["racksSaved"]) for j in full], [("TX", True)])

    def test_overture_rows_drop_other_countries_low_confidence_and_closed(self):
        rows = [
            {"name": "Tijuana Bikes", "lat": 32.52, "lon": -117.0, "confidence": 0.9, "cat": "bike_store", "addr": {"country": "MX"}},
            {"name": "Low", "lat": 32.7, "lon": -117.1, "confidence": 0.2, "cat": "bike_store", "addr": {"country": "US"}},
            {"name": "Shut", "lat": 32.7, "lon": -117.1, "confidence": 0.9, "cat": "bike_store", "status": "closed"},
            {"name": "San Juan Bikes", "lat": 18.4, "lon": -66.1, "confidence": 0.9, "cat": "bike_store", "addr": {"country": "PR"}},
            {"name": "Kept", "lat": 32.7, "lon": -117.1, "confidence": 0.8, "cat": "bike_repair_maintenance", "addr": {"country": "US", "region": "CA"}},
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write("".join(json.dumps(r) + "\n" for r in rows))
        try:
            kept, dropped = overture_rows(f.name)
        finally:
            os.unlink(f.name)
        self.assertEqual([(p["n"], p["k"]) for p in kept], [("San Juan Bikes", "s"), ("Kept", "r")])
        self.assertEqual(dropped, {"low_confidence": 1, "closed": 1, "no_name": 0, "outside_us": 1})

    def test_a_state_with_osm_and_the_seed_box_lists_each_spot_in_one_file(self):
        box = (32.5, -124.5, 42.0, -114.1)
        seed = {"box": (32.53, -117.6, 33.51, -116.08), "elements": [{"type": "node", "id": 1}], "read": "2026-10-22"}
        rack_in = {"type": "node", "id": 2, "lat": 32.8, "lon": -117.1, "tags": {"amenity": "bicycle_parking"}}
        rack_out = {"type": "way", "id": 3, "center": {"lat": 34.0, "lon": -118.2}, "tags": {"amenity": "bicycle_parking"}}
        inside, outside = place("In", 32.8, -117.1, source="v"), place("Out", 34.0, -118.2, source="v")
        jobs = area_jobs("CA", box, {"elements": [rack_in, rack_out], "read": "2026-09-21"}, [inside, outside], seed, True)
        self.assertEqual([(j["id"], j["racksSaved"], j["osmRead"], [p["n"] for p in j["overture"]]) for j in jobs],
                         [("CA-sd", True, "2026-10-22", ["In"]), ("CA", True, "2026-09-21", ["Out"])])
        self.assertEqual([el["id"] for el in jobs[0]["elements"]], [1])
        self.assertEqual([el["id"] for el in jobs[1]["elements"]], [3])

    def test_a_shop_osm_lists_twice_is_kept_once_but_branches_sharing_a_phone_stay(self):
        point = place("Cosmic Cycles", 37.83954, -122.28284, a="5651 San Pablo Avenue")
        unnamed = place(None, 37.83956, -122.28285)
        building = place("Cosmic Cycles", 37.8399, -122.2829, p="(510) 693-8758", f=1)
        stand = place(None, 37.83955, -122.28284, kind="st")
        branch = place("Bike World North", 37.87, -122.28, p="(510) 693-8758")
        kept, folded = dedupe_osm([unnamed, point, building, stand, branch])
        self.assertEqual(folded, 2)
        self.assertEqual([(p["n"], p["k"]) for p in kept], [("Cosmic Cycles", "s"), (None, "st"), ("Bike World North", "s")])
        self.assertEqual((kept[0]["a"], kept[0]["p"], kept[0]["f"], kept[0]["y"]), ("5651 San Pablo Avenue", "(510) 693-8758", 1, 37.83956))

    def test_us_phone(self):
        self.assertEqual(us_phone("+18589976783"), "(858) 997-6783")
        self.assertIsNone(us_phone(None))


if __name__ == "__main__":
    unittest.main()
