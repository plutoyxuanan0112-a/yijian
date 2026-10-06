"""Deterministic wardrobe-gap and purchase advice layer.

The advisor never invents a generic shopping list. It derives the missing
functional role from weather and the style request, then anchors color and
material suggestions to the user's existing wardrobe.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

VERSION = "purchase-advisor-0.1.0"

STYLE_PROFILE = {
    "通勤": {
        "features": ["利落线条", "正式度适中", "便于日常叠穿"],
        "materials": ["羊毛混纺", "风衣面料", "细密棉"],
        "colors": ["黑", "深灰", "藏蓝", "卡其"],
    },
    "优雅知性": {
        "features": ["收腰或直线剪裁", "细节克制", "质感面料"],
        "materials": ["羊毛混纺", "醋酸", "细腻针织"],
        "colors": ["黑", "奶油白", "驼色", "深棕"],
    },
    "韩系": {
        "features": ["短款或中长款", "宽松但不臃肿", "层次感"],
        "materials": ["哑光尼龙", "细密针织", "羊毛混纺"],
        "colors": ["奶油白", "灰", "黑", "浅卡其"],
    },
    "美式": {
        "features": ["宽松直线", "休闲层次", "复古街头感"],
        "materials": ["丹宁", "重磅纯棉", "帆布"],
        "colors": ["蓝", "白", "黑", "卡其"],
    },
    "甜美": {
        "features": ["轻盈比例", "柔和细节", "适度收腰"],
        "materials": ["细腻针织", "雪纺", "棉质蕾丝"],
        "colors": ["白", "粉", "奶油白", "浅蓝"],
    },
    "简约": {
        "features": ["线条简洁", "低装饰", "利落廓形"],
        "materials": ["羊毛混纺", "挺括棉", "哑光尼龙"],
        "colors": ["黑", "灰", "米色", "藏蓝"],
    },
    "复古": {
        "features": ["有结构感", "复古比例", "低饱和色"],
        "materials": ["灯芯绒", "粗花呢", "羊毛混纺"],
        "colors": ["棕", "酒红", "墨绿", "驼色"],
    },
    "户外运动": {
        "features": ["防风", "轻量", "活动量友好"],
        "materials": ["防风尼龙", "软壳", "抓绒"],
        "colors": ["黑", "深灰", "军绿", "藏蓝"],
    },
    "中性": {
        "features": ["中性廓形", "装饰克制", "结构清晰"],
        "materials": ["挺括棉", "丹宁", "哑光尼龙"],
        "colors": ["黑", "灰", "白", "藏蓝"],
    },
    "甜酷": {
        "features": ["柔和与利落并置", "局部醒目细节", "比例轻盈"],
        "materials": ["丹宁", "皮革", "细腻针织"],
        "colors": ["黑", "白", "粉", "酒红"],
    },
    "日系": {
        "features": ["自然松弛", "低饱和配色", "层次轻盈"],
        "materials": ["棉麻", "细腻针织", "轻薄羊毛"],
        "colors": ["米色", "灰", "藏蓝", "棕"],
    },
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _tokens(value: Any) -> List[str]:
    return [token for token in re.split(r"[、,/|，\s]+", _text(value)) if token and token != "未填"]


def _color_family(value: str) -> str:
    for family, aliases in {
        "黑": ("黑",), "白": ("白",), "灰": ("灰",), "米色": ("米", "奶油", "燕麦"),
        "棕": ("棕", "咖啡"), "卡其": ("卡其", "军绿", "橄榄"), "蓝": ("蓝", "牛仔"),
        "红": ("红",), "绿": ("绿",), "黄": ("黄",), "紫": ("紫",), "粉": ("粉",),
    }.items():
        if any(alias in value for alias in aliases):
            return family
    return value


def _style_key(style: str) -> str:
    aliases = {
        "优雅": "优雅知性", "气质": "优雅知性", "法式": "优雅知性",
        "学院": "复古", "英伦": "复古",
        "运动风": "户外运动", "户外机能": "户外运动", "户外": "户外运动",
        "极简": "简约", "实穿": "简约", "休闲": "简约", "日常": "简约",
        "甜系": "甜美",
    }
    normalized = aliases.get(_text(style), _text(style))
    for key in STYLE_PROFILE:
        if key in normalized:
            return key
    return "简约"


def _scene_key(scene: str) -> str:
    aliases = {
        "通勤": "通勤工作", "出差": "通勤工作",
        "正式": "正式场合",
        "日常": "日常休闲", "周末": "日常休闲", "周末休闲": "日常休闲",
        "旅行": "旅行度假", "度假": "旅行度假",
        "聚会": "聚会社交", "看秀": "聚会社交",
        "运动": "运动户外", "运动健身": "运动户外", "户外": "运动户外",
    }
    return aliases.get(_text(scene), _text(scene) or "日常休闲")


def _style_matches(rows: Sequence[Dict[str, Any]], key: str) -> bool:
    return any(
        key in _text(row.get("style_tags"))
        for row in rows
        if _text(row.get("style_tags"))
    )


def _wardrobe_context(rows: Iterable[Dict[str, Any]]) -> Dict[str, List[str]]:
    colors: List[str] = []
    styles: List[str] = []
    materials: List[str] = []
    for row in rows:
        colors.extend(_color_family(token) for token in _tokens(row.get("color")))
        styles.extend(_tokens(row.get("style_tags")))
        materials.extend(_tokens(row.get("material")))
    return {
        "colors": list(dict.fromkeys(colors)),
        "styles": list(dict.fromkeys(styles)),
        "materials": list(dict.fromkeys(materials)),
    }


def _temperature_need(temperature: Optional[float]) -> Dict[str, Any]:
    if temperature is None:
        return {"role": None, "reason": "温度未提供，暂不强制增加保暖层"}
    if temperature <= 12:
        return {"role": "保暖外套", "reason": f"{temperature:g}°C 需要稳定保暖层"}
    if temperature <= 18:
        return {"role": "轻薄外套", "reason": f"{temperature:g}°C 适合增加可叠穿外套"}
    if temperature >= 28:
        return {"role": "轻薄防晒层", "reason": f"{temperature:g}°C 需要透气、轻量的防晒层"}
    return {"role": None, "reason": "当前温度不强制增加功能性单品"}


def suggest_purchases(
    rows: Sequence[Dict[str, Any]],
    temperature: Optional[float],
    style: str,
    scene: str = "",
) -> List[Dict[str, Any]]:
    """Return actionable functional and style gaps anchored to the wardrobe."""
    need = _temperature_need(temperature)
    context = _wardrobe_context(rows)
    key = _style_key(style)
    scene_key = _scene_key(scene)
    profile = STYLE_PROFILE[key]
    suggestions: List[Dict[str, Any]] = []
    outerwear = [row for row in rows if _text(row.get("category")) == "外套"]
    outerwear_matches_style = any(
        key in _text(row.get("style_tags")) or not _text(row.get("style_tags"))
        for row in outerwear
    )
    existing_colors = context["colors"]
    preferred_colors = [
        color for color in profile["colors"]
        if color in existing_colors or color in {"黑", "灰", "米色", "藏蓝", "卡其"}
    ]
    if not preferred_colors:
        preferred_colors = profile["colors"][:2]
    anchor = existing_colors[0] if existing_colors else preferred_colors[0]
    color_text = "、".join(dict.fromkeys([anchor, *preferred_colors[:2]]))

    if need["role"] == "保暖外套" and not outerwear_matches_style:
        item_type = "中长款保暖外套"
        material = "优先选择羊毛混纺或轻量保暖填充，避免过度蓬松"
        length = "长度建议覆盖臀部，能与现有裤装或裙装叠穿"
    elif need["role"] == "轻薄外套" and not outerwear_matches_style:
        item_type = "轻薄通勤外套"
        material = "优先选择风衣面料、细密棉或轻薄羊毛混纺"
        length = "选择短款或过臀长度，方便与现有上衣和下装叠穿"
    elif need["role"] == "轻薄防晒层":
        item_type = "轻薄防晒外套"
        material = "优先选择透气防晒尼龙或薄棉，避免厚重针织"
        length = "建议微宽松，保留夏季上衣的活动空间"
    else:
        item_type = material = length = ""

    if item_type:
        suggestions.append({
            "role": need["role"],
            "item_type": item_type,
            "style": key,
            "scene": scene_key,
            "style_features": profile["features"],
            "color_palette": color_text,
            "material": material,
            "fit_and_length": length,
            "match_reason": (
                f"当前衣橱已有{('、'.join(existing_colors[:3]) or '基础色')}色单品，"
                f"建议用{color_text}衔接；适配{scene_key}与{key}风格。"
            ),
            "trigger": need["reason"],
            "source": VERSION,
        })

    # 温度正常时也检查风格缺口，避免让模型把甜美衣橱随机解释成美式。
    if not _style_matches(rows, key):
        categories = {_text(row.get("category")) for row in rows}
        if key == "美式":
            if "下装" not in categories:
                style_item = "高腰直筒牛仔裤"
                style_material = "中等厚度丹宁"
                style_fit = "选择直筒或微宽松版型，作为美式风格的稳定下装骨架"
            elif "外套" not in categories:
                style_item = "短款工装夹克或牛仔外套"
                style_material = "丹宁或挺括帆布"
                style_fit = "肩线自然、微宽松，能叠穿现有上衣"
            else:
                style_item = "宽松纯棉图案T恤"
                style_material = "重磅纯棉"
                style_fit = "图案控制在一个视觉重点，避免和现有单品抢焦点"
        elif key == "甜美":
            style_item = "短款细针织开衫"
            style_material = "细腻针织或棉质混纺"
            style_fit = "短款或微收腰，平衡现有基础下装"
        else:
            style_item = f"{key}风格核心外套"
            style_material = "选择与现有衣橱厚薄相近的质感面料"
            style_fit = "优先选择能与现有上衣、下装叠穿的基础版型"
        suggestions.append({
            "role": "风格核心单品",
            "item_type": style_item,
            "style": key,
            "scene": scene_key,
            "style_features": profile["features"],
            "color_palette": color_text,
            "material": style_material,
            "fit_and_length": style_fit,
            "match_reason": (
                f"当前衣橱未检测到{key}风格标签，现有单品风格不足以稳定呈现该风格；"
                f"建议先补充这一件，再用已有{('、'.join(existing_colors[:3]) or '基础色')}单品完成组合。"
            ),
            "trigger": f"用户选择{key}，但衣橱缺少对应风格单品",
            "scene": scene_key,
            "source": VERSION,
        })
    return suggestions[:2]
