/* ============================================================
   Myo Family Health — courses & shop backend (Cloudflare Worker)

   One Worker serves the static site in /public and the API:

     /api/catalog, /api/courses/...   public catalog + lessons
     /api/auth/..., /api/me           member sign-in + "My courses"
     /api/newsletter                  newsletter sign-up
     /api/admin/...                   owner dashboard (password)

   Nothing secret lives in this file or in the repo. Passwords and
   signing keys are Cloudflare secrets (wrangler secret put ...).

   Two systems are deliberately left as clearly marked hooks to be
   connected later:
     - PAYMENTS: grantAccess() is what a payment webhook will call.
     - EMAIL:    sendEmail() is what sign-in links and the
                 newsletter sync will go through.
   ============================================================ */

const ADMIN_SESSION_HOURS = 12;
const MEMBER_SESSION_DAYS = 30;
const LOGIN_LINK_MINUTES = 30;
const MAX_ADMIN_FAILS_PER_HOUR = 8;
const MAX_LINK_REQUESTS_PER_HOUR = 5;

const enc = new TextEncoder();
const now = () => new Date().toISOString();
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

/* ---------------- helpers ---------------- */

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function str(v, max = 500) {
  return String(v === undefined || v === null ? "" : v).trim().slice(0, max);
}
function int(v, min = 0, max = 1e9) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
function oneOf(v, list, fallback) { return list.includes(v) ? v : fallback; }
function bool(v) { return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0; }

function slugify(s) {
  return str(s, 120).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

/* Only http(s) links are stored, so a "javascript:" URL can never
   end up in an href or an iframe. Relative /assets paths are fine. */
function safeUrl(v) {
  const s = str(v, 1000);
  if (!s) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch { return ""; }
}

function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
async function sha256(msg) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(msg))); }
function randomToken() { return hex(crypto.getRandomValues(new Uint8Array(32))); }

function readCookie(req, name) {
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

function cookie(name, value, maxAgeSec, req) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

/* Signed cookie: "<payload>.<exp>.<hmac>". Stateless, unforgeable. */
async function signSession(env, payload, hours) {
  const exp = Date.now() + hours * 3600e3;
  return `${payload}.${exp}.${await hmac(env.SESSION_SECRET, payload + "." + exp)}`;
}
async function readSession(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [payload, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, payload + "." + exp)) ? payload : null;
}

/* State-changing requests must come from this site. Combined with
   SameSite cookies this closes off cross-site request forgery. */
function checkSameOrigin(req) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("Origin");
  const self = new URL(req.url).origin;
  if (origin && origin !== self) fail(403, "cross-site request refused");
}

async function body(req) {
  try { return await req.json(); } catch { fail(400, "malformed JSON"); }
}

async function countAttempts(env, kind, key, minutes) {
  const since = new Date(Date.now() - minutes * 60e3).toISOString();
  const r = await env.DB.prepare(
    "SELECT COUNT(*) n FROM attempts WHERE kind = ? AND key = ? AND ok = 0 AND at > ?"
  ).bind(kind, key, since).first();
  return r ? Number(r.n) : 0;
}
async function noteAttempt(env, kind, key, ok) {
  await env.DB.prepare("INSERT INTO attempts (kind, key, at, ok) VALUES (?, ?, ?, ?)")
    .bind(kind, key, now(), ok ? 1 : 0).run();
}

