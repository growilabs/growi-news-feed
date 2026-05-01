#!/usr/bin/env node
// Auto-translate feed.json: fill missing locale keys via OpenAI API.
// Preserves manually-entered values (never overwrites existing keys).

import fs from 'node:fs/promises';
import OpenAI from 'openai';

const FEED_PATH = new URL('../feed.json', import.meta.url);
const TARGET_LOCALES = ['ja_JP', 'en_US', 'zh_CN', 'fr_FR', 'ko_KR'];
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const MAX_RETRIES = 3;

const LOCALE_NAMES = {
  ja_JP: 'Japanese',
  en_US: 'English',
  zh_CN: 'Simplified Chinese',
  fr_FR: 'French',
  ko_KR: 'Korean',
};

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Strip a leading/trailing markdown code fence the model occasionally adds
// despite the instruction. Handles ```lang\n...\n``` and ```\n...\n```.
function stripCodeFence(text) {
  const m = text.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return m ? m[1].trim() : text;
}

async function translateOne(sourceText, sourceLocale, targetLocale) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a professional software product translator. Translate the following ${LOCALE_NAMES[sourceLocale]} text into ${LOCALE_NAMES[targetLocale]}. Preserve markdown formatting, emojis, URLs, and product names (e.g., "GROWI") exactly as-is. Return only the translated text without any explanation, code fences, or wrapping.`,
          },
          { role: 'user', content: sourceText },
        ],
        temperature: 0.2,
      });
      const raw = completion.choices[0]?.message?.content?.trim() ?? '';
      return stripCodeFence(raw);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = 2 ** attempt * 1000;
        console.warn(
          `  retry ${attempt + 1}/${MAX_RETRIES} after ${backoffMs}ms: ${err.message}`,
        );
        await sleep(backoffMs);
      }
    }
  }
  throw lastErr;
}

function pickSourceLocale(field) {
  if (field?.ja_JP) return 'ja_JP';
  if (field?.en_US) return 'en_US';
  return Object.keys(field ?? {}).find((k) => field[k]) ?? null;
}

async function translateField(field, label) {
  if (!field || typeof field !== 'object') return { field, changed: false };

  const sourceLocale = pickSourceLocale(field);
  if (!sourceLocale) return { field, changed: false };

  const sourceText = field[sourceLocale];
  const missingLocales = TARGET_LOCALES.filter(
    (loc) => loc !== sourceLocale && !field[loc],
  );
  if (missingLocales.length === 0) return { field, changed: false };

  // Parallel: each missing locale is an independent OpenAI request.
  const translations = await Promise.all(
    missingLocales.map(async (target) => {
      console.log(`  ${label}: ${sourceLocale} -> ${target}`);
      const text = await translateOne(sourceText, sourceLocale, target);
      return [target, text];
    }),
  );

  return {
    field: { ...field, ...Object.fromEntries(translations) },
    changed: true,
  };
}

async function main() {
  const raw = await fs.readFile(FEED_PATH, 'utf-8');
  const feed = JSON.parse(raw);

  let anyChange = false;
  for (const item of feed.items) {
    console.log(`Processing item: ${item.id}`);
    const t = await translateField(item.title, 'title');
    if (t.changed) {
      item.title = t.field;
      anyChange = true;
    }
    if (item.body) {
      const b = await translateField(item.body, 'body');
      if (b.changed) {
        item.body = b.field;
        anyChange = true;
      }
    }
  }

  if (anyChange) {
    await fs.writeFile(FEED_PATH, `${JSON.stringify(feed, null, 2)}\n`, 'utf-8');
    console.log('feed.json updated');
  } else {
    console.log('No missing translations');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
