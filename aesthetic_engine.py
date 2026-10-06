"""Small, deterministic aesthetic decision layer for outfit recommendations.

This module deliberately has no database or model dependency. It consumes the
existing clothing rows and a small JSON configuration so aesthetic tuning can
be done without changing the API or authentication layers.
"""

from __future__ import annotations

import itertools
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

ENGINE_VERSION = "aesthetic-0.1.0"
CONFIG_PATH = Path(__file__).with_name("aesthetic_config.json")


def load_config() -> Dict[str, Any]:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "version": ENGINE_VERSION,
            "weights": {
                "scene": 20,
                "style": 20,
                "color": 20,
                "silhouette": 15,
                "material": 10,
                "preference": 15,
            },
            "limits": {"max_colors": 3, "max_accessories": 1, "max_candidates": 24},
            "palette": {"neutral_colors": ["黑", "白", "灰", "米色", "棕", "卡其", "蓝"]},
            "temperature": {"ai_generation": 0.3},
        }


CONFIG = load_config()


def _text(value: Any) -> str:
    return str(value or "").strip()


def _tags(value: Any) -> List[str]:
    if isinstance(value, (list, tuple, set)):
        raw = [str(item) for item in value]
    else:
        raw = re.split(r"[、,/|，\s]+", _text(value))
    return [item.strip() for item in raw if item.strip() and item.strip() != "未填"]


def _query_tokens(value: Any) -> List[str]:
    tokens = _tags(value)
    expanded = []
    for token in tokens:
        expanded.append(token)
        for part in re.findall(r"通勤|约会|运动|健身|休闲|周末|度假|正式|日常|简约|实穿|优雅|韩系|复古", token):
            if part not in expanded:
                expanded.append(part)
    return expanded


def _color_family(value: str) -> str:
    for family, aliases in {
        "黑": ("黑", "黑色"),
        "白": ("白", "白色"),
        "灰": ("灰", "灰色"),
        "米色": ("米", "米色", "奶油", "燕麦"),
        "棕": ("棕", "棕色", "咖", "咖啡"),
        "卡其": ("卡其", "军绿", "橄榄"),
        "蓝": ("蓝", "蓝色", "牛仔"),
        "红": ("红", "红色", "酒红"),
        "绿": ("绿", "绿色"),
        "黄": ("黄", "黄色"),
        "紫": ("紫", "紫色"),
        "粉": ("粉", "粉色"),
    }.items():
        if any(alias in value for alias in aliases):
            return family
    return value


