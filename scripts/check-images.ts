#!/usr/bin/env node
// Verify that every image referenced from a Markdown news body resolves to a real,
// convention-compliant file under images/.
//
// GROWI's /_news renderer only shows images whose resolved URL is https, same-origin
// as the feed, and directly under images/ (no subdirectory), with an allowed
// extension. Anything else is dropped *silently* at render time, so a broken or
// misplaced reference would ship as an invisible gap that no runtime error surfaces.
// This check turns that silent drop into a pre-publish failure.
//
// Scope: only items with `bodyFormat: "markdown"` — in a plain-text body, `![](...)`
// is literal text and renders no image.

import fs from 'node:fs/promises';

interface FeedItem {
  id: string;
  bodyFormat?: string;
  body?: Record<string, string>;
  [key: string]: unknown;
}

interface Feed {
  version: string;
  items: FeedItem[];
}

const FEED_PATH = new URL('../feed.json', import.meta.url);
const IMAGES_DIR = new URL('../images/', import.meta.url);

// Mirror of the app-side containment rule (news-markdown-body spec):
// images/<filename>, single segment, allowed raster/gif extensions, no `%`.
const VALID_IMAGE_REF = /^images\/[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpe?g|webp|gif)$/;
// Markdown image syntax: ![alt](url "optional title")
const MD_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

const raw = await fs.readFile(FEED_PATH, 'utf-8');
const feed: Feed = JSON.parse(raw);

const errors: string[] = [];
const referenced = new Set<string>(); // basenames referenced by markdown items

for (const item of feed.items) {
  if (item.bodyFormat !== 'markdown' || item.body == null) continue;
  for (const [locale, text] of Object.entries(item.body)) {
    for (const match of text.matchAll(MD_IMAGE)) {
      const ref = match[1];
      // Ignore non-image-directory references (external links etc. are not images
      // to validate here); the convention violation for image *syntax* pointing
      // outside images/ is still caught because such refs fail VALID_IMAGE_REF.
      if (!ref.startsWith('images/') && !VALID_IMAGE_REF.test(ref)) {
        // Only flag when it is clearly meant as a local image but malformed.
        errors.push(`[${item.id} / ${locale}] image points outside images/: ${ref}`);
        continue;
      }
      if (!VALID_IMAGE_REF.test(ref)) {
        errors.push(`[${item.id} / ${locale}] invalid image reference: ${ref}`);
        continue;
      }
      referenced.add(ref.slice('images/'.length));
    }
  }
}

// Existence check for every valid reference.
let filesOnDisk: string[] = [];
try {
  filesOnDisk = await fs.readdir(IMAGES_DIR);
} catch {
  filesOnDisk = [];
}
const onDisk = new Set(filesOnDisk);

for (const name of referenced) {
  if (!onDisk.has(name)) {
    errors.push(`referenced image is missing on disk: images/${name}`);
  }
}

// Orphans are a warning, not a failure (a just-removed entry may leave one behind;
// maintain-feed-size.yml prunes them). Ignore dotfiles.
const orphans = filesOnDisk.filter(
  (name) => !name.startsWith('.') && !referenced.has(name),
);

if (orphans.length > 0) {
  console.warn(
    `WARN: ${orphans.length} image(s) in images/ are not referenced by any markdown item: ${orphans.join(', ')}`,
  );
}

if (errors.length > 0) {
  console.error(`Image validation failed:\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

console.log(
  `OK: ${referenced.size} referenced image(s) resolve under images/ (${orphans.length} orphan(s))`,
);
