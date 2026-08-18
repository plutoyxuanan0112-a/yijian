/* @jsxRuntime classic */
/* global React */
/* 衣见 · UI 组件层
 * 提供全部页面组件 + Sheet 面板 + 通用组件；挂到 window.YijianUI 供 app.jsx 使用
 */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const S = window.YijianStore;

  // ============== 通用小组件 ==============
  const StatusBar = () => {
    const [t, setT] = useState(fmtTime());
    useEffect(() => {
      const id = setInterval(() => setT(fmtTime()), 20000);
      return () => clearInterval(id);
    }, []);
    return (
      <div className="status">
        <span className="status-time">{t}</span>
        <span className="status-icons">
          <span className="signal">
            <i /><i /><i /><i />
          </span>
          <span className="battery" />
        </span>
      </div>
    );
  };
  function fmtTime() {
    const d = new Date();
    return (
      String(d.getHours()).padStart(2, '0') +
      ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  }

  const Icon = ({ name, size = 20 }) => {
    const s = size;
    const props = {
      width: s,
      height: s,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    };
    switch (name) {
      case 'home':
        return (
          <svg {...props}>
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10v10h14V10" />
          </svg>
        );
      case 'closet':
        return (
          <svg {...props}>
            <path d="M6 8 12 4l6 4" />
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M12 8v12" />
          </svg>
        );
      case 'sparkle':
        return (
          <svg {...props}>
            <path d="M12 4v6M12 14v6M4 12h6M14 12h6" />
            <path d="M7 7l3 3M14 14l3 3M17 7l-3 3M10 14l-3 3" />
          </svg>
        );
      case 'clock':
        return (
          <svg {...props}>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v5l3 2" />
          </svg>
        );
      case 'share':
        return (
          <svg {...props}>
            <path d="M12 3v13" />
            <path d="M8 7l4-4 4 4" />
            <path d="M5 12v7h14v-7" />
          </svg>
        );
      case 'user':
        return (
          <svg {...props}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
          </svg>
        );
      case 'plus':
        return (
          <svg {...props}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        );
      case 'refresh':
        return (
          <svg {...props}>
            <path d="M4 12a8 8 0 0 1 14-5" />
            <path d="M18 4v4h-4" />
            <path d="M20 12a8 8 0 0 1-14 5" />
            <path d="M6 20v-4h4" />
          </svg>
        );
      case 'sun':
        return (
          <svg {...props}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
          </svg>
        );
      case 'cloud':
        return (
          <svg {...props}>
            <path d="M7 17a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 1 8H7Z" />
          </svg>
        );
      case 'rain':
        return (
          <svg {...props}>
            <path d="M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9-1 4 4 0 0 1 1 8" />
            <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" />
          </svg>
        );
      case 'link':
        return (
          <svg {...props}>
            <path d="M10 14l4-4" />
            <path d="M8 12L5 15a3 3 0 1 0 4 4l3-3" />
            <path d="M16 12l3-3a3 3 0 1 0-4-4l-3 3" />
          </svg>
        );
      case 'trash':
        return (
          <svg {...props}>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        );
      case 'edit':
        return (
          <svg {...props}>
            <path d="M4 20l4-1 11-11-3-3L5 16l-1 4Z" />
          </svg>
        );
      case 'download':
        return (
          <svg {...props}>
            <path d="M12 4v11" />
            <path d="M7 11l5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        );
      case 'copy':
        return (
          <svg {...props}>
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        );
      case 'check':
        return (
          <svg {...props}>
            <path d="M4 12l5 5L20 6" />
          </svg>
        );
      case 'chevron':
        return (
          <svg {...props}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        );
      case 'star':
        return (
          <svg {...props}>
            <path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14l-5-4.5 6.5-.5L12 3Z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // 天气图标：根据 weatherLabel 选择
  const WeatherIcon = ({ weather }) => {
    if (!weather) return <Icon name="sun" size={22} />;
    const t = weather.weatherLabel || '';
    if (t.includes('雨') || t.includes('雷'))
      return <Icon name="rain" size={22} />;
    if (t.includes('云') || t.includes('阴') || t.includes('雾'))
      return <Icon name="cloud" size={22} />;
    return <Icon name="sun" size={22} />;
  };

  // 自定义 Select（避免原生 select 弹层）
  const Select = ({ value, options, onChange, label }) => {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    useEffect(() => {
      const close = (e) => {
        if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }, []);
    return (
      <div
        className={'select-wrap ' + (open ? 'open' : '')}
        ref={wrap}
      >
        <button
          type="button"
          className="select-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          <span>{value || label}</span>
        </button>
        {open && (
          <div className="select-panel" role="listbox">
            {options.map((o) => (
              <button
                key={o}
                role="option"
                aria-selected={o === value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(o);
                  setOpen(false);
                }}
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Toast = ({ text }) =>
    text ? <div className="toast">{text}</div> : null;

  const WheelColumn = ({ items, value, onChange, formatLabel }) => {
    const ref = useRef(null);
    const ITEM_H = 40;
    const idx = Math.max(0, items.indexOf(value));
    useEffect(() => {
      if (ref.current) ref.current.scrollTop = idx * ITEM_H;
    }, [idx]);
    const onScroll = () => {
      if (!ref.current) return;
      const i = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.min(items.length - 1, Math.max(0, i));
      if (items[clamped] !== value) onChange(items[clamped]);
    };
    return (
      <div className="wheel-col">
        <div className="wheel-highlight" />
        <div className="wheel-scroll" ref={ref} onScroll={onScroll}>
          <div className="wheel-pad" />
          {items.map((it) => (
            <button
              type="button"
              key={it}
              className={'wheel-item' + (it === value ? ' active' : '')}
              onClick={() => {
                if (ref.current) ref.current.scrollTop = items.indexOf(it) * ITEM_H;
                onChange(it);
              }}
            >
              {formatLabel ? formatLabel(it) : it}
            </button>
          ))}
          <div className="wheel-pad" />
        </div>
      </div>
    );
  };

  const YearMonthWheel = ({ year, month, minYear, maxYear, onConfirm, onClose }) => {
    const years = useMemo(() => {
      const arr = [];
      for (let y = minYear; y <= maxYear; y += 1) arr.push(y);
      return arr;
    }, [minYear, maxYear]);
    const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
    const [tempYear, setTempYear] = useState(year);
    const [tempMonth, setTempMonth] = useState(month);
    const [yearQuery, setYearQuery] = useState('');
    const jumpYear = (raw) => {
      setYearQuery(raw);
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= minYear && n <= maxYear) setTempYear(n);
    };
    return (
      <div className="wheel-sheet-mask" onClick={onClose}>
        <div className="wheel-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="wheel-sheet-head">
            <button type="button" className="wheel-cancel" onClick={onClose}>取消</button>
            <span className="wheel-title">选择年月</span>
            <button
              type="button"
              className="wheel-done"
              onClick={() => onConfirm(tempYear, tempMonth)}
            >
              完成
            </button>
          </div>
          <div className="wheel-search">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              placeholder="输入年份跳转，如 2024"
              value={yearQuery}
              onChange={(e) => jumpYear(e.target.value)}
            />
          </div>
          <div className="wheel-body">
            <WheelColumn
              items={years}
              value={tempYear}
              onChange={setTempYear}
              formatLabel={(y) => y + ' 年'}
            />
            <WheelColumn
              items={months}
              value={tempMonth}
              onChange={setTempMonth}
              formatLabel={(m) => m + 1 + ' 月'}
            />
          </div>
        </div>
      </div>
    );
  };

  const EmptyState = ({ title, tip, big, action }) => (
    <div className="empty">
      {big && <div className="big">{big}</div>}
      <h3>{title}</h3>
      <p className="tiny mt-2">{tip}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );

  // 单品卡片
  // v12：不再在卡片右上角显示删除叉；用户必须点击卡片进入 ItemDetailSheet 后再操作删除/编辑，
  // 避免手滑误删。onDelete prop 保留是为向后兼容传入，但不再渲染。
  const ItemCard = ({ item, onClick, isDemo }) => {
    const bg = item.image;
    return (
      <div className="item-card" onClick={onClick}>
        <div className="item-photo">
          {bg ? (
            <img alt={item.name} src={bg} />
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: 22 }}>◐</span>
          )}
          {isDemo && <span className="item-demo-tag">示例</span>}
        </div>
        <div className="item-name" title={item.name}>
          {item.name}
        </div>
        <div className="item-tag">
          {item.category}
          {item.color ? ' · ' + item.color : ''}
        </div>
      </div>
    );
  };

  // Flat-lay 效果图：给出 selected_items（含 image / category）
  const Flatlay = ({ picks, title, meta, footer, forwardRef, onReplace }) => {
    const byCat = useMemo(() => {
      const map = { top: null, bottom: null, shoes: null, outer: null, bag: null };
      picks.forEach((p) => {
        if (!map.top && p.category === '上衣') map.top = p;
        else if (
          !map.bottom &&
          (p.category === '下装' ||
            p.category === '裙装' ||
            p.category === '连体')
        )
          map.bottom = p;
        else if (!map.shoes && p.category === '鞋履') map.shoes = p;
        else if (!map.outer && p.category === '外套') map.outer = p;
        else if (
          !map.bag &&
          (p.category === '包袋' || p.category === '配饰')
        )
          map.bag = p;
      });
      return map;
    }, [picks]);

    const cell = (slotClass, item, hint) => (
      <div className={'slot ' + slotClass}>
        {item ? (
          <>
            <img src={item.image} alt={item.name} />
            <div className="slot-label">
              <strong>{item.name}</strong>
            </div>
            {onReplace && (
              <button
                type="button"
                aria-label={'替换' + (item.category || '单品')}
                title="换这件"
                onClick={(e) => {
                  e.stopPropagation();
                  onReplace(item);
                }}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: 'none',
                  background: '#efeaff',
                  color: '#5b4bdb',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(91,75,219,.2)',
                  padding: 0,
                  zIndex: 2,
                }}
              >
                <Icon name="refresh" size={14} />
              </button>
            )}
          </>
        ) : (
          <span className="empty-slot">{hint}</span>
        )}
      </div>
    );

    return (
      <div className="look-art" ref={forwardRef}>
        {(title || meta) && (
          <div style={{ marginBottom: 10 }}>
            {title && (
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', letterSpacing: '-.01em' }}>
                {title}
              </div>
            )}
            {meta && (
              <div className="tiny mt-2" style={{ marginTop: 2 }}>
                {meta}
              </div>
            )}
          </div>
        )}
        <div className="flatlay">
          {cell('top', byCat.top, '上衣')}
          {cell('bottom-item', byCat.bottom, '下装/裙装')}
          {cell('shoes', byCat.shoes, '鞋履')}
          {cell('outer', byCat.outer, '外套')}
          {(byCat.bag || picks.length > 4) &&
            cell('bag', byCat.bag, '包袋/配饰')}
        </div>
        {footer && (
          <div className="tiny mt-3" style={{ color: 'var(--muted)', fontSize: 11 }}>
            {footer}
          </div>
        )}
      </div>
    );
  };

  // ============== Home Page ==============
  const HomePage = ({
    style,
    scene,
    setStyle,
    setScene,
    weather,
    onFetchWeather,
    geoStatus,
    geoLocating,
    wardrobe,
    onGenerate,
    generating,
    outfit,
    recentRecords,
    creators,
    onOpenCreator,
    onOpenCreatorsAll,
    onNav,
    onClickItem,
  }) => {
    const today = new Date();
    const dateStr =
      today.getFullYear() +
      '年' +
      (today.getMonth() + 1) +
      '月' +
      today.getDate() +
      '日 · 周' +
      '日一二三四五六'[today.getDay()];

    return (
      <div className="page">
        <div className="sub">{dateStr}</div>
        <h1 className="h1-hero">今天穿什么？</h1>

        <div className="hero">
          <div className="select-row">
            <Select
              value={style}
              options={S.STYLE_TAGS}
              onChange={setStyle}
              label="风格"
            />
            <Select
              value={scene}
              options={S.SCENE_TAGS}
              onChange={setScene}
              label="场景"
            />
          </div>

          <button
            className="weather-link mt-3"
            onClick={onFetchWeather}
            disabled={geoLocating}
          >
            <span className="icon">
              {geoLocating ? (
                <span className="geo-spinner" aria-label="定位中" />
              ) : (
                <WeatherIcon weather={weather} />
              )}
            </span>
            {!geoLocating && weather && weather.isFallback && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: '#c2410c',
                  background: '#fff1e6',
                  borderRadius: 6,
                  padding: '1px 6px',
                  alignSelf: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                默认天气
              </span>
            )}
            <span className="col">
              {geoLocating ? (
                <>
                  <strong>正在获取真实定位…</strong>
                  <span className="meta">
                    请在浏览器弹窗中允许定位权限
                  </span>
                </>
              ) : weather && !weather.isFallback ? (
                <>
                  <strong>
                    {weather.temperature}°C · {weather.weatherLabel}
                  </strong>
                  <span className="meta">
                    {weather.city || '当前位置'} ·{' '}
                    {weather.warmthNeed}
                    {weather.precipitation > 0 ? ' · 有降水' : ''}
                    {weather.accuracy
                      ? ' · 精度 ' + weather.accuracy + 'm'
                      : ''}
                  </span>
                </>
              ) : geoStatus === 'denied' ? (
                <>
                  <strong>已拒绝定位权限</strong>
                  <span className="meta">
                    在浏览器设置里恢复权限后可再试；此刻使用默认天气
                  </span>
                </>
              ) : geoStatus === 'no_support' ? (
                <>
                  <strong>当前浏览器不支持定位</strong>
                  <span className="meta">使用默认天气 22°C · 晴</span>
                </>
              ) : geoStatus === 'insecure' ? (
                <>
                  <strong>浏览器已屏蔽定位</strong>
                  <span className="meta">
                    你现在是 file:// 打开的，请用「启动衣见.command」
                  </span>
                </>
              ) : geoStatus === 'error' ||
                geoStatus === 'timeout' ||
                geoStatus === 'unavailable' ||
                geoStatus === 'weather_error' ? (
                <>
                  <strong>
                    {weather ? weather.temperature + '°C · ' + weather.weatherLabel : '定位失败'}
                  </strong>
                  <span className="meta">
                    定位失败，显示默认天气 · 可点击重试
                  </span>
                </>
              ) : (
                <>
                  <strong>获取当地天气</strong>
                  <span className="meta">点击允许定位，显示实时温度</span>
                </>
              )}
            </span>
            <em>
              {geoLocating
                ? '定位中…'
                : weather && !weather.isFallback
                ? '刷新 ›'
                : geoStatus === 'denied'
                ? '再试 ›'
                : '允许定位 ›'}
            </em>
          </button>

          <button
            className="primary mt-3"
            style={{ width: '100%' }}
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? '生成中…' : '生成今日穿搭'}
          </button>
        </div>

        {outfit && !outfit.missing_piece && (
          <div className="look-card">
            <Flatlay
              picks={outfit.selected_items || []}
              meta={
                weather
                  ? weather.temperature +
                    '°C · ' +
                    weather.weatherLabel +
                    ' · ' +
                    style +
                    ' / ' +
                    scene
                  : style + ' / ' + scene
              }
              footer={
                outfit._source === 'backend-ai'
                  ? '智能推荐 · 从你的真实衣橱挑选'
                  : outfit._source === 'local-fallback'
                  ? '智能推荐 · 从你的真实衣橱挑选'
                  : '为你从衣橱挑选'
              }
            />
            {(outfit.summary || outfit.color_reason || outfit.style_reason) && (
              <p
                className="look-card-summary"
                style={{ margin: '10px 2px 0', fontSize: 13, lineHeight: 1.6, color: '#4b4b57' }}
              >
                {String(outfit.summary || outfit.color_reason || outfit.style_reason || '')
                  .replace(/选择\s*id\s*[=:：]?\s*\d+/gi, '')
                  .replace(/id\s*[=:：]?\s*\d+/gi, '')
                  .replace(/\[\d+\]/g, '')
                  .replace(/[（(]\s*[）)]/g, '')
                  .replace(/\s+/g, ' ')
                  .replace(/\s+([，。、；：！？])/g, '$1')
                  .trim()
                  .slice(0, 60)}
              </p>
            )}
            <div className="outfit-action">
              <button className="outline" onClick={onGenerate}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="refresh" size={14} /> 换一套
                </span>
              </button>
              <button
                className="primary"
                onClick={() => window.dispatchEvent(new Event('yijian:open-detail'))}
              >
                保存
              </button>
            </div>
          </div>
        )}

        {outfit && outfit.missing_piece && (
          <EmptyState
            big="◐"
            title="衣橱还不够完整"
            tip={outfit.missing_piece}
            action={
              <button
                className="outline"
                onClick={() => onNav('wardrobe')}
              >
                去衣橱上传
              </button>
            }
          />
        )}

        <div className="section-head">
          <h2>我的衣橱</h2>
          <button className="link" onClick={() => onNav('wardrobe')}>
            查看全部 ›
          </button>
        </div>
        {wardrobe.length === 0 ? (
          <EmptyState
            big="◐"
            title="你的衣橱还是空的"
            tip="先上传一件真实衣服，会自动识别并加入衣橱。"
            action={
              <button
                className="primary"
                onClick={() => onNav('wardrobe')}
              >
                去上传第一件
              </button>
            }
          />
        ) : (
          <div className="wardrobe-grid grid-4">
            {wardrobe.slice(0, 4).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onClick={() => onClickItem && onClickItem(item)}
              />
            ))}
          </div>
        )}

        <div className="section-head">
          <h2>为你推荐博主</h2>
          <button className="link" onClick={onOpenCreatorsAll}>
            查看更多 ›
          </button>
        </div>
        <div>
          {creators.slice(0, 2).map((c) => (
            <div key={c.id} className="creator-card">
              <div className="creator-avatar">{c.avatar}</div>
              <div className="creator-body">
                <div className="creator-name-row">
                  <strong>{c.name}</strong>
                  <CreatorLinkBadge creator={c} />
                </div>
                <div className="meta">
                  {c.platform}
                  {c.handle ? ' · ' + c.handle : ''} ·{' '}
                  {c.styleTags.slice(0, 2).join(' / ')}
                </div>
                <div className="desc">{c.description}</div>
                {c.fallbackNote && (
                  <div className="creator-fallback-note">
                    ⚠ {c.fallbackNote}
                  </div>
                )}
              </div>
              <button className="save-pill" onClick={() => onOpenCreator(c)}>
                去看看
              </button>
            </div>
          ))}
        </div>

        <div className="section-head">
          <h2>最近的穿搭</h2>
          <button className="link" onClick={() => onNav('records')}>
            全部日记 ›
          </button>
        </div>
        {recentRecords.length === 0 ? (
          <div className="tiny center" style={{ padding: 12 }}>
            还没有保存的穿搭日记。生成一套并保存，就能在这里看到。
          </div>
        ) : (
          <>
            {recentRecords.slice(0, 2).map((r) => (
              <MiniRecord key={r.id} record={r} />
            ))}
            {recentRecords.length > 2 && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <button className="outline" onClick={() => onNav('records')}>
                  查看更多
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const MiniRecord = ({ record, onClick, onDelete }) => {
    const picks = record.outfit?.selected_items || [];
    return (
      <div className="record-card" onClick={onClick}>
        <div className="record-thumb">
          <div className="mini-grid">
            {picks.slice(0, 4).map((p, i) => (
              <img key={i} src={p.image} alt={p.name} />
            ))}
          </div>
        </div>
        <div className="record-body">
          <strong>
            {record.date} · {record.scene}
          </strong>
          <p>
            {picks.map((p) => p.name).join(' · ') || '空搭配'}
          </p>
          <p className="tiny">
            {record.style} ·{' '}
            {record.weather
              ? record.weather.temperature +
                '°C · ' +
                record.weather.weatherLabel
              : '未记录天气'}
          </p>
        </div>
        {onDelete && (
          <button
            className="record-more"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(record);
            }}
          >
            删除
          </button>
        )}
      </div>
    );
  };

  // ============== Wardrobe Page ==============
  const WardrobePage = ({
    wardrobe,
    onOpenUpload,
    onDeleteItem,
    onClickItem,
  }) => {
    const [cat, setCat] = useState('全部');
    const cats = ['全部', ...S.CATEGORIES];
    const filtered =
      cat === '全部'
        ? wardrobe
        : wardrobe.filter((x) => x.category === cat);
    return (
      <div className="page">
        <div className="sub">
          共 {wardrobe.length} 件真实上传单品
        </div>
        <h1 className="h1-hero">我的衣橱</h1>

        <div className="section-head" style={{ marginTop: 12 }}>
          <h2>全部单品</h2>
          <button
            className="primary"
            style={{ padding: '9px 14px', fontSize: 12 }}
            onClick={onOpenUpload}
          >
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="plus" size={14} /> 上传
            </span>
          </button>
        </div>

        <div className="tabs">
          {cats.map((c) => (
            <button
              key={c}
              className={'tab ' + (c === cat ? 'selected' : '')}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            big="◐"
            title={
              wardrobe.length === 0
                ? '你的衣橱还是空的'
                : '这个分类还没单品'
            }
            tip={
              wardrobe.length === 0
                ? '先上传一件真实衣服，会自动识别并归类。'
                : '试试上传一件，或切换到其他分类。'
            }
            action={
              <button className="primary" onClick={onOpenUpload}>
                上传一件
              </button>
            }
          />
        ) : (
          <div className="wardrobe-grid">
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onDelete={onDeleteItem}
                onClick={() => onClickItem && onClickItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ============== Inspire Page ==============
  const InspirePage = ({
    creators,
    links,
    onOpenSaveLink,
    onOpenCreator,
    onOpenCreatorsAll,
    onDeleteLink,
    onRenameLink,
    onCopyLink,
  }) => {
    const pressTimer = useRef(null);
    const [renamingLink, setRenamingLink] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const openRename = (link) => {
      clearPressTimer();
      setRenamingLink(link);
      setRenameValue(link?.title || '');
    };
    const submitRename = () => {
      if (!renamingLink) return;
      const ok = onRenameLink && onRenameLink(renamingLink, renameValue);
      if (ok) {
        setRenamingLink(null);
        setRenameValue('');
      }
    };
    const clearPressTimer = () => {
      if (pressTimer.current) {
        window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    };
    const startLongPress = (link) => {
      clearPressTimer();
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        openRename(link);
      }, 560);
    };

    return (
    <div className="page">
      <div className="sub">留下每一个让你心动的搭配</div>
      <h1 className="h1-hero">灵感与收藏</h1>

      <div className="hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
              从外部平台保存
            </div>
            <div className="tiny mt-2" style={{ marginTop: 4 }}>
              复制小红书 / 抖音 / 淘宝链接，一键存进灵感库
            </div>
          </div>
          <button className="primary" onClick={onOpenSaveLink}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="plus" size={14} /> 保存
            </span>
          </button>
        </div>
      </div>

      <div className="section-head">
        <h2>风格博主推荐</h2>
        <button className="link" onClick={onOpenCreatorsAll}>
          查看全部博主 ›
        </button>
      </div>
      {creators.slice(0, 3).map((c) => (
        <div key={c.id} className="creator-card">
          <div className="creator-avatar">{c.avatar}</div>
          <div className="creator-body">
            <div className="creator-name-row">
              <strong>{c.name}</strong>
              <CreatorLinkBadge creator={c} />
            </div>
            <div className="meta">
              {c.platform}
              {c.handle ? ' · ' + c.handle : ''} ·{' '}
              {c.styleTags.join(' / ')}
            </div>
            <div className="desc">{c.description}</div>
            {c.fallbackNote && (
              <div className="creator-fallback-note">
                ⚠ {c.fallbackNote}
              </div>
            )}
          </div>
          <button className="save-pill" onClick={() => onOpenCreator(c)}>
            去看看
          </button>
        </div>
      ))}

      <div className="section-head">
        <h2>我的Pick</h2>
        <span className="tiny">{links.length} 条</span>
      </div>
      {links.length === 0 ? (
        <EmptyState
          big="✦"
          title="还没有保存的灵感"
          tip="看到喜欢的小红书 / 抖音 / 淘宝内容，粘贴链接进来。"
        />
      ) : (
        links
          .slice()
          .reverse()
          .map((l) => (
            <div
              key={l.id}
              className="link-card"
              onContextMenu={(e) => {
                e.preventDefault();
                openRename(l);
              }}
              onTouchStart={() => startLongPress(l)}
              onTouchMove={clearPressTimer}
              onTouchEnd={clearPressTimer}
              onTouchCancel={clearPressTimer}
            >
              <strong>{l.title}</strong>
              <span className="url">{l.url}</span>
              {l.note && <div className="note">{l.note}</div>}
              {l.tags?.length > 0 && (
                <div className="link-tags">
                  {l.tags.map((t) => (
                    <span key={t} className="link-tag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              <div className="link-card-row">
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="icon-btn"
                    onClick={() => onCopyLink(l)}
                    aria-label="复制链接"
                  >
                    <Icon name="copy" size={14} />
                  </button>
                  <a
                    className="icon-btn"
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    aria-label="打开链接"
                  >
                    <Icon name="link" size={14} />
                  </a>
                </div>
                <button
                  className="tiny"
                  style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 10 }}
                  onClick={() => openRename(l)}
                >
                  重命名
                </button>
                <button
                  className="tiny"
                  style={{ color: '#a04b60', fontWeight: 600 }}
                  onClick={() => onDeleteLink(l)}
                >
                  删除
                </button>
              </div>
            </div>
          ))
      )}

      {renamingLink && (
        <div className="modal-mask" onClick={() => setRenamingLink(null)}>
          <div className="rename-popover" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">重命名灵感</div>
            <input
              className="input"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setRenamingLink(null);
              }}
              placeholder="例如：春日通勤配色"
            />
            <div className="rename-actions">
              <button className="ghost" onClick={() => setRenamingLink(null)}>
                取消
              </button>
              <button className="primary" onClick={submitRename}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  // ============== Records Page ==============
  const RecordsPage = ({ records, onDelete, onOpen }) => {
    const stats = useMemo(() => S.statsOfRecords(records), [records]);
    const today = new Date();
    const initialKey = records.length ? normalizeRecordDate(records[records.length - 1]) : formatDateKey(today);
    const initialMonth = safeDateFromKey(initialKey, today);
    const [cursor, setCursor] = useState({
      year: initialMonth.getFullYear(),
      month: initialMonth.getMonth(),
    });
    const [selectedDate, setSelectedDate] = useState(() => {
      if (!records.length) return formatDateKey(today);
      const last = records[records.length - 1];
      return normalizeRecordDate(last);
    });
    const [pickerOpen, setPickerOpen] = useState(false);

    const recordsByDate = useMemo(() => {
      const map = {};
      records.forEach((r) => {
        const key = normalizeRecordDate(r);
        if (!map[key]) map[key] = [];
        map[key].push(r);
      });
      Object.keys(map).forEach((key) => {
        map[key].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      });
      return map;
    }, [records]);

    const monthCells = useMemo(
      () => buildCalendarMonth(cursor.year, cursor.month),
      [cursor.year, cursor.month],
    );
    const selectedRecords = recordsByDate[selectedDate] || [];
    const monthRecordCount = monthCells.reduce(
      (sum, d) => sum + (d.inMonth ? (recordsByDate[d.key] || []).length : 0),
      0,
    );
    const yearOptions = buildRecordYears(records, today.getFullYear());
    const monthSummary = useMemo(
      () => summarizeRecords(records.filter((r) => {
        const d = new Date(normalizeRecordDate(r) + 'T00:00:00');
        return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
      })),
      [records, cursor.year, cursor.month],
    );
    const yearSummary = useMemo(
      () => summarizeRecords(records.filter((r) => new Date(normalizeRecordDate(r) + 'T00:00:00').getFullYear() === cursor.year)),
      [records, cursor.year],
    );

    const moveMonth = (step) => {
      const next = new Date(cursor.year, cursor.month + step, 1);
      setCursor({ year: next.getFullYear(), month: next.getMonth() });
    };
    const jumpToToday = () => {
      const key = formatDateKey(today);
      setCursor({ year: today.getFullYear(), month: today.getMonth() });
      setSelectedDate(key);
    };

    return (
      <div className="page records-calendar-page">
        <div className="calendar-hero">
          <div>
            <div className="eyebrow">Wardrobe Journal</div>
            <h1 className="h1-hero">穿搭日记</h1>
          </div>
          <button className="calendar-today" onClick={jumpToToday}>今天</button>
        </div>

        <div className="calendar-summary-card">
          <div>
            <span className="calendar-summary-num">{stats.count}</span>
            <span className="calendar-summary-unit">套记录</span>
          </div>
          <div className="calendar-summary-text">
            {stats.topStyle ? '最常出现：' + stats.topStyle : '从第一套保存开始，衣橱会慢慢长出自己的节奏。'}
          </div>
        </div>

        <div className="calendar-card">
          <div className="calendar-toolbar">
            <button className="calendar-nav" onClick={() => moveMonth(-1)} aria-label="上个月">‹</button>
            <button
              className="calendar-title-picker"
              onClick={() => setPickerOpen((v) => !v)}
              aria-expanded={pickerOpen}
            >
              <div className="calendar-month-title">{cursor.year} 年 {cursor.month + 1} 月</div>
              <div className="calendar-month-sub">本月 {monthRecordCount} 套穿搭 · 点这里快速选择</div>
            </button>
            <button className="calendar-nav" onClick={() => moveMonth(1)} aria-label="下个月">›</button>
          </div>

          <div className="calendar-week-row">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="calendar-grid" role="grid">
            {monthCells.map((d) => {
              const dayRecords = recordsByDate[d.key] || [];
              const isSelected = d.key === selectedDate;
              const isToday = d.key === formatDateKey(today);
              return (
                <button
                  key={d.key}
                  className={
                    'calendar-day' +
                    (d.inMonth ? '' : ' muted') +
                    (isSelected ? ' selected' : '') +
                    (isToday ? ' today' : '') +
                    (dayRecords.length ? ' has-record' : '')
                  }
                  onClick={() => {
                    setSelectedDate(d.key);
                    if (!d.inMonth) {
                      const next = new Date(d.key + 'T00:00:00');
                      setCursor({ year: next.getFullYear(), month: next.getMonth() });
                    }
                  }}
                >
                  <span className="calendar-day-num">{d.day}</span>
                </button>
              );
            })}
          </div>
          {pickerOpen && (
            <YearMonthWheel
              year={cursor.year}
              month={cursor.month}
              minYear={Math.min(cursor.year - 15, (yearOptions[yearOptions.length - 1] || cursor.year) - 1)}
              maxYear={Math.max(cursor.year + 5, (yearOptions[0] || cursor.year) + 1)}
              onConfirm={(y, m) => {
                setCursor({ year: y, month: m });
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>

        <div className="diary-summary-grid">
          <DiarySummaryCard title="本月总结" summary={monthSummary} emptyText="这个月还没有穿搭记录" />
          <DiarySummaryCard title="年度总结" summary={yearSummary} emptyText="这一年还没有穿搭记录" />
        </div>

        <div className="day-diary-panel">
          <div className="section-head compact">
            <h2>{formatDiaryDate(selectedDate)}</h2>
            <span className="tiny">{selectedRecords.length ? selectedRecords.length + ' 套' : '未记录'}</span>
          </div>
          {selectedRecords.length === 0 ? (
            <EmptyState
              big="○"
              title="这一天还没有保存穿搭"
              tip="生成并保存一套穿搭后，它会按日期自动落在这里。"
            />
          ) : (
            selectedRecords.map((r) => (
              <MiniRecord
                key={r.id}
                record={r}
                onDelete={onDelete}
                onClick={() => onOpen(r)}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  const DiarySummaryCard = ({ title, summary, emptyText }) => (
    <div className="diary-summary-card">
      <div className="diary-summary-head">
        <h3>{title}</h3>
        <span>{summary.count ? summary.count + ' 套' : '—'}</span>
      </div>
      {summary.count ? (
        <div className="summary-metrics">
          <SummaryMetric label="最多单品" value={summary.topItem || '—'} />
          <SummaryMetric label="最多颜色" value={summary.topColor || '—'} />
          <SummaryMetric label="最多风格" value={summary.topStyle || '—'} />
        </div>
      ) : (
        <p className="summary-empty">{emptyText}</p>
      )}
    </div>
  );

  const SummaryMetric = ({ label, value }) => (
    <div className="summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );

  function summarizeRecords(list) {
    const itemCount = {};
    const colorCount = {};
    const styleCount = {};
    list.forEach((r) => {
      if (r.style) styleCount[r.style] = (styleCount[r.style] || 0) + 1;
      (r.outfit?.selected_items || []).forEach((it) => {
        if (it.name) itemCount[it.name] = (itemCount[it.name] || 0) + 1;
        const color = it.color || (it.colors && it.colors[0]);
        if (color) colorCount[color] = (colorCount[color] || 0) + 1;
      });
    });
    return {
      count: list.length,
      topItem: topEntry(itemCount),
      topColor: topEntry(colorCount),
      topStyle: topEntry(styleCount),
    };
  }
  function topEntry(obj) {
    const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return arr[0] ? arr[0][0] : '';
  }

  function normalizeRecordDate(record) {
    if (record.date && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date;
    const d = new Date(record.createdAt || Date.now());
    return Number.isNaN(d.getTime()) ? formatDateKey(new Date()) : formatDateKey(d);
  }
  function formatDateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const y = safe.getFullYear();
    const m = String(safe.getMonth() + 1).padStart(2, '0');
    const day = String(safe.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function safeDateFromKey(key, fallback) {
    const d = new Date(String(key || '') + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? (fallback || new Date()) : d;
  }
  function buildCalendarMonth(year, month) {
    const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const safeMonth = Number.isFinite(month) ? month : new Date().getMonth();
    const first = new Date(safeYear, safeMonth, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(safeYear, safeMonth, 1 - startOffset);
    return Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        key: formatDateKey(d),
        day: d.getDate(),
        inMonth: d.getMonth() === month,
      };
    });
  }
  function buildRecordYears(records, fallbackYear) {
    const set = new Set([fallbackYear]);
    records.forEach((r) => set.add(new Date(normalizeRecordDate(r) + 'T00:00:00').getFullYear()));
    return Array.from(set).filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
  }
  function formatDiaryDate(key) {
    const d = safeDateFromKey(key, new Date());
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
  }

  // ============== Bottom Nav ==============
  const BottomNav = ({ active, onChange }) => {
    const tabs = [
      { key: 'home', label: '首页', icon: 'home' },
      { key: 'wardrobe', label: '衣橱', icon: 'closet' },
      { key: 'inspire', label: '灵感', icon: 'sparkle' },
      { key: 'records', label: '日记', icon: 'clock' },
    ];
    return (
      <nav className="bottom">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={'nav ' + (active === t.key ? 'active' : '')}
            onClick={() => onChange(t.key)}
          >
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    );
  };

  // ============== Creator Link Badge ==============
  // v15：博主链接均已核验为本人主页，界面不再展示内部说明性徽标，
  // 保留组件作为占位以兼容既有引用。
  const CreatorLinkBadge = () => null;

  // ============== Sheet Wrapper ==============
  const Sheet = ({ title, subtitle, onClose, children, variant }) => (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className={'sheet' + (variant ? ' sheet-' + variant : '')}>
        <div className="sheet-handle" />
        <div className="sheet-title">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          <button className="close-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );

  // ============== Creator Explore Sheet ==============
  // 按风格分组展示全部真实博主，每张卡片直达该博主的 Instagram 个人主页。
  const CreatorExploreSheet = ({ onClose, onOpenCreator }) => {
    const groups = useMemo(() => S.creatorsByCategory(), []);
    const [active, setActive] = useState('全部');
    const categories = useMemo(
      () => ['全部'].concat(groups.map((g) => g.category)),
      [groups],
    );
    const visible = active === '全部' ? groups : groups.filter((g) => g.category === active);

    return (
      <Sheet
        title="发现博主"
        subtitle={'按风格分组，共 ' + S.creatorLibrary.length + ' 位真实公开博主'}
        onClose={onClose}
      >
        <div className="explore-tabs">
          {categories.map((c) => (
            <button
              key={c}
              className={'style-chip' + (active === c ? ' active' : '')}
              onClick={() => setActive(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {visible.map((g) => (
          <div key={g.category} className="explore-group">
            <div className="explore-group-title">
              <h3>{g.category}</h3>
              <span className="tiny">{g.creators.length} 位</span>
            </div>
            <div className="explore-grid">
              {g.creators.map((c) => (
                <div key={c.id} className="explore-card">
                  <div className="explore-avatar">{c.avatar}</div>
                  <div className="explore-body">
                    <div className="creator-name-row">
                      <strong>{c.name}</strong>
                      <CreatorLinkBadge creator={c} />
                    </div>
                    <div className="meta">
                      {c.platform}
                      {c.handle ? ' · ' + c.handle : ''}
                    </div>
                    <div className="tags">
                      {c.styleTags.slice(0, 3).map((t) => (
                        <span key={t} className="tag-mini">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="desc">{c.description}</div>
                    {c.fallbackNote && (
                      <div className="creator-fallback-note">
                        ⚠ {c.fallbackNote}
                      </div>
                    )}
                  </div>
                  <button
                    className="primary explore-open"
                    onClick={() => onOpenCreator(c)}
                  >
                    去看看
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div
          className="tiny"
          style={{ marginTop: 12, color: 'var(--muted)', lineHeight: 1.6 }}
        >
          点击卡片会跳转到该博主自己的公开主页。中国大陆访问 Instagram 需要国际网络环境。
        </div>
      </Sheet>
    );
  };

  // ============== 本地环境提示 Banner ==============
  // 只有当页面通过 file:// 直接从磁盘打开时才显示。
  const LocalHintBanner = () => {
    const [hidden, setHidden] = useState(false);
    if (hidden) return null;
    if (typeof window === 'undefined') return null;
    const proto = window.location && window.location.protocol;
    if (proto !== 'file:') return null;
    return (
      <div className="local-hint">
        <div className="local-hint-body">
          <strong>看起来你是直接双击打开的</strong>
          <p>
            为了让定位和图片处理更稳定，建议从项目里的 <b>「启动衣见.command」</b> 打开。
            <br />
            <br />
            打开后点「允许定位」，衣见就能根据你所在地的天气给出更合适的搭配建议。
          </p>
        </div>
        <button
          className="ghost"
          onClick={() => setHidden(true)}
          aria-label="关闭提示"
        >
          知道了
        </button>
      </div>
    );
  };

  // ============== Item Detail Sheet ==============
  // 点击衣橱单品后弹出的详情卡：完整展示分类/颜色/厚薄/材质/廓形/风格/场景/季节/系统描述/自定义描述，
  // 支持进入编辑态修改任一字段，支持重新上传照片（重新抠图 / 使用原图）
  const ItemDetailSheet = ({ item, onClose, onUpdate, onDelete, onToast }) => {
    const [editing, setEditing] = useState(false);
    // v13：把 item 展开成"多选 + 其他"表单结构
    const buildForm = (it) => ({
      name: it.name || '',
      category: it.category || '上衣',
      colors: it.colors && it.colors.length ? it.colors : (it.color ? [it.color] : []),
      colorOther: it.colorOther || '',
      warmthTags: it.warmthTags && it.warmthTags.length ? it.warmthTags : (it.warmth ? [it.warmth] : []),
      warmthOther: it.warmthOther || '',
      materials: it.materials && it.materials.length ? it.materials : (it.material ? [it.material] : []),
      materialOther: it.materialOther || '',
      silhouettes: it.silhouettes && it.silhouettes.length ? it.silhouettes : (it.silhouette ? [it.silhouette] : []),
      styleTags: it.styleTags || [],
      styleOther: it.styleOther || '',
      sceneTags: it.sceneTags || [],
      sceneOther: it.sceneOther || '',
      seasonTags: it.seasonTags || [],
      seasonOther: it.seasonOther || '',
      fitTags: it.fitTags || [],
      customNotes: it.customNotes || '',
    });
    const [form, setForm] = useState(() => buildForm(item));
    const [original, setOriginal] = useState(item.originalImage || item.image || '');
    const [processed, setProcessed] = useState(item.image || '');
    const [useCutout, setUseCutout] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [reuploading, setReuploading] = useState(false);
    const fileRef = useRef(null);

    // 若外部 item 变化（比如刚保存完），重置本地状态
    useEffect(() => {
      setForm(buildForm(item));
      setOriginal(item.originalImage || item.image || '');
      setProcessed(item.image || '');
      setReuploading(false);
      setEditing(false);
    }, [item.id]); // eslint-disable-line

    const toggleMulti = (key, v) =>
      setForm((f) => {
        const arr = f[key] || [];
        return {
          ...f,
          [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v],
        };
      });

    const chooseFile = () => fileRef.current?.click();
    const onFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        onToast && onToast('请选择图片文件');
        return;
      }
      setProcessing(true);
      try {
        const dataUrl = await S.readFileAsDataURL(file);
        setOriginal(dataUrl);
        const cut = await S.removeBackground(dataUrl);
        setProcessed(cut);
        setUseCutout(true);
        setReuploading(true);
      } catch (err) {
        onToast && onToast('读取图片失败');
      } finally {
        setProcessing(false);
      }
    };

    const submitSave = async () => {
      let image = useCutout && processed ? processed : original;
      let originalImg = original;
      // 仅对本地新选择的图片（data: URL）做压缩；已托管的远程 URL 直接透传。
      // 否则会把透明抠图 PNG 重新编码成带白底的 JPEG，表现为“使用抠图版保存后变原图”。
      if (image && String(image).startsWith('data:')) {
        try {
          const mime = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          image = await S.compressImage(image, 360, 0.7, mime);
        } catch (e) {
          /* 压缩失败也用原始 */
        }
      }
      // 编辑单品不再保留原始大图，避免存储撑爆导致衣橱/分类/删除表现不稳定。
      originalImg = '';
      const patch = {
        name: form.name,
        category: form.category,
        colors: form.colors,
        colorOther: form.colorOther,
        warmthTags: form.warmthTags,
        warmthOther: form.warmthOther,
        materials: form.materials,
        materialOther: form.materialOther,
        silhouettes: form.silhouettes,
        styleTags: form.styleTags,
        styleOther: form.styleOther,
        sceneTags: form.sceneTags,
        sceneOther: form.sceneOther,
        seasonTags: form.seasonTags,
        seasonOther: form.seasonOther,
        fitTags: form.fitTags || [],
        customNotes: form.customNotes || '',
        // 同步 legacy 单值
        color: form.colors[0] || form.colorOther || '',
        warmth: form.warmthTags[0] || form.warmthOther || '',
        material: form.materials[0] || form.materialOther || '',
        silhouette: form.silhouettes[0] || '',
        image,
        originalImage: originalImg,
      };
      onUpdate(item.id, patch);
    };

    const currentImage = useCutout && processed ? processed : original;
    // 用于当前预览的"识别描述"
    const previewItem = editing
      ? {
          ...item,
          ...form,
          // 让 buildSystemDescription 能读到最新
          color: form.colors[0] || form.colorOther || '',
          warmth: form.warmthTags[0] || form.warmthOther || '',
          material: form.materials[0] || form.materialOther || '',
          silhouette: form.silhouettes[0] || '',
        }
      : item;
    const displayDesc = S.buildSystemDescription(previewItem);

    // 展示区聚合字符串
    const joinArr = (arr) => (arr && arr.length ? arr.join(' / ') : '');
    const displayColors = joinArr(S.itemColors(item)) || '未填';
    const displayWarmths = joinArr(S.itemWarmths(item)) || '未填';
    const displayMaterials = joinArr(S.itemMaterials(item));
    const displaySilhouettes = joinArr(S.itemSilhouettes(item));
    const displayStyles = joinArr(S.itemStyles(item)) || '未填';
    const displayScenes = joinArr(S.itemScenes(item)) || '未填';
    const displaySeasons = joinArr(S.itemSeasons(item)) || '未填';

    return (
      <Sheet
        title={editing ? '编辑单品' : item.name}
        subtitle={
          editing
            ? ''
            : item.category +
              (displayColors !== '未填' ? ' · ' + displayColors : '') +
              (displayMaterials ? ' · ' + displayMaterials : '')
        }
        onClose={onClose}
        variant="mid"
      >
        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={onFile}
          style={{ display: 'none' }}
        />
        <div className="item-detail-photo">
          <img src={currentImage} alt={item.name} />
          {processing && <div className="item-detail-processing">抠图中…</div>}
          {reuploading && (
            <span className="item-detail-badge">新照片（未保存）</span>
          )}
        </div>
        {editing && (
          <div className="action-row item-detail-photo-actions">
            <button
              className={'solid-action ' + (useCutout ? 'solid-action--accent' : 'solid-action--quiet')}
              onClick={() => setUseCutout(true)}
              disabled={!processed}
            >
              使用抠图版
            </button>
            <button
              className={'solid-action ' + (!useCutout ? 'solid-action--accent' : 'solid-action--quiet')}
              onClick={() => setUseCutout(false)}
              disabled={!original}
            >
              使用原图
            </button>
            <button className="solid-action solid-action--quiet" onClick={chooseFile}>
              重新上传
            </button>
          </div>
        )}

        {!editing && (
          <>
            <div className="item-detail-desc">
              <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 4 }}>
                系统识别
              </div>
              <div>{displayDesc}</div>
            </div>
            {item.customNotes && (
              <div className="item-detail-desc">
                <div className="tiny" style={{ color: 'var(--muted)', marginBottom: 4 }}>
                  我的补充
                </div>
                <div>{item.customNotes}</div>
              </div>
            )}
            <div className="item-detail-meta">
              <MetaRow label="分类" value={item.category} />
              <MetaRow label="颜色" value={displayColors} />
              <MetaRow label="厚薄" value={displayWarmths} />
              {displayMaterials && <MetaRow label="材质" value={displayMaterials} />}
              {displaySilhouettes && <MetaRow label="廓形" value={displaySilhouettes} />}
              <MetaRow label="风格" value={displayStyles} />
              <MetaRow label="场景" value={displayScenes} />
              <MetaRow label="季节" value={displaySeasons} />
              {item.fitTags && item.fitTags.length > 0 && (
                <MetaRow label="版型" value={item.fitTags.join(' / ')} />
              )}
            </div>
            <div className="action-row item-detail-actions" style={{ marginTop: 14 }}>
              <button
                className="solid-action solid-action--quiet"
                onClick={() => onDelete && onDelete(item)}
              >
                删除
              </button>
              <button
                className="solid-action solid-action--accent"
                onClick={() => setEditing(true)}
              >
                编辑 / 重新上传
              </button>
            </div>
          </>
        )}

        {editing && (
          <>
            <div className="item-detail-edit-content">
              <div className="field">
                <label>衣物名称</label>
                <input
                  className="input"
                  value={form.name || ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            <div className="field">
              <label>分类</label>
              <div className="cat-grid">
                {S.CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={'chip ' + (form.category === c ? 'active' : '')}
                    onClick={() => setForm({ ...form, category: c })}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <MultiChipField
              label="颜色"
              options={S.COLOR_PALETTE}
              values={form.colors}
              otherValue={form.colorOther}
              onToggle={(v) => toggleMulti('colors', v)}
              onOtherChange={(v) => setForm({ ...form, colorOther: v })}
              otherPlaceholder="其他"
            />
            <MultiChipField
              label="厚薄"
              options={S.WARMTH}
              values={form.warmthTags}
              otherValue={form.warmthOther}
              onToggle={(v) => toggleMulti('warmthTags', v)}
              onOtherChange={(v) => setForm({ ...form, warmthOther: v })}
              otherPlaceholder="其他"
            />
            <MultiChipField
              label="材质"
              options={S.MATERIALS}
              values={form.materials}
              otherValue={form.materialOther}
              onToggle={(v) => toggleMulti('materials', v)}
              onOtherChange={(v) => setForm({ ...form, materialOther: v })}
              otherPlaceholder="其他"
            />
            <div className="field">
              <label>廓形</label>
              <div className="chips">
                {S.SILHOUETTES.map((s) => (
                  <button
                    key={s}
                    className={'chip ' + ((form.silhouettes || []).includes(s) ? 'active' : '')}
                    onClick={() => toggleMulti('silhouettes', s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <MultiChipField
              label="风格"
              options={S.STYLE_TAGS}
              values={form.styleTags}
              otherValue={form.styleOther}
              onToggle={(v) => toggleMulti('styleTags', v)}
              onOtherChange={(v) => setForm({ ...form, styleOther: v })}
              otherPlaceholder="其他"
            />
            <MultiChipField
              label="场景"
              options={S.SCENE_TAGS}
              values={form.sceneTags}
              otherValue={form.sceneOther}
              onToggle={(v) => toggleMulti('sceneTags', v)}
              onOtherChange={(v) => setForm({ ...form, sceneOther: v })}
              otherPlaceholder="其他"
            />
            <MultiChipField
              label="季节"
              options={S.SEASON_TAGS}
              values={form.seasonTags}
              otherValue={form.seasonOther}
              onToggle={(v) => toggleMulti('seasonTags', v)}
              onOtherChange={(v) => setForm({ ...form, seasonOther: v })}
              otherPlaceholder="其他"
            />
            <div className="field">
              <label>版型标签</label>
              <div className="chips">
                {S.FIT_TAGS.map((t) => (
                  <button
                    key={t}
                    className={'chip ' + ((form.fitTags || []).includes(t) ? 'active' : '')}
                    onClick={() => toggleMulti('fitTags', t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>我的补充描述</label>
              <textarea
                className="input"
                placeholder=""
                rows={3}
                value={form.customNotes || ''}
                onChange={(e) => setForm({ ...form, customNotes: e.target.value })}
              />
            </div>
            <div className="item-detail-desc" style={{ marginTop: 4 }}>
              <div>{displayDesc}</div>
            </div>
            </div>
            <div className="upload-toolbar upload-toolbar--sticky" style={{ marginTop: 14 }}>
              <button
                className="outline"
                onClick={() => {
                  setForm(buildForm(item));
                  setOriginal(item.originalImage || item.image || '');
                  setProcessed(item.image || '');
                  setReuploading(false);
                  setEditing(false);
                }}
              >
                取消
              </button>
              <button className="primary" onClick={submitSave} disabled={processing}>
                保存修改
              </button>
            </div>
          </>
        )}
      </Sheet>
    );
  };

  const MetaRow = ({ label, value }) => (
    <div className="meta-row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );

  // ============== Upload Sheet ==============
  // v12：表单减负 —— 核心必填只有「名称 + 分类」，颜色/厚薄/风格/场景/季节全部折叠到"更多信息（可选）"里；
  // 补充说明（customNotes）在核心区常驻，用户上传当下就可以写"这件春秋穿 / 妈妈送的 / 起球了"这样的自然语言，
  // 后续 AI 推荐会把这段一起吃进评分。
  // v13：颜色 / 厚薄 / 风格 / 场景 / 季节 / 材质 全部支持多选 + "其他"自由输入。
  // 上传当下即可写「我的补充描述」，供 AI 推荐一起参考。
  const UploadSheet = ({ onClose, onSave }) => {
    const [step, setStep] = useState('pick'); // pick | preview | form
    const [original, setOriginal] = useState('');
    const [processed, setProcessed] = useState('');
    const [useCutout, setUseCutout] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [errorNote, setErrorNote] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const fileRef = useRef(null);
    const [form, setForm] = useState({
      name: '',
      category: '上衣',
      colors: [],
      colorOther: '',
      warmthTags: [],
      warmthOther: '',
      materials: [],
      materialOther: '',
      styleTags: [],
      styleOther: '',
      sceneTags: [],
      sceneOther: '',
      seasonTags: [],
      seasonOther: '',
      customNotes: '',
    });

    const chooseFile = () => fileRef.current?.click();
    const onFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setErrorNote('请选择图片文件');
        return;
      }
      setErrorNote('');
      setProcessing(true);
      try {
        const dataUrl = await S.readFileAsDataURL(file);
        if (S.estimateSize(dataUrl) > 4 * 1024 * 1024) {
          setErrorNote('图片较大，建议换一张更小的图，或稍后处理会较慢');
        }
        setOriginal(dataUrl);
        setStep('preview');
        setProcessing(true);
        const cut = await S.removeBackground(dataUrl);
        setProcessed(cut);
        setProcessing(false);
        setForm((f) => ({
          ...f,
          name: f.name || file.name.replace(/\.[^.]+$/, '') || '新单品',
        }));
      } catch (err) {
        setErrorNote('读取图片失败，请重试');
        setProcessing(false);
      }
    };

    const toggleMulti = (key, v) =>
      setForm((f) => {
        const arr = f[key] || [];
        return {
          ...f,
          [key]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v],
        };
      });

    const submit = () => {
      const image = useCutout && processed ? processed : original;
      onSave({
        ...form,
        // 同步 legacy 单值字段
        color: form.colors[0] || form.colorOther || '',
        warmth: form.warmthTags[0] || form.warmthOther || '',
        material: form.materials[0] || form.materialOther || '',
        image,
        originalImage: original,
      });
    };

    return (
      <Sheet
        title={step === 'form' ? '完善单品信息' : '上传新单品'}
        subtitle={
          step === 'pick'
            ? '选择一张真实衣物照片，将自动抠图'
            : step === 'preview'
            ? '预览抠图效果'
            : ''
        }
        onClose={onClose}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={onFile}
          style={{ display: 'none' }}
        />
        {step === 'pick' && (
          <>
            <div className="upload-preview" onClick={chooseFile}>
              <div className="hint">
                <span className="big">+</span>
                点击选择本地图片
                <div className="tiny mt-2">
                  推荐白色 / 浅色背景，抠图效果最佳
                </div>
              </div>
            </div>
            <button
              className="primary"
              style={{ width: '100%' }}
              onClick={chooseFile}
            >
              选择图片
            </button>
            {errorNote && (
              <div className="tiny center mt-2" style={{ color: '#b56f6f' }}>
                {errorNote}
              </div>
            )}
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="dual-preview">
              <div className="cell">
                <span className="badge">原图</span>
                {original && <img src={original} alt="原图" />}
              </div>
              <div className="cell">
                <span className="badge">
                  {processing ? '抠图中…' : '抠图结果'}
                </span>
                {processing ? (
                  <div className="spinner" />
                ) : (
                  processed && <img src={processed} alt="抠图" />
                )}
              </div>
            </div>
            <div className="upload-toolbar">
              <button
                className={useCutout ? 'primary' : 'outline'}
                onClick={() => setUseCutout(true)}
              >
                使用抠图版
              </button>
              <button
                className={!useCutout ? 'primary' : 'outline'}
                onClick={() => setUseCutout(false)}
              >
                使用原图
              </button>
            </div>
            {errorNote && (
              <div className="tiny center mb-2" style={{ color: '#b56f6f' }}>
                {errorNote}
              </div>
            )}
            <div className="upload-toolbar">
              <button className="outline" onClick={chooseFile}>
                换一张
              </button>
              <button
                className="primary"
                onClick={() => setStep('form')}
                disabled={processing}
              >
                下一步
              </button>
            </div>
          </>
        )}

        {step === 'form' && (
          <>
            <div className="dual-preview" style={{ gridTemplateColumns: '1fr' }}>
              <div className="cell" style={{ aspectRatio: '4/3' }}>
                <img
                  src={useCutout && processed ? processed : original}
                  alt="预览"
                />
              </div>
            </div>
            <div className="field">
              <label>衣物名称</label>
              <input
                className="input"
                placeholder="例如：燕麦色针织衫"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>分类</label>
              <div className="cat-grid">
                {S.CATEGORIES.map((c) => (
                  <button
                    key={c}
                    className={'chip ' + (form.category === c ? 'active' : '')}
                    onClick={() => setForm({ ...form, category: c })}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>补充说明</label>
              <textarea
                className="input"
                placeholder="例如：春秋穿 / 起球了 / 妈妈送的 / 只搭牛仔"
                value={form.customNotes}
                onChange={(e) =>
                  setForm({ ...form, customNotes: e.target.value })
                }
                rows={2}
              />
            </div>

            <button
              className="outline"
              style={{ width: '100%', marginTop: 4 }}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? '收起' : '更多'}
            </button>

            {showAdvanced && (
              <>
                <MultiChipField
                  label="颜色"
                  options={S.COLOR_PALETTE}
                  values={form.colors}
                  otherValue={form.colorOther}
                  onToggle={(v) => toggleMulti('colors', v)}
                  onOtherChange={(v) => setForm({ ...form, colorOther: v })}
                  otherPlaceholder="其他"
                />
                <MultiChipField
                  label="厚薄"
                  options={S.WARMTH}
                  values={form.warmthTags}
                  otherValue={form.warmthOther}
                  onToggle={(v) => toggleMulti('warmthTags', v)}
                  onOtherChange={(v) => setForm({ ...form, warmthOther: v })}
                  otherPlaceholder="其他"
                />
                <MultiChipField
                  label="材质"
                  options={S.MATERIALS}
                  values={form.materials}
                  otherValue={form.materialOther}
                  onToggle={(v) => toggleMulti('materials', v)}
                  onOtherChange={(v) => setForm({ ...form, materialOther: v })}
                  otherPlaceholder="其他"
                />
                <MultiChipField
                  label="风格"
                  options={S.STYLE_TAGS}
                  values={form.styleTags}
                  otherValue={form.styleOther}
                  onToggle={(v) => toggleMulti('styleTags', v)}
                  onOtherChange={(v) => setForm({ ...form, styleOther: v })}
                  otherPlaceholder="其他"
                />
                <MultiChipField
                  label="场景"
                  options={S.SCENE_TAGS}
                  values={form.sceneTags}
                  otherValue={form.sceneOther}
                  onToggle={(v) => toggleMulti('sceneTags', v)}
                  onOtherChange={(v) => setForm({ ...form, sceneOther: v })}
                  otherPlaceholder="其他"
                />
                <MultiChipField
                  label="季节"
                  options={S.SEASON_TAGS}
                  values={form.seasonTags}
                  otherValue={form.seasonOther}
                  onToggle={(v) => toggleMulti('seasonTags', v)}
                  onOtherChange={(v) => setForm({ ...form, seasonOther: v })}
                  otherPlaceholder="其他"
                />
              </>
            )}

            <div className="upload-toolbar">
              <button
                className="outline"
                onClick={() => setStep('preview')}
              >
                上一步
              </button>
              <button className="primary" onClick={submit}>
                保存到衣橱
              </button>
            </div>
          </>
        )}
      </Sheet>
    );
  };

  // 通用「多选 chips + 其他自由输入」组件
  const MultiChipField = ({
    label,
    options,
    values,
    otherValue,
    onToggle,
    onOtherChange,
    otherPlaceholder,
  }) => (
    <div className="field">
      <label>{label}</label>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o}
            className={'chip ' + ((values || []).includes(o) ? 'active' : '')}
            onClick={() => onToggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="multi-other-row">
        <span className="multi-other-k">其他</span>
        <input
          className="input multi-other-input"
          placeholder={otherPlaceholder || '手动输入'}
          value={otherValue || ''}
          onChange={(e) => onOtherChange(e.target.value)}
        />
      </div>
    </div>
  );

  // ============== Save Link Sheet ==============
  const SaveLinkSheet = ({ onClose, onSave, defaultStyle }) => {
    const [url, setUrl] = useState('');
    const [note, setNote] = useState('');
    const [tagInput, setTagInput] = useState(defaultStyle || '');
    const [err, setErr] = useState('');
    const submit = () => {
      const v = url.trim();
      if (!v) {
        setErr('链接不能为空');
        return;
      }
      const tags = tagInput
        .split(/[,，\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      onSave({
        url: v,
        note: note.trim(),
        tags,
        title: S.guessTitleFromUrl(v),
      });
    };
    return (
      <Sheet
        title="保存外部灵感"
        subtitle="小红书 / 抖音 / 淘宝 / 品牌官网都可以"
        onClose={onClose}
      >
        <div className="field">
          <label>链接</label>
          <input
            className="input"
            placeholder="粘贴链接，例如 https://xhslink.com/..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setErr('');
            }}
          />
        </div>
        <div className="field">
          <label>备注</label>
          <textarea
            className="input"
            placeholder="例如：春天通勤配色 / 想找类似的针织"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="field">
          <label>标签</label>
          <input
            className="input"
            placeholder="例如：简约 通勤"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
          />
        </div>
        {err && (
          <div className="tiny mb-2" style={{ color: '#b56f6f' }}>
            {err}
          </div>
        )}
        <button
          className="primary"
          style={{ width: '100%' }}
          onClick={submit}
        >
          保存到灵感库
        </button>
      </Sheet>
    );
  };

  const DeleteConfirmSheet = ({
    title,
    message,
    confirmText,
    cancelText,
    onClose,
    onConfirm,
  }) => (
    <div className="modal-mask" onClick={onClose}>
      <div className="confirm-popover" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-popover-title">{title || '确认删除？'}</div>
        <div className="confirm-popover-message">{message || '删除后将无法恢复。'}</div>
        <div className="confirm-popover-actions">
          <button className="ghost" onClick={onClose}>
            {cancelText || '取消'}
          </button>
          <button className="danger-outline" onClick={onConfirm}>
            {confirmText || '删除'}
          </button>
        </div>
      </div>
    </div>
  );

  // ============== Outfit Detail Sheet ==============
  const OutfitDetailSheet = ({
    outfit,
    weather,
    style,
    scene,
    onClose,
    onReplace,
    onRegenerate,
    onSave,
    saveText,
  }) => {
    const artRef = useRef(null);
    const chipStyle = {
      fontSize: 12,
      color: '#5b4bdb',
      background: '#efeaff',
      borderRadius: 999,
      padding: '3px 10px',
      lineHeight: 1.4,
    };
    if (!outfit) return null;
    if (outfit.missing_piece) {
      return (
        <Sheet title="今日搭配" onClose={onClose}>
          <EmptyState
            big="◐"
            title="无法生成完整搭配"
            tip={outfit.missing_piece}
          />
        </Sheet>
      );
    }

    const downloadCard = async () => {
      // 只导出「搭配单品图」本身，不含任何文字：将各单品图片绘制到画布网格中
      const items = (outfit.selected_items || []).filter((p) => p && p.image);
      if (!items.length) {
        window.dispatchEvent(
          new CustomEvent('yijian:toast', { detail: '暂无单品图片可保存' }),
        );
        return;
      }
      try {
        const size = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, '#ede9fb');
        g.addColorStop(1, '#f8eee8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        const loaded = await Promise.all(
          items.map(
            (p) =>
              new Promise((res) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.onload = () => res(im);
                im.onerror = () => res(null);
                im.src = p.image;
              }),
          ),
        );
        const pics = loaded.filter(Boolean);
        if (!pics.length) throw new Error('图片加载失败');
        const cols = pics.length <= 1 ? 1 : 2;
        const rows = Math.ceil(pics.length / cols);
        const pad = 64;
        const gap = 40;
        const cellW = (size - pad * 2 - gap * (cols - 1)) / cols;
        const cellH = (size - pad * 2 - gap * (rows - 1)) / rows;
        const radius = 28;
        pics.forEach((im, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const cx = pad + c * (cellW + gap);
          const cy = pad + r * (cellH + gap);
          // 单品白色圆角卡片底
          ctx.save();
          ctx.beginPath();
          const rr = radius;
          ctx.moveTo(cx + rr, cy);
          ctx.arcTo(cx + cellW, cy, cx + cellW, cy + cellH, rr);
          ctx.arcTo(cx + cellW, cy + cellH, cx, cy + cellH, rr);
          ctx.arcTo(cx, cy + cellH, cx, cy, rr);
          ctx.arcTo(cx, cy, cx + cellW, cy, rr);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,.72)';
          ctx.fill();
          ctx.clip();
          const inner = 0.86;
          const scale = Math.min((cellW * inner) / im.width, (cellH * inner) / im.height);
          const dw = im.width * scale;
          const dh = im.height * scale;
          const dx = cx + (cellW - dw) / 2;
          const dy = cy + (cellH - dh) / 2;
          ctx.drawImage(im, dx, dy, dw, dh);
          ctx.restore();
        });
        const png = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = png;
        a.download = '衣见-搭配效果图.png';
        a.click();
      } catch (e) {
        window.dispatchEvent(
          new CustomEvent('yijian:toast', {
            detail: '保存图片失败：' + (e.message || '请重试'),
          }),
        );
      }
    };

    return (
      <Sheet
        variant="detail"
        onClose={onClose}
      >
        <Flatlay
          picks={outfit.selected_items || []}
          onReplace={onReplace}
          footer={
            [
              outfit._source === 'backend-ai' || outfit._source === 'local-fallback'
                ? '智能推荐'
                : '为你从衣橱挑选',
              weather && weather.weatherLabel
                ? (weather.temperature != null ? weather.temperature + '°C · ' : '') +
                  weather.weatherLabel
                : null,
              style,
              scene,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          forwardRef={artRef}
        />
        {(outfit.summary || outfit.color_reason || outfit.style_reason) && (
          <p
            className="detail-summary"
            style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: '#4b4b57' }}
          >
            {String(outfit.summary || outfit.color_reason || outfit.style_reason || '')
              .replace(/选择\s*id\s*[=:：]?\s*\d+/gi, '')
              .replace(/id\s*[=:：]?\s*\d+/gi, '')
              .replace(/\[\d+\]/g, '')
              .replace(/[（(]\s*[）)]/g, '')
              .replace(/\s+/g, ' ')
              .replace(/\s+([，。、；：！？])/g, '$1')
              .trim()
              .slice(0, 60)}
          </p>
        )}
        {outfit.avoid && (
          <p
            className="detail-avoid"
            style={{ margin: '0 0 14px', fontSize: 12, color: '#c2410c' }}
          >
            今天不建议：{outfit.avoid}
          </p>
        )}

        <button
          type="button"
          className="link"
          onClick={downloadCard}
          style={{ display: 'block', margin: '0 auto 10px', fontSize: 13 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="download" size={14} /> 保存搭配效果图
          </span>
        </button>
        <div className="outfit-action">
          <button className="outline" onClick={onRegenerate}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="refresh" size={14} /> 换一套
            </span>
          </button>
          <button className="primary" onClick={onSave}>
            {saveText || '保存'}
          </button>
        </div>
      </Sheet>
    );
  };

  // ============== Replace Item Sheet ==============
  const ReplaceSheet = ({ target, wardrobe, onClose, onPick }) => {
    if (!target) return null;
    const cat = target.category;
    const alts = wardrobe.filter((x) => x.category === cat && x.id !== target.id);
    return (
      <Sheet
        title={'替换 ' + cat}
        subtitle={'当前：' + target.name}
        onClose={onClose}
      >
        {alts.length === 0 ? (
          <EmptyState
            big="◐"
            title={'衣橱里还没有其他 ' + cat}
            tip="回到衣橱上传一件，就能在这里替换。"
          />
        ) : (
          <div className="wardrobe-grid">
            {alts.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                onClick={() => onPick(it)}
              />
            ))}
          </div>
        )}
      </Sheet>
    );
  };

  // ============== Record Detail Sheet ==============
  const RecordDetailSheet = ({ record, onClose, onDelete }) => {
    if (!record) return null;
    return (
      <Sheet
        title={record.date + ' 的穿搭'}
        subtitle={
          record.style +
          ' / ' +
          record.scene +
          (record.weather
            ? ' · ' +
              record.weather.temperature +
              '°C · ' +
              record.weather.weatherLabel
            : '')
        }
        onClose={onClose}
      >
        <Flatlay
          picks={record.outfit?.selected_items || []}
          title={record.outfit?.title || '未命名搭配'}
          meta={record.date}
          footer={record.date ? '你的穿搭日记' : ''}
        />
        <div className="reason-list">
          {record.outfit?.style_reason && (
            <div className="reason-row">
              <div className="k">风格</div>
              <div className="v">{record.outfit.style_reason}</div>
            </div>
          )}
          {record.outfit?.weather_reason && (
            <div className="reason-row">
              <div className="k">天气</div>
              <div className="v">{record.outfit.weather_reason}</div>
            </div>
          )}
          {record.outfit?.scene_reason && (
            <div className="reason-row">
              <div className="k">场景</div>
              <div className="v">{record.outfit.scene_reason}</div>
            </div>
          )}
          {record.outfit?.avoid && (
            <div className="reason-row reason-avoid">
              <div className="k">当日避开</div>
              <div className="v">{record.outfit.avoid}</div>
            </div>
          )}
        </div>
        <button
          className="outline"
          style={{ width: '100%', marginTop: 16 }}
          onClick={() => {
            onDelete(record);
            onClose();
          }}
        >
          删除这条日记
        </button>
      </Sheet>
    );
  };

  // ============== Profile Sheet ==============
  const ProfileSheet = ({ profile, onClose, onSave, onToast }) => {
    const isAuthed = profile.authStatus === 'demo_logged_in' && profile.email;

    // ============ 已登录：资料编辑视图 ============
    if (isAuthed) {
      return (
        <ProfileEditView
          profile={profile}
          onClose={onClose}
          onSave={onSave}
          onToast={onToast}
        />
      );
    }
    // ============ 未登录：邮箱注册 / 登录视图 ============
    return (
      <AuthView
        profile={profile}
        onClose={onClose}
        onSave={onSave}
        onToast={onToast}
      />
    );
  };

  // 邮箱注册 / 登录 视图（demo，仅前端）
  const AuthView = ({ profile, onClose, onSave, onToast }) => {
    const [mode, setMode] = useState(profile.passwordHash ? 'login' : 'register');
    const [email, setEmail] = useState(profile.email || '');
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    const applyRemoteAuth = async (remote, fallbackMessage) => {
      // 登录 / 注册成功（token 已由 authLogin/authRegister 写入）后：
      // 先清掉本机上一个账号残留的衣橱 / 日记 / 灵感等本地缓存，再从后端全量同步，
      // 以后端为准，避免同一设备换账号时数据串号。
      S.clearLocalUserData();
      const u = remote.user || {};
      onSave({
        ...profile,
        email: u.email || email.trim(),
        name: u.display_name || profile.name || '衣见的主理人',
        avatar: u.avatar != null ? u.avatar : profile.avatar,
        bio: u.bio != null ? u.bio : profile.bio,
        authStatus: 'demo_logged_in',
        backendUserId: u.id,
      });
      try { await S.syncAllFromBackend(); } catch { /* 同步失败时后端不可达，保持本地为空，不展示旧账号数据 */ }
      onToast && onToast(fallbackMessage);
    };

    const doRegister = async () => {
      if (!S.validateEmail(email)) {
        setErr('邮箱格式不正确');
        return;
      }
      const strength = S.passwordStrength(pw);
      if (!strength.ok) {
        setErr(strength.reason);
        return;
      }
      if (pw !== pw2) {
        setErr('两次输入的密码不一致');
        return;
      }
      try {
        setBusy(true);
        const remote = await S.authRegister(email.trim(), pw, profile.name || '衣见的主理人');
        await applyRemoteAuth(remote, '注册成功');
        return;
      } catch (e) {
        setErr((e && e.message) || '账号服务暂时不可用，请稍后再试');
      } finally {
        setBusy(false);
      }
    };

    const doLogin = async () => {
      if (!S.validateEmail(email)) {
        setErr('邮箱格式不正确');
        return;
      }
      try {
        setBusy(true);
        const remote = await S.authLogin(email.trim(), pw);
        await applyRemoteAuth(remote, '登录成功');
        return;
      } catch (e) {
        setErr((e && e.message) || '登录失败，请检查邮箱和密码');
      } finally {
        setBusy(false);
      }
    };

    return (
      <Sheet
        title={mode === 'register' ? '注册账号' : '登录'}
        subtitle="创建一个账号，开启你的衣见"
        onClose={onClose}
      >
        <div className="auth-tabs">
          <button
            className={'auth-tab ' + (mode === 'login' ? 'active' : '')}
            onClick={() => {
              setMode('login');
              setErr('');
            }}
          >
            登录
          </button>
          <button
            className={'auth-tab ' + (mode === 'register' ? 'active' : '')}
            onClick={() => {
              setMode('register');
              setErr('');
            }}
          >
            新建账号
          </button>
        </div>

        <div className="field">
          <label>邮箱</label>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr('');
            }}
          />
        </div>

        <div className="field">
          <label>密码</label>
          <div className="auth-pw-row">
            <input
              className="input auth-pw-input"
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder={mode === 'register' ? '至少 6 位，建议字母 + 数字' : '输入密码'}
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setErr('');
              }}
            />
            <button
              type="button"
              className="auth-pw-toggle"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? '隐藏密码' : '显示密码'}
            >
              {showPw ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        {mode === 'register' && (
          <div className="field">
            <label>再次输入密码</label>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="再次输入以确认"
              value={pw2}
              onChange={(e) => {
                setPw2(e.target.value);
                setErr('');
              }}
            />
          </div>
        )}

        {err && (
          <div className="tiny form-error" style={{ marginTop: 4 }}>
            {err}
          </div>
        )}

        <button
          className="primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={busy ? undefined : (mode === 'register' ? doRegister : doLogin)}
        >
          {busy ? '提交中…' : (mode === 'register' ? '创建账号' : '登录')}
        </button>
      </Sheet>
    );
  };

  // 已登录：资料编辑（头像 / 用户名 / 简介 / 改密码 / 退出登录）
  const ProfileEditView = ({ profile, onClose, onSave, onToast }) => {
    const [form, setForm] = useState({
      avatar: profile.avatar || '',
      name: profile.name || '',
      email: profile.email || '',
      bio: profile.bio || '',
    });
    const [nameEditing, setNameEditing] = useState(false);
    const [changePwOpen, setChangePwOpen] = useState(false);
    const [revealEmail, setRevealEmail] = useState(false);
    const [confirmLogout, setConfirmLogout] = useState(false);

    const maskEmail = (s) => {
      const email = (s || '').trim();
      if (!email) return '';
      const at = email.indexOf('@');
      if (at <= 1) return email;
      const head = email.slice(0, 2);
      const tail = email.slice(at);
      return head + '***' + tail;
    };

    const EmailEye = ({ off }) => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.5 12c2.3-4.7 6-7 9.5-7s7.2 2.3 9.5 7c-2.3 4.7-6 7-9.5 7s-7.2-2.3-9.5-7z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        {off && (
          <path d="M4 20L20 4" stroke="currentColor" strokeWidth="1.8" />
        )}
      </svg>
    );
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [newPw2, setNewPw2] = useState('');
    const [pwErr, setPwErr] = useState('');

    const fileRef = useRef(null);

    const pickAvatar = () => fileRef.current?.click();
    const onAvatar = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        onToast && onToast('请选择图片文件');
        return;
      }
      try {
        const raw = await S.readFileAsDataURL(file);
        const img = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = raw;
        });
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(img.width, img.height);
        const sx = (img.width - scale) / 2;
        const sy = (img.height - scale) / 2;
        ctx.drawImage(img, sx, sy, scale, scale, 0, 0, size, size);
        const small = canvas.toDataURL('image/jpeg', 0.82);
        setForm((f) => ({ ...f, avatar: small }));
      } catch (err) {
        onToast && onToast('读取头像失败，请重试');
      }
    };

    const changePassword = () => {
      const check = S.demoHashPassword(oldPw, profile.passwordSalt);
      if (check !== profile.passwordHash) {
        setPwErr('原密码不正确');
        return;
      }
      const st = S.passwordStrength(newPw);
      if (!st.ok) {
        setPwErr(st.reason);
        return;
      }
      if (newPw !== newPw2) {
        setPwErr('两次输入的新密码不一致');
        return;
      }
      const salt = S.makeSalt();
      const hash = S.demoHashPassword(newPw, salt);
      onSave({
        ...profile,
        avatar: form.avatar,
        name: (form.name || '').trim() || '衣见的主理人',
        bio: (form.bio || '').trim(),
        passwordHash: hash,
        passwordSalt: salt,
      });
      setOldPw('');
      setNewPw('');
      setNewPw2('');
      setPwErr('');
      setChangePwOpen(false);
      onToast && onToast('密码已更新');
    };

    const saveAll = () => {
      onSave({
        ...profile,
        avatar: form.avatar,
        name: (form.name || '').trim() || '衣见的主理人',
        bio: (form.bio || '').trim(),
      });
    };
    const logout = () => {
      setConfirmLogout(true);
    };

    return (
      <>
      <Sheet
        title="个人资料"
        subtitle=""
        onClose={onClose}
      >
        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={onAvatar}
          style={{ display: 'none' }}
        />

        <div className="profile-hero">
          <button
            type="button"
            className="profile-avatar-btn"
            onClick={pickAvatar}
            aria-label="修改头像"
          >
            {form.avatar ? (
              <img src={form.avatar} alt="头像" />
            ) : (
              <span className="profile-avatar-initial">
                {(form.name || '衣').slice(0, 1)}
              </span>
            )}
            <span className="profile-avatar-edit">
              <Icon name="edit" size={12} />
            </span>
          </button>
          <div className="profile-hero-body">
            <div className="profile-hero-name">
              {form.name || '衣见的主理人'}
            </div>
            <div className="profile-hero-meta profile-email-row">
              <span
                className="profile-email-text"
              >
                {revealEmail ? form.email : maskEmail(form.email)}
              </span>
              <button
                type="button"
                className="profile-email-eye"
                onClick={() => setRevealEmail((v) => !v)}
                aria-label={revealEmail ? '隐藏邮箱' : '显示邮箱'}
              >
                <EmailEye off={!revealEmail} />
              </button>
            </div>
          </div>
        </div>

        {/* 用户名 */}
        <div className="profile-row">
          <div className="profile-row-k">用户名</div>
          {nameEditing ? (
            <input
              className="input profile-row-input"
              autoFocus
              maxLength={20}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => setNameEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setNameEditing(false);
              }}
            />
          ) : (
            <button
              className="profile-row-v"
              onClick={() => setNameEditing(true)}
            >
              <span>{form.name || '未设置'}</span>
              <Icon name="chevron" size={14} />
            </button>
          )}
        </div>

        {/* 邮箱 */}
        <div className="profile-row">
          <div className="profile-row-k">登录邮箱</div>
          <div className="profile-row-v profile-row-v-static profile-email-row">
            <span className="profile-email-text">
              {revealEmail ? form.email : maskEmail(form.email) || '—'}
            </span>
            <button
              type="button"
              className="profile-email-eye"
              onClick={() => setRevealEmail((v) => !v)}
              aria-label={revealEmail ? '隐藏邮箱' : '显示邮箱'}
            >
              <EmailEye off={!revealEmail} />
            </button>
          </div>
        </div>

        {/* 密码 */}
        <div className="profile-row profile-row-multiline">
          <div
            className="profile-row-k"
            style={{ display: 'flex', justifyContent: 'space-between' }}
          >
            <span>密码</span>
            <button
              className="tiny"
              style={{ fontWeight: 600, color: 'var(--primary)' }}
              onClick={() => {
                setChangePwOpen((v) => !v);
                setPwErr('');
              }}
            >
              {changePwOpen ? '收起' : '修改密码'}
            </button>
          </div>
          {changePwOpen && (
            <>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="原密码"
                value={oldPw}
                onChange={(e) => {
                  setOldPw(e.target.value);
                  setPwErr('');
                }}
                style={{ marginTop: 8 }}
              />
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="新密码（≥ 6 位）"
                value={newPw}
                onChange={(e) => {
                  setNewPw(e.target.value);
                  setPwErr('');
                }}
                style={{ marginTop: 6 }}
              />
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="再次输入新密码"
                value={newPw2}
                onChange={(e) => {
                  setNewPw2(e.target.value);
                  setPwErr('');
                }}
                style={{ marginTop: 6 }}
              />
              {pwErr && (
                <div className="tiny form-error">{pwErr}</div>
              )}
              <button
                className="primary"
                style={{ width: '100%', marginTop: 8 }}
                onClick={changePassword}
              >
                更新密码
              </button>
            </>
          )}
        </div>

        {/* 简介 */}
        <div className="profile-row profile-row-multiline">
          <div className="profile-row-k">简介</div>
          <textarea
            className="input"
            maxLength={40}
            placeholder="一句话描述你的穿搭偏好"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            style={{ minHeight: 46, marginTop: 8 }}
          />
        </div>

        <div className="action-row profile-actions">
          <button
            className="solid-action solid-action--accent"
            onClick={saveAll}
          >
            保存
          </button>
          <button
            className="solid-action solid-action--quiet"
            onClick={logout}
          >
            退出登录
          </button>
        </div>
      </Sheet>
      {confirmLogout && (
        <DeleteConfirmSheet
          title="确认退出登录？"
          message="退出后本机会清空当前账号的衣橱和日记展示，重新登录后再从云端读取。"
          confirmText="退出登录"
          cancelText="取消"
          onClose={() => setConfirmLogout(false)}
          onConfirm={() => {
            setConfirmLogout(false);
            onSave({ ...profile, authStatus: 'none', _logout: true });
            onToast && onToast('已退出登录');
          }}
        />
      )}
      </>
    );
  };

  // ============== Share Sheet ==============
  // 分享 App 到微信 / 朋友圈 / QQ / QQ空间 / 微博 / 小红书 / 复制链接 / 系统分享
  const ShareSheet = ({ onClose, onToast }) => {
    const [copied, setCopied] = useState('');
    const shareUrl =
      (typeof window !== 'undefined' && window.location && window.location.href) ||
      'https://yijian.demo';
    const shareTitle = '衣见 · 你的智能衣橱穿搭助手';
    const shareDesc =
      '上传真实衣物，为你搭配今日 look，自动生成平面效果图。';

    const doCopy = async (label) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(
            shareTitle + ' - ' + shareUrl,
          );
        } else {
          const ta = document.createElement('textarea');
          ta.value = shareTitle + ' - ' + shareUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setCopied(label);
        setTimeout(() => setCopied(''), 1400);
        return true;
      } catch (e) {
        return false;
      }
    };

    const doSystemShare = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareDesc,
            url: shareUrl,
          });
          onToast && onToast('已通过系统分享');
        } catch (e) {
          /* user cancelled */
        }
      } else {
        const ok = await doCopy('系统');
        onToast && onToast(ok ? '当前浏览器不支持系统分享，已复制链接' : '当前浏览器不支持分享');
      }
    };

    const platforms = [
      {
        key: 'wechat',
        label: '微信',
        hint: '复制后粘贴给好友',
        color: '#07c160',
        icon: (
          <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor">
            <path d="M12.5 6C6.7 6 2 9.9 2 14.6c0 2.7 1.6 5.2 4.2 6.8-.2.7-.7 2.6-.8 3 0 0 0 .2.1.3.1.1.3 0 .3 0l3.5-2c1 .3 2.1.4 3.2.4h.8c-.2-.7-.3-1.5-.3-2.3 0-4.8 4.7-8.7 10.5-8.7h.7C23.5 8.5 18.5 6 12.5 6zm-4 4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4zm8 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" />
            <path d="M30 20.5c0-4-4-7.2-8.9-7.2-5.1 0-9 3.3-9 7.3 0 4 3.9 7.2 9 7.2.9 0 1.9-.1 2.8-.3l3 1.7s.2.1.3 0c.1-.1.1-.2.1-.3-.1-.4-.5-2-.6-2.6C28.7 25 30 22.9 30 20.5zm-11.6-1.7a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5.6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
          </svg>
        ),
        onClick: async () => {
          const ok = await doCopy('微信');
          onToast &&
            onToast(
              ok
                ? '链接已复制，请打开微信粘贴给好友'
                : '复制失败，请长按选中链接',
            );
        },
      },
      {
        key: 'moments',
        label: '朋友圈',
        hint: '复制后粘贴到朋友圈',
        color: '#5eba7d',
        icon: (
          <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="16" cy="16" r="11" />
            <circle cx="16" cy="16" r="4.5" />
            <path d="M4 16h4M24 16h4M16 4v4M16 24v4" />
          </svg>
        ),
        onClick: async () => {
          const ok = await doCopy('朋友圈');
          onToast &&
            onToast(
              ok
                ? '链接已复制，请打开微信朋友圈粘贴'
                : '复制失败',
            );
        },
      },
      {
        key: 'qq',
        label: 'QQ',
        hint: '直接跳转 QQ 分享',
        color: '#12b7f5',
        icon: (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
          </svg>
        ),
        onClick: () => {
          const url =
            'https://connect.qq.com/widget/shareqq/index.html?url=' +
            encodeURIComponent(shareUrl) +
            '&title=' +
            encodeURIComponent(shareTitle) +
            '&desc=' +
            encodeURIComponent(shareDesc);
          window.open(url, '_blank', 'noopener');
          onToast && onToast('已打开 QQ 分享面板');
        },
      },
      {
        key: 'qzone',
        label: 'QQ 空间',
        hint: '直接跳转 QZone',
        color: '#fbc82f',
        icon: (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M23.9868 9.2012c-.032-.099-.127-.223-.334-.258-.207-.036-7.352-1.4063-7.352-1.4063s-.105-.022-.198-.07c-.092-.047-.127-.167-.127-.167S12.4472.954 12.3491.7679c-.099-.187-.245-.238-.349-.238-.104 0-.251.051-.349.238C11.5531.954 8.0245 7.3 8.0245 7.3s-.035.12-.128.167c-.092.047-.197.07-.197.07S.5546 8.9071.3466 8.9421c-.208.036-.302.16-.333.258a.477.477 0 00.125.4491L5.5013 15.14s.072.08.119.172c.016.104.005.21.005.21s-1.1891 7.243-1.2201 7.451c-.031.208.075.369.159.4301.083.062.233.106.421.013.189-.093 6.813-3.2614 6.813-3.2614s.098-.044.201-.061c.103-.017.201.061.201.061s6.624 3.1684 6.813 3.2614c.188.094.338.049.421-.013a.463.463 0 00.159-.43c-.021-.14-.93-5.6778-.93-5.6778.876-.5401 1.4251-1.0392 1.8492-1.7473-2.5944.9692-6.0069 1.7173-9.4163 1.8663-.9152.041-2.4104.097-3.4735-.015-.6781-.071-1.1702-.144-1.2432-.438-.053-.2151.054-.4601.5451-.8312a2640.8625 2640.8625 0 012.8614-2.1553c1.2852-.9681 3.5595-2.4703 3.5595-2.7314 0-.285-2.1443-.781-4.0376-.781-1.9452 0-2.2753.132-2.8114.168-.488.034-.769.005-.804-.138-.06-.2481.183-.3891.588-.5682.7091-.314 1.8603-.594 1.9843-.626.194-.052 3.0824-.8051 5.6188-.5351 1.3181.14 3.2444.668 3.2444 1.2762 0 .342-1.7212 1.4942-3.2254 2.5973-1.1492.8431-2.2173 1.5612-2.2173 1.6883 0 .342 3.5334 1.2411 6.6899 1.01l.003-.022c.048-.092.119-.172.119-.172l5.3627-5.4907a.477.477 0 00.127-.449z" />
          </svg>
        ),
        onClick: () => {
          const url =
            'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=' +
            encodeURIComponent(shareUrl) +
            '&title=' +
            encodeURIComponent(shareTitle) +
            '&desc=' +
            encodeURIComponent(shareDesc);
          window.open(url, '_blank', 'noopener');
          onToast && onToast('已打开 QQ 空间分享');
        },
      },
      {
        key: 'weibo',
        label: '微博',
        hint: '直接跳转微博发布',
        color: '#e6162d',
        icon: (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.404-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.809-1.338-1.337-4.869.045-7.888 3.08C1.309 10.87 0 13.273 0 15.348c0 3.981 5.099 6.395 10.086 6.395 6.536 0 10.888-3.801 10.888-6.82 0-1.822-1.547-2.854-2.915-3.284v.01zm1.908-5.092c-.766-.856-1.908-1.187-2.96-.962-.436.09-.706.511-.616.932.09.42.511.691.932.602.511-.105 1.067.044 1.442.465.376.421.466.977.316 1.473-.136.406.089.856.51.992.405.119.857-.105.992-.512.33-1.021.12-2.178-.646-3.035l.03.045zm2.418-2.195c-1.576-1.757-3.905-2.419-6.054-1.968-.496.104-.812.587-.706 1.081.104.496.586.813 1.082.707 1.532-.331 3.185.15 4.296 1.383 1.112 1.246 1.429 2.943.947 4.416-.165.48.106 1.007.586 1.157.479.165.991-.104 1.157-.586.675-2.088.241-4.478-1.338-6.235l.03.045z" />
          </svg>
        ),
        onClick: () => {
          const url =
            'https://service.weibo.com/share/share.php?url=' +
            encodeURIComponent(shareUrl) +
            '&title=' +
            encodeURIComponent(shareTitle + ' · ' + shareDesc);
          window.open(url, '_blank', 'noopener');
          onToast && onToast('已打开微博分享');
        },
      },
      {
        key: 'xhs',
        label: '小红书',
        hint: '复制后到小红书发布',
        color: '#ff2442',
        icon: (
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
            <path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z" />
          </svg>
        ),
        onClick: async () => {
          const ok = await doCopy('小红书');
          onToast &&
            onToast(
              ok
                ? '链接已复制，请打开小红书粘贴到笔记'
                : '复制失败，请长按选中链接',
            );
        },
      },
      {
        key: 'copy',
        label: '复制链接',
        hint: '粘到任意 App',
        color: '#7058df',
        icon: (
          <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="11" y="11" width="15" height="15" rx="3" />
            <path d="M21 11V8a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3" />
          </svg>
        ),
        onClick: async () => {
          const ok = await doCopy('链接');
          onToast && onToast(ok ? '链接已复制到剪贴板' : '复制失败');
        },
      },
      {
        key: 'system',
        label: '系统分享',
        hint: '调起系统面板',
        color: '#4a4360',
        icon: (
          <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4v16" />
            <path d="M11 9l5-5 5 5" />
            <path d="M7 16v10h18V16" />
          </svg>
        ),
        onClick: doSystemShare,
      },
    ];

    return (
      <Sheet
        title="转发衣见"
        subtitle="把智能衣橱穿搭助手分享给朋友"
        onClose={onClose}
      >
        <div
          className="glass-strong"
          style={{
            padding: 14,
            borderRadius: 16,
            marginBottom: 14,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background:
                'linear-gradient(135deg,#785ff0,#5c43d0)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Georgia,serif',
              fontStyle: 'italic',
              fontSize: 22,
              flexShrink: 0,
              boxShadow: '0 8px 18px rgba(100,75,220,.28)',
            }}
          >
            衣
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong
              style={{ display: 'block', color: 'var(--ink)', fontSize: 14 }}
            >
              {shareTitle}
            </strong>
            <div
              className="tiny"
              style={{
                marginTop: 3,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={shareUrl}
            >
              {shareUrl}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            gap: 10,
            marginBottom: 6,
          }}
        >
          {platforms.map((p) => (
            <button
              key={p.key}
              onClick={p.onClick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '10px 4px',
                borderRadius: 14,
                background: 'rgba(255,255,255,.5)',
                border: '1px solid rgba(255,255,255,.7)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                transition: 'transform .18s ease',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(.95)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = '')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = '')}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,.75)',
                  color: p.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow:
                    '0 6px 14px rgba(60,45,100,.08), inset 0 1px 0 rgba(255,255,255,.7)',
                }}
              >
                {p.icon}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink)',
                  fontWeight: 600,
                }}
              >
                {p.label}
              </span>
            </button>
          ))}
        </div>

        {copied && (
          <div
            className="tiny center"
            style={{
              marginTop: 10,
              color: 'var(--purple)',
              fontWeight: 600,
            }}
          >
            ✓ 已为「{copied}」复制链接，去对应 App 粘贴即可
          </div>
        )}

        <div
          className="tiny"
          style={{
            marginTop: 14,
            padding: 10,
            borderRadius: 12,
            background: 'rgba(112,88,223,.08)',
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}
        >
          由于微信 / 小红书没有开放 Web 分享入口，会先复制链接，请手动粘贴到对应 App。QQ / 微博 / QQ 空间会直接跳转官方分享页。
        </div>
      </Sheet>
    );
  };

  window.YijianUI = {
    StatusBar,
    Icon,
    WeatherIcon,
    Select,
    Toast,
    EmptyState,
    ItemCard,
    Flatlay,
    HomePage,
    WardrobePage,
    InspirePage,
    RecordsPage,
    BottomNav,
    Sheet,
    UploadSheet,
    SaveLinkSheet,
    OutfitDetailSheet,
    ReplaceSheet,
    RecordDetailSheet,
    ShareSheet,
    ProfileSheet,
    CreatorExploreSheet,
    LocalHintBanner,
    MiniRecord,
    ItemDetailSheet,
    DeleteConfirmSheet,
    MetaRow,
  };
})();
