#!/usr/bin/env node
// Guard feed.json against unbounded growth.
//
// The GROWI receiving side caps the feed response at 5 MiB on ingest; a feed.json
// larger than that would fail to be taken in at all, silently starving every
// instance of news updates. We fail well below that ceiling so a single oversized
// submission is caught at review time, with margin left for HTTP/transfer overhead.
// Sustained growth is handled separately by maintain-feed-size.yml.

import fs from 'node:fs/promises';

const FEED_PATH = new URL('../feed.json', import.meta.url);

const MIB = 1024 * 1024;
const RECEIVER_LIMIT = 5 * MIB; // GROWI ingest hard cap (informational)
const FAIL_BYTES = 4 * MIB; // fail here to keep margin under the receiver limit
const WARN_BYTES = 2 * MIB;

const { size } = await fs.stat(FEED_PATH);
const asMiB = (n: number) => (n / MIB).toFixed(2);

if (size >= FAIL_BYTES) {
  console.error(
    `feed.json is ${asMiB(size)} MiB (${size} bytes), at or above the ${asMiB(FAIL_BYTES)} MiB CI limit ` +
      `(receiver hard cap: ${asMiB(RECEIVER_LIMIT)} MiB). Trim old items before publishing.`,
  );
  process.exit(1);
}

if (size >= WARN_BYTES) {
  console.warn(
    `WARN: feed.json is ${asMiB(size)} MiB (${size} bytes), past the ${asMiB(WARN_BYTES)} MiB soft threshold. ` +
      'Consider trimming old items.',
  );
}

console.log(`OK: feed.json is ${asMiB(size)} MiB (${size} bytes)`);
