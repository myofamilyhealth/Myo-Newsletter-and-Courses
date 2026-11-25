/* Myo Family Health — shared front-end helpers.
   Loaded on every page before the page's own script. */
(function () {
  "use strict";

  /* Where the site lives. "/" on Cloudflare; "/Myo-Newsletter-and-Courses/"
     on GitHub Pages. Worked out from this script's own URL. */
  const BASE = (document.currentScript && document.currentScript.src || location.href)
    .replace(/js\/common\.js(\?.*)?$/, "");
  const B = BASE;

  /* STATIC mode: GitHub Pages (or a file opened locally) has no server,
     so the catalog is read from data/*.json built by scripts/export-static.mjs.
     Sign-in, locked lessons and the owner dashboard need the live server. */
  const STATIC = /\.github\.io$/.test(location.hostname) || location.protocol === "file:" || sessionStorageFlag();

  function sessionStorageFlag() {
    try {
      if (new URLSearchParams(location.search).has("static")) sessionStorage.setItem("mfh_static", "1");
      return sessionStorage.getItem("mfh_static") === "1";
    } catch (e) { return false; }
  }

  const SITE = {
    booking: "https://amy-rondoni.clientsecure.me",
    phone: "707.631.1550",
    // Brevo sign-up form already used by the newsletter landing page.
    // Shown on GitHub Pages, where the site's own sign-up form has no server.
    brevoForm: "https://e3961feb.sibforms.com/v2/serve/MUIFAIp6RUy17cEz4RshfnfNGuq1fh4h4dR952P97BU-q72mx8NAH0Cw_ri4DzhxhMjd0BeXWM6INiNIwuXmWGAV_DkUjAnCOFtfaAo2WQhZUHN4Zj8p8l7jmq8Ht-sWyTnLOAs1nYwwg73AiX6yu7EeQ5ta5xoa2FZ3LvWUM3il6nmgCsEfgw1dTeAhVOdYfY7S52lTYAW9Tti1cA==",
    social: {
      Instagram: "https://www.instagram.com/myofamilyhealth/",
      Facebook: "https://www.facebook.com/myofamilyhealth",
      YouTube: "https://www.youtube.com/@myofamilyhealth"
    }
  };

  /* ---------- tiny utilities ---------- */

  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function money(cents) {
    if (!cents) return "Free";
    const n = cents / 100;
    return "$" + (Number.isInteger(n) ? n.toString() : n.toFixed(2));
  }

  function minutes(m) {
    m = Number(m) || 0;
    if (!m) return "";
    if (m < 60) return m + " min";
    const h = Math.floor(m / 60), r = m % 60;
    return h + " hr" + (r ? " " + r + " min" : "");
  }

  const AUDIENCE = { adults: "Adults", kids: "Kids", families: "Families", professionals: "Professionals" };
  const LEVEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

  class ApiError extends Error {
    constructor(msg, status, data) { super(msg); this.status = status; this.data = data || {}; }
  }

  const staticCache = {};
  function staticJson(file) {
    if (!(file in staticCache)) {
      staticCache[file] = fetch(BASE + "data/" + file).then(r => r.ok ? r.json() : null).catch(() => null);
    }
    return staticCache[file];
  }

  /* Answers the same questions as the server, from the exported JSON. */
  async function staticApi(path, opts) {
    const method = (opts.method || "GET").toUpperCase();
    const result = (data, status) => {
      status = status || 200;
      if (status >= 400 && !opts.allowError) throw new ApiError(data.error || "Not available.", status, data);
      return { ...data, __status: status };
    };
    if (method !== "GET") {
      return result({ error: "This part of the site opens once the live server is connected." }, 503);
    }
    if (path === "/api/catalog") return result(await staticJson("catalog.json") || { categories: [], courses: [], products: [] });
    if (path === "/api/me") return result({ signed_in: false, static: true });
    let m;
    if ((m = path.match(/^\/api\/courses\/([a-z0-9-]+)$/))) {
      const d = await staticJson("courses/" + m[1] + ".json");
      if (!d) return result({ error: "Course not found." }, 404);
      return result({ ...d, access: !d.course.price_cents, signed_in: false, completed: [], static: true });
    }
    if ((m = path.match(/^\/api\/courses\/([a-z0-9-]+)\/lessons\/(\d+)$/))) {
      const course = await staticJson("courses/" + m[1] + ".json");
      const l = course && course.lessons.find(x => x.id === Number(m[2]));
      if (!l) return result({ error: "Lesson not found." }, 404);
      const full = await staticJson("lessons/" + l.id + ".json");
      if (full) return result({ locked: false, lesson: full });
      return result({ locked: true, signed_in: false, static: true, lesson: { id: l.id, title: l.title } }, 403);
    }
    return result({ error: "Not found." }, 404);
  }

  async function api(path, opts) {
    opts = opts || {};
    if (STATIC) return staticApi(path, opts);
    const res = await fetch(BASE + path.replace(/^\//, ""), {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok && !opts.allowError) {
      throw new ApiError(data.error || "Something went wrong.", res.status, data);
    }
    data.__status = res.status;
    return data;
  }

  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2800);
  }

  /* ---------- safe Markdown ----------
     Everything is HTML-escaped first, then a small set of Markdown
     is turned back into tags. Links must be http(s) or site-relative,
     so owner-written content can never inject script. */

  function safeHref(u) {
    u = String(u || "").trim();
    if (/^https?:\/\//i.test(u) || (u.startsWith("/") && !u.startsWith("//")) || u.startsWith("#") || /^mailto:/i.test(u)) return u;
    return "";
  }

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
        const h = safeHref(url.replace(/&amp;/g, "&"));
        return h ? `<img src="${esc(h)}" alt="${alt}" loading="lazy">` : alt;
      })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
        const h = safeHref(url.replace(/&amp;/g, "&"));
        if (!h) return text;
        const ext = /^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${esc(h)}"${ext}>${text}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  }

  function md(src) {
    const lines = esc(src || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [], list = null;
    const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.type}>` + list.items.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list.type}>`); list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); flushList();
        const lvl = Math.min(m[1].length + 1, 4);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        flushPara();
        if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
        list.items.push(m[1]);
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
        list.items.push(m[1]);
      } else if ((m = line.match(/^&gt;\s?(.*)$/))) {
        flushPara(); flushList();
        out.push("<blockquote>" + inline(m[1]) + "</blockquote>");
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara(); flushList();
    return out.join("\n");
  }

  /* ---------- video embeds (allow-listed hosts only) ---------- */

  function videoEmbed(url) {
    if (!url) return "";
    let u;
    try { u = new URL(url); } catch (e) { return ""; }
    const host = u.hostname.replace(/^www\./, "");
    let src = "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v") || (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/) || [])[1];
      if (id) src = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0";
    } else if (host === "youtu.be") {
      src = "https://www.youtube-nocookie.com/embed/" + u.pathname.slice(1) + "?rel=0";
    } else if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = (u.pathname.match(/(\d+)/) || [])[1];
      const h = u.searchParams.get("h") || (u.pathname.match(/\/\d+\/(\w+)/) || [])[1];
      if (id) src = "https://player.vimeo.com/video/" + id + (h ? "?h=" + h : "");
    } else if (host === "loom.com") {
      const id = (u.pathname.match(/\/(?:share|embed)\/(\w+)/) || [])[1];
      if (id) src = "https://www.loom.com/embed/" + id;
    } else if (/\.(mp4|webm|m4v)$/i.test(u.pathname) && u.protocol === "https:") {
      return `<div class="video"><video controls preload="metadata" src="${esc(u.href)}"></video></div>`;
    }
    if (!src) return `<p><a class="btn btn-ghost" href="${esc(u.href)}" target="_blank" rel="noopener">Watch the video ↗</a></p>`;
    return `<div class="video"><iframe src="${esc(src)}" title="Lesson video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>`;
  }

  /* ---------- cards ---------- */

  function cover(c, opts) {
    opts = opts || {};
    const img = c.cover_url || c.image_url;
    const badges = [];
    if (opts.badges !== false) {
      if (!c.price_cents && c.title) badges.push('<span class="badge free">Free</span>');
      if (c.featured) badges.push('<span class="badge">★ Featured</span>');
    }
    if (opts.extraBadge) badges.push(opts.extraBadge);
    return `<div class="cover accent-${esc(c.accent || "teal")}">
      ${img ? `<img class="cover-img" src="${esc(img)}" alt="" loading="lazy">` : `<div class="cover-mark"><img src="${B}assets/myo-tree.png" alt=""></div>`}
      ${badges.length ? `<div class="badge-row">${badges.join("")}</div>` : ""}
    </div>`;
  }

  function courseCard(c, opts) {
    opts = opts || {};
    const pct = opts.progress != null ? opts.progress : null;
    return `<a class="card" href="${B}course.html?c=${encodeURIComponent(c.slug)}">
      ${cover(c, opts)}
      <div class="card-body">
        ${c.category_name ? `<span class="card-cat">${esc(c.category_name)}</span>` : ""}
        <h3>${esc(c.title)}</h3>
        ${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
        <div class="card-meta">
          <span>${c.lesson_count || 0} lessons</span>
          ${c.total_minutes ? `<span>${minutes(c.total_minutes)}</span>` : ""}
          <span>${AUDIENCE[c.audience] || ""}</span>
          <span>${LEVEL[c.level] || ""}</span>
        </div>
        ${pct != null ? `<div class="progress" aria-label="${pct}% complete"><i style="width:${pct}%"></i></div><span class="small muted">${pct}% complete</span>` : ""}
      </div>
      ${pct == null ? `<div class="card-foot">
        <span class="price">${money(c.price_cents)}${c.compare_at_cents > c.price_cents ? `<s>${money(c.compare_at_cents)}</s>` : ""}</span>
        <span class="btn btn-ghost btn-sm">View course</span>
      </div>` : ""}
    </a>`;
  }

  const KIND = { digital: "Digital download", physical: "Physical product", bundle: "Course bundle", session: "Session" };

  function buyButton(item, label, paymentsEnabled) {
    const url = item.checkout_url;
    if (url) {
      return `<a class="btn btn-primary btn-block" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
    }
    return `<button class="btn btn-primary btn-block is-disabled" disabled title="Checkout opens soon">${paymentsEnabled ? esc(label) : "Checkout opening soon"}</button>`;
  }

  function productCard(p, courses, paymentsEnabled) {
    const included = (p.course_ids || []).map(id => courses.find(c => c.id === id)).filter(Boolean);
    const label = p.kind === "session" ? (p.price_cents ? "Book now" : "Book free") : "Buy now";
    return `<article class="card" id="${esc(p.slug)}">
      ${cover({ ...p, accent: p.kind === "bundle" ? "slate" : p.kind === "session" ? "sage" : "sand" },
        { badges: false, extraBadge: `<span class="badge">${esc(KIND[p.kind] || "")}</span>` })}
      <div class="card-body">
        <h3>${esc(p.name)}</h3>
        ${p.tagline ? `<p>${esc(p.tagline)}</p>` : ""}
        ${included.length ? `<div class="small muted">Includes: ${included.map(c => `<a href="${B}course.html?c=${encodeURIComponent(c.slug)}">${esc(c.title)}</a>`).join(", ")}</div>` : ""}
      </div>
      <div class="card-foot" style="gap:14px">
        <span class="price">${money(p.price_cents)}</span>
        <div style="min-width:150px">${buyButton(p, label, paymentsEnabled)}</div>
      </div>
    </article>`;
  }

  /* ---------- header & footer ---------- */

  function header() {
    const here = location.pathname.split("/").pop() || "index.html";
    const link = (page, text) => `<li><a href="${B}${page}"${here === page ? ' aria-current="page"' : ""}>${text}</a></li>`;
    return `<a class="sr-only" href="#main">Skip to content</a>
    <header class="site-header"><div class="wrap nav">
      <a class="brand" href="${B}" aria-label="Myo Family Health home"><img src="${B}assets/myo-family-health-logo.png" alt="Myo Family Health" width="185" height="30"></a>
      <ul class="nav-links" id="nav-links">
        ${link("courses.html", "Courses")}
        ${link("shop.html", "Shop")}
        ${link("index.html#newsletter", "Newsletter")}
        ${link("account.html", "My courses")}
      </ul>
      <div class="nav-cta">
        <a class="btn btn-ghost btn-sm" href="${SITE.booking}" target="_blank" rel="noopener">Book a consult</a>
        <a class="btn btn-primary btn-sm" href="${B}courses.html">Browse courses</a>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="nav-links"><span></span><span></span><span></span></button>
      </div>
    </div></header>`;
  }

  function footer() {
    const year = new Date().getFullYear();
    return `<footer class="site-footer"><div class="wrap">
      <div class="foot-grid">
        <div>
          <img class="foot-logo" src="${B}assets/myo-tree.png" alt="">
          <p><strong style="color:#fff">Myo Family Health</strong><br>Breathe Better… Live Better!</p>
        </div>
        <div><h4>Learn</h4><ul>
          <li><a href="${B}courses.html">All courses</a></li>
          <li><a href="${B}courses.html?price=free">Free courses</a></li>
          <li><a href="${B}account.html">My courses</a></li>
        </ul></div>
        <div><h4>Shop</h4><ul>
          <li><a href="${B}shop.html">Shop</a></li>
          <li><a href="${SITE.booking}" target="_blank" rel="noopener">Book a consultation</a></li>
          <li><a href="tel:${SITE.phone.replace(/\D/g, "")}">${SITE.phone}</a></li>
        </ul></div>
        <div><h4>Follow</h4><ul>
          ${Object.entries(SITE.social).map(([k, v]) => `<li><a href="${v}" target="_blank" rel="noopener">${k}</a></li>`).join("")}
        </ul></div>
      </div>
      <div class="foot-bottom">
        <span>© ${year} Myo Family Health</span>
        <span>Courses are educational and are not a substitute for individual medical or dental advice.</span>
      </div>
    </div></footer>`;
  }

  function mountChrome() {
    const h = document.getElementById("site-header");
    if (h) h.outerHTML = header();
    const f = document.getElementById("site-footer");
    if (f) f.outerHTML = footer();
    const btn = $(".menu-btn");
    if (btn) btn.addEventListener("click", () => {
      const open = $("#nav-links").classList.toggle("open");
      btn.setAttribute("aria-expanded", open);
    });
  }

  /* ---------- newsletter forms (any form[data-newsletter]) ---------- */

  function bindNewsletter() {
    if (STATIC) {
      $$("form[data-newsletter]").forEach(form => {
        const box = document.createElement("div");
        box.innerHTML = `<iframe src="${esc(SITE.brevoForm)}" title="Myo Family Health newsletter sign-up form"
          style="display:block;width:100%;max-width:540px;height:340px;border:0;border-radius:16px;background:#fff"></iframe>`;
        form.replaceWith(box);
      });
      return;
    }
    $$("form[data-newsletter]").forEach(form => {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const msg = $(".form-msg", form);
        const btn = $("button", form);
        const data = Object.fromEntries(new FormData(form));
        msg.className = "form-msg"; msg.textContent = "";
        btn.disabled = true;
        try {
          await api("/api/newsletter", { method: "POST", body: { ...data, source: form.dataset.newsletter || "site" } });
          form.reset();
          msg.classList.add("ok");
          msg.textContent = "You're on the list! Watch your inbox for new courses and tips.";
        } catch (err) {
          msg.classList.add("err");
          msg.textContent = err.message;
        } finally { btn.disabled = false; }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => { mountChrome(); bindNewsletter(); });

  window.MFH = { BASE, STATIC, SITE, esc, $, $$, money, minutes, api, toast, md, videoEmbed, courseCard, productCard, buyButton, cover, AUDIENCE, LEVEL };
})();
