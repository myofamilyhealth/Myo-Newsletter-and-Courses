(async function () {
  "use strict";
  const { api, esc, md, minutes, videoEmbed, buyButton, toast, $ } = window.MFH;
  const params = new URLSearchParams(location.search);
  const slug = params.get("c") || "";
  let lessonId = Number(params.get("l")) || 0;

  let course;
  try {
    course = await api("/api/courses/" + encodeURIComponent(slug));
  } catch (e) {
    $("#lesson").innerHTML = `<div class="locked"><h2>Course not found</h2><p class="muted" style="margin-top:10px"><a href="/courses.html">Browse courses</a></p></div>`;
    return;
  }
  const c = course.course;
  const lessons = course.lessons;
  const done = new Set(course.completed);
  if (!lessonId && lessons[0]) lessonId = lessons[0].id;

  const url = id => `/learn.html?c=${encodeURIComponent(c.slug)}&l=${id}`;
  const canOpen = l => course.access || l.is_preview;

  function renderSide() {
    const pct = lessons.length ? Math.round(100 * done.size / lessons.length) : 0;
    let lastSection = null;
    const rows = lessons.map(l => {
      const head = (l.section || "Lessons") !== lastSection ? `<h4>${esc(lastSection = l.section || "Lessons")}</h4>` : "";
      const icon = done.has(l.id) ? `<span class="l-ico done">✓</span>` : canOpen(l) ? `<span class="l-ico">▶</span>` : `<span class="l-ico">🔒</span>`;
      return head + `<a class="lesson-row" href="${url(l.id)}" ${l.id === lessonId ? 'aria-current="true"' : ""}>
        ${icon}<span class="l-title">${esc(l.title)}</span><span class="l-meta">${minutes(l.duration_min)}</span></a>`;
    }).join("");
    $("#side").innerHTML = `<div class="side-head">
        <a class="small muted" href="/course.html?c=${encodeURIComponent(c.slug)}" style="text-decoration:none">← Course overview</a>
        <h3 style="margin:8px 0 12px">${esc(c.title)}</h3>
        ${course.signed_in || course.access ? `<div class="progress"><i style="width:${pct}%"></i></div>
        <p class="small muted" style="margin-top:6px">${done.size} of ${lessons.length} complete</p>` : ""}
        <button class="btn btn-ghost btn-sm side-toggle" type="button" aria-expanded="false">Show all lessons</button>
      </div><nav class="curriculum" aria-label="Lessons">${rows}</nav>`;
    const t = $(".side-toggle");
    t.onclick = () => { const o = $("#side").classList.toggle("open"); t.setAttribute("aria-expanded", o); t.textContent = o ? "Hide lessons" : "Show all lessons"; };
  }

  async function renderLesson() {
    const idx = lessons.findIndex(l => l.id === lessonId);
    const prev = lessons[idx - 1], next = lessons[idx + 1];
    const res = await api(`/api/courses/${encodeURIComponent(c.slug)}/lessons/${lessonId}`, { allowError: true });

    if (res.__status === 404) {
      $("#lesson").innerHTML = `<div class="locked"><h2>Lesson not found</h2></div>`;
      return;
    }
    if (res.locked) {
      $("#lesson").innerHTML = `<div class="locked stack">
        <div class="lock-ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
        <h2>${esc(res.lesson.title)}</h2>
        <p class="muted">This lesson is part of <strong>${esc(c.title)}</strong>. Get the full course to unlock every lesson.</p>
        <div style="max-width:320px;margin:20px auto 0" class="stack">
          ${buyButton(c, "Get the full course", course.payments_enabled)}
          ${res.signed_in ? "" : `<a class="btn btn-ghost btn-block" href="/account.html?next=${encodeURIComponent(location.pathname + location.search)}">I already bought it — sign in</a>`}
        </div></div>`;
      return;
    }

    const l = res.lesson;
    document.title = `${l.title} — ${c.title}`;
    const isDone = done.has(l.id);
    $("#lesson").innerHTML = `
      ${l.section ? `<span class="eyebrow">${esc(l.section)}</span>` : ""}
      <h1 style="font-size:clamp(26px,3.6vw,38px);margin:10px 0 20px">${esc(l.title)}</h1>
      ${videoEmbed(l.video_url)}
      ${l.body ? `<div class="prose" style="margin-top:28px">${md(l.body)}</div>` : ""}
      ${l.download_url ? `<a class="download" style="margin-top:24px" href="${esc(l.download_url)}" target="_blank" rel="noopener">
          <span class="l-ico done" style="width:40px;height:40px">↓</span>
          <span><strong>${esc(l.download_label || "Download resource")}</strong><br><span class="small muted">Opens in a new tab</span></span></a>` : ""}
      <div class="lesson-nav">
        ${prev ? `<a class="btn btn-ghost" href="${url(prev.id)}">← Previous</a>` : "<span></span>"}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn ${isDone ? "btn-ghost" : "btn-primary"}" id="mark">${isDone ? "✓ Completed" : "Mark complete"}</button>
          ${next ? `<a class="btn btn-ghost" href="${url(next.id)}">Next →</a>` : ""}
        </div>
      </div>
      ${!course.signed_in ? `<p class="small muted" style="margin-top:14px"><a href="/account.html?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a> to save your progress.</p>` : ""}`;

    $("#mark").onclick = async () => {
      if (!course.signed_in) { toast("Sign in to save your progress."); return; }
      const nowDone = !done.has(l.id);
      try {
        await api("/api/progress", { method: "POST", body: { lessonId: l.id, done: nowDone } });
        nowDone ? done.add(l.id) : done.delete(l.id);
        renderSide();
        if (nowDone && next) { location.href = url(next.id); return; }
        if (nowDone && !next) toast("Course complete — wonderful work! 🎉");
        renderLesson();
      } catch (e) { toast(e.message); }
    };
  }

  renderSide();
  renderLesson();
})();
