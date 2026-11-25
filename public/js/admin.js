/* Owner dashboard. Every request is checked by the server; this
   file only draws screens. Nothing secret is in it. */
(function () {
  "use strict";
  const B = window.MFH.BASE;
  const { api, esc, md, money, minutes, toast, $, $$, AUDIENCE, LEVEL } = window.MFH;
  const app = () => $("#app");
  const dlg = () => $("#dlg");
  let stats = {}, categories = [], courses = [];

  const dollars = cents => cents ? (cents / 100).toFixed(2).replace(/\.00$/, "") : "";
  const cents = v => Math.round((parseFloat(String(v).replace(/[^0-9.]/g, "")) || 0) * 100);
  const fmtDate = s => s ? new Date(s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z")).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
  const formData = form => Object.fromEntries(new FormData(form));

  async function call(path, method, body) {
    try { return await api(path, { method, body }); }
    catch (e) {
      if (e.status === 401) { showLogin(); throw e; }
      toast(e.message); throw e;
    }
  }

  /* ---------------- login ---------------- */

  function showLogin(msg) {
    $("#signout").hidden = true;
    app().innerHTML = `<section class="section"><form class="panel stack" id="login" style="max-width:420px;margin:0 auto">
      <img src="${B}assets/myo-tree.png" alt="" width="56">
      <h1 style="font-size:28px">Owner sign in</h1>
      <p class="muted">Manage courses, the shop and members.</p>
      <div class="field"><label for="pw">Password</label>
        <input class="input" type="password" id="pw" name="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
      <p class="form-msg err" aria-live="polite">${esc(msg || "")}</p>
    </form></section>`;
    $("#pw").focus();
    $("#login").onsubmit = async e => {
      e.preventDefault();
      try {
        await api("/api/admin/login", { method: "POST", body: { password: $("#pw").value } });
        boot();
      } catch (err) { $("#login .form-msg").textContent = err.message; }
    };
  }

  /* ---------------- shell ---------------- */

  const TABS = [
    ["overview", "Overview"], ["courses", "Courses"], ["shop", "Shop"],
    ["categories", "Categories"], ["members", "Members"], ["payments", "Payments"], ["newsletter", "Newsletter"]
  ];

  function shell(active, content) {
    const counts = { courses: stats.courses, shop: stats.products, members: stats.members, newsletter: stats.subscribers };
    app().innerHTML = `<div class="adm">
      <nav class="adm-nav" aria-label="Dashboard">${TABS.map(([k, l]) =>
        `<button data-tab="${k}" aria-current="${k === active}">${l}${counts[k] != null ? `<span class="count">${counts[k]}</span>` : ""}</button>`).join("")}</nav>
      <section id="view">${content}</section></div>`;
    $$(".adm-nav button").forEach(b => b.onclick = () => go(b.dataset.tab));
  }

  async function refreshStats() { stats = await call("/api/admin/stats"); }
  async function loadCategories() { categories = await call("/api/admin/categories"); }

  function go(tab, arg) {
    location.hash = arg ? `${tab}/${arg}` : tab;
  }

  async function route() {
    const [tab, arg] = (location.hash.slice(1) || "overview").split("/");
    try {
      await refreshStats();
      if (tab === "courses" && arg) return await courseEditor(arg === "new" ? 0 : Number(arg));
      const views = { overview, courses: courseList, shop: shopView, categories: categoryView, members: membersView, payments: paymentsView, newsletter: newsletterView };
      await (views[tab] || overview)();
    } catch (e) { if (e.status !== 401) console.error(e); }
  }

  /* ---------------- overview ---------------- */

  async function overview() {
    shell("overview", `
      <div class="adm-head"><h1>Overview</h1>
        <button class="btn btn-primary" id="new-course">+ New course</button></div>
      <div class="stats">
        <div class="stat"><strong>${stats.published}</strong><span>published courses</span></div>
        <div class="stat"><strong>${stats.courses - stats.published}</strong><span>drafts</span></div>
        <div class="stat"><strong>${stats.lessons}</strong><span>lessons</span></div>
        <div class="stat"><strong>${stats.members}</strong><span>members</span></div>
        <div class="stat"><strong>${stats.enrollments}</strong><span>course enrollments</span></div>
        <div class="stat"><strong>${stats.subscribers}</strong><span>newsletter sign-ups</span></div>
      </div>
      <h2 style="font-size:20px;margin:32px 0 12px">Connections</h2>
      <div class="stack">
        <div class="integration"><span class="dot ${stats.payments_connected ? "on" : ""}"></span>
          <div><strong>Payments</strong><br><span class="small muted">${stats.payments_connected ? "Connected." :
            "SamCart isn't connected yet. See the Payments tab for the steps. Until then, give buyers access under Members."}</span></div></div>
        <div class="integration"><span class="dot ${stats.email_connected ? "on" : ""}"></span>
          <div><strong>Email</strong><br><span class="small muted">${stats.email_connected ? "Connected." :
            "Not connected yet. Sign-in links aren't emailed automatically, so copy them from Members and send them yourself. Newsletter sign-ups are saved here."}</span></div></div>
      </div>
      <h2 style="font-size:20px;margin:32px 0 12px">Quick start</h2>
      <ol class="prose small" style="max-width:640px">
        <li>Create <strong>categories</strong> (topics) for your courses.</li>
        <li>Create a <strong>course</strong>, then add lessons with video links, text and downloads.</li>
        <li>Set a price (0 = free) and switch the status to <strong>Published</strong>.</li>
        <li>Add bundles, downloads or sessions in the <strong>Shop</strong>.</li>
      </ol>`);
    $("#new-course").onclick = () => go("courses", "new");
  }

  /* ---------------- courses ---------------- */

  async function courseList() {
    courses = await call("/api/admin/courses");
    shell("courses", `
      <div class="adm-head"><h1>Courses</h1><button class="btn btn-primary" id="new-course">+ New course</button></div>
      ${courses.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Course</th><th>Status</th><th>Price</th><th>Lessons</th><th>Students</th><th></th></tr></thead>
        <tbody>${courses.map(c => `<tr>
          <td><strong>${esc(c.title)}</strong><br><span class="small muted">${esc(c.category_name || "No category")} · ${esc(AUDIENCE[c.audience] || "")}</span></td>
          <td><span class="pill ${c.status === "draft" ? "draft" : ""}">${c.status === "draft" ? "Draft" : "Published"}</span>${c.featured ? ` <span class="pill">★</span>` : ""}</td>
          <td>${money(c.price_cents)}</td><td>${c.lesson_count}</td><td>${c.student_count}</td>
          <td><div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
            ${c.status === "published" ? `<a class="btn btn-ghost btn-sm" href="${B}course.html?c=${encodeURIComponent(c.slug)}" target="_blank">View</a>` : ""}
            <button class="btn btn-ghost btn-sm" data-dup="${c.id}">Duplicate</button>
          </div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">No courses yet. Create your first one!</div>`}`);
    $("#new-course").onclick = () => go("courses", "new");
    $$("[data-edit]").forEach(b => b.onclick = () => go("courses", b.dataset.edit));
    $$("[data-dup]").forEach(b => b.onclick = async () => {
      const r = await call(`/api/admin/courses/${b.dataset.dup}/duplicate`, "POST", {});
      toast("Copied as a draft."); go("courses", r.id);
    });
  }

  async function courseEditor(id) {
    await loadCategories();
    let c = { title: "", subtitle: "", description: "", outcomes: [], audience: "families", level: "beginner",
      price_cents: 0, compare_at_cents: 0, accent: "teal", status: "draft", instructor: "Myo Family Health",
      cover_url: "", checkout_url: "", featured: 0, sort: 0, category_id: "" };
    let lessons = [];
    if (id) { const r = await call(`/api/admin/courses/${id}`); c = r.course; lessons = r.lessons; }

    shell("courses", `
      <div class="adm-head">
        <div><a class="small muted" href="#courses" style="text-decoration:none">← All courses</a>
          <h1 style="margin-top:6px">${id ? esc(c.title) : "New course"}</h1></div>
        <div class="status-row">
          ${id && c.status === "published" ? `<a class="btn btn-ghost" href="${B}course.html?c=${encodeURIComponent(c.slug)}" target="_blank">View live ↗</a>` : ""}
          <button class="btn btn-primary" form="course-form" type="submit">${id ? "Save changes" : "Create course"}</button>
        </div>
      </div>
      <form class="panel" id="course-form">
        <div class="form-grid">
          <div class="field full"><label for="f-title">Course title</label><input class="input" id="f-title" name="title" required value="${esc(c.title)}"></div>
          <div class="field full"><label for="f-sub">Short tagline</label><input class="input" id="f-sub" name="subtitle" value="${esc(c.subtitle)}" placeholder="One line shown on course cards"></div>
          <div class="field"><label for="f-status">Status</label><select class="input" id="f-status" name="status">
            ${opt("draft", "Draft (hidden)", c.status)}${opt("published", "Published (live)", c.status)}</select></div>
          <div class="field"><label for="f-cat">Category</label><select class="input" id="f-cat" name="category_id">
            ${opt("", "No category", c.category_id || "")}${categories.map(k => opt(k.id, k.name, c.category_id)).join("")}</select>
            <span class="hint"><a href="#categories">Manage categories</a></span></div>
          <div class="field"><label for="f-aud">Who it's for</label><select class="input" id="f-aud" name="audience">
            ${Object.entries(AUDIENCE).map(([k, v]) => opt(k, v, c.audience)).join("")}</select></div>
          <div class="field"><label for="f-lvl">Level</label><select class="input" id="f-lvl" name="level">
            ${Object.entries(LEVEL).map(([k, v]) => opt(k, v, c.level)).join("")}</select></div>
          <div class="field"><label for="f-price">Price (USD)</label><input class="input" id="f-price" name="price" inputmode="decimal" value="${dollars(c.price_cents)}" placeholder="0 = free">
            <span class="hint">Leave empty or 0 for a free course.</span></div>
          <div class="field"><label for="f-cmp">Was-price (optional)</label><input class="input" id="f-cmp" name="compare_at" inputmode="decimal" value="${dollars(c.compare_at_cents)}" placeholder="Shows crossed out"></div>
          <div class="field"><label for="f-acc">Card colour</label><select class="input" id="f-acc" name="accent">
            ${[["teal", "Teal"], ["sage", "Sage"], ["sand", "Sand"], ["slate", "Slate"], ["clay", "Clay"]].map(([k, v]) => opt(k, v, c.accent)).join("")}</select></div>
          <div class="field"><label for="f-ins">Instructor</label><input class="input" id="f-ins" name="instructor" value="${esc(c.instructor)}"></div>
          <div class="field full"><label for="f-cover">Cover image URL (optional)</label><input class="input" id="f-cover" name="cover_url" value="${esc(c.cover_url)}" placeholder="https://… (16:9 works best). Empty = brand colour card"></div>
          <div class="field full"><label for="f-checkout">SamCart checkout link</label><input class="input" id="f-checkout" name="checkout_url" value="${esc(c.checkout_url)}" placeholder="https://yourstore.samcart.com/products/…">
            <span class="hint">The course's Buy button opens this. Upsells, downsells and order bumps are set up on the SamCart side.</span></div>
          <div class="field full"><label for="f-scid">SamCart product ID(s)</label><input class="input" id="f-scid" name="samcart_product_id" value="${esc(c.samcart_product_id || "")}" placeholder="e.g. 123456">
            <span class="hint">Buying any of these SamCart products unlocks this course, including when it's sold as an upsell or downsell. Separate several IDs with commas. <a href="#payments">Where to find it</a></span></div>
          <div class="field full"><label for="f-out">What you'll learn (one per line)</label><textarea class="input" id="f-out" name="outcomes" rows="4">${esc((c.outcomes || []).join("\n"))}</textarea></div>
          <div class="field full">${mdField("description", "Course description", c.description)}</div>
          <label class="check"><input type="checkbox" name="featured" ${c.featured ? "checked" : ""}> Feature on the home page</label>
          <div class="field"><label for="f-sort">Display order</label><input class="input" id="f-sort" name="sort" type="number" value="${Number(c.sort) || 0}"><span class="hint">Lower numbers show first.</span></div>
        </div>
      </form>

      ${id ? `<div class="adm-head" style="margin-top:36px"><div><h2 style="font-size:22px">Lessons</h2>
          <p class="small muted">Tip: lessons with the same section name are grouped together as a module.</p></div>
          <button class="btn btn-primary" id="add-lesson">+ Add lesson</button></div>
        <div id="lessons">${lessons.length ? lessons.map((l, i) => `<div class="lesson-item">
            <div style="display:grid;gap:4px">
              <button class="icon-btn" data-up="${i}" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
              <button class="icon-btn" data-down="${i}" aria-label="Move down" ${i === lessons.length - 1 ? "disabled" : ""}>↓</button></div>
            <div class="grow"><span class="sec">${esc(l.section || "No section")}</span><br><strong>${esc(l.title)}</strong>
              <span class="small muted"> · ${minutes(l.duration_min) || "—"}${l.video_url ? " · 🎬 video" : ""}${l.download_url ? " · 📎 download" : ""}</span>
              ${l.is_preview ? ` <span class="pill">Free preview</span>` : ""}</div>
            <button class="btn btn-ghost btn-sm" data-lesson="${l.id}">Edit</button></div>`).join("")
          : `<div class="empty">No lessons yet. Add the first one.</div>`}</div>
        <div style="margin-top:48px;padding-top:20px;border-top:1px solid var(--line)">
          <button class="btn btn-danger" id="del-course">Delete this course</button>
          <span class="small muted" style="margin-left:10px">Removes the course, its lessons and everyone's access. This can't be undone.</span></div>`
      : `<p class="notice" style="margin-top:20px">Create the course first, then you can add lessons.</p>`}`);

    bindMd(app());
    $("#course-form").onsubmit = async e => {
      e.preventDefault();
      const f = formData(e.target);
      const body = { ...f, price_cents: cents(f.price), compare_at_cents: cents(f.compare_at), featured: !!f.featured, slug: c.slug || "" };
      if (id) { await call(`/api/admin/courses/${id}`, "PUT", body); toast("Saved."); courseEditor(id); }
      else { const r = await call("/api/admin/courses", "POST", body); toast("Course created. Now add lessons."); go("courses", r.id); }
    };
    if (!id) return;

    $("#add-lesson").onclick = () => lessonDialog(id, null, lessons);
    $$("[data-lesson]").forEach(b => b.onclick = () => lessonDialog(id, lessons.find(l => l.id === Number(b.dataset.lesson)), lessons));
    const move = async (i, d) => {
      const order = lessons.map(l => l.id);
      [order[i], order[i + d]] = [order[i + d], order[i]];
      await call(`/api/admin/courses/${id}/lessons/reorder`, "POST", { order });
      courseEditor(id);
    };
    $$("[data-up]").forEach(b => b.onclick = () => move(Number(b.dataset.up), -1));
    $$("[data-down]").forEach(b => b.onclick = () => move(Number(b.dataset.down), 1));
    $("#del-course").onclick = async () => {
      if (!confirm(`Delete "${c.title}" and all its lessons? Members will lose access. This can't be undone.`)) return;
      await call(`/api/admin/courses/${id}`, "DELETE");
      toast("Course deleted."); go("courses");
    };
  }

  /* Markdown textarea with a Write / Preview toggle */
  function mdField(name, label, value) {
    return `<div class="md-field"><div style="display:flex;justify-content:space-between;align-items:end;gap:8px;flex-wrap:wrap">
      <label class="label" for="md-${name}">${esc(label)}</label>
      <div class="md-tabs"><button type="button" class="chip" aria-pressed="true" data-mdtab="write">Write</button>
      <button type="button" class="chip" aria-pressed="false" data-mdtab="preview">Preview</button></div></div>
      <textarea class="input" id="md-${name}" name="${name}" rows="8">${esc(value || "")}</textarea>
      <div class="md-preview prose" hidden></div>
      <span class="hint">Formatting: ## Heading, **bold**, *italic*, - bullet list, 1. numbered list, [link text](https://…)</span></div>`;
  }
  function bindMd(root) {
    $$(".md-field", root).forEach(f => {
      const ta = $("textarea", f), pv = $(".md-preview", f);
      $$("[data-mdtab]", f).forEach(b => b.onclick = () => {
        const prev = b.dataset.mdtab === "preview";
        $$("[data-mdtab]", f).forEach(x => x.setAttribute("aria-pressed", x === b));
        pv.innerHTML = md(ta.value) || "<p class='muted'>Nothing to preview yet.</p>";
        pv.hidden = !prev; ta.hidden = prev;
      });
    });
  }

  function openDialog(title, bodyHtml, footHtml) {
    const d = dlg();
    d.innerHTML = `<div class="dlg-head"><h2 style="font-size:20px">${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="dlg-body">${bodyHtml}</div><div class="dlg-foot">${footHtml}</div>`;
    $$("[data-close]", d).forEach(b => b.onclick = () => d.close());
    bindMd(d);
    d.showModal();
    return d;
  }

  function lessonDialog(courseId, l, lessons) {
    const isNew = !l;
    l = l || { section: lessons.length ? lessons[lessons.length - 1].section : "", title: "", summary: "", body: "",
      video_url: "", download_url: "", download_label: "", duration_min: "", is_preview: 0 };
    const sections = [...new Set(lessons.map(x => x.section).filter(Boolean))];
    const d = openDialog(isNew ? "New lesson" : "Edit lesson", `
      <form id="lesson-form" class="form-grid">
        <div class="field full"><label for="l-title">Lesson title</label><input class="input" id="l-title" name="title" required value="${esc(l.title)}"></div>
        <div class="field"><label for="l-sec">Section / module</label><input class="input" id="l-sec" name="section" list="sec-list" value="${esc(l.section)}" placeholder="e.g. Week 1 · Awareness">
          <datalist id="sec-list">${sections.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
        <div class="field"><label for="l-dur">Length (minutes)</label><input class="input" id="l-dur" name="duration_min" type="number" min="0" value="${esc(l.duration_min)}"></div>
        <div class="field full"><label for="l-sum">Short summary</label><input class="input" id="l-sum" name="summary" value="${esc(l.summary)}"></div>
        <div class="field full"><label for="l-vid">Video link</label><input class="input" id="l-vid" name="video_url" value="${esc(l.video_url)}" placeholder="YouTube, Vimeo or Loom link, or a direct .mp4 URL">
          <span class="hint">For paid lessons use <strong>unlisted</strong> YouTube or private Vimeo videos so they can't be found by searching.</span></div>
        <div class="field"><label for="l-dl">Download link (optional)</label><input class="input" id="l-dl" name="download_url" value="${esc(l.download_url)}" placeholder="https://… PDF, worksheet"></div>
        <div class="field"><label for="l-dll">Download button text</label><input class="input" id="l-dll" name="download_label" value="${esc(l.download_label)}" placeholder="e.g. Printable tracker (PDF)"></div>
        <div class="field full">${mdField("body", "Lesson notes", l.body)}</div>
        <label class="check full"><input type="checkbox" name="is_preview" ${l.is_preview ? "checked" : ""}> Free preview: anyone can watch this lesson without buying</label>
      </form>`,
      `${isNew ? "<span></span>" : `<button class="btn btn-danger" id="l-del">Delete lesson</button>`}
       <div style="display:flex;gap:8px"><button class="btn btn-ghost" data-close>Cancel</button>
       <button class="btn btn-primary" type="submit" form="lesson-form">${isNew ? "Add lesson" : "Save lesson"}</button></div>`);
    $$("[data-close]", d).forEach(b => b.onclick = () => d.close());
    $("#lesson-form", d).onsubmit = async e => {
      e.preventDefault();
      const f = formData(e.target);
      f.is_preview = !!f.is_preview;
      if (isNew) await call(`/api/admin/courses/${courseId}/lessons`, "POST", f);
      else await call(`/api/admin/courses/${courseId}/lessons/${l.id}`, "PUT", f);
      d.close(); toast(isNew ? "Lesson added." : "Lesson saved."); courseEditor(courseId);
    };
    const del = $("#l-del", d);
    if (del) del.onclick = async () => {
      if (!confirm(`Delete the lesson "${l.title}"?`)) return;
      await call(`/api/admin/courses/${courseId}/lessons/${l.id}`, "DELETE");
      d.close(); toast("Lesson deleted."); courseEditor(courseId);
    };
  }

  /* ---------------- shop ---------------- */

  const KINDS = { bundle: "Course bundle", digital: "Digital download", physical: "Physical product", session: "Session / consult" };

  async function shopView() {
    const [products, allCourses] = await Promise.all([call("/api/admin/products"), call("/api/admin/courses")]);
    courses = allCourses;
    shell("shop", `
      <div class="adm-head"><h1>Shop</h1><button class="btn btn-primary" id="new-product">+ New product</button></div>
      ${products.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Product</th><th>Type</th><th>Status</th><th>Price</th><th>Checkout</th><th></th></tr></thead>
        <tbody>${products.map(p => `<tr><td><strong>${esc(p.name)}</strong><br><span class="small muted">${esc(p.tagline)}</span></td>
          <td>${esc(KINDS[p.kind])}</td><td><span class="pill ${p.status === "draft" ? "draft" : ""}">${p.status === "draft" ? "Draft" : "Published"}</span></td>
          <td>${money(p.price_cents)}</td><td>${p.checkout_url ? "✓ Linked" : `<span class="muted">Not yet</span>`}</td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">No products yet.</div>`}`);
    $("#new-product").onclick = () => productDialog(null);
    $$("[data-edit]").forEach(b => b.onclick = () => productDialog(products.find(p => p.id === Number(b.dataset.edit))));
  }

  function productDialog(p) {
    const isNew = !p;
    p = p || { name: "", tagline: "", description: "", kind: "digital", price_cents: 0, image_url: "", checkout_url: "", course_ids: [], status: "draft", sort: 0 };
    const d = openDialog(isNew ? "New product" : "Edit product", `
      <form id="p-form" class="form-grid">
        <div class="field full"><label for="p-name">Name</label><input class="input" id="p-name" name="name" required value="${esc(p.name)}"></div>
        <div class="field full"><label for="p-tag">Tagline</label><input class="input" id="p-tag" name="tagline" value="${esc(p.tagline)}"></div>
        <div class="field"><label for="p-kind">Type</label><select class="input" id="p-kind" name="kind">${Object.entries(KINDS).map(([k, v]) => opt(k, v, p.kind)).join("")}</select></div>
        <div class="field"><label for="p-status">Status</label><select class="input" id="p-status" name="status">${opt("draft", "Draft (hidden)", p.status)}${opt("published", "Published (live)", p.status)}</select></div>
        <div class="field"><label for="p-price">Price (USD)</label><input class="input" id="p-price" name="price" inputmode="decimal" value="${dollars(p.price_cents)}"></div>
        <div class="field"><label for="p-sort">Display order</label><input class="input" id="p-sort" name="sort" type="number" value="${Number(p.sort) || 0}"></div>
        <div class="field full"><label for="p-img">Image URL (optional)</label><input class="input" id="p-img" name="image_url" value="${esc(p.image_url)}"></div>
        <div class="field full"><label for="p-co">SamCart checkout (or booking) link</label><input class="input" id="p-co" name="checkout_url" value="${esc(p.checkout_url)}" placeholder="https://yourstore.samcart.com/products/…"></div>
        <div class="field full"><label for="p-scid">SamCart product ID(s)</label><input class="input" id="p-scid" name="samcart_product_id" value="${esc(p.samcart_product_id || "")}" placeholder="e.g. 123456">
          <span class="hint">For bundles: buying this SamCart product unlocks every course ticked below.</span></div>
        <fieldset class="field full" style="border:0;padding:0;margin:0"><legend class="label">Courses included (for bundles)</legend>
          <div style="display:grid;gap:6px;margin-top:6px">${courses.map(c => `<label class="check"><input type="checkbox" name="course" value="${c.id}" ${p.course_ids.includes(c.id) ? "checked" : ""}> ${esc(c.title)}</label>`).join("") || `<span class="muted small">No courses yet.</span>`}</div></fieldset>
        <div class="field full">${mdField("description", "Description", p.description)}</div>
      </form>`,
      `${isNew ? "<span></span>" : `<button class="btn btn-danger" id="p-del">Delete</button>`}
       <div style="display:flex;gap:8px"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="p-form">Save</button></div>`);
    $$("[data-close]", d).forEach(b => b.onclick = () => d.close());
    $("#p-form", d).onsubmit = async e => {
      e.preventDefault();
      const f = formData(e.target);
      f.price_cents = cents(f.price);
      f.course_ids = $$('input[name="course"]:checked', e.target).map(i => Number(i.value));
      await call(isNew ? "/api/admin/products" : `/api/admin/products/${p.id}`, isNew ? "POST" : "PUT", { ...f, slug: p.slug || "" });
      d.close(); toast("Saved."); shopView();
    };
    const del = $("#p-del", d);
    if (del) del.onclick = async () => {
      if (!confirm(`Delete "${p.name}"?`)) return;
      await call(`/api/admin/products/${p.id}`, "DELETE"); d.close(); toast("Deleted."); shopView();
    };
  }

  /* ---------------- categories ---------------- */

  async function categoryView() {
    await loadCategories();
    shell("categories", `
      <div class="adm-head"><div><h1>Categories</h1><p class="muted small">Topics visitors can filter courses by.</p></div></div>
      <form class="panel form-grid" id="cat-form" style="margin-bottom:20px">
        <div class="field"><label for="c-name">New category</label><input class="input" id="c-name" name="name" required placeholder="e.g. Speech & Swallowing"></div>
        <div class="field"><label for="c-desc">Short description</label><input class="input" id="c-desc" name="description"></div>
        <div class="field" style="justify-content:end"><button class="btn btn-primary" type="submit">Add category</button></div>
      </form>
      <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Description</th><th>Order</th><th>Courses</th><th></th></tr></thead>
      <tbody>${categories.map(k => `<tr data-id="${k.id}">
        <td><input class="input" name="name" value="${esc(k.name)}" aria-label="Name"></td>
        <td><input class="input" name="description" value="${esc(k.description)}" aria-label="Description"></td>
        <td style="width:90px"><input class="input" name="sort" type="number" value="${k.sort}" aria-label="Order"></td>
        <td>${k.course_count}</td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-save>Save</button><button class="btn btn-danger btn-sm" data-del>Delete</button></div></td></tr>`).join("")}</tbody></table></div>`);
    $("#cat-form").onsubmit = async e => { e.preventDefault(); await call("/api/admin/categories", "POST", formData(e.target)); toast("Category added."); categoryView(); };
    $$("tr[data-id]").forEach(tr => {
      const id = tr.dataset.id;
      const val = n => $(`[name="${n}"]`, tr).value;
      $("[data-save]", tr).onclick = async () => { await call(`/api/admin/categories/${id}`, "PUT", { name: val("name"), description: val("description"), sort: val("sort") }); toast("Saved."); };
      $("[data-del]", tr).onclick = async () => {
        if (!confirm("Delete this category? Its courses stay, just without a category.")) return;
        await call(`/api/admin/categories/${id}`, "DELETE"); categoryView();
      };
    });
  }

  /* ---------------- members ---------------- */

  async function membersView() {
    const [members, allCourses] = await Promise.all([call("/api/admin/members"), call("/api/admin/courses")]);
    courses = allCourses;
    shell("members", `
      <div class="adm-head"><div><h1>Members</h1><p class="muted small">People with access to courses.</p></div></div>
      <form class="panel form-grid" id="grant-form" style="margin-bottom:12px">
        <div class="field"><label for="g-email">Give someone a course</label><input class="input" id="g-email" name="email" type="email" required placeholder="buyer@example.com"></div>
        <div class="field"><label for="g-name">Name (optional)</label><input class="input" id="g-name" name="name"></div>
        <div class="field"><label for="g-course">Course</label><select class="input" id="g-course" name="course_id" required>
          ${courses.map(c => opt(c.id, c.title + (c.status === "draft" ? " (draft)" : ""), "")).join("")}</select></div>
        <div class="field" style="justify-content:end"><button class="btn btn-primary" type="submit">Grant access</button></div>
      </form>
      <p class="small muted" style="margin-bottom:20px">Until payments are connected, add buyers here after they pay. Then use <strong>Copy sign-in link</strong> and send it to them.</p>
      <label class="search"><span class="sr-only">Search members</span><input class="input" id="m-q" placeholder="Search by email or name…" style="max-width:360px;margin-bottom:14px"></label>
      <div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Courses</th><th>Joined</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody id="m-rows"></tbody></table></div>`);

    const rows = list => list.length ? list.map(m => `<tr>
      <td><strong>${esc(m.email)}</strong>${m.name ? `<br><span class="small muted">${esc(m.name)}</span>` : ""}</td>
      <td>${m.courses.map(c => `<span class="pill" style="display:inline-flex;gap:6px;align-items:center;margin:2px">${esc(c.title)}
        <button class="icon-btn" style="width:20px;height:20px;font-size:11px;border:0;background:transparent" data-revoke="${m.id}:${c.course_id}" aria-label="Remove ${esc(c.title)}">✕</button></span>`).join("") || `<span class="muted small">None</span>`}</td>
      <td class="small">${fmtDate(m.created_at)}</td><td class="small">${fmtDate(m.last_login_at)}</td>
      <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-link="${m.id}">Copy sign-in link</button>
        <button class="btn btn-danger btn-sm" data-delm="${m.id}">Remove</button></div></td></tr>`).join("")
      : `<tr><td colspan="5" class="muted center">No members yet.</td></tr>`;
    const draw = () => {
      const q = $("#m-q").value.toLowerCase();
      $("#m-rows").innerHTML = rows(members.filter(m => !q || (m.email + " " + m.name).toLowerCase().includes(q)));
      $$("[data-link]").forEach(b => b.onclick = async () => {
        const r = await call(`/api/admin/members/${b.dataset.link}/login-link`, "POST", {});
        try { await navigator.clipboard.writeText(r.link); toast(`Link copied. It works once, for ${r.minutes} minutes.`); }
        catch (e) { prompt(`Sign-in link (works once, for ${r.minutes} minutes):`, r.link); }
      });
      $$("[data-revoke]").forEach(b => b.onclick = async () => {
        const [mid, cid] = b.dataset.revoke.split(":");
        if (!confirm("Remove this member's access to the course?")) return;
        await call(`/api/admin/members/${mid}/revoke`, "POST", { course_id: Number(cid) }); membersView();
      });
      $$("[data-delm]").forEach(b => b.onclick = async () => {
        if (!confirm("Remove this member and all their course access?")) return;
        await call(`/api/admin/members/${b.dataset.delm}`, "DELETE"); membersView();
      });
    };
    $("#m-q").oninput = draw;
    draw();
    $("#grant-form").onsubmit = async e => {
      e.preventDefault();
      await call("/api/admin/members/grant", "POST", formData(e.target));
      toast("Access granted."); membersView();
    };
  }

  /* ---------------- payments (SamCart) ---------------- */

  async function paymentsView() {
    const d = await call("/api/admin/payments");
    shell("payments", `
      <div class="adm-head"><div><h1>Payments</h1>
        <p class="muted small">SamCart handles checkout, upsells, downsells and order bumps. This site unlocks the courses.</p></div></div>
      <div class="integration" style="margin-bottom:20px"><span class="dot ${d.connected ? "on" : ""}"></span>
        <div><strong>SamCart ${d.connected ? "is connected" : "isn't connected yet"}</strong><br>
        <span class="small muted">${d.connected ? "Purchases unlock courses automatically." : "The site's administrator needs to set the SAMCART_WEBHOOK_SECRET secret first (see the README)."}</span></div></div>

      <div class="panel stack">
        <h2 style="font-size:20px">Set up a course in SamCart</h2>
        <ol class="prose small" style="margin:0">
          <li>In SamCart, create a product for the course (and any upsell, downsell or order-bump products).</li>
          <li>Copy the product's <strong>checkout page link</strong> into the course's <em>SamCart checkout link</em> field here.</li>
          <li>Copy the product's <strong>ID</strong> (the number in the product's address in SamCart) into <em>SamCart product ID(s)</em>.
            Do the same for every upsell or downsell product that should unlock a course. Bundles go under Shop.</li>
          <li>Build your upsell and downsell funnel in SamCart as usual. Nothing else is needed here.</li>
        </ol>
        ${d.connected ? `<div class="field"><label for="wh">Notification address for SamCart</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="wh" readonly value="${esc(d.webhook_url)}" style="flex:1 1 300px">
          <button class="btn btn-ghost" id="copy-wh" type="button">Copy</button></div>
          <span class="hint">In SamCart, add this as a webhook (SamCart calls it a Notify URL; see their “Using Webhooks” help article) for orders, upsells and refunds.
            Keep it private: anyone with it could unlock courses.</span></div>` : ""}
      </div>

      <h2 style="font-size:20px;margin:32px 0 12px">Recent purchases &amp; refunds</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Event</th><th>Customer</th><th>SamCart product</th><th>What happened</th><th></th></tr></thead>
      <tbody>${d.events.map(e => `<tr><td class="small">${fmtDate(e.received_at)}</td><td class="small">${esc(e.event_type || "—")}</td>
        <td>${esc(e.email || "—")}</td><td class="small">${esc(e.product_ids.join(", ") || "—")}</td>
        <td class="small">${esc(e.result)}</td><td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-raw="${e.id}">Details</button></div></td></tr>`).join("")
        || `<tr><td colspan="6" class="muted center">No purchases yet. They'll appear here as SamCart sends them.</td></tr>`}</tbody></table></div>`);
    const cp = $("#copy-wh");
    if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText($("#wh").value); toast("Copied."); } catch (e) { $("#wh").select(); } };
    $$("[data-raw]").forEach(b => b.onclick = async () => {
      const e = await call(`/api/admin/payments/events/${b.dataset.raw}`);
      let pretty = e.payload;
      try { pretty = JSON.stringify(JSON.parse(e.payload), null, 2); } catch (x) { /* not JSON */ }
      openDialog("Notification details", `<p class="small muted" style="margin-bottom:10px">${esc(e.result)}</p>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:13px;background:var(--offwhite);padding:14px;border-radius:12px;max-height:60vh;overflow:auto">${esc(pretty)}</pre>`,
        `<span></span><button class="btn btn-primary" data-close>Close</button>`);
    });
  }

  /* ---------------- newsletter ---------------- */

  async function newsletterView() {
    const subs = await call("/api/admin/subscribers");
    shell("newsletter", `
      <div class="adm-head"><div><h1>Newsletter sign-ups</h1>
        <p class="muted small">Collected from the site's sign-up forms. ${stats.email_connected ? "" : "They'll sync to your email platform once it's connected. Until then, download a CSV to import."}</p></div>
        <button class="btn btn-primary" id="csv" ${subs.length ? "" : "disabled"}>Download CSV</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Email</th><th>First name</th><th>Signed up</th><th>From</th><th></th></tr></thead>
      <tbody>${subs.map(s => `<tr><td>${esc(s.email)}</td><td>${esc(s.first_name)}</td><td class="small">${fmtDate(s.created_at)}</td>
        <td class="small">${esc(s.source)}</td><td><div class="row-actions"><button class="btn btn-danger btn-sm" data-del="${s.id}">Remove</button></div></td></tr>`).join("")
        || `<tr><td colspan="5" class="muted center">No sign-ups yet.</td></tr>`}</tbody></table></div>`);
    $("#csv").onclick = () => {
      const q = v => `"${String(v || "").replace(/"/g, '""')}"`;
      const csv = ["email,first_name,signed_up,source", ...subs.map(s => [s.email, s.first_name, s.created_at, s.source].map(q).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "myo-newsletter-signups.csv"; a.click();
    };
    $$("[data-del]").forEach(b => b.onclick = async () => {
      if (!confirm("Remove this sign-up?")) return;
      await call(`/api/admin/subscribers/${b.dataset.del}`, "DELETE"); newsletterView();
    });
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    if (window.MFH.STATIC) {
      app().innerHTML = `<section class="section"><div class="panel stack" style="max-width:560px;margin:0 auto">
        <img src="${B}assets/myo-tree.png" alt="" width="56">
        <h1 style="font-size:28px">The dashboard needs the live server</h1>
        <p class="muted">This copy of the site runs on GitHub Pages, which can only show pages. Creating courses,
          member sign-in and locked lessons all run on the Cloudflare server. Once it's connected, the dashboard opens here.</p>
        <p class="small muted">Setup steps are in the README under "Deploy".</p>
        <p><a class="btn btn-ghost" href="${B}">← Back to the site</a></p></div></section>`;
      return;
    }
    try { await api("/api/admin/stats"); }
    catch (e) { if (e.status === 401) return showLogin(); return showLogin(e.message); }
    $("#signout").hidden = false;
    $("#signout").onclick = async () => { await api("/api/admin/logout", { method: "POST" }); showLogin(); };
    route();
  }

  window.addEventListener("hashchange", () => { if (!$("#login")) route(); });
  document.addEventListener("DOMContentLoaded", boot);
})();
