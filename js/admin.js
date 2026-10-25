/* =========================================================
   后台逻辑（无依赖）
   - 口令登录（SHA-256 哈希比对，会话存 sessionStorage）
   - 六个模块的增 / 改 / 删：文章、说说、相册、友链、站点信息、发布设置
   - 保存即通过 GitHub Contents API 提交，体现为一次正常 commit
   - 未配置仓库时退回 localStorage 草稿模式
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.ADMIN_CONFIG || {};
  var FILES = CFG.FILES || {
    posts: "data/posts.json", moments: "data/moments.json", photos: "data/photos.json",
    links: "data/links.json", site: "data/site.json"
  };
  var BASE = window.__BLOG_BASE__ || "/";
  function abs(p) { return BASE + String(p || "").replace(/^\.?\//, ""); }

  var KEYS = {
    auth: "card-admin-auth",
    repo: "card-admin-repo",
    data: "card-admin-data",
    site: "card-admin-site"
  };

  var state = {
    posts: [], moments: [], photos: [], links: [], site: {},
    cfg: null,
    view: "dashboard",
    editing: { post: null, moment: -1, photo: -1, link: -1 },
    dirty: false
  };

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function slugify(s) {
    var out = String(s || "").trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return out || "post-" + Date.now().toString(36);
  }
  function toast(msg, kind) {
    var box = $("toast"), text = $("toastText");
    text.textContent = msg;
    box.hidden = false;
    box.className = "toast" + (kind ? " " + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.hidden = true; }, kind === "error" ? 9000 : 4200);
  }
  function confirmBox(title, text) {
    return new Promise(function (resolve) {
      var m = $("modal");
      var settled = false;
      $("modalTitle").textContent = title;
      $("modalText").textContent = text;
      m.hidden = false;
      function done(v) {
        // 防止一次弹窗被重复结算（确定/取消/遮罩/ Esc 可能接连触发）
        if (settled) return;
        settled = true;
        m.hidden = true;
        $("modalOk").removeEventListener("click", ok);
        $("modalCancel").removeEventListener("click", cancel);
        document.removeEventListener("keydown", onKey);
        m.removeEventListener("click", onBackdrop);
        resolve(v);
      }
      function ok() { done(true); }
      function cancel() { done(false); }
      // 支持 Esc 关闭（取消）
      function onKey(ev) {
        if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
      }
      // 点击弹窗外部的遮罩区域关闭（取消）
      function onBackdrop(ev) { if (ev.target === m) cancel(); }
      $("modalOk").addEventListener("click", ok);
      $("modalCancel").addEventListener("click", cancel);
      document.addEventListener("keydown", onKey);
      m.addEventListener("click", onBackdrop);
    });
  }
  async function sha256(str) {
    if (!(window.crypto && crypto.subtle)) return "ERR";
    var buf = new TextEncoder().encode(str);
    var h = await crypto.subtle.digest("SHA-256", buf);
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function stripHtml(s) { var t = document.createElement("div"); t.innerHTML = s || ""; return (t.textContent || "").replace(/\s+/g, " ").trim(); }

  /* ---------------- Markdown（编辑器预览用） ---------------- */
  function looksLikeHtml(s) { return /<(p|h[1-6]|ul|ol|li|blockquote|pre|div|img|table|figure)\b/i.test(String(s || "")); }
  function fixPaths(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    tmp.querySelectorAll("img[src], a[href]").forEach(function (el) {
      var attr = el.tagName === "IMG" ? "src" : "href";
      var v = el.getAttribute(attr) || "";
      if (v && !/^(https?:|mailto:|data:|\/|#)/i.test(v)) el.setAttribute(attr, abs(v));
    });
    return tmp.innerHTML;
  }
  function md(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0, inList = false, inCode = false, codeBuf = [];
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, href) {
        var safe = /^(https?:|data:|\/|\.)/i.test(href) ? href : "#";
        return '<img src="' + safe + '" alt="' + alt + '">';
      });
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, txt, href) {
        var safe = /^(https?:|mailto:|\/|#|\.)/i.test(href) ? href : "#";
        return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + txt + "</a>";
      });
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        if (!inCode) { closeList(); inCode = true; codeBuf = []; } else { inCode = false; out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>"); }
        i++; continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      if (/^(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
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
  function toHtml(content) { return fixPaths(looksLikeHtml(content) ? content : md(content)); }

  /* ---------------- 本地读取 ---------------- */
  function loadJSON(path, fallback) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(path + " (" + r.status + ")");
      return r.json();
    }).catch(function (e) { console.warn(e); return fallback; });
  }

  async function loadAll() {
    var localDraft = null, localSite = null;
    try {
      localDraft = JSON.parse(localStorage.getItem(KEYS.data) || "null");
      localSite = JSON.parse(localStorage.getItem(KEYS.site) || "null");
    } catch (e) { localDraft = null; }

    var r = await Promise.all([
      loadJSON(abs(FILES.posts), { posts: [] }),
      loadJSON(abs(FILES.moments), { moments: [] }),
      loadJSON(abs(FILES.photos), { photos: [] }),
      loadJSON(abs(FILES.links), { links: [] }),
      loadJSON(abs(FILES.site), { site: {} })
    ]);
    state.posts = (localDraft && localDraft.posts) || r[0].posts || [];
    state.moments = (localDraft && localDraft.moments) || r[1].moments || [];
    state.photos = (localDraft && localDraft.photos) || r[2].photos || [];
    state.links = (localDraft && localDraft.links) || r[3].links || [];
    state.site = localSite || r[4].site || {};
    if (localDraft || localSite) toast("检测到本浏览器里有未发布的修改（上次提交可能失败），检查后重新保存即可。", "warn");
  }

  function persistLocal() {
    try {
      localStorage.setItem(KEYS.data, JSON.stringify({
        posts: state.posts, moments: state.moments, photos: state.photos, links: state.links
      }));
      localStorage.setItem(KEYS.site, JSON.stringify(state.site));
    } catch (e) { toast("本地缓存失败：" + e.message, "error"); }
  }

  /* ---------------- GitHub ---------------- */
  function loadRepoCfg() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEYS.repo) || "{}"); } catch (e) { stored = {}; }
    var def = CFG.REPO || {};
    state.cfg = {
      owner: stored.owner || def.owner || "",
      repo: stored.repo || def.repo || "",
      branch: stored.branch || def.branch || "main",
      token: stored.token || "",
      auto: stored.auto !== false
    };
  }
  function saveRepoCfg() { localStorage.setItem(KEYS.repo, JSON.stringify(state.cfg)); }
  function repoReady() { return !!(state.cfg && state.cfg.owner && state.cfg.repo && state.cfg.token); }

  function ghHeaders() {
    return {
      "Authorization": "Bearer " + state.cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function ghUrl(p) {
    return "https://api.github.com/repos/" + encodeURIComponent(state.cfg.owner) + "/" +
      encodeURIComponent(state.cfg.repo) + "/contents/" + p;
  }
  async function ghGet(p) {
    var res = await fetch(ghUrl(p) + "?ref=" + encodeURIComponent(state.cfg.branch), { headers: ghHeaders(), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("读取 " + p + " 失败（" + res.status + "）" + (res.status === 401 || res.status === 403 ? "，请检查令牌权限" : ""));
    return res.json();
  }
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function unb64(data) {
    var bin = atob(String(data).replace(/\s/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  async function ghPut(p, content, message) {
    var existing = await ghGet(p);
    var body = { message: message, content: b64(content), branch: state.cfg.branch };
    if (existing && existing.sha) body.sha = existing.sha;
    var res = await fetch(ghUrl(p), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var t = await res.text().catch(function () { return ""; });
      throw new Error("提交 " + p + " 失败（" + res.status + "）" + (t ? "：" + t.slice(0, 160) : ""));
    }
    return res.json();
  }

  function rssXML() {
    var s = state.site || {};
    var origin = location.origin + BASE;
    var live = state.posts.filter(function (p) { return !p.draft; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var items = live.slice(0, 20).map(function (p) {
      var link = origin + "article.html?slug=" + encodeURIComponent(p.slug);
      return "    <item>\n      <title><![CDATA[" + p.title + "]]></title>\n      <link>" + esc(link) + "</link>\n      <guid isPermaLink=\"true\">" + esc(link) +
        "</guid>\n      <pubDate>" + new Date((p.date || today()) + "T08:00:00+08:00").toUTCString() +
        "</pubDate>\n      <category><![CDATA[" + (p.category || "") + "]]></category>\n      <description><![CDATA[" + (p.summary || "") + "]]></description>\n    </item>";
    }).join("\n");
    return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title><![CDATA[' + (s.name || "") +
      "]]></title>\n    <link>" + esc(origin) + "</link>\n    <description><![CDATA[" + (s.slogan || "") +
      "]]></description>\n    <language>zh-CN</language>\n    <lastBuildDate>" + new Date().toUTCString() + "</lastBuildDate>\n" +
      items + "\n  </channel>\n</rss>\n";
  }

  async function publish(files, message) {
    if (!repoReady() || state.cfg.auto === false) {
      persistLocal();
      toast(repoReady() ? "已保存到本浏览器（自动发布已关闭）。" : "已保存到本浏览器。配置 GitHub 仓库后才能真正上线。", "warn");
      return false;
    }
    try {
      toast("正在提交到 GitHub……");
      for (var i = 0; i < files.length; i++) {
        await ghPut(files[i].path, files[i].content, message);
      }
      if (files.some(function (f) { return f.path === FILES.posts; })) {
        await ghPut("rss.xml", rssXML(), "content: update rss");
      }
      localStorage.removeItem(KEYS.data);
      localStorage.removeItem(KEYS.site);
      toast("已提交：" + message + "。GitHub Pages 通常 30 秒内更新。", "ok");
      return true;
    } catch (e) {
      persistLocal();
      toast(e.message + " 内容已保存到本地缓存，修好后重新保存即可。", "error");
      return false;
    }
  }

  function jsonOf(obj) { return JSON.stringify(obj, null, 2) + "\n"; }

  async function savePosts() {
    return publish([{ path: FILES.posts, content: jsonOf({ posts: state.posts }) }],
      (state.editing.post !== null ? "content: update post" : "content: update posts"));
  }
  async function saveMoments() {
    return publish([{ path: FILES.moments, content: jsonOf({ moments: state.moments }) }], "content: update moments");
  }
  async function savePhotos() {
    return publish([{ path: FILES.photos, content: jsonOf({ photos: state.photos }) }], "content: update photos");
  }
  async function saveLinks() {
    return publish([{ path: FILES.links, content: jsonOf({ links: state.links }) }], "content: update links");
  }
  async function saveSite() {
    return publish([{ path: FILES.site, content: jsonOf({ site: state.site }) }], "content: update site");
  }

  /* ---------------- 交互动效 ---------------- */
  var reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  // 涟漪只作用于有明确点击语义的控件。原来把 .card 也包含进来，
  // 点在表格/表单空白处会在整张卡片上铺一层灰斑，观感很差，这里移除。
  var RIPPLE_SEL = ".btn-primary, .ghost, .mini, .quick, .admin-menu button,\n" +
    "  .admin-side-foot button, .admin-side-foot a, .link-btn, .md-bar button, .toast button";

  function initAdminMotion() {
    // 点击涟漪（事件委托，动态生成的按钮同样生效）
    document.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || reduceMotion) return;
      var host = e.target.closest && e.target.closest(RIPPLE_SEL);
      if (!host || host.disabled) return;
      var rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      // 涟漪直径取最长边，但封顶 180px：整行宽按钮铺满会变成大面积色块
      var size = Math.min(180, Math.max(rect.width, rect.height));
      var span = document.createElement("span");
      span.className = "ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - rect.left - size / 2) + "px";
      span.style.top = (e.clientY - rect.top - size / 2) + "px";
      host.appendChild(span);
      span.addEventListener("animationend", function () { span.remove(); });
      setTimeout(function () { if (span.parentNode) span.remove(); }, 900);
    }, { passive: true });
  }

  // 后台图片淡入（缩略图、相册格子、友链头像）
  // 注意：视图 hidden 时布局高度为 0，浏览器不会为这些图片触发 load 回调，
  // 所以只在视图真正可见后调用；已有 img-ready 的直接跳过。
  function initImageFade() {
    document.querySelectorAll(".thumb-row img, .photo-cell > img, .item-avatar").forEach(function (img) {
      if (img.classList.contains("img-ready")) return;
      function mark() { img.classList.add("img-ready"); }
      if (img.complete && img.naturalWidth > 0) return mark();
      if (img.dataset.fadeBound) return;
      img.dataset.fadeBound = "1";
      img.addEventListener("load", mark, { once: true });
      img.addEventListener("error", mark, { once: true });
    });
  }

  /* ---------------- 视图切换 ---------------- */
  var TITLES = {
    dashboard: "概览", posts: "文章管理", "post-edit": "编辑文章", moments: "说说管理",
    photos: "相册管理", links: "友链管理", site: "站点信息", repo: "发布设置", help: "使用说明"
  };

  function show(view) {
    // 从编辑页切走：若表单里还有没保存的内容，先记下来，稍后在列表页给出恢复入口
    if (state.view === "post-edit" && view !== "post-edit") rememberDraft();
    state.view = view;
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== view; });
    $("viewTitle").textContent = TITLES[view] || "";
    document.querySelectorAll("#adminMenu button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view || (view === "post-edit" && b.getAttribute("data-view") === "posts"));
    });
    var actions = $("viewActions");
    actions.innerHTML = "";
    if (view === "posts" || view === "post-edit") {
      actions.innerHTML = '<button class="btn-primary" id="newPostBtn" type="button">＋ 新建文章</button>' +
        (view === "post-edit" ? '<button class="ghost" id="backToList" type="button" style="margin-left:8px">返回列表</button>' : "");
      var nb = $("newPostBtn"); if (nb) nb.onclick = function () { openPost(null); };
      var bl = $("backToList"); if (bl) bl.onclick = function () { show("posts"); };
    }
    window.scrollTo({ top: 0 });
    // 每次切视图都重新绑定图片淡入：视图隐藏期间新建的图片不会触发 load 回调，
    // 必须等 hidden 切换完成后再处理，否则图片会一直是透明的。
    requestAnimationFrame(function () {
      initImageFade();
      // 异步渲染（renderPhotos 等）会重建节点，再补一次
      setTimeout(initImageFade, 60);
    });
  }

  /* ---------------- 渲染：概览 ---------------- */
  function renderDashboard() {
    var live = state.posts.filter(function (p) { return !p.draft; });
    var cats = {};
    live.forEach(function (p) { cats[p.category || "未分类"] = 1; });
    var tags = {};
    live.forEach(function (p) { (p.tags || []).forEach(function (t) { tags[t] = 1; }); });
    var stats = [
      ["已发布文章", live.length], ["草稿", state.posts.length - live.length],
      ["分类", Object.keys(cats).length], ["标签", Object.keys(tags).length],
      ["说说", state.moments.length], ["照片", state.photos.length]
    ];
    $("statGrid").innerHTML = stats.map(function (s) {
      return '<div class="card stat"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>";
    }).join("");

    var recent = state.posts.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5);
    $("recentPosts").innerHTML = '<div class="table-wrap"><table class="table"><tbody>' + recent.map(function (p) {
      return '<tr><td><b>' + esc(p.title) + '</b><div class="muted small">' + esc(p.category || "") + " · " + esc(p.date || "") +
        "</div></td><td style=\"width:70px\">" + (p.draft ? '<span class="status draft">草稿</span>' : '<span class="status live">已发布</span>') +
        "</td><td style=\"width:70px\"><button class=\"mini\" data-edit-post=\"" + esc(p.slug) + '">编辑</button></td></tr>';
    }).join("") + "</tbody></table></div>";
    $("recentPosts").onclick = function (e) {
      var b = e.target.closest("[data-edit-post]");
      if (b) openPost(b.dataset.editPost);
    };
  }

  /* ---------------- 渲染：文章列表 ---------------- */
  function renderPostTable() {
    var kw = ($("postSearch").value || "").trim().toLowerCase();
    var cat = $("postCatFilter").value;
    var st = $("postStateFilter").value;
    var cats = {};
    state.posts.forEach(function (p) { cats[p.category || "未分类"] = 1; });
    $("postCatFilter").innerHTML = '<option value="">全部分类</option>' + Object.keys(cats).map(function (c) {
      return '<option value="' + esc(c) + '"' + (cat === c ? " selected" : "") + ">" + esc(c) + "</option>";
    }).join("");
    // 若筛选分类已不存在（例如文章被改分类或删除），回退到「全部分类」，避免列表空白却看不出原因
    if (cat && !cats[cat]) {
      cat = "";
      $("postCatFilter").value = "";
    }

    var list = state.posts.filter(function (p) {
      if (cat && (p.category || "未分类") !== cat) return false;
      if (st === "live" && p.draft) return false;
      if (st === "draft" && !p.draft) return false;
      if (kw) {
        var hay = (p.title + " " + (p.summary || "") + " " + (p.tags || []).join(" ")).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return String(b.date).localeCompare(String(a.date));
    });

    $("postTbody").innerHTML = list.length ? list.map(function (p) {
      var i = state.posts.indexOf(p);
      return "<tr>" +
        "<td>" + (p.pinned ? '<span class="pin-mark" title="置顶">★</span>' : "") + "</td>" +
        '<td><button class="link-btn" data-act="edit" data-i="' + i + '">' + esc(p.title) + "</button>" +
        ((p.tags || []).length ? '<div class="row-tags">' + p.tags.map(function (t) { return "<i>" + esc(t) + "</i>"; }).join("") + "</div>" : "") + "</td>" +
        '<td><span class="badge">' + esc(p.category || "未分类") + "</span></td>" +
        '<td class="num">' + esc(p.date || "") + "</td>" +
        "<td>" + (p.draft ? '<span class="status draft">草稿</span>' : '<span class="status live">已发布</span>') + "</td>" +
        '<td class="ops"><button class="mini" data-act="edit" data-i="' + i + '">编辑</button>' +
        '<button class="mini" data-act="top" data-i="' + i + '">' + (p.pinned ? "取消置顶" : "置顶") + "</button>" +
        '<button class="mini danger" data-act="del" data-i="' + i + '">删除</button></td>' +
        "</tr>";
    }).join("") : "";
    $("postEmpty").hidden = list.length > 0;
    renderDraftResume();
  }

  /* ---------------- 文章编辑 ---------------- */
  function openPost(slug) {
    var p = slug ? state.posts.filter(function (x) { return x.slug === slug; })[0] : null;
    // 打开另一篇文章会覆盖表单，之前遗留的待恢复草稿随之失效
    pendingDraft = null;
    state.editing.post = p ? p.slug : "";
    $("fTitle").value = p ? p.title : "";
    $("fSummary").value = p ? (p.summary || "") : "";
    $("fContent").value = p ? (p.content || "") : "";
    $("fSlug").value = p ? p.slug : "";
    $("fCover").value = p ? (p.cover || "") : "";
    $("fCategory").value = p ? (p.category || "") : "";
    $("fTags").value = p ? (p.tags || []).join(", ") : "";
    $("fDate").value = p ? (p.date || today()) : today();
    $("fUpdated").value = p ? (p.updated || p.date || today()) : today();
    $("fViews").value = p ? (p.views || 0) : 0;
    $("fLikes").value = p ? (p.likes || 0) : 0;
    $("fDraft").checked = p ? !!p.draft : false;
    $("fPinned").checked = p ? !!p.pinned : false;
    $("previewBox").hidden = true;
    updateWordCount();
    var cats = {};
    state.posts.forEach(function (x) { cats[x.category || "未分类"] = 1; });
    $("catOptions").innerHTML = Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join("");
    show("post-edit");
    $("fTitle").focus();
  }

  function updateWordCount() {
    var t = ($("fContent").value || "").replace(/<[^>]+>/g, "").replace(/\s/g, "");
    $("wordCount").textContent = t.length + " 字";
  }

  /* ---------- 未保存的编辑：离开编辑页时提示，避免内容被悄悄丢在表单里 ---------- */
  var pendingDraft = null; // { slug, title } 或 null

  function hasUnsavedPost() {
    if (state.view !== "post-edit") return false;
    return !!((($("fTitle").value || "").trim() || ($("fContent").value || "").trim()));
  }

  function rememberDraft() {
    // 离开编辑页时调用：把当前表单内容留作待恢复的草稿
    if (!hasUnsavedPost()) { pendingDraft = null; return; }
    pendingDraft = { slug: state.editing.post || "", title: ($("fTitle").value || "").trim() || "（未命名）" };
  }

  function renderDraftResume() {
    var box = $("draftResume");
    if (!box) return;
    var show = !!pendingDraft;
    box.hidden = !show;
    if (show) {
      $("draftResumeTitle").textContent = "《" + pendingDraft.title + "》—— 继续编辑或放弃后重新开始。";
    }
  }

  function readPost() {
    var slugInput = ($("fSlug").value || "").trim();
    return {
      slug: slugInput ? slugInput.replace(/[^a-zA-Z0-9\-_]/g, "-").replace(/-+/g, "-") : slugify($("fTitle").value),
      title: ($("fTitle").value || "").trim(),
      summary: ($("fSummary").value || "").trim(),
      content: toHtml($("fContent").value || ""),
      cover: ($("fCover").value || "").trim(),
      date: $("fDate").value || today(),
      updated: $("fUpdated").value || $("fDate").value || today(),
      category: ($("fCategory").value || "").trim() || "未分类",
      tags: ($("fTags").value || "").split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean),
      draft: $("fDraft").checked,
      pinned: $("fPinned").checked,
      views: Number($("fViews").value || 0),
      likes: Number($("fLikes").value || 0)
    };
  }

  async function savePost() {
    var p = readPost();
    if (!p.title) { toast("请填写标题。", "error"); $("fTitle").focus(); return; }
    if (!($("fContent").value || "").trim()) { toast("正文不能为空。", "error"); $("fContent").focus(); return; }
    var clash = state.posts.filter(function (x) { return x.slug === p.slug && x.slug !== state.editing.post; });
    if (clash.length) { toast("链接地址已存在，请换一个 slug。", "error"); $("fSlug").focus(); return; }
    var idx = state.posts.map(function (x) { return x.slug; }).indexOf(state.editing.post);
    if (idx > -1) state.posts[idx] = p; else state.posts.push(p);
    var wasNew = idx === -1;
    await savePosts();
    state.editing.post = p.slug;
    // 已保存：清掉待恢复草稿，避免列表页误提示
    pendingDraft = null;
    renderPostTable(); renderDashboard();
    show("posts");
    toast(wasNew ? "文章已创建。" : "文章已更新。", "ok");
  }

  /* ---------------- 说说 ---------------- */
  function renderMoments() {
    $("momentCount").textContent = "· " + state.moments.length + " 条";
    var list = state.moments.map(function (m, i) { return { m: m, i: i }; })
      .sort(function (a, b) { return String(b.m.date).localeCompare(String(a.m.date)); });
    $("momentList").innerHTML = list.map(function (x) {
      return '<div class="item-row"><div class="item-main"><div class="muted small">' + esc(x.m.date) + (x.m.mood ? " · " + esc(x.m.mood) : "") + "</div>" +
        '<div class="item-text">' + esc(x.m.text) + "</div>" +
        ((x.m.images || []).length ? '<div class="thumb-row">' + x.m.images.map(function (s) { return '<img src="' + esc(s.startsWith("http") || s.startsWith("/") ? s : abs(s)) + '" alt="">'; }).join("") + "</div>" : "") +
        '</div><div class="item-ops"><button class="mini" data-edit="' + x.i + '">编辑</button><button class="mini danger" data-del="' + x.i + '">删除</button></div></div>';
    }).join("") || '<p class="empty">还没有说说。</p>';
  }
  function resetMoment() {
    state.editing.moment = -1;
    $("mText").value = ""; $("mDate").value = today(); $("mMood").value = ""; $("mImages").value = "";
  }
  async function saveMoment() {
    var text = ($("mText").value || "").trim();
    if (!text) { toast("说点什么再保存吧。", "error"); $("mText").focus(); return; }
    var obj = {
      date: $("mDate").value || today(),
      text: text,
      mood: ($("mMood").value || "").trim(),
      images: ($("mImages").value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
    };
    if (state.editing.moment > -1) state.moments[state.editing.moment] = obj;
    else state.moments.push(obj);
    await saveMoments();
    resetMoment(); renderMoments(); renderDashboard(); initImageFade();
    toast("说说已保存。", "ok");
  }

  /* ---------------- 相册 ---------------- */
  function renderPhotos() {
    $("photoCount").textContent = "· " + state.photos.length + " 张";
    $("photoList").innerHTML = state.photos.map(function (p, i) {
      return '<div class="photo-cell"><img src="' + esc(p.src.startsWith("http") || p.src.startsWith("/") ? p.src : abs(p.src)) + '" alt="">' +
        '<div class="photo-meta"><b>' + esc(p.title || "未命名") + "</b><span>" + esc(p.album || "") + " · " + esc(p.date || "") + "</span>" +
        '<div class="item-ops"><button class="mini" data-edit="' + i + '">编辑</button><button class="mini danger" data-del="' + i + '">删除</button></div></div></div>';
    }).join("") || '<p class="empty">相册还是空的。</p>';
  }
  function resetPhoto() {
    state.editing.photo = -1;
    $("pSrc").value = ""; $("pTitle").value = ""; $("pAlbum").value = ""; $("pDate").value = today();
  }
  async function savePhoto() {
    var src = ($("pSrc").value || "").trim();
    if (!src) { toast("请填写图片地址。", "error"); $("pSrc").focus(); return; }
    var obj = { src: src, title: ($("pTitle").value || "").trim(), album: ($("pAlbum").value || "").trim() || "其他", date: $("pDate").value || today() };
    if (state.editing.photo > -1) state.photos[state.editing.photo] = obj;
    else state.photos.push(obj);
    await savePhotos();
    resetPhoto(); renderPhotos(); renderDashboard(); initImageFade();
    toast("照片已保存。", "ok");
  }

  /* ---------------- 友链 ---------------- */
  function renderLinks() {
    $("linkCount").textContent = "· " + state.links.length + " 个";
    $("linkList").innerHTML = state.links.map(function (l, i) {
      return '<div class="item-row"><img class="item-avatar" src="' + esc(l.avatar ? (l.avatar.startsWith("http") ? l.avatar : abs(l.avatar)) : abs("assets/avatar.svg")) + '" alt="">' +
        '<div class="item-main"><b>' + esc(l.name) + "</b><div class=\"muted small\">" + esc(l.url) + "</div><div class=\"muted small\">" + esc(l.desc || "") + "</div></div>" +
        '<div class="item-ops"><button class="mini" data-edit="' + i + '">编辑</button><button class="mini danger" data-del="' + i + '">删除</button></div></div>';
    }).join("") || '<p class="empty">还没有友链。</p>';
  }
  function resetLink() {
    state.editing.link = -1;
    $("lName").value = ""; $("lUrl").value = ""; $("lAvatar").value = ""; $("lDesc").value = "";
  }
  async function saveLink() {
    var name = ($("lName").value || "").trim(), url = ($("lUrl").value || "").trim();
    if (!name || !url) { toast("站名和网址都要填写。", "error"); return; }
    var obj = { name: name, url: url, avatar: ($("lAvatar").value || "").trim() || "assets/avatar.svg", desc: ($("lDesc").value || "").trim() };
    if (state.editing.link > -1) state.links[state.editing.link] = obj;
    else state.links.push(obj);
    await saveLinks();
    resetLink(); renderLinks(); renderDashboard(); initImageFade();
    toast("友链已保存。", "ok");
  }

  /* ---------------- 站点信息 ---------------- */
  var SITE_FIELDS = {
    sName: "name", sMark: "mark", sRole: "role", sSlogan: "slogan", sLocation: "location", sEmail: "email",
    sStartDate: "startDate", sPageSize: "homePageSize", sAvatar: "avatar", sBanner: "profileBanner",
    sNotice: "notice", sHeroTitle: "heroTitle", sHeroImage: "heroImage", sAbout: "about"
  };
  function renderSite() {
    Object.keys(SITE_FIELDS).forEach(function (id) {
      var key = SITE_FIELDS[id], v = state.site[key];
      if (id === "sPageSize") v = v == null ? 5 : v;
      $(id).value = v == null ? "" : v;
    });
    $("sHeroSays").value = (state.site.heroSays || []).join("\n");
    renderSocials();
  }
  function renderSocials() {
    var links = state.site.links || [];
    $("socialEditor").innerHTML = links.map(function (l, i) {
      return '<div class="repeat-row" data-i="' + i + '">' +
        '<input class="input" data-k="label" placeholder="名称" value="' + esc(l.label || "") + '">' +
        '<input class="input" data-k="url" placeholder="链接" value="' + esc(l.url || "") + '">' +
        '<input class="input" data-k="icon" placeholder="图标 github/mail/rss/link" value="' + esc(l.icon || "link") + '">' +
        '<button class="mini danger" data-del type="button">删除</button></div>';
    }).join("") || '<p class="muted small">还没有社交链接</p>';
  }
  function collectSite() {
    Object.keys(SITE_FIELDS).forEach(function (id) {
      var key = SITE_FIELDS[id];
      var raw = $(id).value;
      state.site[key] = id === "sPageSize" ? Number(raw || 5) : raw;
    });
    state.site.heroSays = ($("sHeroSays").value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var links = [];
    $("socialEditor").querySelectorAll(".repeat-row").forEach(function (row) {
      var o = {};
      row.querySelectorAll("[data-k]").forEach(function (i) { o[i.dataset.k] = i.value.trim(); });
      // 保留每一行（包括刚点「添加一条」还没填的空行），
      // 否则 state.site.links 与页面行数不一致，用 data-i 删除会错删别的行。
      // 真正空的条目在保存前统一过滤，不影响最终数据。
      links.push({ label: o.label || "", url: o.url || "", icon: o.icon || "link" });
    });
    state.site.links = links;
  }

  /* ---------------- 发布设置 ---------------- */
  function renderRepo() {
    var c = state.cfg;
    $("rOwner").value = c.owner; $("rRepo").value = c.repo; $("rBranch").value = c.branch;
    $("rToken").value = c.token; $("rAuto").checked = c.auto !== false;
    var pill = $("connPill");
    var ready = repoReady();
    pill.textContent = ready ? "已连接 · " + c.owner + "/" + c.repo : "未连接仓库（仅本地保存）";
    pill.className = "conn-pill" + (ready ? " ok" : "");
  }

  /* ---------------- 登录 ---------------- */
  function showAdmin() {
    $("loginScreen").hidden = true;
    $("adminApp").hidden = false;
    show("dashboard");
    renderDashboard();
  }
  function showLogin() {
    $("adminApp").hidden = true;
    $("loginScreen").hidden = false;
    $("pwInput").value = "";
    $("pwInput").focus();
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $("loginForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var hash = await sha256($("pwInput").value);
      if (hash === String(CFG.PASSWORD_HASH || "").toLowerCase()) {
        sessionStorage.setItem(KEYS.auth, hash);
        $("loginError").hidden = true;
        showAdmin();
      } else {
        $("loginError").hidden = false;
        $("loginError").textContent = hash === "ERR" ? "当前环境无法校验口令，请用 https 或 localhost 打开。" : "口令不正确，请重试。";
      }
    });
    $("logoutBtn").addEventListener("click", function () { sessionStorage.removeItem(KEYS.auth); showLogin(); });
    $("toastClose").addEventListener("click", function () { $("toast").hidden = true; });

    // 未保存草稿提示条：继续编辑 / 放弃
    $("draftResume").addEventListener("click", function (e) {
      if (e.target.closest("#resumeDraft")) {
        // 表单内容还在，直接回到编辑视图即可
        pendingDraft = null;
        show("post-edit");
        renderDraftResume();
        return;
      }
      if (e.target.closest("#discardDraft")) {
        pendingDraft = null;
        // 清空编辑表单，避免残留内容在下次新建时被误带出来
        state.editing.post = "";
        ["fTitle", "fSummary", "fContent", "fSlug", "fCover", "fCategory", "fTags"].forEach(function (id) { $(id).value = ""; });
        $("fDate").value = today();
        $("fUpdated").value = today();
        $("fViews").value = 0;
        $("fLikes").value = 0;
        $("fDraft").checked = false;
        $("fPinned").checked = false;
        updateWordCount();
        renderPostTable();
        toast("已放弃未保存的内容。", "ok");
      }
    });

    $("adminMenu").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]");
      if (!b) return;
      var v = b.getAttribute("data-view");
      show(v);
      if (v === "dashboard") renderDashboard();
      if (v === "posts") renderPostTable();
      if (v === "moments") renderMoments();
      if (v === "photos") renderPhotos();
      if (v === "links") renderLinks();
      if (v === "site") renderSite();
      if (v === "repo") renderRepo();
    });

    // 概览快捷入口
    document.querySelectorAll("[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = b.getAttribute("data-quick");
        if (q === "new-post") return openPost(null);
        // 快捷按钮的 data-quick 是缩写（moment/photo），需映射到真实视图名
        var view = { moment: "moments", photo: "photos", site: "site", repo: "repo", links: "links" }[q] || q;
        if (!TITLES[view]) return;
        show(view);
        if (view === "moments") renderMoments();
        if (view === "photos") renderPhotos();
        if (view === "site") renderSite();
        if (view === "links") renderLinks();
        if (view === "repo") renderRepo();
      });
    });

    // 文章
    $("postSearch").addEventListener("input", renderPostTable);
    $("postCatFilter").addEventListener("change", renderPostTable);
    $("postStateFilter").addEventListener("change", renderPostTable);
    $("postTbody").addEventListener("click", async function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var i = Number(b.dataset.i), p = state.posts[i];
      if (b.dataset.act === "edit") return openPost(p.slug);
      if (b.dataset.act === "top") {
        // 直接翻转 p.pinned 后，p 与 state.posts[i] 是同一个对象，
        // 原写法读到的永远是翻转后的值，导致提示语与实际操作相反。
        var willPin = !p.pinned;
        p.pinned = willPin;
        await savePosts(); renderPostTable();
        return toast(willPin ? "已置顶。" : "已取消置顶。", "ok");
      }
      if (b.dataset.act === "del") {
        var ok = await confirmBox("删除文章", "确定删除《" + p.title + "》吗？它会从网站和仓库中移除（Git 历史里仍可找回）。");
        if (!ok) return;
        state.posts.splice(i, 1);
        await savePosts(); renderPostTable(); renderDashboard();
        toast("文章已删除。", "ok");
      }
    });
    $("savePost").addEventListener("click", savePost);
    $("fContent").addEventListener("input", updateWordCount);
    $("genSlug").addEventListener("click", function () { $("fSlug").value = slugify($("fTitle").value); });
    $("previewBtn").addEventListener("click", function () {
      var box = $("previewBox");
      $("previewBody").innerHTML = md($("fContent").value);
      box.hidden = !box.hidden;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    $("closePreview").addEventListener("click", function () { $("previewBox").hidden = true; });
    document.querySelectorAll("[data-md]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var ta = $("fContent"), s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e);
        var w = {
          h2: ["\n## ", "\n", "小标题"], h3: ["\n### ", "\n", "更小的标题"], bold: ["**", "**", "加粗文字"],
          quote: ["\n> ", "\n", "引用一句"], ul: ["\n- ", "\n", "列表项"], ol: ["\n1. ", "\n", "列表项"],
          code: ["\n```\n", "\n```\n", "代码"], link: ["[", "](https://)", "链接文字"], img: ["![", "](assets/图片.jpg)", "说明"]
        }[btn.dataset.md];
        ta.setRangeText(w[0] + (sel || w[2]) + w[1], s, e, "end");
        ta.focus(); updateWordCount();
      });
    });

    // 说说
    $("saveMoment").addEventListener("click", saveMoment);
    $("cancelMoment").addEventListener("click", function () { resetMoment(); toast("已取消编辑。"); });
    $("momentList").addEventListener("click", async function (e) {
      var ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (ed) {
        var i = Number(ed.dataset.edit), m = state.moments[i];
        state.editing.moment = i;
        $("mText").value = m.text || ""; $("mDate").value = m.date || today();
        $("mMood").value = m.mood || ""; $("mImages").value = (m.images || []).join("\n");
        window.scrollTo({ top: 0 });
        return;
      }
      if (del) {
        var ok = await confirmBox("删除说说", "确定删除这条说说吗？");
        if (!ok) return;
        state.moments.splice(Number(del.dataset.del), 1);
        await saveMoments(); renderMoments(); renderDashboard(); initImageFade();
        toast("已删除。", "ok");
      }
    });

    // 相册
    $("savePhoto").addEventListener("click", savePhoto);
    $("cancelPhoto").addEventListener("click", function () { resetPhoto(); toast("已取消编辑。"); });
    $("photoList").addEventListener("click", async function (e) {
      var ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (ed) {
        var i = Number(ed.dataset.edit), p = state.photos[i];
        state.editing.photo = i;
        $("pSrc").value = p.src || ""; $("pTitle").value = p.title || "";
        $("pAlbum").value = p.album || ""; $("pDate").value = p.date || today();
        window.scrollTo({ top: 0 });
        return;
      }
      if (del) {
        var ok = await confirmBox("删除照片", "确定从相册中移除这张照片吗？");
        if (!ok) return;
        state.photos.splice(Number(del.dataset.del), 1);
        await savePhotos(); renderPhotos(); renderDashboard(); initImageFade();
        toast("已删除。", "ok");
      }
    });

    // 友链
    $("saveLink").addEventListener("click", saveLink);
    $("cancelLink").addEventListener("click", function () { resetLink(); toast("已取消编辑。"); });
    $("linkList").addEventListener("click", async function (e) {
      var ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (ed) {
        var i = Number(ed.dataset.edit), l = state.links[i];
        state.editing.link = i;
        $("lName").value = l.name || ""; $("lUrl").value = l.url || "";
        $("lAvatar").value = l.avatar || ""; $("lDesc").value = l.desc || "";
        window.scrollTo({ top: 0 });
        return;
      }
      if (del) {
        var ok = await confirmBox("删除友链", "确定移除这个友链吗？");
        if (!ok) return;
        state.links.splice(Number(del.dataset.del), 1);
        await saveLinks(); renderLinks(); renderDashboard(); initImageFade();
        toast("已删除。", "ok");
      }
    });

    // 站点信息
    $("saveSite").addEventListener("click", async function () {
      collectSite();
      // 保存前丢弃完全空白的社交链接行（只填了名称才有意义）
      state.site.links = (state.site.links || []).filter(function (l) { return (l.label || "").trim(); })
        .map(function (l) { return { label: l.label.trim(), url: l.url || "#", icon: l.icon || "link" }; });
      await saveSite();
      renderSite();
    });
    $("addSocial").addEventListener("click", function () {
      collectSite();
      state.site.links = (state.site.links || []).concat([{ label: "", url: "", icon: "link" }]);
      renderSocials();
    });
    $("socialEditor").addEventListener("click", function (e) {
      if (!e.target.closest("[data-del]")) return;
      collectSite();
      state.site.links.splice(Number(e.target.closest("[data-i]").dataset.i), 1);
      renderSocials();
    });

    // 发布设置
    $("saveRepo").addEventListener("click", function () {
      state.cfg = {
        owner: $("rOwner").value.trim(), repo: $("rRepo").value.trim(),
        branch: ($("rBranch").value || "main").trim(), token: $("rToken").value.trim(), auto: $("rAuto").checked
      };
      saveRepoCfg(); renderRepo();
      toast(repoReady() ? "已保存，建议点「测试连接」验证一下。" : "信息不完整，填充后才会上传。", repoReady() ? "ok" : "warn");
    });
    $("testRepo").addEventListener("click", async function () {
      if (!repoReady()) return toast("请先填写并保存仓库信息。", "warn");
      try {
        toast("正在测试连接……");
        var res = await fetch("https://api.github.com/repos/" + state.cfg.owner + "/" + state.cfg.repo, { headers: ghHeaders() });
        if (!res.ok) throw new Error("连接失败（" + res.status + "），请检查仓库名与令牌。");
        var d = await res.json();
        var f = await ghGet(FILES.posts);
        toast("连接成功：" + d.full_name + "，默认分支 " + d.default_branch + "，数据文件" + (f ? "存在" : "不存在（首次发布时创建）"), "ok");
      } catch (e) { toast(e.message, "error"); }
    });
    $("syncRepo").addEventListener("click", async function () {
      if (!repoReady()) return toast("请先配置仓库。", "warn");
      if (!(await confirmBox("从仓库拉取", "将用仓库中的最新数据覆盖本浏览器的编辑内容，继续吗？"))) return;
      try {
        var out = {};
        for (var k of ["posts", "moments", "photos", "links"]) {
          var f = await ghGet(FILES[k]);
          out[k] = f ? JSON.parse(unb64(f.content))[k] : [];
        }
        var sf = await ghGet(FILES.site);
        state.posts = out.posts || []; state.moments = out.moments || [];
        state.photos = out.photos || []; state.links = out.links || [];
        if (sf) state.site = (JSON.parse(unb64(sf.content)).site) || state.site;
        localStorage.removeItem(KEYS.data); localStorage.removeItem(KEYS.site);
        renderAll();
        toast("已从仓库同步。", "ok");
      } catch (e) { toast(e.message, "error"); }
    });
    $("resetLocal").addEventListener("click", async function () {
      if (!(await confirmBox("清除本地缓存", "本浏览器里尚未提交的修改会被丢弃。继续吗？"))) return;
      localStorage.removeItem(KEYS.data); localStorage.removeItem(KEYS.site);
      await loadAll(); renderAll();
      toast("已重置。", "ok");
    });

    window.addEventListener("beforeunload", function (e) {
      var typing = ($("fContent") && $("fContent").value.trim() && state.view === "post-edit");
      if (!typing) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  function renderAll() {
    // 逐个模块渲染并隔离异常：某一个模块出错时不让整个后台变空白
    [["概览", renderDashboard], ["文章", renderPostTable], ["说说", renderMoments],
      ["相册", renderPhotos], ["友链", renderLinks], ["站点", renderSite], ["发布设置", renderRepo]]
      .forEach(function (pair) {
        try { pair[1](); } catch (e) { console.error("[" + pair[0] + "] 渲染失败", e); }
      });
    requestAnimationFrame(initImageFade);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    loadRepoCfg();
    bind();
    initAdminMotion();
    if (sessionStorage.getItem(KEYS.auth) === String(CFG.PASSWORD_HASH || "").toLowerCase()) showAdmin();
    else showLogin();
    try { await loadAll(); } catch (e) { toast("数据加载失败：" + e.message, "error"); }
    resetMoment(); resetPhoto(); resetLink();
    // 数据加载失败时 renderAll 可能抛错，导致整个后台空白；这里兜底，保证界面仍可操作
    try { renderAll(); } catch (e) { console.error(e); toast("界面渲染出错：" + e.message, "error"); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
