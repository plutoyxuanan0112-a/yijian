/* ============================================================
 * 衣见 · 聚焦式气泡新手引导（coach marks）v4
 * 纯原生 JS，零依赖，不侵入现有 React 应用。
 *
 * v4 核心修复（一次性）：
 *  1. 下拉展开后，高亮同时覆盖「触发器 + 选项面板」（并集镂空），
 *     选项面板明亮可点；气泡自动避让面板，绝不遮挡选项。
 *  2. 替换 / 删除 / 添加：弹出底部 sheet 后，整张 sheet 明亮可操作，
 *     气泡移到 sheet 上方，不遮挡 sheet 内容。
 *  3. 高亮 = 可操作，暗化 = 非操作区：每一步需要点/选的元素都落在
 *     明亮镂空高亮区内（触发器、面板、单品卡、按钮、整张 sheet）。
 *  4. 流程严格且不误判：
 *     - 点击替换/添加按钮 → 等 sheet 真正弹出再高亮该 sheet；
 *     - sheet 关闭（× 或挑选完成）都算「本步结束」，继续下一步；
 *     - 「恭喜」只在真实保存成功（yijian:outfit-saved 事件）后出现；
 *     - 顺序：替换 → 删除 → 添加 → 保存 → 保存成功祝贺 → 衣橱 → 上传。
 *  5. 气泡与「跳过引导」都限制在手机框内，二者自动避让、互不重叠。
 *  6. 玻璃半透明 + 宋体小气泡；只保留一个全局「跳过引导」入口。
 *  7. 实时跟随：rAF 循环 + scroll(capture) + resize + ResizeObserver；
 *     任何一步都不卡死，等待类步骤均有超时兜底与手动兜底。
 *
 * 进入引导即通过 window.YijianDemo.seed() 注入示例衣物，使生成真实走通。
 * ============================================================ */
