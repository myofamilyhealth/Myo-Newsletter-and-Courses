(async function () {
  "use strict";
  const B = window.MFH.BASE;
  const { api, esc, courseCard, $, $$, AUDIENCE } = window.MFH;
  const params = new URLSearchParams(location.search);
  const state = { cat: params.get("cat") || "", aud: params.get("for") || "", price: params.get("price") || "", q: params.get("q") || "" };
  let data;

  function chips(el, key, options) {
    el.innerHTML = options.map(([v, label]) =>
      `<button class="chip" type="button" data-key="${key}" data-val="${esc(v)}" aria-pressed="${state[key] === v}">${esc(label)}</button>`).join("");
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.cat) p.set("cat", state.cat);
    if (state.aud) p.set("for", state.aud);
    if (state.price) p.set("price", state.price);
    if (state.q) p.set("q", state.q);
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  }

  function render() {
    $$(".chip").forEach(b => b.setAttribute("aria-pressed", state[b.dataset.key] === b.dataset.val));
    const q = state.q.toLowerCase();
    const list = data.courses.filter(c =>
      (!state.cat || c.category_slug === state.cat) &&
      (!state.aud || c.audience === state.aud) &&
      (!state.price || (state.price === "free" ? !c.price_cents : c.price_cents > 0)) &&
      (!q || (c.title + " " + c.subtitle + " " + (c.category_name || "")).toLowerCase().includes(q)));
    $("#count").textContent = `${list.length} course${list.length === 1 ? "" : "s"}`;
    $("#results").innerHTML = list.length ? list.map(c => courseCard(c)).join("")
      : `<div class="empty" style="grid-column:1/-1">No courses match those filters yet. <button class="btn btn-ghost btn-sm" id="clear" style="margin-left:8px">Clear filters</button></div>`;
    const clr = $("#clear");
    if (clr) clr.onclick = () => { Object.keys(state).forEach(k => state[k] = ""); $("#q").value = ""; syncUrl(); render(); };
  }

  try {
    data = await api("/api/catalog");
  } catch (e) {
    $("#results").innerHTML = `<div class="empty">Courses couldn't load right now. Please refresh.</div>`;
    return;
  }

  const usedCats = data.categories.filter(cat => data.courses.some(c => c.category_slug === cat.slug));
  chips($("#cat-filters"), "cat", [["", "All topics"], ...usedCats.map(c => [c.slug, c.name])]);
  const auds = [...new Set(data.courses.map(c => c.audience))];
  chips($("#aud-filters"), "aud", [["", "Everyone"], ...auds.map(a => [a, AUDIENCE[a] || a])]);
  chips($("#price-filters"), "price", [["", "Any price"], ["free", "Free"], ["paid", "Paid"]]);

  document.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state[b.dataset.key] = state[b.dataset.key] === b.dataset.val ? "" : b.dataset.val;
    syncUrl(); render();
  });
  $("#q").value = state.q;
  $("#q").addEventListener("input", e => { state.q = e.target.value.trim(); syncUrl(); render(); });
  render();
})();
