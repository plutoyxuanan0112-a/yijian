/* @jsxRuntime classic */
/* global React, ReactDOM */
(function () {
  const { useCallback, useEffect, useMemo, useState } = React;
  const TOKEN_KEY = 'yijian_admin_session_token';
  const LOCAL_API = 'http://127.0.0.1:8000';
  const AdminContext = React.createContext(null);

  function apiBase() {
    const configured = (window.YIJIAN_API_BASE || '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return ['localhost', '127.0.0.1'].includes(location.hostname) ? LOCAL_API : location.origin;
  }

  function formatTime(value) {
    if (!value) return '暂无';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
  }

  function compactList(items) {
    return (items || []).filter(Boolean).join('、') || '暂无';
  }

  function count(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  async function request(path, token, signal, options = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel);
    const timer = setTimeout(cancel, options.method ? 600000 : 15000);
    try {
      const response = await fetch(apiBase() + path, {
        ...options,
        headers: { 'X-Admin-Token': token, 'Content-Type': 'application/json' },
        signal: controller.signal, cache: 'no-store', redirect: 'error',
      });
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) {
        const detail = typeof body?.detail === 'string' ? body.detail : Array.isArray(body?.detail) ?
          body.detail.map(item => item.loc.join('.') + '：' + item.msg).join('；') : '操作失败，请稍后重试。';
        const error = new Error(response.status === 403 ? '管理员凭证已失效，请重新登录。' : detail);
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error.name === 'AbortError') throw new Error(options.method ? '操作响应超时，请刷新列表核对结果后重试。' : '读取超时，请重试。');
      if (error instanceof TypeError) throw new Error('无法连接后端，请检查本地服务后重试。');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }

  function useData(paths, poll = false) {
    const { token, refresh, logout } = React.useContext(AdminContext);
    const signature = JSON.stringify(paths);
    const [state, setState] = useState({ data: null, error: '', loading: true });
    useEffect(() => {
      const controller = new AbortController();
      let active = true, pending = false;
      setState({ data: null, error: '', loading: true });
      const load = async () => {
        if (pending || document.hidden) return;
        pending = true;
        try {
          const data = await Promise.all(JSON.parse(signature).map(path => request(path, token, controller.signal)));
          if (active) setState({ data, error: '', loading: false, updated: new Date() });
        } catch (error) {
          if (!active) return;
          if (error.status === 401 || error.status === 403) logout();
          else setState(prev => ({ ...prev, error: error.message, loading: false }));
        } finally { pending = false; }
      };
      load();
      const timer = poll ? setInterval(load, 10000) : null;
      const visible = () => { if (!document.hidden) load(); };
      document.addEventListener('visibilitychange', visible);
      return () => {
        active = false; controller.abort(); clearInterval(timer);
        document.removeEventListener('visibilitychange', visible);
      };
    }, [signature, token, refresh, logout, poll]);
    return state;
  }

  function ErrorNotice({ error }) {
    const context = React.useContext(AdminContext);
    return error ? <div role="alert" className="error-notice">{error} <button onClick={context.reload}>重试</button></div> : null;
  }

  function Pager({ data, onPage }) {
    return <div className="pager">
      <span>共 {count(data.total)} 条 · 第 {Math.floor(data.offset / data.limit) + 1} / {Math.max(1, Math.ceil(data.total / data.limit))} 页</span>
      <button disabled={data.offset === 0} onClick={() => onPage(Math.max(0, data.offset - data.limit))}>上一页</button>
      <button disabled={data.offset + data.limit >= data.total} onClick={() => onPage(data.offset + data.limit)}>下一页</button>
    </div>;
  }

  function SafeImage({ url, alt }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [url]);
    const safe = url?.startsWith('/api/v1/uploads/') || url?.startsWith('/static/') ? apiBase() + url :
      /^https?:\/\//i.test(url || '') ? url : '';
    return safe && !failed ? <img src={safe} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="image-empty">暂无图片</span>;
  }

  function PagedSection({ path, children }) {
    const [offset, setOffset] = useState(0);
    const state = useData([path + '?limit=20&offset=' + offset]);
    if (state.error) return <ErrorNotice error={state.error} />;
    if (!state.data) return <Loading />;
    const data = state.data[0];
    return <>{children(data)}<Pager data={data} onPage={setOffset} /></>;
  }

  function Metric({ label, value, tone }) {
    return (
      <section className={'metric metric-' + (tone || 'neutral')}>
        <span>{label}</span>
        <strong>{count(value)}</strong>
      </section>
    );
  }

  function Loading({ text = '正在读取数据' }) {
    return <div className="loading">{text}</div>;
  }

  function Empty({ text = '暂无数据' }) {
    return <div className="empty">{text}</div>;
  }

  function Tags({ items }) {
    if (!items || !items.length) return <span className="muted">暂无标签</span>;
    return <span className="tags">{items.map((item) => <i key={item}>{item}</i>)}</span>;
  }

  function Overview({ onUser }) {
    const state = useData(['/api/v1/admin/overview', '/api/v1/admin/data-quality', '/api/v1/admin/storage/status'], true);
    if (!state.data) return state.error ? <ErrorNotice error={state.error} /> : <Loading />;
    const [data, quality, storage] = state.data;
    const counts = data.counts || {};
    return (
      <div className="view">
        <ErrorNotice error={state.error} />
        <p className="muted">最近更新 {formatTime(state.updated)} · 每 10 秒刷新</p>
        <div className="metrics">
          <Metric label="用户" value={counts.users} />
          <Metric label="衣物" value={counts.clothes} />
          <Metric label="博主" value={counts.bloggers} />
          <Metric label="偏好事件" value={counts.preference_events} />
          <Metric label="缺图衣物" value={quality.clothes && quality.clothes.missing_image_url} tone="warning" />
          <Metric label="本地图片" value={quality.clothes && quality.clothes.local_image_url} tone="warning" />
        </div>
        <div className="overview-grid">
          <section className="panel">
            <div className="panel-heading">
              <div><h2>对象存储</h2><p>当前图片存储与上线准备状态</p></div>
              <span className={'status ' + (storage.cloudinary_enabled ? 'ok' : 'attention')}>
                {storage.cloudinary_enabled ? 'Cloudinary 已启用' : '本地存储'}
              </span>
            </div>
            <dl className="key-values">
              <div><dt>衣物远程 URL</dt><dd>{count(storage.clothes && storage.clothes.remote_image_url_count)}</dd></div>
              <div><dt>衣物本地 URL</dt><dd>{count(storage.clothes && storage.clothes.local_image_url_count)}</dd></div>
              <div><dt>云存储配置</dt><dd>{storage.cloudinary_enabled ? '已就绪' : '未配置'}</dd></div>
              <div><dt>待重试图片清理</dt><dd>{count(storage.pending_cleanup)}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <div className="panel-heading"><div><h2>数据异常</h2><p>优先处理会影响展示或迁移的问题</p></div></div>
            <dl className="key-values">
              <div><dt>未补预览图</dt><dd>{count(quality.bloggers && quality.bloggers.missing_cover_count)}</dd></div>
              <div><dt>无效主页</dt><dd>{count(quality.bloggers && quality.bloggers.invalid_profile_url_count)}</dd></div>
              <div><dt>孤儿数据</dt><dd>{count(Number((quality.integrity && quality.integrity.orphan_preference_events) || 0) + Number((quality.integrity && quality.integrity.orphan_blogger_states) || 0))}</dd></div>
            </dl>
          </section>
        </div>
        <section className="panel">
          <div className="panel-heading"><div><h2>最近偏好行为</h2><p>显示最近 10 条已记录事件</p></div></div>
          {!data.recent_events || !data.recent_events.length ? <Empty /> : (
            <div className="table-wrap"><table><thead><tr><th>用户</th><th>行为</th><th>目标博主</th><th>风格</th><th>时间</th></tr></thead>
            <tbody>{data.recent_events.map((event) => <tr key={event.id}>
              <td>{event.email || '已删除用户'}</td><td>{event.action_type}</td><td>{event.blogger_id || '-'}</td><td><Tags items={event.style_tags} /></td><td>{formatTime(event.created_at)}</td>
            </tr>)}</tbody></table></div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>最近注册用户</h2><p>邮箱默认脱敏</p></div></div>
          <div className="user-chips">{(data.users || []).map((user) => <button key={user.id} onClick={() => onUser(user.id)}>{user.display_name || '未命名'} <small>{user.email}</small></button>)}</div>
        </section>
      </div>
    );
  }

  function Users({ onUser }) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('');
    const [offset, setOffset] = useState(0);
    const { data: result, error, loading } = useData(['/api/v1/admin/users?limit=20&offset=' + offset + '&q=' + encodeURIComponent(filter)]);
    const data = result?.[0];
    function submit(event) { event.preventDefault(); setOffset(0); setFilter(query.trim()); }
    return <div className="view">
      <div className="section-bar"><div><h1>用户</h1><p>所有用户资料均保持默认脱敏。</p></div>
        <form className="search" onSubmit={submit}><input aria-label="搜索用户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索昵称或邮箱" /><button>搜索</button></form>
      </div>
      {loading ? <Loading /> : error ? <ErrorNotice error={error} /> : !data || !data.items.length ? <Empty text="没有匹配的用户，可修改搜索条件。" /> : (
        <section className="panel"><div className="panel-heading"><div><h2>{count(data.total)} 位用户</h2></div></div>
        <div className="table-wrap"><table><thead><tr><th>用户</th><th>注册时间</th><th>最后行为</th><th>衣物</th><th>收藏</th><th>事件</th><th></th></tr></thead><tbody>
        {data.items.map((user) => <tr key={user.id}><td><b>{user.display_name || '未命名'}</b><small>{user.email}</small></td><td>{formatTime(user.created_at)}</td><td>{formatTime(user.last_event_at)}</td><td>{count(user.counts.clothes)}</td><td>{count(user.counts.inspiration_links)}</td><td>{count(user.counts.preference_events)}</td><td><button className="text-button" onClick={() => onUser(user.id)}>查看</button></td></tr>)}
        </tbody></table></div><Pager data={data} onPage={setOffset} /></section>
      )}
    </div>;
  }

  function UserDetail({ userId, onBack }) {
    const { data: result, error } = useData(['/api/v1/admin/users/' + userId, '/api/v1/admin/users/' + userId + '/taste']);
    if (error) return <div className="view"><button className="back" onClick={onBack}>返回用户</button><ErrorNotice error={error} /></div>;
    if (!result) return <div className="view"><button className="back" onClick={onBack}>返回用户</button><Loading /></div>;
    const [data, taste] = result;
    const user = data.user;
    return <div className="view">
      <button className="back" onClick={onBack}>返回用户</button>
      <div className="profile-head"><div className="avatar"><SafeImage url={user.avatar} alt="用户头像" /></div><div><h1>{user.display_name || '未命名用户'}</h1><p>{user.email} · 注册于 {formatTime(user.created_at)}</p><p>{user.bio || '尚未填写简介'}</p></div></div>
      <div className="metrics compact"><Metric label="衣物" value={data.counts.clothes} /><Metric label="穿搭记录" value={data.counts.outfit_records} /><Metric label="收藏" value={data.counts.inspiration_links} /><Metric label="行为事件" value={data.counts.preference_events} /></div>
      <div className="overview-grid">
        <section className="panel"><div className="panel-heading"><div><h2>当前偏好</h2><p>由行为事件与当前收藏计算</p></div></div>
          <dl className="key-values"><div><dt>偏好事件</dt><dd>{count(taste.event_count)}</dd></div><div><dt>喜欢博主</dt><dd>{count((taste.liked_bloggers || []).length)}</dd></div><div><dt>屏蔽博主</dt><dd>{count((taste.blocked_bloggers || []).length)}</dd></div></dl>
          <h3>正向风格</h3><Tags items={(taste.positive_styles || []).map((item) => item.tag || item)} />
          <h3>负向风格</h3><Tags items={(taste.negative_styles || []).map((item) => item.tag || item)} />
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>博主状态</h2><p>喜欢与屏蔽状态</p></div></div>
          {!data.blogger_states.filter(item => item.state !== 0).length ? <Empty /> : <div className="state-list">{data.blogger_states.filter(item => item.state !== 0).map((item) => <div key={item.blogger_id}><span className={item.state === 1 ? 'state-like' : 'state-block'}>{item.state === 1 ? '喜欢' : '屏蔽'}</span><b>{item.name || item.blogger_id}</b><Tags items={item.tags} /></div>)}</div>}
        </section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h2>搭配资料</h2><p>仅显示授权状态与完成度；完整身体字段不在运营台默认展示。</p></div><span className={'status ' + (data.body_profile?.consented ? 'ok' : 'attention')}>{data.body_profile?.consented ? '已授权' : '未授权'}</span></div>
        <dl className="key-values"><div><dt>身高</dt><dd>{data.body_profile?.height_cm ? '已填写' : '未填写'}</dd></div><div><dt>资料版本</dt><dd>v{data.body_profile?.profile_version || 0}</dd></div><div><dt>穿衣目标</dt><dd>{compactList(data.body_profile?.styling_goals)}</dd></div><div><dt>在意点</dt><dd>{compactList(data.body_profile?.fit_concerns)}</dd></div></dl>
      </section>
      <section className="panel"><h2>当前收藏</h2>
        {!(taste.saved_inspirations || []).length ? <Empty /> : <ul className="samples">{taste.saved_inspirations.map(item => <li key={item.id}><b>{item.title || item.blogger_name || '未命名收藏'}</b><p>{item.note}</p><Tags items={item.tags} /></li>)}</ul>}
      </section>
      <section className="panel"><h2>行为时间线</h2>
        <PagedSection path={'/api/v1/admin/users/' + userId + '/events'}>{events => !events.items.length ? <Empty /> : <div className="timeline">{events.items.map((item) => <div key={item.id}><time>{formatTime(item.created_at)}</time><b>{item.action_type}</b><span>{item.blogger_name || item.blogger_id || '-'}</span><Tags items={item.style_tags} /></div>)}</div>}</PagedSection>
      </section>
      <section className="panel"><h2>衣橱</h2>
        <PagedSection path={'/api/v1/admin/users/' + userId + '/wardrobe'}>{wardrobe => !wardrobe.items.length ? <Empty /> : <div className="wardrobe">{wardrobe.items.map((item) => <article key={item.id}><SafeImage url={item.image_url} alt={item.name} /><div><b>{item.name}</b><span>{compactList([item.category, item.color, item.season])}</span><Tags items={String(item.style_tags || '').split(/[，,]/).filter(Boolean)} /></div></article>)}</div>}</PagedSection>
      </section>
    </div>;
  }

  function Bloggers() {
    const { token, reload, logout } = React.useContext(AdminContext);
    const [editor, setEditor] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [writeError, setWriteError] = useState('');
    const [manifest, setManifest] = useState('');
    const [validated, setValidated] = useState('');
    const [assets, setAssets] = useState(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('');
    const [offset, setOffset] = useState(0);
    const { data: result, error } = useData(['/api/v1/admin/bloggers?limit=20&offset=' + offset + '&q=' + encodeURIComponent(filter)]);
    const metrics = useData(['/api/v1/admin/blogger-metrics']);
    const data = result?.[0];
    async function operate(path, method, body, message, after) {
      if (busy) return;
      setBusy(true); setWriteError(''); setNotice('');
      try {
        const result = await request(path, token, undefined, { method, body: JSON.stringify(body) });
        setNotice(message + (result.detail ? ' · ' + result.detail : ''));
        if (after) after(result);
        reload();
      } catch (err) {
        setWriteError(err.message);
        if (err.status === 403 || err.status === 401) logout();
      } finally { setBusy(false); }
    }
    function mediaTemplate(item) {
      setManifest(JSON.stringify([{ id: item.id, avatar_url: '', avatar_source: item.profile_url,
        rights_basis: '', captured_at: new Date().toISOString(),
        covers: [{ image_url: '', note_url: '', title: '' }] }], null, 2));
      setValidated('');
      document.getElementById('media-import')?.scrollIntoView({ block: 'start' });
    }
    function transfer(validateOnly) {
      try {
        const items = JSON.parse(manifest);
        if (!Array.isArray(items)) throw new Error('清单必须是 JSON 数组。');
        operate('/api/v1/admin/blogger-media/transfer', 'POST', { items, validate_only: validateOnly },
          validateOnly ? '格式校验通过，可转存至待审核区' : '素材已转存，等待人工审核后才会展示',
          result => { if (validateOnly) setValidated(manifest); else setValidated(''); });
      } catch (err) { setWriteError(err.message); }
    }
    return <div className="view"><div className="section-bar"><div><h1>博主</h1><p>维护审核名单、真实媒体和推荐状态。暂停保留所有历史行为。</p></div><form className="search" onSubmit={(event) => { event.preventDefault(); setOffset(0); setFilter(query.trim()); }}><input aria-label="搜索博主" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或 ID" /><button>搜索</button></form></div>
      <div className="editor-actions"><button className="refresh" disabled={busy} onClick={() => setEditor({ id: '', name: '', profile_url: '', tagsText: '', valid_outfit_count: 0, isNew: true })}>新增博主</button></div>
      {notice && <p role="status" className="success-notice">{notice}</p>}
      {writeError && <div role="alert" className="error-notice">{writeError}</div>}
      {busy && <p role="status">正在处理，请等待结果；媒体转存可能需要几分钟。</p>}
      {editor && <form className="panel blogger-editor" onSubmit={event => {
        event.preventDefault();
        operate('/api/v1/admin/bloggers/save', 'POST', { id: editor.id, name: editor.name,
          profile_url: editor.profile_url, tags: editor.tagsText.split(/[,，、]/).map(t => t.trim()).filter(Boolean),
          valid_outfit_count: Number(editor.valid_outfit_count) }, '博主资料已保存', () => setEditor(null));
      }}><h2>{editor.isNew ? '新增审核博主' : '编辑 ' + editor.name}</h2><div className="editor-fields">
        <label>博主 ID<input required maxLength={64} disabled={!editor.isNew || busy} value={editor.id} onChange={e => setEditor({ ...editor, id: e.target.value })} /></label>
        <label>名称<input required maxLength={100} disabled={busy} value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
        <label>主页 URL<input type="url" required maxLength={500} disabled={busy} value={editor.profile_url} onChange={e => setEditor({ ...editor, profile_url: e.target.value })} /></label>
        <label>风格标签（逗号分隔）<input required disabled={busy} value={editor.tagsText} onChange={e => setEditor({ ...editor, tagsText: e.target.value })} /></label>
        <label>已核验穿搭数<input type="number" min="0" max="100000" required disabled={busy} value={editor.valid_outfit_count} onChange={e => setEditor({ ...editor, valid_outfit_count: e.target.value })} /></label>
      </div><div className="editor-actions"><button className="refresh" disabled={busy}>保存资料</button><button className="refresh" type="button" disabled={busy} onClick={() => setEditor(null)}>取消</button></div></form>}
      {error ? <ErrorNotice error={error} /> : !data ? <Loading /> : <section className="panel"><div className="panel-heading"><div><h2>{count(data.total)} 位博主</h2></div></div><div className="table-wrap"><table><thead><tr><th>博主</th><th>标签</th><th>主页</th><th>已上线预览</th><th>喜欢</th><th>屏蔽</th><th>推荐状态</th><th>操作</th></tr></thead><tbody>
      {data.items.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.id}</small></td><td><Tags items={item.tags} /></td><td>{/^https:\/\//i.test(item.profile_url) ? <a className="external" href={item.profile_url} target="_blank" rel="noreferrer">打开主页</a> : <span className="muted">未填写有效主页</span>}</td><td>{count(item.cover_count)} / 3</td><td>{count(item.state_counts.liked)}</td><td>{count(item.state_counts.blocked)}</td>
        <td><span>{item.active === false ? '已暂停' : '推荐中'}</span><small>{({ ok: '主页可访问', invalid: '主页失效', unknown: '待人工核对', unchecked: '待巡检' })[item.publication?.health || 'unchecked']}</small><small>{formatTime(item.publication?.checked_at)}</small></td>
        <td><div className="row-actions"><button disabled={busy} onClick={() => setEditor({ ...item, tagsText: item.tags.join('，') })}>编辑</button>
          <button disabled={busy} onClick={() => operate('/api/v1/admin/bloggers/' + item.id + '/publication', 'PUT',
            { state: item.publication?.manual_state === 'paused' ? 'active' : 'paused' }, item.publication?.manual_state === 'paused' ? '已恢复手动推荐状态；主页失效时仍需重新巡检' : '已暂停推荐')}>{item.publication?.manual_state === 'paused' ? '恢复' : '暂停'}</button>
          <button disabled={busy} onClick={() => operate('/api/v1/admin/bloggers/' + item.id + '/check', 'POST', {}, '巡检完成')}>巡检主页</button>
          <button disabled={busy} onClick={() => mediaTemplate(item)}>补素材</button>
          <button disabled={busy} onClick={() => operate('/api/v1/admin/bloggers/' + item.id + '/assets', 'GET', undefined, '媒体来源已读取', result => setAssets({ id: item.id, name: item.name, items: result.items, selected: [] }))}>质检预览图</button>
        </div></td></tr>)}
      </tbody></table></div>{!data.items.length && <Empty text="没有匹配的博主" />}<Pager data={data} onPage={setOffset} /></section>}
      {assets && <section className="panel"><div className="panel-heading"><div><h2>{assets.name} · 预览图质检</h2><p>只选择通过的 1–3 张，顺序决定单列三图；第 1 张是双列和首页代表图。所有卡片跳转博主主页。</p></div><button className="refresh" onClick={() => setAssets(null)}>收起</button></div>
        {!assets.items.length ? <Empty text="尚未转存待审核素材" /> : <><div className="asset-grid">{assets.items.map(asset => <article key={asset.id} className={assets.selected?.includes(asset.id) ? 'asset-selected' : ''}>
          <div className="asset-preview"><SafeImage url={asset.storage_url} alt={assets.name + '素材'} /></div>
          <p>{asset.kind === 'avatar' ? '头像（不参与展示）' : '穿搭预览'} · {({ active: '展示中', retired: '历史版本', staged: '转存中', pending_review: '待人工审核', rejected: '已拒绝' })[asset.status]}</p>
          <a href={asset.source_page} target="_blank" rel="noreferrer">原始页面</a><p>{asset.rights_basis}</p><small>{asset.width} × {asset.height} · {formatTime(asset.captured_at)}</small><code>{asset.content_hash}</code>
          {asset.kind === 'cover' && asset.status === 'pending_review' && <div className="asset-actions"><label><input type="checkbox" checked={assets.selected?.includes(asset.id) || false} disabled={busy} onChange={() => setAssets(current => {
            const selected = current.selected || [];
            const next = selected.includes(asset.id) ? selected.filter(id => id !== asset.id) : [...selected, asset.id].slice(0, 3);
            return { ...current, selected: next };
          })} /> 通过并排序</label><button disabled={busy} onClick={() => operate('/api/v1/admin/bloggers/' + assets.id + '/assets/' + asset.id, 'DELETE', undefined, '已拒绝该预览图', () => setAssets(null))}>拒绝</button></div>}
        </article>)}</div>
        {!!assets.items.some(asset => asset.status === 'pending_review') && <div className="review-bar"><span>已选 {assets.selected?.length || 0} / 3 张；勾选顺序即展示顺序。</span><button className="refresh" disabled={busy || !(assets.selected?.length)} onClick={() => operate('/api/v1/admin/bloggers/' + assets.id + '/preview-review', 'PUT', { approved_asset_ids: assets.selected }, '预览图已审核通过并上线', () => setAssets(null))}>通过并上线</button></div>}</>}
      </section>}
      <section className="panel" id="media-import"><h2>预览图采集入库</h2><p>点击博主的「补素材」生成清单，或选择已有 JSON。每批最多 10 位、每人 1–3 张穿搭预览图；先校验并转存到待审核区，人工选择通过后才会前台展示。</p>
        <label className="file-label">选择 JSON 清单<input type="file" accept=".json,application/json" disabled={busy} onChange={async e => {
          const file = e.target.files[0]; if (!file) return;
          if (file.size > 1000000) { setWriteError('清单文件不能超过 1 MB'); return; }
          try { setManifest(await file.text()); setValidated(''); } catch (_) { setWriteError('文件读取失败'); }
        }} /></label>
        <label className="manifest-label">媒体清单<textarea aria-label="媒体清单" rows={12} value={manifest} disabled={busy} onChange={e => { setManifest(e.target.value); setValidated(''); }} spellCheck="false" /></label>
        <p className="muted">头像字段可留空。rights_basis 填写可使用素材的依据；captured_at 为含时区的采集时间；covers 中填写图片 URL、原笔记 URL 与标题。第一张会成为候选代表图，但只有人工质检通过后才会展示。</p>
        <div className="editor-actions"><button className="refresh" disabled={busy || !manifest} onClick={() => transfer(true)}>校验清单</button><button className="refresh" disabled={busy || !manifest || validated !== manifest} onClick={() => transfer(false)}>转存至待审核区</button></div>
      </section>
      <section className="panel"><h2>近 7 天推荐表现</h2><p className="muted">曝光：卡片至少一半可见且持续 0.75 秒。点击率仅计算已曝光记录；喜欢、收藏和屏蔽按推荐记录去重。数据是行为统计，不能直接证明推荐效果提升。</p>
        {metrics.error ? <ErrorNotice error={metrics.error} /> : !metrics.data ? <Loading /> : !metrics.data[0].items?.length ? <Empty text="浏览推荐后会在这里产生数据" /> :
          <div className="table-wrap"><table><thead><tr><th>入口 / 策略</th><th>曝光</th><th>点击</th><th>点击率</th><th>喜欢</th><th>收藏</th><th>屏蔽</th></tr></thead><tbody>{metrics.data[0].items.map(row => <tr key={row.surface + row.strategy}>
            <td>{row.surface === 'home' ? '首页' : '风格浏览'} / {({ relevance: '偏好匹配', exploration: '探索', random: '随机', catalog: '目录' })[row.strategy]}</td><td>{row.impressions}</td><td>{row.clicks}</td><td>{row.ctr == null ? '—' : (row.ctr * 100).toFixed(1) + '%'}</td><td>{row.likes}</td><td>{row.saves}</td><td>{row.blocks}</td>
          </tr>)}</tbody></table></div>}
      </section>
    </div>;
  }

  function Quality() {
    const { data: result, error, updated } = useData(['/api/v1/admin/data-quality'], true);
    if (!result) return error ? <ErrorNotice error={error} /> : <Loading />;
    const data = result[0];
    const categories = [
      ['缺少衣物图片', data.clothes && data.clothes.missing_image_url],
      ['仍使用本地图片', data.clothes && data.clothes.local_image_url],
      ['博主缺预览图', data.bloggers && data.bloggers.missing_cover_count],
      ['无效博主主页', data.bloggers && data.bloggers.invalid_profile_url_count],
      ['孤儿偏好事件', data.integrity && data.integrity.orphan_preference_events],
      ['孤儿博主状态', data.integrity && data.integrity.orphan_blogger_states],
    ];
    const samples = [
      ['缺少预览图', data.bloggers && data.bloggers.missing_cover_sample],
      ['无效主页', data.bloggers && data.bloggers.invalid_profile_url_sample],
    ];
    return <div className="view"><ErrorNotice error={error} /><div className="section-bar"><div><h1>数据质量</h1><p>最近更新 {formatTime(updated)} · 每 10 秒刷新。主页仅校验 URL 格式。</p></div></div><div className="metrics">{categories.map(([label, value]) => <Metric key={label} label={label} value={value} tone={value ? 'warning' : 'good'} />)}</div>
      <div className="sample-grid">{samples.map(([title, items]) => <section className="panel" key={title}><div className="panel-heading"><div><h2>{title}</h2><p>最多显示 20 条</p></div></div>{!items || !items.length ? <Empty text="没有异常样本" /> : <ul className="samples">{items.map((item) => <li key={item.id}><b>{item.name}</b><small>{item.id}{item.profile_url ? ' · ' + item.profile_url : ''}</small></li>)}</ul>}</section>)}</div>
    </div>;
  }

  function StylingTips() {
    const { token, reload, logout } = React.useContext(AdminContext);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ title: '', category: '比例', content: '', body: '', weather: '', scenes: '', styles: '', counterexamples: '', source_note: '' });
    const load = useCallback(async () => {
      try { setData(await request('/api/v1/admin/styling-tips', token)); setError(''); }
      catch (err) { setError(err.message); if (err.status === 403) logout(); }
    }, [token, logout]);
    useEffect(() => { load(); }, [load, reload]);
    const array = value => value.split(/[,，、]/).map(item => item.trim()).filter(Boolean);
    async function create(event) {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError('');
      try {
        await request('/api/v1/admin/styling-tips', token, undefined, { method: 'POST', body: JSON.stringify({
          title: form.title, category: form.category, content: form.content,
          applicable_body_shapes: array(form.body), applicable_weather: array(form.weather),
          applicable_scenes: array(form.scenes), applicable_styles: array(form.styles),
          counterexamples: form.counterexamples, source_note: form.source_note,
        }) });
        setForm({ title: '', category: '比例', content: '', body: '', weather: '', scenes: '', styles: '', counterexamples: '', source_note: '' });
        await load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    async function review(id, status) {
      setBusy(true); setError('');
      try { await request('/api/v1/admin/styling-tips/' + id + '/review', token, undefined, { method: 'PUT', body: JSON.stringify({ status, review_note: '' }) }); await load(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    const items = data?.items || [];
    return <div className="view"><div className="section-bar"><div><h1>审美小 tips</h1><p>草稿不进入 AI；只有人工通过的规则才会用于搭配。</p></div></div>
      {error && <ErrorNotice error={error} />}
      <form className="panel tips-form" onSubmit={create}><div className="panel-heading"><div><h2>新增搭配规则</h2><p>写清适用条件与反例，方便人工复核。</p></div></div>
        <div className="editor-fields"><label>标题<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：高腰下装抬高视觉腰线" /></label>
          <label>分类<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{['比例', '色彩', '材质', '轮廓', '场景', '天气'].map(item => <option key={item}>{item}</option>)}</select></label>
          <label>适用体型（逗号分隔）<input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="梨形,小个子" /></label>
          <label>适用天气（逗号分隔）<input value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })} placeholder="保暖,下雨" /></label>
          <label>适用场景（逗号分隔）<input value={form.scenes} onChange={e => setForm({ ...form, scenes: e.target.value })} placeholder="通勤,约会" /></label>
          <label>适用风格（逗号分隔）<input value={form.styles} onChange={e => setForm({ ...form, styles: e.target.value })} placeholder="简约,优雅知性" /></label>
        </div>
        <label className="manifest-label">小 tips 内容<textarea required rows="4" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="说明具体搭配方法与视觉效果" /></label>
        <label className="manifest-label">反例/注意<textarea rows="2" value={form.counterexamples} onChange={e => setForm({ ...form, counterexamples: e.target.value })} placeholder="什么情况下不适用" /></label>
        <label className="manifest-label">来源与质检依据<textarea rows="2" value={form.source_note} onChange={e => setForm({ ...form, source_note: e.target.value })} placeholder="书籍、课程、经授权的案例或人工判断依据" /></label>
        <button className="refresh" disabled={busy}>保存为草稿</button>
      </form>
      {!data ? <Loading /> : <section className="panel"><div className="panel-heading"><div><h2>{count(items.length)} 条规则</h2></div></div><div className="tips-list">{items.map(item => <article key={item.id}><div><span className={'status ' + (item.status === 'approved' ? 'ok' : 'attention')}>{({ draft: '草稿', approved: '已通过', rejected: '已拒绝', archived: '已归档' })[item.status]}</span><h3>{item.title}</h3><p>{item.content}</p><Tags items={[item.category, ...item.applicable_body_shapes, ...item.applicable_scenes, ...item.applicable_styles]} /><small>来源：{item.source_note || '未填写'}{item.counterexamples ? ' · 注意：' + item.counterexamples : ''}</small></div>
        <div className="row-actions">{item.status !== 'approved' && <button disabled={busy} onClick={() => review(item.id, 'approved')}>通过</button>}{item.status !== 'rejected' && <button disabled={busy} onClick={() => review(item.id, 'rejected')}>拒绝</button>}{item.status === 'approved' && <button disabled={busy} onClick={() => review(item.id, 'archived')}>归档</button>}</div></article>)}</div></section>}
    </div>;
  }

  function StylingGuides() {
    const { token, reload, logout } = React.useContext(AdminContext);
    const blank = { title: '', category: '身型与比例', goal: '', content: '', formula: '', body: '', weather: '', scenes: '', styles: '', counterexamples: '', source_note: '' };
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState(blank);
    const [editingId, setEditingId] = useState(null);
    const load = useCallback(async () => {
      try { setData(await request('/api/v1/admin/styling-guides', token)); setError(''); }
      catch (err) { setError(err.message); if (err.status === 403) logout(); }
    }, [token, logout]);
    useEffect(() => { load(); }, [load, reload]);
    const array = value => value.split(/[,，、]/).map(item => item.trim()).filter(Boolean);
    const edit = item => {
      setEditingId(item.id);
      setForm({ title: item.title, category: item.category, goal: item.goal, content: item.content,
        formula: item.outfit_formula, body: item.applicable_body_shapes.join('，'),
        weather: item.applicable_weather.join('，'), scenes: item.applicable_scenes.join('，'),
        styles: item.applicable_styles.join('，'), counterexamples: item.counterexamples, source_note: item.source_note });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    async function save(event) {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError('');
      const body = {
        title: form.title, category: form.category, goal: form.goal, content: form.content,
        outfit_formula: form.formula, applicable_body_shapes: array(form.body),
        applicable_weather: array(form.weather), applicable_scenes: array(form.scenes),
        applicable_styles: array(form.styles), counterexamples: form.counterexamples, source_note: form.source_note,
      };
      try {
        await request('/api/v1/admin/styling-guides' + (editingId ? '/' + editingId : ''), token, undefined,
          { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) });
        setForm(blank); setEditingId(null); await load();
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    async function review(id, status) {
      setBusy(true); setError('');
      try { await request('/api/v1/admin/styling-guides/' + id + '/review', token, undefined, { method: 'PUT', body: JSON.stringify({ status, review_note: '' }) }); await load(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    async function remove(id) {
      if (!window.confirm('删除后无法恢复，确认删除这篇搭配攻略？')) return;
      setBusy(true); setError('');
      try { await request('/api/v1/admin/styling-guides/' + id, token, undefined, { method: 'DELETE' }); await load(); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }
    const items = data?.items || [];
    return <div className="view"><div className="section-bar"><div><h1>搭配攻略</h1><p>主资料库：完整方法、组合、步骤与避雷。草稿不进入 AI，审核通过才会参与匹配。</p></div></div>
      {error && <ErrorNotice error={error} />}
      <form className="panel tips-form" onSubmit={save}><div className="panel-heading"><div><h2>{editingId ? '编辑搭配攻略' : '新增搭配攻略'}</h2><p>编辑已通过攻略会自动退回草稿，需重新审核。</p></div></div>
        <div className="editor-fields"><label>标题<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：梨形通勤的上提重心搭配法" /></label>
          <label>分类<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{['身型与比例', '色彩与材质', '场景与风格', '天气与通勤'].map(item => <option key={item}>{item}</option>)}</select></label>
          <label>适用体型（逗号分隔）<input value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="梨形,小个子" /></label>
          <label>适用天气（逗号分隔）<input value={form.weather} onChange={e => setForm({ ...form, weather: e.target.value })} placeholder="保暖,下雨" /></label>
          <label>适用场景（逗号分隔）<input value={form.scenes} onChange={e => setForm({ ...form, scenes: e.target.value })} placeholder="通勤,约会" /></label>
          <label>适用风格（逗号分隔）<input value={form.styles} onChange={e => setForm({ ...form, styles: e.target.value })} placeholder="简约,法式" /></label>
        </div>
        <label className="manifest-label">攻略目标<textarea required rows="2" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} placeholder="这篇攻略要解决什么搭配问题" /></label>
        <label className="manifest-label">衣物组合公式<textarea rows="2" value={form.formula} onChange={e => setForm({ ...form, formula: e.target.value })} placeholder="例如：短上衣 + 高腰直筒裤 + 简洁鞋履" /></label>
        <label className="manifest-label">详细攻略<textarea required rows="7" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="写清搭配方法、执行顺序与为什么有效" /></label>
        <label className="manifest-label">反例/避雷<textarea rows="3" value={form.counterexamples} onChange={e => setForm({ ...form, counterexamples: e.target.value })} placeholder="什么情况下不适用，避免哪些组合" /></label>
        <label className="manifest-label">来源与质检依据<textarea rows="2" value={form.source_note} onChange={e => setForm({ ...form, source_note: e.target.value })} placeholder="书籍、课程、经授权案例或人工判断依据" /></label>
        <div className="editor-actions"><button className="refresh" disabled={busy}>{editingId ? '保存并退回草稿' : '保存为草稿'}</button>{editingId && <button type="button" className="refresh" disabled={busy} onClick={() => { setForm(blank); setEditingId(null); }}>取消编辑</button>}</div>
      </form>
      {!data ? <Loading /> : <section className="panel"><div className="panel-heading"><div><h2>{count(items.length)} 篇攻略</h2><p>攻略优先提供完整方案；小 tips 仅作为基础边界。</p></div></div><div className="tips-list">{items.map(item => <article key={item.id}><div><span className={'status ' + (item.status === 'approved' ? 'ok' : 'attention')}>{({ draft: '草稿', approved: '已通过', rejected: '已拒绝', archived: '已归档' })[item.status]}</span><h3>{item.title}</h3><p><b>目标：</b>{item.goal}</p>{item.outfit_formula && <p><b>组合：</b>{item.outfit_formula}</p>}<p>{item.content}</p><Tags items={[item.category, ...item.applicable_body_shapes, ...item.applicable_weather, ...item.applicable_scenes, ...item.applicable_styles]} /><small>来源：{item.source_note || '未填写'}{item.counterexamples ? ' · 避雷：' + item.counterexamples : ''}</small></div>
        <div className="row-actions"><button disabled={busy} onClick={() => edit(item)}>编辑</button>{item.status !== 'approved' && <button disabled={busy} onClick={() => review(item.id, 'approved')}>通过</button>}{item.status !== 'rejected' && <button disabled={busy} onClick={() => review(item.id, 'rejected')}>拒绝</button>}{item.status === 'approved' && <button disabled={busy} onClick={() => review(item.id, 'archived')}>归档</button>}<button disabled={busy} onClick={() => remove(item.id)}>删除</button></div></article>)}</div></section>}
    </div>;
  }

  function Console({ token, onLogout }) {
    const [tab, setTab] = useState('overview');
    const [refresh, setRefresh] = useState(0);
    const [userId, setUserId] = useState(null);
    const reload = useCallback(() => setRefresh(n => n + 1), []);
    const pages = useMemo(() => ({ overview: '总览', users: '用户', bloggers: '博主', guides: '搭配攻略', tips: '审美小 tips', quality: '数据质量' }), []);
    const content = userId ? <UserDetail token={token} userId={userId} onBack={() => setUserId(null)} /> :
      tab === 'overview' ? <Overview onUser={(id) => { setTab('users'); setUserId(id); }} /> :
      tab === 'users' ? <Users token={token} onUser={setUserId} /> :
      tab === 'bloggers' ? <Bloggers token={token} /> : tab === 'guides' ? <StylingGuides /> : tab === 'tips' ? <StylingTips /> : <Quality />;
    return <AdminContext.Provider value={{ token, refresh, logout: onLogout, reload }}><div className="admin-shell"><aside><div className="brand"><span>衣见</span><small>运营台 · 本地管理</small></div><nav aria-label="运营台导航">{Object.entries(pages).map(([key, label]) => <button aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'active' : ''} key={key} onClick={() => { setUserId(null); setTab(key); }}>{label}</button>)}</nav><div className="side-footer"><span className="live">本地开发环境</span></div></aside><main><header><div><p>运营工作台</p><strong>{userId ? '用户详情' : pages[tab]}</strong></div><div className="header-actions"><button className="refresh" onClick={reload}>刷新</button><button className="refresh" onClick={onLogout}>退出</button></div></header>{content}</main></div></AdminContext.Provider>;
  }

  function Login({ onLogin }) {
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit(event) {
      event.preventDefault();
      if (busy) return;
      const token = new FormData(event.currentTarget).get('token').trim();
      setError(''); setBusy(true);
      try {
        await request('/api/v1/admin/overview', token);
        try { sessionStorage.setItem(TOKEN_KEY, token); } catch (_) {}
        onLogin(token);
      } catch (err) { setError(err.status === 403 ? '管理员令牌不正确。' : err.message); }
      finally { setBusy(false); }
    }
    return <div className="login"><form onSubmit={submit}><p className="eyebrow">衣见 · 本地开发</p><h1>运营台</h1><p>输入本机 .env.local 中的管理员令牌后进入。令牌仅保留在当前浏览器会话中。</p><label>管理员令牌<input name="token" type="password" required autoComplete="current-password" autoFocus /></label>{error && <div role="alert" className="login-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? '验证中…' : '进入运营台'}</button></form></div>;
  }

  function App() {
    const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } });
    const logout = useCallback(() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {} setToken(''); }, []);
    return token ? <Console token={token} onLogout={logout} /> : <Login onLogin={setToken} />;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
