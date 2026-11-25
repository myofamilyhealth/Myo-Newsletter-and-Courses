(async function () {
  "use strict";
  const B = window.MFH.BASE;
  const { api, esc, productCard, courseCard, $, $$ } = window.MFH;
  const LABELS = { "": "Everything", bundle: "Bundles", digital: "Downloads", physical: "Products", session: "Sessions" };
  let data, kind = new URLSearchParams(location.search).get("type") || "";
  try { data = await api("/api/catalog"); }
  catch (e) { $("#products").innerHTML = `<div class="empty">The shop couldn't load. Please refresh.</div>`; return; }

  const kinds = ["", ...new Set(data.products.map(p => p.kind))];
  $("#kind-filters").innerHTML = kinds.length > 2 ? kinds.map(k =>
    `<button class="chip" data-k="${k}" aria-pressed="${k === kind}">${esc(LABELS[k] || k)}</button>`).join("") : "";

  function render() {
    $$("#kind-filters .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.k === kind));
    const list = data.products.filter(p => !kind || p.kind === kind);
    $("#products").innerHTML = list.length ? list.map(p => productCard(p, data.courses, data.payments_enabled)).join("")
      : `<div class="empty" style="grid-column:1/-1">New products are coming soon.</div>`;
  }
  $("#kind-filters").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    kind = b.dataset.k; render();
  });
  render();
  $("#courses").innerHTML = data.courses.filter(c => c.price_cents).map(c => courseCard(c)).join("");
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
})();
