/* =========================================================
   卡片博客 · 前台引擎（无依赖）
   ---------------------------------------------------------
   数据文件：
     data/site.json    站点信息 / 公告 / 联系方式 / 关于页
     data/posts.json   文章（含分类、标签、封面、置顶、草稿）
     data/moments.json 说说
     data/photos.json  相册
     data/links.json   友链
   ---------------------------------------------------------
   页面通过 <body data-page="home|posts|article|archive|category|tag|photos|moments|links|about|search|404">
   指定渲染类型，其余全部由本文件根据数据生成。
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- 基础路径（兼容 GitHub Pages 子路径与本地预览） ---------------- */
  function detectBase() {
    var path = location.pathname;
    if (location.protocol === "file:") return path.replace(/[^/]*$/, "");
    var markers = ["/index.html", "/posts.html", "/article.html", "/archive.html", "/category.html", "/tag.html",
      "/photos.html", "/moments.html", "/links.html", "/about.html", "/search.html", "/admin.html", "/404.html"];
    for (var i = 0; i < markers.length; i++) {
      var idx = path.indexOf(markers[i]);
      if (idx !== -1) return path.slice(0, idx + 1);
    }
    return path.replace(/[^/]*$/, "");
  }
  var BASE = detectBase();
  window.__BLOG_BASE__ = BASE;
  function abs(p) { return BASE + String(p || "").replace(/^\.?\//, ""); }
  function asset(p) { return p ? (/^(https?:|data:|blob:)/.test(p) ? p : abs(p)) : ""; }

  /* ---------------- 工具 ---------------- */
  var MONTH = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function parseDate(s) { var d = new Date((s || "") + "T00:00:00"); return isNaN(d) ? null : d; }
  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return s || "";
    var now = new Date();
    var sameYear = d.getFullYear() === now.getFullYear();
    return sameYear ? (d.getMonth() + 1) + "月" + d.getDate() + "日" : d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  function fmtFull(s) { var d = parseDate(s); return d ? d.getFullYear() + "年" + MONTH[d.getMonth()] + pad(d.getDate()) + "日" : (s || ""); }
  function fmtMD(s) { var d = parseDate(s); return d ? pad(d.getMonth() + 1) + "-" + pad(d.getDate()) : s; }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function daysBetween(a, b) { var x = parseDate(a), y = parseDate(b); return x && y ? Math.max(0, Math.round((y - x) / 864e5)) : 0; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function stripHtml(s) { var t = document.createElement("div"); t.innerHTML = s || ""; return (t.textContent || "").replace(/\s+/g, " ").trim(); }
  function readingMinutes(html) { return Math.max(1, Math.round(stripHtml(html).replace(/\s/g, "").length / 400)); }
  function qs(key) {
    var m = new RegExp("[?&]" + key + "=([^&#]*)").exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }
  function fmtNum(n) {
    n = Number(n || 0);
    return n >= 10000 ? (n / 10000).toFixed(1) + "万" : String(n);
  }

  /* ---------------- 线性图标（inline SVG，无外部依赖） ---------------- */
  var PATHS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 18z"/>',
    tag: '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8" cy="8" r="1.4"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3L16 12l3 3"/>',
    chat: '<path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.1A7.5 7.5 0 1 1 20 12z"/>',
    link: '<path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.4 6.4"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.2-3.7 4-5.6 7.5-5.6s6.3 1.9 7.5 5.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>',
    pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
    like: '<path d="M7 21V10l5-7 1 1v6h6a2 2 0 0 1 2 2.3l-1.3 6.4A2 2 0 0 1 17.7 21z"/><path d="M7 10H3v11h4"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14.5H6a2 2 0 0 0-2 2z"/><path d="M4 18.5V20h15"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 8h.01"/>',
    megaphone: '<path d="M4 10v4l11 5V5z"/><path d="M15 6a3 3 0 0 1 0 12"/>',
    github: '<path d="M9.5 20v-3.2c-3 .6-3.6-1.4-3.6-1.4-.5-1.2-1.2-1.5-1.2-1.5-1-.7 0-.7 0-.7 1 .1 1.6 1.1 1.6 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.4-.3-4.9-1.2-4.9-5.3 0-1.2.4-2.1 1.1-2.9-.1-.3-.5-1.4.1-2.9 0 0 .9-.3 3 1.1a10 10 0 0 1 5.4 0c2.1-1.4 3-1.1 3-1.1.6 1.5.2 2.6.1 2.9.7.8 1.1 1.7 1.1 2.9 0 4.1-2.5 5-4.9 5.3.4.4.7 1 .7 2V20"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    rss: '<path d="M5 19h.01"/><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    fire: '<path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-4.4-4.5-6.3-4-11.8-2.6 1.2-4.2 3.4-4.2 5.6 0 1.2.4 2 .9 2.6-1 0-2.4-1-3-2.3-.8 1.3-2.7 3.2-2.7 5.9C5.5 18.4 8.1 21 12 21z"/>'
  };
  function icon(name, cls) {
    var p = PATHS[name] || PATHS.info;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"' +
      (cls ? ' class="' + cls + '"' : "") + ">" + p + "</svg>";
  }

  /* ---------------- 迷你 Markdown（用于说说、站点简介等信息文本） ---------------- */
  function md(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0, inList = false, inCode = false, codeBuf = [];
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, txt, href) {
        var safe = /^(https?:|mailto:|\/|#|\.)/i.test(href) ? href : "#";
        return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>";
      });
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        if (!inCode) { closeList(); inCode = true; codeBuf = []; }
        else { inCode = false; out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>"); }
        i++; continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      var h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) { closeList(); out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }
      var bq = /^>\s?(.*)$/.exec(line);
      if (bq) {
        closeList(); var buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
        out.push("<blockquote><p>" + buf.map(inline).join("<br>") + "</p></blockquote>"); continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + inline(line.replace(/^\s*[-*+]\s+/, "")) + "</li>"); i++; continue;
      }
      closeList();
      out.push("<p>" + inline(line) + "</p>");
      i++;
    }
    closeList();
    return out.join("\n");
  }

  /* ---------------- 状态与数据 ---------------- */
  var state = {
    site: {},
    posts: [],
    moments: [],
    photos: [],
    links: [],
    ready: false
  };

  function loadJSON(path, fallback) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " (" + r.status + ")");
      return r.json();
    }).catch(function (e) {
      console.warn("[blog] " + e.message);
      return fallback;
    });
  }

  function normalizePost(p, i) {
    return {
      slug: p.slug || "post-" + i,
      title: p.title || "未命名",
      summary: p.summary || stripHtml(p.content || "").slice(0, 90),
      content: p.content || "",
      date: p.date || todayStr(),
      updated: p.updated || p.date || todayStr(),
      category: p.category || "未分类",
      tags: Array.isArray(p.tags) ? p.tags : [],
      cover: p.cover || "",
      draft: p.draft === true,
      pinned: p.pinned === true,
      views: Number(p.views || 0),
      likes: Number(p.likes || 0)
    };
  }

  function sortPosts(list) {
    return list.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.date).localeCompare(String(a.date));
    });
  }
  function visiblePosts() { return sortPosts(state.posts.filter(function (p) { return !p.draft; })); }
  function findPost(slug) { return state.posts.filter(function (p) { return p.slug === slug; })[0] || null; }
  function categories() {
    var map = {};
    visiblePosts().forEach(function (p) { map[p.category] = (map[p.category] || 0) + 1; });
    return Object.keys(map).map(function (k) { return { name: k, count: map[k] }; }).sort(function (a, b) { return b.count - a.count; });
  }
  function tags() {
    var map = {};
    visiblePosts().forEach(function (p) { (p.tags || []).forEach(function (t) { map[t] = (map[t] || 0) + 1; }); });
    return Object.keys(map).map(function (k) { return { name: k, count: map[k] }; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }
  function totalViews() { return state.posts.reduce(function (s, p) { return s + (p.views || 0); }, 0); }

  /* ---------------- 公共片段 ---------------- */
  function pageHeader(title, desc) {
    return '<header class="page-head"><div class="wrap"><h1>' + esc(title) + "</h1>" +
      (desc ? "<p>" + esc(desc) + "</p>" : "") + "</div></header>";
  }

  function postCardHTML(p, index) {
    var cover = p.cover
      ? '<img src="' + esc(asset(p.cover)) + '" alt="' + esc(p.title) + '" loading="lazy">'
      : "";
    var tagsHtml = (p.tags || []).filter(function (t) { return t !== p.category; }).slice(0, 3).map(function (t) {
      return '<a class="tag-chip" href="' + abs("tag.html") + "?name=" + encodeURIComponent(t) + '">' + icon("tag") + esc(t) + "</a>";
    }).join("");
    return '<article class="card hoverable post-card reveal' + (index % 2 ? " rev" : "") + '">' +
      '<a class="post-cover" href="' + abs("article.html") + "?slug=" + encodeURIComponent(p.slug) + '" aria-label="' + esc(p.title) + '">' + cover + "</a>" +
      '<div class="post-body">' +
        '<a href="' + abs("article.html") + "?slug=" + encodeURIComponent(p.slug) + '"><h2 class="post-title">' + esc(p.title) + "</h2></a>" +
        '<div class="post-meta">' +
          (p.pinned ? '<span class="pin">' + icon("pin") + "置顶</span>" : "") +
          "<span>" + icon("calendar") + "发表于 " + esc(fmtDate(p.date)) + "</span>" +
          "<span>" + icon("edit") + "更新于 " + esc(fmtDate(p.updated)) + "</span>" +
          "<span>" + icon("folder") + esc(p.category) + "</span>" +
          "<span>" + icon("eye") + esc(fmtNum(p.views)) + "</span>" +
          "<span>" + icon("like") + esc(fmtNum(p.likes)) + "</span>" +
        "</div>" +
        '<p class="post-desc">' + esc(p.summary) + "</p>" +
        '<div class="post-foot">' + tagsHtml +
          '<a class="chip-cat" href="' + abs("category.html") + "?name=" + encodeURIComponent(p.category) + '">' +
          icon("folder") + esc(p.category) + "</a>" +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function pagerHTML(total, page, size, target) {
    var pages = Math.max(1, Math.ceil(total / size));
    if (pages <= 1) return "";
    var out = [];
    var from = Math.max(1, page - 2), to = Math.min(pages, from + 4);
    from = Math.max(1, to - 4);
    out.push('<button data-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">上一页</button>");
    if (from > 1) out.push('<button data-page="1">1</button><span class="info">…</span>');
    for (var i = from; i <= to; i++) out.push('<button data-page="' + i + '"' + (i === page ? ' class="active"' : "") + ">" + i + "</button>");
    if (to < pages) out.push('<span class="info">…</span><button data-page="' + pages + '">' + pages + "</button>");
    out.push('<button data-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">下一页</button>");
    out.push('<span class="info">共 ' + total + " 篇 · 第 " + page + "/" + pages + " 页</span>");
    return '<div class="pager" data-target="' + (target || "list") + '">' + out.join("") + "</div>";
  }

  function bindPager(container, onChange) {
    if (!container) return;
    container.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-page]");
      if (!btn || btn.disabled) return;
      onChange(Number(btn.dataset.page));
    });
  }

  /* ---------------- 站点公共元素 ---------------- */
  var NAV_ITEMS = [
    { page: "home", href: "index.html", label: "主页", icon: "home" },
    { page: "archive", href: "archive.html", label: "时间轴", icon: "clock" },
    { page: "posts", href: "posts.html", label: "文章", icon: "list" },
    { page: "category", href: "category.html", label: "分类", icon: "folder" },
    { page: "tag", href: "tag.html", label: "标签", icon: "tag" },
    { page: "photos", href: "photos.html", label: "相册", icon: "image" },
    { page: "moments", href: "moments.html", label: "说说", icon: "chat" },
    { page: "links", href: "links.html", label: "友链", icon: "link" },
    { page: "about", href: "about.html", label: "关于", icon: "user" }
  ];

  function renderChrome() {
    var current = document.body.getAttribute("data-page") || "";
    // 404 / admin 等不在导航里的页面，回退到 index 高亮，避免导航「全都不选中」的怪异状态
    var navPage = NAV_ITEMS.some(function (it) { return it.page === current; }) ? current : "home";
    var nav = document.getElementById("siteNav");
    if (nav) {
      nav.innerHTML = NAV_ITEMS.map(function (it) {
        return '<a href="' + it.href + '" class="' + (it.page === navPage ? "active" : "") + '"' +
          (it.page === navPage ? ' aria-current="page"' : "") + ">" + icon(it.icon) + esc(it.label) + "</a>";
      }).join("");
    }
    var mnav = document.getElementById("mobileNav");
    if (mnav) {
      mnav.innerHTML = NAV_ITEMS.map(function (it) {
        return '<a href="' + it.href + '" class="' + (it.page === navPage ? "active" : "") + '">' + esc(it.label) + "</a>";
      }).join("") + '<a href="search.html">搜索</a><a href="admin.html">后台管理</a>';
    }
    var sb = document.getElementById("searchBtn");
    if (sb) sb.addEventListener("click", function () { location.href = abs("search.html"); });
    var mb = document.getElementById("menuBtn");
    if (mb) mb.addEventListener("click", function () {
      var open = document.getElementById("mobileNav").classList.toggle("open");
      mb.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) document.getElementById("siteHeader").classList.add("solid");
    });
    var nameEls = document.querySelectorAll("[data-site='name']");
    nameEls.forEach(function (el) { if (state.site.name) el.textContent = state.site.name; });
    var markEls = document.querySelectorAll("[data-site='mark']");
    markEls.forEach(function (el) { if (state.site.mark || state.site.name) el.textContent = state.site.mark || state.site.name.slice(0, 1); });
    // 首页大标题与滚动公告同样来自站点数据，原来只有首次加载的静态文案，后台改了不生效
    var heroTitleEls = document.querySelectorAll("[data-site='heroTitle']");
    heroTitleEls.forEach(function (el) { if (state.site.heroTitle) el.textContent = state.site.heroTitle; });
    var noticeEls = document.querySelectorAll("[data-site='notice']");
    noticeEls.forEach(function (el) { if (state.site.notice) el.textContent = state.site.notice; });
    var yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    var footLinks = document.getElementById("footerLinks");
    if (footLinks) {
      footLinks.innerHTML = [["关于我", "about.html"], ["全部文章", "posts.html"], ["RSS", "rss.xml"], ["留言板", "moments.html"], ["后台", "admin.html"]]
        .map(function (x) { return '<a href="' + x[1] + '">' + x[0] + "</a>"; }).join("");
    }
    var footName = document.getElementById("footerName");
    if (footName) footName.textContent = state.site.name || "";
  }

  function initThemeAndScroll() {
    var html = document.documentElement;
    var saved = null;
    try { saved = localStorage.getItem("card-blog-theme"); } catch (e) { saved = null; }
    if (saved) html.setAttribute("data-theme", saved);
    else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) html.setAttribute("data-theme", "dark");

    var themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.addEventListener("click", function () {
      var next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      try { localStorage.setItem("card-blog-theme", next); } catch (e) { /* ignore */ }
    });

    var header = document.getElementById("siteHeader");
    var hero = document.querySelector(".hero");
    var top = document.querySelector(".to-top");
    var bar = document.getElementById("progress");
    function onScroll() {
      var y = window.scrollY || 0;
      if (header) {
        var solid = !hero || y > (hero.offsetHeight - 80);
        header.classList.toggle("solid", solid);
      }
      if (top) top.classList.toggle("show", y > 600);
      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + "%";
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    if (top) top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

    var down = document.getElementById("scrollDown");
    if (down) down.addEventListener("click", function () {
      var target = document.getElementById("mainStart");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  var io = null;
  function observeReveal() {
    var els = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    }
    els.forEach(function (e) { io.observe(e); });
  }

  /* =========================================================
     交互动效（纯原生实现）
     - 点击涟漪
     - 同批次元素错峰入场
     - 页面切换淡出后再跳转
     - 图片淡入
     - 首屏跟随鼠标的柔光
     全部尊重 prefers-reduced-motion
     ========================================================= */
  var reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ---------- 1. 点击涟漪 ---------- */
  var RIPPLE_SEL = ".card, .pill, .pager button, .icon-btn, .nav a, .nav-mobile a, .brand," +
    " .tag-chip, .chip-cat, .hero-chip, .prev-next a, .profile-stats a, .profile-links a," +
    " .site-footer a, .toc-card a, .timeline a, .lightbox button, .hero-scroll, .to-top," +
    " .btn-primary, .ghost, .mini, .quick, .link-btn, .admin-menu button";

  function rippleAt(el, clientX, clientY) {
    if (reduceMotion) return;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // 涟漪尺寸按元素最长边计算，保证能铺满
    var size = Math.max(rect.width, rect.height) * 2;
    var span = document.createElement("span");
    span.className = "ripple";
    var x = (typeof clientX === "number" ? clientX : rect.left + rect.width / 2) - rect.left;
    var y = (typeof clientY === "number" ? clientY : rect.top + rect.height / 2) - rect.top;
    span.style.width = span.style.height = size + "px";
    span.style.left = (x - size / 2) + "px";
    span.style.top = (y - size / 2) + "px";
    el.appendChild(span);
    // 动画结束即移除，避免 DOM 无限增长
    span.addEventListener("animationend", function () { span.remove(); });
    setTimeout(function () { if (span.parentNode) span.remove(); }, 900);
  }

  function initRipples() {
    // 用事件委托，动态生成的卡片也能生效
    document.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var host = e.target.closest(RIPPLE_SEL);
      if (!host || host.disabled) return;
      // 涟漪容器必须能裁切，否则会溢出到卡片外
      var pos = getComputedStyle(host).position;
      if (pos === "static") host.style.position = "relative";
      rippleAt(host, e.clientX, e.clientY);
    }, { passive: true });
    // 键盘回车/空格触发时，从中心扩散一圈
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var host = e.target.closest && e.target.closest(RIPPLE_SEL);
      if (host && host.tagName === "BUTTON") rippleAt(host);
    });
  }

  /* ---------- 2. 同批次元素错峰入场 ---------- */
  function staggerReveal(scope) {
    var groups = {};
    (scope || document).querySelectorAll(".reveal").forEach(function (el) {
      var key = (el.parentNode && el.parentNode.className) || "";
      (groups[key] = groups[key] || []).push(el);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].forEach(function (el, i) {
        // 每项延后 55ms，最多累计 6 项，避免长列表等太久
        el.style.setProperty("--d", Math.min(i, 6) * 55 + "ms");
      });
    });
  }

  /* ---------- 3. 图片淡入 ---------- */
  function initImageFade() {
    function mark(img) { img.classList.add("img-ready"); }
    document.querySelectorAll("img[loading='lazy'], .post-cover img, .photo-item img, .talk-imgs img, .profile-avatar")
      .forEach(function (img) {
        if (img.dataset.fadeBound) return;
        img.dataset.fadeBound = "1";
        if (img.complete && img.naturalWidth > 0) return mark(img);
        img.addEventListener("load", function () { mark(img); }, { once: true });
        // 加载失败时也显示，避免占位为空白
        img.addEventListener("error", function () { mark(img); }, { once: true });
      });
  }

  /* ---------- 4. 页面切换：淡出后跳转 ---------- */
  function initPageTransition() {
    if (reduceMotion) return;
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest("a[href]");
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || a.target === "_blank" || a.hasAttribute("download")) return;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      var url;
      try { url = new URL(a.href, location.href); } catch (err) { return; }
      // 只处理同源页面跳转；带 hash 的锚点滚动交给浏览器
      if (url.origin !== location.origin || url.hash) return;
      var samePage = url.pathname === location.pathname && url.search === location.search;
      if (samePage) return;
      // 外部链接由 target="_blank" 处理；站内 a[target] 一律放行
      e.preventDefault();
      document.body.classList.add("page-exit");
      setTimeout(function () { location.href = url.href; }, 160);
    });
    // 从浏览器「后退」回到页面时移除淡出状态，否则页面是透明的
    window.addEventListener("pageshow", function () {
      document.body.classList.remove("page-exit");
    });
  }

  /* ---------- 5. 首屏柔光跟随鼠标 + 主题切换动效 ---------- */
  function initHeroLight() {
    var hero = document.querySelector(".hero");
    if (!hero || reduceMotion) return;
    var ticking = false;
    hero.addEventListener("pointermove", function (e) {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var r = hero.getBoundingClientRect();
        hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
        hero.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
        ticking = false;
      });
    }, { passive: true });
  }

  function initThemeAnim() {
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (reduceMotion) return;
      document.documentElement.classList.add("theme-switching", "switch-theme");
      setTimeout(function () { document.documentElement.classList.remove("switch-theme"); }, 600);
      setTimeout(function () { document.documentElement.classList.remove("theme-switching"); }, 450);
    });
  }

  function initMotion() {
    initRipples();
    initImageFade();
    initPageTransition();
    initHeroLight();
    initThemeAnim();
  }

  /* ---------------- 首页首屏 ---------------- */
  function initHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    var site = state.site;
    var titleEl = hero.querySelector(".hero-title");
    if (titleEl && site.heroTitle) titleEl.textContent = site.heroTitle;
    var bg = hero.querySelector(".hero-bg");
    if (bg && site.heroImage) bg.style.backgroundImage = 'url("' + asset(site.heroImage) + '")';
    else if (bg) bg.style.backgroundImage = "linear-gradient(135deg,#2b3d5c,#3f7f8f 55%,#1b2b45)";

    var subEl = hero.querySelector(".hero-sub");
    var lines = (site.heroSays && site.heroSays.length ? site.heroSays : ["记录代码与生活的碎片。"]).filter(Boolean);
    if (subEl) {
      var li = 0, ci = 0, deleting = false, textNode = document.createElement("span");
      var caret = document.createElement("span");
      caret.className = "caret";
      subEl.innerHTML = "";
      subEl.appendChild(textNode);
      subEl.appendChild(caret);
      (function tick() {
        var cur = lines[li % lines.length] || "";
        if (!deleting) {
          ci++;
          textNode.textContent = cur.slice(0, ci);
          if (ci >= cur.length) { deleting = true; return setTimeout(tick, 2200); }
          return setTimeout(tick, 110);
        }
        ci--;
        textNode.textContent = cur.slice(0, ci);
        if (ci <= 0) { deleting = false; li++; return setTimeout(tick, 420); }
        return setTimeout(tick, 45);
      })();
    }

    var meta = hero.querySelector(".hero-meta");
    if (meta) {
      var days = site.startDate ? daysBetween(site.startDate, todayStr()) : null;
      var chips = [
        '<span class="hero-chip">' + icon("book") + "<b>" + visiblePosts().length + "</b> 篇文章</span>",
        '<a class="hero-chip" href="' + abs("category.html") + '">' + icon("folder") + "<b>" + categories().length + "</b> 个分类</a>",
        '<a class="hero-chip" href="' + abs("tag.html") + '">' + icon("tag") + "<b>" + tags().length + "</b> 个标签</a>"
      ];
      if (days !== null) chips.push('<span class="hero-chip">' + icon("clock") + "已运行 <b>" + days + "</b> 天</span>");
      meta.innerHTML = chips.join("");
    }
  }

  /* ---------------- 首页 ---------- */
  function renderHome() {
    if (document.body.getAttribute("data-page") !== "home") return;
    var listEl = document.getElementById("homeList");
    var pagerEl = document.getElementById("homePager");
    var size = Number((state.site.homePageSize || 5));
    var page = Math.max(1, Number(qs("page") || 1));
    var all = visiblePosts();

    if (listEl) {
      var slice = all.slice((page - 1) * size, page * size);
      listEl.innerHTML = slice.length
        ? slice.map(function (p, i) { return postCardHTML(p, i); }).join("")
        : '<div class="card empty-state">' + icon("book") + "<p>还没有文章，去 <a href=\"" + abs("admin.html") + '">后台</a> 发布第一篇吧。</p></div>';
      if (pagerEl) pagerEl.innerHTML = pagerHTML(all.length, page, size, "home");
      bindPager(pagerEl, function (n) { location.href = n === 1 ? abs("index.html") : abs("index.html") + "?page=" + n; });
      observeReveal();
      staggerReveal();
      initImageFade();
    }

    renderSidebar();
  }

  function renderSidebar() {
    // 文章详情页的侧栏容器与首页不同
    var side = document.getElementById("sideCol") || document.getElementById("sideColWrap");
    if (!side) return;
    var site = state.site;
    var days = site.startDate ? daysBetween(site.startDate, todayStr()) : null;
    var topTags = tags().slice(0, 14);
    var cards = [];

    // 个人信息卡
    cards.push('<section class="card profile-card reveal">' +
      '<div class="profile-banner"' + (site.profileBanner ? ' style="background-image:url(\'' + esc(asset(site.profileBanner)) + '\')"' : "") + "></div>" +
      '<div class="profile-body">' +
        '<img class="profile-avatar" src="' + esc(asset(site.avatar || "assets/avatar.svg")) + '" alt="头像">' +
        '<h3 class="profile-name">' + esc(site.name || "我的博客") + "</h3>" +
        '<p class="profile-say">' + esc(site.slogan || "") + "</p>" +
        '<div class="profile-stats">' +
          '<a href="' + abs("posts.html") + '"><b>' + state.posts.filter(function (p) { return !p.draft; }).length + "</b><span>文章</span></a>" +
          '<a href="' + abs("category.html") + '"><b>' + categories().length + "</b><span>分类</span></a>" +
          '<a href="' + abs("tag.html") + '"><b>' + tags().length + "</b><span>标签</span></a>" +
        "</div>" +
        '<div class="profile-links">' +
          ((site.links && site.links.length) ? site.links.map(function (l) {
            return '<a href="' + esc(l.url || "#") + '" title="' + esc(l.label || "") + '" target="_blank" rel="noopener">' + icon(l.icon || "link") + "</a>";
          }).join("") : "") +
        "</div>" +
      "</div>" +
    "</section>");

    // 公告
    if (site.notice) {
      cards.push('<section class="card pad reveal">' +
        '<h3 class="card-title">' + icon("megaphone") + "公告</h3>" +
        '<p class="notice-text">' + esc(site.notice) + "</p></section>");
    }

    // 标签
    if (topTags.length) {
      cards.push('<section class="card pad reveal">' +
        '<h3 class="card-title">' + icon("tag") + "标签</h3>" +
        '<div class="tag-cloud">' + topTags.map(function (t, i) {
          var c = ["var(--primary)", "var(--accent)", "var(--ink-2)", "var(--top)"][i % 4];
          return '<a href="' + abs("tag.html") + "?name=" + encodeURIComponent(t.name) + '" style="color:' + c + '">' + esc(t.name) + '<span class="n">' + t.count + "</span></a>";
        }).join("") + "</div></section>");
    }

    // 站点资讯
    cards.push('<section class="card pad reveal">' +
      '<h3 class="card-title">' + icon("info") + "网站资讯</h3>" +
      '<div class="info-list">' +
        "<div><span>文章数目</span><b>" + state.posts.filter(function (p) { return !p.draft; }).length + "</b></div>" +
        (days !== null ? "<div><span>运行时间</span><b>" + days + " 天</b></div>" : "") +
        "<div><span>累计阅读</span><b>" + fmtNum(totalViews()) + "</b></div>" +
        "<div><span>说说数目</span><b>" + state.moments.length + "</b></div>" +
        "<div><span>相册图片</span><b>" + state.photos.length + "</b></div>" +
      "</div></section>");

    side.innerHTML = cards.join("");
  }

  /* ---------------- 文章列表（含搜索/筛选） ---------------- */
  function renderPostsPage() {
    if (document.body.getAttribute("data-page") !== "posts") return;
    var listEl = document.getElementById("postList");
    var pagerEl = document.getElementById("postPager");
    var catsEl = document.getElementById("catFilter");
    var input = document.getElementById("searchInput");
    var size = 6;
    var page = 1;
    var cat = qs("cat") || "";
    var tag = qs("tag") || "";
    var keyword = qs("q") || "";
    if (input) input.value = keyword;

    if (catsEl) {
      var cs = categories();
      catsEl.innerHTML = '<button class="pill' + (!cat ? " active" : "") + '" data-cat="">全部<span class="n">' + visiblePosts().length + "</span></button>" +
        cs.map(function (c) {
          return '<button class="pill' + (cat === c.name ? " active" : "") + '" data-cat="' + esc(c.name) + '">' + esc(c.name) + '<span class="n">' + c.count + "</span></button>";
        }).join("");
      catsEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-cat]");
        if (!b) return;
        cat = b.dataset.cat; page = 1;
        catsEl.querySelectorAll(".pill").forEach(function (x) { x.classList.toggle("active", x === b); });
        paint();
      });
    }

    function filtered() {
      return visiblePosts().filter(function (p) {
        if (cat && p.category !== cat) return false;
        if (tag && (p.tags || []).indexOf(tag) === -1) return false;
        if (keyword) {
          var hay = (p.title + " " + p.summary + " " + stripHtml(p.content) + " " + p.category + " " + (p.tags || []).join(" ")).toLowerCase();
          if (hay.indexOf(keyword.toLowerCase()) === -1) return false;
        }
        return true;
      });
    }

    function paint() {
      var all = filtered();
      var slice = all.slice((page - 1) * size, page * size);
      var tip = document.getElementById("resultTip");
      if (tip) {
        var parts = [];
        if (cat) parts.push("分类「" + cat + "」");
        if (tag) parts.push("标签「" + tag + "」");
        if (keyword) parts.push("关键词「" + keyword + "」");
        tip.textContent = parts.length ? "筛选中：" + parts.join(" · ") + "，共 " + all.length + " 篇" : "共 " + all.length + " 篇文章";
      }
      listEl.innerHTML = slice.length
        ? slice.map(function (p, i) { return postCardHTML(p, i); }).join("")
        : '<div class="card empty-state">' + icon("search") + "<p>没有找到匹配的文章。</p></div>";
      if (pagerEl) pagerEl.innerHTML = pagerHTML(all.length, page, size, "posts");
      observeReveal();
      staggerReveal();
      initImageFade();
    }

    if (input) {
      var timer = null;
      input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { keyword = input.value.trim(); page = 1; paint(); }, 120);
      });
    }
    bindPager(pagerEl, function (n) { page = n; paint(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    paint();
    renderSidebar();
  }

  /* ---------------- 文章详情 ---------------- */
  function renderArticle() {
    if (document.body.getAttribute("data-page") !== "article") return;
    var root = document.getElementById("articleRoot");
    if (!root) return;
    var slug = qs("slug");
    var p = findPost(slug);
    if (!p || p.draft) {
      root.innerHTML = '<div class="card article-card"><div class="empty-state">' + icon("info") +
        "<p>文章不存在，可能已被删除。</p><p><a href=\"" + abs("posts.html") + '" style="color:var(--primary)">← 返回文章列表</a></p></div></div>';
      document.title = "文章不存在 · " + (state.site.name || "");
      return;
    }
    document.title = p.title + " · " + (state.site.name || "");
    var posts = visiblePosts();
    var idx = posts.map(function (x) { return x.slug; }).indexOf(p.slug);
    var newer = idx > 0 ? posts[idx - 1] : null;
    var older = idx > -1 && idx < posts.length - 1 ? posts[idx + 1] : null;

    root.innerHTML =
      '<article class="card article-card reveal">' +
        '<header class="article-head">' +
          '<h1 class="article-title">' + esc(p.title) + "</h1>" +
          '<div class="article-meta">' +
            "<span>" + icon("calendar") + "发表于 " + esc(fmtFull(p.date)) + "</span>" +
            "<span>" + icon("edit") + "更新于 " + esc(fmtFull(p.updated)) + "</span>" +
            '<span>' + icon("folder") + '<a href="' + abs("category.html") + "?name=" + encodeURIComponent(p.category) + '">' + esc(p.category) + "</a></span>" +
            "<span>" + icon("eye") + esc(fmtNum(p.views)) + " 次阅读</span>" +
            "<span>" + icon("like") + esc(fmtNum(p.likes)) + " 次点赞</span>" +
            "<span>" + icon("clock") + readingMinutes(p.content) + " 分钟读完</span>" +
          "</div>" +
        "</header>" +
        (p.cover ? '<figure class="article-cover"><img src="' + esc(asset(p.cover)) + '" alt="' + esc(p.title) + '"></figure>' : "") +
        '<div class="prose" id="articleBody">' + p.content + "</div>" +
        ((p.tags || []).length ? '<div class="article-foot">' + p.tags.map(function (t) {
          return '<a class="tag-chip" href="' + abs("tag.html") + "?name=" + encodeURIComponent(t) + '">' + icon("tag") + esc(t) + "</a>";
        }).join("") + "</div>" : "") +
        '<nav class="prev-next">' +
          (newer ? '<a href="' + abs("article.html") + "?slug=" + encodeURIComponent(newer.slug) + '"><span class="dir">← 上一篇</span><span class="t">' + esc(newer.title) + "</span></a>" : "<span></span>") +
          (older ? '<a class="next" href="' + abs("article.html") + "?slug=" + encodeURIComponent(older.slug) + '"><span class="dir">下一篇 →</span><span class="t">' + esc(older.title) + "</span></a>" : "<span></span>") +
        "</nav>" +
      "</article>";

    // 正文处理
    var body = document.getElementById("articleBody");
    body.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (src && !/^(https?:|data:|\/)/.test(src)) img.setAttribute("src", abs(src));
      img.setAttribute("loading", "lazy");
    });
    body.querySelectorAll("a[href]").forEach(function (a) {
      if (/^https?:/i.test(a.getAttribute("href"))) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });

    // 右侧目录
    var tocCard = document.getElementById("tocCard");
    var heads = body.querySelectorAll("h2, h3");
    if (tocCard) {
      if (heads.length >= 2) {
        var lis = [];
        Array.prototype.forEach.call(heads, function (h, i) {
          var id = "h-" + (i + 1);
          h.id = id;
          lis.push('<li' + (h.tagName === "H3" ? ' class="sub"' : "") + '><a href="#' + id + '">' + esc(h.textContent) + "</a></li>");
        });
        tocCard.innerHTML = '<h3 class="card-title">' + icon("list") + '目录</h3><ol>' + lis.join("") + "</ol>";
        tocCard.hidden = false;
      } else {
        tocCard.hidden = true;
      }
    }
    renderSidebar();
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 时间轴 ---------- */
  function renderArchive() {
    if (document.body.getAttribute("data-page") !== "archive") return;
    var root = document.getElementById("archiveRoot");
    if (!root) return;
    var posts = visiblePosts();
    var years = {};
    posts.forEach(function (p) { var y = String(p.date).slice(0, 4) || "未知"; (years[y] = years[y] || []).push(p); });
    var keys = Object.keys(years).sort().reverse();
    root.innerHTML = keys.map(function (y) {
      return '<section class="card pad reveal" style="margin-bottom:14px">' +
        '<div class="timeline-year"><b>' + esc(y) + "</b><span>" + years[y].length + " 篇</span></div>" +
        '<ul class="timeline">' + years[y].map(function (p) {
          var d = parseDate(p.date);
          return "<li><a href=\"" + abs("article.html") + "?slug=" + encodeURIComponent(p.slug) + "\">" +
            '<span class="d">' + (d ? fmtMD(p.date) : "") + "</span>" +
            (p.pinned ? '<span class="tag-chip plain">置顶</span>' : "") +
            '<span class="t">' + esc(p.title) + "</span>" +
            '<span class="chip-cat">' + esc(p.category) + "</span></a></li>";
        }).join("") + "</ul></section>";
    }).join("") || '<div class="card empty-state">' + icon("clock") + "<p>暂无文章。</p></div>";
    renderSidebar();
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 分类页 ---------------- */
  function renderCategory() {
    if (document.body.getAttribute("data-page") !== "category") return;
    var root = document.getElementById("categoryRoot");
    if (!root) return;
    var only = qs("name");
    var list = visiblePosts();
    var groups = {};
    list.forEach(function (p) { (groups[p.category] = groups[p.category] || []).push(p); });
    var names = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
    if (only) names = names.filter(function (n) { return n === only; });

    if (qs("name")) {
      var head = document.getElementById("pageHead");
      if (head) head.querySelector("h1").textContent = "分类：" + only;
      var back = document.getElementById("backLink");
      if (back) back.hidden = false;
    }

    root.innerHTML = '<div class="cat-grid">' + names.map(function (n) {
      var first = groups[n][0];
      var tagSet = {};
      groups[n].forEach(function (p) { (p.tags || []).forEach(function (t) { tagSet[t] = 1; }); });
      return '<a class="card hoverable cat-card reveal" href="' + abs("posts.html") + "?cat=" + encodeURIComponent(n) + '">' +
        '<div class="h"><span class="name">' + icon("folder") + " " + esc(n) + '</span><span class="count">' + groups[n].length + " 篇</span></div>" +
        '<div class="desc">标签：' + (Object.keys(tagSet).slice(0, 4).map(function (t) { return esc(t); }).join("、") || "—") + "</div>" +
        '<div class="latest">最新：' + esc(first.title) + "</div></a>";
    }).join("") + "</div>";
    if (!names.length) root.innerHTML = '<div class="card empty-state">' + icon("folder") + "<p>暂无匹配的分类。</p></div>";
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 标签页 ---------------- */
  function renderTag() {
    if (document.body.getAttribute("data-page") !== "tag") return;
    var cloud = document.getElementById("tagCloudBig");
    var root = document.getElementById("tagResult");
    var only = qs("name");
    var all = tags();
    if (cloud) {
      cloud.innerHTML = all.map(function (t) {
        return '<a class="pill' + (only === t.name ? " active" : "") + '" href="' + abs("tag.html") + "?name=" + encodeURIComponent(t.name) + '">' +
          esc(t.name) + '<span class="n">' + t.count + "</span></a>";
      }).join("") || '<span class="muted">暂无标签</span>';
    }
    if (root) {
      if (only) {
        var list = visiblePosts().filter(function (p) { return (p.tags || []).indexOf(only) > -1; });
        root.innerHTML = '<h2 class="card-title" style="margin-bottom:12px">' + icon("tag") + "标签「" + esc(only) + "」共 " + list.length + " 篇</h2>" +
          '<div class="col-main">' + list.map(function (p, i) { return postCardHTML(p, i); }).join("") + "</div>";
        if (!list.length) root.innerHTML = '<div class="card empty-state">' + icon("tag") + "<p>该标签下暂无文章。</p></div>";
      } else {
        root.innerHTML = "";
      }
    }
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 相册 ---------------- */
  function renderPhotos() {
    if (document.body.getAttribute("data-page") !== "photos") return;
    var root = document.getElementById("photoRoot");
    if (!root) return;
    var groups = {};
    state.photos.forEach(function (p) { var g = p.album || "全部"; (groups[g] = groups[g] || []).push(p); });
    var names = Object.keys(groups);
    root.innerHTML = names.map(function (g) {
      return '<section class="card pad reveal" style="margin-bottom:14px">' +
        '<h3 class="card-title">' + icon("image") + esc(g) + '<span class="n" style="font-weight:400;color:var(--ink-3);font-size:12.5px">' + groups[g].length + " 张</span></h3>" +
        '<div class="photo-grid">' + groups[g].map(function (p, i) {
          return '<figure class="photo-item" data-src="' + esc(asset(p.src)) + '" data-cap="' + esc(p.title || "") + '">' +
            '<img src="' + esc(asset(p.src)) + '" alt="' + esc(p.title || "") + '" loading="lazy">' +
            (p.title ? '<figcaption class="cap">' + esc(p.title) + "</figcaption>" : "") + "</figure>";
        }).join("") + "</div></section>";
    }).join("") || '<div class="card empty-state">' + icon("image") + "<p>相册还是空的，去后台添加第一张照片吧。</p></div>";

    // 灯箱
    var box = document.getElementById("lightbox");
    if (!box) return;
    var img = box.querySelector("img"), cap = box.querySelector(".cap");
    var items = Array.prototype.slice.call(root.querySelectorAll(".photo-item"));
    var cur = 0;
    function open(i) {
      cur = (i + items.length) % items.length;
      img.src = items[cur].dataset.src;
      cap.textContent = items[cur].dataset.cap || "";
      box.hidden = false;
    }
    root.addEventListener("click", function (e) {
      var f = e.target.closest(".photo-item");
      if (f) open(items.indexOf(f));
    });
    box.addEventListener("click", function (e) {
      if (e.target.closest(".close") || e.target === box) box.hidden = true;
      if (e.target.closest(".nav.prev")) open(cur - 1);
      if (e.target.closest(".nav.next")) open(cur + 1);
    });
    document.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "Escape") box.hidden = true;
      if (e.key === "ArrowLeft") open(cur - 1);
      if (e.key === "ArrowRight") open(cur + 1);
    });
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 说说 ---------------- */
  function renderMoments() {
    if (document.body.getAttribute("data-page") !== "moments") return;
    var root = document.getElementById("momentRoot");
    if (!root) return;
    var list = state.moments.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    root.innerHTML = '<div class="talk-list">' + list.map(function (m) {
      var imgs = (m.images || []).map(function (src) {
        return '<img src="' + esc(asset(src)) + '" alt="" loading="lazy" data-src="' + esc(asset(src)) + '" data-cap="' + esc(m.date) + '">';
      }).join("");
      return '<article class="card talk-card reveal">' +
        '<div class="talk-head">' +
          '<img class="talk-avatar" src="' + esc(asset(state.site.avatar || "assets/avatar.svg")) + '" alt="">' +
          '<span class="talk-name">' + esc(state.site.name || "") + "</span>" +
          '<span class="talk-date">' + esc(fmtFull(m.date)) + (m.mood ? " · " + esc(m.mood) : "") + "</span>" +
        "</div>" +
        '<p class="talk-text">' + esc(m.text || "") + "</p>" +
        (imgs ? '<div class="talk-imgs">' + imgs + "</div>" : "") +
      "</article>";
    }).join("") + "</div>";
    if (!list.length) root.innerHTML = '<div class="card empty-state">' + icon("chat") + "<p>还没有说说。</p></div>";

    var box = document.getElementById("lightbox");
    if (box) {
      var img = box.querySelector("img"), cap = box.querySelector(".cap");
      root.addEventListener("click", function (e) {
        var t = e.target.closest("img[data-src]");
        if (!t) return;
        img.src = t.dataset.src; cap.textContent = t.dataset.cap || ""; box.hidden = false;
      });
      box.addEventListener("click", function (e) { if (e.target.closest(".close") || e.target === box) box.hidden = true; });
    }
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 友链 ---------------- */
  function renderLinks() {
    if (document.body.getAttribute("data-page") !== "links") return;
    var root = document.getElementById("linkRoot");
    if (!root) return;
    root.innerHTML = '<div class="link-grid">' + state.links.map(function (l) {
      return '<a class="card hoverable link-card reveal" href="' + esc(l.url || "#") + '" target="_blank" rel="noopener">' +
        '<img class="link-avatar" src="' + esc(asset(l.avatar || "assets/avatar.svg")) + '" alt="">' +
        "<div><div class=\"link-name\">" + esc(l.name) + '</div><div class="link-desc">' + esc(l.desc || l.url || "") + "</div></div></a>";
    }).join("") + "</div>";
    if (!state.links.length) root.innerHTML = '<div class="card empty-state">' + icon("link") + "<p>还没有友链。</p></div>";
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 关于页 ---------------- */
  function renderAbout() {
    if (document.body.getAttribute("data-page") !== "about") return;
    var root = document.getElementById("aboutRoot");
    if (!root) return;
    var s = state.site;
    var days = s.startDate ? daysBetween(s.startDate, todayStr()) : null;
    root.innerHTML =
      '<div class="card pad reveal about-card">' +
        '<div class="about-head">' +
          '<img class="about-avatar" src="' + esc(asset(s.avatar || "assets/avatar.svg")) + '" alt="头像">' +
          "<div><h2>" + esc(s.name || "") + '</h2><p class="about-role">' + esc(s.role || "") + "</p></div>" +
        "</div>" +
        '<div class="prose" id="aboutBody" style="margin-top:18px">' + md(s.about || "") + "</div>" +
        '<div class="about-meta">' +
          (s.email ? "<div>" + icon("mail") + '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + "</a></div>" : "") +
          (s.location ? "<div>" + icon("home") + esc(s.location) + "</div>" : "") +
          (days !== null ? "<div>" + icon("clock") + "运行 " + days + " 天</div>" : "") +
          "<div>" + icon("book") + state.posts.filter(function (p) { return !p.draft; }).length + " 篇文章</div>" +
        "</div>" +
      "</div>";
    observeReveal();
    staggerReveal();
    initImageFade();
  }

  /* ---------------- 搜索页 ---------------- */
  function renderSearchPage() {
    if (document.body.getAttribute("data-page") !== "search") return;
    var input = document.getElementById("searchPageInput");
    var root = document.getElementById("searchPageResult");
    if (!input || !root) return;
    var posts = visiblePosts();
    function run() {
      var k = input.value.trim().toLowerCase();
      if (!k) { root.innerHTML = '<div class="card empty-state">' + icon("search") + "<p>输入关键词，搜索标题、正文、分类与标签。</p></div>"; return; }
      var hits = posts.filter(function (p) {
        return (p.title + " " + p.summary + " " + stripHtml(p.content) + " " + p.category + " " + (p.tags || []).join(" ")).toLowerCase().indexOf(k) > -1;
      });
      if (!hits.length) { root.innerHTML = '<div class="card empty-state">' + icon("search") + "<p>没有找到「" + esc(k) + "」相关内容。</p></div>"; return; }
      var re = new RegExp("(" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      root.innerHTML = '<div class="col-main">' + hits.map(function (p, i) {
        var text = stripHtml(p.content);
        var idx = text.toLowerCase().indexOf(k);
        // 原文摘要里没有关键词（命中的是正文深处）时，改为以关键词为中心截取片段，
        // 否则卡片上的摘要永远看不到高亮，用户会以为「搜索没命中也显示出来了」。
        var snip = idx > -1
          ? "…" + text.slice(Math.max(0, idx - 30), idx + 80) + (idx + 80 < text.length ? "…" : "")
          : p.summary;
        var card = postCardHTML(p, i);
        var descStart = card.indexOf('<p class="post-desc">');
        // 定位本卡片的摘要结束标签（摘要不嵌套 <p>，从 descStart 之后找最近的一个即可）
        var descEnd = card.indexOf("</p>", descStart);
        if (descStart > -1 && descEnd > -1) {
          card = card.slice(0, descStart) + '<p class="post-desc">' +
            esc(snip).replace(re, "<mark>$1</mark>") + "</p>" + card.slice(descEnd + 4);
        }
        return card;
      }).join("") + "</div>";
      observeReveal();
      staggerReveal();
      initImageFade();
    }
    input.addEventListener("input", run);
    var q = qs("q");
    if (q) input.value = q;
    run();
    input.focus();
  }

  /* ---------------- 启动 ---------------- */
  // 渲染阶段兜底：任一视图抛错时给出可见提示，避免页面永远停在「正在加载…」的骨架屏上
  function safeRender(fn, label) {
    try { fn(); } catch (e) {
      console.error("[blog] 渲染 " + label + " 失败", e);
      document.querySelectorAll(".skeleton").forEach(function (el) {
        var card = el.closest(".card") || el;
        card.classList.remove("skeleton");
        card.innerHTML = '<div class="empty-state">' + icon("info") + "<p>内容加载失败，请刷新重试。</p></div>";
      });
    }
  }
  // 所有视图渲染完后，清掉没被替换掉的骨架屏（例如该页面没有对应数据）
  function clearSkeletons() {
    document.querySelectorAll(".skeleton").forEach(function (el) {
      var card = el.closest(".card") || el;
      card.classList.remove("skeleton");
      card.innerHTML = '<div class="empty-state">' + icon("info") + "<p>暂无内容。</p></div>";
    });
  }

  function boot() {
    var need = (document.body.getAttribute("data-page") || "");
    Promise.all([
      loadJSON(abs("data/site.json"), null),
      loadJSON(abs("data/posts.json"), { posts: [] }),
      loadJSON(abs("data/moments.json"), { moments: [] }),
      loadJSON(abs("data/photos.json"), { photos: [] }),
      loadJSON(abs("data/links.json"), { links: [] })
    ]).then(function (res) {
      var site = res[0];
      state.site = (site && site.site) ? site.site : (site && site.settings ? site.settings : {});
      state.posts = ((res[1] && res[1].posts) || []).map(normalizePost);
      state.moments = (res[2] && res[2].moments) || [];
      state.photos = (res[3] && res[3].photos) || [];
      state.links = (res[4] && res[4].links) || [];
      state.ready = true;

      initThemeAndScroll();
      renderChrome();
      initMotion();
      safeRender(initHero, "首屏");
      safeRender(renderHome, "首页");
      safeRender(renderPostsPage, "文章列表");
      safeRender(renderArticle, "文章详情");
      safeRender(renderArchive, "时间轴");
      safeRender(renderCategory, "分类");
      safeRender(renderTag, "标签");
      safeRender(renderPhotos, "相册");
      safeRender(renderMoments, "说说");
      safeRender(renderLinks, "友链");
      safeRender(renderAbout, "关于");
      safeRender(renderSearchPage, "搜索");
      clearSkeletons();

      // 页面标题
      var sname = state.site.name || "";
      var headTitle = (document.title.split("·")[0] || "").trim();
      if (sname) document.title = (!headTitle || headTitle === sname) ? sname : headTitle + " · " + sname;
      if (!site) {
        var warn = document.createElement("div");
        warn.className = "wrap";
        warn.innerHTML = '<div class="card pad" style="margin-top:16px;border-color:#ef4444;color:#ef4444;font-size:14px">数据加载失败：请通过本地服务器（node tools/serve.js）或 GitHub Pages 访问，直接双击 HTML 无法读取 data/*.json。</div>';
        var main = document.querySelector("main");
        if (main) main.prepend(warn);
      }
    });
  }

  // 预加载后暴露小工具，方便调试
  window.BlogUtil = { esc: esc, md: md, icon: icon, abs: abs, fmtDate: fmtDate };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