def normalize_item(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map legacy free-text fields to stable scoring features."""
    category = _text(row.get("category"))
    name = _text(row.get("name"))
    colors = [_color_family(value) for value in _tags(row.get("color") or row.get("colors"))]
    materials = _tags(row.get("material") or row.get("materials"))
    styles = _tags(row.get("style_tags") or row.get("styleTags"))
    scenes = _tags(row.get("scene_tags") or row.get("sceneTags"))
    fit = _tags(row.get("fit") or row.get("fitTags"))
    warmth = _tags(row.get("warmth") or row.get("warmthTags"))
    searchable = " ".join([name, category, *colors, *materials, *styles, *scenes, *fit, *warmth])
    return {
        "row": row,
        "id": int(row["id"]),
        "category": category,
        "colors": colors,
        "materials": materials,
        "styles": styles,
        "scenes": scenes,
        "fit": fit,
        "warmth": warmth,
        "searchable": searchable,
    }


def _contains(item: Dict[str, Any], pattern: str) -> bool:
    return pattern in item["searchable"]


def _score_scene(items: Sequence[Dict[str, Any]], scene: str) -> int:
    if not scene:
        return 70
    requested = set(_query_tokens(scene))
    scores = []
    for item in items:
        item_tokens = set(_query_tokens(item["scenes"]))
        scores.append(100 if requested & item_tokens else 55 if not item["scenes"] else 25)
    normalized = _text(scene)
    if re.search(r"运动|健身", normalized):
        if any(item["category"] == "裙装" for item in items):
            return 10
        if any(_contains(item, "运动") or _contains(item, "户外") for item in items):
            return max(80, sum(scores) // max(1, len(scores)))
    if re.search(r"正式|通勤|出差", normalized):
        if any(_contains(item, "运动风") for item in items):
            return min(35, sum(scores) // max(1, len(scores)))
    return sum(scores) // max(1, len(scores))


def _score_style(items: Sequence[Dict[str, Any]], style: str) -> int:
    if not style:
        return 70
    requested = set(_query_tokens(style))
    matched = sum(1 for item in items if requested & set(_query_tokens(item["styles"])))
    return min(100, 45 + int(55 * matched / max(1, len(items))))


def _score_color(items: Sequence[Dict[str, Any]]) -> Tuple[int, List[str]]:
    colors = []
    for item in items:
        for color in item["colors"]:
            if color not in colors:
                colors.append(color)
    max_colors = int(CONFIG["limits"].get("max_colors", 3))
    forbidden = CONFIG.get("palette", {}).get("forbidden_pairs", [])
    if len(colors) > max_colors:
        return max(20, 100 - (len(colors) - max_colors) * 25), [
            f"颜色数量为 {len(colors)}，超过建议上限 {max_colors}"
        ]
    for pair in forbidden:
        if all(any(color in item["colors"] for item in items) for color in pair):
            return 25, [f"存在高冲突配色：{' + '.join(pair)}"]
    neutral = set(CONFIG.get("palette", {}).get("neutral_colors", []))
    accent_count = sum(1 for color in colors if color not in neutral)
    if accent_count <= int(CONFIG.get("palette", {}).get("accent_limit", 1)):
        return 92, ["以中性色为基础，点缀色控制在合理范围"]
    return 68, ["存在多个非中性色，建议降低视觉刺激"]


def _score_silhouette(items: Sequence[Dict[str, Any]]) -> int:
    tops = [item for item in items if item["category"] == "上衣"]
    bottoms = [item for item in items if item["category"] == "下装"]
    if tops and bottoms:
        top_loose = any(_contains(item, "宽松") or _contains(item, "oversize") for item in tops)
        bottom_loose = any(_contains(item, "宽松") or _contains(item, "阔腿") for item in bottoms)
        if top_loose and bottom_loose:
            return 62
        return 88
    if any(item["category"] == "裙装" for item in items):
        return 84
    return 72


def _score_material(items: Sequence[Dict[str, Any]], temperature: Optional[float]) -> int:
    score = 85
    if temperature is not None and temperature >= 28:
        if any(_contains(item, keyword) for item in items for keyword in ("羽绒", "羊毛", "羊绒", "厚")):
            score -= 55
    if temperature is not None and temperature <= 12:
        if not any(item["category"] == "外套" for item in items):
            score -= 55
    return max(0, score)


def hard_filter(items: Sequence[Dict[str, Any]], scene: str, temperature: Optional[float]) -> Optional[str]:
    categories = [item["category"] for item in items]
    category_set = set(categories)
    if not ({"上衣", "裙装"} & category_set):
        return "缺少主体"
    if "鞋履" not in category_set:
        return "缺少鞋履"
    if "裙装" in category_set and "下装" in category_set:
        return "裙装与下装冲突"
    if categories.count("上衣") > 1 or categories.count("下装") > 1 or categories.count("裙装") > 1:
        return "主体功能位重复"
    if categories.count("外套") > 1:
        return "外套超过一件"
    if categories.count("包袋") + categories.count("配饰") > int(CONFIG["limits"].get("max_accessories", 1)):
        return "包袋或配饰超过上限"
    color_score, _ = _score_color(items)
    if color_score < 25:
        return "配色冲突"
    if re.search(r"运动|健身", _text(scene)) and any(item["category"] == "裙装" for item in items):
        return "运动场景不使用裙装"
    if temperature is not None and temperature <= 12 and "外套" not in category_set:
        return "低温缺少外套"
    return None


def _score_candidate(
    items: Sequence[Dict[str, Any]],
    scene: str,
    style: str,
    temperature: Optional[float],
) -> Dict[str, Any]:
    color_score, color_reasons = _score_color(items)
    scores = {
        "scene": _score_scene(items, scene),
        "style": _score_style(items, style),
        "color": color_score,
        "silhouette": _score_silhouette(items),
        "material": _score_material(items, temperature),
        "preference": 70,
    }
    weights = CONFIG["weights"]
    total = round(sum(scores[key] * float(weights.get(key, 0)) for key in scores) / max(1, sum(weights.values())), 2)
    return {
        "clothing_ids": [item["id"] for item in items],
        "score": total,
        "scores": scores,
        "reasons": color_reasons,
        "hard_rule_error": None,
    }


def generate_candidates(
    rows: Iterable[Dict[str, Any]],
    scene: str = "",
    style: str = "",
    temperature: Optional[float] = None,
) -> List[Dict[str, Any]]:
    items = [normalize_item(dict(row)) for row in rows]
    tops = [item for item in items if item["category"] == "上衣"]
    bottoms = [item for item in items if item["category"] == "下装"]
    dresses = [item for item in items if item["category"] == "裙装"]
    shoes = [item for item in items if item["category"] == "鞋履"]
    outers = [item for item in items if item["category"] == "外套"]
    bags = [item for item in items if item["category"] == "包袋"]
    accessories = [item for item in items if item["category"] == "配饰"]
    raw: List[Tuple[Dict[str, Any], ...]] = []
    raw.extend(itertools.product(tops, bottoms, shoes))
    raw.extend(itertools.product(dresses, shoes))
    raw.extend(itertools.product(tops, bottoms, outers, shoes))
    raw.extend(itertools.product(dresses, outers, shoes))
    candidates: List[Dict[str, Any]] = []
    for base in raw:
        unique = {item["id"]: item for item in base}
        if len(unique) != len(base):
            continue
        for optional in ((),):
            selected = list(base) + list(optional)
            error = hard_filter(selected, scene, temperature)
            if error:
                continue
            result = _score_candidate(selected, scene, style, temperature)
            result["items"] = selected
            candidates.append(result)
        # Add at most one accessory option without exploding combinations.
        optional_pool = bags + accessories
        for extra in optional_pool[:4]:
            selected = list(base) + [extra]
            if hard_filter(selected, scene, temperature):
                continue
            result = _score_candidate(selected, scene, style, temperature)
            result["items"] = selected
            candidates.append(result)
    deduped = {tuple(sorted(candidate["clothing_ids"])): candidate for candidate in candidates}
    ranked = sorted(deduped.values(), key=lambda candidate: (-candidate["score"], candidate["clothing_ids"]))
    return ranked[: int(CONFIG["limits"].get("max_candidates", 24))]


def generate_partial_candidates(
    rows: Iterable[Dict[str, Any]],
    scene: str = "",
    style: str = "",
    temperature: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Generate the best available real-clothing subset when a full outfit is impossible."""
    items = [normalize_item(dict(row)) for row in rows]
    if not items:
        return []
    groups = {
        category: [item for item in items if item["category"] == category]
        for category in ("上衣", "下装", "裙装", "外套", "鞋履", "包袋", "配饰")
    }
    combinations: List[Tuple[Dict[str, Any], ...]] = []
    combinations.extend(itertools.product(groups["上衣"], groups["下装"]))
    combinations.extend(itertools.product(groups["上衣"], groups["裙装"]))
    combinations.extend(itertools.product(groups["上衣"], groups["外套"]))
    combinations.extend(itertools.product(groups["裙装"], groups["外套"]))
    for category in ("上衣", "下装", "裙装", "外套", "鞋履"):
        combinations.extend((item,) for item in groups[category])
    candidates = []
    for selected_tuple in combinations:
        selected = list(selected_tuple)
        categories = [item["category"] for item in selected]
        if "裙装" in categories and "下装" in categories:
            continue
        if any(categories.count(category) > 1 for category in ("上衣", "下装", "裙装", "外套", "鞋履")):
            continue
        candidate = _score_candidate(selected, scene, style, temperature)
        missing = []
        if not any(item["category"] in {"上衣", "裙装"} for item in selected):
            missing.append("主体")
        if "鞋履" not in categories:
            missing.append("鞋履")
        if "上衣" in categories and not ({"下装", "裙装"} & set(categories)):
            missing.append("下装或裙装")
        if temperature is not None and temperature <= 12 and "外套" not in categories:
            missing.append("保暖外套")
        candidate["missing_roles"] = list(dict.fromkeys(missing))
        candidate["items"] = selected
        candidates.append(candidate)
    deduped = {tuple(sorted(candidate["clothing_ids"])): candidate for candidate in candidates}
    ranked = sorted(
        deduped.values(),
        key=lambda candidate: (len(candidate["missing_roles"]), -candidate["score"], candidate["clothing_ids"]),
    )
    return ranked[: int(CONFIG["limits"].get("max_candidates", 24))]


def candidate_prompt(candidates: Sequence[Dict[str, Any]]) -> str:
    lines = ["【已通过审美筛选的候选组合】"]
    for index, candidate in enumerate(candidates, start=1):
        lines.append(
            f"候选{index}: IDs={candidate['clothing_ids']} 总分={candidate['score']} "
            f"维度={candidate['scores']} 缺口={candidate.get('missing_roles', [])} "
            f"原因={candidate['reasons'] or ['基础协调']}"
        )
    lines.append("只能从以上候选组合中选择一组，不得重新自由组合。")
    return "\n".join(lines)


def public_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "clothing_ids": candidate["clothing_ids"],
        "score": candidate["score"],
        "scores": candidate["scores"],
        "reasons": candidate["reasons"],
    }
