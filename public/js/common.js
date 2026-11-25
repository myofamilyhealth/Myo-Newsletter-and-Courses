/* Myo Family Health — shared front-end helpers.
   Loaded on every page before the page's own script. */
(function () {
  "use strict";

  const SITE = {
    booking: "https://amy-rondoni.clientsecure.me",
    phone: "707.631.1550",
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

  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok && !opts.allowError) {
      const err = new Error(data.error || "Something went wrong.");
      err.status = res.status; err.data = data;
      throw err;
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
      ${img ? `<img class="cover-img" src="${esc(img)}" alt="" loading="lazy">` : `<div class="cover-mark"><img src="/assets/myo-tree.png" alt=""></div>`}
      ${badges.length ? `<div class="badge-row">${badges.join("")}</div>` : ""}
    </div>`;
  }

  function courseCard(c, opts) {
    opts = opts || {};
    const pct = opts.progress != null ? opts.progress : null;
    return `<a class="card" href="/course.html?c=${encodeURIComponent(c.slug)}">
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
        ${included.length ? `<div class="small muted">Includes: ${included.map(c => `<a href="/course.html?c=${encodeURIComponent(c.slug)}">${esc(c.title)}</a>`).join(", ")}</div>` : ""}
      </div>
      <div class="card-foot" style="gap:14px">
        <span class="price">${money(p.price_cents)}</span>
        <div style="min-width:150px">${buyButton(p, label, paymentsEnabled)}</div>
      </div>
    </article>`;
  }

  /* ---------- header & footer ---------- */

  function header() {
    const here = location.pathname.replace(/\/index\.html$/, "/");
    const link = (href, text) => `<li><a href="${href}"${here === href ? ' aria-current="page"' : ""}>${text}</a></li>`;
    return `<a class="sr-only" href="#main">Skip to content</a>
    <header class="site-header"><div class="wrap nav">
      <a class="brand" href="/" aria-label="Myo Family Health home"><img src="/assets/myo-family-health-logo.png" alt="Myo Family Health" width="185" height="30"></a>
      <ul class="nav-links" id="nav-links">
        ${link("/courses.html", "Courses")}
        ${link("/shop.html", "Shop")}
        ${link("/#newsletter", "Newsletter")}
        ${link("/account.html", "My courses")}
      </ul>
      <div class="nav-cta">
        <a class="btn btn-ghost btn-sm" href="${SITE.booking}" target="_blank" rel="noopener">Book a consult</a>
        <a class="btn btn-primary btn-sm" href="/courses.html">Browse courses</a>
        <button class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="nav-links"><span></span><span></span><span></span></button>
      </div>
    </div></header>`;
  }

  function footer() {
    const year = new Date().getFullYear();
    return `<footer class="site-footer"><div class="wrap">
      <div class="foot-grid">
        <div>
          <img class="foot-logo" src="/assets/myo-tree.png" alt="">
          <p><strong style="color:#fff">Myo Family Health</strong><br>Breathe Better… Live Better!</p>
        </div>
        <div><h4>Learn</h4><ul>
          <li><a href="/courses.html">All courses</a></li>
          <li><a href="/courses.html?price=free">Free courses</a></li>
          <li><a href="/account.html">My courses</a></li>
        </ul></div>
        <div><h4>Shop</h4><ul>
          <li><a href="/shop.html">Shop</a></li>
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

  window.MFH = { SITE, esc, $, $$, money, minutes, api, toast, md, videoEmbed, courseCard, productCard, buyButton, cover, AUDIENCE, LEVEL };
})();
