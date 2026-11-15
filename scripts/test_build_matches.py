"""python -m unittest scripts/test_build_matches.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_matches as bm  # noqa: E402


def F(**kw):
    base = {"dD": None, "overhang": None, "acik_giris": None, "termal": None}
    base.update(kw)
    return base


class TestDistance(unittest.TestCase):
    def test_elysium(self):
        self.assertEqual(round(bm.ice_distance_km(23.21, "mars")), 698)

    def test_arsia(self):
        self.assertEqual(round(bm.ice_distance_km(-11.29, "mars")), 2740)

    def test_moon_none(self):
        self.assertIsNone(bm.ice_distance_km(10, "ay"))


class TestMatch(unittest.TestCase):
    def test_null_skipped(self):
        r = bm.compare(F(termal=True, dD=0.5), F(termal=True))
        self.assertEqual(r["benzerlik"], 1.0)
        self.assertEqual(r["kapsam"], 0.3)
        self.assertEqual(r["guven"], "dusuk")

    def test_no_shared(self):
        r = bm.compare(F(dD=0.5), F(termal=True))
        self.assertIsNone(r["benzerlik"])

    def test_dd(self):
        self.assertAlmostEqual(bm.feature_sim("dD", 0.5, 1.0), 0.5)

    def test_range(self):
        self.assertEqual(bm.parse_range("88-100"), (88.0, 100.0))
        self.assertIsNone(bm.parse_range(""))

    def test_build_class_rule(self):
        doc = bm.build()
        earth = {d["dunya_id"]: d for d in doc["dunya"]}
        for a in doc["adaylar"]:
            for t in a["ikizler"]:
                self.assertEqual(earth[t["dunya_id"]]["sinif"], a["sinif"])


if __name__ == "__main__":
    unittest.main()
