(async function () {
  "use strict";
  const B = window.MFH.BASE;
  const { api, esc, md, money, minutes, cover, buyButton, $, AUDIENCE, LEVEL } = window.MFH;
  const slug = new URLSearchParams(location.search).get("c") || "";
  const root = $("#course");

  let d;
  try {
    d = await api("/api/courses/" + encodeURIComponent(slug));
  } catch (e) {
    root.innerHTML = `<div class="wrap section narrow center stack"><h1>Course not found</h1>
      <p class="muted">It may have moved or isn't published yet.</p>
      <p><a class="btn btn-primary" href="${B}courses.html">Browse all courses</a></p></div>`;
    return;
  }

  const c = d.course;
  const lessons = d.lessons;
  const done = new Set(d.completed);
  const total = lessons.reduce((n, l) => n + (l.duration_min || 0), 0);
  const firstOpen = lessons.find(l => !done.has(l.id)) || lessons[0];
  const learnUrl = id => `${B}learn.html?c=${encodeURIComponent(c.slug)}&l=${id}`;
  const previews = lessons.filter(l => l.is_preview);
  const pct = lessons.length ? Math.round(100 * done.size / lessons.length) : 0;

  document.title = `${c.title} — Myo Family Health`;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = c.subtitle || c.title;

  // Group lessons into sections, keeping order.
  const sections = [];
  lessons.forEach(l => {
    const name = l.section || "Lessons";
    let s = sections[sections.length - 1];
    if (!s || s.name !== name) { s = { name, items: [] }; sections.push(s); }
    s.items.push(l);
  });

  const canOpen = l => d.access || l.is_preview;
  const lessonRow = l => {
    const icon = done.has(l.id) ? `<span class="l-ico done" aria-label="Completed">✓</span>`
      : canOpen(l) ? `<span class="l-ico" aria-hidden="true">▶</span>` : `<span class="l-ico" aria-label="Locked">🔒</span>`;
    const inner = `${icon}<span class="l-title">${esc(l.title)}</span>
      ${l.is_preview && !d.access ? `<span class="tag-preview">Free preview</span>` : ""}
      <span class="l-meta">${minutes(l.duration_min)}</span>`;
    return canOpen(l) ? `<a class="lesson-row" href="${learnUrl(l.id)}">${inner}</a>` : `<div class="lesson-row">${inner}</div>`;
  };

  let action;
  if (d.access) {
    action = `<a class="btn btn-primary btn-block" href="${firstOpen ? learnUrl(firstOpen.id) : "#"}">${done.size ? "Continue course" : c.price_cents ? "Start course" : "Start free course"}</a>
      ${done.size ? `<div class="progress"><i style="width:${pct}%"></i></div><p class="small muted">${pct}% complete</p>` : ""}
      ${!c.price_cents && !d.signed_in ? `<p class="small muted">Free and open to everyone. <a href="${B}account.html?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a> to save your progress.</p>` : ""}`;
  } else {
    action = `${buyButton(c, "Buy this course", d.payments_enabled)}
      ${previews.length ? `<a class="btn btn-ghost btn-block" href="${learnUrl(previews[0].id)}">Watch a free preview</a>` : ""}
      ${d.signed_in ? "" : `<p class="small muted center">Already bought it? <a href="${B}account.html?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a></p>`}`;
  }

  root.innerHTML = `
  <section class="course-hero">
    <div class="wrap course-layout">
      <div class="stack">
        <a class="small muted" href="${B}courses.html${c.category_slug ? "?cat=" + encodeURIComponent(c.category_slug) : ""}" style="text-decoration:none">← ${esc(c.category_name || "All courses")}</a>
        <h1 style="font-size:clamp(30px,4.6vw,50px)">${esc(c.title)}</h1>
        ${c.subtitle ? `<p style="font-size:19px" class="muted">${esc(c.subtitle)}</p>` : ""}
        <div class="card-meta" style="font-size:15px">
          <span>${lessons.length} lessons</span>${total ? `<span>${minutes(total)} total</span>` : ""}
          <span>For ${esc((AUDIENCE[c.audience] || "").toLowerCase())}</span><span>${esc(LEVEL[c.level] || "")}</span>
          ${c.instructor ? `<span>By ${esc(c.instructor)}</span>` : ""}
        </div>
      </div>
      <div></div>
    </div>
  </section>

  <section class="wrap course-layout" style="margin-top:-8px">
    <div class="stack" style="--gap:28px">
      ${c.outcomes.length ? `<h2 style="font-size:24px;margin-top:8px">What you'll learn</h2>
        <ul class="outcomes">${c.outcomes.map(o => `<li>${esc(o)}</li>`).join("")}</ul>` : ""}
      ${c.description ? `<h2 style="font-size:24px;margin-top:32px">About this course</h2><div class="prose">${md(c.description)}</div>` : ""}
      <h2 style="font-size:24px;margin-top:32px">Course content</h2>
      <div class="curriculum">
        ${sections.map(s => `<h4>${esc(s.name)} <span>${s.items.length} lesson${s.items.length === 1 ? "" : "s"}</span></h4>${s.items.map(lessonRow).join("")}`).join("")
          || `<div class="lesson-row muted">Lessons are being added.</div>`}
      </div>
    </div>
    <aside class="buy-box" style="margin-top:-140px">
      ${cover(c)}
      <div class="buy-inner">
        <div class="price">${money(c.price_cents)}${c.compare_at_cents > c.price_cents ? `<s>${money(c.compare_at_cents)}</s>` : ""}</div>
        ${action}
        <ul class="buy-list">
          <li>${lessons.length} lessons${total ? `, ${minutes(total)}` : ""}</li>
          <li>Watch on any device</li>
          <li>Learn at your own pace</li>
          ${lessons.some(l => l.has_download) ? "<li>Printable resources</li>" : ""}
        </ul>
      </div>
    </aside>
  </section>`;

  // On narrow screens the buy box sits below the hero; drop the overlap.
  const mq = matchMedia("(max-width: 960px)");
  const fix = () => { const b = $(".buy-box"); if (b) b.style.marginTop = mq.matches ? "0" : "-140px"; };
  mq.addEventListener("change", fix); fix();
})();
