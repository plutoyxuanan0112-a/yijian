/* @jsxRuntime classic */
/* global React, ReactDOM */
(function () {
  const { useEffect, useMemo, useState } = React;
  const API = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:8000"
    : location.origin;
  const statusText = {
    draft: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    archived: "已归档",
  };
  const statusClass = {
    draft: "draft",
    approved: "approved",
    rejected: "rejected",
    archived: "archived",
  };
  const typeText = { guide: "搭配规则", tip: "基础边界" };

  function tags(item) {
    return [
      item.category,
      ...(item.applicable_body_shapes || []),
      ...(item.applicable_weather || []),
      ...(item.applicable_scenes || []),
      ...(item.applicable_styles || []),
    ].filter(Boolean);
  }

  function sourceMeta(item) {
    const note = item.source_note || "";
    const author =
      note.match(/小红书作者：([^；]+)/)?.[1] ||
      note.match(/小红书博主：([^｜；]+)/)?.[1] ||
      "";
    const originalTitle = note.match(/原笔记标题：([^；]+)/)?.[1] || "";
    const url =
      note.match(
        /https:\/\/www\.xiaohongshu\.com\/explore\/[A-Za-z0-9]+/,
      )?.[0] || "";
    return { author, originalTitle, url };
  }

  function App() {
    const [items, setItems] = useState([]);
    const [status, setStatus] = useState("draft");
    const [kind, setKind] = useState("all");
    const [category, setCategory] = useState("all");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          API + "/api/v1/dev/library?status=" + status,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "资料库读取失败");
        setItems(data.items || []);
        setError("");
      } catch (err) {
        setError(err.message || "无法连接本地后端");
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      load();
    }, [status]);

    const categories = useMemo(
      () =>
        [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
      [items],
    );

    const visibleItems = useMemo(
      () =>
        items.filter((item) => {
          const matchedKind = kind === "all" || item.kind === kind;
          const matchedCategory =
            category === "all" || item.category === category;
          const text = [
            item.title,
            item.goal,
            item.content,
            item.source_note,
            ...tags(item),
          ]
            .join(" ")
            .toLowerCase();
          return (
            matchedKind &&
            matchedCategory &&
            text.includes(query.trim().toLowerCase())
          );
        }),
      [items, kind, category, query],
    );

    async function review(item, nextStatus) {
      const note =
        nextStatus === "rejected"
          ? window.prompt("填写驳回原因（会保存到资料记录）：", "")
          : "";
      if (nextStatus === "rejected" && note === null) return;
      setBusyId(item.kind + item.id);
      try {
        const response = await fetch(
          API + "/api/v1/dev/library/" + item.kind + "/" + item.id + "/review",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: nextStatus,
              review_note: note || "",
            }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "审核操作失败");
        await load();
      } catch (err) {
        setError(err.message || "审核操作失败");
      } finally {
        setBusyId(null);
      }
    }

    return (
      <main>
        <header>
          <div>
            <p className="eyebrow">开发期资料库</p>
            <h1>搭配规则审核</h1>
            <p className="intro">
              只有“已通过”的内容会进入搭配生成。当前页面仅在开发环境可用，上线后仍使用受令牌保护的管理后台。
            </p>
          </div>
          <button className="refresh" onClick={load} disabled={loading}>
            刷新
          </button>
        </header>
        <section className="filters" aria-label="筛选资料">
          <div className="segmented">
            {Object.keys(statusText).map((value) => (
              <button
                key={value}
                className={status === value ? "selected" : ""}
                onClick={() => setStatus(value)}
              >
                {statusText[value]}
              </button>
            ))}
          </div>
          <div className="category-tabs" aria-label="按资料分类筛选">
            <button
              className={category === "all" ? "selected" : ""}
              onClick={() => setCategory("all")}
            >
              全部分类
            </button>
            {categories.map((value) => (
              <button
                key={value}
                className={category === value ? "selected" : ""}
                onClick={() => setCategory(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="filter-row">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              aria-label="资料类型"
            >
              <option value="all">全部类型</option>
              <option value="guide">搭配规则</option>
              <option value="tip">基础边界</option>
            </select>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="资料分类"
            >
              <option value="all">全部分类</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索场景、风格、身材或来源"
            />
            <strong>{visibleItems.length} 条</strong>
          </div>
        </section>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <p className="state">正在读取资料…</p>
        ) : !visibleItems.length ? (
          <p className="state">没有符合条件的资料</p>
        ) : (
          <section className="list">
            {visibleItems.map((item) => {
              const source = sourceMeta(item);
              return (
                <article key={item.kind + item.id}>
                  <div className="item-head">
                    <div>
                      <span className="kind">{typeText[item.kind]}</span>
                      <span className={"status " + statusClass[item.status]}>
                        {statusText[item.status]}
                      </span>
                    </div>
                    <span className="id">#{item.id}</span>
                  </div>
                  <h2>{item.title}</h2>
                  {item.goal && <p className="goal">{item.goal}</p>}
                  {item.outfit_formula && (
                    <p className="formula">组合：{item.outfit_formula}</p>
                  )}
                  <p className="content">{item.content}</p>
                  <div className="tags">
                    {tags(item).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  {item.counterexamples && (
                    <p className="warning">边界：{item.counterexamples}</p>
                  )}
                  <div className="source">
                    <span>来源与证据</span>
                    {source.originalTitle && (
                      <p>原笔记：{source.originalTitle}</p>
                    )}
                    {source.author && <p>作者：{source.author}</p>}
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        打开小红书原笔记
                      </a>
                    ) : (
                      <p>{item.source_note || "未填写，暂不建议通过"}</p>
                    )}
                  </div>
                  {item.review_note && (
                    <p className="review-note">审核备注：{item.review_note}</p>
                  )}
                  <footer>
                    {item.status !== "approved" && (
                      <button
                        className="approve"
                        disabled={busyId === item.kind + item.id}
                        onClick={() => review(item, "approved")}
                      >
                        通过
                      </button>
                    )}
                    {item.status !== "rejected" && (
                      <button
                        className="reject"
                        disabled={busyId === item.kind + item.id}
                        onClick={() => review(item, "rejected")}
                      >
                        驳回
                      </button>
                    )}
                    {item.status === "approved" && (
                      <button
                        className="archive"
                        disabled={busyId === item.kind + item.id}
                        onClick={() => review(item, "archived")}
                      >
                        归档
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </section>
        )}
      </main>
    );
  }
  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
})();