function siteUrl(env, req) {
  return (env.SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
}

/* ============================================================
   HOOK: EMAIL  (to be connected later)
   Every email the site sends goes through here. Until a provider
   is configured it sends nothing and returns { sent: false }, and
   the owner dashboard can copy sign-in links to send by hand.
   ============================================================ */
async function sendEmail(env, { to, subject, text }) {
  if (!env.EMAIL_PROVIDER) {
    console.log(`[email not configured] would send "${subject}" to ${to}`);
    return { sent: false };
  }
  // Wire the chosen provider in here, e.g. Resend:
  //   await fetch("https://api.resend.com/emails", { method: "POST",
  //     headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
  //     body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }) });
  return { sent: false };
}

/* ============================================================
   HOOK: PAYMENTS  (to be connected later)
   The one function that gives someone a course. The owner
   dashboard calls it today; a verified payment webhook (Kit, etc.)
   will call it with source = "purchase".
   ============================================================ */
const paymentsOn = env => !!(env.PAYMENTS_ENABLED || env.SAMCART_WEBHOOK_SECRET);

async function grantAccess(env, email, courseId, source = "admin") {
  const member = await upsertMember(env, email);
  await env.DB.prepare(
    `INSERT INTO enrollments (member_id, course_id, source, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id, course_id) DO NOTHING`
  ).bind(member.id, courseId, source, now()).run();
  return member;
}

async function upsertMember(env, email, name = "") {
  email = str(email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, "Please enter a valid email address.");
  await env.DB.prepare(
    `INSERT INTO members (email, name, created_at) VALUES (?, ?, ?)
     ON CONFLICT (email) DO NOTHING`
  ).bind(email, str(name, 80), now()).run();
  return env.DB.prepare("SELECT * FROM members WHERE email = ?").bind(email).first();
}

async function createLoginLink(env, req, memberId, next = "/account.html") {
  const token = randomToken();
  const expires = new Date(Date.now() + LOGIN_LINK_MINUTES * 60e3).toISOString();
  await env.DB.prepare(
    "INSERT INTO login_tokens (token_hash, member_id, expires_at) VALUES (?, ?, ?)"
  ).bind(await sha256(token), memberId, expires).run();
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account.html";
  return `${siteUrl(env, req)}/auth/verify?token=${token}&next=${encodeURIComponent(safeNext)}`;
}

/* ============================================================
   SAMCART  (payments, upsells, downsells, order bumps)

   SamCart runs checkout and the whole upsell/downsell flow on its own
   pages, then POSTs a notification here for each purchase:

     POST /api/webhooks/samcart/<SAMCART_WEBHOOK_SECRET>

   Why a secret in the address: it means only SamCart (which is given
   the full address) can unlock courses. The secret is a Cloudflare
   secret, never in this repo. Courses are matched by the SamCart
   product IDs the owner enters in the dashboard, so the notification
   can only unlock courses the owner has linked to a SamCart product.

   SamCart's field names have varied between notification types, so
   the reader below accepts the known shapes and every notification is
   logged in payment_events to check against.
   ============================================================ */

function pick(obj, paths) {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function readSamcart(b) {
  const type = str(pick(b, ["type", "event", "event_type", "trigger", "notification_type"]), 80);
  const email = str(pick(b, ["customer.email", "customer_email", "email", "order.customer.email", "buyer.email"]), 254).toLowerCase();
  const name = str([pick(b, ["customer.first_name", "first_name"]), pick(b, ["customer.last_name", "last_name"])].filter(Boolean).join(" "), 80);
  let items = [];
  for (const key of ["products", "order.products", "items", "line_items"]) {
    const v = pick(b, [key]);
    if (Array.isArray(v)) items = items.concat(v);
  }
  const single = pick(b, ["product"]);
  if (single && typeof single === "object") items.push(single);
  const ids = new Set();
  for (const it of items) {
    const id = pick(it, ["id", "product_id", "product.id", "sku"]);
    if (id !== "") ids.add(String(id).trim());
  }
  const loose = pick(b, ["product_id", "order.product_id"]);
  if (loose !== "") ids.add(String(loose).trim());
  const refund = /refund|cancel|chargeback|revoked|subscription.?(ended|canceled|cancelled)/i.test(type) ||
    /^(refunded|cancel(l)?ed)$/i.test(str(pick(b, ["order.status", "status"]), 40));
  return { type, email, name, ids: [...ids].slice(0, 50), refund };
}

async function coursesForSamcartIds(env, ids) {
  if (!ids.length) return [];
  const has = (field) => ids.some(id => String(field || "").split(",").map(s => s.trim()).filter(Boolean).includes(id));
  const [courses, products] = await Promise.all([
    env.DB.prepare("SELECT id, samcart_product_id FROM courses WHERE samcart_product_id <> ''").all(),
    env.DB.prepare("SELECT course_ids, samcart_product_id FROM products WHERE samcart_product_id <> ''").all()
  ]);
  const out = new Set();
  courses.results.filter(c => has(c.samcart_product_id)).forEach(c => out.add(c.id));
  products.results.filter(p => has(p.samcart_product_id))
    .forEach(p => JSON.parse(p.course_ids || "[]").forEach(id => out.add(Number(id))));
  return [...out];
}

async function samcartWebhook(req, env, secret) {
  if (!env.SAMCART_WEBHOOK_SECRET || !safeEqual(secret, env.SAMCART_WEBHOOK_SECRET)) fail(404, "Not found.");

  const raw = (await req.text()).slice(0, 200000);
  let b;
  try { b = JSON.parse(raw); }
  catch {
    // Some notifications arrive form-encoded.
    b = Object.fromEntries(new URLSearchParams(raw));
    for (const k of Object.keys(b)) { try { b[k] = JSON.parse(b[k]); } catch { /* plain value */ } }
  }
  const ev = readSamcart(b || {});
  let result;
  const titles = async ids => {
    const r = await env.DB.prepare(`SELECT title FROM courses WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return r.results.map(x => x.title).join(", ");
  };

  if (!EMAIL_RE.test(ev.email)) {
    result = "ignored: no customer email";
  } else {
    const courseIds = await coursesForSamcartIds(env, ev.ids);
    if (!courseIds.length) {
      result = `no match: product ${ev.ids.join(", ") || "(none)"} isn't linked to a course yet`;
    } else if (ev.refund) {
      const m = await env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(ev.email).first();
      if (m) {
        await env.DB.batch(courseIds.map(cid => env.DB.prepare(
          "DELETE FROM enrollments WHERE member_id = ? AND course_id = ? AND source = 'purchase'").bind(m.id, cid)));
      }
      result = `refund: removed ${await titles(courseIds)}`;
    } else {
      let member;
      for (const cid of courseIds) member = await grantAccess(env, ev.email, cid, "purchase");
      if (ev.name) await env.DB.prepare("UPDATE members SET name = ? WHERE id = ? AND name = ''").bind(ev.name, member.id).run();
      const link = await createLoginLink(env, req, member.id);
      const sent = await sendEmail(env, {
        to: ev.email,
        subject: "Your Myo Family Health course is ready",
        text: `Thank you for your purchase! Tap to open your course (link works for ${LOGIN_LINK_MINUTES} minutes):\n\n${link}\n\nLater, sign in anytime at ${siteUrl(env, req)}/account.html with this email.`
      });
      result = `unlocked ${await titles(courseIds)}${sent.sent ? "; sign-in email sent" : ". Email isn't connected yet, so send their sign-in link from Members"}`;
    }
  }

  await env.DB.prepare(`INSERT INTO payment_events (received_at, provider, event_type, email, product_ids, result, payload)
    VALUES (?, 'samcart', ?, ?, ?, ?, ?)`)
    .bind(now(), ev.type, ev.email, JSON.stringify(ev.ids), result, raw.slice(0, 20000)).run();
  // Always 200 once authenticated, so SamCart doesn't retry an event we've logged.
  return json({ ok: true, result });
}

/* ---------------- member session ---------------- */

async function currentMember(req, env) {
  const id = await readSession(env, readCookie(req, "mfh_member"));
  if (!id || !/^m\d+$/.test(id)) return null;
  return env.DB.prepare("SELECT id, email, name FROM members WHERE id = ?")
    .bind(Number(id.slice(1))).first();
}

async function hasAccess(env, member, course) {
  if (course.price_cents === 0) return true;          // free courses are open
  if (!member) return false;
  const r = await env.DB.prepare(
    "SELECT 1 FROM enrollments WHERE member_id = ? AND course_id = ?"
  ).bind(member.id, course.id).first();
  return !!r;
}

/* ---------------- public catalog ---------------- */

const COURSE_CARD_COLS = `c.id, c.slug, c.title, c.subtitle, c.audience, c.level, c.price_cents,
  c.compare_at_cents, c.cover_url, c.accent, c.instructor, c.checkout_url, c.featured, c.sort,
  c.category_id, cat.slug AS category_slug, cat.name AS category_name,
  (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
  (SELECT COALESCE(SUM(duration_min),0) FROM lessons l WHERE l.course_id = c.id) AS total_minutes`;

async function catalog(env) {
  const [cats, courses, products] = await Promise.all([
    env.DB.prepare("SELECT id, slug, name, description FROM categories ORDER BY sort, name").all(),
    env.DB.prepare(`SELECT ${COURSE_CARD_COLS} FROM courses c
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE c.status = 'published' ORDER BY c.featured DESC, c.sort, c.id`).all(),
    env.DB.prepare(`SELECT id, slug, name, tagline, description, kind, price_cents, image_url,
      checkout_url, course_ids FROM products WHERE status = 'published' ORDER BY sort, id`).all()
  ]);
  return json({
    categories: cats.results,
    courses: courses.results,
    products: products.results.map(p => ({ ...p, course_ids: JSON.parse(p.course_ids || "[]") })),
    payments_enabled: paymentsOn(env)
  });
}

async function getPublishedCourse(env, slug) {
  const c = await env.DB.prepare(`SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE c.slug = ? AND c.status = 'published'`).bind(str(slug, 100)).first();
  if (!c) fail(404, "Course not found.");
  return c;
}

async function courseDetail(req, env, slug) {
  const c = await getPublishedCourse(env, slug);
  const member = await currentMember(req, env);
  const access = await hasAccess(env, member, c);
  const lessons = await env.DB.prepare(
    `SELECT id, section, title, summary, duration_min, is_preview, sort,
       (video_url <> '') AS has_video, (download_url <> '') AS has_download
     FROM lessons WHERE course_id = ? ORDER BY sort, id`
  ).bind(c.id).all();
  let completed = [];
  if (member) {
    const p = await env.DB.prepare(
      `SELECT p.lesson_id FROM progress p JOIN lessons l ON l.id = p.lesson_id
       WHERE p.member_id = ? AND l.course_id = ?`).bind(member.id, c.id).all();
    completed = p.results.map(r => r.lesson_id);
  }
  return json({
    course: { ...c, outcomes: JSON.parse(c.outcomes || "[]") },
    lessons: lessons.results,
    access,
    signed_in: !!member,
    completed,
    payments_enabled: paymentsOn(env)
  });
}

async function lessonDetail(req, env, slug, lessonId) {
  const c = await getPublishedCourse(env, slug);
  const l = await env.DB.prepare("SELECT * FROM lessons WHERE id = ? AND course_id = ?")
    .bind(int(lessonId), c.id).first();
  if (!l) fail(404, "Lesson not found.");
  const member = await currentMember(req, env);
  if (!l.is_preview && !(await hasAccess(env, member, c))) {
    return json({ locked: true, signed_in: !!member, lesson: { id: l.id, title: l.title } }, 403);
  }
  return json({ locked: false, lesson: l });
}

async function markProgress(req, env) {
  const member = await currentMember(req, env);
  if (!member) fail(401, "Sign in to save your progress.");
  const b = await body(req);
  const l = await env.DB.prepare(
    `SELECT l.id, c.id AS course_id, c.price_cents FROM lessons l JOIN courses c ON c.id = l.course_id
     WHERE l.id = ? AND c.status = 'published'`).bind(int(b.lessonId)).first();
  if (!l) fail(404, "Lesson not found.");
  if (b.done === false) {
    await env.DB.prepare("DELETE FROM progress WHERE member_id = ? AND lesson_id = ?")
      .bind(member.id, l.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO progress (member_id, lesson_id, completed_at) VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING`).bind(member.id, l.id, now()).run();
    // Finishing a lesson of a free course puts it on "My courses".
    if (l.price_cents === 0) await grantAccess(env, member.email, l.course_id, "free");
  }
  return json({ ok: true });
}

/* ---------------- member auth ---------------- */

async function requestLink(req, env) {
  const b = await body(req);
  const email = str(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, "Please enter a valid email address.");
  if (await countAttempts(env, "link_request", email, 60) >= MAX_LINK_REQUESTS_PER_HOUR) {
    fail(429, "Too many requests. Please try again in an hour.");
  }
  await noteAttempt(env, "link_request", email, false);

  // Same reply whether or not the email is a member, so this form
  // can't be used to find out who has bought what.
  const reply = {
    ok: true,
    message: "If that email has courses with us, a sign-in link is on its way.",
    email_pending: !env.EMAIL_PROVIDER
  };
  const member = await env.DB.prepare("SELECT id FROM members WHERE email = ?").bind(email).first();
  if (!member) return json(reply);

  const link = await createLoginLink(env, req, member.id, str(b.next, 200) || "/account.html");
  await sendEmail(env, {
    to: email,
    subject: "Your Myo Family Health sign-in link",
    text: `Tap to sign in to your courses (link works for ${LOGIN_LINK_MINUTES} minutes):\n\n${link}\n\nDidn't ask for this? You can ignore this email.`
  });
  // Local development only — never set DEV_SHOW_LOGIN_LINKS in production.
  if (env.DEV_SHOW_LOGIN_LINKS === "true") reply.dev_link = link;
  return json(reply);
}

async function verifyLink(req, env) {
  const url = new URL(req.url);
  const token = str(url.searchParams.get("token"), 100);
  let next = str(url.searchParams.get("next"), 200);
  if (!next.startsWith("/") || next.startsWith("//")) next = "/account.html";

  const row = token && await env.DB.prepare(
    "SELECT * FROM login_tokens WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || row.used_at || row.expires_at < now()) {
    return Response.redirect(`${siteUrl(env, req)}/account.html?link=expired`, 302);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?").bind(now(), row.token_hash),
    env.DB.prepare("UPDATE members SET last_login_at = ? WHERE id = ?").bind(now(), row.member_id)
  ]);
  const session = await signSession(env, "m" + row.member_id, MEMBER_SESSION_DAYS * 24);
  return new Response(null, {
    status: 302,
    headers: {
      location: next,
      "set-cookie": cookie("mfh_member", session, MEMBER_SESSION_DAYS * 86400, req)
    }
  });
}

async function me(req, env) {
  const member = await currentMember(req, env);
  if (!member) return json({ signed_in: false });
  const courses = await env.DB.prepare(`SELECT ${COURSE_CARD_COLS}, e.source, e.created_at AS enrolled_at,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id = p.lesson_id
         WHERE p.member_id = e.member_id AND l.course_id = c.id) AS completed_count
    FROM enrollments e JOIN courses c ON c.id = e.course_id
    LEFT JOIN categories cat ON cat.id = c.category_id
    WHERE e.member_id = ? AND c.status = 'published' ORDER BY e.created_at DESC`).bind(member.id).all();
  return json({ signed_in: true, member, courses: courses.results });
}

/* ---------------- newsletter ---------------- */

async function subscribe(req, env) {
  const b = await body(req);
  const email = str(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, "Please enter a valid email address.");
  if (str(b.website)) return json({ ok: true });    // honeypot: bots fill hidden fields
  await env.DB.prepare(`INSERT INTO subscribers (email, first_name, source, created_at)
    VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING`)
    .bind(email, str(b.first_name, 60), str(b.source, 40) || "site", now()).run();
  // HOOK: EMAIL — once the email system is connected, add the
  // subscriber to the list here (and backfill rows with synced_at NULL).
  return json({ ok: true });
}

/* ============================================================
   OWNER DASHBOARD API
   ============================================================ */

async function isAdmin(req, env) {
  return (await readSession(env, readCookie(req, "mfh_admin"))) === "admin";
}

async function adminLogin(req, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) fail(500, "Dashboard is not configured yet.");
  if (await countAttempts(env, "admin_login", "", 60) >= MAX_ADMIN_FAILS_PER_HOUR) {
    fail(429, "Too many wrong passwords. The dashboard is locked for a while.");
  }
  const b = await body(req);
  const ok = safeEqual(str(b.password, 200), env.ADMIN_PASSWORD);
  await noteAttempt(env, "admin_login", "", ok);
  if (!ok) fail(401, "That password isn't right.");
  return json({ ok: true }, 200, {
    "set-cookie": cookie("mfh_admin", await signSession(env, "admin", ADMIN_SESSION_HOURS),
      ADMIN_SESSION_HOURS * 3600, req)
  });
}

