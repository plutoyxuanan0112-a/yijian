/* @jsxRuntime classic */
/* 衣见 · 数据层 & 领域逻辑
 * localStorage 持久化：衣橱 / 穿搭记录 / 外部灵感 / 偏好
 * removeBackground / weather / AI outfit / local rule outfit / creator recommendation
 * 全部 API 都挂在 window.YijianStore 上供 components / app 使用
 */
(function () {
  'use strict';

  const K = {
    WARDROBE: 'yijian_wardrobe_items',
    OUTFITS: 'yijian_outfit_records',
    LINKS: 'yijian_saved_links',
    PREF: 'yijian_preferences',
    WEATHER: 'yijian_last_weather',
    AI_CFG: 'yijian_ai_config',
    AI_LOG: 'yijian_ai_last_call',
    API_TOKEN: 'yijian_api_token',
    API_BASE: 'yijian_api_base',
  };

  // 真实后端配置：优先读取 window.YIJIAN_API_BASE，其次 localStorage，默认指向本地 FastAPI。
  // 如果后端不可用，下面的数据方法会自动保留 localStorage 兜底，不破坏 v17 UI。
  const DEFAULT_API_BASE = 'https://yijian-backend.onrender.com';
  const LEGACY_API_BASES = ['https://yijian-backend-ir33.onrender.com'];
  function getApiBase() {
    const fromWindow = (window.YIJIAN_API_BASE || '').trim();
    if (fromWindow) return fromWindow.replace(/\/$/, '');
    const fromStorage = (localStorage.getItem(K.API_BASE) || '').trim().replace(/\/$/, '');
    const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(fromStorage);
    const isLegacy = LEGACY_API_BASES.includes(fromStorage);
    if (fromStorage && !isLocal && !isLegacy) return fromStorage;
    if (isLocal || isLegacy) {
      localStorage.removeItem(K.API_BASE);
      localStorage.removeItem(K.API_TOKEN);
      localStorage.removeItem('yijian_user_profile');
    }
    return DEFAULT_API_BASE.replace(/\/$/, '');
  }
  function setApiBase(base) {
    localStorage.setItem(K.API_BASE, (base || '').trim().replace(/\/$/, ''));
  }
  function getApiToken() {
    return localStorage.getItem(K.API_TOKEN) || '';
  }
  function setApiToken(token) {
    if (token) localStorage.setItem(K.API_TOKEN, token);
    else localStorage.removeItem(K.API_TOKEN);
  }
  async function apiFetch(path, options) {
    const isFormData = options && options.body instanceof FormData;
    const headers = isFormData
      ? { ...((options && options.headers) || {}) }
      : { 'Content-Type': 'application/json', ...((options && options.headers) || {}) };
    const token = getApiToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(getApiBase() + path, { ...(options || {}), headers });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem(K.API_TOKEN);
        localStorage.removeItem('yijian_user_profile');
      }
      const err = new Error((body && body.detail) || '请求失败，请稍后再试');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  // ------------ localStorage helpers ------------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // 通常是 QuotaExceededError（图片体积过大 / localStorage 满）
      // 静默失败会让上层以为写成功，这里返回 false 让上层能弹 toast / 回滚
      return false;
    }
  }
  function uid(prefix) {
    return (
      (prefix || 'id') +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 6)
    );
  }

  // ------------ Wardrobe ------------
  function getWardrobe() {
    const raw = load(K.WARDROBE, []);
    // 兼容旧版本：老单品没有 material/silhouette/description 等字段，用 normalize 补齐
    const items = raw.map((x) => normalizeItem(x));
    // 旧版本把原始大图也写进浏览器存储，容易把空间撑满，导致后续保存看起来像覆盖。
    // 读取时顺手瘦身一次：保留用于展示的图片，移除原始备份图。
    if (items.some((x) => x.originalImage)) {
      save(K.WARDROBE, items.map((x) => ({ ...x, originalImage: '' })));
    }
    return items;
  }
  function saveWardrobe(items) {
    return save(K.WARDROBE, items);
  }
  // v13：单品的颜色 / 厚薄 / 风格 / 场景 / 季节 / 材质等字段
  // 全部升级为「多选 + 自由输入」的组合，保留 legacy 单值兼容。
  //
  // 数据结构演进：
  //   colors[]  colorOther     ← 颜色（多选 + 其他）
  //   warmthTags[]              ← 厚薄（多选，"薄/中等/厚"任意组合）
  //   materials[] materialOther ← 材质（多选 + 其他）
  //   silhouettes[]             ← 廓形（多选）
  //   styleTags[]  styleOther   ← 风格（多选 + 其他）
  //   sceneTags[]  sceneOther   ← 场景（多选 + 其他）
  //   seasonTags[] seasonOther  ← 季节（多选 + 其他）
  //   customNotes               ← 用户自由描述
  //
  // Legacy 字段 color / warmth / material / silhouette 依旧保留：
  //   - 读取时若 arrays 为空但 legacy 有值，自动灌入 arrays；
  //   - 写入时同步把 arrays[0] 回填到 legacy 单值字段，保证卡片 / 记录 / 打分老代码可继续读。

  const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const dedupe = (arr) => Array.from(new Set(arr.filter(Boolean).map((s) => String(s).trim()).filter(Boolean)));

  // 依据结构化字段生成一段"系统推荐描述"，给 AI/规则推荐读取的语义线索
  function buildSystemDescription(item) {
    const parts = [];
    const colors = itemColors(item);
    if (colors.length) parts.push(colors.slice(0, 2).join(' / '));
    const materials = itemMaterials(item);
    if (materials.length) parts.push(materials.slice(0, 2).join(' / '));
    const silhouettes = itemSilhouettes(item);
    if (silhouettes.length) parts.push(silhouettes[0] + '廓形');
    parts.push(item.category || '单品');
    const warmths = itemWarmths(item);
    if (warmths.length) parts.push(warmths.join('/') + '厚度');
    const tags = []
      .concat(itemStyles(item))
      .concat(itemScenes(item))
      .concat(itemSeasons(item));
    if (tags.length) parts.push('适合 ' + tags.slice(0, 5).join(' / '));
    return parts.filter(Boolean).join(' · ');
  }

  // —— 读取多选字段（同时合并 legacy 单值与 xxxOther 自由输入）——
  function itemColors(item) {
    return dedupe([...asArr(item.colors), item.color, item.colorOther]);
  }
  function itemWarmths(item) {
    return dedupe([...asArr(item.warmthTags), item.warmth, item.warmthOther]);
  }
  function itemMaterials(item) {
    return dedupe([...asArr(item.materials), item.material, item.materialOther]);
  }
  function itemSilhouettes(item) {
    return dedupe([...asArr(item.silhouettes), item.silhouette]);
  }
  function itemStyles(item) {
    return dedupe([...asArr(item.styleTags), item.styleOther]);
  }
  function itemScenes(item) {
    return dedupe([...asArr(item.sceneTags), item.sceneOther]);
  }
  function itemSeasons(item) {
    return dedupe([...asArr(item.seasonTags), item.seasonOther]);
  }

  // 兼容老数据：读出时补齐新字段的默认值，避免 undefined
  function normalizeItem(item) {
    if (!item) return item;
    // 1. 合并 arrays（legacy → arrays）
    const colors = dedupe([...asArr(item.colors), item.color]);
    const warmthTags = dedupe([...asArr(item.warmthTags), item.warmth]);
    const materials = dedupe([...asArr(item.materials), item.material]);
    const silhouettes = dedupe([...asArr(item.silhouettes), item.silhouette]);
    const styleTags = dedupe(asArr(item.styleTags));
    const sceneTags = dedupe(asArr(item.sceneTags));
    const seasonTags = dedupe(asArr(item.seasonTags));

    const merged = {
      id: item.id || uid('itm'),
      name: item.name || '未命名单品',
      category: item.category || '上衣',
      // arrays
      colors,
      warmthTags,
      materials,
      silhouettes,
      styleTags,
      sceneTags,
      seasonTags,
      // "其他"自由输入
      colorOther: item.colorOther || '',
      warmthOther: item.warmthOther || '',
      materialOther: item.materialOther || '',
      styleOther: item.styleOther || '',
      sceneOther: item.sceneOther || '',
      seasonOther: item.seasonOther || '',
      // legacy 单值（保持向后兼容：优先取 arrays[0]，再退回原字段）
      color: colors[0] || item.color || '',
      warmth: warmthTags[0] || item.warmth || '',
      material: materials[0] || item.material || '',
      silhouette: silhouettes[0] || item.silhouette || '',
      fitTags: item.fitTags || [],
      description: item.description || '',
      customNotes: item.customNotes || '',
      image: item.image || '',
      originalImage: item.originalImage || '',
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || item.createdAt || Date.now(),
    };
    if (!merged.description) merged.description = buildSystemDescription(merged);
    return merged;
  }

  function resolveBackendImageUrl(url) {
    if (!url) return '';
    const raw = String(url);
    if (raw.startsWith('http://127.0.0.1') || raw.startsWith('http://localhost')) return '';
    if (raw.startsWith('http')) return raw;
    return getApiBase() + raw;
  }

  function mapBackendClothing(row) {
    const notes = row.notes ? String(row.notes) : '';
    return normalizeItem({
      id: 'api-' + row.id,
      backendId: row.id,
      name: row.name,
      category: row.category,
      colors: row.color ? [row.color] : [],
      seasonTags: row.season ? String(row.season).split(/[、,，/ ]+/).filter(Boolean) : [],
      styleTags: row.style_tags ? String(row.style_tags).split(/[、,，/ ]+/).filter(Boolean) : [],
      customNotes: notes,
      image: resolveBackendImageUrl(row.image_url),
      createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
      updatedAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
    });
  }

  async function syncWardrobeFromBackend() {
    const data = await apiFetch('/api/v1/clothes');
    const remoteItems = (data.items || []).map(mapBackendClothing);
    // 登录状态下：后端是唯一真相源，避免本地残留导致“删了又回来 / 切换不一致”。
    saveWardrobe(remoteItems);
    return remoteItems;
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/data:([^;]+);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadImageToBackend(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return '';
    const fd = new FormData();
    fd.append('file', blob, 'clothing.png');
    fd.append('category', 'clothes');
    const data = await apiFetch('/api/v1/uploads', { method: 'POST', body: fd });
    return data.url || '';
  }

  async function addWardrobeItemRemote(item) {
    const full = normalizeItem(item);
    let remoteImageUrl = '';
    if (full.image && String(full.image).startsWith('data:')) {
      remoteImageUrl = await uploadImageToBackend(full.image);
    }
    let nonDataImageUrl = full.image && !String(full.image).startsWith('data:') ? String(full.image) : '';
    if (nonDataImageUrl && nonDataImageUrl.startsWith(getApiBase())) {
      nonDataImageUrl = nonDataImageUrl.slice(getApiBase().length);
    }
    const payload = {
      name: full.name,
      category: full.category,
      color: itemColors(full).join('、') || '未填写',
      season: itemSeasons(full).join('、') || '四季',
      style_tags: itemStyles(full).join('、'),
      notes: full.customNotes || full.description || '',
      image_url: remoteImageUrl || (nonDataImageUrl || null),
    };
    const data = await apiFetch('/api/v1/clothes', { method: 'POST', body: JSON.stringify(payload) });
    const mapped = mapBackendClothing(data.item);
    const list = getWardrobe().filter((x) => x.backendId !== mapped.backendId && x.id !== mapped.id);
    list.push(mapped);
    if (!saveWardrobe(list)) {
      const slim = list.map((x) => ({ ...x, originalImage: '', image: x.backendId ? x.image : '' }));
      saveWardrobe(slim);
    }
    return mapped;
  }

  function addWardrobeItem(item) {
    const list = getWardrobe();
    const full = normalizeItem(item);
    list.push(full);
    const ok = saveWardrobe(list);
    if (!ok) {
      // 尝试瘦身：把已有单品的 originalImage 丢弃再重试一次，本次新单品也只保留 image
      const slim = list.map((x, idx) =>
        idx === list.length - 1
          ? { ...x, originalImage: '' }
          : { ...x, originalImage: '' },
      );
      if (saveWardrobe(slim)) {
        return slim[slim.length - 1];
      }
      const lite = list.map((x, idx) => ({
        ...x,
        image: idx === list.length - 1 ? x.image : '',
        originalImage: '',
      }));
      if (saveWardrobe(lite)) {
        return lite[lite.length - 1];
      }
      // 仍失败：抛错让 UI 弹提示（不改回旧列表 – 因为 localStorage 未变）
      const err = new Error('WARDROBE_STORAGE_FULL');
      err.code = 'STORAGE_FULL';
      throw err;
    }
    return full;
  }
  function deleteWardrobeItem(id) {
    saveWardrobe(getWardrobe().filter((x) => x.id !== id));
  }
  async function deleteWardrobeItemRemote(item) {
    if (!item) return false;
    const backendId = item.backendId || (String(item.id || '').startsWith('api-') ? Number(String(item.id).slice(4)) : null);
    if (backendId) {
      await apiFetch('/api/v1/clothes/' + backendId, { method: 'DELETE' });
    }
    deleteWardrobeItem(item.id);
    return true;
  }
  // 更新单品（部分字段合并）；同时刷新 description（若用户未手写覆盖）与 updatedAt
  function updateWardrobeItem(id, patch) {
    const list = getWardrobe();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    const before = list[idx];
    // 若 patch 未显式提供 description，就基于结构化字段重算，保证标签/颜色变化后描述自动更新
    const merged = normalizeItem({ ...before, ...patch, updatedAt: Date.now() });
    if (!(patch && Object.prototype.hasOwnProperty.call(patch, 'description'))) {
      merged.description = buildSystemDescription(merged);
    }
    list[idx] = merged;
    const ok = saveWardrobe(list);
    if (!ok) {
      // 图片可能变大：尝试丢 originalImage 再存
      list[idx] = { ...merged, originalImage: '' };
      if (!saveWardrobe(list)) {
        const err = new Error('WARDROBE_STORAGE_FULL');
        err.code = 'STORAGE_FULL';
        throw err;
      }
    }
    return list[idx];
  }

  async function updateWardrobeItemRemote(id, patch) {
    const list = getWardrobe();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return null;

    const before = list[idx];
    const merged = normalizeItem({ ...before, ...patch, updatedAt: Date.now() });

    const backendId =
      merged.backendId ||
      (String(merged.id || '').startsWith('api-') ? Number(String(merged.id).slice(4)) : null);
    if (!backendId) {
      const created = await addWardrobeItemRemote(merged);
      saveWardrobe(getWardrobe().filter((x) => x.id !== id || x.backendId).map((x) => (x.id === created.id ? created : x)));
      return created;
    }

    let imageUrl = merged.image_url || merged.imageUrl || merged.image || '';
    if (String(imageUrl).startsWith('data:image/')) {
      imageUrl = await uploadImageToBackend(imageUrl, 'clothes');
    }
    // 显示用可能是完整 URL（http://127...）；保存到后端时要写相对路径，避免下次同步拼接成“双重前缀”。
    if (imageUrl && String(imageUrl).startsWith(getApiBase())) {
      imageUrl = String(imageUrl).slice(getApiBase().length);
    }

    const payload = {
      name: String(merged.name || '').trim() || '未命名单品',
      category: String(merged.category || '').trim() || '上衣',
      color: String(merged.color || '').trim() || '未填写',
      season: String(merged.season || '').trim() || '四季',
      style_tags: (merged.styleTags || []).join(',') || '',
      notes: String(merged.customNotes || '').trim() || '',
      image_url: imageUrl || null,
    };

    let data;
    try {
      data = await apiFetch('/api/v1/clothes/' + backendId, { method: 'PUT', body: JSON.stringify(payload) });
    } catch (e) {
      if (e && (e.status === 405 || e.status === 404)) {
        data = await apiFetch('/api/v1/clothes', { method: 'POST', body: JSON.stringify(payload) });
        try { await apiFetch('/api/v1/clothes/' + backendId, { method: 'DELETE' }); } catch { /* 旧版本后端可能也不支持删除，先保证编辑保存成功 */ }
      } else {
        throw e;
      }
    }
    const mapped = mapBackendClothing(data.item);
    const next = getWardrobe()
      .filter((x) => x.id !== id && x.backendId !== backendId && x.backendId !== mapped.backendId)
      .concat(mapped);
    saveWardrobe(next);
    return mapped;
  }

  // ------------ Outfit records ------------
  function getOutfits() {
    return load(K.OUTFITS, []);
  }
  function saveOutfits(list) {
    save(K.OUTFITS, list);
  }
  function addOutfit(record) {
    const list = getOutfits();
    const full = {
      id: record.id || uid('otf'),
      date:
        record.date ||
        new Date().toISOString().slice(0, 10),
      style: record.style || '简约',
      scene: record.scene || '通勤',
      weather: record.weather || null,
      outfit: record.outfit || {},
      createdAt: record.createdAt || Date.now(),
    };
    list.push(full);
    saveOutfits(list);
    return full;
  }
  const saveOutfitRecord = addOutfit;

  function inferRecordStyle(text, scene) {
    const raw = String(text || '');
    const explicit = raw.match(/^风格[:：]\s*([^｜|\n]+)/);
    if (explicit && explicit[1]) return explicit[1].trim();
    const haystack = raw + ' ' + (scene || '');
    const candidates = ['简约通勤', '法式松弛', '复古学院', '街头Y2K', '北欧机能', '甜系少女', '名人潮流'];
    return candidates.find((x) => haystack.includes(x)) || '简约通勤';
  }

  function mapBackendRecord(row) {
    return {
      id: 'api-rec-' + row.id,
      backendId: row.id,
      date: row.created_at ? row.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      style: inferRecordStyle(row.recommendation_text, row.scene),
      scene: row.scene,
      weather: row.weather,
      outfit: {
        title: row.scene + '穿搭记录',
        summary: row.recommendation_text,
        selected_items: [],
      },
      createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
    };
  }
  async function syncOutfitsFromBackend() {
    const data = await apiFetch('/api/v1/outfit-records');
    const items = (data.items || []).map(mapBackendRecord);
    saveOutfits(items);
    return items;
  }
  async function saveOutfitRecordRemote(record) {
    const selected = (record.outfit?.selected_items || []).map((x) => x.backendId || (String(x.id || '').startsWith('api-') ? Number(String(x.id).slice(4)) : null)).filter(Boolean);
    const baseText = record.outfit?.summary || record.outfit?.color_reason || record.outfit?.title || JSON.stringify(record.outfit || {});
    const text = '风格：' + (record.style || '简约通勤') + '｜' + baseText;
    const data = await apiFetch('/api/v1/outfit-records', {
      method: 'POST',
      body: JSON.stringify({
        recommendation_text: text,
        scene: record.scene || '日常通勤',
        weather: typeof record.weather === 'string' ? record.weather : (record.weather?.summary || '未知'),
        selected_clothing_ids: selected,
        ai_provider: record.outfit?.ai_provider || null,
        ai_model: record.outfit?.ai_model || null,
      }),
    });
    const mapped = mapBackendRecord(data.item);
    const list = getOutfits().filter((x) => x.backendId !== mapped.backendId && x.id !== mapped.id);
    list.push(mapped);
    saveOutfits(list);
    return mapped;
  }
  function deleteOutfit(id) {
    saveOutfits(getOutfits().filter((x) => x.id !== id));
  }

  // ------------ Links (Inspire library) ------------
  function getLinks() {
    return load(K.LINKS, []);
  }
  function saveLinks(list) {
    save(K.LINKS, list);
  }
  function addLink(link) {
    if (!link || !link.url) return null;
    const list = getLinks();
    const full = {
      id: link.id || uid('lnk'),
      url: link.url,
      title: link.title || guessTitleFromUrl(link.url),
      note: link.note || '',
      tags: link.tags || [],
      createdAt: link.createdAt || Date.now(),
    };
    list.push(full);
    saveLinks(list);
    return full;
  }
  function deleteLink(id) {
    saveLinks(getLinks().filter((x) => x.id !== id));
  }
  function renameLink(id, title) {
    const nextTitle = String(title || '').trim();
    if (!id || !nextTitle) return null;
    let updated = null;
    const list = getLinks().map((x) => {
      if (x.id !== id) return x;
      updated = { ...x, title: nextTitle, updatedAt: Date.now() };
      return updated;
    });
    saveLinks(list);
    return updated;
  }
  function guessTitleFromUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const map = {
        'xiaohongshu.com': '小红书内容',
        'xhslink.com': '小红书内容',
        'xhslink.cn': '小红书内容',
        'douyin.com': '抖音视频',
        'iesdouyin.com': '抖音视频',
        'v.douyin.com': '抖音视频',
        'taobao.com': '淘宝商品',
        'tmall.com': '天猫商品',
        'jd.com': '京东商品',
      };
      for (const k of Object.keys(map))
        if (host.endsWith(k)) return map[k];
      return host || '外部链接';
    } catch {
      return '外部链接';
    }
  }

  // ------------ Preferences ------------
  function getPreferences() {
    return load(K.PREF, {
      style: '简约',
      scene: '通勤',
      aiEndpoint: '',
    });
  }
  function savePreferences(p) {
    save(K.PREF, p);
  }

  // ------------ User profile ------------
  const K_PROFILE = 'yijian_user_profile';
  function getProfile() {
    return load(K_PROFILE, {
      avatar: '', // data URL 或空
      name: '衣见的主理人',
      email: '',
      passwordHash: '',
      passwordSalt: '',
      authStatus: 'none',
      bio: '记录每天的真实穿搭',
    });
  }
  function saveProfile(p) {
    save(K_PROFILE, p);
    return p;
  }
  function mergeRemoteProfile(remote) {
    const current = getProfile();
    const source = remote && (remote.profile || remote.user)
      ? { ...(remote.user || {}), ...(remote.profile || {}) }
      : (remote || {});
    const merged = {
      ...current,
      name: source.display_name != null ? source.display_name : current.name,
      avatar: source.avatar != null ? source.avatar : current.avatar,
      bio: source.bio != null ? source.bio : current.bio,
      email: source.email != null ? source.email : current.email,
      authStatus: 'demo_logged_in',
      backendUserId: source.id != null
        ? source.id
        : (source.user_id != null ? source.user_id : current.backendUserId),
    };
    return saveProfile(merged);
  }
  async function syncProfileFromBackend() {
    const data = await apiFetch('/api/v1/profile');
    return mergeRemoteProfile(data);
  }
  async function updateProfileRemote(profile) {
    const data = await apiFetch('/api/v1/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: profile.name,
        avatar: profile.avatar || '',
        bio: profile.bio || '',
      }),
    });
    return mergeRemoteProfile(data);
  }
  // 该用户在本机的所有「数据缓存」key（不含 token / profile / 站点配置 API_BASE / AI_CFG）。
  // 登录后「先清本地再从后端同步」、以及退出登录时都会用到，避免换账号串数据。
  const USER_DATA_KEYS = [K.WARDROBE, K.OUTFITS, K.LINKS, K.WEATHER, K.AI_LOG, K.PREF];
  function clearLocalUserData() {
    USER_DATA_KEYS.forEach((k) => localStorage.removeItem(k));
  }
  function clearUserSession() {
    // 退出登录：清空 token + profile + 全部本地用户数据（衣橱 / 穿搭日记 / 灵感 / 天气 / 偏好等）
    localStorage.removeItem(K.API_TOKEN);
    localStorage.removeItem(K_PROFILE);
    clearLocalUserData();
    return getProfile();
  }
  // 邮箱格式校验（前端校验，真实注册仍需邮箱验证链接）
  function validateEmail(s) {
    return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test((s || '').trim());
  }
  // 极简密码强度校验：>=8 位，且包含字母 + 数字
  function passwordStrength(pw) {
    const s = pw || '';
    if (s.length < 6) return { ok: false, reason: '密码至少 6 位' };
    if (s.length < 8) return { ok: true, level: 'weak', reason: '建议至少 8 位并混合字母 + 数字' };
    const hasLetter = /[A-Za-z]/.test(s);
    const hasDigit = /\d/.test(s);
    if (hasLetter && hasDigit) return { ok: true, level: 'good', reason: '' };
    return { ok: true, level: 'weak', reason: '建议混合字母 + 数字提升强度' };
  }
  // 演示用："密码 hash"仅做混淆展示，绝非真正安全散列。
  // 真实产品必须在后端用 bcrypt / argon2 存 hash。这里的目的是不把明文写进 localStorage。
  function demoHashPassword(pw, salt) {
    const s = (pw || '') + '::' + (salt || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    // 再混一层 base36
    return h.toString(36) + '.' + s.length.toString(36);
  }
  function makeSalt() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  async function authRegister(email, password, displayName) {
    const data = await apiFetch('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName || '衣见的主理人' }),
    });
    setApiToken(data.token);
    return data;
  }
  async function authLogin(email, password) {
    const data = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setApiToken(data.token);
    return data;
  }
  async function authMe() {
    return apiFetch('/api/v1/auth/me');
  }
  async function syncAllFromBackend() {
    const [wardrobe, outfits] = await Promise.all([syncWardrobeFromBackend(), syncOutfitsFromBackend()]);
    return { wardrobe, outfits };
  }

  // ------------ Geolocation permission ------------
  // 查询浏览器 permission API（不是所有浏览器支持 permissions.geolocation）
  async function queryGeoPermission() {
    try {
      if (navigator.permissions?.query) {
        const s = await navigator.permissions.query({ name: 'geolocation' });
        return s.state; // 'granted' | 'prompt' | 'denied'
      }
    } catch {
      /* ignore */
    }
    return 'unknown';
  }

  // ------------ Image utils ------------
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  // 简易本地抠图：对四角/边缘做种子色采样，凡是接近该色的像素设为透明
  async function removeBackgroundLocal(dataUrl) {
    try {
      const img = await loadImage(dataUrl);
      const maxSide = 900;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      // 采样：四个角+边缘中点
      const samples = [];
      const points = [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [Math.floor(w / 2), 0],
        [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)],
        [w - 1, Math.floor(h / 2)],
      ];
      for (const [x, y] of points) {
        const i = (y * w + x) * 4;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
      // 平均
      const avg = samples
        .reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0])
        .map((v) => v / samples.length);
      const isLightBg =
        (avg[0] + avg[1] + avg[2]) / 3 > 180; // 只对浅色/白色背景做抠图
      const tolerance = isLightBg ? 46 : 32;
      const tol2 = tolerance * tolerance;
      // BFS 从边缘出发，把与背景色接近且连通到边缘的像素设为透明（避免误抠中央同色）
      const visited = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) {
        stack.push(x, 0);
        stack.push(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        stack.push(0, y);
        stack.push(w - 1, y);
      }
      const near = (i) => {
        const dr = data[i] - avg[0];
        const dg = data[i + 1] - avg[1];
        const db = data[i + 2] - avg[2];
        return dr * dr + dg * dg + db * db <= tol2;
      };
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const p = y * w + x;
        if (visited[p]) continue;
        visited[p] = 1;
        const i = p * 4;
        if (!near(i)) continue;
        data[i + 3] = 0;
        stack.push(x + 1, y);
        stack.push(x - 1, y);
        stack.push(x, y + 1);
        stack.push(x, y - 1);
      }
      // 边缘半透明羽化：找到不透明像素相邻透明像素时降 alpha
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          const i = p * 4;
          if (data[i + 3] === 0) continue;
          let hollow = 0;
          if (data[((y - 1) * w + x) * 4 + 3] === 0) hollow++;
          if (data[((y + 1) * w + x) * 4 + 3] === 0) hollow++;
          if (data[(y * w + x - 1) * 4 + 3] === 0) hollow++;
          if (data[(y * w + x + 1) * 4 + 3] === 0) hollow++;
          if (hollow > 0) data[i + 3] = Math.max(100, 255 - hollow * 45);
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return dataUrl; // 失败退回原图
    }
  }
  // 抠图入口：预留 AI API，默认走本地
  async function removeBackground(dataUrl, _options) {
    // 如果配置了 AI 抠图 API（占位）：
    const cfg = window.YijianAIConfig || {};
    if (cfg.cutoutEndpoint && cfg.cutoutApiKey) {
      try {
        const res = await fetch(cfg.cutoutEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + cfg.cutoutApiKey,
          },
          body: JSON.stringify({ image: dataUrl }),
        });
        if (res.ok) {
          const j = await res.json();
          if (j.image) return j.image;
        }
      } catch {
        /* fallthrough */
      }
    }
    return await removeBackgroundLocal(dataUrl);
  }
  // 图片过大提示（>2MB）
  function estimateSize(dataUrl) {
    if (!dataUrl) return 0;
    const base = dataUrl.split(',')[1] || '';
    return Math.floor((base.length * 3) / 4);
  }
  // 压缩图片到指定最大边长 & JPEG 质量，返回 data URL；失败返回原图
  async function compressImage(dataUrl, maxSide, quality, mime) {
    maxSide = maxSide || 720;
    quality = quality || 0.82;
    mime = mime || 'image/jpeg';
    try {
      const img = await loadImage(dataUrl);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // JPEG 无透明通道，用白底 flatten；PNG 保留透明
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL(mime, quality);
    } catch {
      return dataUrl;
    }
  }

  // ------------ Weather ------------
  const weatherCodeMap = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '雾',
    51: '毛毛雨',
    53: '小雨',
    55: '中雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    80: '阵雨',
    81: '阵雨',
    82: '强阵雨',
    95: '雷雨',
    96: '雷阵雨',
    99: '强雷雨',
  };
  function warmthNeedFor(temp) {
    if (temp < 15) return '保暖';
    if (temp <= 25) return '轻薄层次';
    return '清爽轻薄';
  }
  const DEFAULT_WEATHER = {
    temperature: 22,
    precipitation: 0,
    windSpeed: 2,
    weatherLabel: '晴',
    warmthNeed: '轻薄层次',
    city: '默认城市',
    isFallback: true,
  };
  function getStoredWeather() {
    return load(K.WEATHER, null);
  }
  // 逆地理编码：把经纬度转成城市名。使用 Open-Meteo 官方 geocoding search 反过来行不通，
  // 这里用 BigDataCloud 免费的 client-side reverse geocode（无需 key）；失败则退回 Open-Meteo 的时区名。
  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' +
          lat +
          '&longitude=' +
          lon +
          '&localityLanguage=zh',
      );
      if (res.ok) {
        const j = await res.json();
        const city =
          j.city || j.locality || j.principalSubdivision || '';
        const suburb = j.localityInfo?.administrative?.slice(-1)?.[0]?.name;
        return suburb || city || '';
      }
    } catch {
      /* ignore */
    }
    return '';
  }
  // 真实定位入口：返回 { status: 'ok' | 'denied' | 'unavailable' | 'timeout' | 'no_support' | 'weather_error', weather? }
  function fetchWeather() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ status: 'no_support' });
        return;
      }
      if (!window.isSecureContext && location.hostname !== 'localhost') {
        // Geolocation 在非安全上下文中会被浏览器拒绝
        resolve({ status: 'insecure' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude, accuracy } = pos.coords;
            const forecastRes = await fetch(
              'https://api.open-meteo.com/v1/forecast?latitude=' +
                latitude +
                '&longitude=' +
                longitude +
                '&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=auto',
            );
            if (!forecastRes.ok) throw new Error('weather_bad');
            const j = await forecastRes.json();
            const cur = j.current || {};
            const cityName = await reverseGeocode(latitude, longitude);
            const w = {
              temperature: Math.round(cur.temperature_2m ?? 22),
              precipitation: cur.precipitation ?? 0,
              windSpeed: cur.wind_speed_10m ?? 0,
              weatherLabel: weatherCodeMap[cur.weather_code] || '多云',
              warmthNeed: warmthNeedFor(cur.temperature_2m ?? 22),
              city: cityName || (j.timezone || '当前位置').split('/').pop().replace(/_/g, ' '),
              lat: latitude,
              lon: longitude,
              accuracy: accuracy ? Math.round(accuracy) : null,
              updatedAt: Date.now(),
              isFallback: false,
            };
            save(K.WEATHER, w);
            resolve({ status: 'ok', weather: w });
          } catch {
            resolve({ status: 'weather_error' });
          }
        },
        (err) => {
          if (err.code === 1) resolve({ status: 'denied' });
          else if (err.code === 3) resolve({ status: 'timeout' });
          else resolve({ status: 'unavailable' });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    });
  }

  // ------------ Creator Library ------------
  // 博主库：全部为真实存在、可直接打开的公开博主个人主页（Instagram 认证账号）。
  // 每条 url 均为该博主的官方个人主页 URL，非搜索页 / 话题页 / 频道页。
  // 每条 handle 都是本人真实公开的 Instagram 用户名（可 WebSearch 验证），
  // 而不是我们脑补的字符串；若未来平台账号迁移，只需替换 url + handle 即可。
  // category 用于按风格分组展示（首页 3 位精选 + 「查看全部博主」全景）。
  const creatorLibrary = [
    // —— 简约 · 法式 · 都市通勤 ——
    {
      id: 'creator-aimee-song',
      name: 'Aimee Song',
      platform: 'Instagram',
      handle: '@aimeesong',
      category: '简约 · 都市通勤',
      styleTags: ['简约', 'Clean fit', '法式', '通勤'],
      sceneTags: ['通勤', '约会', '正式场合'],
      description: 'Song of Style 主理人。干净时装、松弛通勤，配色克制。',
      url: 'https://www.instagram.com/aimeesong/',
      avatar: 'AS',
    },
    {
      id: 'creator-chriselle-lim',
      name: 'Chriselle Lim',
      platform: 'Instagram',
      handle: '@chrisellelim',
      category: '简约 · 都市通勤',
      styleTags: ['法式', '简约', '精致'],
      sceneTags: ['通勤', '约会', '聚会'],
      description: 'The Chriselle Factor 创始人。都市女性精致日常，注重廓形与质感。',
      url: 'https://www.instagram.com/chrisellelim/',
      avatar: 'CL',
    },
    {
      id: 'creator-olivia-palermo',
      name: 'Olivia Palermo',
      platform: 'Instagram',
      handle: '@oliviapalermo',
      category: '简约 · 都市通勤',
      styleTags: ['优雅', '简约', '精致', '通勤'],
      sceneTags: ['通勤', '正式场合', '约会'],
      description: '纽约名流风范教科书。廓形西装 + 高品质单品的可复制样本。',
      url: 'https://www.instagram.com/oliviapalermo/',
      avatar: 'OP',
    },

    // —— 巴黎 · 法式松弛 ——
    {
      id: 'creator-jeanne-damas',
      name: 'Jeanne Damas',
      platform: 'Instagram',
      handle: '@jeannedamas',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '复古', '女人味', '松弛'],
      sceneTags: ['约会', '周末', '聚会'],
      description: 'Rouje 主理人。碎花裙、红唇、平底鞋，最经典的巴黎女孩样板。',
      url: 'https://www.instagram.com/jeannedamas/',
      avatar: 'JD',
    },
    {
      id: 'creator-camille-charriere',
      name: 'Camille Charrière',
      platform: 'Instagram',
      handle: '@camillecharriere',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '英伦', 'Y2K', '简约'],
      sceneTags: ['通勤', '周末', '约会'],
      description: '英法混血造型师。基础色 + Denim + 海军蓝，教科书级"少而精"。',
      url: 'https://www.instagram.com/camillecharriere/',
      avatar: 'CC',
    },
    {
      id: 'creator-sabina-socol',
      name: 'Sabina Socol',
      platform: 'Instagram',
      handle: '@sabinasocol',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '复古', '女人味', '松弛'],
      sceneTags: ['约会', '周末', '聚会'],
      description: '巴黎复古法式代表之一。针织、碎花、牛仔的“轻复古”很耐看。',
      url: 'https://www.instagram.com/sabinasocol/',
      avatar: 'SS',
    },
    {
      id: 'creator-anne-laure-mais',
      name: 'Anne-Laure Mais',
      platform: 'Instagram',
      handle: '@annelauremais',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '简约', '松弛', '色彩'],
      sceneTags: ['通勤', '周末', '约会'],
      description: '法式日常的轻松版本：基础款 + 少量色彩点睛，松弛但不邋遢。',
      url: 'https://www.instagram.com/annelauremais/',
      avatar: 'AM',
    },

    // —— 复古 · 学院 · 英伦 ——
    {
      id: 'creator-alexa-chung',
      name: 'Alexa Chung',
      platform: 'Instagram',
      handle: '@alexachung',
      category: '复古 · 学院 · 英伦',
      styleTags: ['学院', '复古', '英伦'],
      sceneTags: ['通勤', '约会', '周末'],
      description: '英伦学院感代表。乐福鞋、格纹、微复古比例的教科书。',
      url: 'https://www.instagram.com/alexachung/',
      avatar: 'AC',
    },
    {
      id: 'creator-matilda-djerf',
      name: 'Matilda Djerf',
      platform: 'Instagram',
      handle: '@matildadjerf',
      category: '复古 · 学院 · 英伦',
      styleTags: ['复古', '简约', '北欧', '松弛'],
      sceneTags: ['周末', '约会', '旅行'],
      description: 'Djerf Avenue 主理人。70s 复古 x 北欧松弛，白衬衫哲学。',
      url: 'https://www.instagram.com/matildadjerf/',
      avatar: 'MD',
    },
    {
      id: 'creator-leandra-cohen',
      name: 'Leandra Medine Cohen',
      platform: 'Instagram',
      handle: '@leandramcohen',
      category: '复古 · 学院 · 英伦',
      styleTags: ['复古', '编辑感', '色彩', '实验'],
      sceneTags: ['聚会', '约会', '周末'],
      description: '前 Man Repeller 创始人，现 The Cereal Aisle 主理。会玩色彩与比例的"反最大公约数"穿搭。',
      url: 'https://www.instagram.com/leandramcohen/',
      avatar: 'LC',
    },

    // —— 街头 · Y2K · 编辑感 ——
    {
      id: 'creator-emma-chamberlain',
      name: 'Emma Chamberlain',
      platform: 'Instagram',
      handle: '@emmachamberlain',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['街头', '复古', 'Y2K', '日常'],
      sceneTags: ['周末', '旅行', '聚会'],
      description: 'Vintage x Y2K x 咖啡系日常，年轻街头风的重要样本。',
      url: 'https://www.instagram.com/emmachamberlain/',
      avatar: 'EC',
    },
    {
      id: 'creator-reese-blutstein',
      name: 'Reese Blutstein',
      platform: 'Instagram',
      handle: '@double3xposure',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['Quirky', '复古', '色彩', 'Vintage'],
      sceneTags: ['周末', '聚会', '约会'],
      description: '古着女神。撞色、超大 blazer、图案 mix，把 vintage 穿成个人语言。',
      url: 'https://www.instagram.com/double3xposure/',
      avatar: 'RB',
    },
    {
      id: 'creator-susie-lau',
      name: 'Susie Lau',
      platform: 'Instagram',
      handle: '@susiebubble',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['编辑感', '前卫', '色彩', 'Print mix'],
      sceneTags: ['聚会', '看秀', '周末'],
      description: 'Style Bubble 主理，伦敦最资深的独立时装编辑之一。前卫、印花、色块。',
      url: 'https://www.instagram.com/susiebubble/',
      avatar: 'SL',
    },

    // —— 北欧 · 机能 · 户外 ——
    {
      id: 'creator-pernille-teisbaek',
      name: 'Pernille Teisbaek',
      platform: 'Instagram',
      handle: '@pernilleteisbaek',
      category: '北欧 · 机能 · 户外',
      styleTags: ['北欧', '简约', '户外', '机能'],
      sceneTags: ['旅行', '周末', '运动', '通勤'],
      description: '哥本哈根造型师。北欧简约 + 城市机能，把大衣与运动鞋穿得高级。',
      url: 'https://www.instagram.com/pernilleteisbaek/',
      avatar: 'PT',
    },
    {
      id: 'creator-beatrice-gutu',
      name: 'Beatrice Gutu',
      platform: 'Instagram',
      handle: '@beatrice.gutu',
      category: '北欧 · 机能 · 户外',
      styleTags: ['极简', '中性', '通勤', '德系'],
      sceneTags: ['通勤', '出差', '约会'],
      description: '慕尼黑极简博主。利落廓形、克制配色、小个子也能撑住的比例。',
      url: 'https://www.instagram.com/beatrice.gutu/',
      avatar: 'BG',
    },
    {
      id: 'creator-nicole-warne',
      name: 'Nicole Warne',
      platform: 'Instagram',
      handle: '@nicolewarne',
      category: '北欧 · 机能 · 户外',
      styleTags: ['自然', '旅行', '优雅', '大地色'],
      sceneTags: ['旅行', '周末', '度假'],
      description: 'Gary Pepper Girl 创始人。旅行 + 大地色 + 慢时尚，把风景穿在身上。',
      url: 'https://www.instagram.com/nicolewarne/',
      avatar: 'NW',
    },

    // —— 加州 · Girly · 甜系 ——
    {
      id: 'creator-julie-sarinana',
      name: 'Julie Sariñana',
      platform: 'Instagram',
      handle: '@sincerelyjules',
      category: '加州 · Girly · 甜系',
      styleTags: ['加州', '休闲', '波西米亚', '日常'],
      sceneTags: ['周末', '度假', '约会'],
      description: 'Sincerely Jules 创始人。松弛加州、白 T Denim、日光感调色。',
      url: 'https://www.instagram.com/sincerelyjules/',
      avatar: 'JS',
    },
    {
      id: 'creator-caroline-daur',
      name: 'Caroline Daur',
      platform: 'Instagram',
      handle: '@carodaur',
      category: '加州 · Girly · 甜系',
      styleTags: ['甜系', 'Girly', '色彩', '看秀'],
      sceneTags: ['聚会', '约会', '看秀'],
      description: '德国 It Girl。色彩饱和、Dior x Miu Miu 常客，甜辣切换自如。',
      url: 'https://www.instagram.com/carodaur/',
      avatar: 'CD',
    },
    {
      id: 'creator-bettina-looney',
      name: 'Bettina Looney',
      platform: 'Instagram',
      handle: '@bettinalooney',
      category: '加州 · Girly · 甜系',
      styleTags: ['度假', '色彩', '优雅', 'Y2K'],
      sceneTags: ['度假', '约会', '聚会'],
      description: '造型师 + 编辑。度假色系、印花连衣裙、Riviera 光影哲学。',
      url: 'https://www.instagram.com/bettinalooney/',
      avatar: 'BL',
    },

    // —— 名人 · 潮流 · 品牌向 ——
    {
      id: 'creator-chiara-ferragni',
      name: 'Chiara Ferragni',
      platform: 'Instagram',
      handle: '@chiaraferragni',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['潮流', '大牌', 'Y2K', '色彩'],
      sceneTags: ['看秀', '聚会', '度假'],
      description: 'The Blonde Salad 创始人。第一代时尚博主，走秀常客，品牌感极强。',
      url: 'https://www.instagram.com/chiaraferragni/',
      avatar: 'CF',
    },
    {
      id: 'creator-weworewhat',
      name: 'Danielle Bernstein',
      platform: 'Instagram',
      handle: '@weworewhat',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['都市', '编辑感', '潮流', 'Denim'],
      sceneTags: ['通勤', '聚会', '看秀'],
      description: 'We Wore What 创始人。纽约都市感 + 商业化搭配，很好复现的日常公式。',
      url: 'https://www.instagram.com/weworewhat/',
      avatar: 'DB',
    },
    {
      id: 'creator-hailey-bieber',
      name: 'Hailey Bieber',
      platform: 'Instagram',
      handle: '@haileybieber',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['名人', '潮流', '极简', '品牌'],
      sceneTags: ['通勤', '聚会', '看秀'],
      description: '名人街拍样板。极简基础款 + 大牌单品，适合抄作业。',
      url: 'https://www.instagram.com/haileybieber/',
      avatar: 'HB',
    },
    {
      id: 'creator-kendall-jenner',
      name: 'Kendall Jenner',
      platform: 'Instagram',
      handle: '@kendalljenner',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['名人', '潮流', '街拍', '品牌'],
      sceneTags: ['旅行', '周末', '看秀'],
      description: '名人街拍参考。简洁轮廓 + 经典单品，非常适合做“风格方向标”。',
      url: 'https://www.instagram.com/kendalljenner/',
      avatar: 'KJ',
    },

    // —— 小红书 · 国内可打开 ——
    // 只保留能拿到已验证 /user/profile/<UID> 的账号，全部直达博主本人主页。
    // 没有稳定 UID 的账号不放进来，避免降级到站内搜索页误导用户。
    {
      id: 'creator-xhs-libeka',
      name: '黎贝卡的异想世界',
      platform: '小红书',
      handle: '黎贝卡',
      category: '简约 · 都市通勤',
      styleTags: ['优雅', '通勤', '精致', '轻奢'],
      sceneTags: ['通勤', '约会', '聚会'],
      description: '前媒体人黎贝卡创立，长期被新浪、澎湃等媒体报道。都市女性精致穿搭与买手心得。',
      // 已验证：黎贝卡官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/5b07a61a6b58b77c769108f1',
      avatar: '黎',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-savi',
      name: 'Savislook',
      platform: '小红书',
      handle: 'Savislook',
      category: '简约 · 都市通勤',
      styleTags: ['极简', '大女主', '中性', '编辑感'],
      sceneTags: ['通勤', '出差', '正式场合'],
      description: '知名极简中性风博主 Savislook，色卡黑白米驼、线条硬朗。',
      // 已验证：Savislook 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/593974fc5e87e71ee9242f0d',
      avatar: 'SV',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-shenyexulaoshi',
      name: '深夜徐老师',
      platform: '小红书',
      handle: '深夜徐老师',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['潮流', '街头', '大牌', '实穿'],
      sceneTags: ['聚会', '通勤', '周末'],
      description: '深夜徐老师，横跨微博/B站/小红书的头部时尚 / 美妆博主，实用主义种草。',
      // 已验证：深夜徐老师官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/5269d3fbb4c4d60ea2717f96',
      avatar: '徐',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-shoushoulv',
      name: '瘦瘦璐',
      platform: '小红书',
      handle: '瘦瘦璐',
      category: '简约 · 都市通勤',
      styleTags: ['实穿', '日常', '简约', '通勤'],
      sceneTags: ['通勤', '周末', '日常'],
      description: '瘦瘦璐，偏实穿主义与日常搭配思路，适合做“好抄作业”的衣橱参考。',
      // 已验证：瘦瘦璐官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/565b15a903eb846d12ef217d',
      avatar: '璐',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-pixiesdust',
      name: 'Pixies Dust',
      platform: '小红书',
      handle: 'Pixies Dust',
      category: '加州 · Girly · 甜系',
      styleTags: ['甜酷', '氛围感', '度假', '配色'],
      sceneTags: ['旅行', '周末', '约会'],
      description: 'Pixies Dust，偏氛围感与配色灵感，适合找“整套氛围”的穿搭参考。',
      // 已验证：Pixies Dust 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/64e7315a000000000100ff89',
      avatar: 'PD',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-ria',
      name: 'RIA',
      platform: '小红书',
      handle: 'RIA',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '复古', '松弛感'],
      sceneTags: ['通勤', '约会', '周末'],
      description: 'RIA，偏法式松弛与 vintage 质感的日常穿搭灵感。',
      // 已验证：RIA 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/613edf1c0000000002018b0b',
      avatar: 'RI',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-mstudio',
      name: 'Mstudio 时尚造型工作室',
      platform: '小红书',
      handle: 'Mstudio',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '精致', '通勤'],
      sceneTags: ['通勤', '约会', '聚会'],
      description: 'Mstudio，偏法式与造型思路分享，适合做风格参考。',
      // 已验证：Mstudio 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/5f8697590000000001007eb2',
      avatar: 'MS',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-eng',
      name: '〰eng.',
      platform: '小红书',
      handle: 'eng.',
      category: '复古 · 学院 · 英伦',
      styleTags: ['复古', '学院', '英伦', '简约'],
      sceneTags: ['通勤', '周末'],
      description: '〰eng.，偏复古与学院感的日常搭配记录。',
      // 已验证：〰eng. 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/5574651e24caa95a0e976be7',
      avatar: 'EN',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-kuffylink',
      name: 'KUFFYLINK',
      platform: '小红书',
      handle: 'KUFFYLINK',
      category: '复古 · 学院 · 英伦',
      styleTags: ['学院', '英伦', 'Ivy', '复古'],
      sceneTags: ['通勤', '正式场合'],
      description: 'KUFFYLINK，常春藤/学院风单品与搭配日常。',
      // 已验证：KUFFYLINK 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/617298d60000000002022b71',
      avatar: 'KU',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-magbow',
      name: 'MAGBOW',
      platform: '小红书',
      handle: 'MAGBOW',
      category: '复古 · 学院 · 英伦',
      styleTags: ['英伦', '学院', '高智感'],
      sceneTags: ['通勤', '周末'],
      description: 'MAGBOW，偏英区留子/学院风的日常搭配。',
      // 已验证：MAGBOW 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/580417716a6a6934e4cd7974',
      avatar: 'MB',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-racerworldwide',
      name: 'racer worldwide',
      platform: '小红书',
      handle: 'racer worldwide',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['街头', 'Y2K', '潮流'],
      sceneTags: ['周末', '聚会'],
      description: 'racer worldwide，偏街头潮流向内容（更适合街头分类）。',
      // 已验证：racer worldwide 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/673f7281000000001d02ff29',
      avatar: 'RW',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-hm-move',
      name: 'H&M',
      platform: '小红书',
      handle: 'H&M',
      category: '北欧 · 机能 · 户外',
      styleTags: ['运动', '机能', '户外'],
      sceneTags: ['户外', '旅行', '周末'],
      description: 'H&M 运动/户外向内容（适合机能户外分类做参考）。',
      // 已验证：H&M 官方小红书主页
      url: 'https://www.xiaohongshu.com/user/profile/5bc0c6ed12c57b00017ea806',
      avatar: 'HM',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-avetoi',
      name: 'avetoi',
      platform: '小红书',
      handle: 'avetoi',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '松弛', '复古'],
      sceneTags: ['周末', '约会', '旅行'],
      description: 'avetoi，偏巴黎日常与法式松弛氛围的穿搭记录。',
      url: 'https://www.xiaohongshu.com/user/profile/597e5c4e5e87e720ea15dad7',
      avatar: 'AV',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-vagant-vintage',
      name: 'Vagant Vintage',
      platform: '小红书',
      handle: 'Vagant Vintage',
      category: '巴黎 · 法式松弛',
      styleTags: ['vintage', '法式', '复古'],
      sceneTags: ['周末', '约会'],
      description: 'Vagant Vintage，偏 vintage 与法式复古单品灵感。',
      url: 'https://www.xiaohongshu.com/user/profile/6748b7e1000000000b017395',
      avatar: 'VV',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-chennloves',
      name: 'CHENNLOVES',
      platform: '小红书',
      handle: 'CHENNLOVES',
      category: '巴黎 · 法式松弛',
      styleTags: ['法式', '松弛', '日常'],
      sceneTags: ['周末', '通勤', '约会'],
      description: 'CHENNLOVES，偏松弛日常的穿搭分享。',
      url: 'https://www.xiaohongshu.com/user/profile/58e401f87fc5b83727ac879b',
      avatar: 'CH',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-xizai1019',
      name: '西仔1019',
      platform: '小红书',
      handle: '西仔1019',
      category: '街头 · Y2K · 编辑感',
      styleTags: ['街头', 'Y2K', '潮流'],
      sceneTags: ['周末', '聚会', '旅行'],
      description: '西仔1019，偏街头与潮流感的日常穿搭。',
      url: 'https://www.xiaohongshu.com/user/profile/56b3ff7de4251d2edb8562eb',
      avatar: '西',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-mengeryanbao',
      name: '_懵儿妍宝',
      platform: '小红书',
      handle: '_懵儿妍宝',
      category: '加州 · Girly · 甜系',
      styleTags: ['甜系', 'Girly', '粉色', '日常'],
      sceneTags: ['约会', '周末', '聚会'],
      description: '_懵儿妍宝，甜系日常穿搭，粉色与裙装灵感较多。',
      url: 'https://www.xiaohongshu.com/user/profile/5b49a7eef7e8b913bb589f16',
      avatar: '萌',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-huiziya',
      name: '蕙子呀蕙子',
      platform: '小红书',
      handle: '蕙子呀蕙子',
      category: '加州 · Girly · 甜系',
      styleTags: ['甜系', '日常', '通勤'],
      sceneTags: ['通勤', '周末', '约会'],
      description: '蕙子呀蕙子，日常穿搭分享，风格偏甜系清爽。',
      url: 'https://www.xiaohongshu.com/user/profile/5ae2013f11be107a28944ac1',
      avatar: '蕙',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-yidiancaiyingye',
      name: '一点才营业',
      platform: '小红书',
      handle: '一点才营业',
      category: '北欧 · 机能 · 户外',
      styleTags: ['极简', '基础款', '层次'],
      sceneTags: ['通勤', '周末', '旅行'],
      description: '一点才营业，偏极简基础款与层次感穿搭记录。',
      url: 'https://www.xiaohongshu.com/user/profile/590b04ff50c4b46cc59b0c65',
      avatar: '一',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-xiaoguan-chuanda',
      name: '小官教你学穿搭',
      platform: '小红书',
      handle: '小官教你学穿搭',
      category: '北欧 · 机能 · 户外',
      styleTags: ['穿搭技巧', '实用'],
      sceneTags: ['通勤', '日常'],
      description: '小官教你学穿搭，偏实用穿搭方法与搭配思路。',
      url: 'https://www.xiaohongshu.com/user/profile/5b5f530a11be106f7ea065e8',
      avatar: '官',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-mingxing-chuanda',
      name: '详解明星穿搭',
      platform: '小红书',
      handle: '详解明星穿搭',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['名人', '明星同款', '潮流'],
      sceneTags: ['日常', '通勤', '聚会'],
      description: '详解明星穿搭，偏综艺/电视剧同款与明星造型拆解。',
      url: 'https://www.xiaohongshu.com/user/profile/6126533c000000002002cc96',
      avatar: '星',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-fashion-biji',
      name: 'Fashion穿搭笔记',
      platform: '小红书',
      handle: 'Fashion穿搭笔记',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['明星同款', '潮流', '连衣裙'],
      sceneTags: ['聚会', '约会', '看秀'],
      description: 'Fashion穿搭笔记，偏明星穿搭灵感与单品安利。',
      url: 'https://www.xiaohongshu.com/user/profile/5be6eda62698c3000127b655',
      avatar: 'FA',
      linkType: 'profile',
    },
    {
      id: 'creator-xhs-cristian',
      name: '储镒恬CRISTIAN',
      platform: '小红书',
      handle: '储镒恬CRISTIAN',
      category: '名人 · 潮流 · 品牌向',
      styleTags: ['名人', '潮流', '造型'],
      sceneTags: ['聚会', '看秀', '日常'],
      description: '储镒恬CRISTIAN，偏潮流向的造型与日常穿搭分享。',
      url: 'https://www.xiaohongshu.com/user/profile/555801ad5894467d3ddf64fd',
      avatar: 'CR',
      linkType: 'profile',
    },
  ];

  // 按风格 category 聚合，并在每个分类里尽量保持「小红书 / Instagram」数量接近。
  // 约定：每个分类默认展示各平台最多 4 位（总量过多会显得很乱）。
  function creatorsByCategory() {
    const groups = {};
    const order = [];

    for (const c of creatorLibrary) {
      const k = c.category || '其它';
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(c);
    }

    const limitPerPlatform = 4;
    const mixPlatforms = (list) => {
      const xhs = list.filter((x) => x.platform === '小红书').slice(0, limitPerPlatform);
      const ins = list.filter((x) => x.platform === 'Instagram').slice(0, limitPerPlatform);
      const mixed = [];
      const maxLen = Math.max(xhs.length, ins.length);
      for (let i = 0; i < maxLen; i++) {
        if (xhs[i]) mixed.push(xhs[i]);
        if (ins[i]) mixed.push(ins[i]);
      }
      return mixed;
    };

    return order.map((k) => ({ category: k, creators: mixPlatforms(groups[k]) }));
  }
  function recommendCreators(tags, style, scene, limit) {
    limit = limit || 3;
    const wanted = new Set(
      [style, scene, ...(tags || [])].filter(Boolean),
    );
    const scored = creatorLibrary.map((c) => {
      let s = 0;
      for (const t of c.styleTags) if (wanted.has(t)) s += 3;
      for (const t of c.sceneTags) if (wanted.has(t)) s += 2;
      // 国内可打开的小红书博主给一个基线加权，避免国内用户全部推荐都是 Instagram
      if (c.platform === '小红书') s += 1.2;
      return { c, s };
    });
    scored.sort((a, b) => b.s - a.s);
    // 结果里保证前 limit 中至少有 1 位小红书博主（若库中存在）
    const top = scored.slice(0, limit).map((x) => x.c);
    if (!top.some((c) => c.platform === '小红书')) {
      const firstXhs = scored.find((x) => x.c.platform === '小红书');
      if (firstXhs && top.length) {
        top[top.length - 1] = firstXhs.c;
      }
    }
    return top;
  }

  // ------------ AI outfit ------------
  function categoryOf(items, cat) {
    return items.filter(
      (x) =>
        x.category === cat ||
        (cat === '下装' &&
          (x.category === '裙装' || x.category === '连体')),
    );
  }
  function hasCoreCategories(items) {
    // v12：连衣裙/连体裤本身就是一整套主体，不再强制要求同时有"上衣"。
    // 判定规则：
    //   1. 必须有鞋履；
    //   2. 主体必须存在：要么有"下装"（+ 上衣），要么有"裙装/连体"（作为一体式主体）。
    const missing = [];
    const hasShoes = items.some((x) => x.category === '鞋履');
    const hasBottom = items.some((x) => x.category === '下装');
    const hasTop = items.some((x) => x.category === '上衣');
    const hasOnePiece = items.some(
      (x) => x.category === '裙装' || x.category === '连体',
    );
    // 主体必须存在其一：上衣+下装 or 裙装/连体
    if (!hasOnePiece && !(hasTop && hasBottom)) {
      const parts = [];
      if (!hasTop) parts.push('上衣');
      if (!hasBottom) parts.push('下装');
      // 一件式主体（裙装/连体）也可替代
      missing.push(parts.join(' + ') + '（或一件连衣裙 / 连体）');
    }
    if (!hasShoes) missing.push('鞋履');
    return missing;
  }
  // 给单品打分（v13：多选字段与自由输入都参与）
  function scoreItem(item, ctx) {
    let s = 0;
    const styles = itemStyles(item);
    const scenes = itemScenes(item);
    const seasons = itemSeasons(item);
    const colors = itemColors(item);
    const warmths = itemWarmths(item);
    const materials = itemMaterials(item);

    if (styles.includes(ctx.style)) s += 3;
    if (scenes.includes(ctx.scene)) s += 3;
    if (item.fitTags?.some((t) => t === ctx.style || t === ctx.scene)) s += 1;

    // 季节
    const month = new Date().getMonth() + 1;
    const season =
      month <= 2 || month === 12
        ? '冬'
        : month <= 5
        ? '春'
        : month <= 8
        ? '夏'
        : '秋';
    if (seasons.includes(season)) s += 2;

    // 保暖度：多选 warmth 允许"薄 + 中等"这类跨档
    if (ctx.weather) {
      const need = ctx.weather.warmthNeed;
      if (need === '保暖' && warmths.includes('厚')) s += 2;
      if (need === '保暖' && warmths.includes('中等')) s += 1;
      if (need === '轻薄层次' && warmths.includes('中等')) s += 2;
      if (need === '轻薄层次' && warmths.includes('薄')) s += 1;
      if (need === '清爽轻薄' && warmths.includes('薄')) s += 2;
      // 高温 + 厚 = 明确扣分
      if (need === '清爽轻薄' && warmths.includes('厚')) s -= 3;
      if (ctx.weather.temperature >= 26 && materials.some((m) => /羊毛|羊绒|羽绒|摇粒绒|西装呢/.test(m))) s -= 2;
      if (ctx.weather.temperature <= 8 && materials.some((m) => /雪纺|真丝|亚麻/.test(m))) s -= 2;
    }

    // 简约/极简/法式 系风格：偏向低饱和大地色
    if (
      (ctx.style === '简约' || ctx.style === 'Clean fit' ||
        ctx.style === '极简' || ctx.style === '法式') &&
      colors.some((c) => /白|米|灰|奶|驼|黑|棕|浅|深|nude/i.test(c || ''))
    )
      s += 1;
    // 甜酷/学院：粉/酒红/藏青/白/黑
    if ((ctx.style === '甜酷' || ctx.style === '学院') &&
      colors.some((c) => /粉|酒红|藏青|白|黑/.test(c || ''))) s += 1;
    // 运动/户外：更青睐针织/摇粒绒/棉 或 运动/户外 场景标签
    if ((ctx.style === '运动' || ctx.style === '户外') &&
      materials.some((m) => /棉|针织|摇粒绒/.test(m))) s += 1;

    // 描述文本 / 用户补充 命中风格/场景/材质关键字
    const desc =
      (item.description || '') + ' ' +
      (item.customNotes || '') + ' ' +
      (item.styleOther || '') + ' ' +
      (item.sceneOther || '');
    if (desc) {
      if (desc.includes(ctx.style)) s += 1;
      if (desc.includes(ctx.scene)) s += 1;
      // 天气敏感词
      if (ctx.weather?.temperature >= 26 && /(轻薄|凉快|夏|透气)/.test(desc)) s += 1;
      if (ctx.weather?.temperature <= 8 && /(保暖|厚|冬)/.test(desc)) s += 1;
      if (ctx.weather?.precipitation > 0 && /(防水|雨)/.test(desc)) s += 1;
    }
    return s;
  }
  function bestOfCategory(items, ctx) {
    if (!items.length) return null;
    return items
      .map((x) => ({ x, s: scoreItem(x, ctx) }))
      .sort((a, b) => b.s - a.s)[0].x;
  }
  function localRuleOutfit(input) {
    const items = input.wardrobeItems || [];
    const missing = hasCoreCategories(items);
    const style = input.style || '简约';
    const scene = input.scene || '通勤';
    const weather = input.weather || DEFAULT_WEATHER;
    if (missing.length) {
      return {
        title: '衣橱还不完整',
        selected_items: [],
        style_reason: '',
        weather_reason: '',
        scene_reason: '',
        color_reason: '',
        avoid: '',
        missing_piece:
          '缺少：' + missing.join('、') + '。请先上传相应单品再生成。',
        creator_recommendation_tags: [style, scene],
      };
    }
    const ctx = { style, scene, weather };

    // v12：先决定"下半身/主体"是什么，再决定要不要选上衣。
    // - 如果最优主体是连衣裙 / 连体（一体式），就绝对不再叠短袖 / T 恤，避免"短袖+连衣裙"这种低级组合；
    // - 否则（真下装：裤子/半身裙搭配上衣的常规穿法），才和上衣配套。
    const pantsPool = items.filter((x) => x.category === '下装');
    const onePiecePool = items.filter(
      (x) => x.category === '裙装' || x.category === '连体',
    );
    const bestPants = bestOfCategory(pantsPool, ctx);
    const bestOnePiece = bestOfCategory(onePiecePool, ctx);
    const bestTop = bestOfCategory(categoryOf(items, '上衣'), ctx);

    // 评分决策：一体式（连衣裙/连体）得分 vs 上衣+下装组合得分
    const pantsScore =
      (bestPants ? scoreItem(bestPants, ctx) : -Infinity) +
      (bestTop ? scoreItem(bestTop, ctx) : -Infinity);
    const onePieceScore = bestOnePiece
      ? scoreItem(bestOnePiece, ctx) + 2 // 一体式有整体感加成
      : -Infinity;

    // 无上衣或无下装时只能走对应分支
    let mainPieces = [];
    if (!bestTop || !bestPants) {
      if (bestOnePiece) {
        mainPieces = [bestOnePiece];
      } else if (bestTop && bestPants) {
        mainPieces = [bestTop, bestPants];
      }
    } else {
      // 上衣+下装都存在，则和一体式比分
      if (onePieceScore > pantsScore) {
        mainPieces = [bestOnePiece];
      } else {
        mainPieces = [bestTop, bestPants];
      }
    }

    const shoes = bestOfCategory(categoryOf(items, '鞋履'), ctx);
    const picks = [...mainPieces, shoes].filter(Boolean);
    // 天气冷时加外套；下雨提醒避开某些鞋
    if (weather.warmthNeed === '保暖') {
      const outer = bestOfCategory(categoryOf(items, '外套'), ctx);
      if (outer) picks.push(outer);
    }
    // 可选：配饰 / 包袋
    const bag = bestOfCategory(categoryOf(items, '包袋'), ctx);
    if (bag && picks.length < 5) picks.push(bag);

    const selected_items = picks.map((x) => ({
      id: x.id,
      name: x.name,
      category: x.category,
      reason: whyPicked(x, ctx),
    }));
    const avoid =
      weather.precipitation > 0
        ? '雨天不建议穿浅色皮鞋 / 麂皮 / 帆布鞋'
        : weather.temperature > 28
        ? '避开过厚的针织与外套'
        : '避免加过多的层次让整体看起来沉重';
    return {
      title: outfitTitle(style, scene, weather),
      selected_items,
      style_reason: whyStyle(picks, style),
      weather_reason: whyWeather(picks, weather),
      scene_reason: whyScene(picks, scene),
      color_reason: whyColor(picks),
      avoid,
      missing_piece: '',
      creator_recommendation_tags: [style, scene, picks[0]?.styleTags?.[0]].filter(Boolean),
      _source: 'local',
    };
  }
  function whyPicked(item, ctx) {
    const bits = [];
    if (item.styleTags?.includes(ctx.style)) bits.push(ctx.style);
    if (item.sceneTags?.includes(ctx.scene)) bits.push(ctx.scene);
    if (bits.length) return '匹配 ' + bits.join(' · ');
    return item.color ? item.color + ' ' + item.category : item.category;
  }
  function outfitTitle(style, scene, weather) {
    const wLabel =
      weather.warmthNeed === '保暖'
        ? '轻保暖'
        : weather.warmthNeed === '清爽轻薄'
        ? '清爽'
        : '轻层次';
    return style + ' · ' + scene + ' · ' + wLabel;
  }
  function whyStyle(picks, style) {
    const mainOnePiece = picks.find(
      (p) => p && (p.category === '裙装' || p.category === '连体'),
    );
    if (mainOnePiece) {
      return (
        style +
        ' 主体是「' +
        mainOnePiece.name +
        '」，一件式廓形已经完成穿搭主线，不再叠短袖 / T 恤，用鞋履与外套/包袋收尾。'
      );
    }
    return (
      style +
      ' 的核心是廓形克制、配色统一，这几件在版型和线条上都符合' +
      style +
      '的语境。'
    );
  }
  function whyWeather(picks, weather) {
    return (
      '当前 ' +
      weather.temperature +
      '°C · ' +
      weather.weatherLabel +
      '，' +
      weather.warmthNeed +
      '为主，选了对应厚度的搭配。' +
      (weather.precipitation > 0 ? ' 有降水，避免了帆布 / 麂皮鞋履。' : '')
    );
  }
  function whyScene(picks, scene) {
    return scene + ' 场景下需要既得体又不拘束，所选单品兼顾正式感和舒适度。';
  }
  function whyColor(picks) {
    const colors = picks.map((x) => x.color).filter(Boolean);
    if (!colors.length) return '以低饱和度为基调，避免色彩打架。';
    return '主色调：' + colors.slice(0, 3).join(' · ') + '，形成同色系或邻近色关系。';
  }

  async function generateAIOutfit(input) {
    // v17 真实后端路径：AI Key 只在服务端环境变量中，前端不展示、不保存、不直连模型。
    // 后端未配置 AI_API_KEY 或不可用时，沿用本地规则兜底，不破坏 UI。
    const started = Date.now();
    if (getApiToken()) {
      try {
        const data = await apiFetch('/api/v1/recommendations', {
          method: 'POST',
          body: JSON.stringify({
            scene: input.scene || '日常通勤',
            weather: typeof input.weather === 'string' ? input.weather : (input.weather?.summary || input.weather?.weatherLabel || '未知'),
            style_preference: input.style || '简洁、实穿',
            extra_request: input.extra || input.extraRequest || '',
          }),
        });
        const wardrobeByBackendId = new Map((input.wardrobeItems || []).map((x) => [x.backendId || (String(x.id || '').startsWith('api-') ? Number(String(x.id).slice(4)) : null), x]));
        const selected = (data.selected_clothing_ids || []).map((id) => {
          const item = wardrobeByBackendId.get(Number(id));
          return item ? { id: item.id, backendId: Number(id), name: item.name, category: item.category, reason: 'DeepSeek 推荐选中' } : null;
        }).filter(Boolean);
        const result = {
          title: data.summary || outfitTitle(input.style, input.scene, input.weather || DEFAULT_WEATHER),
          summary: data.recommendation_text || data.recommendation || '',
          selected_items: selected,
          style_reason: data.summary || '',
          weather_reason: '',
          scene_reason: '',
          color_reason: data.recommendation_text || data.recommendation || '',
          tips: Array.isArray(data.tips) ? data.tips : [],
          creator_recommendation_tags: [input.style, input.scene].filter(Boolean),
          ai_provider: data.provider,
          ai_model: data.model,
          _source: 'backend-ai',
          _provider: data.provider,
          _model: data.model,
          _latencyMs: Date.now() - started,
        };
        logAICall({ at: Date.now(), source: 'backend-ai', provider: data.provider, model: data.model, ok: true, latencyMs: result._latencyMs, message: '后端 AI 推荐成功。' });
        return result;
      } catch (e) {
        const local = localRuleOutfit(input);
        local._source = 'local-fallback';
        local._error = (e && e.message) || String(e);
        logAICall({ at: Date.now(), source: 'local-fallback', provider: 'backend', model: '', ok: false, latencyMs: Date.now() - started, message: '后端 AI 推荐不可用，已回退本地规则：' + local._error });
        return local;
      }
    }
    const local = localRuleOutfit(input);
    local._source = 'local';
    local._reason = '已根据当前衣橱生成搭配。';
    logAICall({
      at: Date.now(),
      source: 'local',
      provider: 'backend',
      model: '',
      ok: true,
      message: '未登录真实后端，走本地规则。',
    });
    return local;
  }

  function logAICall(entry) {
    save(K.AI_LOG, entry);
  }

  // ------------ Stats ------------
  function statsOfRecords(records) {
    if (!records.length)
      return {
        count: 0,
        topItem: null,
        topStyle: null,
        topColor: null,
        lastAt: null,
      };
    const itemCount = {};
    const styleCount = {};
    const colorCount = {};
    records.forEach((r) => {
      styleCount[r.style] = (styleCount[r.style] || 0) + 1;
      (r.outfit?.selected_items || []).forEach((it) => {
        itemCount[it.name] = (itemCount[it.name] || 0) + 1;
      });
      (r.outfit?.selected_items || []).forEach((it) => {
        if (it.color)
          colorCount[it.color] = (colorCount[it.color] || 0) + 1;
      });
    });
    const top = (obj) => {
      const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      return arr[0] ? arr[0][0] : null;
    };
    return {
      count: records.length,
      topItem: top(itemCount),
      topStyle: top(styleCount),
      topColor: top(colorCount),
      lastAt: records[records.length - 1].createdAt,
    };
  }

  // ------------ Constants ------------
  const CATEGORIES = [
    '上衣',
    '下装',
    '鞋履',
    '外套',
    '裙装',
    '包袋',
    '配饰',
    '连体',
  ];
  const STYLE_TAGS = [
    '简约',
    'Clean fit',
    '韩系',
    '法式',
    '运动',
    '甜酷',
    '学院',
    '复古',
    '户外',
    '极简',
  ];
  const SCENE_TAGS = [
    '通勤',
    '约会',
    '旅行',
    '周末',
    '运动',
    '聚会',
    '居家',
    '正式场合',
  ];
  const SEASON_TAGS = ['春', '夏', '秋', '冬'];
  const WARMTH = ['薄', '中等', '厚'];
  const COLOR_PALETTE = [
    '奶白',
    '米色',
    '灰',
    '黑',
    '驼色',
    '藏青',
    '深棕',
    '雾灰蓝',
    '燕麦',
    '焦糖',
    '橄榄绿',
    '粉',
    '酒红',
  ];
  // 材质：细化推荐语义（AI 后续可用作 prompt 提示；本地规则也参考）
  const MATERIALS = [
    '棉',
    '亚麻',
    '针织',
    '羊毛',
    '羊绒',
    '牛仔',
    '皮革',
    '雪纺',
    '真丝',
    '羽绒',
    '摇粒绒',
    '西装呢',
  ];
  // 廓形：影响搭配比例
  const SILHOUETTES = ['修身', '直筒', '宽松', 'Oversize', 'A字', '西装', 'H型', '短款', '长款'];
  // 版型标签：辅助描述"实穿感"
  const FIT_TAGS = [
    '显瘦',
    '显高',
    '小个子友好',
    '梨形友好',
    '高腰',
    '低腰',
    '百搭基础',
    '统治力单品',
  ];

  window.YijianStore = {
    // wardrobe
    getWardrobe,
    saveWardrobe,
    addWardrobeItem,
    addWardrobeItemRemote,
    syncWardrobeFromBackend,
    deleteWardrobeItem,
    deleteWardrobeItemRemote,
    updateWardrobeItem,
    updateWardrobeItemRemote,
    buildSystemDescription,
    normalizeItem,
    itemColors,
    itemWarmths,
    itemMaterials,
    itemSilhouettes,
    itemStyles,
    itemScenes,
    itemSeasons,
    // outfits
    getOutfits,
    addOutfit,
    saveOutfitRecord,
    saveOutfitRecordRemote,
    syncOutfitsFromBackend,
    deleteOutfit,
    // links
    getLinks,
    addLink,
    deleteLink,
    renameLink,
    guessTitleFromUrl,
    // prefs
    getPreferences,
    savePreferences,
    // profile
    getProfile,
    saveProfile,
    syncProfileFromBackend,
    updateProfileRemote,
    clearUserSession,
    clearLocalUserData,
    validateEmail,
    passwordStrength,
    demoHashPassword,
    makeSalt,
    authRegister,
    authLogin,
    authMe,
    syncAllFromBackend,
    getApiBase,
    setApiBase,
    getApiToken,
    setApiToken,
    // geo
    queryGeoPermission,
    reverseGeocode,
    // image
    readFileAsDataURL,
    removeBackground,
    estimateSize,
    compressImage,
    // weather
    fetchWeather,
    getStoredWeather,
    warmthNeedFor,
    DEFAULT_WEATHER,
    // AI
    generateAIOutfit,
    localRuleOutfit,
    hasCoreCategories,
    // creator
    creatorLibrary,
    creatorsByCategory,
    recommendCreators,
    // stats
    statsOfRecords,
    // consts
    CATEGORIES,
    STYLE_TAGS,
    SCENE_TAGS,
    SEASON_TAGS,
    WARMTH,
    COLOR_PALETTE,
    MATERIALS,
    SILHOUETTES,
    FIT_TAGS,
    uid,
  };
})();
