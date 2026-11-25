(async function () {
  "use strict";
  const { api, esc, courseCard, $ } = window.MFH;
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "";
  const root = $("#account");
  const me = await api("/api/me").catch(() => ({ signed_in: false }));

  if (me.signed_in && next && next.startsWith("/") && !next.startsWith("//")) { location.replace(next); return; }

  if (!me.signed_in) {
    root.innerHTML = `
    <section class="page-head"><div class="wrap narrow">
      <span class="eyebrow">My courses</span>
      <h1 style="margin-top:12px">Sign in to your courses</h1>
      <p>No password needed. Enter the email you used when you bought a course and we'll send you a one-time sign-in link.</p>
    </div></section>
    <section class="wrap narrow" style="padding-top:28px">
      ${params.get("link") === "expired" ? `<p class="notice" style="margin-bottom:18px">That sign-in link has expired or was already used. Request a fresh one below.</p>` : ""}
      <form class="panel stack" id="login" novalidate>
        <div class="field"><label for="email">Email address</label>
          <input class="input" id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>
        <button class="btn btn-primary" type="submit">Email me a sign-in link</button>
        <p class="form-msg" aria-live="polite"></p>
        <p class="small muted">Looking for something to start with? <a href="/courses.html?price=free">Try a free course</a>, with no sign-in needed.</p>
      </form>
    </section>`;
    const form = $("#login");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $(".form-msg", form), btn = $("button", form);
      msg.className = "form-msg"; btn.disabled = true;
      try {
        const r = await api("/api/auth/request", { method: "POST", body: { email: form.email.value, next: next || "/account.html" } });
        msg.classList.add("ok");
        msg.innerHTML = esc(r.message) +
          (r.email_pending ? `<br><span class="muted">Email delivery is still being set up. If nothing arrives, contact us and we'll send your link directly.</span>` : "") +
          (r.dev_link ? `<br><a href="${esc(r.dev_link)}">Development sign-in link →</a>` : "");
      } catch (err) {
        msg.classList.add("err"); msg.textContent = err.message;
      } finally { btn.disabled = false; }
    });
    return;
  }

  const courses = me.courses;
  root.innerHTML = `
  <section class="page-head"><div class="wrap">
    <span class="eyebrow">My courses</span>
    <h1 style="margin-top:12px">Welcome back${me.member.name ? ", " + esc(me.member.name.split(" ")[0]) : ""}</h1>
    <p>Signed in as ${esc(me.member.email)} · <button class="btn btn-ghost btn-sm" id="logout" style="vertical-align:middle">Sign out</button></p>
  </div></section>
  <section class="wrap" style="padding-top:28px">
    <div class="grid">${courses.length ? courses.map(c => courseCard(c, {
      progress: c.lesson_count ? Math.round(100 * c.completed_count / c.lesson_count) : 0, badges: false })).join("")
      : `<div class="empty" style="grid-column:1/-1">You don't have any courses yet. <a href="/courses.html">Browse courses →</a></div>`}</div>
  </section>`;
  $("#logout").onclick = async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/"; };
})();