function samcartIds(v) {
  return str(v, 300).split(/[\s,]+/).map(s => s.replace(/[^\w-]/g, "")).filter(Boolean).slice(0, 10).join(",");
}

function courseFields(b) {
  let outcomes = Array.isArray(b.outcomes) ? b.outcomes : str(b.outcomes, 4000).split("\n");
  outcomes = outcomes.map(o => str(o, 200)).filter(Boolean).slice(0, 20);
  return {
    title: str(b.title, 140) || fail(400, "A course needs a title."),
    subtitle: str(b.subtitle, 240),
    description: str(b.description, 20000),
    outcomes: JSON.stringify(outcomes),
    category_id: b.category_id ? int(b.category_id) : null,
    audience: oneOf(b.audience, ["adults", "kids", "families", "professionals"], "families"),
    level: oneOf(b.level, ["beginner", "intermediate", "advanced"], "beginner"),
    price_cents: int(b.price_cents, 0, 10_000_000),
    compare_at_cents: int(b.compare_at_cents, 0, 10_000_000),
    cover_url: safeUrl(b.cover_url),
    accent: oneOf(b.accent, ["teal", "sage", "sand", "slate", "clay"], "teal"),
    instructor: str(b.instructor, 120),
    checkout_url: safeUrl(b.checkout_url),
    samcart_product_id: samcartIds(b.samcart_product_id),
    status: oneOf(b.status, ["draft", "published"], "draft"),
    featured: bool(b.featured),
    sort: int(b.sort, -1e6, 1e6)
  };
}

