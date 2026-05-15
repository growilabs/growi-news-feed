#!/usr/bin/env node
// Verify that all items[].id values in feed.json are unique.
// GROWI uses id as externalId for dedupe and per-user read-state tracking;
// duplicates would corrupt that state.

import fs from 'node:fs/promises';

interface FeedItem {
  id: string;
  [key: string]: unknown;
}

interface Feed {
  version: string;
  items: FeedItem[];
}

const FEED_PATH = new URL('../feed.json', import.meta.url);

const raw = await fs.readFile(FEED_PATH, 'utf-8');
const feed: Feed = JSON.parse(raw);

const seen = new Map<string, number>();
const duplicates: string[] = [];

for (const item of feed.items) {
  const count = (seen.get(item.id) ?? 0) + 1;
  seen.set(item.id, count);
  if (count === 2) duplicates.push(item.id);
}

if (duplicates.length > 0) {
  console.error(
    `Duplicate id values detected in feed.json: ${duplicates.join(', ')}`,
  );
  process.exit(1);
}

console.log(`OK: ${feed.items.length} item id(s) are unique`);
