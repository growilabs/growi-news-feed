#!/usr/bin/env node
// Bound feed.json to a maximum item count by dropping the oldest entries, and delete
// any image left unreferenced afterwards.
//
// Why this lives on the delivery side: the GROWI receiving side upserts every item
// that stays in the feed and only deletes items that fall *out* of it, so the DB
// footprint on every instance is bounded solely by how large the feed is kept
// (news-inappnotification spec, Performance & Scalability). This script is the
// enforcement of that responsibility.
//
// Contract:
// - Keep the newest FEED_MAX_ITEMS by publishedAt; drop the rest.
// - Preserve the surviving items' original array order (stable diff).
// - Never re-add or reorder; removal is one-directional (a removed id must not
//   come back — it would reset read-state for everyone).
// - Emit `changed`, `removed_ids`, `removed_images` to $GITHUB_OUTPUT for the workflow.

import fs from 'node:fs/promises';

interface FeedItem {
  id: string;
  publishedAt: string;
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

const MD_IMAGE = /!\[[^\]]*\]\(\s*(images\/[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

const MAX_ITEMS = Number.parseInt(process.env.FEED_MAX_ITEMS ?? '100', 10);
if (!Number.isInteger(MAX_ITEMS) || MAX_ITEMS < 1) {
  console.error(`Invalid FEED_MAX_ITEMS: ${process.env.FEED_MAX_ITEMS}`);
  process.exit(1);
}

async function setOutput(key: string, value: string): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (file == null) return;
  await fs.appendFile(file, `${key}=${value}\n`);
}

const raw = await fs.readFile(FEED_PATH, 'utf-8');
const feed: Feed = JSON.parse(raw);

if (feed.items.length <= MAX_ITEMS) {
  console.log(
    `No trim needed: ${feed.items.length} item(s) ≤ FEED_MAX_ITEMS (${MAX_ITEMS})`,
  );
  await setOutput('changed', 'false');
  process.exit(0);
}

// Rank by publishedAt descending; the newest MAX_ITEMS survive. Compare actual
// instants (not the raw strings): the schema allows mixed timezone offsets
// (e.g. `Z` and `+09:00`), for which lexicographic order would be wrong.
const rankedNewestFirst = [...feed.items].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);
const survivorIds = new Set(rankedNewestFirst.slice(0, MAX_ITEMS).map((i) => i.id));

const removedIds = feed.items.filter((i) => !survivorIds.has(i.id)).map((i) => i.id);
// Keep survivors in their original file order for a minimal, readable diff.
const keptItems = feed.items.filter((i) => survivorIds.has(i.id));

// Recompute referenced images from the surviving markdown items, then delete orphans.
const stillReferenced = new Set<string>();
for (const item of keptItems) {
  if (item.bodyFormat !== 'markdown' || item.body == null) continue;
  for (const text of Object.values(item.body)) {
    for (const match of text.matchAll(MD_IMAGE)) {
      stillReferenced.add(match[1].slice('images/'.length));
    }
  }
}

let removedImages: string[] = [];
try {
  const onDisk = await fs.readdir(IMAGES_DIR);
  const orphans = onDisk.filter(
    (name) => !name.startsWith('.') && !stillReferenced.has(name),
  );
  for (const name of orphans) {
    await fs.rm(new URL(name, IMAGES_DIR));
  }
  removedImages = orphans;
} catch {
  removedImages = [];
}

const trimmed: Feed = { ...feed, items: keptItems };
await fs.writeFile(FEED_PATH, `${JSON.stringify(trimmed, null, 2)}\n`);

console.log(
  `Trimmed ${removedIds.length} item(s) and ${removedImages.length} image(s).\n` +
    `  Removed ids: ${removedIds.join(', ')}\n` +
    `  Removed images: ${removedImages.join(', ') || '(none)'}`,
);

await setOutput('changed', 'true');
await setOutput('removed_ids', removedIds.join(', '));
await setOutput('removed_images', removedImages.join(', '));
