-- SAMPLE CONTENT — a starting point so the site isn't empty.
-- Everything here can be edited or deleted from the owner dashboard.
-- Prices are placeholders: set real prices before launch.
--
--   npx wrangler d1 execute myo-courses --remote --file=seed.sql

INSERT OR IGNORE INTO categories (id, slug, name, description, sort) VALUES
 (1, 'breathing',     'Breathing',              'Nasal breathing habits for every age.', 1),
 (2, 'tongue-posture','Tongue & Oral Posture',  'Where the tongue rests, and why it matters.', 2),
 (3, 'sleep-airway',  'Sleep & Airway',         'Better nights for the whole family.', 3),
 (4, 'kids',          'Kids & Families',        'Playful routines for little ones.', 4),
 (5, 'professionals', 'For Professionals',      'Training for dental and medical teams.', 5);

INSERT OR IGNORE INTO courses
 (id, slug, title, subtitle, description, outcomes, category_id, audience, level, price_cents, compare_at_cents,
  cover_url, accent, instructor, checkout_url, status, featured, sort, created_at, updated_at) VALUES
 (1, 'is-it-mouth-breathing', 'Is It Mouth Breathing?',
  'A free mini-course to spot the signs at home in 20 minutes.',
  'A short, friendly introduction for parents and adults. Learn the everyday signs of mouth breathing, why nasal breathing matters, and simple next steps.

*Sample course — edit or replace this in the owner dashboard.*',
  '["Recognise the common signs of mouth breathing","Understand why nasal breathing matters","Know when to talk to a professional"]',
  1, 'families', 'beginner', 0, 0, '', 'sage', 'Myo Family Health', '', 'published', 1, 1, datetime('now'), datetime('now')),
 (2, 'nasal-breathing-foundations', 'Nasal Breathing Foundations',
  'Build a calm, nose-first breathing habit in four weeks.',
  'A guided, step-by-step program to retrain everyday breathing. Short daily practices, clear videos, and printable trackers.

*Sample course — edit or replace this in the owner dashboard.*',
  '["A daily 10-minute breathing routine","Techniques for daytime and bedtime","How to track progress week by week"]',
  1, 'adults', 'beginner', 4900, 6900, '', 'teal', 'Myo Family Health', '', 'published', 1, 2, datetime('now'), datetime('now')),
 (3, 'tongue-posture-101', 'Tongue Posture 101',
  'Find your tongue''s resting spot and keep it there.',
  'Learn correct resting tongue posture with simple exercises you can do anywhere.

*Sample course — edit or replace this in the owner dashboard.*',
  '["Where the tongue should rest","Five foundational exercises","Habits that make it stick"]',
  2, 'adults', 'beginner', 3900, 0, '', 'clay', 'Myo Family Health', '', 'published', 0, 3, datetime('now'), datetime('now')),
 (4, 'sleep-and-airway-for-families', 'Sleep & Airway for Families',
  'Quieter nights and brighter mornings, for kids and grown-ups.',
  'Understand how breathing shapes sleep, and build a family bedtime routine that supports it.

*Sample course — edit or replace this in the owner dashboard.*',
  '["How breathing and sleep connect","Bedroom and bedtime setup","Signs worth a professional look"]',
  3, 'families', 'intermediate', 7900, 0, '', 'slate', 'Myo Family Health', '', 'published', 1, 4, datetime('now'), datetime('now')),
 (5, 'myoland-at-home', 'MyoLand at Home',
  'Playful myofunctional exercises for kids ages 4–8.',
  'Game-style exercises children actually want to do, with a sticker chart and parent guide.

*Sample course — edit or replace this in the owner dashboard.*',
  '["Ten kid-friendly exercises","A printable reward chart","Tips for making practice fun"]',
  4, 'kids', 'beginner', 2900, 0, '', 'sand', 'Myo Family Health', '', 'published', 0, 5, datetime('now'), datetime('now')),
 (6, 'screening-for-dental-teams', 'Myofunctional Screening for Dental Teams',
  'A practical chairside screening workflow.',
  'Draft professional course.

*Sample course — edit or replace this in the owner dashboard.*',
  '["A five-minute screening flow","Talking to families about findings","When and how to refer"]',
  5, 'professionals', 'advanced', 14900, 0, '', 'teal', 'Myo Family Health', '', 'draft', 0, 6, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO lessons (id, course_id, section, title, summary, body, video_url, duration_min, is_preview, sort) VALUES
 (1, 1, 'Start here', 'Welcome', 'What this mini-course covers.',
  '## Welcome

Thanks for joining! In the next few lessons we''ll look at everyday signs of mouth breathing.

*Sample lesson — replace in the owner dashboard.*', '', 3, 0, 0),
 (2, 1, 'Start here', 'Signs to look for', 'Day and night clues.',
  '## Daytime clues

- Lips apart at rest
- Dry lips
- Tired in the morning

*Sample lesson.*', '', 8, 0, 1),
 (3, 1, 'Next steps', 'What to do next', 'Simple steps and when to ask for help.',
  '## Next steps

Try the free self-assessment and keep a one-week breathing diary.

*Sample lesson.*', '', 6, 0, 2),

 (10, 2, 'Week 1 · Awareness', 'Welcome & how this course works', 'Your roadmap for the next four weeks.',
  '## Welcome

This lesson is a free preview.

*Sample lesson — replace in the owner dashboard.*', '', 5, 1, 0),
 (11, 2, 'Week 1 · Awareness', 'Noticing your breath', 'A two-minute check-in you''ll use every day.',
  '## Noticing your breath

*Sample lesson.*', '', 9, 0, 1),
 (12, 2, 'Week 2 · Practice', 'Daily nasal breathing routine', 'The 10-minute core practice.',
  '## The routine

1. Sit tall
2. Lips together
3. Slow breaths through the nose

*Sample lesson.*', '', 12, 0, 2),
 (13, 2, 'Week 2 · Practice', 'Breathing during exercise', 'Keeping it nasal when you move.',
  '*Sample lesson.*', '', 10, 0, 3),
 (14, 2, 'Week 3 · Bedtime', 'Bedtime wind-down', 'A calm routine before sleep.',
  '*Sample lesson.*', '', 8, 0, 4),
 (15, 2, 'Week 4 · Habit', 'Making it stick', 'Tracking and troubleshooting.',
  '*Sample lesson.*', '', 7, 0, 5),

 (20, 3, 'Foundations', 'Where does the tongue rest?', 'The spot, explained simply.',
  '*Sample lesson — this one is a free preview.*', '', 6, 1, 0),
 (21, 3, 'Foundations', 'Exercise 1 · The spot', 'Find it and hold it.', '*Sample lesson.*', '', 5, 0, 1),
 (22, 3, 'Exercises', 'Exercises 2–5', 'Strength and control.', '*Sample lesson.*', '', 14, 0, 2),

 (30, 4, 'Understanding sleep', 'Breathing and sleep', 'How they connect.', '*Sample lesson — free preview.*', '', 9, 1, 0),
 (31, 4, 'Understanding sleep', 'Signs in children', 'What parents notice.', '*Sample lesson.*', '', 11, 0, 1),
 (32, 4, 'Better nights', 'The family bedtime routine', 'Step by step.', '*Sample lesson.*', '', 13, 0, 2),

 (40, 5, 'Let''s play', 'Meet the exercises', 'A tour for parents and kids.', '*Sample lesson — free preview.*', '', 4, 1, 0),
 (41, 5, 'Let''s play', 'Tongue pops & lip games', 'The first five games.', '*Sample lesson.*', '', 8, 0, 1),

 (50, 6, 'Screening', 'The five-minute flow', 'Chairside steps.', '*Sample lesson.*', '', 15, 0, 0);

INSERT OR IGNORE INTO products
 (id, slug, name, tagline, description, kind, price_cents, image_url, checkout_url, course_ids, status, sort, created_at, updated_at) VALUES
 (1, 'family-bundle', 'The Complete Family Bundle', 'Every family course, one price.',
  'Nasal Breathing Foundations, Sleep & Airway for Families and MyoLand at Home together.

*Sample product.*',
  'bundle', 12900, '', '', '[2,4,5]', 'published', 1, datetime('now'), datetime('now')),
 (2, 'daily-exercise-chart', 'Printable Daily Exercise Chart', 'A fridge-friendly tracker for the whole family.',
  'A printable PDF chart to track daily practice.

*Sample product.*',
  'digital', 900, '', '', '[]', 'published', 2, datetime('now'), datetime('now')),
 (3, 'free-consultation', 'Free Consultation', 'Talk through your questions with our team.',
  'Book a free consultation to see whether myofunctional therapy is a fit.',
  'session', 0, '', 'https://amy-rondoni.clientsecure.me', '[]', 'published', 3, datetime('now'), datetime('now'));
