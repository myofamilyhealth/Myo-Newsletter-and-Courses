// Builds public/data/*.json for the GitHub Pages copy of the site.
//
//   node scripts/export-static.mjs
//
// Loads schema.sql + seed.sql into an in-memory SQLite database and
// writes what the public pages need. Paid lesson content is NEVER
// written: only free courses and free-preview lessons get a lesson file,
// so locked lessons stay locked on GitHub Pages too.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "data");

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(root, "schema.sql"), "utf8"));
db.exec(readFileSync(join(root, "seed.sql"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "courses"), { recursive: true });
mkdirSync(join(out, "lessons"), { recursive: true });
const write = (file, data) => writeFileSync(join(out, file), JSON.stringify(data));

const categories = db.prepare("SELECT id, slug, name, description FROM categories ORDER BY sort, name").all();
const courses = db.prepare(`SELECT c.id, c.slug, c.title, c.subtitle, c.audience, c.level, c.price_cents,
    c.compare_at_cents, c.cover_url, c.accent, c.instructor, c.checkout_url, c.featured, c.sort,
    c.category_id, cat.slug AS category_slug, cat.name AS category_name,
    (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
    (SELECT COALESCE(SUM(duration_min),0) FROM lessons l WHERE l.course_id = c.id) AS total_minutes
  FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id
  WHERE c.status = 'published' ORDER BY c.featured DESC, c.sort, c.id`).all();
const products = db.prepare(`SELECT id, slug, name, tagline, description, kind, price_cents, image_url,
    checkout_url, course_ids FROM products WHERE status = 'published' ORDER BY sort, id`).all()
  .map(p => ({ ...p, course_ids: JSON.parse(p.course_ids || "[]") }));

write("catalog.json", { categories, courses, products, payments_enabled: false, static: true });

let lessonFiles = 0;
for (const c of courses) {
  const full = db.prepare(`SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM courses c LEFT JOIN categories cat ON cat.id = c.category_id WHERE c.id = ?`).get(c.id);
  const lessons = db.prepare(`SELECT id, section, title, summary, duration_min, is_preview, sort,
      (video_url <> '') AS has_video, (download_url <> '') AS has_download
    FROM lessons WHERE course_id = ? ORDER BY sort, id`).all(c.id);
  write(`courses/${c.slug}.json`, {
    course: { ...full, outcomes: JSON.parse(full.outcomes || "[]") },
    lessons,
    payments_enabled: false
  });
  const open = db.prepare(`SELECT * FROM lessons WHERE course_id = ? ${full.price_cents ? "AND is_preview = 1" : ""}`).all(c.id);
  for (const l of open) { write(`lessons/${l.id}.json`, l); lessonFiles++; }
}

console.log(`Exported ${courses.length} courses, ${products.length} products, ${lessonFiles} open lessons to public/data/`);