(function () {
  'use strict';

  // 首次触发记忆：主引导 / 灵感引导 分别用独立 localStorage key
  var MAIN_KEY = 'yijian_guide_main_done';
  var INSP_KEY = 'yijian_guide_inspiration_done';
  var AUTO_KEY = 'yijian_guide_auto_opened';
  var LEGACY_KEY = 'yijian_onboarding_done'; // 兼容旧版本主引导标记
  var PAD = 6; // 高亮相对目标的内边距

  function guideDone(mode) {
    try {
      if (mode === 'inspiration') return localStorage.getItem(INSP_KEY) === '1';
      return localStorage.getItem(MAIN_KEY) === '1' || localStorage.getItem(LEGACY_KEY) === '1';
    } catch (e) { return false; }
  }
  function markGuideDone(mode) {
    try {
      if (mode === 'inspiration') localStorage.setItem(INSP_KEY, '1');
      else { localStorage.setItem(MAIN_KEY, '1'); localStorage.setItem(LEGACY_KEY, '1'); }
    } catch (e) {}
  }
  function clearGuideDone(mode) {
    try {
      if (mode === 'inspiration') localStorage.removeItem(INSP_KEY);
      else { localStorage.removeItem(MAIN_KEY); localStorage.removeItem(LEGACY_KEY); }
    } catch (e) {}
  }
  function shouldAutoOpen() {
    try {
      if (sessionStorage.getItem(AUTO_KEY) === '1') return false;
      sessionStorage.setItem(AUTO_KEY, '1');
      return true;
    } catch (e) {
      return !guideDone('main');
    }
  }
  function resetAutoOpen() {
    try { sessionStorage.removeItem(AUTO_KEY); } catch (e) {}
  }

  /* ---------------- 基础工具 ---------------- */
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return false;
    return true;
  }

  function findByText(sel, text) {
    var list = qa(sel);
    for (var i = 0; i < list.length; i++) {
      if (isVisible(list[i]) && (list[i].textContent || '').indexOf(text) >= 0) return list[i];
    }
    return null;
  }

  function cssRadius(el, fallback) {
    try {
      var v = parseFloat(window.getComputedStyle(el).borderTopLeftRadius);
      if (!isNaN(v) && v >= 0) return v;
    } catch (e) {}
    return fallback == null ? 12 : fallback;
  }

  function isLoggedIn() {
    try {
      if (window.YijianDemo && typeof window.YijianDemo.isLoggedIn === 'function') {
        return !!window.YijianDemo.isLoggedIn();
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem('yijian_user_profile');
      if (raw) { var p = JSON.parse(raw); if (p && p.authStatus === 'demo_logged_in') return true; }
    } catch (e) {}
    try { if (localStorage.getItem('yijian_api_token')) return true; } catch (e) {}
    return false;
  }

  /* 天气/定位状态：从真实 .weather-link 的文案判断
   *  ok       = 已获取真实天气（strong 里出现「°C」）
   *  locating = 正在定位中
   *  failed   = 已尝试但被拒 / 失败 / 不支持
   *  idle     = 还没点过 */
  function weatherState() {
    var el = q('.weather-link');
    if (!el) return 'none';
    var strongEl = el.querySelector('strong');
    var emEl = el.querySelector('em');
    var strong = strongEl ? (strongEl.textContent || '') : '';
    var em = emEl ? (emEl.textContent || '') : '';
    if (/°C/.test(strong)) return 'ok';
    if (/定位中/.test(strong) || /定位中/.test(em)) return 'locating';
    if (/定位被拒|不支持定位|定位不可用|定位失败/.test(strong) || /再试|重试/.test(em)) return 'failed';
    return 'idle';
  }
  // 定位步「下一步」可用条件：已获取天气 或 已尝试但失败/拒绝
  function weatherReady() { var s = weatherState(); return s === 'ok' || s === 'failed'; }
  function setDemoWeatherCopy(active) {
    var link = q('.weather-link');
    if (!link) return;
    var em = link.querySelector('em');
    var meta = link.querySelector('.meta');
    if (active) {
      if (em) em.textContent = '授权定位 ›';
      if (meta && weatherState() === 'idle') meta.textContent = '引导采用模拟天气';
    } else if (em && weatherState() === 'idle') {
      em.textContent = '授权定位 ›';
      if (meta) meta.textContent = '点击授权定位';
    }
  }

  function seedDemoWardrobe() {
    try {
      if (!isLoggedIn() && window.YijianDemo && typeof window.YijianDemo.seed === 'function') {
        window.YijianDemo.seed();
      }
    } catch (e) {}
  }
  function goHome() { try { window.YijianDemo && window.YijianDemo.goHome && window.YijianDemo.goHome(); } catch (e) {} }
  function goWardrobe() { try { window.YijianDemo && window.YijianDemo.goWardrobe && window.YijianDemo.goWardrobe(); } catch (e) {} }

  /* 手机外框范围（暗化、气泡、跳过都限制在此矩形内） */
  function getFrameRect() {
    var phone = q('.phone');
    var vw = window.innerWidth, vh = window.innerHeight;
    if (phone) {
      var r = phone.getBoundingClientRect();
      return {
        left: Math.max(0, r.left), top: Math.max(0, r.top),
        right: Math.min(vw, r.right), bottom: Math.min(vh, r.bottom),
        radius: cssRadius(phone, 0),
      };
    }
    return { left: 0, top: 0, right: vw, bottom: vh, radius: 0 };
  }

  /* 圆角矩形 path（顺时针） */
  function roundRectPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    return 'M' + (x + r) + ' ' + y +
      'H' + (x + w - r) +
      'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) +
      'V' + (y + h - r) +
      'A' + r + ' ' + r + ' 0 0 1 ' + (x + w - r) + ' ' + (y + h) +
      'H' + (x + r) +
      'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) +
      'V' + (y + r) +
      'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  }

  function rectsOverlap(a, b, m) {
    m = m || 0;
    return !(a.right + m <= b.left || a.left - m >= b.right ||
             a.bottom + m <= b.top || a.top - m >= b.bottom);
  }

  /* ---------------- 目标选择器 ---------------- */
  var SEL = {
    replaceBtn: 'button[title="换这件"]',
    deleteBtn: 'button[title="删掉这件"]',
    addBtn: '.slot.slot-add',
    itemCard: '.item-card',
  };

  function sheetByTitle(text) {
    var sheets = qa('.sheet');
    for (var i = 0; i < sheets.length; i++) {
      var h = sheets[i].querySelector('.sheet-title h3');
      if (h && isVisible(sheets[i]) && (h.textContent || '').indexOf(text) >= 0) return sheets[i];
    }
    return null;
  }

  var T = {
    styleWrap: function () { return q('.select-row > .select-wrap:nth-child(1)'); },
    sceneWrap: function () { return q('.select-row > .select-wrap:nth-child(2)'); },
    styleTrigger: function () { return q('.select-row > .select-wrap:nth-child(1) .select-trigger'); },
    sceneTrigger: function () { return q('.select-row > .select-wrap:nth-child(2) .select-trigger'); },
    stylePanel: function () { return q('.select-row > .select-wrap:nth-child(1) .select-panel'); },
    scenePanel: function () { return q('.select-row > .select-wrap:nth-child(2) .select-panel'); },
    styleOption: function () {
      var p = T.stylePanel();
      if (!p) return null;
      return findByText('[role="option"]', '简约', p);
    },
    sceneOption: function () {
      var p = T.scenePanel();
      if (!p) return null;
      return findByText('[role="option"]', '通勤', p);
    },
    weather: function () { return q('.weather-link'); },
    weatherCta: function () { var w = q('.weather-link'); return w ? (w.querySelector('em') || w) : null; },
    generate: function () { return q('.hero button.primary'); },
    detail: function () { return q('.sheet.sheet-detail'); },
    flatlay: function () { return q('.sheet.sheet-detail .flatlay') || q('.sheet.sheet-detail .look-art'); },
    replaceBtn: function () { return q('.sheet.sheet-detail ' + SEL.replaceBtn); },
    deleteBtn: function () { return q('.sheet.sheet-detail ' + SEL.deleteBtn); },
    addBtn: function () { return q('.sheet.sheet-detail ' + SEL.addBtn); },
    saveBtn: function () {
      var b = q('.sheet.sheet-detail .outfit-action button.primary');
      return b || findByText('.sheet.sheet-detail button.primary', '保存');
    },
    // 底部操作栏（「🔄 换一套」+「保存」那一行）——保存步只让这一栏明亮可点
    saveBar: function () {
      return q('.sheet.sheet-detail .outfit-action') || T.detail();
    },
    replaceSheet: function () { return sheetByTitle('替换'); },
    addSheet: function () { return sheetByTitle('添加单品'); },
    // 挑选列表里第一个可选单品（替换 / 添加 sheet 弹出后，指针+高亮落在它上面）
    replacePickItem: function () {
      var s = sheetByTitle('替换');
      if (!s) return null;
      var cards = qa(SEL.itemCard, s);
      for (var i = 0; i < cards.length; i++) {
        if (/黑色短袖/.test(cards[i].textContent || '')) return cards[i];
      }
      return cards[0] || null;
    },
    addPickItem: function () {
      var s = sheetByTitle('添加单品');
      if (!s) return null;
      var cards = qa(SEL.itemCard, s);
      for (var i = 0; i < cards.length; i++) {
        if (/托特包|包袋|大容量/.test(cards[i].textContent || '')) return cards[i];
      }
      return cards[0] || null;
    },
    // 选衣列表区域（明亮可点区）——只亮列表/选项内容，不含标题栏与关闭 ×
    replaceList: function () { var s = sheetByTitle('替换'); return s ? (s.querySelector('.sheet-body') || s.querySelector('.wardrobe-grid') || s) : null; },
    addList: function () { var s = sheetByTitle('添加单品'); return s ? (s.querySelector('.sheet-body') || s.querySelector('.wardrobe-grid') || s) : null; },
    wardrobeUpload: function () {
      // 结果卡 / 任何底部 sheet 还开着时，先不返回目标——
      // 必须等结果卡关闭、切到衣橱页后，才高亮真实「上传」按钮，
      // 避免把高亮误贴到结果卡右上角的关闭 ×。
      var sh = qa('.sheet');
      for (var s = 0; s < sh.length; s++) { if (isVisible(sh[s])) return null; }
      var heads = qa('.page .section-head');
      for (var i = 0; i < heads.length; i++) {
        var b = heads[i].querySelector('button.primary');
        if (b && isVisible(b) && (b.textContent || '').indexOf('上传') >= 0) return b;
      }
      return findByText('.page button.primary', '上传');
    },
    profileBtn: function () { return q('.profile-top-btn') || q('button[aria-label="个人中心"]'); },
    styleChosen: function () {
      var t = T.styleTrigger();
      return !!(t && /简约/.test(t.textContent || ''));
    },
    sceneChosen: function () {
      var t = T.sceneTrigger();
      return !!(t && /通勤/.test(t.textContent || ''));
    },
    // ===== 灵感页目标 =====
    inspNav: function () { return findByText('.bottom .nav', '灵感'); },
    inspSaveBtn: function () {
      // 灵感页顶部「保存」外部链接按钮（.hero 内的主按钮）
      var b = q('.page .hero button.primary');
      return (b && /保存/.test(b.textContent || '')) ? b : null;
    },
    inspCreatorBtn: function () { return q('.page .creator-card .save-pill'); },
    inspCreatorCard: function () { return q('.page .creator-card'); },
    inspCreatorsAll: function () { return findByText('.page .section-head .link', '博主'); },
  };

  /* 灵感页是否正处于前台（标题「灵感与收藏」+ 顶部保存按钮） */
  function isInspirePage() {
    var h = findByText('.page .h1-hero', '灵感与收藏');
    return !!(h && isVisible(h));
  }

  /* ============================================================
   * 萌宠 Eira —— 官方原型 exact 抠图 PNG（Lilac Cat IP）
   * 使用官方标准资产整图，不做部件拆分/矢量重绘，避免栅格切片裂缝与形象走样。
   * 动效走官方整体规格：idle 呼吸 / tap 轻按 / success 上跳，
   * 由 data-state 驱动，transform-origin 落在身体重心（50% 68%）。
   * ============================================================ */
  var EIRA_IMG_SRC = 'eira.png?v=30';

  function buildEira(kind) {
    var w = document.createElement('div');
    /* talk（跟随高亮气泡）/ perch（弹窗上沿）仅用于定位与尺寸，动作统一为官方整体动效 */
    var state = kind === 'perch' ? ' ob-eira--perch' : (kind === 'float' ? ' ob-eira--talk' : '');
    w.className = 'ob-eira' + (kind ? ' ob-eira-' + kind : '') + state;
    w.setAttribute('aria-hidden', 'true');
    w.setAttribute('data-state', 'idle');
    var img = document.createElement('img');
    img.className = 'ob-eira-img';
    img.src = EIRA_IMG_SRC;
    img.alt = 'Eira';
    img.setAttribute('draggable', 'false');
    w.appendChild(img);
    return w;
  }

  /* 触发一次性的官方整体动效（tap / success / error），播放完自动回到 idle */
  function eiraPulse(el, state, dur) {
    if (!el) return;
    el.setAttribute('data-state', state);
    window.setTimeout(function () {
      /* 若期间未被切到其他持续态（如 loading），则回落 idle */
      if (el.getAttribute('data-state') === state) el.setAttribute('data-state', 'idle');
    }, dur || 700);
  }

  /* 当前「可见的」Eira：引导中优先取跟随/弹窗上的 Eira，否则取常驻 Eira */
  function activeEira() {
    if (E.active) {
      if (E.modal) { var me = E.modal.querySelector('.ob-eira'); if (me) return me; }
      if (E.floatEira && !E.floatEira.classList.contains('ob-hidden')) return E.floatEira;
    }
    if (P.eira && !P.eira.classList.contains('ob-hidden')) return P.eira;
    return null;
  }
  function pulseActive(state, dur) { eiraPulse(activeEira(), state, dur); }

  /* ============================================================
   * 常驻萌宠 Eira —— 非引导时停在左下角，可拖动、点击弹菜单
   * 直接挂在 body（独立于引导遮罩层），避开底部导航栏。
   * ============================================================ */
  var P = { eira: null, menu: null, dragged: false, wasLoggedIn: false, docClose: null };

  function ensurePersistEira() {
    if (P.eira) return;
    var fe = buildEira('persist');   // .ob-eira.ob-eira-persist（idle 呼吸）
    fe.classList.add('ob-hidden');
    fe.setAttribute('aria-hidden', 'false');
    document.body.appendChild(fe);
    P.eira = fe;
    placePersistDefault();
    makePersistDraggable(fe);
  }
  function placePersistDefault() {
    var fe = P.eira; if (!fe || P.dragged) return;
    var f = getFrameRect();
    var w = fe.offsetWidth || 82, h = fe.offsetHeight || 70;
    var navH = 92; // 底部导航约 82 + 余量，Eira 停在其上方不遮挡
    var x = f.left + 8;
    var y = f.bottom - navH - h;
    fe.style.left = Math.max(f.left + 6, x) + 'px';
    fe.style.top = Math.max(f.top + 6, y) + 'px';
  }
  function showPersistEira() {
    if (E.active) return;                 // 引导进行中不显示常驻 Eira
    ensurePersistEira();
    P.eira.classList.remove('ob-hidden');
    placePersistDefault();
  }
  function hidePersistEira() {
    closePersistMenu();
    if (P.eira) P.eira.classList.add('ob-hidden');
  }
  function makePersistDraggable(fe) {
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    var down = function (e) {
      if (E.active) return;
      dragging = true; moved = false;
      var p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      ox = parseFloat(fe.style.left) || 0; oy = parseFloat(fe.style.top) || 0;
      fe.classList.add('ob-eira-dragging');
      fe.classList.remove('ob-eira-hint');
    };
    var move = function (e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      var dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; P.dragged = true; closePersistMenu(); }
      var f = getFrameRect();
      var w = fe.offsetWidth, h = fe.offsetHeight;
      var nx = Math.max(f.left + 4, Math.min(ox + dx, f.right - w - 4));
      var ny = Math.max(f.top + 4, Math.min(oy + dy, f.bottom - h - 4));
      fe.style.left = nx + 'px'; fe.style.top = ny + 'px';
      if (e.cancelable) e.preventDefault();
    };
    var up = function () {
      if (!dragging) return;
      dragging = false;
      fe.classList.remove('ob-eira-dragging');
      if (!moved) onPersistClick();
    };
    fe.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    fe.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }
  function onPersistClick() {
    if (P.eira) P.eira.classList.remove('ob-eira-hint');
    eiraPulse(P.eira, 'tap', 440);
    if (P.menu) closePersistMenu();
    else openPersistMenu();
  }
  function currentMainTab() {
    var active = q('.bottom .nav.active span');
    var label = active ? (active.textContent || '').trim() : '';
    if (label === '首页') return 'home';
    if (label === '衣橱') return 'wardrobe';
    if (label === '灵感') return 'inspire';
    if (label === '日记') return 'records';
    return 'home';
  }
  function openPersistMenu() {
    closePersistMenu();
    var m = document.createElement('div');
    m.className = 'ob-eira-menu';
    var title = document.createElement('div');
    title.className = 'ob-eira-menu-title';
    var pageTip = '让我陪你逛逛吗？';
    var tab = currentMainTab();
    if (tab === 'wardrobe') {
      pageTip = '让Eira来帮你管理衣橱～';
    } else if (tab === 'inspire') {
      pageTip = '来灵感库找到自己的风格✨';
    } else if (tab === 'records') {
      pageTip = '来日记看看你的搭配记录～';
    }
    title.textContent = pageTip;
    m.appendChild(title);
    var mkItem = function (label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-eira-menu-item';
      b.textContent = label;
      b.addEventListener('click', function (e) { e.stopPropagation(); closePersistMenu(); fn(); });
      m.appendChild(b);
    };
    if (tab === 'home') {
      mkItem('体验新手引导', function () { restartMainGuide(); });
    }
    document.body.appendChild(m);
    P.menu = m;
    placePersistMenu();
    P.docClose = function (e) {
      if (P.menu && !P.menu.contains(e.target) && e.target !== P.eira && !(P.eira && P.eira.contains(e.target))) {
        closePersistMenu();
      }
    };
    setTimeout(function () {
      document.addEventListener('mousedown', P.docClose, true);
      document.addEventListener('touchstart', P.docClose, true);
    }, 0);
  }
  function placePersistMenu() {
    var m = P.menu, fe = P.eira; if (!m || !fe) return;
    var f = getFrameRect();
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var ex = parseFloat(fe.style.left) || 0, ey = parseFloat(fe.style.top) || 0;
    var ew = fe.offsetWidth || 82;
    var x = ex + ew / 2 - mw / 2;
    var y = ey - mh - 8;                       // 默认弹在 Eira 上方
    if (y < f.top + 6) y = ey + (fe.offsetHeight || 70) + 8; // 上方放不下则弹下方
    x = Math.max(f.left + 8, Math.min(x, f.right - mw - 8));
    m.style.left = x + 'px';
    m.style.top = y + 'px';
  }
  function closePersistMenu() {
    if (P.docClose) {
      document.removeEventListener('mousedown', P.docClose, true);
      document.removeEventListener('touchstart', P.docClose, true);
      P.docClose = null;
    }
    if (P.menu) { P.menu.remove(); P.menu = null; }
  }

  /* 登录成功 → 常驻 Eira 雀跃庆祝（轮询 isLoggedIn 由 false→true） */
  function watchLogin() {
    P.wasLoggedIn = isLoggedIn();
    setInterval(function () {
      var now = isLoggedIn();
      if (now && !P.wasLoggedIn) { pulseActive('success', 820); }
      P.wasLoggedIn = now;
    }, 900);
  }

  /* 切到灵感页后启动灵感引导 */
  function goInspireThenGuide() {
    if (E.active) resetEngine();
    closeAllSheets();
    try { if (window.YijianDemo && window.YijianDemo.goInspire) window.YijianDemo.goInspire(); } catch (e) {}
    if (!isInspirePage()) { var nav = T.inspNav(); if (nav) nav.click(); }
    if (E._inspireTimer) clearInterval(E._inspireTimer);
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (isInspirePage() || tries > 24) {
        clearInterval(t);
        E._inspireTimer = 0;
        setTimeout(function () { start('inspiration'); }, 260);
      }
    }, 140);
    E._inspireTimer = t;
  }

  /* ============================================================
   * 页面加载遮罩：Eira loading + 进度条 + 文案「Eira 正在全力加载中…」
   * ============================================================ */
  var LOADER = { el: null, timer: 0 };
  function showLoader() {
    if (LOADER.el) return;
    var el = document.createElement('div');
    el.className = 'ob-loader';
    var pet = buildEira('');            // 纯整图 Eira
    pet.classList.add('ob-loader-eira');
    pet.setAttribute('data-state', 'loading');
    el.appendChild(pet);
    var bar = document.createElement('div'); bar.className = 'ob-loader-bar';
    var fill = document.createElement('div'); fill.className = 'ob-loader-fill';
    bar.appendChild(fill); el.appendChild(bar);
    var txt = document.createElement('div'); txt.className = 'ob-loader-text';
    txt.innerHTML = 'Eira 正在全力加载中<span class="ob-loader-dots"></span>';
    el.appendChild(txt);
    document.body.appendChild(el);
    LOADER.el = el;
    var pct = 0;
    LOADER.timer = setInterval(function () {
      pct = Math.min(94, pct + Math.random() * 15 + 6);
      fill.style.width = pct + '%';
    }, 230);
  }
  function hideLoader() {
    var el = LOADER.el; if (!el) return;
    if (LOADER.timer) { clearInterval(LOADER.timer); LOADER.timer = 0; }
    var fill = el.querySelector('.ob-loader-fill');
    if (fill) fill.style.width = '100%';
    setTimeout(function () {
      el.classList.add('ob-loader-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (LOADER.el === el) LOADER.el = null; }, 520);
    }, 200);
  }

  /* 全局：用户点击屏幕/目标 → 当前 Eira 轻点一下（tap），做节流避免过频 */
  function bindTapOnClick() {
    var last = 0;
    document.addEventListener('click', function () {
      var now = Date.now();
      if (now - last < 460) return;
      last = now;
      pulseActive('tap', 420);
    }, true);
  }

  /* ============================================================
   * 点击指引：可替换的「小鼠标指针」图标（占位版）
   * 一个精致小巧、淡紫体系的箭头 cursor，热点(指尖)在 viewBox (4,3)，
   * 外层容器用 JS 定位到目标中心，cursor 做「轻点(下压+回弹)」循环，
   * 配合目标本身的呼吸高亮，指出该点哪里。
   * 待设计给出正式指针素材后，只需替换 CURSOR_SVG，
   * 定位与动画（.ob-cursor* 样式）无需改动。
   * ============================================================ */
  /* 待替换为设计的鼠标指针手势 */
  var CURSOR_SVG =
    '<svg class="ob-cursor-svg" viewBox="0 0 34 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="obCursorG" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#f3efff"/><stop offset="1" stop-color="#b9a6f2"/>' +
        '</linearGradient>' +
      '</defs>' +
      // 点按时的柔光圈（在指针热点处扩散）
      '<circle class="ob-cursor-halo" cx="4" cy="3" r="6"/>' +
      // 经典箭头指针，热点在左上角 (4,3)
      '<path class="ob-cursor-arrow" d="M4 3 L4 27 L11 20.5 L15.5 30 L20 28 L15.5 18.6 L25 18.4 Z"/>' +
    '</svg>';

  function buildCursor() {
    var w = document.createElement('div');
    w.className = 'ob-cursor ob-hidden';
    w.setAttribute('aria-hidden', 'true');
    /* 待替换为设计的指针素材：整块 innerHTML 换成正式素材即可 */
    w.innerHTML = CURSOR_SVG;
    return w;
  }

  /* ---------------- 引擎 ---------------- */
  var E = {
    idx: -1, steps: [], root: null, svg: null, dimPath: null,
    ring: null, bubble: null, arrow: null, skipBtn: null, modal: null, blocks: null,
    tap: null, floatEira: null, eiraDragged: false, hintTimer: 0,
    raf: 0, ro: null, cleanup: [], step: null, enterAt: 0,
    active: false, missSince: 0, bubbleRect: null, mode: 'main',
  };

  function ensureRoot() {
    if (E.root) return;
    var root = document.createElement('div');
    root.className = 'ob-root ob-hidden';

    var xmlns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(xmlns, 'svg');
    svg.setAttribute('class', 'ob-dim');
    var path = document.createElementNS(xmlns, 'path');
    path.setAttribute('class', 'ob-dim-path');
    path.setAttribute('fill-rule', 'evenodd');
    svg.appendChild(path);

    var ring = document.createElement('div');
    ring.className = 'ob-ring ob-hidden';

    // 暗区拦截层：围绕镂空区的 4 块透明捕获层，吞掉暗区一切点击
    var blocks = [];
    var swallow = function (e) {
      // 暗区点击：既不冒泡给 App（避免误触/关闭下拉），也不推进引导
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    };
    for (var bi = 0; bi < 4; bi++) {
      var bk = document.createElement('div');
      bk.className = 'ob-block ob-hidden';
      bk.addEventListener('click', swallow, true);
      bk.addEventListener('mousedown', swallow, true);
      bk.addEventListener('touchstart', swallow, true);
      blocks.push(bk);
    }

    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'ob-skip ob-hidden';
    skip.textContent = '跳过引导';
    skip.addEventListener('click', function () { finish(true); });

    // 点击指引：目标上的「小鼠标指针」轻点手势（纯视觉，不拦截点击）
    var tap = buildCursor();

    root.appendChild(svg);
    for (var bj = 0; bj < blocks.length; bj++) root.appendChild(blocks[bj]);
    root.appendChild(ring);
    root.appendChild(tap);
    root.appendChild(skip);
    document.body.appendChild(root);

    E.root = root; E.svg = svg; E.dimPath = path; E.ring = ring; E.skipBtn = skip;
    E.blocks = blocks; E.tap = tap;

    // 左下角跟随的萌宠 Eira（可拖拽），非弹窗步骤显示
    ensureFloatEira();
  }

  /* 左下角跟随萌宠：引导期间固定定位，不允许用户拖动。 */
  function ensureFloatEira() {
    if (E.floatEira) return;
    var fe = buildEira('float');
    fe.classList.add('ob-hidden');
    E.root.appendChild(fe);
    E.floatEira = fe;
    makeEiraDraggable(fe);
  }

  function makeEiraDraggable(fe) {
    fe.classList.add('ob-eira-fixed');
    fe.setAttribute('aria-label', 'Eira 引导角色');
  }

  function showFloatEira() {
    if (!E.floatEira) return;
    E.floatEira.classList.remove('ob-hidden');
    placeFloatEira();
  }
  function hideFloatEira() { if (E.floatEira) E.floatEira.classList.add('ob-hidden'); }

  /* 需求1：Eira 始终贴在「当前高亮框」附近（紧挨高亮框的空白侧），随之移动，
   * 且绝不覆盖 sheet 内容/文字。未被拖动时自动就位；用户拖过则尊重其位置。 */
  function visibleSheetRect() {
    var sheets = qa('.sheet');
    for (var i = 0; i < sheets.length; i++) {
      if (isVisible(sheets[i])) {
        var r = sheets[i].getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
    }
    return null;
  }
  function placeFloatEira() {
    var fe = E.floatEira;
    if (!fe || fe.classList.contains('ob-hidden')) return;
    if (E.eiraDragged) return; // 用户拖过就尊重其位置
    var f = getFrameRect();
    var w = fe.offsetWidth || 92, h = fe.offsetHeight || 78, m = 8;

    var ring = ringRectNow();
    var hole = E.holeRect; // 明亮可操作镂空（如整块天气卡 / 底部操作栏）
    // 避让区：明亮镂空（含高亮环/目标按钮）+ 高亮环 + 已就位气泡
    var avoids = [];
    if (hole) avoids.push(inflateRect(hole, 6));
    if (ring) avoids.push(inflateRect(ring, 6));
    if (E.bubbleRect) avoids.push(inflateRect(E.bubbleRect, 8));

    var clampX = function (x) { return Math.max(f.left + 4, Math.min(x, f.right - w - 4)); };
    var clampY = function (y) { return Math.max(f.top + 4, Math.min(y, f.bottom - h - 4)); };
    var within = function (x, y) { return x >= f.left - 2 && x + w <= f.right + 2 && y >= f.top - 2 && y + h <= f.bottom + 2; };
    var ok = function (x, y) {
      if (!within(x, y)) return false;
      var rc = { left: x, top: y, right: x + w, bottom: y + h };
      return !overlapsAny(rc, avoids);
    };

    // 以「明亮镂空」为核心避让区，Eira 停在其外的空白侧（下→上→右→左）
    var box = hole || ring;
    if (box) {
      var cx = (box.left + box.right) / 2, cym = (box.top + box.bottom) / 2;
      var cands = [
        { x: box.right + m, y: cym - h / 2 },              // 右（优先左右、垂直居中）
        { x: box.left - m - w, y: cym - h / 2 },           // 左
        { x: cx - w / 2, y: box.bottom + m },              // 下
        { x: cx - w / 2, y: box.top - m - h },             // 上
      ];
      for (var i = 0; i < cands.length; i++) {
        if (ok(cands[i].x, cands[i].y)) { fe.style.left = cands[i].x + 'px'; fe.style.top = cands[i].y + 'px'; return; }
      }
    }

    // 兜底：四角里挑一个不压避让区的（默认左下）
    var corners = [
      { x: f.left + m, y: f.bottom - h - m },
      { x: f.right - w - m, y: f.bottom - h - m },
      { x: f.left + m, y: f.top + m + 44 },
      { x: f.right - w - m, y: f.top + m + 44 },
    ];
    for (var k = 0; k < corners.length; k++) {
      if (ok(corners[k].x, corners[k].y)) { fe.style.left = corners[k].x + 'px'; fe.style.top = corners[k].y + 'px'; return; }
    }
    fe.style.left = clampX(corners[0].x) + 'px';
    fe.style.top = clampY(corners[0].y) + 'px';
  }

  /* 点击指引：把「小鼠标指针」定位到目标中心（cueTarget 优先） */
  function showTap(cx, cy) {
    if (!E.tap) return;
    E.tap.classList.remove('ob-hidden');
    E.tap.style.left = cx + 'px';
    E.tap.style.top = cy + 'px';
  }
  function hideTap() { if (E.tap) E.tap.classList.add('ob-hidden'); }

  /* 等某个目标真正渲染并「布局稳定」后再回调（连续两帧尺寸不变），
   * 用于「生成 → 结果卡」这类异步出现的元素：绝不用固定延时对空位置画框。 */
  function waitLaidOut(getEl, cb, opts) {
    opts = opts || {};
    var minH = opts.minH || 40, needStable = opts.stable || 2, maxWait = opts.maxWait || 3500;
    var t0 = Date.now(), lastH = -1, stable = 0;
    var poll = function () {
      var el = null; try { el = getEl && getEl(); } catch (e) {}
      if (el && isVisible(el)) {
        var h = el.getBoundingClientRect().height;
        if (h >= minH) {
          if (Math.abs(h - lastH) < 1) stable++; else stable = 0;
          lastH = h;
          if (stable >= needStable) { cb(); return; }
        }
      }
      if (Date.now() - t0 > maxWait) { cb(); return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  function clearFloating() {
    if (E.bubble) { E.bubble.remove(); E.bubble = null; E.arrow = null; }
    if (E.modal) { E.modal.remove(); E.modal = null; }
    hideTap();
    E.bubbleRect = null;
  }

  /* 绘制遮罩：outer=手机框；hole=目标圆角镂空（可空=全暗） */
  function paintDim(hole) {
    var f = getFrameRect();
    E.svg.setAttribute('width', window.innerWidth);
    E.svg.setAttribute('height', window.innerHeight);
    var outer = roundRectPath(f.left, f.top, f.right - f.left, f.bottom - f.top, f.radius);
    var d = outer;
    if (hole) d += ' ' + roundRectPath(hole.x, hole.y, hole.w, hole.h, hole.r);
    E.dimPath.setAttribute('d', d);
  }

  function hideRing() { E.ring.classList.add('ob-hidden'); }
  function showRing() { E.ring.classList.remove('ob-hidden'); }

  /* ---- 暗区拦截层：定位/显隐 ---- */
  function setBlock(el, x, y, w, h) {
    if (w <= 0 || h <= 0) { el.classList.add('ob-hidden'); return; }
    el.classList.remove('ob-hidden');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
  }
  function hideBlockers() {
    if (!E.blocks) return;
    for (var i = 0; i < E.blocks.length; i++) E.blocks[i].classList.add('ob-hidden');
  }
  // 整框拦截（无高亮镂空时：手机框内全部暗区不可点）
  function coverAllBlockers() {
    if (!E.blocks) return;
    var f = getFrameRect();
    setBlock(E.blocks[0], f.left, f.top, f.right - f.left, f.bottom - f.top);
    E.blocks[1].classList.add('ob-hidden');
    E.blocks[2].classList.add('ob-hidden');
    E.blocks[3].classList.add('ob-hidden');
  }
  // 围绕镂空区（top / bottom / left / right 四块），孔洞区留空可点
  function layoutBlockers(hole) {
    if (!E.blocks) return;
    if (!hole) { coverAllBlockers(); return; }
    var f = getFrameRect();
    var hx = Math.max(f.left, hole.x);
    var hy = Math.max(f.top, hole.y);
    var hr = Math.min(f.right, hole.x + hole.w);
    var hb = Math.min(f.bottom, hole.y + hole.h);
    // top
    setBlock(E.blocks[0], f.left, f.top, f.right - f.left, hy - f.top);
    // bottom
    setBlock(E.blocks[1], f.left, hb, f.right - f.left, f.bottom - hb);
    // left
    setBlock(E.blocks[2], f.left, hy, hx - f.left, hb - hy);
    // right
    setBlock(E.blocks[3], hr, hy, f.right - hr, hb - hy);
  }

  /* 并集矩形：把 step 需要高亮的多个元素合成一个明亮镂空区 */
  function unionRect(els) {
    var minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity, found = false;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el && isVisible(el)) {
        var r = el.getBoundingClientRect();
        if (r.left < minL) minL = r.left;
        if (r.top < minT) minT = r.top;
        if (r.right > maxR) maxR = r.right;
        if (r.bottom > maxB) maxB = r.bottom;
        found = true;
      }
    }
    if (!found) return null;
    return { left: minL, top: minT, right: maxR, bottom: maxB };
  }

  /* 把并集矩形按 PAD 内扩并钳制在手机框内，返回 {x,y,w,h,r} */
  function padRect(u, radius) {
    var f = getFrameRect();
    var x = Math.max(f.left, u.left - PAD);
    var y = Math.max(f.top, u.top - PAD);
    var right = Math.min(f.right, u.right + PAD);
    var bottom = Math.min(f.bottom, u.bottom + PAD);
    return {
      x: x, y: y,
      w: Math.max(0, right - x),
      h: Math.max(0, bottom - y),
      r: (radius == null ? 12 : radius) + PAD,
    };
  }

  /* 呼吸高亮环：只描当前要点的「精确目标按钮」 */
  function layoutRing(u, radius) {
    var g = padRect(u, radius);
    showRing();
    E.ring.style.left = g.x + 'px';
    E.ring.style.top = g.y + 'px';
    E.ring.style.width = g.w + 'px';
    E.ring.style.height = g.h + 'px';
    E.ring.style.borderRadius = g.r + 'px';
    return g;
  }

  /* 明亮可操作镂空 + 暗区拦截：贴合「可操作区」（通常是整张 sheet）。
   * 与高亮环解耦——sheet 整张明亮可点，高亮环只精确落在具体按钮上。 */
  function layoutHole(u, radius) {
    var g = padRect(u, radius);
    paintDim({ x: g.x, y: g.y, w: g.w, h: g.h, r: g.r });
    layoutBlockers({ x: g.x, y: g.y, w: g.w, h: g.h });
    return g;
    // 注意：气泡+Eira 作为一组贴近高亮（见 placeBubbleGroup），
    // 由「鼠标指针手势 + 呼吸高亮」负责指出点哪里，气泡负责让 Eira 说话。
  }

  /* 第三轮需求：气泡 + 萌宠 Eira 作为「一组」紧挨当前高亮目标；
   * 绝不覆盖高亮环 / 目标按钮 / 整张明亮 sheet（或下拉）。
   * 步骤：① 气泡在离高亮最近且有空间的一侧就位（贴按钮或贴 sheet 外缘），
   *      ② Eira 贴到气泡朝向高亮的一侧（也避让），尾巴指向 Eira。 */
  function ringRectNow() {
    if (E.ring && !E.ring.classList.contains('ob-hidden')) {
      var rl = parseFloat(E.ring.style.left) || 0, rt = parseFloat(E.ring.style.top) || 0;
      return { left: rl, top: rt, right: rl + E.ring.offsetWidth, bottom: rt + E.ring.offsetHeight };
    }
    return null;
  }
  function inflateRect(r, m) { return { left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m }; }
  function overlapsAny(rc, list) {
    for (var i = 0; i < list.length; i++) { if (rectsOverlap(rc, list[i], 0)) return true; }
    return false;
  }

  function placeBubbleGroup() {
    var bub = E.bubble; if (!bub) return;
    var fe = E.floatEira;
    var f = getFrameRect();
    var bw = bub.offsetWidth, bh = bub.offsetHeight;
    var ring = ringRectNow();
    var hole = E.holeRect;                 // 明亮可操作镂空（可能只是底部操作栏，而非整张 sheet）

    // 避让区：明亮镂空（含高亮环/目标按钮）+ 高亮环。
    var avoids = [];
    if (hole) avoids.push(inflateRect(hole, 6));
    if (ring) avoids.push(inflateRect(ring, 6));

    // 高亮环尚未就绪：顶部居中兜底，Eira 走原有贴位逻辑
    if (!ring) { placeBubbleFallback(); placeFloatEira(); return; }

    var hasEira = fe && !fe.classList.contains('ob-hidden');

    // 用户拖过 Eira：尊重其位置，气泡走旧的「贴高亮」逻辑
    if (E.eiraDragged || !hasEira) {
      placeBubbleAroundRing(ring, avoids, f, bw, bh);
      setBubbleTail(E.bubbleRect ? { x: E.bubbleRect.left, y: E.bubbleRect.top } : null, fe, E.eiraDragged ? 'dragged' : null);
      return;
    }

    // ===== 新策略：talk 态小猫优先放在「目标按钮/高亮环」的左或右侧，垂直居中 =====
    var ew = fe.offsetWidth || 92, eh = fe.offsetHeight || 78, eGap = 4, bGap = 4;
    var rcy = (ring.top + ring.bottom) / 2;
    var clampY = function (y, hgt) { return Math.max(f.top + 6, Math.min(y, f.bottom - 6 - hgt)); };

    // 比较左右可用宽度，优先空间更大的一侧
    var spaceRight = f.right - ring.right;
    var spaceLeft = ring.left - f.left;
    var sideOrder = spaceRight >= spaceLeft ? ['right', 'left'] : ['left', 'right'];

    var placed = null; // { side, ex, ey }
    for (var s = 0; s < sideOrder.length; s++) {
      var side = sideOrder[s];
      var ex = side === 'right' ? (ring.right + eGap) : (ring.left - eGap - ew);
      var ey = clampY(rcy - eh / 2, eh);
      var erc = { left: ex, top: ey, right: ex + ew, bottom: ey + eh };
      var within = ex >= f.left - 2 && ex + ew <= f.right + 2 && ey >= f.top - 2 && ey + eh <= f.bottom + 2;
      if (within && !overlapsAny(erc, avoids)) { placed = { side: side, ex: ex, ey: ey, rc: erc }; break; }
    }

    if (!placed) {
      // 左右都放不下：回退到「气泡贴高亮 + Eira 贴气泡」的稳妥逻辑
      placeBubbleAroundRing(ring, avoids, f, bw, bh);
      var side2 = placeEiraByBubble({ x: E.bubbleRect.left, y: E.bubbleRect.top }, ring, avoids, f, bw, bh);
      setBubbleTail({ x: E.bubbleRect.left, y: E.bubbleRect.top }, fe, side2);
      return;
    }

    // 落位小猫
    fe.style.left = placed.ex + 'px';
    fe.style.top = placed.ey + 'px';
    var ecx = placed.ex + ew / 2, ecy = placed.ey + eh / 2;

    // 气泡跟随小猫旁边：优先小猫「外侧」（远离高亮），再上、下；都不行则钳制在框内
    var avoidsWithCat = avoids.concat([inflateRect(placed.rc, 6)]);
    var bcands = [];
    if (placed.side === 'right') {
      bcands.push({ x: placed.ex + ew + bGap, y: ecy - bh / 2 }); // 猫右侧（更外）
      bcands.push({ x: placed.ex, y: placed.ey + eh + bGap });    // 猫外侧·下（左沿对齐猫，避开内侧高亮）
      bcands.push({ x: placed.ex, y: placed.ey - bGap - bh });    // 猫外侧·上
    } else {
      bcands.push({ x: placed.ex - bGap - bw, y: ecy - bh / 2 }); // 猫左侧（更外）
      bcands.push({ x: placed.ex + ew - bw, y: placed.ey + eh + bGap }); // 猫外侧·下（右沿对齐猫）
      bcands.push({ x: placed.ex + ew - bw, y: placed.ey - bGap - bh }); // 猫外侧·上
    }
    bcands.push({ x: ecx - bw / 2, y: placed.ey - bGap - bh });   // 猫上方
    bcands.push({ x: ecx - bw / 2, y: placed.ey + eh + bGap });   // 猫下方

    var best = null;
    for (var i = 0; i < bcands.length; i++) {
      var bx = bcands[i].x, by = bcands[i].y;
      var brc = { left: bx, top: by, right: bx + bw, bottom: by + bh };
      var win = bx >= f.left - 2 && bx + bw <= f.right + 2 && by >= f.top - 2 && by + bh <= f.bottom + 2;
      if (win && !overlapsAny(brc, avoidsWithCat)) { best = { x: bx, y: by }; break; }
    }
    if (!best) {
      // 兜底：优先把气泡放到「猫上方 / 下方 / 高亮环上方 / 环下方」中首个不压高亮者，
      // x 钳制进框；宁可离猫略远，也绝不遮住高亮环/目标按钮。
      var clampBX = function (x) { return Math.max(f.left + 6, Math.min(x, f.right - 6 - bw)); };
      var bx = clampBX(ecx - bw / 2);
      var fcands = [
        { x: bx, y: placed.ey - bGap - bh },     // 猫上方
        { x: bx, y: placed.ey + eh + bGap },     // 猫下方
        { x: bx, y: ring.top - bGap - bh },      // 高亮环上方
        { x: bx, y: ring.bottom + bGap },        // 高亮环下方
      ];
      for (var j = 0; j < fcands.length; j++) {
        var fc = fcands[j];
        var frc = { left: fc.x, top: fc.y, right: fc.x + bw, bottom: fc.y + bh };
        var fwin = fc.x >= f.left - 2 && fc.x + bw <= f.right + 2 && fc.y >= f.top - 2 && fc.y + bh <= f.bottom + 2;
        if (fwin && !overlapsAny(frc, avoidsWithCat)) { best = { x: fc.x, y: fc.y }; break; }
      }
      if (!best) {
        // 空间极窄时把气泡固定到小猫上方，保证两者不重合。
        var safeY = Math.max(f.top + 6, Math.min(placed.ey - bGap - bh, f.bottom - 6 - bh));
        best = { x: bx, y: safeY };
        var safeRect = { left: best.x, top: best.y, right: best.x + bw, bottom: best.y + bh };
        if (rectsOverlap(safeRect, placed.rc, 0)) {
          safeY = Math.max(f.top + 6, placed.ey - bGap - bh);
          best.y = safeY;
        }
      }
    }

    bub.style.left = best.x + 'px';
    bub.style.top = best.y + 'px';
    E.bubbleRect = { left: best.x, top: best.y, right: best.x + bw, bottom: best.y + bh };

    // 尾巴指向小猫（用 dragged 分支按几何自动判方向）
    setBubbleTail({ x: best.x, y: best.y }, fe, 'dragged');
  }

  /* 兜底：气泡贴高亮环四侧就位（Eira 之后贴气泡）——保留旧逻辑供回退 */
  function placeBubbleAroundRing(ring, avoids, f, bw, bh) {
    var bub = E.bubble; if (!bub) return;
    var sheet = visibleSheetRect();
    var gap = 8;
    var rcx = (ring.left + ring.right) / 2, rcy = (ring.top + ring.bottom) / 2;
    var clampX = function (x) { return Math.max(f.left + 6, Math.min(x, f.right - 6 - bw)); };
    var clampY = function (y) { return Math.max(f.top + 6, Math.min(y, f.bottom - 6 - bh)); };
    var cands = [];
    function push(dir, x, y) { cands.push({ dir: dir, x: clampX(x), y: clampY(y) }); }
    push('below', rcx - bw / 2, ring.bottom + gap);
    push('above', rcx - bw / 2, ring.top - gap - bh);
    push('right', ring.right + gap, rcy - bh / 2);
    push('left', ring.left - gap - bw, rcy - bh / 2);
    if (sheet) {
      push('above', rcx - bw / 2, sheet.top - gap - bh);
      push('below', rcx - bw / 2, sheet.bottom + gap);
      push('right', sheet.right + gap, rcy - bh / 2);
      push('left', sheet.left - gap - bw, rcy - bh / 2);
    }
    var best = null, bestScore = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var rc = { left: c.x, top: c.y, right: c.x + bw, bottom: c.y + bh };
      var within = rc.left >= f.left - 2 && rc.right <= f.right + 2 && rc.top >= f.top - 2 && rc.bottom <= f.bottom + 2;
      if (within && !overlapsAny(rc, avoids)) {
        var d = Math.hypot((c.x + bw / 2) - rcx, (c.y + bh / 2) - rcy);
        if (d < bestScore) { bestScore = d; best = c; }
      }
    }
    if (!best) {
      var bx = clampX(rcx - bw / 2);
      var by = Math.max(f.top + 6, (sheet ? sheet.top : ring.top) - gap - bh);
      best = { dir: 'above', x: bx, y: by };
    }
    bub.style.left = best.x + 'px';
    bub.style.top = best.y + 'px';
    E.bubbleRect = { left: best.x, top: best.y, right: best.x + bw, bottom: best.y + bh };
  }

  /* Eira 贴到气泡的空白侧，优先朝向高亮，避让高亮环/sheet；返回 Eira 相对气泡的方位 */
  function placeEiraByBubble(bub, ring, avoids, f, bw, bh) {
    var fe = E.floatEira;
    var ew = fe.offsetWidth || 92, eh = fe.offsetHeight || 78, eGap = 4;
    var bcx = bub.x + bw / 2, bcy = bub.y + bh / 2;
    var rcx = (ring.left + ring.right) / 2, rcy = (ring.top + ring.bottom) / 2;
    var opts = [
      { side: 'bottom', x: bcx - ew / 2, y: bub.y + bh + eGap },
      { side: 'top', x: bcx - ew / 2, y: bub.y - eGap - eh },
      { side: 'right', x: bub.x + bw + eGap, y: bcy - eh / 2 },
      { side: 'left', x: bub.x - eGap - ew, y: bcy - eh / 2 },
    ];
    // 朝向高亮者优先（Eira 中心离高亮中心更近排前）
    opts.sort(function (a, b) {
      return Math.hypot((a.x + ew / 2) - rcx, (a.y + eh / 2) - rcy) -
             Math.hypot((b.x + ew / 2) - rcx, (b.y + eh / 2) - rcy);
    });
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var rc = { left: o.x, top: o.y, right: o.x + ew, bottom: o.y + eh };
      var within = o.x >= f.left - 2 && o.x + ew <= f.right + 2 && o.y >= f.top - 2 && o.y + eh <= f.bottom + 2;
      if (within && !overlapsAny(rc, avoids)) {
        fe.style.left = o.x + 'px'; fe.style.top = o.y + 'px';
        return o.side;
      }
    }
    // 都不理想：贴气泡下方并做边界钳制
    var fx = Math.max(f.left + 4, Math.min(bcx - ew / 2, f.right - ew - 4));
    var fy = Math.max(f.top + 4, Math.min(bub.y + bh + eGap, f.bottom - eh - 4));
    fe.style.left = fx + 'px'; fe.style.top = fy + 'px';
    return 'bottom';
  }

  /* 尾巴贴在气泡「朝向 Eira」的边，指向 Eira 中心 */
  function setBubbleTail(bub, fe, side) {
    var a = E.arrow; if (!a) return;
    if (!fe || fe.classList.contains('ob-hidden') || !side) { a.style.display = 'none'; return; }
    a.style.display = '';
    var bw = E.bubble.offsetWidth, bh = E.bubble.offsetHeight;
    var ex = parseFloat(fe.style.left) || 0, ey = parseFloat(fe.style.top) || 0;
    var ew = fe.offsetWidth || 92, eh = fe.offsetHeight || 78;
    var ecx = ex + ew / 2, ecy = ey + eh / 2;
    var realSide = side;
    if (side === 'dragged') {
      var dx = ecx - (bub.x + bw / 2), dy = ecy - (bub.y + bh / 2);
      realSide = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
    }
    if (realSide === 'bottom') {
      a.className = 'ob-arrow down';
      a.style.left = Math.max(14, Math.min(ecx - bub.x, bw - 14)) + 'px'; a.style.right = ''; a.style.top = (bh - 6) + 'px';
    } else if (realSide === 'top') {
      a.className = 'ob-arrow up';
      a.style.left = Math.max(14, Math.min(ecx - bub.x, bw - 14)) + 'px'; a.style.right = ''; a.style.top = '-6px';
    } else if (realSide === 'right') {
      a.className = 'ob-arrow right';
      a.style.top = Math.max(14, Math.min(ecy - bub.y, bh - 14)) + 'px'; a.style.right = '-6px'; a.style.left = '';
    } else {
      a.className = 'ob-arrow left';
      a.style.top = Math.max(14, Math.min(ecy - bub.y, bh - 14)) + 'px'; a.style.left = '-6px'; a.style.right = '';
    }
  }

  /* 「跳过引导」在手机框四角中挑一个不与气泡重叠的位置 */
  function positionSkip() {
    if (!E.skipBtn || E.skipBtn.classList.contains('ob-hidden')) return;
    var f = getFrameRect();
    var w = E.skipBtn.offsetWidth || 84, h = E.skipBtn.offsetHeight || 30;
    var m = 12;
    var corners = [
      { x: f.right - w - m, y: f.top + m },       // 右上
      { x: f.left + m, y: f.top + m },            // 左上
      { x: f.right - w - m, y: f.bottom - h - m },// 右下
      { x: f.left + m, y: f.bottom - h - m },     // 左下
    ];
    var chosen = corners[0];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      var rc = { left: c.x, top: c.y, right: c.x + w, bottom: c.y + h };
      if (!E.bubbleRect || !rectsOverlap(rc, E.bubbleRect, 6)) { chosen = c; break; }
    }
    E.skipBtn.style.left = chosen.x + 'px';
    E.skipBtn.style.top = chosen.y + 'px';
  }

  /* ---------------- 气泡 / 弹窗 ---------------- */
  function makeButtonsRow(buttons) {
    var row = document.createElement('div');
    row.className = 'ob-actions';
    (buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'ob-btn ' + (b.kind === 'primary' ? 'ob-btn-primary' : 'ob-btn-text');
      el.textContent = b.label;
      el.addEventListener('click', function () { b.onClick && b.onClick(); });
      row.appendChild(el);
    });
    return row;
  }

  function softWrapText(value) {
    var text = String(value || '');
    if (!/[\u3400-\u9fff]/.test(text)) return text;
    var chars = Array.from(text);
    var out = '';
    var count = 0;
    chars.forEach(function (ch, index) {
      out += ch;
      count++;
      if (count >= 4 && index < chars.length - 1 && ch !== '，' && ch !== '。') {
        out += '\u200b';
        count = 0;
      }
    });
    return out;
  }

  function renderBubble(step) {
    var bub = document.createElement('div');
    bub.className = 'ob-bubble' + (step.compactConfirm ? ' ob-bubble--confirm' : '');
    var arrow = document.createElement('div');
    arrow.className = 'ob-arrow up';
    bub.appendChild(arrow);

    var h = document.createElement('div');
    h.className = 'ob-title';
    h.textContent = softWrapText(step.title);
    bub.appendChild(h);

    if (step.desc) {
      var d = document.createElement('div');
      d.className = 'ob-desc';
      d.textContent = softWrapText(step.desc);
      bub.appendChild(d);
    }
    if (step.buttons && step.buttons.length) bub.appendChild(makeButtonsRow(step.buttons));
    E.root.appendChild(bub);
    E.bubble = bub; E.arrow = arrow;
    E.skipBtn.classList.remove('ob-hidden');
    // 初始占位：气泡+Eira 作为一组贴近高亮（尚未就绪时内部退回顶部居中兜底）。
    placeBubbleGroup();
  }

  function placeBubbleFallback() {
    var bub = E.bubble; if (!bub) return;
    var f = getFrameRect();
    var bw = bub.offsetWidth, bh = bub.offsetHeight;
    var left = f.left + (f.right - f.left) / 2 - bw / 2;
    left = Math.max(f.left + 8, Math.min(left, f.right - 8 - bw));
    var top = f.top + 64;
    bub.style.left = left + 'px';
    bub.style.top = top + 'px';
    E.bubbleRect = { left: left, top: top, right: left + bw, bottom: top + bh };
    if (E.arrow) E.arrow.style.display = 'none';
  }

  /* 纯动态点击指引步骤：无文字气泡，仅高亮 + 水波纹 + Eira，靠用户操作自动推进 */
  function renderCueOnly(step) {
    E.skipBtn.classList.remove('ob-hidden');
  }

  function renderModal(step) {
    paintDim(null);
    hideRing();
    hideBlockers();
    hideTap();
    hideFloatEira(); // 弹窗步骤：改用趴在卡片上沿的 Eira
    E.skipBtn.classList.add('ob-hidden');

    var wrap = document.createElement('div');
    wrap.className = 'ob-modal-wrap';
    var f = getFrameRect();
    wrap.style.left = f.left + 'px';
    wrap.style.top = f.top + 'px';
    wrap.style.width = (f.right - f.left) + 'px';
    wrap.style.height = (f.bottom - f.top) + 'px';

    var card = document.createElement('div');
    card.className = 'ob-modal';
    if (step.key) card.classList.add('ob-modal-' + step.key);
    // ===== 萌宠 Eira 趴在弹窗上沿 =====
    // step.eira 为真时，Eira 半悬在卡片顶边（不在卡片内容里），
    // 卡片顶部已预留内边距，标题在 Eira 下方。
    if (step.eira) {
      card.classList.add('ob-modal-has-eira');
      var pet = buildEira('perch');
      card.appendChild(pet);
      // 恭喜卡（保存成功）/ 灵感收尾卡让 Eira 雀跃一跳，其余弹窗轻点问候一下，随后回到 idle
      var celebrate = step.key === 'congrats' || step.key === 'insp-done';
      eiraPulse(pet, celebrate ? 'success' : 'tap', celebrate ? 820 : 460);
    }
    var t = document.createElement('div');
    t.className = 'ob-modal-title';
    t.textContent = step.title;
    card.appendChild(t);
    if (step.desc) {
      var s = document.createElement('div');
      s.className = 'ob-modal-desc';
      s.textContent = step.desc;
      card.appendChild(s);
    }
    card.appendChild(makeButtonsRow(step.buttons));
    wrap.appendChild(card);
    E.root.appendChild(wrap);
    E.modal = wrap;
  }

  /* ---------------- 跟随循环 ---------------- */
  function currentTargets(step) {
    if (step.targets) { try { return step.targets() || []; } catch (e) { return []; } }
    if (step.target) { try { var el = step.target(); return el ? [el] : []; } catch (e) { return []; } }
    return [];
  }

  function startFollow() {
    stopFollow();
    var tick = function () {
      E.raf = requestAnimationFrame(tick);
      var step = E.step; if (!step) return;

      positionSkip();

      // 必选步骤（选风格 / 选场景）：未选中时把「下一步」置灰，选中后恢复可点
      if (step.gateNext && E.bubble) {
        var gb = E.bubble.querySelector('.ob-btn-primary');
        if (gb) {
          var ok = false; try { ok = !!step.gateNext(); } catch (e) {}
          gb.classList.toggle('ob-disabled', !ok);
        }
      }

      // 全局兜底：任何「替换 / 添加单品」底部 sheet 一旦弹出，立即让它成为高亮主角
      // （整张明亮可点），并把气泡切换到对应步骤，彻底杜绝 sheet 被暗化与步骤错配。
      if (!step.center) {
        if (T.replaceSheet() && step.key !== 'replacePick') { goToKey('replacePick'); return; }
        if (T.addSheet() && step.key !== 'addPick') { goToKey('addPick'); return; }
      }

      if (step.autoAdvance) {
        try { if (step.autoAdvance()) { next(); return; } } catch (e) {}
      }

      // 生成步「过渡态」：用户已点「生成今日穿搭」、结果卡正在渲染。
      // 此时立即撤掉旧高亮环/镂空/指针（在 autoAdvance 里已清），并保持清空、
      // 不再重绘任何高亮，直到结果详情卡布局稳定后由 waitLaidOut 推进到下一步，
      // 彻底杜绝「生成→结果卡」之间残留小框 / 闪烁 / 对空位置画框。
      if (E._genPending) {
        hideRing(); hideTap(); paintDim(null); coverAllBlockers();
        E.holeRect = null;
        return;
      }

      if (step.center) { paintDim(null); hideBlockers(); hideTap(); E.holeRect = null; return; }

      var ringEls = currentTargets(step);
      var ringU = unionRect(ringEls);
      if (ringU) {
        E.missSince = 0;
        var radius = step.radius != null ? step.radius : cssRadius(ringEls[0], 12);
        layoutRing(ringU, radius);
        // 可操作镂空：优先整张 sheet（holeTarget），否则贴合高亮目标本身。
        // sheet 步骤整张明亮可点，高亮环只精确落在具体按钮上。
        var holeEls = step.holeTarget ? [step.holeTarget()] : ringEls;
        var holeU = unionRect(holeEls) || ringU;
        var holeRadius = step.holeTarget ? (step.holeRadius != null ? step.holeRadius : 22) : radius;
        var hg = layoutHole(holeU, holeRadius);
        // 记录「明亮镂空」矩形，供气泡 / Eira 避让（只避明亮可操作区，而非整张 sheet）
        E.holeRect = { left: hg.x, top: hg.y, right: hg.x + hg.w, bottom: hg.y + hg.h };
        // 鼠标指针手势：精确落在 cueTarget（默认首个高亮目标）中心
        var cueEl = step.cueTarget ? step.cueTarget() : ringEls[0];
        if (step.cue && cueEl && isVisible(cueEl)) {
          var rc = cueEl.getBoundingClientRect();
          showTap(rc.left + rc.width / 2, rc.top + rc.height / 2);
        } else {
          hideTap();
        }
      } else {
        hideRing();
        hideTap();
        paintDim(null);
        coverAllBlockers();
        E.holeRect = null;
        if (!E.missSince) E.missSince = Date.now();
        var wait = step.waitTargetMs || 6000;
        if (Date.now() - E.missSince > wait) { next(); return; }
      }

      // 有气泡：气泡+萌宠作为一组贴近高亮，避让高亮环/目标/明亮 sheet；无气泡：Eira 贴高亮
      if (E.bubble) placeBubbleGroup();
      else placeFloatEira();
    };
    E.raf = requestAnimationFrame(tick);

    var onScroll = function () {
      if (!E.active) return;
      // 立即重排一次，避免容器滚动后高亮/气泡等到下一轮布局才跟随。
      if (E.bubble) placeBubbleGroup();
      else placeFloatEira();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll, true);
    E.cleanup.push(function () {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll, true);
    });
    if (window.ResizeObserver) {
      try {
        var ro = new ResizeObserver(function () {});
        var phone = q('.phone'); if (phone) ro.observe(phone);
        E.ro = ro;
        E.cleanup.push(function () { try { ro.disconnect(); } catch (e) {} E.ro = null; });
      } catch (e) {}
    }
  }
  function stopFollow() {
    if (E.raf) { cancelAnimationFrame(E.raf); E.raf = 0; }
  }

  function runCleanup() {
    E.cleanup.forEach(function (fn) { try { fn(); } catch (e) {} });
    E.cleanup = [];
    stopFollow();
  }

  /* ---------------- 步骤流转 ---------------- */
  function goTo(i) {
    runCleanup();
    clearFloating();
    E.missSince = 0;

    if (i >= E.steps.length) { finish(true); return; }
    var step = E.steps[i];
    if (step.skipIf && step.skipIf()) { goTo(i + 1); return; }

    E.idx = i; E.step = step; E.enterAt = Date.now();
    if (step.onEnter) { try { step.onEnter(); } catch (e) {} }

    // 事件推进（如保存成功）
    if (step.advanceOnEvent) {
      var handler = function () { next(); };
      window.addEventListener(step.advanceOnEvent, handler);
      E.cleanup.push(function () { window.removeEventListener(step.advanceOnEvent, handler); });
    }

    // 点击监听：捕获用户真实操作（挑选单品 / 删除单品等）
    if (step.watchClick && step.watchClick.length) {
      var onClick = function (e) {
        for (var k = 0; k < step.watchClick.length; k++) {
          var rule = step.watchClick[k];
          var hit = e.target && e.target.closest && e.target.closest(rule.match);
          if (hit) { try { rule.run(); } catch (err) {} return; }
        }
      };
      document.addEventListener('click', onClick, true);
      E.cleanup.push(function () { document.removeEventListener('click', onClick, true); });
    }

    // 拦截式点击：命中即阻止 App 默认行为（preventDefault + 停止冒泡），改走 run()。
    // 用于「未登录点上传」——不让 App 直接弹出真实注册/登录表单，先走引导登录提示卡。
    if (step.interceptClick && step.interceptClick.length) {
      var onIntercept = function (e) {
        for (var k = 0; k < step.interceptClick.length; k++) {
          var rule = step.interceptClick[k];
          if (rule.when) { try { if (!rule.when()) continue; } catch (er) { continue; } }
          var hit = e.target && e.target.closest && e.target.closest(rule.match);
          if (hit) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            try { rule.run(); } catch (err) {}
            return;
          }
        }
      };
      document.addEventListener('click', onIntercept, true);
      document.addEventListener('mousedown', onIntercept, true);
      E.cleanup.push(function () {
        document.removeEventListener('click', onIntercept, true);
        document.removeEventListener('mousedown', onIntercept, true);
      });
    }

    // 进入前把目标滚到可见（仅一次）
    var els0 = currentTargets(step);
    if (els0[0] && els0[0].scrollIntoView) {
      var r = els0[0].getBoundingClientRect(), f = getFrameRect();
      if (r.top < f.top + 8 || r.bottom > f.bottom - 8) {
        try { els0[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      }
    }

    if (step.center) renderModal(step);
    else {
      E.eiraDragged = false; // 每步让 Eira 回到不遮挡高亮的角落，用户可再拖动
      showFloatEira();
      eiraPulse(E.floatEira, 'tap', 460); // 切步时官方整体轻点一下，随后回到 idle 呼吸
      if (step.cueOnly) renderCueOnly(step);
      else renderBubble(step);
    }

    startFollow();
  }
  function next() { goTo(E.idx + 1); }
  function goToKey(key) {
    for (var i = 0; i < E.steps.length; i++) { if (E.steps[i].key === key) { goTo(i); return; } }
    next();
  }
  function closeTopSheet() {
    var sheets = qa('.sheet');
    for (var i = sheets.length - 1; i >= 0; i--) {
      if (isVisible(sheets[i])) {
        var x = sheets[i].querySelector('.close-x');
        if (x) { x.click(); return; }
      }
    }
  }

  // 从「结果卡」进入衣橱上传步：无论保存与否，都要先关掉结果卡、切到衣橱页，
  // 等页面稳定后再进入 upload 步（届时 T.wardrobeUpload 才会命中真实上传按钮）。
  function goUploadStep() {
    closeTopSheet();
    goWardrobe();
    setTimeout(function () { goToKey('upload'); }, 380);
  }

  // 未选中时点主按钮：气泡正文临时变成轻提示，1.6s 后自动还原
  function flashHint(msg) {
    if (!E.bubble) return;
    // 瘦身后的气泡多数只有一行标题：优先提示在 .ob-desc，没有则回退到标题行
    var d = E.bubble.querySelector('.ob-desc') || E.bubble.querySelector('.ob-title');
    if (!d) return;
    if (d.getAttribute('data-orig') == null) d.setAttribute('data-orig', d.textContent);
    d.textContent = msg;
    d.classList.add('ob-desc-hint');
    clearTimeout(E.hintTimer);
    E.hintTimer = setTimeout(function () {
      var o = d.getAttribute('data-orig');
      if (o != null) { d.textContent = o; d.classList.remove('ob-desc-hint'); }
    }, 1600);
  }

  /* ---------------- 生命周期 ---------------- */
  function start(mode) {
    if (E.active) return;
    E.mode = mode === 'inspiration' ? 'inspiration' : 'main';
    ensureRoot();
    if (E.mode === 'main') setDemoWeatherCopy(true);
    E.active = true;
    hidePersistEira();               // 引导中隐藏常驻 Eira，改用跟随 Eira
    E.root.classList.remove('ob-hidden');
    document.body.classList.add('ob-open');
    E.steps = E.mode === 'inspiration' ? buildInspSteps() : buildSteps();
    goTo(0);
  }

  function finish(markDone) {
    var mode = E.mode;
    runCleanup();
    clearFloating();
    if (E.root) E.root.classList.add('ob-hidden');
    if (E.ring) hideRing();
    hideBlockers();
    hideTap();
    hideFloatEira();
    if (E.skipBtn) E.skipBtn.classList.add('ob-hidden');
    document.body.classList.remove('ob-open');
    E.active = false; E.step = null; E.idx = -1;
    if (markDone) markGuideDone(mode);
    if (mode === 'main') setDemoWeatherCopy(false);
    showPersistEira();               // 引导结束：常驻 Eira 回到左下角
  }

  /* 关闭当前打开的所有底部 sheet（登录 / 个人中心 / 详情等覆盖层），
   * 让页面回到干净状态——重玩引导前先清掉登录页等遮挡，避免第一步被盖住。 */
  function closeAllSheets() {
    var sheets = qa('.sheet');
    for (var i = sheets.length - 1; i >= 0; i--) {
      if (isVisible(sheets[i])) {
        var x = sheets[i].querySelector('.close-x');
        if (x) { try { x.click(); } catch (e) {} }
      }
    }
  }

  /* 彻底重置引导引擎的一切中间态：停跟随循环 / 解绑监听、清气泡·弹窗·指针、
   * 撤高亮环·镂空·暗区拦截、复位 step/idx、清 _genPending 等过渡态与拖拽记忆。
   * 用于「重玩引导」——保证无论上次停在哪一步（含生成过渡态）都能干净重来。 */
  function resetEngine() {
    runCleanup();          // 停 rAF 跟随 + 解绑 scroll/resize/点击监听
    clearFloating();       // 清气泡 / 弹窗 / 指针 + bubbleRect
    E._genPending = false; // 清「生成→结果卡」过渡态，杜绝 tick 里被卡住空转
    E.missSince = 0;
    E.eiraDragged = false; // 复位 Eira 拖拽记忆，重新自动就位
    E.holeRect = null;
    E.bubbleRect = null;
    E.step = null;
    E.idx = -1;
    if (E.ring) hideRing();
    hideBlockers();
    hideTap();
    hideFloatEira();
    if (E.skipBtn) E.skipBtn.classList.add('ob-hidden');
    try { if (E.svg) paintDim(null); } catch (e) {}
    E.active = false;      // 允许 start() 重新进入
  }

  /* 重玩主引导（常驻 Eira 菜单「体验新手引导」入口）：
   *  1) 清「已完成」标记 + 彻底重置引擎中间态；
   *  2) 关掉登录页等所有 sheet，并主动把 App 切回首页（主引导第一步所在页）；
   *  3) 轮询等首页关键 DOM（天气卡 / hero）就绪且无遮挡 sheet 后再启动，
   *     保证第一步能正确高亮、可继续，绝不卡在登录页/固化。 */
  function restartMainGuide() {
    if (E._restartTimer) clearInterval(E._restartTimer);
    clearGuideDone('main');
    closePersistMenu();
    ensureRoot();
    resetEngine();
    closeAllSheets();      // 关掉登录 / 个人中心等覆盖层
    goHome();              // 切回首页
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var homeReady = q('.weather-link') || q('.hero');
      var sheetOpen = false;
      var sh = qa('.sheet');
      for (var i = 0; i < sh.length; i++) { if (isVisible(sh[i])) { sheetOpen = true; break; } }
      if ((homeReady && !sheetOpen) || tries > 24) {
        clearInterval(timer);
        E._restartTimer = 0;
        start('main');
      }
    }, 120);
    E._restartTimer = timer;
  }

  /* ---------------- 步骤定义 ---------------- */
  function buildSteps() {
    var nextLink = function (label) { return { label: label || '下一步 ›', kind: 'text', onClick: next }; };
    var skipTo = function (label, key) { return { label: label || '暂不操作 ›', kind: 'text', onClick: function () { goToKey(key); } }; };
    var skipSheetTo = function (label, key) {
      return { label: label || '暂不操作 ›', kind: 'text', onClick: function () { closeTopSheet(); setTimeout(function () { goToKey(key); }, 320); } };
    };

    return [
      // 0 · 欢迎（Eira 趴在卡片上沿）
      {
        key: 'welcome', center: true, eira: true,
        title: '跟 Eira 一起开启衣见之旅吧～',
        onEnter: function () { seedDemoWardrobe(); goHome(); },
        buttons: [
          { label: '开始', kind: 'primary', onClick: function () { seedDemoWardrobe(); goHome(); next(); } },
        ],
      },

      // 1 · 先提示用户点击授权定位；点击后再展示模拟天气说明。
      {
        key: 'weather', target: T.weatherCta, cueTarget: T.weatherCta,
        title: '请先点击授权定位',
        cue: true,
        interceptClick: [{
          match: '.weather-link',
          run: function () {
            try {
              if (window.YijianDemo && window.YijianDemo.setDemoWeather) {
                window.YijianDemo.setDemoWeather();
              }
            } catch (e) {}
            next();
          },
        }],
      },
      {
        key: 'weatherInfo', center: true, eira: true,
        title: '本次体验使用模拟天气；实时天气请授权定位',
        compactConfirm: true,
        buttons: [{
          label: '确定 ›',
          kind: 'text',
          onClick: next,
        }],
      },

      // 2 · 选风格（动态点击指引：高亮触发器 + 展开面板，选中即自动下一步）
      {
        key: 'style',
        targets: function () {
          return [T.stylePanel() ? T.styleOption() : T.styleTrigger()].filter(Boolean);
        },
        radius: 16, cueOnly: true, cue: true,
        autoAdvance: function () { return T.styleChosen(); },
      },

      // 3 · 选场景（动态点击指引）
      {
        key: 'scene',
        targets: function () {
          return [T.scenePanel() ? T.sceneOption() : T.sceneTrigger()].filter(Boolean);
        },
        radius: 16, cueOnly: true, cue: true,
        autoAdvance: function () { return T.sceneChosen(); },
      },

      // 4 · 生成（动态点击指引：点高亮按钮）—— 生成成功时 Eira 雀跃庆祝
      {
        key: 'generate', target: T.generate, cueOnly: true, cue: true,
        autoAdvance: function () {
          var step = E.step;
          if (T.detail() && !E._genPending) {
            // 用户已点「生成今日穿搭」、结果卡开始渲染：立刻进入过渡态。
            E._genPending = true;
            // 立即撤掉本步的旧高亮环 / 镂空 / 指针，避免「生成→结果卡」之间残留小框。
            hideRing(); hideTap(); paintDim(null); coverAllBlockers(); E.holeRect = null;
            // Eira 原地雀跃庆祝（保留萌宠，只撤掉高亮/指针）
            eiraPulse(E.floatEira, 'success', 820);
            // 不用固定延时：等结果详情卡真正渲染并布局稳定后，再推进到「结果卡」步骤，
            // 由下一步统一绘制高亮，保证过渡平滑、绝不对空位置画框。
            waitLaidOut(T.detail, function () {
              if (E.step === step && E._genPending) { E._genPending = false; next(); }
            });
          }
          return false;
        },
        onEnter: function () { E._genPending = false; },
        waitTargetMs: 15000,
      },

      // 5 · 结果卡（整张详情卡高亮）—— 揭晓时刻，保留一句短提示
      {
        key: 'result', target: T.detail, place: 'above', radius: 24,
        title: '叮～这套送给你',
        waitTargetMs: 8000,
        buttons: [nextLink('继续 ›')],
      },

      // 6 · 替换（短文字 + 动态点击指引，精准指向卡片右上角「换一件」）
      {
        key: 'replace', target: T.replaceBtn, cueTarget: T.replaceBtn, place: 'above', radius: 16, cue: true,
        title: '不爱这件？换一件',
        autoAdvance: function () { return !!T.replaceSheet(); },
        waitTargetMs: 8000,
        buttons: [skipTo('暂不操作 ›', 'delete')],
      },

      // 6b · 替换 sheet（只让选衣列表区域明亮可点；指针+呼吸高亮指向列表里第一件可选单品）
      {
        key: 'replacePick', target: T.replacePickItem, cueTarget: T.replacePickItem, holeTarget: T.replaceList,
        place: 'above', radius: 14, cue: true,
        title: '挑一件喜欢的换上',
        autoAdvance: function () { return !T.replaceSheet(); },
        waitTargetMs: 20000,
        watchClick: [{ match: '.sheet ' + SEL.itemCard, run: function () {} }],
        buttons: [skipSheetTo('暂不操作 ›', 'delete')],
      },

      // 7 · 删除说明：只讲解能力，不引导用户实际点击删除。
      {
        key: 'delete', center: true, eira: true,
        title: '不想要的单品可以删除',
        desc: '在单品卡片右上角点击 ×，确认后即可移除衣物。',
        buttons: [{ label: '知道啦 ›', kind: 'primary', onClick: function () { next(); } }],
      },

      // 8 · 添加（短文字 + 动态点击指引，精准指向「+ 添加单品」虚线按钮）
      {
        key: 'add', target: T.addBtn, cueTarget: T.addBtn, place: 'above', radius: 14, cue: true,
        title: '添加喜欢的单品💗',
        autoAdvance: function () { return !!T.addSheet(); },
        waitTargetMs: 8000,
        buttons: [skipTo('暂不操作 ›', 'save')],
      },

      // 8b · 添加 sheet（只让选衣列表区域明亮可点；指针+呼吸高亮指向列表里第一件可选单品）
      {
        key: 'addPick', target: T.addPickItem, cueTarget: T.addPickItem, holeTarget: T.addList,
        place: 'above', radius: 14, cue: true,
        title: '挑一件加进来',
        autoAdvance: function () { return !T.addSheet(); },
        waitTargetMs: 20000,
        watchClick: [{ match: '.sheet ' + SEL.itemCard, run: function () {} }],
        buttons: [skipSheetTo('暂不操作 ›', 'save')],
      },

      // 9 · 保存（Eira 气泡提示 + 点击指引：只高亮「保存」按钮本身，气泡+Eira 贴近它）
      {
        key: 'save', target: T.saveBtn, cueTarget: T.saveBtn, radius: 12, cue: true,
        title: '保存你的今日穿搭吧～',
        advanceOnEvent: 'yijian:outfit-saved',
        waitTargetMs: 15000,
      },

      // 10 · 恭喜（真实保存成功后，Eira 趴在卡片上沿）
      {
        key: 'congrats', center: true, eira: true,
        title: '恭喜你开启了衣见的第一套搭配',
        buttons: [
          { label: '去衣橱看看', kind: 'primary', onClick: function () { goUploadStep(); } },
        ],
      },

      // 11 · 衣橱上传（气泡 + 动态点击指引）
      // 未登录时：拦截对上传按钮的点击，不让 App 直接弹出真实注册/登录表单，
      // 改为先进入下一步的「登录提示卡」，保证顺序：上传气泡 → 登录提示卡 → 真实表单。
      {
        key: 'upload', target: T.wardrobeUpload, place: 'below', radius: 14, cue: true,
        title: '来传你的第一件衣服吧～',
        onEnter: function () { closeTopSheet(); goWardrobe(); },
        waitTargetMs: 8000,
        interceptClick: [{
          match: '.page .section-head button.primary',
          when: function () { return !isLoggedIn(); },
          run: function () { goToKey('login'); },
        }],
        buttons: [nextLink('知道啦 ›')],
      },

      // 12 · 未登录：去注册 / 登录（Eira 趴在卡片上沿；已登录自动跳过 → 结束）
      {
        key: 'login', center: true, eira: true,
        skipIf: function () { return isLoggedIn(); },
        onEnter: function () { closeTopSheet(); },
        title: '解锁你的专属衣橱',
        buttons: [
          { label: '去注册 / 登录', kind: 'primary', onClick: function () {
            finish(true);
            setTimeout(function () { var b = T.profileBtn(); if (b) b.click(); }, 240);
          } },
          { label: '稍后再说 ›', kind: 'text', onClick: function () { finish(true); } },
        ],
      },
    ];
  }

  /* ---------------- 灵感库首次引导 ---------------- */
  function buildInspSteps() {
    var nextLink = function (label) { return { label: label || '下一步 ›', kind: 'text', onClick: next }; };
    return [
      // 0 · 欢迎（Eira 趴在卡片上沿）
      {
        key: 'insp-welcome', center: true, eira: true,
        title: '来逛逛你的灵感库吧～',
        onEnter: function () { try { if (window.YijianDemo && window.YijianDemo.goInspire) window.YijianDemo.goInspire(); } catch (e) {} },
        buttons: [{ label: '开始', kind: 'primary', onClick: next }],
      },

      // 1 · 顶部保存：复制外部链接一键收藏
      {
        key: 'insp-save', target: T.inspSaveBtn, cueTarget: T.inspSaveBtn, radius: 14, cue: true,
        title: '看到心动搭配？复制链接一键收藏',
        waitTargetMs: 8000,
        buttons: [nextLink('下一步 ›')],
      },

      // 2 · 风格博主推荐：关注博主获取灵感
      {
        key: 'insp-creator', target: T.inspCreatorBtn, cueTarget: T.inspCreatorBtn, radius: 14, cue: true,
        title: '关注风格博主，随时获取灵感',
        waitTargetMs: 8000,
        buttons: [nextLink('知道啦 ›')],
      },

      // 3 · 完成（Eira 趴在卡片上沿，雀跃收尾）
      {
        key: 'insp-done', center: true, eira: true,
        title: '开始收集你的专属灵感吧～',
        buttons: [{ label: '完成', kind: 'primary', onClick: function () { finish(true); } }],
      },
    ];
  }

  /* ---------------- 「重看引导」按钮（已由常驻 Eira 菜单取代，保留隐藏兜底） ---------------- */
  function showReplayBtn() {}
  function hideReplayBtn() { var b = q('.ob-replay'); if (b) b.classList.add('ob-hidden'); }

  /* ---------------- 启动 ---------------- */
  function whenAppReady(cb) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (q('.weather-link') || q('.hero') || q('.stage')) { clearInterval(timer); cb(); }
      else if (tries > 80) { clearInterval(timer); }
    }, 250);
  }

  function boot() {
    // 加载遮罩：尽早出现，等 App 就绪后淡出
    showLoader();
    // 兜底：无论 App 是否就绪，最长 9s 后强制收起加载页，避免卡死白屏
    setTimeout(hideLoader, 9000);

    var params = new URLSearchParams(window.location.search || '');
    var forced = params.get('onboarding') === '1';
    var forcedInsp = params.get('onboarding') === 'inspiration';

    bindTapOnClick();   // 全局点击 → Eira 轻点
    watchLogin();       // 登录成功 → Eira 雀跃
    window.addEventListener('yijian:account-change', resetAutoOpen);

    whenAppReady(function () {
      // App 就绪，收起加载页（略给一点缓冲让首屏稳定）
      setTimeout(hideLoader, 700);
      ensurePersistEira();

      if (forcedInsp) { setTimeout(function () { goInspireThenGuide(); }, 900); }
      else if (forced || shouldAutoOpen()) { setTimeout(function () { start('main'); }, 900); }
      else { setTimeout(showPersistEira, 900); }

    });

    window.YijianOnboarding = {
      start: function () { restartMainGuide(); },
      startInspiration: function () { goInspireThenGuide(); },
      reset: function () { restartMainGuide(); },
      resetInspiration: function () { clearGuideDone('inspiration'); goInspireThenGuide(); },
      resetAll: function () { clearGuideDone('main'); clearGuideDone('inspiration'); resetEngine(); },
      finish: function () { finish(true); },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
