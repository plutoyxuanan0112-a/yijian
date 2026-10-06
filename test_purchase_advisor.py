import unittest

from purchase_advisor import suggest_purchases


class PurchaseAdvisorTests(unittest.TestCase):
    def test_low_temperature_missing_outerwear_is_specific(self):
        advice = suggest_purchases(
            [
                {"category": "上衣", "color": "白色", "style_tags": "简约", "material": "棉"},
                {"category": "下装", "color": "蓝色牛仔", "style_tags": "简约", "material": "牛仔"},
                {"category": "鞋履", "color": "白色", "style_tags": "简约", "material": "皮革"},
            ],
            temperature=8,
            style="简约",
            scene="通勤",
        )
        self.assertEqual(len(advice), 1)
        self.assertEqual(advice[0]["role"], "保暖外套")
        self.assertIn("白", advice[0]["color_palette"])
        self.assertIn("羊毛", advice[0]["material"])
        self.assertIn("已有", advice[0]["match_reason"])
        self.assertEqual(advice[0]["scene"], "通勤工作")

    def test_existing_outerwear_does_not_trigger_generic_purchase(self):
        advice = suggest_purchases(
            [{"category": "外套", "color": "黑色", "style_tags": "简约", "material": "羊毛"}],
            temperature=8,
            style="简约",
            scene="通勤",
        )
        self.assertEqual(advice, [])

    def test_style_gap_is_detected_without_temperature_trigger(self):
        advice = suggest_purchases(
            [
                {"category": "上衣", "color": "粉色", "style_tags": "甜美", "material": "雪纺"},
                {"category": "下装", "color": "白色", "style_tags": "甜美", "material": "棉"},
                {"category": "鞋履", "color": "白色", "style_tags": "甜美", "material": "皮革"},
            ],
            temperature=22,
            style="美式",
            scene="周末",
        )
        self.assertEqual(advice[0]["role"], "风格核心单品")
        self.assertIn("牛仔", advice[0]["item_type"])
        self.assertIn("美式", advice[0]["match_reason"])
        self.assertEqual(advice[0]["scene"], "日常休闲")


if __name__ == "__main__":
    unittest.main()
