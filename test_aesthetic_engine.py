import unittest

from aesthetic_engine import generate_candidates, generate_partial_candidates, hard_filter, normalize_item


def item(item_id, name, category, color, styles="", scenes="", fit="", material="棉"):
    return {
        "id": item_id,
        "name": name,
        "category": category,
        "color": color,
        "style_tags": styles,
        "scene_tags": scenes,
        "fit": fit,
        "material": material,
    }


class AestheticEngineTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            item(1, "白色短袖", "上衣", "白", "简约", "通勤", "合身"),
            item(2, "蓝色牛仔裤", "下装", "蓝", "简约", "通勤", "直筒", "牛仔"),
            item(3, "白色运动鞋", "鞋履", "白", "简约", "通勤", "合身", "皮革"),
            item(4, "黑色托特包", "包袋", "黑", "通勤", "通勤", "", "皮革"),
            item(5, "黑色连衣裙", "裙装", "黑", "通勤", "通勤", "修身"),
        ]

    def test_normalize_item(self):
        result = normalize_item(self.rows[0])
        self.assertEqual(result["colors"], ["白"])
        self.assertIn("简约", result["styles"])

    def test_compound_scene_and_style_are_token_matched(self):
        results = generate_candidates(self.rows[:3], scene="日常通勤", style="简洁、实穿", temperature=22)
        self.assertTrue(results)
        self.assertGreaterEqual(results[0]["scores"]["scene"], 70)

    def test_candidates_are_deterministic_and_valid(self):
        first = generate_candidates(self.rows, scene="通勤", style="简约", temperature=22)
        second = generate_candidates(self.rows, scene="通勤", style="简约", temperature=22)
        self.assertEqual(
            [candidate["clothing_ids"] for candidate in first],
            [candidate["clothing_ids"] for candidate in second],
        )
        self.assertTrue(first)
        self.assertTrue(all(not candidate["hard_rule_error"] for candidate in first))

    def test_dress_and_bottom_are_rejected(self):
        normalized = [normalize_item(self.rows[index]) for index in (0, 1, 2, 4)]
        self.assertEqual(hard_filter(normalized, "通勤", 22), "裙装与下装冲突")

    def test_partial_candidates_keep_real_items_when_shoes_are_missing(self):
        candidates = generate_partial_candidates(self.rows[:2], scene="通勤", style="简约", temperature=8)
        self.assertTrue(candidates)
        self.assertTrue(set(candidates[0]["clothing_ids"]).issubset({1, 2}))
        self.assertIn("鞋履", candidates[0]["missing_roles"])


if __name__ == "__main__":
    unittest.main()
