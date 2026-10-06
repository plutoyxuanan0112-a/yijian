import base64
import hashlib
import hmac
import io
import json
import os
import secrets
import shutil
import sqlite3
import sys
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlparse, unquote

import httpx
import uvicorn
import taste
import blogger_ops
import aesthetic_engine
import purchase_advisor

try:  # Cloudinary 云端图片存储（未安装时自动降级为本地存储）
    import cloudinary
    import cloudinary.uploader
except ImportError:  # pragma: no cover
    cloudinary = None

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import IntegrityError
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
import uuid
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
DB_PATH = DATA_DIR / "yijian.sqlite3"
TOKEN_SECRET = os.environ.get("YIJIAN_TOKEN_SECRET", "change-this-in-production")
TOKEN_TTL_SECONDS = int(os.environ.get("YIJIAN_TOKEN_TTL_SECONDS", "604800"))
AI_TIMEOUT_SECONDS = float(os.environ.get("AI_TIMEOUT_SECONDS", "60"))
DEFAULT_MODEL = os.environ.get("AI_MODEL", "deepseek-chat")
DEFAULT_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_VISION_MODEL = os.environ.get("DEEPSEEK_VISION_MODEL", "deepseek-flash")
MAX_CLOTHING_ANALYZE_BYTES = 10 * 1024 * 1024


def _ai_runtime_config(vision: bool = False) -> Dict[str, str]:
    """Read AI settings at request time so Render environment updates take effect."""
    key = (
        os.environ.get("DEEPSEEK_API_KEY", "").strip()
        or os.environ.get("AI_API_KEY", "").strip()
    )
    base_url = (
        os.environ.get("DEEPSEEK_BASE_URL" if vision else "AI_BASE_URL", "").strip()
        or os.environ.get("AI_BASE_URL", "").strip()
        or DEFAULT_BASE_URL
    ).rstrip("/")
    model = (
        os.environ.get("DEEPSEEK_VISION_MODEL" if vision else "AI_MODEL", "").strip()
        or (DEEPSEEK_VISION_MODEL if vision else DEFAULT_MODEL)
    )
    return {"api_key": key, "base_url": base_url, "model": model}


def _ai_usage(payload: Any) -> Dict[str, int]:
    usage = payload if isinstance(payload, dict) else {}
    def number(name: str) -> int:
        try:
            return max(0, int(usage.get(name) or 0))
        except (TypeError, ValueError):
            return 0
    prompt_tokens = number("prompt_tokens")
    completion_tokens = number("completion_tokens")
    total_tokens = number("total_tokens") or prompt_tokens + completion_tokens
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }

CLOTHING_CATEGORIES = ("上衣", "下装", "鞋履", "外套", "裙装", "包袋", "配饰")
CLOTHING_COLORS = ("白", "米色", "灰", "黑", "棕", "蓝", "绿", "黄", "红", "粉")
CLOTHING_MATERIALS = (
    "棉", "亚麻", "针织", "羊毛", "牛仔", "皮革", "雪纺", "羽绒", "化纤",
)
CLOTHING_WARMTHS = ("薄", "中等", "厚")
CLOTHING_FITS = ("修身", "合身", "直筒", "宽松", "Oversize", "A字", "短款", "长款")
CLOTHING_STYLES = ("通勤", "优雅知性", "韩系", "简约", "复古", "甜美", "户外运动", "中性", "美式", "甜酷", "日系")
CLOTHING_SEASONS = ("春", "夏", "秋", "冬")
CLOTHING_SCENES = ("日常休闲", "通勤工作", "约会", "旅行度假", "聚会社交", "运动户外", "居家", "正式场合")

# ---- Cloudinary 云端图片存储 ----
# 三个 key 全部来自环境变量，绝不硬编码；Render 需配置：
#   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_ENABLED = bool(
    cloudinary and CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET
)
IS_HOSTED_RUNTIME = bool(
    os.environ.get("RENDER")
    or os.environ.get("RAILWAY_ENVIRONMENT")
    or os.environ.get("K_SERVICE")
)
if os.environ.get("YIJIAN_ENV", "development").lower() == "production" or IS_HOSTED_RUNTIME:
    if not CLOUDINARY_ENABLED or not os.environ.get("DATABASE_URL", "").startswith(("postgres://", "postgresql://", "postgresql+")):
        raise RuntimeError(
            "Hosted deployments require PostgreSQL and configured Cloudinary image storage. "
            "Set DATABASE_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
        )
if CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )


def _cloudinary_missing_config() -> List[str]:
    missing = []
    if cloudinary is None:
        missing.append("cloudinary package")
    if not CLOUDINARY_CLOUD_NAME:
        missing.append("CLOUDINARY_CLOUD_NAME")
    if not CLOUDINARY_API_KEY:
        missing.append("CLOUDINARY_API_KEY")
    if not CLOUDINARY_API_SECRET:
        missing.append("CLOUDINARY_API_SECRET")
    return missing


def storage_status() -> Dict[str, Any]:
    return {
        "provider": "cloudinary" if CLOUDINARY_ENABLED else "local",
        "cloudinary_enabled": CLOUDINARY_ENABLED,
        "missing_config": _cloudinary_missing_config(),
        "local_upload_dir": str(UPLOAD_DIR),
        "production_ready": CLOUDINARY_ENABLED,
    }


def _upload_image_to_storage(
    stream: Any,
    *,
    user_id: int,
    category: str,
    extension: str,
) -> str:
    safe_category = "".join(ch for ch in category if ch.isalnum() or ch in {"-", "_"})[:40] or "upload"
    safe_extension = extension if extension in {".jpg", ".jpeg", ".png", ".webp", ".gif"} else ".bin"

    if CLOUDINARY_ENABLED:
        public_id = f"yijian/{user_id}/{safe_category}-{int(time.time())}-{secrets.token_hex(6)}"
        try:
            result = cloudinary.uploader.upload(
                stream,
                public_id=public_id,
                resource_type="image",
                overwrite=True,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="图片上传云端失败，请稍后重试") from exc
        secure_url = result.get("secure_url") or result.get("url")
        if not secure_url:
            raise HTTPException(status_code=502, detail="图片上传云端失败：未返回 URL")
        return secure_url

    user_folder = UPLOAD_DIR / str(user_id)
    user_folder.mkdir(parents=True, exist_ok=True)
    filename = f"{safe_category}-{int(time.time())}-{secrets.token_hex(6)}{safe_extension}"
    destination = user_folder / filename
    with destination.open("wb") as output:
        shutil.copyfileobj(stream, output)
    relative_path = destination.relative_to(UPLOAD_DIR).as_posix()
    return f"/api/v1/uploads/{relative_path}"


def _cloudinary_public_id_from_url(url: str) -> Optional[str]:
    """从 Cloudinary secure_url 反解 public_id，用于删除云端图片。"""
    parsed = urlparse(url)
    prefix = f"/{CLOUDINARY_CLOUD_NAME}/image/upload/"
    if parsed.scheme != "https" or parsed.netloc != "res.cloudinary.com" or not parsed.path.startswith(prefix):
        return None
    rest = unquote(parsed.path[len(prefix):])
    parts = [p for p in rest.split("/") if p]
    if parts and parts[0].startswith("v") and parts[0][1:].isdigit():
        parts = parts[1:]
    path_part = "/".join(parts)
    dot = path_part.rfind(".")
    if dot != -1:
        path_part = path_part[:dot]
    return path_part or None


DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:5178",
    "http://localhost:5178",
    "http://127.0.0.1:5187",
    "http://localhost:5187",
    "null",
    "https://plutoyxuanan0112-a.github.io",
]


def parse_cors_origins() -> List[str]:
    raw = os.environ.get("YIJIAN_CORS_ORIGINS", "")
    if not raw.strip():
        return DEFAULT_CORS_ORIGINS
    origins = [x.strip() for x in raw.split(",") if x.strip()]
    return origins or DEFAULT_CORS_ORIGINS


app = FastAPI(
    title="衣见 API",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# 静态文件目录
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
AVATAR_DIR = STATIC_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_origin_regex=os.environ.get("YIJIAN_CORS_ORIGIN_REGEX", "") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(min_length=1, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


DEMO_WARDROBE_ASSET_BASE = os.environ.get(
    "YIJIAN_DEMO_ASSET_BASE",
    "https://plutoyxuanan0112-a.github.io/yijian",
).rstrip("/")


DEMO_WARDROBE_ITEMS = (
    ("黑色短袖（演示）", "上衣", "黑", "棉", "薄", "春、夏、秋", "简约、休闲", "通勤、周末休闲", "top-black.jpg"),
    ("白色短袖（演示）", "上衣", "白", "棉", "薄", "春、夏", "简约、休闲", "通勤、周末休闲", "top-white.jpg"),
    ("灰白连帽衫（演示）", "上衣", "灰", "棉", "中等", "春、秋", "简约、运动风", "周末休闲、通勤", "top-hoodie.jpg"),
    ("蓝色牛仔裤（演示）", "下装", "蓝", "牛仔", "中等", "春、秋", "简约、复古", "周末休闲、通勤", "bottom-jeans.jpg"),
    ("卡其长裤（演示）", "下装", "卡其", "棉", "中等", "春、秋", "简约、休闲", "通勤、周末休闲", "bottom-khaki.jpg"),
    ("黑色轻薄外套（演示）", "外套", "黑", "棉", "中等", "春、秋", "简约、运动风", "通勤、周末休闲", "outer-black.jpg"),
    ("白灰拼色外套（演示）", "外套", "白、灰", "尼龙", "中等", "春、秋", "简约、运动风", "周末休闲、通勤", "outer-white.jpg"),
    ("白色运动鞋（演示）", "鞋履", "白", "皮革", "薄", "春、夏、秋", "简约、运动风", "周末休闲、通勤", "shoes-white.jpg"),
    ("黑白休闲鞋（演示）", "鞋履", "黑、白", "皮革、织物", "薄", "春、秋", "简约、休闲", "通勤、周末休闲", "shoes-black.jpg"),
    ("白色连衣裙（演示）", "裙装", "白", "棉", "薄", "春、夏", "简约、法式", "通勤、约会", "dress-white.jpg"),
    ("黑色连衣裙（演示）", "裙装", "黑", "棉", "薄", "春、夏、秋", "简约、通勤", "通勤、约会", "dress-black.jpg"),
    ("黑色大容量托特包（演示）", "包袋", "黑", "皮革、织物", "薄", "春、夏、秋、冬", "简约、通勤", "通勤、周末休闲", "bag-black.jpg"),
)


def seed_demo_wardrobe(connection, user_id: int) -> None:
    """Seed demo clothes once for a newly-created account.

    These rows intentionally have no special delete protection: after creation
    they are ordinary user-owned clothes and edits/deletes must persist.
    """
    for name, category, color, material, warmth, season, styles, scenes, filename in DEMO_WARDROBE_ITEMS:
        image_url = f"{DEMO_WARDROBE_ASSET_BASE}/demo-wardrobe/{filename}"
        connection.execute(
            """
            INSERT INTO clothes
            (user_id, name, category, subcategory, color, color_other, material, material_other,
             warmth, warmth_other, fit, fit_other, season, style_tags, scene_tags, notes, image_url, created_at)
            SELECT ?, ?, ?, '', ?, '', ?, '', ?, '', '', '', ?, ?, ?, '示例衣物，可自由编辑或删除。', ?, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM clothes WHERE user_id = ? AND name = ? AND image_url = ?
            )
            """,
            (
                user_id, name, category, color, material, warmth, season, styles, scenes,
                image_url, now_iso(), user_id, name, image_url,
            ),
        )


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    avatar: Optional[str] = Field(default=None, max_length=2 * 1024 * 1024)
    bio: Optional[str] = Field(default=None, max_length=500)


class BodyProfileRequest(BaseModel):
    consented: bool
    gender: str = Field(default="", max_length=16)
    height_cm: Optional[float] = Field(default=None, ge=80, le=250)
    weight_kg: Optional[float] = Field(default=None, ge=20, le=350)
    body_proportion: str = Field(default="", max_length=40)
    body_shape: str = Field(default="", max_length=40)
    waist_cm: Optional[float] = Field(default=None, ge=35, le=180)
    hip_cm: Optional[float] = Field(default=None, ge=45, le=220)
    shoulder_cm: Optional[float] = Field(default=None, ge=20, le=80)


class StylingTipRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=32)
    content: str = Field(min_length=1, max_length=1200)
    applicable_body_shapes: List[str] = Field(default_factory=list, max_length=8)
    applicable_weather: List[str] = Field(default_factory=list, max_length=8)
    applicable_scenes: List[str] = Field(default_factory=list, max_length=12)
    applicable_styles: List[str] = Field(default_factory=list, max_length=12)
    counterexamples: str = Field(default="", max_length=800)
    source_note: str = Field(default="", max_length=500)


class StylingTipReviewRequest(BaseModel):
    status: str = Field(pattern="^(approved|rejected|archived)$")
    review_note: str = Field(default="", max_length=800)


class StylingGuideRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=32)
    goal: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=5000)
    outfit_formula: str = Field(default="", max_length=800)
    applicable_body_shapes: List[str] = Field(default_factory=list, max_length=8)
    applicable_weather: List[str] = Field(default_factory=list, max_length=8)
    applicable_scenes: List[str] = Field(default_factory=list, max_length=12)
    applicable_styles: List[str] = Field(default_factory=list, max_length=12)
    counterexamples: str = Field(default="", max_length=1200)
    source_note: str = Field(default="", max_length=500)


class StylingGuideReviewRequest(BaseModel):
    status: str = Field(pattern="^(approved|rejected|archived)$")
    review_note: str = Field(default="", max_length=800)


class AuthResponse(BaseModel):
    token: str
    user: Dict[str, Any]


class ClothingCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=20)
    subcategory: str = Field(default="", max_length=40)
    color: str = Field(default="未填写", max_length=50)
    color_other: str = Field(default="", max_length=40)
    material: str = Field(default="", max_length=20)
    material_other: str = Field(default="", max_length=40)
    warmth: str = Field(default="", max_length=10)
    warmth_other: str = Field(default="", max_length=40)
    fit: str = Field(default="", max_length=20)
    fit_other: str = Field(default="", max_length=40)
    season: str = Field(default="四季", max_length=50)
    style_tags: str = Field(default="", max_length=200)
    scene_tags: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=500)
    image_url: Optional[str] = Field(default=None, max_length=500)


def _split_clothing_tags(value: str, allowed: tuple, limit: int) -> List[str]:
    """规范化受控多选字段，拒绝模型或旧客户端写入的脏标签。"""
    items = [part.strip() for part in str(value or "").replace("/", "、").replace(",", "、").replace("，", "、").split("、")]
    if allowed == CLOTHING_STYLES:
        aliases = {
            "优雅": "优雅知性", "气质": "优雅知性", "法式": "优雅知性",
            "学院": "复古", "英伦": "复古",
            "运动风": "户外运动", "户外机能": "户外运动", "户外": "户外运动",
            "极简": "简约", "实穿": "简约", "休闲": "简约", "日常": "简约",
            "甜系": "甜美",
        }
        items = [aliases.get(item, item) for item in items]
    elif allowed == CLOTHING_SCENES:
        aliases = {
            "通勤": "通勤工作", "出差": "通勤工作",
            "正式": "正式场合",
            "日常": "日常休闲", "周末": "日常休闲", "周末休闲": "日常休闲",
            "旅行": "旅行度假", "度假": "旅行度假",
            "聚会": "聚会社交", "看秀": "聚会社交",
            "运动": "运动户外", "运动健身": "运动户外", "户外": "运动户外",
        }
        items = [aliases.get(item, item) for item in items]
    return list(dict.fromkeys(item for item in items if item in allowed))[:limit]


def _normalize_clothing_payload(request: ClothingCreateRequest) -> Dict[str, str]:
    category = request.category.strip()
    if category not in CLOTHING_CATEGORIES:
        raise HTTPException(status_code=422, detail="衣物分类不在标准分类中")

    colors = _split_clothing_tags(request.color, CLOTHING_COLORS, 2)
    seasons = _split_clothing_tags(request.season, CLOTHING_SEASONS, 4)
    styles = _split_clothing_tags(request.style_tags, CLOTHING_STYLES, 3)
    scenes = _split_clothing_tags(request.scene_tags, CLOTHING_SCENES, 3)
    materials = _split_clothing_tags(request.material, CLOTHING_MATERIALS, 3)
    warmths = _split_clothing_tags(request.warmth, CLOTHING_WARMTHS, 3)
    fits = _split_clothing_tags(request.fit, CLOTHING_FITS, 3)

    return {
        "name": request.name.strip(),
        "category": category,
        "subcategory": request.subcategory.strip(),
        "color": "、".join(colors),
        "color_other": request.color_other.strip(),
        "material": "、".join(materials),
        "material_other": request.material_other.strip(),
        "warmth": "、".join(warmths),
        "warmth_other": request.warmth_other.strip(),
        "fit": "、".join(fits),
        "fit_other": request.fit_other.strip(),
        "season": "、".join(seasons),
        "style_tags": "、".join(styles),
        "scene_tags": "、".join(scenes),
        "notes": request.notes.strip(),
        "image_url": (request.image_url or "").strip() or None,
    }


class WeatherInput(BaseModel):
    temperature: float = 20
    precipitation: float = 0
    windSpeed: float = 0
    weatherLabel: str = "晴"
    warmthNeed: str = "medium"
    city: str = ""


class RecommendationRequest(BaseModel):
    scene: str = Field(default="日常通勤", max_length=100)
    # 天气支持两种格式：老前端传字符串摘要，新前端传结构化对象。
    weather: Union[str, WeatherInput] = "未知"
    style_preference: str = Field(default="简洁、实穿", max_length=200)
    extra_request: str = Field(default="", max_length=500)


class OutfitRecordCreateRequest(BaseModel):
    recommendation_text: str = Field(min_length=1, max_length=5000)
    scene: str = Field(default="日常通勤", max_length=100)
    weather: str = Field(default="未知", max_length=600)
    selected_clothing_ids: List[int] = Field(default_factory=list)
    ai_provider: Optional[str] = Field(default=None, max_length=100)
    ai_model: Optional[str] = Field(default=None, max_length=100)
    aesthetic_version: Optional[str] = Field(default=None, max_length=40)
    aesthetic_score: Optional[float] = Field(default=None, ge=0, le=100)
    aesthetic_scores: Dict[str, float] = Field(default_factory=dict)


class LinkCreateRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str = Field(default="", max_length=200)
    note: str = Field(default="", max_length=1000)
    tags: List[str] = Field(default_factory=list)


class LinkUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    tags: Optional[List[str]] = Field(default=None)


class BloggerCollectionRequest(BaseModel):
    saved: bool
    recommendation_id: Optional[str] = Field(default=None, max_length=36)


# ---- 数据库引擎（SQLAlchemy）：优先 PostgreSQL(DATABASE_URL)，否则回退本地 SQLite ----
def _normalize_db_url(url: str) -> str:
    # Render 提供的是 postgres://，SQLAlchemy 需要 postgresql://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if DATABASE_URL:
    ENGINE = create_engine(_normalize_db_url(DATABASE_URL), pool_pre_ping=True)
else:
    # 本地开发回退：SQLite 文件
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ENGINE = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )

IS_POSTGRES = ENGINE.dialect.name == "postgresql"


class _DBResult:
    """兼容旧的 sqlite3 cursor 接口：fetchone / fetchall / lastrowid。"""

    def __init__(self, rows: List[Dict[str, Any]], lastrowid: Any) -> None:
        self._rows = rows
        self.lastrowid = lastrowid

    def fetchone(self) -> Optional[Dict[str, Any]]:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> List[Dict[str, Any]]:
        return list(self._rows)


class _DBConn:
    """让旧代码继续用 connection.execute(sql, tuple) + '?' 占位符。"""

    def __init__(self, sa_conn: Any) -> None:
        self._conn = sa_conn

    def execute(self, sql: str, params: Any = ()) -> _DBResult:
        seq = list(params) if isinstance(params, (list, tuple)) else [params]
        idx = 0
        out = []
        for ch in sql:
            if ch == "?":
                out.append(f":p{idx}")
                idx += 1
            else:
                out.append(ch)
        converted = "".join(out)
        bind = {f"p{i}": v for i, v in enumerate(seq)}

        is_insert = converted.lstrip().upper().startswith("INSERT")
        if is_insert and IS_POSTGRES and "RETURNING" not in converted.upper():
            converted = converted.rstrip().rstrip(";") + " RETURNING id"

        result = self._conn.execute(text(converted), bind)

        rows: List[Dict[str, Any]] = []
        lastrowid: Any = None
        if result.returns_rows:
            mapped = result.mappings().all()
            rows = [dict(m) for m in mapped]
            if is_insert and IS_POSTGRES and mapped:
                lastrowid = mapped[0].get("id")
        if is_insert and lastrowid is None:
            try:
                lastrowid = result.lastrowid
            except Exception:
                lastrowid = None
        return _DBResult(rows, lastrowid)


@contextmanager
def get_db():
    connection = ENGINE.connect()
    transaction = connection.begin()
    try:
        yield _DBConn(connection)
        transaction.commit()
    except Exception:
        transaction.rollback()
        raise
    finally:
        connection.close()


def ensure_directories() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class BloggerImportItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=100)
    profile_url: str = Field(default="", max_length=500)
    tags: List[str] = Field(default_factory=list)
    valid_outfit_count: int = Field(default=0)


class BloggerCoverImportItem(BaseModel):
    image_url: str = Field(min_length=1, max_length=3000)
    note_url: str = Field(min_length=1, max_length=3000)
    title: str = Field(default="", max_length=200)


