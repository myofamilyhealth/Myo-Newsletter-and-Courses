(async function () {
  "use strict";
  const { api, esc, courseCard, productCard, $, money } = window.MFH;
  try {
    const data = await api("/api/catalog");
    const courses = data.courses;
    const featured = courses.filter(c => c.featured).slice(0, 3);
    const show = featured.length ? featured : courses.slice(0, 3);
    $("#featured").innerHTML = show.length
      ? show.map(c => courseCard(c)).join("")
      : `<div class="empty">New courses are on the way. Join the newsletter to hear first.</div>`;

    const counts = {};
    courses.forEach(c => { if (c.category_slug) counts[c.category_slug] = (counts[c.category_slug] || 0) + 1; });
    const cats = data.categories.filter(c => counts[c.slug]);
    $("#cats").innerHTML = cats.map(c => `<a class="cat-tile" href="/courses.html?cat=${encodeURIComponent(c.slug)}">
        <strong>${esc(c.name)}</strong><span>${counts[c.slug]} course${counts[c.slug] === 1 ? "" : "s"}${c.description ? " · " + esc(c.description) : ""}</span></a>`).join("");
    if (!cats.length) $("#cats").closest("section").hidden = true;

    const lessons = courses.reduce((n, c) => n + (c.lesson_count || 0), 0);
    const free = courses.filter(c => !c.price_cents).length;
    $("#hero-stats").innerHTML = `
      <div><strong>${courses.length}</strong><span>courses</span></div>
      <div><strong>${lessons}</strong><span>lessons</span></div>
      ${free ? `<div><strong>${free}</strong><span>free to start</span></div>` : ""}`;

    const hc = show[0];
    if (hc) {
      $("#hero-card").innerHTML = `${window.MFH.cover(hc)}
        <div style="padding:16px 4px 4px"><span class="card-cat">${esc(hc.category_name || "")}</span>
        <h3 style="margin-top:6px">${esc(hc.title)}</h3>
        <p class="muted small" style="margin-top:6px">${hc.lesson_count} lessons · ${money(hc.price_cents)}</p></div>`;
      $("#hero-card").querySelector(".cover").style.borderRadius = "16px";
    }

    $("#products").innerHTML = data.products.slice(0, 3).map(p => productCard(p, courses, data.payments_enabled)).join("");
    if (!data.products.length) $("#shop-teaser").hidden = true;
  } catch (e) {
    $("#featured").innerHTML = `<div class="empty">Courses couldn't load right now. Please refresh in a moment.</div>`;
  }
})();
