/* @jsxRuntime classic */
/* global React, ReactDOM */
/* 衣见 · 主 App
 * 编排全局状态、页面切换、Sheet 打开关闭、Toast、生成穿搭闭环
 */
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
  const S = window.YijianStore;
  const U = window.YijianUI;

  const {
    StatusBar,
    Icon,
    Toast,
    HomePage,
    WardrobePage,
    InspirePage,
    RecordsPage,
    BottomNav,
    UploadSheet,
    SaveLinkSheet,
    OutfitDetailSheet,
    ReplaceSheet,
    RecordDetailSheet,
    ShareSheet,
    ProfileSheet,
    CreatorExploreSheet,
    LocalHintBanner,
    ItemDetailSheet,
    DeleteConfirmSheet,
  } = U;

  const App = () => {
    // 未登录时不读取本机 localStorage 中可能残留的用户数据。
    const hasToken = () => !!S.getApiToken();
    // 页面
    const [page, setPage] = useState('home');
    // 数据（未登录时一律为空，绝不把 localStorage 里的旧缓存灌进来展示）
    const [wardrobe, setWardrobe] = useState(() => (hasToken() ? S.getWardrobe() : []));
    const [records, setRecords] = useState(() => (hasToken() ? S.getOutfits() : []));
    const [links, setLinks] = useState(() => (hasToken() ? S.getLinks() : []));
    const [prefs, setPrefs] = useState(() => (hasToken() ? S.getPreferences() : { style: '', scene: '', aiEndpoint: '' }));
    // 生成的当前搭配
    const [style, setStyle] = useState(prefs.style || '');
    const [scene, setScene] = useState(prefs.scene || '');
    const [weather, setWeather] = useState(() => (hasToken() ? S.getStoredWeather() : null));
    const [geoStatus, setGeoStatus] = useState('idle'); // idle | ok | denied | unavailable | timeout | no_support | insecure | weather_error
    const [geoLocating, setGeoLocating] = useState(false);
    const [profile, setProfile] = useState(() => S.getProfile());
    const [outfit, setOutfit] = useState(null);
    const [generating, setGenerating] = useState(false);
    // Sheets
    const [openSheet, setOpenSheet] = useState(null); // 'upload' | 'link' | 'detail' | 'replace' | 'record' | 'itemDetail'
    const [replaceTarget, setReplaceTarget] = useState(null);
    const [detailRecord, setDetailRecord] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    // 通用应用内确认弹窗（替代 window.confirm）：{ title, message, confirmText, onConfirm }
    const [confirmSheet, setConfirmSheet] = useState(null);
    // Toast
    const [toast, setToastMsg] = useState('');

    const showToast = useCallback((m) => {
      setToastMsg(m);
      clearTimeout(window.__yjToast);
      window.__yjToast = setTimeout(() => setToastMsg(''), 1800);
    }, []);

    useEffect(() => {
      const h = (e) => showToast(e.detail);
      window.addEventListener('yijian:toast', h);
      const openDetail = () => outfit && setOpenSheet('detail');
      window.addEventListener('yijian:open-detail', openDetail);
      return () => {
        window.removeEventListener('yijian:toast', h);
        window.removeEventListener('yijian:open-detail', openDetail);
      };
    }, [outfit, showToast]);

    // 登录后从后端同步当前账号的数据；未登录时保持空衣橱，不展示本机历史缓存。
    useEffect(() => {
      let alive = true;
      const boot = async () => {
        if (!S.getApiToken()) {
          S.clearLocalUserData && S.clearLocalUserData();
          setWardrobe([]);
          setRecords([]);
          setLinks([]);
          setOutfit(null);
          return;
        }
        try {
          await S.authMe();
          const [fresh, syncedProfile] = await Promise.all([
            S.syncAllFromBackend(),
            S.syncProfileFromBackend().catch(() => null),
          ]);
          if (!alive) return;
          if (syncedProfile) setProfile(syncedProfile);
          setWardrobe(fresh.wardrobe || []);
          setRecords(fresh.outfits || []);
          setLinks(fresh.links || S.getLinks());
        } catch (e) {
          if (!alive) return;
          S.clearUserSession();
          setProfile(S.getProfile());
          setWardrobe([]);
          setRecords([]);
          setLinks([]);
          setOutfit(null);
        }
      };
      boot();
      return () => {
        alive = false;
      };
    }, [profile.authStatus, profile.email]);

    // 保存 prefs
    useEffect(() => {
      if (S.getApiToken()) S.savePreferences({ ...prefs, style, scene });
    }, [style, scene]); // eslint-disable-line

    // 博主推荐（依赖当前 style/scene）
    const creators = useMemo(
      () =>
        S.recommendCreators(
          outfit?.creator_recommendation_tags || [],
          style,
          scene,
          6,
        ),
      [style, scene, outfit],
    );

    const isLoggedIn = profile && profile.authStatus === 'demo_logged_in';

    const remindLogin = useCallback(
      (actionText) => {
        showToast('先注册或登录后，再' + actionText);
        setOpenSheet('profile');
      },
      [showToast],
    );

    // 生成
    const doGenerate = useCallback(async () => {
      if (!isLoggedIn) {
        remindLogin('生成你的搭配');
        return;
      }
      if (wardrobe.length === 0) {
        showToast('你的衣橱还是空的，先上传真实衣服');
        setPage('wardrobe');
        return;
      }
      const missing = S.hasCoreCategories(wardrobe);
      if (missing.length) {
        showToast('请先上传至少 3 件：上衣、下装/裙装、鞋履');
        setPage('wardrobe');
        return;
      }
      setGenerating(true);
      let w = weather;
      if (!w) w = S.DEFAULT_WEATHER;
      try {
        const result = await S.generateAIOutfit({
          wardrobeItems: wardrobe,
          weather: w,
          style,
          scene,
        });
        // 填充 image 信息
        result.selected_items = (result.selected_items || [])
          .map((it) => {
            const w = wardrobe.find((x) => x.id === it.id);
            if (!w) return it;
            return {
              ...it,
              image: w.image,
              color: w.color,
              category: w.category,
              name: w.name,
            };
          })
          .filter((x) => x && x.image);
        setOutfit(result);
        setOpenSheet('detail'); // 生成后直接弹出详情卡片
        // v15：普通用户不感知 AI/回退/服务商，只给结果反馈
        if (result._source === 'backend-ai' || result._source === 'local-fallback') {
          showToast('已为你搭配完成');
        }
      } catch (e) {
        showToast('已为你搭配完成');
        const fb = S.localRuleOutfit({
          wardrobeItems: wardrobe,
          weather: w,
          style,
          scene,
        });
        fb.selected_items = (fb.selected_items || [])
          .map((it) => {
            const w = wardrobe.find((x) => x.id === it.id);
            if (!w) return it;
            return {
              ...it,
              image: w.image,
              color: w.color,
              category: w.category,
              name: w.name,
            };
          })
          .filter((x) => x && x.image);
        setOutfit(fb);
        setOpenSheet('detail'); // 兜底搭配同样直接弹出详情卡片
      } finally {
        setGenerating(false);
      }
    }, [wardrobe, weather, style, scene, showToast]);

    // 天气
    const doFetchWeather = useCallback(async () => {
      if (geoLocating) return;
      setGeoLocating(true);
      showToast('正在请求定位权限…');
      const result = await S.fetchWeather();
      setGeoLocating(false);
      setGeoStatus(result.status);
      if (result.status === 'ok' && result.weather) {
        setWeather(result.weather);
        const city = result.weather.city || '当前位置';
        showToast('已获取' + city + '的实时天气');
        return;
      }
      // 未成功：保留已有真实天气；若没有则用默认兜底
      if (!weather || weather.isFallback) {
        setWeather(S.DEFAULT_WEATHER);
      }
      const msgMap = {
        denied: '定位权限被拒绝，使用默认天气 22°C',
        timeout: '定位超时，使用默认天气',
        unavailable: '暂时无法获取位置，使用默认天气',
        no_support: '当前浏览器不支持定位',
        insecure: '需要 HTTPS 才能获取定位',
        weather_error: '天气服务暂时不可用',
      };
      showToast(msgMap[result.status] || '定位失败，使用默认天气');
    }, [showToast, weather, geoLocating]);

    // 上传 / 保存外链 / 保存穿搭
    const openUploadSheet = useCallback(() => {
      if (!isLoggedIn) {
        remindLogin('上传你的衣服');
        return;
      }
      setOpenSheet('upload');
    }, [isLoggedIn, remindLogin]);

    const openSaveLinkSheet = useCallback(() => {
      if (!isLoggedIn) {
        remindLogin('保存灵感链接');
        return;
      }
      setOpenSheet('link');
    }, [isLoggedIn, remindLogin]);

    const openRecordDetail = useCallback((r) => {
      if (!isLoggedIn) {
        remindLogin('查看你的穿搭记录');
        return;
      }
      setDetailRecord(r);
      setOpenSheet('record');
    }, [isLoggedIn, remindLogin]);

    const handleSaveOutfit = useCallback(async () => {
      if (!isLoggedIn) {
        remindLogin('保存这套搭配');
        return;
      }
      if (!outfit) return;
      let saved;
      try {
        saved = await S.saveOutfitRecordRemote({ outfit, weather, scene, style });
        showToast('已保存到日记');
      } catch (e) {
        saved = S.saveOutfitRecord({
          outfit,
          weather,
          scene,
          style,
        });
        showToast('已保存到日记');
      }
      setRecords(S.getOutfits());
      setOpenSheet(null);
      return saved;
    }, [isLoggedIn, remindLogin, outfit, weather, scene, style, showToast]);

    // 首次挂载时若已存过真实天气则沿用；否则先给默认。
    // 注意：不能因为浏览器 permissions API 返回 'denied' 就直接把 UI 状态设成 'denied'——
    // 因为在非 HTTPS、iframe、隐私模式或站点历史拒绝等情况下都可能返回 denied，
    // 但对用户来说他并没有"主动拒绝"。这里保持 UI 状态为 'idle'，
    // 等用户真正点击「允许定位」并由 getCurrentPosition 回错误码 1 时再显示"已拒绝"。
    useEffect(() => {
      if (!weather) setWeather(S.DEFAULT_WEATHER);
    }, []); // eslint-disable-line

    // 上传保存
    const handleSaveItem = useCallback(
      async (item) => {
        // 压缩，避免 localStorage QuotaExceeded：
        // - image（用于展示/flatlay）：520px / JPEG 0.82
        // - originalImage（仅备份查看）：420px / JPEG 0.75
        showToast('正在保存…');
        let compact = item;
        try {
          // 抠图输出为 PNG（带透明背景）；用户选"原图"或压缩后的 JPEG 都是无透明的常规照片。
          // 保留 PNG 透明通道对 flatlay 视觉体验很重要，因此按 MIME 分开压缩：
          //   - PNG：仍压 PNG（体积会大一点，但保留透明）
          //   - 其他：压 JPEG 白底
          const imgMime = (item.image || '').startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          const [img] = await Promise.all([
            item.image ? S.compressImage(item.image, 360, 0.7, imgMime) : Promise.resolve(''),
          ]);
          compact = { ...item, image: img, originalImage: '' };
        } catch (e) {
          /* 压缩失败也尝试原图 */
        }
        try {
          let saved;
          try {
            saved = await S.addWardrobeItemRemote(compact);
            showToast('已保存：' + saved.name);
            const freshRemote = await S.syncWardrobeFromBackend().catch(() => S.getWardrobe());
            setWardrobe(freshRemote);
          } catch (remoteError) {
            console.warn('Remote save failed', remoteError);
            showToast('云端保存失败，请检查后端服务后重试');
            return;
          }
          setOpenSheet(null);
        } catch (e) {
          if (e && e.code === 'STORAGE_FULL') {
            showToast('本地空间不足：已存衣物过多，请先删除几件后再试');
          } else {
            showToast('保存失败，请重试');
          }
        }
      },
      [showToast],
    );

    const handleDeleteItem = useCallback((item) => {
      setDeleteTarget(item);
    }, []);

    const confirmDeleteItem = useCallback(async () => {
      if (!deleteTarget) return;
      const deletingItem = deleteTarget;
      try {
        await S.deleteWardrobeItemRemote(deletingItem);
        const fresh = await S.syncWardrobeFromBackend().catch(() => S.getWardrobe());
        setWardrobe(fresh);
        setSelectedItem((cur) => (cur && cur.id === deletingItem.id ? null : cur));
        setOpenSheet((cur) => (cur === 'itemDetail' ? null : cur));
        setDeleteTarget(null);
        showToast('已删除');
      } catch (e) {
        showToast('删除失败，请重试');
      }
    }, [deleteTarget, showToast]);

    // 打开单品详情
    const handleOpenItem = useCallback((item) => {
      setSelectedItem(item);
      setOpenSheet('itemDetail');
    }, []);

    // 更新单品（编辑详情后调用）
    const handleUpdateItem = useCallback(
      async (id, patch) => {
        showToast('正在保存…');
        try {
          const isLoggedIn = profile && profile.authStatus === 'demo_logged_in';
          if (isLoggedIn) {
            await S.updateWardrobeItemRemote(id, patch);
            const fresh = await S.syncWardrobeFromBackend();
            setWardrobe(fresh);
            // 保存成功后关闭编辑弹窗、回到衣橱列表，不再用 find 兜底（会误命中第一件单品）。
            setSelectedItem(null);
            setOpenSheet(null);
            showToast('已更新');
            return;
          }

          const updated = S.updateWardrobeItem(id, patch);
          if (!updated) {
            showToast('未找到单品');
            return;
          }
          const fresh = S.getWardrobe();
          setWardrobe(fresh);
          setSelectedItem(null);
          setOpenSheet(null);
          showToast('已更新');
        } catch (e) {
          console.warn('Update item failed', e);
          if (e && e.code === 'BACKEND_NEEDS_RESTART') {
            showToast('后端版本未更新，请重新部署 Render 后再保存');
          } else if (e && e.status === 401) {
            showToast('登录已过期，请重新登录后保存');
          } else if (e && e.code === 'STORAGE_FULL') {
            showToast('空间不足：请先删除几件旧单品再试');
          } else {
            showToast('云端保存失败，请稍后重试');
          }
        }
      },
      [profile, showToast],
    );

    // 链接保存
    const handleSaveLink = useCallback(
      async (link) => {
        const saved = await S.addLink(link);
        if (saved) {
          setLinks(S.getLinks());
          setOpenSheet(null);
          showToast('已保存到灵感库');
        }
      },
      [showToast],
    );
    const handleDeleteLink = useCallback((link) => {
      setConfirmSheet({
        title: '删除这条灵感？',
        message: (link.title || '这条灵感') + ' 删除后不可恢复。',
        confirmText: '删除',
        onConfirm: async () => {
          await S.deleteLink(link.id);
          setLinks(S.getLinks());
          setConfirmSheet(null);
          showToast('已删除灵感');
        },
      });
    }, [showToast]);
    const handleRenameLink = useCallback(
      async (link, title) => {
        if (!link) return false;
        const nextTitle = title === undefined ? window.prompt('给这条灵感取个名字', link.title || '') : title;
        if (nextTitle === null) return false;
        const updated = await S.renameLink(link.id, nextTitle);
        if (!updated) {
          showToast('名字不能为空');
          return false;
        }
        setLinks(S.getLinks());
        showToast('已重命名');
        return true;
      },
      [showToast],
    );
    const handleCopyLink = useCallback(
      (link) => {
        try {
          navigator.clipboard.writeText(link.url);
          showToast('链接已复制');
        } catch (e) {
          showToast('复制失败，请手动选中');
        }
      },
      [showToast],
    );

    // 打开博主链接
    const openCreator = useCallback(
      (c) => {
        if (c.url) window.open(c.url, '_blank', 'noopener');
        else showToast('Demo：已准备打开博主主页');
      },
      [showToast],
    );

    // 替换单品
    const handleReplacePick = useCallback(
      (newItem) => {
        if (!outfit || !replaceTarget) return;
        const updated = {
          ...outfit,
          selected_items: outfit.selected_items.map((p) =>
            p.id === replaceTarget.id
              ? {
                  id: newItem.id,
                  name: newItem.name,
                  category: newItem.category,
                  image: newItem.image,
                  color: newItem.color,
                  reason:
                    '手动替换的 ' +
                    newItem.category +
                    '，风格 ' +
                    (newItem.styleTags || []).join(' / '),
                }
              : p,
          ),
          color_reason: outfit.color_reason + '（已替换 ' + newItem.category + '）',
        };
        setOutfit(updated);
        setReplaceTarget(null);
        setOpenSheet('detail');
        showToast('已替换 ' + newItem.category);
      },
      [outfit, replaceTarget, showToast],
    );

    // 删除整套里的某个单品（任务 D：不想要的包/配饰等可直接去掉，删除后仍能正常保存到日记）
    const handleRemoveItem = useCallback(
      (target) => {
        if (!outfit || !target) return;
        const remaining = (outfit.selected_items || []).filter((p) => p && p.id !== target.id);
        setOutfit({ ...outfit, selected_items: remaining });
        showToast('已移除 ' + (target.category || '单品'));
      },
      [outfit, showToast],
    );

    // 删除记录
    const handleDeleteRecord = useCallback(
      (r) => {
        setConfirmSheet({
          title: '删除这条穿搭记录？',
          message: (r.date || '这条') + ' 的穿搭记录删除后不可恢复。',
          confirmText: '删除',
          onConfirm: async () => {
            await S.deleteOutfitRemote(r.id);
            setRecords(S.getOutfits());
            setConfirmSheet(null);
            setOpenSheet((cur) => (cur === 'record' ? null : cur));
            setDetailRecord(null);
            showToast('已删除记录');
          },
        });
      },
      [showToast],
    );

    // 保存个人资料 / 账号状态（v13：邮箱登录也走这里）
    const handleSaveProfile = useCallback(
      async (p) => {
        const prev = profile;
        if (p && p._logout) {
          const cleared = S.clearUserSession();
          setProfile(cleared);
          setWardrobe([]);
          setRecords([]);
          setLinks([]);
          setOutfit(null);
          setOpenSheet(null);
          setPage('home');
          showToast('已退出登录');
          return;
        }
        const saved = S.saveProfile(p);
        setProfile(saved);
        // 登录 / 注册后：不关闭 sheet（AuthView 会自动切到 ProfileEditView）；仅在真正保存资料时关闭
        const authChanged = prev.authStatus !== saved.authStatus;
        const pwChanged = prev.passwordHash !== saved.passwordHash;
        if (saved.authStatus === 'demo_logged_in' && !authChanged) {
          try {
            const remoteProfile = await S.updateProfileRemote(saved);
            setProfile(remoteProfile);
          } catch (e) {
            // 本地资料已先保存；若后端不支持资料接口（404），以本地为准，不打扰用户。
            if (e && e.status === 404) {
              setOpenSheet(null);
              showToast('已保存个人资料');
              return;
            }
            // 其他云端失败（网络 / 5xx）时保留编辑结果与当前编辑视图。
            showToast('资料暂未同步，请稍后重试');
            return;
          }
        }
        if (authChanged || pwChanged) {
          // 账号变动：让 AuthView / ProfileEditView 自己发 toast，主 App 不再重复提示
          return;
        }
        setOpenSheet(null);
        showToast('已保存个人资料');
      },
      [showToast, profile],
    );

    // 用当前衣橱回填 record 中单品的 image / color / category
    const hydrateRecord = useCallback(
      (r) => {
        const items = (r.outfit?.selected_items || []).map((it) => {
          const w = wardrobe.find((x) => x.id === it.id);
          if (!w) return { ...it, image: '' };
          return {
            ...it,
            image: w.image,
            color: w.color,
            category: w.category,
            name: w.name,
          };
        });
        return {
          ...r,
          outfit: { ...(r.outfit || {}), selected_items: items },
        };
      },
      [wardrobe],
    );
    const hydratedRecords = useMemo(
      () => records.map(hydrateRecord),
      [records, hydrateRecord],
    );

    // 页面渲染
    const renderPage = () => {
      if (page === 'home')
        return (
          <HomePage
            style={style}
            scene={scene}
            setStyle={setStyle}
            setScene={setScene}
            weather={weather}
            geoStatus={geoStatus}
            geoLocating={geoLocating}
            onFetchWeather={doFetchWeather}
            wardrobe={wardrobe}
            onGenerate={doGenerate}
            generating={generating}
            outfit={outfit}
            recentRecords={hydratedRecords}
            creators={creators}
            onOpenCreator={openCreator}
            onOpenCreatorsAll={() => setOpenSheet('creatorsAll')}
            onNav={setPage}
            onClickItem={handleOpenItem}
          />
        );
      if (page === 'wardrobe')
        return (
          <WardrobePage
            wardrobe={wardrobe}
            onOpenUpload={openUploadSheet}
            onDeleteItem={handleDeleteItem}
            onClickItem={handleOpenItem}
          />
        );
      if (page === 'inspire')
        return (
          <InspirePage
            creators={creators}
            links={links}
            onOpenSaveLink={openSaveLinkSheet}
            onOpenCreator={openCreator}
            onOpenCreatorsAll={() => setOpenSheet('creatorsAll')}
            onDeleteLink={handleDeleteLink}
            onRenameLink={handleRenameLink}
            onCopyLink={handleCopyLink}
          />
        );
      if (page === 'records')
        return (
          <RecordsPage
            records={hydratedRecords}
            wardrobe={wardrobe}
            onDelete={handleDeleteRecord}
            onOpen={openRecordDetail}
          />
        );
      return null;
    };

    return (
      <div className="stage">
        <div className="phone">
          <StatusBar />
          <div className="topbar">
            <div className="brand">衣见</div>
            <div className="top-actions">
              <button
                className="circle"
                aria-label="转发衣见"
                onClick={() => setOpenSheet('share')}
              >
                <Icon name="share" size={16} />
              </button>
              <button
                className="circle profile-top-btn"
                aria-label="个人中心"
                onClick={() => setOpenSheet('profile')}
              >
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="头像"
                    className="profile-top-avatar"
                  />
                ) : (
                  <Icon name="user" size={16} />
                )}
              </button>
            </div>
          </div>
          <div className="content">{renderPage()}</div>
          <BottomNav active={page} onChange={setPage} />

          {openSheet === 'upload' && (
            <UploadSheet
              onClose={() => setOpenSheet(null)}
              onSave={handleSaveItem}
            />
          )}
          {openSheet === 'link' && (
            <SaveLinkSheet
              defaultStyle={style}
              onClose={() => setOpenSheet(null)}
              onSave={handleSaveLink}
            />
          )}
          {openSheet === 'detail' && outfit && (
            <OutfitDetailSheet
              outfit={outfit}
              weather={weather}
              style={style}
              scene={scene}
              onClose={() => setOpenSheet(null)}
              onReplace={(p) => {
                setReplaceTarget(p);
                setOpenSheet('replace');
              }}
              onRemove={handleRemoveItem}
              onRegenerate={doGenerate}
              onSave={handleSaveOutfit}
              generating={generating}
            />
          )}
          {openSheet === 'replace' && (
            <ReplaceSheet
              target={replaceTarget}
              wardrobe={wardrobe}
              onClose={() => {
                setReplaceTarget(null);
                setOpenSheet('detail');
              }}
              onPick={handleReplacePick}
            />
          )}
          {openSheet === 'record' && (
            <RecordDetailSheet
              record={detailRecord}
              onClose={() => {
                setOpenSheet(null);
                setDetailRecord(null);
              }}
              onDelete={handleDeleteRecord}
            />
          )}
          {openSheet === 'share' && (
            <ShareSheet
              onClose={() => setOpenSheet(null)}
              onToast={showToast}
            />
          )}
          {openSheet === 'profile' && (
            <ProfileSheet
              profile={profile}
              onClose={() => setOpenSheet(null)}
              onSave={handleSaveProfile}
              onToast={showToast}
            />
          )}
          {openSheet === 'creatorsAll' && (
            <CreatorExploreSheet
              onClose={() => setOpenSheet(null)}
              onOpenCreator={openCreator}
            />
          )}
          {openSheet === 'itemDetail' && selectedItem && (
            <ItemDetailSheet
              item={selectedItem}
              onClose={() => {
                setOpenSheet(null);
                setSelectedItem(null);
              }}
              onUpdate={handleUpdateItem}
              onDelete={handleDeleteItem}
              onToast={showToast}
            />
          )}
          {deleteTarget && (
            <DeleteConfirmSheet
              title="确认删除这件衣服？"
              message={deleteTarget.name + ' 删除后不会再出现在衣橱里。'}
              confirmText="确认删除"
              cancelText="取消"
              onClose={() => setDeleteTarget(null)}
              onConfirm={confirmDeleteItem}
            />
          )}
          {confirmSheet && (
            <DeleteConfirmSheet
              title={confirmSheet.title}
              message={confirmSheet.message}
              confirmText={confirmSheet.confirmText || '删除'}
              cancelText={confirmSheet.cancelText || '取消'}
              onClose={() => setConfirmSheet(null)}
              onConfirm={confirmSheet.onConfirm}
            />
          )}
          <Toast text={toast} />
        </div>
        <LocalHintBanner />
      </div>
    );
  };

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