class BloggerMediaImportItem(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    avatar_url: str = Field(default="", max_length=3000)
    covers: List[BloggerCoverImportItem] = Field(default_factory=list, max_items=6)


class StyleBehaviorRequest(BaseModel):
    style_tag: str = Field(min_length=1, max_length=50)
    action_type: str = Field(min_length=1, max_length=50)


def init_db() -> None:
    ensure_directories()
    id_col = "id SERIAL PRIMARY KEY" if IS_POSTGRES else "id INTEGER PRIMARY KEY AUTOINCREMENT"
    with get_db() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS media_cleanup_jobs (
                id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, image_url TEXT NOT NULL,
                status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS users (
                {id_col},
                email TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                avatar TEXT,
                bio TEXT,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                demo_wardrobe_seeded INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        if IS_POSTGRES:
            connection.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT")
            connection.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT")
            connection.execute(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_wardrobe_seeded INTEGER NOT NULL DEFAULT 0"
            )
        else:
            user_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()
            }
            if "avatar" not in user_columns:
                connection.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
            if "bio" not in user_columns:
                connection.execute("ALTER TABLE users ADD COLUMN bio TEXT")
            if "demo_wardrobe_seeded" not in user_columns:
                connection.execute(
                    "ALTER TABLE users ADD COLUMN demo_wardrobe_seeded INTEGER NOT NULL DEFAULT 0"
                )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_body_profiles (
                user_id INTEGER PRIMARY KEY,
                consented INTEGER NOT NULL DEFAULT 0,
                gender TEXT NOT NULL DEFAULT '',
                height_cm REAL,
                weight_kg REAL,
                body_proportion TEXT NOT NULL DEFAULT '',
                body_shape TEXT NOT NULL DEFAULT '',
                waist_cm REAL,
                hip_cm REAL,
                shoulder_cm REAL,
                fit_concerns TEXT NOT NULL DEFAULT '[]',
                usual_top_size TEXT NOT NULL DEFAULT '',
                usual_bottom_size TEXT NOT NULL DEFAULT '',
                styling_goals TEXT NOT NULL DEFAULT '[]',
                profile_version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        if IS_POSTGRES:
            body_profile_columns = {
                row["column_name"] for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = 'user_body_profiles'"
                ).fetchall()
            }
        else:
            body_profile_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(user_body_profiles)").fetchall()
            }
        for column, definition in (
            ("gender", "TEXT NOT NULL DEFAULT ''"),
            ("body_proportion", "TEXT NOT NULL DEFAULT ''"),
            ("waist_cm", "REAL"),
            ("hip_cm", "REAL"),
            ("shoulder_cm", "REAL"),
        ):
            if column not in body_profile_columns:
                connection.execute(f"ALTER TABLE user_body_profiles ADD COLUMN {column} {definition}")
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS styling_tips (
                {id_col},
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                content TEXT NOT NULL,
                applicable_body_shapes TEXT NOT NULL DEFAULT '[]',
                applicable_weather TEXT NOT NULL DEFAULT '[]',
                applicable_scenes TEXT NOT NULL DEFAULT '[]',
                applicable_styles TEXT NOT NULL DEFAULT '[]',
                counterexamples TEXT NOT NULL DEFAULT '',
                source_note TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS styling_guides (
                {id_col},
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                goal TEXT NOT NULL,
                content TEXT NOT NULL,
                outfit_formula TEXT NOT NULL DEFAULT '',
                applicable_body_shapes TEXT NOT NULL DEFAULT '[]',
                applicable_weather TEXT NOT NULL DEFAULT '[]',
                applicable_scenes TEXT NOT NULL DEFAULT '[]',
                applicable_styles TEXT NOT NULL DEFAULT '[]',
                counterexamples TEXT NOT NULL DEFAULT '',
                source_note TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS clothes (
                {id_col},
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                subcategory TEXT NOT NULL DEFAULT '',
                color TEXT,
                color_other TEXT NOT NULL DEFAULT '',
                material TEXT NOT NULL DEFAULT '',
                material_other TEXT NOT NULL DEFAULT '',
                warmth TEXT NOT NULL DEFAULT '',
                warmth_other TEXT NOT NULL DEFAULT '',
                fit TEXT NOT NULL DEFAULT '',
                fit_other TEXT NOT NULL DEFAULT '',
                season TEXT,
                style_tags TEXT,
                scene_tags TEXT NOT NULL DEFAULT '',
                notes TEXT,
                image_url TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        if IS_POSTGRES:
            for column, definition in (
                ("subcategory", "TEXT NOT NULL DEFAULT ''"),
                ("color_other", "TEXT NOT NULL DEFAULT ''"),
                ("material", "TEXT NOT NULL DEFAULT ''"),
                ("material_other", "TEXT NOT NULL DEFAULT ''"),
                ("warmth", "TEXT NOT NULL DEFAULT ''"),
                ("warmth_other", "TEXT NOT NULL DEFAULT ''"),
                ("fit", "TEXT NOT NULL DEFAULT ''"),
                ("fit_other", "TEXT NOT NULL DEFAULT ''"),
                ("scene_tags", "TEXT NOT NULL DEFAULT ''"),
            ):
                connection.execute(f"ALTER TABLE clothes ADD COLUMN IF NOT EXISTS {column} {definition}")
        else:
            clothes_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(clothes)").fetchall()
            }
            for column, definition in (
                ("subcategory", "TEXT NOT NULL DEFAULT ''"),
                ("color_other", "TEXT NOT NULL DEFAULT ''"),
                ("material", "TEXT NOT NULL DEFAULT ''"),
                ("material_other", "TEXT NOT NULL DEFAULT ''"),
                ("warmth", "TEXT NOT NULL DEFAULT ''"),
                ("warmth_other", "TEXT NOT NULL DEFAULT ''"),
                ("fit", "TEXT NOT NULL DEFAULT ''"),
                ("fit_other", "TEXT NOT NULL DEFAULT ''"),
                ("scene_tags", "TEXT NOT NULL DEFAULT ''"),
            ):
                if column not in clothes_columns:
                    connection.execute(f"ALTER TABLE clothes ADD COLUMN {column} {definition}")
        # Migrate legacy controlled values so the homepage, AI analysis and
        # wardrobe editor all read the same style/scene vocabulary.
        for row in connection.execute(
            "SELECT id, style_tags, scene_tags FROM clothes"
        ).fetchall():
            normalized_styles = "、".join(
                _split_clothing_tags(row.get("style_tags") or "", CLOTHING_STYLES, 3)
            )
            normalized_scenes = "、".join(
                _split_clothing_tags(row.get("scene_tags") or "", CLOTHING_SCENES, 3)
            )
            if normalized_styles != (row.get("style_tags") or "") or normalized_scenes != (row.get("scene_tags") or ""):
                connection.execute(
                    "UPDATE clothes SET style_tags = ?, scene_tags = ? WHERE id = ?",
                    (normalized_styles, normalized_scenes, row["id"]),
                )
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS outfit_records (
                {id_col},
                user_id INTEGER NOT NULL,
                scene TEXT NOT NULL,
                weather TEXT NOT NULL,
                recommendation_text TEXT NOT NULL,
                selected_clothing_ids TEXT NOT NULL,
                ai_provider TEXT,
                ai_model TEXT,
                created_at TEXT NOT NULL,
                aesthetic_version TEXT,
                aesthetic_score REAL,
                aesthetic_scores TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        # Keep existing SQLite/PostgreSQL databases forward-compatible.
        outfit_columns = {
            row["name"] for row in connection.execute(
                "SELECT column_name AS name FROM information_schema.columns "
                "WHERE table_name = 'outfit_records'"
            ).fetchall()
        } if IS_POSTGRES else {
            row["name"] for row in connection.execute("PRAGMA table_info(outfit_records)").fetchall()
        }
        for column, definition in (
            ("aesthetic_version", "TEXT"),
            ("aesthetic_score", "REAL"),
            ("aesthetic_scores", "TEXT"),
        ):
            if column not in outfit_columns:
                if IS_POSTGRES:
                    connection.execute(
                        f"ALTER TABLE outfit_records ADD COLUMN IF NOT EXISTS {column} {definition}"
                    )
                else:
                    connection.execute(f"ALTER TABLE outfit_records ADD COLUMN {column} {definition}")
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS inspiration_links (
                {id_col},
                user_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT,
                note TEXT,
                tags TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )


@app.on_event("startup")
def on_startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    # Existing installations keep all saved links. NULL identifies ordinary links.
    if "blogger_id" not in {col["name"] for col in inspect(ENGINE).get_columns("inspiration_links")}:
        with get_db() as connection:
            connection.execute("ALTER TABLE inspiration_links ADD COLUMN blogger_id TEXT")
    with get_db() as connection:
        connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS saved_blogger_unique ON inspiration_links(user_id, blogger_id)")
    init_blogger_tables()
    blogger_ops.init_tables(get_db)
    seed_verified_blogger_media()


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def seed_verified_blogger_media() -> None:
    """Restore the verified Cloudinary preview index on a fresh deployment."""
    seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blogger-media-seed.json")
    if not os.path.exists(seed_path):
        return
    try:
        with open(seed_path, encoding="utf-8") as seed_file:
            rows = json.load(seed_file)
        with get_db() as connection:
            for row in rows:
                covers = json.loads(row.get("covers") or "[]")
                if not covers:
                    continue
                connection.execute(
                    """INSERT INTO blogger_media (id, avatar_url, covers, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      avatar_url=excluded.avatar_url,
                      covers=excluded.covers,
                      updated_at=excluded.updated_at""",
                    (row["id"], row.get("avatar_url") or "",
                     json.dumps(covers, ensure_ascii=False), now_iso()),
                )
                for cover in covers:
                    connection.execute(
                        """INSERT INTO blogger_assets
                        (id, blogger_id, kind, source_url, source_page, rights_basis,
                         captured_at, storage_url, content_hash, width, height,
                         status, created_at, title)
                        VALUES (?, ?, 'cover', ?, ?, ?, ?, ?, ?, 1080, 1440,
                                'active', ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                          storage_url=excluded.storage_url,
                          content_hash=excluded.content_hash,
                          status='active'""",
                        (cover["asset_id"], row["id"], cover["image_url"],
                         cover.get("note_url") or "", "已核验博主预览图，Cloudinary 媒体种子",
                         now_iso(), cover["image_url"], cover["content_hash"], now_iso(),
                         cover.get("title") or ""),
                    )
                connection.execute(
                    """INSERT INTO blogger_publication
                    (blogger_id, manual_state, health, checked_at, check_detail, updated_at)
                    VALUES (?, 'active', 'ok', ?, ?, ?)
                    ON CONFLICT(blogger_id) DO UPDATE SET
                      manual_state='active', health='ok',
                      checked_at=excluded.checked_at,
                      check_detail=excluded.check_detail,
                      updated_at=excluded.updated_at""",
                    (row["id"], now_iso(), "预览媒体已从 Cloudinary 种子恢复", now_iso()),
                )
    except Exception:
        # A bad optional seed must not prevent the API from starting.
        return


def hash_password(password: str, salt: str) -> str:
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return hashed.hex()


def encode_token(payload: Dict[str, Any]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8").rstrip("=")
    signature = hmac.new(TOKEN_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    sig = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{body}.{sig}"


def decode_token(token: str) -> Dict[str, Any]:
    try:
        body, sig = token.split(".", 1)
        expected = base64.urlsafe_b64encode(
            hmac.new(TOKEN_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
        ).decode("utf-8").rstrip("=")
        if not hmac.compare_digest(sig, expected):
            raise ValueError("invalid signature")
        padded_body = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_body.encode("utf-8")).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("token expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="登录态无效，请重新登录") from exc


def create_access_token(user_id: int) -> str:
    return encode_token({"sub": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS})


def serialize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "avatar": row.get("avatar") or "",
        "bio": row.get("bio") or "",
        "created_at": row["created_at"],
    }


def _json_list(value: Any) -> List[str]:
    try:
        parsed = json.loads(value or "[]") if isinstance(value, str) else list(value or [])
    except (TypeError, ValueError):
        parsed = []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _serialize_body_profile(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not row:
        return {
            "consented": False, "gender": "", "height_cm": None, "weight_kg": None,
            "body_proportion": "", "body_shape": "", "waist_cm": None, "hip_cm": None,
            "shoulder_cm": None, "profile_version": 0, "updated_at": None,
        }
    return {
        "consented": bool(row.get("consented")),
        "gender": row.get("gender") or "",
        "height_cm": row.get("height_cm"),
        "weight_kg": row.get("weight_kg"),
        "body_proportion": row.get("body_proportion") or "",
        "body_shape": row.get("body_shape") or "",
        "waist_cm": row.get("waist_cm"),
        "hip_cm": row.get("hip_cm"),
        "shoulder_cm": row.get("shoulder_cm"),
        "profile_version": int(row.get("profile_version") or 0),
        "updated_at": row.get("updated_at"),
    }


def _serialize_styling_tip(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"], "title": row["title"], "category": row["category"],
        "content": row["content"],
        "applicable_body_shapes": _json_list(row.get("applicable_body_shapes")),
        "applicable_weather": _json_list(row.get("applicable_weather")),
        "applicable_scenes": _json_list(row.get("applicable_scenes")),
        "applicable_styles": _json_list(row.get("applicable_styles")),
        "counterexamples": row.get("counterexamples") or "",
        "source_note": row.get("source_note") or "", "status": row.get("status") or "draft",
        "review_note": row.get("review_note") or "", "reviewed_at": row.get("reviewed_at"),
        "created_at": row.get("created_at"), "updated_at": row.get("updated_at"),
    }


def _serialize_styling_guide(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"], "title": row["title"], "category": row["category"],
        "goal": row.get("goal") or "", "content": row["content"],
        "outfit_formula": row.get("outfit_formula") or "",
        "applicable_body_shapes": _json_list(row.get("applicable_body_shapes")),
        "applicable_weather": _json_list(row.get("applicable_weather")),
        "applicable_scenes": _json_list(row.get("applicable_scenes")),
        "applicable_styles": _json_list(row.get("applicable_styles")),
        "counterexamples": row.get("counterexamples") or "",
        "source_note": row.get("source_note") or "", "status": row.get("status") or "draft",
        "review_note": row.get("review_note") or "", "reviewed_at": row.get("reviewed_at"),
        "created_at": row.get("created_at"), "updated_at": row.get("updated_at"),
    }


def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少登录凭证")
    payload = decode_token(authorization.split(" ", 1)[1])
    user_id = payload.get("sub")
    with get_db() as connection:
        row = connection.execute(
            "SELECT id, email, display_name, avatar, bio, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="用户不存在或登录已失效")
    return serialize_user(row)


def get_optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[Dict[str, Any]]:
    """可选登录：无凭证或凭证无效时返回 None，不抛 401。用于博主推荐等允许匿名访问的只读接口。"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        payload = decode_token(authorization.split(" ", 1)[1])
        user_id = payload.get("sub")
        with get_db() as connection:
            row = connection.execute(
                "SELECT id, email, display_name, avatar, bio, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
    except Exception:
        return None
    if row is None:
        return None
    return serialize_user(row)


@app.get("/api")
def index_handler() -> Dict[str, str]:
    return {"message": "衣见后端服务运行中"}


@app.get("/api/v1/ping")
def ping_handler() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/register", response_model=AuthResponse)
def register(request: RegisterRequest) -> AuthResponse:
    email = request.email.strip().lower()
    salt = secrets.token_hex(16)
    password_hash = hash_password(request.password, salt)
    created_at = now_iso()
    try:
        with get_db() as connection:
            cursor = connection.execute(
                "INSERT INTO users (email, display_name, password_hash, password_salt, created_at, demo_wardrobe_seeded) VALUES (?, ?, ?, ?, ?, 1)",
                (email, request.display_name.strip(), password_hash, salt, created_at),
            )
            user_id = cursor.lastrowid
            seed_demo_wardrobe(connection, int(user_id))
            row = connection.execute(
                "SELECT id, email, display_name, avatar, bio, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
    except IntegrityError as exc:
        raise HTTPException(status_code=400, detail="该邮箱已注册") from exc
    token = create_access_token(int(user_id))
    return AuthResponse(token=token, user=serialize_user(row))


@app.post("/api/v1/auth/login", response_model=AuthResponse)
def login(request: LoginRequest) -> AuthResponse:
    email = request.email.strip().lower()
    with get_db() as connection:
        row = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    password_hash = hash_password(request.password, row["password_salt"])
    if not hmac.compare_digest(password_hash, row["password_hash"]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    if not row.get("demo_wardrobe_seeded"):
        with get_db() as connection:
            seed_demo_wardrobe(connection, int(row["id"]))
            connection.execute(
                "UPDATE users SET demo_wardrobe_seeded = 1 WHERE id = ?",
                (row["id"],),
            )
    token = create_access_token(int(row["id"]))
    return AuthResponse(token=token, user=serialize_user(row))


@app.get("/api/v1/auth/me")
def auth_me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": current_user}


@app.get("/api/v1/profile")
def get_profile(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        body_profile = connection.execute(
            "SELECT * FROM user_body_profiles WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
    return {"user": serialize_user(current_user), "body_profile": _serialize_body_profile(body_profile)}


@app.put("/api/v1/profile")
def update_profile(
    request: ProfileUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    with get_db() as connection:
        connection.execute(
            "UPDATE users SET display_name = ?, avatar = ?, bio = ? WHERE id = ?",
            (
                request.display_name.strip(),
                request.avatar,
                request.bio,
                current_user["id"],
            ),
        )
        row = connection.execute(
            "SELECT id, email, display_name, avatar, bio, created_at FROM users WHERE id = ?",
            (current_user["id"],),
        ).fetchone()
    return {"user": serialize_user(row)}


@app.get("/api/v1/user-body")
def get_body_profile(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        row = connection.execute(
            "SELECT * FROM user_body_profiles WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
    return {"profile": _serialize_body_profile(row)}


@app.put("/api/v1/user-body")
def update_body_profile(
    request: BodyProfileRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if request.consented and (not request.gender or request.height_cm is None or request.weight_kg is None):
        raise HTTPException(422, "请填写性别、身高和体重，才能用于搭配")
    now = now_iso()
    values = (
        1 if request.consented else 0,
        request.gender.strip() if request.consented else "",
        request.height_cm if request.consented else None,
        request.weight_kg if request.consented else None,
        request.body_proportion.strip() if request.consented else "",
        request.body_shape.strip() if request.consented else "",
        request.waist_cm if request.consented else None,
        request.hip_cm if request.consented else None,
        request.shoulder_cm if request.consented else None,
    )
    with get_db() as connection:
        existing = connection.execute(
            "SELECT profile_version FROM user_body_profiles WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
        if existing:
            connection.execute(
                """
                UPDATE user_body_profiles SET consented = ?, gender = ?, height_cm = ?, weight_kg = ?,
                    body_proportion = ?, body_shape = ?, waist_cm = ?, hip_cm = ?, shoulder_cm = ?,
                    profile_version = profile_version + 1, updated_at = ? WHERE user_id = ?
                """,
                values + (now, current_user["id"]),
            )
        else:
            connection.execute(
                """
                INSERT INTO user_body_profiles
                (user_id, consented, gender, height_cm, weight_kg, body_proportion, body_shape,
                 waist_cm, hip_cm, shoulder_cm, profile_version, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (current_user["id"],) + values + (now,),
            )
        row = connection.execute(
            "SELECT * FROM user_body_profiles WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
    return {"profile": _serialize_body_profile(row)}


@app.post("/api/v1/upload")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """上传头像图片，返回可访问的 URL"""
    ext = Path(file.filename).suffix.lower() if file.filename else ".png"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".png"
    content = await file.read()
    if CLOUDINARY_ENABLED:
        url = _upload_image_to_storage(
            io.BytesIO(content),
            user_id=int(current_user["id"]),
            category="avatar",
            extension=ext,
        )
    else:
        filename = f"{uuid.uuid4().hex}{ext}"
        save_path = AVATAR_DIR / filename
        save_path.write_bytes(content)
        url = f"/static/avatars/{filename}"
    return {"url": url}

@app.get("/api/v1/clothes")
def list_clothes(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        rows = connection.execute(
            "SELECT * FROM clothes WHERE user_id = ? AND category != '连体' ORDER BY id DESC",
            (current_user["id"],),
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


@app.post("/api/v1/clothes")
def create_clothing(request: ClothingCreateRequest, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    item = _normalize_clothing_payload(request)
    created_at = now_iso()
    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO clothes
            (user_id, name, category, subcategory, color, color_other, material, material_other, warmth, warmth_other,
             fit, fit_other, season, style_tags, scene_tags, notes, image_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                item["name"],
                item["category"],
                item["subcategory"],
                item["color"],
                item["color_other"],
                item["material"],
                item["material_other"],
                item["warmth"],
                item["warmth_other"],
                item["fit"],
                item["fit_other"],
                item["season"],
                item["style_tags"],
                item["scene_tags"],
                item["notes"],
                item["image_url"],
                created_at,
            ),
        )
        item_id = cursor.lastrowid
        row = connection.execute("SELECT * FROM clothes WHERE id = ?", (item_id,)).fetchone()
    return {"item": dict(row)}


@app.put("/api/v1/clothes/{item_id}")
def update_clothing(item_id: int, request: ClothingCreateRequest, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    item = _normalize_clothing_payload(request)
    with get_db() as connection:
        row = connection.execute(
            "SELECT * FROM clothes WHERE id = ? AND user_id = ?",
            (item_id, current_user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="这件衣服不存在或已删除")
        connection.execute(
            """
            UPDATE clothes
            SET name = ?, category = ?, subcategory = ?, color = ?, color_other = ?, material = ?, material_other = ?,
                warmth = ?, warmth_other = ?, fit = ?, fit_other = ?, season = ?, style_tags = ?, scene_tags = ?,
                notes = ?, image_url = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                item["name"],
                item["category"],
                item["subcategory"],
                item["color"],
                item["color_other"],
                item["material"],
                item["material_other"],
                item["warmth"],
                item["warmth_other"],
                item["fit"],
                item["fit_other"],
                item["season"],
                item["style_tags"],
                item["scene_tags"],
                item["notes"],
                item["image_url"],
                item_id,
                current_user["id"],
            ),
        )
        updated = connection.execute(
            "SELECT * FROM clothes WHERE id = ? AND user_id = ?",
            (item_id, current_user["id"]),
        ).fetchone()
    return {"item": dict(updated)}


@app.delete("/api/v1/clothes/{item_id}")
def delete_clothing(item_id: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    job_id = uuid.uuid4().hex
    with get_db() as connection:
        row = connection.execute(
            "SELECT id, image_url FROM clothes WHERE id = ? AND user_id = ?",
            (item_id, current_user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="这件衣服不存在或已删除")
        connection.execute(
            "DELETE FROM clothes WHERE id = ? AND user_id = ?",
            (item_id, current_user["id"]),
        )
        connection.execute(
            "INSERT INTO media_cleanup_jobs (id,user_id,image_url,status,created_at) VALUES (?,?,?,?,?)",
            (job_id, current_user["id"], row["image_url"] or "", "pending", now_iso()))
    cleanup = process_media_cleanup(job_id)
    return {"ok": True, "deleted_id": item_id, "media_cleanup": cleanup}


def process_media_cleanup(job_id: str) -> str:
    """Only remove owned uploads; failed jobs stay durable for explicit retry."""
    with get_db() as connection:
        job = connection.execute("SELECT * FROM media_cleanup_jobs WHERE id = ?", (job_id,)).fetchone()
        if not job or job["status"] != "pending":
            return job["status"] if job else "missing"
        url = job["image_url"]
        shared = connection.execute(
            "SELECT id FROM clothes WHERE image_url = ? UNION ALL SELECT id FROM users WHERE avatar = ?",
            (url, url)).fetchone() if url else None
    status = "retained_shared" if shared else "not_managed"
    try:
        if not shared and url:
            public_id = _cloudinary_public_id_from_url(url)
            if public_id and public_id.startswith(f"yijian/{job['user_id']}/"):
                if not CLOUDINARY_ENABLED:
                    status = "pending"
                else:
                    result = cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True, timeout=30)
                    status = "deleted" if result.get("result") in ("ok", "not found") else "pending"
            elif url.startswith(f"/api/v1/uploads/{job['user_id']}/"):
                owner_dir = (UPLOAD_DIR / str(job["user_id"])).resolve()
                target = (UPLOAD_DIR / url[len("/api/v1/uploads/"):]).resolve()
                if owner_dir in target.parents:
                    target.unlink(missing_ok=True)
                    status = "deleted"
    except Exception:
        status = "pending"
    with get_db() as connection:
        connection.execute("UPDATE media_cleanup_jobs SET status = ?, attempts = attempts + 1 WHERE id = ?",
                           (status, job_id))
    return status


@app.post("/api/v1/uploads")
def upload_file(
    file: UploadFile = File(...),
    category: str = Form(default="clothes"),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    extension = Path(file.filename or "upload.bin").suffix.lower()
    url = _upload_image_to_storage(
        file.file,
        user_id=int(current_user["id"]),
        category=category,
        extension=extension,
    )
    return {"url": url}


@app.get("/api/v1/uploads/{file_path:path}")
def serve_upload(file_path: str) -> FileResponse:
    target = (UPLOAD_DIR / file_path).resolve()
    if not str(target).startswith(str(UPLOAD_DIR.resolve())) or not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(target)


def _clothing_analysis_prompt() -> str:
    return f"""识别图片中最主要的一件服饰，用于衣橱录入。只返回合法 JSON object，不要 Markdown。
不确定的字段返回空字符串或空数组，不得猜测品牌、价格、成分比例或穿着者信息。
字段结构必须为：
{{
  "name": "简短中文名称",
  "category": "一级分类",
  "subcategory": "具体品类",
  "color": ["颜色"],
  "material": "材质",
  "warmth": "厚薄",
  "fit": "版型",
  "season": ["季节"],
  "style_tags": ["风格"],
  "scene_tags": ["场景"],
  "confidence": 0.0
}}
一级分类只能是：{list(CLOTHING_CATEGORIES)}
颜色只能从：{list(CLOTHING_COLORS)} 中选，最多 2 个。
材质只能从：{list(CLOTHING_MATERIALS)} 中选，最多 3 个。
厚薄只能从：{list(CLOTHING_WARMTHS)} 中选，最多 3 个。
版型只能从：{list(CLOTHING_FITS)} 中选，最多 3 个。
季节只能从：{list(CLOTHING_SEASONS)} 中选，最多 4 个。
风格只能从：{list(CLOTHING_STYLES)} 中选，最多 3 个。
场景只能从：{list(CLOTHING_SCENES)} 中选，最多 3 个。"""


def _analysis_text_list(value: Any, allowed: tuple, limit: int) -> List[str]:
    if isinstance(value, list):
        raw = "、".join(str(part) for part in value)
    else:
        raw = str(value or "")
    return _split_clothing_tags(raw, allowed, limit)


def _parse_clothing_analysis(content: str) -> Dict[str, Any]:
    raw = (content or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="图片识别服务返回不是合法 JSON") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="图片识别服务返回结构错误")

    category = str(data.get("category") or "").strip()
    if category not in CLOTHING_CATEGORIES:
        category = ""
    confidence = data.get("confidence", 0)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "name": str(data.get("name") or "").strip()[:100],
        "category": category,
        "subcategory": str(data.get("subcategory") or "").strip()[:40],
        "color": "、".join(_analysis_text_list(data.get("color"), CLOTHING_COLORS, 2)),
        "material": "、".join(_analysis_text_list(data.get("material"), CLOTHING_MATERIALS, 3)),
        "warmth": "、".join(_analysis_text_list(data.get("warmth"), CLOTHING_WARMTHS, 3)),
        "fit": "、".join(_analysis_text_list(data.get("fit"), CLOTHING_FITS, 3)),
        "season": "、".join(_analysis_text_list(data.get("season"), CLOTHING_SEASONS, 4)),
        "style_tags": "、".join(_analysis_text_list(data.get("style_tags"), CLOTHING_STYLES, 3)),
        "scene_tags": "、".join(_analysis_text_list(data.get("scene_tags"), CLOTHING_SCENES, 3)),
        "confidence": confidence,
    }


@app.post("/api/v1/clothing-analysis")
async def analyze_clothing_image(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """用 DeepSeek Flash 识图并返回可由用户确认的标准化预填字段。"""
    del current_user  # Endpoint is authenticated; no user data is sent to the model.
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="请上传图片文件")
    image_bytes = await file.read()
    if not image_bytes or len(image_bytes) > MAX_CLOTHING_ANALYZE_BYTES:
        raise HTTPException(status_code=422, detail="图片不能为空且不得超过 10MB")

    ai_config = _ai_runtime_config(vision=True)
    api_key = ai_config["api_key"]
    if not api_key:
        raise HTTPException(status_code=503, detail="图片识别尚未配置 DEEPSEEK_API_KEY 或 AI_API_KEY")
    base_url = ai_config["base_url"]
    image_data = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": ai_config["model"],
        "messages": [
            {"role": "system", "content": "你是衣见的衣物图像标注助手。只返回合法 JSON object。"},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _clothing_analysis_prompt()},
                    {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{image_data}", "detail": "low"}},
                ],
            },
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=AI_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="图片识别服务暂时不可用") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"图片识别服务调用失败：{response.text[:300]}")

    response_body = response.json()
    content = response_body.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {
        "item": _parse_clothing_analysis(content),
        "model": ai_config["model"],
        "needs_confirmation": True,
        "provider": base_url,
        "usage": _ai_usage(response_body.get("usage")),
    }


MAIN_BODY_CATEGORIES = {"上衣", "裙装"}
THICK_KEYWORDS = ("羽绒", "棉服", "羊绒", "羊毛", "摇粒绒")


def parse_weather_fields(weather: Any) -> Dict[str, Any]:
    """把 weather（可能是字符串摘要或 WeatherInput 对象）统一解析成结构化字段。"""
    if isinstance(weather, WeatherInput):
        return {
            "city": weather.city or "未知",
            "temperature": weather.temperature,
            "weatherLabel": weather.weatherLabel or "未知",
            "precipitation": weather.precipitation,
            "windSpeed": weather.windSpeed,
            "warmthNeed": weather.warmthNeed or "medium",
        }
    return {
        "city": "未知",
        "temperature": None,
        "weatherLabel": str(weather) if weather is not None else "未知",
        "precipitation": 0,
        "windSpeed": 0,
        "warmthNeed": "medium",
    }


def validate_outfit(rows: List[Dict[str, Any]], temperature: Optional[float]) -> Optional[str]:
    """穿搭硬规则后验校验：返回 None 表示通过，否则返回不通过原因。"""
    if not rows:
        return "AI 未选择任何单品"
    if len(rows) > 6:
        return "单品数量超过 6 件"
    categories = [str(r.get("category") or "").strip() for r in rows]
    cat_set = set(categories)
    # 1. 必须包含主体（上衣/裙装）
    if not (MAIN_BODY_CATEGORIES & cat_set):
        return "缺少主体单品（上衣/裙装）"
    # 2. 必须包含鞋履
    if "鞋履" not in cat_set:
        return "缺少鞋履"
    if "上衣" in cat_set and not ({"下装", "裙装"} & cat_set):
        return "缺少下装"
    if categories.count("鞋履") > 1:
        return "鞋履重复"
    if temperature is not None and temperature <= 12 and "外套" not in cat_set:
        return "低温需要外套"
    # 3. 冲突品类
    if "裙装" in cat_set and "下装" in cat_set:
        return "品类冲突：裙装与下装不可同时出现"
    # 4. 外套 / 包袋 / 配饰数量限制
    if categories.count("外套") > 1:
        return "外套超过 1 件"
    if categories.count("包袋") + categories.count("配饰") > 1:
        return "包袋/配饰超过 1 件"
    # 5. 禁止重复功能位
    if categories.count("上衣") > 1:
        return "上衣重复：不能选两件上衣"
    if categories.count("下装") > 1:
        return "下装重复：不能选两件下装"
    if categories.count("裙装") > 1:
        return "裙装重复：不能选两件裙装"
    # 6. 高温禁厚外套 / 厚上衣
    if temperature is not None and temperature >= 28:
        for r in rows:
            cat = str(r.get("category") or "")
            if cat in ("外套", "上衣"):
                text = " ".join(
                    [
                        str(r.get("name") or ""),
                        str(r.get("notes") or ""),
                        str(r.get("style_tags") or ""),
                        str(r.get("season") or ""),
                    ]
                )
                if any(k in text for k in THICK_KEYWORDS):
                    return f"高温({temperature}°C)下选择了厚重单品：{r.get('name')}"
    return None


def _matching_styling_tips(
    connection: Any,
    body_profile: Dict[str, Any],
    weather: Dict[str, Any],
    scene: str,
    style: str,
) -> List[Dict[str, Any]]:
    rows = connection.execute(
        "SELECT * FROM styling_tips WHERE status = 'approved' ORDER BY id DESC LIMIT 200"
    ).fetchall()
    weather_terms = [weather.get("warmthNeed") or "", weather.get("weatherLabel") or ""]
    body_terms = _body_profile_match_terms(body_profile)
    selected = []
    for row in rows:
        tip = _serialize_styling_tip(row)
        groups = (
            (tip["applicable_body_shapes"], body_terms),
            (tip["applicable_weather"], weather_terms),
            (tip["applicable_scenes"], [scene]),
            (tip["applicable_styles"], [style]),
        )
        # A rule with no limit matches all. If it has a limit, one requested context must match.
        if all(not wanted or any(value and value in wanted for value in values) for wanted, values in groups):
            selected.append(tip)
        if len(selected) == 5:
            break
    return selected


def _body_profile_match_terms(body_profile: Dict[str, Any]) -> List[str]:
    """Return the body-shape and height bands eligible for approved rules."""
    terms = [body_profile.get("body_shape") or ""]
    height = body_profile.get("height_cm")
    if isinstance(height, (int, float)):
        if height <= 158:
            terms.append("小个子")
        elif height >= 168:
            terms.append("高个子")
        else:
            terms.append("中等身高")
    return terms


def _matching_styling_guides(
    connection: Any,
    body_profile: Dict[str, Any],
    weather: Dict[str, Any],
    scene: str,
    style: str,
) -> List[Dict[str, Any]]:
    rows = connection.execute(
        "SELECT * FROM styling_guides WHERE status = 'approved' ORDER BY id DESC LIMIT 100"
    ).fetchall()
    weather_terms = [weather.get("warmthNeed") or "", weather.get("weatherLabel") or ""]
    body_terms = _body_profile_match_terms(body_profile)
    selected = []
    for row in rows:
        guide = _serialize_styling_guide(row)
        groups = (
            (guide["applicable_body_shapes"], body_terms),
            (guide["applicable_weather"], weather_terms),
            (guide["applicable_scenes"], [scene]),
            (guide["applicable_styles"], [style]),
        )
        if all(not wanted or any(value and value in wanted for value in values) for wanted, values in groups):
            selected.append(guide)
        if len(selected) == 3:
            break
    return selected


def build_recommendation_prompt(
    current_user: Dict[str, Any],
    request: RecommendationRequest,
    clothes: List[Dict[str, Any]],
    body_profile: Optional[Dict[str, Any]] = None,
    styling_guides: Optional[List[Dict[str, Any]]] = None,
    styling_tips: Optional[List[Dict[str, Any]]] = None,
) -> str:
    clothing_text = "\n".join(
        [
            f"- id={row['id']}｜名称:{row['name']}｜分类:{row['category']}／{row.get('subcategory') or '未填'}"
            f"｜颜色:{row['color'] or '未填'}｜材质:{row.get('material') or '未填'}"
            f"｜厚薄:{row.get('warmth') or '未填'}｜版型:{row.get('fit') or '未填'}"
            f"｜季节:{row['season'] or '未填'}｜风格:{row['style_tags'] or '未填'}"
            f"｜场景:{row.get('scene_tags') or '未填'}｜备注:{row['notes'] or '无'}"
            for row in clothes
        ]
    )
    valid_ids = [int(row["id"]) for row in clothes]
    w = parse_weather_fields(request.weather)
    temp_text = f"{w['temperature']}" if w["temperature"] is not None else "未知"
    weather_block = f"""
【天气信息】
当前城市：{w['city']}
温度：{temp_text}°C
天气：{w['weatherLabel']}
降水量：{w['precipitation']}mm
保暖需求：{w['warmthNeed']}
"""
    body_profile = body_profile or _serialize_body_profile(None)
    body_block = "【身材资料】\n用户未授权身体资料；不得臆测体型，只按衣物与场景搭配。"
    if body_profile.get("consented"):
        body_block = f"""【用户已授权的身材资料】
性别：{body_profile.get('gender') or '未提供'}
身高：{body_profile.get('height_cm')}cm
体重：{body_profile.get('weight_kg')}kg
身材比例：{body_profile.get('body_proportion') or '未提供'}
身型：{body_profile.get('body_shape') or '未提供'}
三围辅助数据：腰围 {body_profile.get('waist_cm') or '未提供'}cm，臀围 {body_profile.get('hip_cm') or '未提供'}cm，肩宽 {body_profile.get('shoulder_cm') or '未提供'}cm
只能根据以上已授权资料说明比例建议，不得推断未提供的身体信息。"""
    guide_lines = []
    for guide in styling_guides or []:
        guide_lines.append(f"- [{guide['category']}] {guide['title']}")
        guide_lines.append(f"  目标：{guide['goal']}")
        if guide["outfit_formula"]:
            guide_lines.append(f"  组合：{guide['outfit_formula']}")
        guide_lines.append(f"  攻略：{guide['content']}")
        if guide["counterexamples"]:
            guide_lines.append(f"  避雷：{guide['counterexamples']}")
    guides_block = "【审核通过的详细搭配攻略】\n本次没有命中可用攻略；不要编造攻略。" if not guide_lines else (
        "【审核通过的详细搭配攻略】\n" + "\n".join(guide_lines)
        + "\n攻略是本次搭配方案的优先参考；只在匹配当前条件时使用。"
    )
    tip_lines = []
    for tip in styling_tips or []:
        tip_lines.append(f"- [{tip['category']}] {tip['title']}：{tip['content']}")
        if tip["counterexamples"]:
            tip_lines.append(f"  反例/注意：{tip['counterexamples']}")
    tips_block = "【审核通过的审美搭配小 tips】\n本次没有命中可用 tips；不要编造规则。" if not tip_lines else (
        "【审核通过的审美搭配小 tips】\n" + "\n".join(tip_lines)
        + "\n只在与当前身材、天气、场景、风格匹配时使用；硬规则永远优先。"
    )
    rules_block = """
【穿搭硬规则，必须严格遵守】
1. 品类结构：必须包含"上衣"或"裙装"之一作为主体；必须包含"鞋履"；外套最多1件；包袋/配饰最多1件
2. 冲突禁止：不得同时选"裙装"+"下装"
3. 温度规则：
   - 温度 >= 28°C：禁止选择材质含"羽绒/羊绒/羊毛/摇粒绒/厚/棉服"的外套或上衣
   - 温度 >= 25°C：外套为可选，若选外套必须是轻薄款（材质含"薄/雪纺/防晒"等）
   - 温度 <= 12°C：必须搭配外套，优先保暖材质
4. 季节规则：优先选择与当前温度匹配的季节标签单品；若无法满足，在理由中说明
5. 禁止重复：同一功能位不得选两件（不能两件下装、两件主体上衣等）
6. 只能从上方衣物列表中选择，禁止编造不在列表中的单品或id
7. 场景适配（重要，必须优先满足）：所选单品的风格/品类必须与【场景】相符：
   - 运动 / 运动健身 场景：优先选择「运动风 / 户外机能」风格与运动鞋、卫衣、T恤、运动裤等；必须避免连衣裙、正装、高跟鞋等明显不适合运动的单品
   - 正式 / 通勤 / 出差 场景：优先选择简约、正装、优雅风格；避免运动风、过于休闲的单品
   - 约会 / 休闲 / 周末 / 度假 场景：可灵活搭配
   - 若衣橱缺少适合本场景的单品，禁止把明显不搭的单品（如把连衣裙用于运动场景）说成合适；必须在 recommendation_text 中如实说明「衣橱缺少适合该场景的单品」，并给出替代方案与补充建议
"""
    return f"""用户：{current_user['display_name']}
场景：{request.scene}
风格偏好：{request.style_preference}
用户补充：{request.extra_request or '无'}
当前用户真实可用衣物如下，只能从这些衣物中选择，禁止编造不存在的衣物或 id。
{clothing_text}
{weather_block}{body_block}
{guides_block}
{tips_block}
{rules_block}
可选 selected_clothing_ids 只能来自：{valid_ids}
请严格输出一个 JSON object，不要输出 Markdown，不要输出额外解释。结构必须为：{{"recommendation_text": string, "selected_clothing_ids": number[], "tips": string[], "summary": string}}。recommendation_text 用中文说明完整穿搭和理由，并且必须解释"为什么这些单品适合当前【场景】"；若衣橱缺少适合该场景的单品，需如实说明并给出替代/补充建议，不得假装明显不搭的单品适合该场景；tips 给 2-4 条实用提醒；summary 用简洁精炼的中文在 2~3 句话内完整概括这套穿搭的风格与亮点，务必把话说完整、不要为了字数在半途截断。"""


def parse_ai_recommendation_content(content: str, valid_clothing_ids: List[int]) -> Dict[str, Any]:
    raw = (content or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI 服务返回不是合法 JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI 服务返回结构不是 JSON object")

    valid_set = set(int(x) for x in valid_clothing_ids)
    selected_ids: List[int] = []
    for value in parsed.get("selected_clothing_ids", []):
        try:
            clothing_id = int(value)
        except (TypeError, ValueError):
            continue
        if clothing_id in valid_set and clothing_id not in selected_ids:
            selected_ids.append(clothing_id)

    recommendation_text = str(parsed.get("recommendation_text") or parsed.get("summary") or "").strip()
    if not recommendation_text:
        raise HTTPException(status_code=502, detail="AI 服务返回缺少 recommendation_text")
    tips_raw = parsed.get("tips", [])
    tips = [str(x).strip()[:200] for x in tips_raw if str(x).strip()] if isinstance(tips_raw, list) else []
    summary = str(parsed.get("summary") or recommendation_text[:200]).strip()
    purchase_raw = parsed.get("purchase_recommendations", [])
    purchase_recommendations = []
    if isinstance(purchase_raw, list):
        for item in purchase_raw[:3]:
            if not isinstance(item, dict):
                continue
            clean = {
                "role": str(item.get("role") or "衣橱补充").strip()[:80],
                "item_type": str(item.get("item_type") or "").strip()[:120],
                "style": purchase_advisor._style_key(str(item.get("style") or "")),
                "scene": purchase_advisor._scene_key(str(item.get("scene") or "")),
                "style_features": [
                    str(value).strip()[:80]
                    for value in item.get("style_features", [])
                    if str(value).strip()
                ][:5] if isinstance(item.get("style_features", []), list) else [],
                "color_palette": str(item.get("color_palette") or "").strip()[:120],
                "material": str(item.get("material") or "").strip()[:160],
                "fit_and_length": str(item.get("fit_and_length") or "").strip()[:160],
                "match_reason": str(item.get("match_reason") or "").strip()[:240],
                "trigger": str(item.get("trigger") or "").strip()[:160],
                "source": "deepseek",
            }
            if clean["item_type"] and clean["match_reason"]:
                purchase_recommendations.append(clean)
    return {
        "recommendation_text": recommendation_text,
        "selected_clothing_ids": selected_ids,
        "tips": tips[:4],
        "summary": summary[:200],
        "purchase_recommendations": purchase_recommendations,
    }


async def request_ai_recommendation(prompt: str, valid_clothing_ids: List[int]) -> Dict[str, Any]:
    ai_config = _ai_runtime_config()
    api_key = ai_config["api_key"]
    base_url = ai_config["base_url"]
    model = ai_config["model"]
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI 功能尚未接通：后端未配置 AI_API_KEY。可配置 DeepSeek Key 后重试；当前没有假装真实调用。",
        )

    endpoint = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是衣见的智能搭配顾问。必须只基于用户提供的真实衣物 id 做搭配建议，禁止编造衣物。只返回合法 JSON object。",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": float(aesthetic_engine.CONFIG.get("temperature", {}).get("ai_generation", 0.3)),
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=AI_TIMEOUT_SECONDS) as client:
        response = await client.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    if response.status_code >= 400:
        detail = response.text[:500]
        raise HTTPException(status_code=502, detail=f"AI 服务调用失败：{detail}")

    body = response.json()
    content = body.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    if not content:
        raise HTTPException(status_code=502, detail="AI 服务返回为空")
    parsed = parse_ai_recommendation_content(content, valid_clothing_ids)
    return {**parsed, "provider": base_url, "model": model, "usage": _ai_usage(body.get("usage"))}


@app.get("/api/v1/ai-status")
def ai_status() -> Dict[str, Any]:
    """Expose configuration state, never the secret itself, for deployment diagnostics."""
    general = _ai_runtime_config()
    vision = _ai_runtime_config(vision=True)
    return {
        "recommendation": {
            "configured": bool(general["api_key"]),
            "provider": general["base_url"],
            "model": general["model"],
        },
        "vision": {
            "configured": bool(vision["api_key"]),
            "provider": vision["base_url"],
            "model": vision["model"],
        },
        "usage_reporting": True,
    }


@app.post("/api/v1/recommendations")
async def create_recommendation(
    request: RecommendationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    with get_db() as connection:
        clothes = connection.execute(
            """
            SELECT id, name, category, subcategory, color, material, warmth, fit,
                   season, style_tags, scene_tags, notes, image_url
            FROM clothes WHERE user_id = ? AND category != '连体' ORDER BY id DESC
            """,
            (current_user["id"],),
        ).fetchall()
    if not clothes:
        raise HTTPException(status_code=400, detail="请先添加至少一件衣物后再生成推荐")

    valid_clothing_ids = [int(row["id"]) for row in clothes]
    weather_fields = parse_weather_fields(request.weather)
    with get_db() as connection:
        body_row = connection.execute(
            "SELECT * FROM user_body_profiles WHERE user_id = ?", (current_user["id"],)
        ).fetchone()
        body_profile = _serialize_body_profile(body_row)
        styling_tips = _matching_styling_tips(
            connection, body_profile, weather_fields, request.scene, request.style_preference
        )
        styling_guides = _matching_styling_guides(
            connection, body_profile, weather_fields, request.scene, request.style_preference
        )
    prompt = build_recommendation_prompt(
        current_user, request, clothes, body_profile=body_profile,
        styling_guides=styling_guides, styling_tips=styling_tips,
    )
    user_taste = taste.profile(get_db, current_user["id"])
    prompt += taste.prompt_context(user_taste)
    # P1：先由确定性审美层生成并排序候选，再让 AI 解释候选，不再随机打乱衣物。
    aesthetic_candidates = aesthetic_engine.generate_candidates(
        clothes,
        scene=request.scene,
        style=request.style_preference,
        temperature=weather_fields.get("temperature"),
    )
    outfit_status = "complete"
    risk_notice = None
    if not aesthetic_candidates:
        aesthetic_candidates = aesthetic_engine.generate_partial_candidates(
            clothes,
            scene=request.scene,
            style=request.style_preference,
            temperature=weather_fields.get("temperature"),
        )
        outfit_status = "partial_match"
        if aesthetic_candidates:
            risk_notice = "当前衣橱不足以组成完整搭配，以下结果只使用已有单品，并附带补充建议。"
    purchase_recommendations = purchase_advisor.suggest_purchases(
        clothes,
        temperature=weather_fields.get("temperature"),
        style=request.style_preference,
        scene=request.scene,
    )
    if not aesthetic_candidates:
        raise HTTPException(status_code=422, detail="衣橱中暂无可用于搭配的真实单品，请先上传至少一件衣物。")
    if outfit_status == "partial_match":
        advice = purchase_recommendations[0] if purchase_recommendations else None
        if advice:
            prompt += (
                "\n\n本次只能使用现有衣物生成部分搭配。缺失的功能或风格单品不得编造，"
                "请在说明中明确当前缺口，并参考以下购买建议："
                + json.dumps(purchase_recommendations, ensure_ascii=False)
            )
    elif purchase_recommendations:
        prompt += (
            "\n\n确定性衣橱缺口分析（可由大模型进一步细化，但不得忽略）："
            + json.dumps(purchase_recommendations, ensure_ascii=False)
        )
    prompt += (
        "\n\n"
        + aesthetic_engine.candidate_prompt(aesthetic_candidates)
    )
    if outfit_status == "partial_match":
        prompt += (
            "\n本次为部分匹配：只能选择候选中的真实ID；允许缺少鞋履、下装或外套，"
            "但必须在 recommendation_text 中说明缺口，不得虚构缺失单品。"
        )
    prompt += (
        "\n返回格式：selected_clothing_ids 字段只能等于上方某一候选组合的完整ID集合，"
        "summary 字段用简洁精炼的中文在 2~3 句话内完整描述整体颜色与风格，"
        "不含任何id数字。包袋与配饰属于可选项。"
        "purchase_recommendations 必须是数组：只有存在风格或天气缺口时才填写，"
        "每项必须包含 item_type、style、scene、style_features、color_palette、material、"
        "fit_and_length、match_reason；建议必须针对当前衣橱，不得推荐用户已经拥有的泛化单品。"
    )
    ai_result = await request_ai_recommendation(prompt, valid_clothing_ids)

    # 如果模型没有严格复述候选组合，采用最高分候选，避免模型自由重组。
    candidate_lookup = {
        tuple(sorted(candidate["clothing_ids"])): candidate
        for candidate in aesthetic_candidates
    }
    selected_key = tuple(sorted(ai_result["selected_clothing_ids"]))
    selected_candidate = candidate_lookup.get(selected_key)
    if aesthetic_candidates and selected_candidate is None:
        selected_candidate = aesthetic_candidates[0]
        ai_result["selected_clothing_ids"] = selected_candidate["clothing_ids"]
        ai_result["selection_fallback"] = True

    # 穿搭硬规则后验校验：不合规则时拒绝结果，不能静默改用本地规则。
    id_to_row = {int(row["id"]): dict(row) for row in clothes}
    selected_rows = [
        id_to_row[cid] for cid in ai_result["selected_clothing_ids"] if cid in id_to_row
    ]
    invalid_reason = validate_outfit(selected_rows, weather_fields.get("temperature"))
    partial_allowed_reasons = {
        "缺少主体单品（上衣/裙装）",
        "缺少鞋履",
        "缺少下装",
        "低温需要外套",
    }
    if invalid_reason and not (
        outfit_status == "partial_match" and invalid_reason in partial_allowed_reasons
    ):
        raise HTTPException(status_code=422, detail=f"AI 推荐未通过穿搭规则：{invalid_reason}")
    if invalid_reason:
        risk_notice = invalid_reason

    return {
        "recommendation_text": ai_result["recommendation_text"],
        "recommendation": ai_result["recommendation_text"],  # 兼容旧前端字段
        "selected_clothing_ids": ai_result["selected_clothing_ids"],
        "tips": ai_result["tips"],
        "summary": ai_result["summary"],
        "outfit_status": outfit_status,
        "risk_notice": risk_notice,
        "provider": ai_result["provider"],
        "model": ai_result["model"],
        "aesthetic_version": aesthetic_engine.CONFIG.get("version", aesthetic_engine.ENGINE_VERSION),
        "aesthetic_scores": selected_candidate["scores"] if selected_candidate else {},
        "aesthetic_score": selected_candidate["score"] if selected_candidate else None,
        "aesthetic_candidates": [
            aesthetic_engine.public_candidate(candidate)
            for candidate in aesthetic_candidates[:3]
        ],
        "purchase_recommendations": (
            ai_result["purchase_recommendations"] or purchase_recommendations
        ),
        "purchase_notice": (
            (ai_result["purchase_recommendations"] or purchase_recommendations)[0]["match_reason"]
            if (ai_result["purchase_recommendations"] or purchase_recommendations) else None
        ),
        "selection_fallback": bool(ai_result.get("selection_fallback")),
        "body_profile_version": body_profile["profile_version"] if body_profile["consented"] else None,
        "styling_guides": [{"id": guide["id"], "title": guide["title"]} for guide in styling_guides],
        "styling_tips": [{"id": tip["id"], "title": tip["title"]} for tip in styling_tips],
        "source": "ai",
        "personalization": {
            "summary": user_taste["summary"],
            "styles": [s["tag"] for s in user_taste["positive_styles"]],
            "liked_bloggers": [b["name"] for b in user_taste["liked_bloggers"][:10]],
            "method": user_taste["method"],
        },
    }


@app.get("/api/v1/outfit-records")
def list_outfit_records(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        rows = connection.execute(
            "SELECT * FROM outfit_records WHERE user_id = ? ORDER BY id DESC",
            (current_user["id"],),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["selected_clothing_ids"] = json.loads(item["selected_clothing_ids"])
        items.append(item)
    return {"items": items}


@app.post("/api/v1/outfit-records")
def create_outfit_record(
    request: OutfitRecordCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    created_at = now_iso()
    clothing_ids_json = json.dumps(request.selected_clothing_ids, ensure_ascii=False)
    with get_db() as connection:
        if request.selected_clothing_ids:
            placeholders = ",".join(["?"] * len(request.selected_clothing_ids))
            valid_rows = connection.execute(
                f"SELECT id FROM clothes WHERE user_id = ? AND id IN ({placeholders})",
                tuple([current_user["id"]] + request.selected_clothing_ids),
            ).fetchall()
            if len(valid_rows) != len(set(request.selected_clothing_ids)):
                raise HTTPException(status_code=400, detail="包含不属于当前用户的衣物，无法保存记录")

        cursor = connection.execute(
            """
            INSERT INTO outfit_records (
                user_id, scene, weather, recommendation_text, selected_clothing_ids,
                ai_provider, ai_model, created_at, aesthetic_version,
                aesthetic_score, aesthetic_scores
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                request.scene.strip(),
                request.weather.strip(),
                request.recommendation_text.strip(),
                clothing_ids_json,
                (request.ai_provider or "").strip() or None,
                (request.ai_model or "").strip() or None,
                created_at,
                (request.aesthetic_version or "").strip() or None,
                request.aesthetic_score,
                json.dumps(request.aesthetic_scores or {}, ensure_ascii=False),
            ),
        )
        row = connection.execute("SELECT * FROM outfit_records WHERE id = ?", (cursor.lastrowid,)).fetchone()
    item = dict(row)
    item["selected_clothing_ids"] = json.loads(item["selected_clothing_ids"])
    return {"item": item}


@app.delete("/api/v1/outfit-records/{record_id}")
def delete_outfit_record(record_id: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        row = connection.execute(
            "SELECT id FROM outfit_records WHERE id = ? AND user_id = ?",
            (record_id, current_user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="记录不存在")
        connection.execute(
            "DELETE FROM outfit_records WHERE id = ? AND user_id = ?",
            (record_id, current_user["id"]),
        )
    return {"ok": True, "deleted_id": record_id}


def _serialize_link(row: Any) -> Dict[str, Any]:
    data = dict(row)
    raw_tags = data.get("tags")
    try:
        tags = json.loads(raw_tags) if raw_tags else []
        if not isinstance(tags, list):
            tags = []
    except (TypeError, ValueError):
        tags = []
    return {
        "id": data.get("id"),
        "url": data.get("url") or "",
        "title": data.get("title") or "",
        "note": data.get("note") or "",
        "tags": tags,
        "created_at": data.get("created_at"),
        "blogger_id": data.get("blogger_id"),
    }


@app.get("/api/v1/links")
def list_links(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        rows = connection.execute(
            "SELECT * FROM inspiration_links WHERE user_id = ? ORDER BY id DESC",
            (current_user["id"],),
        ).fetchall()
    return {"items": [_serialize_link(r) for r in rows]}


@app.post("/api/v1/links")
def create_link(request: LinkCreateRequest, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    tags_json = json.dumps(request.tags or [], ensure_ascii=False)
    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO inspiration_links (user_id, url, title, note, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                current_user["id"],
                request.url.strip(),
                (request.title or "").strip(),
                (request.note or "").strip(),
                tags_json,
                now_iso(),
            ),
        )
        new_id = cursor.lastrowid
        row = connection.execute(
            "SELECT * FROM inspiration_links WHERE id = ? AND user_id = ?",
            (new_id, current_user["id"]),
        ).fetchone()
    return {"item": _serialize_link(row)}


@app.put("/api/v1/links/{link_id}")
def update_link(link_id: int, request: LinkUpdateRequest, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        row = connection.execute(
            "SELECT * FROM inspiration_links WHERE id = ? AND user_id = ?",
            (link_id, current_user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="灵感不存在")
        new_title = row["title"] if request.title is None else request.title.strip()
        new_note = row["note"] if request.note is None else request.note.strip()
        new_tags = row["tags"] if request.tags is None else json.dumps(request.tags, ensure_ascii=False)
        connection.execute(
            "UPDATE inspiration_links SET title = ?, note = ?, tags = ? WHERE id = ? AND user_id = ?",
            (new_title, new_note, new_tags, link_id, current_user["id"]),
        )
        updated = connection.execute(
            "SELECT * FROM inspiration_links WHERE id = ? AND user_id = ?",
            (link_id, current_user["id"]),
        ).fetchone()
    return {"item": _serialize_link(updated)}


@app.delete("/api/v1/links/{link_id}")
def delete_link(link_id: int, current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    with get_db() as connection:
        row = connection.execute(
            "SELECT id FROM inspiration_links WHERE id = ? AND user_id = ?",
            (link_id, current_user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="灵感不存在")
        connection.execute(
            "DELETE FROM inspiration_links WHERE id = ? AND user_id = ?",
            (link_id, current_user["id"]),
        )
    return {"ok": True, "deleted_id": link_id}


# ---- 博主推荐相关（自动生成） ----
STYLE_BEHAVIOR_WEIGHTS = taste.WEIGHTS
ALL_STYLE_TAGS = ("通勤", "优雅知性", "韩系", "简约", "复古", "甜美", "户外运动", "中性", "美式", "甜酷", "日系")


def _blogger_id_col():
    try:
        if IS_POSTGRES:
            return "id SERIAL PRIMARY KEY"
    except NameError:
        pass
    return "id INTEGER PRIMARY KEY AUTOINCREMENT"


def init_blogger_tables():
    ensure_directories()
    taste.init_tables(get_db, _blogger_id_col())
    with get_db() as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS bloggers (id TEXT PRIMARY KEY, name TEXT NOT NULL, profile_url TEXT, tags TEXT, valid_outfit_count INTEGER DEFAULT 0, created_at TEXT NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS user_style_behaviors (" + _blogger_id_col() + ", user_id INTEGER NOT NULL, style_tag TEXT NOT NULL, action_type TEXT NOT NULL, weight REAL DEFAULT 1.0, created_at TEXT NOT NULL)")
        # 自动播种：若 bloggers 为空且同级存在 bloggers_seed.json，则导入种子数据
        _row = connection.execute("SELECT COUNT(1) AS c FROM bloggers").fetchone()
        _count = 0
        if _row is not None:
            _count = dict(_row).get("c") or 0
        _seed_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bloggers_seed.json")
        # 幂等补种：不再只在空表时导入。每次启动都读取种子文件，仅插入库中缺失的博主
        # （按 id 判断），确保最终补齐到完整名单（如 109 位）；不覆盖已有行，
        # 后续人工补充的封面/头像等字段得以保留。
        if os.path.exists(_seed_path):
            with open(_seed_path, encoding="utf-8") as _sf:
                _seed_data = json.load(_sf)
            for _b in _seed_data:
                _bid = _b.get("id")
                if not _bid:
                    continue
                _exists = connection.execute("SELECT id FROM bloggers WHERE id = ?", (_bid,)).fetchone()
                if _exists is not None:
                    continue
                connection.execute("INSERT INTO bloggers (id, name, profile_url, tags, valid_outfit_count, created_at) VALUES (?, ?, ?, ?, ?, ?)", (_bid, _b.get("name"), _b.get("profile_url"), json.dumps(_b.get("tags") or list(), ensure_ascii=False), _b.get("valid_outfit_count") or 0, now_iso()))


def _serialize_blogger(row):
    row = dict(row)
    try:
        tags = json.loads(row.get("tags") or "[]")
    except Exception:
        tags = []
    if not isinstance(tags, list):
        tags = []
    return {"id": row.get("id"), "name": row.get("name"), "profile_url": row.get("profile_url") or "", "tags": tags, "valid_outfit_count": row.get("valid_outfit_count") or 0}


def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("YIJIAN_ADMIN_TOKEN", "")
    if not expected or not hmac.compare_digest((x_admin_token or "").encode(), expected.encode()):
        raise HTTPException(403, "需要管理员凭证")


def require_development_library() -> None:
    """Keep the no-token review page strictly local to development."""
    if os.environ.get("YIJIAN_ENV", "development").lower() == "production":
        raise HTTPException(404, "开发期资料库不可用")


def _count_table(connection: Any, table: str, where: str = "", params: Any = ()) -> int:
    row = connection.execute(f"SELECT COUNT(1) AS count FROM {table} {where}", params).fetchone()
    return int((row or {}).get("count") or 0)


def _redact_email(email: str) -> str:
    if "@" not in email:
        return email[:2] + "***"
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        visible = name[:1]
    else:
        visible = name[:2]
    return f"{visible}***@{domain}"


def _load_json_list(value: Any) -> List[Any]:
    try:
        data = json.loads(value or "[]") if isinstance(value, str) else value
    except Exception:
        data = []
    return data if isinstance(data, list) else []


@app.get("/api/v1/admin/styling-tips", dependencies=[Depends(require_admin)])
def admin_list_styling_tips(status: Optional[str] = None) -> Dict[str, Any]:
    params: List[Any] = []
    where = ""
    if status:
        where = "WHERE status = ?"
        params.append(status)
    with get_db() as connection:
        rows = connection.execute(
            f"SELECT * FROM styling_tips {where} ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC",
            tuple(params),
        ).fetchall()
    return {"items": [_serialize_styling_tip(row) for row in rows]}


@app.post("/api/v1/admin/styling-tips", dependencies=[Depends(require_admin)])
def admin_create_styling_tip(request: StylingTipRequest) -> Dict[str, Any]:
    now = now_iso()
    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO styling_tips
            (title, category, content, applicable_body_shapes, applicable_weather, applicable_scenes,
             applicable_styles, counterexamples, source_note, status, review_note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', '', ?, ?)
            """,
            (
                request.title.strip(), request.category.strip(), request.content.strip(),
                json.dumps(request.applicable_body_shapes, ensure_ascii=False),
                json.dumps(request.applicable_weather, ensure_ascii=False),
                json.dumps(request.applicable_scenes, ensure_ascii=False),
                json.dumps(request.applicable_styles, ensure_ascii=False),
                request.counterexamples.strip(), request.source_note.strip(), now, now,
            ),
        )
        row = connection.execute("SELECT * FROM styling_tips WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"item": _serialize_styling_tip(row)}


@app.put("/api/v1/admin/styling-tips/{tip_id}/review", dependencies=[Depends(require_admin)])
def admin_review_styling_tip(tip_id: int, request: StylingTipReviewRequest) -> Dict[str, Any]:
    with get_db() as connection:
        existing = connection.execute("SELECT id FROM styling_tips WHERE id = ?", (tip_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "搭配小 tips 不存在")
        connection.execute(
            "UPDATE styling_tips SET status = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
            (request.status, request.review_note.strip(), now_iso(), now_iso(), tip_id),
        )
        row = connection.execute("SELECT * FROM styling_tips WHERE id = ?", (tip_id,)).fetchone()
    return {"item": _serialize_styling_tip(row)}


@app.get("/api/v1/admin/styling-guides", dependencies=[Depends(require_admin)])
def admin_list_styling_guides(status: Optional[str] = None) -> Dict[str, Any]:
    params: List[Any] = []
    where = ""
    if status:
        where = "WHERE status = ?"
        params.append(status)
    with get_db() as connection:
        rows = connection.execute(
            f"SELECT * FROM styling_guides {where} "
            "ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC",
            tuple(params),
        ).fetchall()
    return {"items": [_serialize_styling_guide(row) for row in rows]}


def _guide_values(request: StylingGuideRequest) -> tuple:
    return (
        request.title.strip(), request.category.strip(), request.goal.strip(), request.content.strip(),
        request.outfit_formula.strip(),
        json.dumps(request.applicable_body_shapes, ensure_ascii=False),
        json.dumps(request.applicable_weather, ensure_ascii=False),
        json.dumps(request.applicable_scenes, ensure_ascii=False),
        json.dumps(request.applicable_styles, ensure_ascii=False),
        request.counterexamples.strip(), request.source_note.strip(),
    )


@app.post("/api/v1/admin/styling-guides", dependencies=[Depends(require_admin)])
def admin_create_styling_guide(request: StylingGuideRequest) -> Dict[str, Any]:
    now = now_iso()
    with get_db() as connection:
        cursor = connection.execute(
            """
            INSERT INTO styling_guides
            (title, category, goal, content, outfit_formula, applicable_body_shapes, applicable_weather,
             applicable_scenes, applicable_styles, counterexamples, source_note, status, review_note,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', '', ?, ?)
            """,
            (*_guide_values(request), now, now),
        )
        row = connection.execute("SELECT * FROM styling_guides WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"item": _serialize_styling_guide(row)}


@app.put("/api/v1/admin/styling-guides/{guide_id}", dependencies=[Depends(require_admin)])
def admin_update_styling_guide(guide_id: int, request: StylingGuideRequest) -> Dict[str, Any]:
    now = now_iso()
    with get_db() as connection:
        existing = connection.execute("SELECT id FROM styling_guides WHERE id = ?", (guide_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "搭配攻略不存在")
        connection.execute(
            """
            UPDATE styling_guides
            SET title = ?, category = ?, goal = ?, content = ?, outfit_formula = ?,
                applicable_body_shapes = ?, applicable_weather = ?, applicable_scenes = ?,
                applicable_styles = ?, counterexamples = ?, source_note = ?,
                status = 'draft', review_note = '', reviewed_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (*_guide_values(request), now, guide_id),
        )
        row = connection.execute("SELECT * FROM styling_guides WHERE id = ?", (guide_id,)).fetchone()
    return {"item": _serialize_styling_guide(row)}


@app.put("/api/v1/admin/styling-guides/{guide_id}/review", dependencies=[Depends(require_admin)])
def admin_review_styling_guide(guide_id: int, request: StylingGuideReviewRequest) -> Dict[str, Any]:
    now = now_iso()
    with get_db() as connection:
        existing = connection.execute("SELECT id FROM styling_guides WHERE id = ?", (guide_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "搭配攻略不存在")
        connection.execute(
            "UPDATE styling_guides SET status = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
            (request.status, request.review_note.strip(), now, now, guide_id),
        )
        row = connection.execute("SELECT * FROM styling_guides WHERE id = ?", (guide_id,)).fetchone()
    return {"item": _serialize_styling_guide(row)}


@app.delete("/api/v1/admin/styling-guides/{guide_id}", dependencies=[Depends(require_admin)])
def admin_delete_styling_guide(guide_id: int) -> Dict[str, Any]:
    with get_db() as connection:
        existing = connection.execute("SELECT id FROM styling_guides WHERE id = ?", (guide_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "搭配攻略不存在")
        connection.execute("DELETE FROM styling_guides WHERE id = ?", (guide_id,))
    return {"detail": "搭配攻略已删除"}


@app.get("/api/v1/dev/library", dependencies=[Depends(require_development_library)])
def development_library(status: Optional[str] = None) -> Dict[str, Any]:
    """Local-only review workspace. Production keeps the admin-token workflow."""
    if status and status not in {"draft", "approved", "rejected", "archived"}:
        raise HTTPException(422, "不支持的资料状态")
    where = "WHERE status = ?" if status else ""
    params = (status,) if status else ()
    with get_db() as connection:
        guide_rows = connection.execute(
            f"SELECT * FROM styling_guides {where} "
            "ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC",
            params,
        ).fetchall()
        tip_rows = connection.execute(
            f"SELECT * FROM styling_tips {where} "
            "ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id DESC",
            params,
        ).fetchall()
    return {
        "items": [
            {"kind": "guide", **_serialize_styling_guide(row)}
            for row in guide_rows
        ] + [
            {"kind": "tip", **_serialize_styling_tip(row)}
            for row in tip_rows
        ],
        "development_only": True,
    }


@app.put("/api/v1/dev/library/{kind}/{item_id}/review", dependencies=[Depends(require_development_library)])
def review_development_library_item(kind: str, item_id: int, request: StylingGuideReviewRequest) -> Dict[str, Any]:
    if kind not in {"guide", "tip"}:
        raise HTTPException(404, "资料类型不存在")
    table = "styling_guides" if kind == "guide" else "styling_tips"
    with get_db() as connection:
        existing = connection.execute(f"SELECT id FROM {table} WHERE id = ?", (item_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "资料不存在")
        now = now_iso()
        connection.execute(
            f"UPDATE {table} SET status = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
            (request.status, request.review_note.strip(), now, now, item_id),
        )
        row = connection.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
    serializer = _serialize_styling_guide if kind == "guide" else _serialize_styling_tip
    return {"item": {"kind": kind, **serializer(row)}}


@app.get("/api/v1/admin/storage/status", dependencies=[Depends(require_admin)])
def admin_storage_status() -> Dict[str, Any]:
    with get_db() as connection:
        local_clothes = _count_table(
            connection,
            "clothes",
            "WHERE COALESCE(image_url, '') LIKE '/api/v1/uploads/%'",
        )
        remote_clothes = _count_table(
            connection,
            "clothes",
            "WHERE COALESCE(image_url, '') LIKE 'https://%'",
        )
        missing_clothes = _count_table(
            connection,
            "clothes",
            "WHERE COALESCE(image_url, '') = ''",
        )
        pending_cleanup = _count_table(connection, "media_cleanup_jobs", "WHERE status = 'pending'")
    return {
        **storage_status(),
        "pending_cleanup": pending_cleanup,
        "clothes": {
            "local_image_url_count": local_clothes,
            "remote_image_url_count": remote_clothes,
            "missing_image_url_count": missing_clothes,
        },
    }


@app.get("/api/v1/admin/overview", dependencies=[Depends(require_admin)])
def admin_overview() -> Dict[str, Any]:
    with get_db() as connection:
        counts = {
            "users": _count_table(connection, "users"),
            "clothes": _count_table(connection, "clothes"),
            "outfit_records": _count_table(connection, "outfit_records"),
            "inspiration_links": _count_table(connection, "inspiration_links"),
            "bloggers": _count_table(connection, "bloggers"),
            "preference_events": _count_table(connection, "preference_events"),
            "blogger_states": _count_table(connection, "blogger_states"),
        }
        recent_events = connection.execute(
            """
            SELECT e.id, e.user_id, u.email, e.action_type, e.blogger_id,
                   e.style_tags, e.created_at
            FROM preference_events e
            LEFT JOIN users u ON u.id = e.user_id
            ORDER BY e.id DESC
            LIMIT 10
            """
        ).fetchall()
        users = connection.execute("SELECT id, email, display_name, created_at FROM users ORDER BY id DESC LIMIT 20").fetchall()
    return {
        "counts": counts,
        "storage": storage_status(),
        "recent_events": [
            {
                **dict(row),
                "email": _redact_email(row.get("email") or ""),
                "style_tags": taste.tags_of(row.get("style_tags") or "[]"),
            }
            for row in recent_events
        ],
        "users": [
            {
                "id": row["id"],
                "email": _redact_email(row["email"]),
                "display_name": row["display_name"],
                "created_at": row["created_at"],
            }
            for row in users[:20]
        ],
    }


@app.get("/api/v1/admin/users", dependencies=[Depends(require_admin)])
def admin_list_users(
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    reveal_email: bool = False,
) -> Dict[str, Any]:
    limit = max(1, min(100, int(limit)))
    offset = max(0, int(offset))
    where = ""
    params: List[Any] = []
    if q and q.strip():
        where = "WHERE email LIKE ? OR display_name LIKE ?"
        keyword = f"%{q.strip()}%"
        params.extend([keyword, keyword])
    with get_db() as connection:
        total = _count_table(connection, "users", where, tuple(params))
        rows = connection.execute(
            f"SELECT id, email, display_name, avatar, bio, created_at FROM users {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            tuple(params + [limit, offset]),
        ).fetchall()
        items = []
        for row in rows:
            user_id = row["id"]
            event_row = connection.execute(
                "SELECT MAX(created_at) AS last_event_at FROM preference_events WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            items.append({
                "id": user_id,
                "email": row["email"] if reveal_email else _redact_email(row["email"]),
                "display_name": row["display_name"],
                "avatar": row.get("avatar") or "",
                "bio": row.get("bio") or "",
                "created_at": row["created_at"],
                "last_event_at": (event_row or {}).get("last_event_at"),
                "counts": {
                    "clothes": _count_table(connection, "clothes", "WHERE user_id = ?", (user_id,)),
                    "outfit_records": _count_table(connection, "outfit_records", "WHERE user_id = ?", (user_id,)),
                    "inspiration_links": _count_table(connection, "inspiration_links", "WHERE user_id = ?", (user_id,)),
                    "preference_events": _count_table(connection, "preference_events", "WHERE user_id = ?", (user_id,)),
                    "blogger_states": _count_table(connection, "blogger_states", "WHERE user_id = ?", (user_id,)),
                },
            })
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@app.get("/api/v1/admin/users/{user_id}", dependencies=[Depends(require_admin)])
def admin_get_user(user_id: int, reveal_email: bool = False) -> Dict[str, Any]:
    with get_db() as connection:
        row = connection.execute(
            "SELECT id, email, display_name, avatar, bio, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "用户不存在")
        body_profile = connection.execute(
            "SELECT * FROM user_body_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
        states = connection.execute(
            """
            SELECT s.blogger_id, s.state, b.name, b.tags
            FROM blogger_states s
            LEFT JOIN bloggers b ON b.id = s.blogger_id
            WHERE s.user_id = ?
            ORDER BY s.id DESC
            """,
            (user_id,),
        ).fetchall()
        counts = {
            "clothes": _count_table(connection, "clothes", "WHERE user_id = ?", (user_id,)),
            "outfit_records": _count_table(connection, "outfit_records", "WHERE user_id = ?", (user_id,)),
            "inspiration_links": _count_table(connection, "inspiration_links", "WHERE user_id = ?", (user_id,)),
            "preference_events": _count_table(connection, "preference_events", "WHERE user_id = ?", (user_id,)),
            "blogger_states": _count_table(connection, "blogger_states", "WHERE user_id = ?", (user_id,)),
        }
    return {
        "user": {
            "id": row["id"],
            "email": row["email"] if reveal_email else _redact_email(row["email"]),
            "display_name": row["display_name"],
            "avatar": row.get("avatar") or "",
            "bio": row.get("bio") or "",
            "created_at": row["created_at"],
        },
        "counts": counts,
        "body_profile": _serialize_body_profile(body_profile),
        "blogger_states": [
            {
                "blogger_id": row.get("blogger_id"),
                "state": row.get("state"),
                "name": row.get("name") or "",
                "tags": taste.tags_of(row.get("tags") or "[]"),
            }
            for row in states
        ],
    }


@app.get("/api/v1/admin/users/{user_id}/taste", dependencies=[Depends(require_admin)])
def admin_get_user_taste(user_id: int) -> Dict[str, Any]:
    with get_db() as connection:
        if connection.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone() is None:
            raise HTTPException(404, "用户不存在")
    return taste.profile(get_db, user_id)


@app.get("/api/v1/admin/users/{user_id}/events", dependencies=[Depends(require_admin)])
def admin_get_user_events(user_id: int, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    with get_db() as connection:
        total = _count_table(connection, "preference_events", "WHERE user_id = ?", (user_id,))
        rows = connection.execute(
            """
            SELECT e.id, e.event_id, e.action_type, e.blogger_id, b.name AS blogger_name,
                   e.style_tags, e.created_at
            FROM preference_events e
            LEFT JOIN bloggers b ON b.id = e.blogger_id
            WHERE e.user_id = ?
            ORDER BY e.id DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ).fetchall()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                **dict(row),
                "style_tags": taste.tags_of(row.get("style_tags") or "[]"),
            }
            for row in rows
        ],
    }


@app.get("/api/v1/admin/users/{user_id}/wardrobe", dependencies=[Depends(require_admin)])
def admin_get_user_wardrobe(user_id: int, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    with get_db() as connection:
        total = _count_table(connection, "clothes", "WHERE user_id = ?", (user_id,))
        rows = connection.execute(
            """
            SELECT id, name, category, subcategory, color, material, warmth, fit,
                   season, style_tags, scene_tags, notes, image_url, created_at
            FROM clothes
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ).fetchall()
    return {"total": total, "limit": limit, "offset": offset, "items": [dict(row) for row in rows]}


@app.get("/api/v1/admin/bloggers", dependencies=[Depends(require_admin)])
def admin_list_bloggers(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    with get_db() as connection:
        rows = connection.execute(
            "SELECT id, name, profile_url, tags, valid_outfit_count, created_at FROM bloggers ORDER BY valid_outfit_count DESC, name, id",
        ).fetchall()
        media_rows = connection.execute("SELECT * FROM blogger_media").fetchall()
        media_by_id = {row["id"]: row for row in media_rows}
        state_rows = connection.execute(
            "SELECT blogger_id, state, COUNT(1) AS count FROM blogger_states GROUP BY blogger_id, state"
        ).fetchall()
    publications = blogger_ops.publication(get_db)
    state_counts: Dict[str, Dict[str, int]] = {}
    for row in state_rows:
        bucket = state_counts.setdefault(row["blogger_id"], {"liked": 0, "blocked": 0})
        if row["state"] == 1:
            bucket["liked"] = int(row["count"] or 0)
        elif row["state"] == -1:
            bucket["blocked"] = int(row["count"] or 0)
    items = []
    for row in rows:
        item = _serialize_blogger(row)
        if q and q.strip() and q.strip().lower() not in item["name"].lower() and q.strip().lower() not in item["id"].lower():
            continue
        if tag and taste.normalize(tag) not in item["tags"]:
            continue
        media = media_by_id.get(item["id"], {})
        covers = _load_json_list(media.get("covers") if media else "[]")
        items.append({
            **item,
            "publication": publications.get(item["id"], {"manual_state": "active", "health": "unchecked"}),
            "active": blogger_ops.is_active(publications.get(item["id"], {})),
            "avatar_url": (media.get("avatar_url") if media else "") or "",
            "covers": covers,
            "cover_count": len(covers),
            "media_updated_at": media.get("updated_at") if media else None,
            "state_counts": state_counts.get(item["id"], {"liked": 0, "blocked": 0}),
        })
    return {"total": len(items), "limit": limit, "offset": offset, "items": items[offset:offset + limit]}


@app.get("/api/v1/admin/data-quality", dependencies=[Depends(require_admin)])
def admin_data_quality() -> Dict[str, Any]:
    with get_db() as connection:
        clothes_missing = _count_table(connection, "clothes", "WHERE COALESCE(image_url, '') = ''")
        clothes_local = _count_table(connection, "clothes", "WHERE COALESCE(image_url, '') LIKE '/api/v1/uploads/%'")
        bloggers = connection.execute("SELECT id, name, profile_url FROM bloggers").fetchall()
        media_rows = connection.execute("SELECT * FROM blogger_media").fetchall()
        media_by_id = {row["id"]: row for row in media_rows}
        orphan_events = connection.execute(
            """
            SELECT COUNT(1) AS count
            FROM preference_events e
            LEFT JOIN users u ON u.id = e.user_id
            WHERE u.id IS NULL
            """
        ).fetchone()
        orphan_states = connection.execute(
            """
            SELECT COUNT(1) AS count
            FROM blogger_states s
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN bloggers b ON b.id = s.blogger_id
            WHERE u.id IS NULL OR b.id IS NULL
            """
        ).fetchone()
    missing_covers = []
    invalid_profile_url = []
    for row in bloggers:
        media = media_by_id.get(row["id"], {})
        covers = _load_json_list(media.get("covers") if media else "[]")
        if not covers:
            missing_covers.append({"id": row["id"], "name": row["name"]})
        if not str(row.get("profile_url") or "").startswith("https://"):
            invalid_profile_url.append({"id": row["id"], "name": row["name"], "profile_url": row.get("profile_url") or ""})
    return {
        "storage": storage_status(),
        "clothes": {
            "missing_image_url": clothes_missing,
            "local_image_url": clothes_local,
        },
        "bloggers": {
            # Kept for admin API compatibility; avatars are no longer a P1 requirement.
            "missing_avatar_count": 0,
            "missing_cover_count": len(missing_covers),
            "invalid_profile_url_count": len(invalid_profile_url),
            "missing_avatar_sample": [],
            "missing_cover_sample": missing_covers[:20],
            "invalid_profile_url_sample": invalid_profile_url[:20],
        },
        "integrity": {
            "orphan_preference_events": int((orphan_events or {}).get("count") or 0),
            "orphan_blogger_states": int((orphan_states or {}).get("count") or 0),
        },
    }


@app.post("/api/v1/admin/bloggers/import")
def import_bloggers(items: List[BloggerImportItem], _: None = Depends(require_admin)):
    # Bulk legacy endpoint shares validation and audit with the P1 editor.
    for item in items:
        try:
            blogger_ops.BloggerEdit(**item.dict())
            blogger_ops.safe_url(item.profile_url)
            if not item.name.strip() or any(not t.strip() or len(t) > 50 for t in item.tags):
                raise ValueError("名称和标签不能为空")
        except ValueError as exc:
            raise HTTPException(422, str(exc))
    created_at = now_iso()
    imported = 0
    with get_db() as connection:
        for item in items:
            tags_json = json.dumps(item.tags, ensure_ascii=False)
            existing = connection.execute("SELECT * FROM bloggers WHERE id = ?", (item.id,)).fetchone()
            if existing is None:
                connection.execute("INSERT INTO bloggers (id, name, profile_url, tags, valid_outfit_count, created_at) VALUES (?, ?, ?, ?, ?, ?)", (item.id, item.name.strip(), item.profile_url.strip(), tags_json, item.valid_outfit_count, created_at))
            else:
                connection.execute("UPDATE bloggers SET name = ?, profile_url = ?, tags = ?, valid_outfit_count = ? WHERE id = ?", (item.name.strip(), item.profile_url.strip(), tags_json, item.valid_outfit_count, item.id))
            connection.execute(
                "UPDATE inspiration_links SET url = ? WHERE blogger_id = ?",
                (item.profile_url.strip(), item.id),
            )
            if existing and existing["profile_url"] != item.profile_url.strip():
                connection.execute("UPDATE blogger_publication SET health='unchecked', checked_at=NULL WHERE blogger_id=?", (item.id,))
            blogger_ops.audit(connection, item.id, "bulk_edit", existing, item.dict())
            imported = imported + 1
    return {"ok": True, "imported": imported}


@app.post("/api/v1/admin/blogger-media/import")
def import_blogger_media(items: List[BloggerMediaImportItem],
                         _: None = Depends(require_admin)):
    raise HTTPException(422, "请使用 /admin 的素材转存功能，补充来源、采集时间与授权依据")


@app.get("/api/v1/bloggers/{blogger_id}/visit")
def visit_blogger(blogger_id: str):
    with get_db() as connection:
        row = connection.execute(
            "SELECT profile_url FROM bloggers WHERE id = ?",
            (blogger_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "博主不存在")
    url = str(row.get("profile_url") or "").strip()
    if not url.startswith("https://"):
        raise HTTPException(404, "博主主页暂不可用")
    return RedirectResponse(url=url, status_code=307)


@app.post("/api/v1/user/style-behavior")
def record_style_behavior(request: StyleBehaviorRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    if request.action_type not in STYLE_BEHAVIOR_WEIGHTS:
        raise HTTPException(422, "不支持的风格行为")
    result = taste.feedback(get_db, current_user["id"], taste.Feedback(
        event_id=str(uuid.uuid4()), action_type=request.action_type,
        style_tags=[request.style_tag]), now_iso())
    return {**result, "weight": STYLE_BEHAVIOR_WEIGHTS[request.action_type]}


@app.post("/api/v1/user/feedback")
def record_feedback(request: taste.Feedback, current_user: Dict[str, Any] = Depends(get_current_user)):
    if request.recommendation_id:
        with get_db() as c:
            blogger_ops.validate_attribution(c, request.recommendation_id, current_user["id"], request.blogger_id)
    result = taste.feedback(get_db, current_user["id"], request, now_iso())
    if not result.get("duplicate"):
        blogger_ops.attribute(get_db, request.recommendation_id, current_user["id"],
                              request.action_type, request.blogger_id)
    return result


@app.get("/api/v1/user/taste")
def get_taste(current_user: Dict[str, Any] = Depends(get_current_user)):
    return taste.profile(get_db, current_user["id"])


@app.put("/api/v1/bloggers/{blogger_id}/collection")
def set_blogger_collection(blogger_id: str, request: BloggerCollectionRequest,
                           current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db() as c:
        if request.recommendation_id:
            blogger_ops.validate_attribution(c, request.recommendation_id, current_user["id"], blogger_id)
        b = c.execute("SELECT * FROM bloggers WHERE id = ?", (blogger_id,)).fetchone()
        if not b:
            raise HTTPException(404, "博主不在已审核候选池")
        if request.saved:
            c.execute("""INSERT INTO inspiration_links
                (user_id, blogger_id, url, title, note, tags, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, blogger_id) DO NOTHING""",
                (current_user["id"], blogger_id, b["profile_url"], b["name"],
                 "", b["tags"], now_iso()))
        else:
            c.execute("DELETE FROM inspiration_links WHERE user_id = ? AND blogger_id = ?",
                      (current_user["id"], blogger_id))
        row = c.execute("SELECT * FROM inspiration_links WHERE user_id = ? AND blogger_id = ?",
                        (current_user["id"], blogger_id)).fetchone()
    if request.saved:
        blogger_ops.attribute(get_db, request.recommendation_id, current_user["id"], "save", blogger_id)
    return {"saved": row is not None, "item": _serialize_link(row) if row else None}


@app.get("/api/v1/bloggers/recommendations")
def get_blogger_recommendations(current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)):
    user_taste = taste.profile(get_db, current_user["id"]) if current_user else None
    with get_db() as connection:
        rows = connection.execute("SELECT * FROM bloggers").fetchall()
    bloggers = taste.decorate(get_db, [_serialize_blogger(r) for r in rows], user_taste)
    return blogger_ops.deliver(get_db, taste.rank(bloggers, user_taste),
                               current_user["id"] if current_user else None, "home")


@app.get("/api/v1/bloggers")
def list_bloggers(tag: Optional[str] = None, track: bool = False,
                  current_user: Optional[Dict[str, Any]] = Depends(get_optional_user)):
    with get_db() as connection:
        rows = connection.execute("SELECT id, name, profile_url, tags, valid_outfit_count, created_at FROM bloggers ORDER BY valid_outfit_count DESC").fetchall()
    bloggers = [_serialize_blogger(dict(r)) for r in rows]
    if tag:
        bloggers = [b for b in bloggers if taste.normalize(tag) in taste.tags_of(b["tags"])]
    user_taste = taste.profile(get_db, current_user["id"]) if current_user else None
    items = taste.decorate(get_db, bloggers, user_taste)
    return blogger_ops.deliver(get_db, items, current_user["id"] if current_user else None, "style") if track else items


blogger_ops.install(sys.modules[__name__])


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or os.environ.get("_BYTEFAAS_RUNTIME_PORT", 8000))
    config = uvicorn.Config("main:app", port=port, log_level="info", host="0.0.0.0")
    server = uvicorn.Server(config)
    server.run()