function lessonFields(b) {
  return {
    section: str(b.section, 120),
    title: str(b.title, 160) || fail(400, "A lesson needs a title."),
    summary: str(b.summary, 400),
    body: str(b.body, 50000),
    video_url: safeUrl(b.video_url),
    download_url: safeUrl(b.download_url),
    download_label: str(b.download_label, 80),
    duration_min: int(b.duration_min, 0, 1000),
    is_preview: bool(b.is_preview)
  };
}

function productFields(b) {
  const ids = (Array.isArray(b.course_ids) ? b.course_ids : []).map(x => int(x)).filter(Boolean);
  return {
    name: str(b.name, 140) || fail(400, "A product needs a name."),
    tagline: str(b.tagline, 240),
    description: str(b.description, 20000),
    kind: oneOf(b.kind, ["digital", "physical", "bundle", "session"], "digital"),
    price_cents: int(b.price_cents, 0, 10_000_000),
    image_url: safeUrl(b.image_url),
    checkout_url: safeUrl(b.checkout_url),
    samcart_product_id: samcartIds(b.samcart_product_id),
    course_ids: JSON.stringify([...new Set(ids)].slice(0, 50)),
    status: oneOf(b.status, ["draft", "published"], "draft"),
    sort: int(b.sort, -1e6, 1e6)
  };
}

async function uniqueSlug(env, table, wanted, exceptId = 0) {
  const base = slugify(wanted);
  let slug = base, n = 1;
  while (await env.DB.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id <> ?`).bind(slug, exceptId).first()) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

function insertSql(table, f) {
  const keys = Object.keys(f);
  return [`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, keys.map(k => f[k])];
}
function updateSql(table, f, id) {
  const keys = Object.keys(f);
  return [`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map(k => f[k]), id]];
}
async function run(env, [sql, args]) { return env.DB.prepare(sql).bind(...args).run(); }

async function admin(req, env, path, method) {
  if (path === "/api/admin/login" && method === "POST") return adminLogin(req, env);
  if (path === "/api/admin/logout") {
    return json({ ok: true }, 200, { "set-cookie": cookie("mfh_admin", "", 0, req) });
  }
  if (!(await isAdmin(req, env))) fail(401, "Please sign in.");

  const seg = path.split("/").slice(3);   // after /api/admin/
  const id = seg[1] ? int(seg[1]) : 0;

  /* --- overview --- */
  if (seg[0] === "stats") {
    const q = sql => env.DB.prepare(sql).first();
    const [c, l, m, e, s, p] = await Promise.all([
      q("SELECT COUNT(*) n, SUM(status='published') pub FROM courses"),
      q("SELECT COUNT(*) n FROM lessons"),
      q("SELECT COUNT(*) n FROM members"),
      q("SELECT COUNT(*) n FROM enrollments"),
      q("SELECT COUNT(*) n FROM subscribers"),
      q("SELECT COUNT(*) n FROM products WHERE status='published'")
    ]);
    return json({
      courses: c.n, published: c.pub || 0, lessons: l.n, members: m.n,
      enrollments: e.n, subscribers: s.n, products: p.n,
      email_connected: !!env.EMAIL_PROVIDER, payments_connected: paymentsOn(env)
    });
  }

  /* --- categories --- */
  if (seg[0] === "categories") {
    if (method === "GET") {
      return json((await env.DB.prepare(`SELECT cat.*, (SELECT COUNT(*) FROM courses c WHERE c.category_id = cat.id) AS course_count
        FROM categories cat ORDER BY sort, name`).all()).results);
    }
    const b = method === "DELETE" ? {} : await body(req);
    const f = { name: str(b.name, 80), description: str(b.description, 400), sort: int(b.sort, -1e6, 1e6) };
    if (method === "POST") {
      if (!f.name) fail(400, "A category needs a name.");
      await run(env, insertSql("categories", { ...f, slug: await uniqueSlug(env, "categories", f.name) }));
      return json({ ok: true });
    }
    if (method === "PUT" && id) {
      if (!f.name) fail(400, "A category needs a name.");
      await run(env, updateSql("categories", f, id));
      return json({ ok: true });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  /* --- courses --- */
  if (seg[0] === "courses") {
    if (method === "GET" && !id) {
      return json((await env.DB.prepare(`SELECT ${COURSE_CARD_COLS}, c.status, c.updated_at,
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
        FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
        ORDER BY c.sort, c.id`).all()).results);
    }
    if (method === "GET" && id) {
      const c = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(id).first();
      if (!c) fail(404, "Course not found.");
      const lessons = await env.DB.prepare("SELECT * FROM lessons WHERE course_id = ? ORDER BY sort, id").bind(id).all();
      return json({ course: { ...c, outcomes: JSON.parse(c.outcomes || "[]") }, lessons: lessons.results });
    }
    if (method === "POST" && !id) {
      const b = await body(req);
      const f = courseFields(b);
      const slug = await uniqueSlug(env, "courses", b.slug || f.title);
      const r = await run(env, insertSql("courses", { ...f, slug, created_at: now(), updated_at: now() }));
      return json({ ok: true, id: r.meta.last_row_id, slug });
    }
    if (method === "PUT" && id && !seg[2]) {
      const b = await body(req);
      const f = courseFields(b);
      const slug = await uniqueSlug(env, "courses", b.slug || f.title, id);
      await run(env, updateSql("courses", { ...f, slug, updated_at: now() }, id));
      return json({ ok: true, slug });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    if (method === "POST" && id && seg[2] === "duplicate") {
      const c = await env.DB.prepare("SELECT * FROM courses WHERE id = ?").bind(id).first();
      if (!c) fail(404, "Course not found.");
      const { id: _i, slug: _s, created_at: _c, updated_at: _u, ...rest } = c;
      const slug = await uniqueSlug(env, "courses", c.slug + "-copy");
      const r = await run(env, insertSql("courses", { ...rest, title: c.title + " (copy)", slug,
        status: "draft", featured: 0, created_at: now(), updated_at: now() }));
      const newId = r.meta.last_row_id;
      const lessons = await env.DB.prepare("SELECT * FROM lessons WHERE course_id = ?").bind(id).all();
      if (lessons.results.length) {
        await env.DB.batch(lessons.results.map(({ id: _x, course_id: _y, ...l }) => {
          const [sql, args] = insertSql("lessons", { ...l, course_id: newId });
          return env.DB.prepare(sql).bind(...args);
        }));
      }
      return json({ ok: true, id: newId });
    }
    /* lessons inside a course */
    if (id && seg[2] === "lessons") {
      const lid = seg[3] ? int(seg[3]) : 0;
      if (method === "POST" && seg[3] === "reorder") {
        const b = await body(req);
        const order = (Array.isArray(b.order) ? b.order : []).map(x => int(x)).slice(0, 500);
        if (order.length) {
          await env.DB.batch(order.map((lessonId, i) =>
            env.DB.prepare("UPDATE lessons SET sort = ? WHERE id = ? AND course_id = ?").bind(i, lessonId, id)));
        }
        return json({ ok: true });
      }
      if (method === "POST" && !lid) {
        const f = lessonFields(await body(req));
        const max = await env.DB.prepare("SELECT COALESCE(MAX(sort), -1) m FROM lessons WHERE course_id = ?").bind(id).first();
        const r = await run(env, insertSql("lessons", { ...f, course_id: id, sort: max.m + 1 }));
        await env.DB.prepare("UPDATE courses SET updated_at = ? WHERE id = ?").bind(now(), id).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }
      if (method === "PUT" && lid) {
        const f = lessonFields(await body(req));
        const [sql, args] = updateSql("lessons", f, lid);
        await env.DB.prepare(sql + " AND course_id = ?").bind(...args, id).run();
        return json({ ok: true });
      }
      if (method === "DELETE" && lid) {
        await env.DB.prepare("DELETE FROM lessons WHERE id = ? AND course_id = ?").bind(lid, id).run();
        return json({ ok: true });
      }
    }
  }

  /* --- products --- */
  if (seg[0] === "products") {
    if (method === "GET") {
      const rows = (await env.DB.prepare("SELECT * FROM products ORDER BY sort, id").all()).results;
      return json(rows.map(p => ({ ...p, course_ids: JSON.parse(p.course_ids || "[]") })));
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    const b = await body(req);
    const f = productFields(b);
    if (method === "POST" && !id) {
      const slug = await uniqueSlug(env, "products", b.slug || f.name);
      await run(env, insertSql("products", { ...f, slug, created_at: now(), updated_at: now() }));
      return json({ ok: true });
    }
    if (method === "PUT" && id) {
      const slug = await uniqueSlug(env, "products", b.slug || f.name, id);
      await run(env, updateSql("products", { ...f, slug, updated_at: now() }, id));
      return json({ ok: true });
    }
  }

  /* --- members & access --- */
  if (seg[0] === "members") {
    if (method === "GET" && !id) {
      const rows = (await env.DB.prepare(`SELECT m.*,
          (SELECT json_group_array(json_object('course_id', c.id, 'title', c.title, 'source', e.source))
             FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.member_id = m.id) AS courses
        FROM members m ORDER BY m.created_at DESC LIMIT 1000`).all()).results;
      return json(rows.map(r => ({ ...r, courses: JSON.parse(r.courses || "[]") })));
    }
    if (method === "POST" && seg[1] === "grant") {
      const b = await body(req);
      const c = await env.DB.prepare("SELECT id FROM courses WHERE id = ?").bind(int(b.course_id)).first();
      if (!c) fail(400, "Pick a course.");
      const m = await grantAccess(env, b.email, c.id, "admin");
      if (str(b.name)) await env.DB.prepare("UPDATE members SET name = ? WHERE id = ? AND name = ''").bind(str(b.name, 80), m.id).run();
      return json({ ok: true, member_id: m.id });
    }
    if (method === "POST" && id && seg[2] === "revoke") {
      const b = await body(req);
      await env.DB.prepare("DELETE FROM enrollments WHERE member_id = ? AND course_id = ?").bind(id, int(b.course_id)).run();
      return json({ ok: true });
    }
    if (method === "POST" && id && seg[2] === "login-link") {
      const m = await env.DB.prepare("SELECT id FROM members WHERE id = ?").bind(id).first();
      if (!m) fail(404, "Member not found.");
      return json({ ok: true, link: await createLoginLink(env, req, m.id), minutes: LOGIN_LINK_MINUTES });
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM members WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  /* --- payments (SamCart) --- */
  if (seg[0] === "payments" && method === "GET") {
    const events = await env.DB.prepare(
      "SELECT id, received_at, event_type, email, product_ids, result FROM payment_events ORDER BY id DESC LIMIT 200").all();
    return json({
      connected: !!env.SAMCART_WEBHOOK_SECRET,
      webhook_url: env.SAMCART_WEBHOOK_SECRET ? `${siteUrl(env, req)}/api/webhooks/samcart/${env.SAMCART_WEBHOOK_SECRET}` : "",
      events: events.results.map(e => ({ ...e, product_ids: JSON.parse(e.product_ids || "[]") }))
    });
  }
  if (seg[0] === "payments" && seg[1] === "events" && seg[2] && method === "GET") {
    const e = await env.DB.prepare("SELECT * FROM payment_events WHERE id = ?").bind(int(seg[2])).first();
    if (!e) fail(404, "Not found.");
    return json(e);
  }

  /* --- newsletter subscribers --- */
  if (seg[0] === "subscribers") {
    if (method === "GET") {
      return json((await env.DB.prepare("SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 5000").all()).results);
    }
    if (method === "DELETE" && id) {
      await env.DB.prepare("DELETE FROM subscribers WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
  }

  fail(404, "Not found.");
}

/* ---------------- router ---------------- */

async function api(req, env, path, method) {
  const hook = path.match(/^\/api\/webhooks\/samcart\/([A-Za-z0-9_-]{16,200})$/);
  if (hook && method === "POST") return samcartWebhook(req, env, hook[1]);
  checkSameOrigin(req);
  if (!env.SESSION_SECRET) fail(500, "Site is not configured: SESSION_SECRET is missing.");

  if (path.startsWith("/api/admin/")) return admin(req, env, path, method);
  if (path === "/api/catalog" && method === "GET") return catalog(env);

  let m;
  if ((m = path.match(/^\/api\/courses\/([a-z0-9-]+)$/)) && method === "GET") return courseDetail(req, env, m[1]);
  if ((m = path.match(/^\/api\/courses\/([a-z0-9-]+)\/lessons\/(\d+)$/)) && method === "GET") {
    return lessonDetail(req, env, m[1], m[2]);
  }
  if (path === "/api/progress" && method === "POST") return markProgress(req, env);
  if (path === "/api/auth/request" && method === "POST") return requestLink(req, env);
  if (path === "/api/auth/logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": cookie("mfh_member", "", 0, req) });
  }
  if (path === "/api/me" && method === "GET") return me(req, env);
  if (path === "/api/newsletter" && method === "POST") return subscribe(req, env);
  fail(404, "Not found.");
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

function withHeaders(res, extra) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/")) return withHeaders(await api(req, env, path, req.method), SECURITY_HEADERS);
      if (path === "/auth/verify") return await verifyLink(req, env);
      if (path === "/admin") return Response.redirect(url.origin + "/admin/", 301);
      const res = await env.ASSETS.fetch(req);
      return withHeaders(res, SECURITY_HEADERS);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, SECURITY_HEADERS);
      console.error(e && e.stack || e);
      return json({ error: "Something went wrong. Please try again." }, 500, SECURITY_HEADERS);
    }
  }
};
