#!/usr/bin/env node
/**
 * Competitor discovery across the Mid-Florida Windows & Doors service area.
 *
 * Runs compass/crawler-google-places (Google Maps Scraper) once per city with a
 * "replacement windows near <city>, FL" search, then mirrors each city's result
 * set to data/competitors/<county>/<city-slug>.json plus a combined snapshot.
 *
 *   node scripts/apify/scrape-competitors.mjs                  # full run (36 cities)
 *   node scripts/apify/scrape-competitors.mjs --dry-run         # print inputs, no spend
 *   node scripts/apify/scrape-competitors.mjs --county Pinellas
 *   node scripts/apify/scrape-competitors.mjs --county Pinellas --city Clearwater
 *   node scripts/apify/scrape-competitors.mjs --max-usd 5 --limit 20
 *
 * Cost control: every run is capped with maxTotalChargeUsd, and --dry-run prints
 * the exact job count before anything is spent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadToken, whoami, runActor, datasetItems } from './lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/apify/cities.json'), 'utf8'));
const ACTOR = 'compass~crawler-google-places';
const OUT = path.join(ROOT, 'data/competitors');

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { dryRun: false, county: null, city: null, maxUsd: 25, limit: 20, maxReviews: 0, query: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--county') out.county = argv[++i];
    else if (a === '--city') out.city = argv[++i];
    else if (a === '--max-usd') out.maxUsd = Number(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--max-reviews') out.maxReviews = Number(argv[++i]);
    else if (a === '--query') out.query = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
      process.exit(0);
    }
  }
  return out;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function jobs(opts) {
  const list = [];
  for (const group of CONFIG.counties) {
    if (opts.county && slug(group.county) !== slug(opts.county)) continue;
    for (const city of group.cities) {
      if (opts.city && slug(city) !== slug(opts.city)) continue;
      const searchString = `${opts.query ?? 'replacement windows'} near ${city}, FL`;
      list.push({ county: group.county, city, searchString });
    }
  }
  return list;
}

function actorInput(searchString, opts) {
  // Only the fields this report needs — every extra field costs scrape time.
  return {
    searchStringsArray: [searchString],
    maxCrawledPlacesPerSearch: opts.limit,
    language: 'en',
    countryCode: 'us',
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
    scrapeReviewsPersonalData: false,
    maximumLeadsEnrichmentRecords: 0,
    maxReviews: opts.maxReviews,
    reviewsSort: 'newest',
  };
}

// ---------------------------------------------------------------- output
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}

/** Trim an Apify Maps item to the fields the competitor report uses. */
function normalize(item, city, county) {
  return {
    placeId: item.placeId ?? null,
    name: item.title ?? null,
    category: item.categoryName ?? null,
    city: item.city ?? city,
    county,
    address: item.address ?? null,
    phone: item.phone ?? null,
    website: item.website ?? null,
    rating: item.totalScore ?? null,
    reviews: item.reviewsCount ?? null,
    claimed: item.claimThisBusiness === false ? false : true,
    permanentlyClosed: item.permanentlyClosed ?? false,
    lat: item.location?.lat ?? null,
    lng: item.location?.lng ?? null,
    categories: item.categories ?? null,
    searchString: item.searchString ?? null,
  };
}

// ---------------------------------------------------------------- main
const opts = parseArgs(process.argv.slice(2));
const jobList = jobs(opts);

if (jobList.length === 0) {
  console.error(`No matching cities for county=${opts.county ?? '*'} city=${opts.city ?? '*'}`);
  process.exit(1);
}

// Apify rejects maxTotalChargeUsd below $0.50 outright:
//   "Maximum cost per run is less than the allowed minimum of $0.50"
// Splitting a budget across cities can land under that, which fails every job.
const MIN_RUN_USD = 0.5;
const rawPerCity = opts.maxUsd / jobList.length;
const perCity = Math.max(MIN_RUN_USD, +rawPerCity.toFixed(2));
const effective = perCity * jobList.length;

console.log(`Actor   : ${ACTOR}`);
console.log(`Jobs    : ${jobList.length} cities`);
console.log(`Limit   : ${opts.limit} places per city  |  reviews: ${opts.maxReviews || 'none'}`);
console.log(`Budget  : $${opts.maxUsd} total  (~$${perCity.toFixed(2)} cap per city)`);

if (rawPerCity < MIN_RUN_USD) {
  console.log('');
  console.log(`WARNING: $${opts.maxUsd} across ${jobList.length} cities is $${rawPerCity.toFixed(2)}/city,`);
  console.log(`         below the $${MIN_RUN_USD.toFixed(2)} minimum Apify accepts per run.`);
  console.log(`         Each city is floored to $${MIN_RUN_USD.toFixed(2)}, so worst-case spend is`);
  console.log(`         $${effective.toFixed(2)} — raise --max-usd or narrow with --city / --county.`);
}

const affordable = Math.floor(opts.maxUsd / MIN_RUN_USD);
if (affordable > 0 && jobList.length > affordable) {
  console.log('');
  console.log(`WARNING: budget only covers ${affordable} of ${jobList.length} cities at the minimum.`);
  console.log(`         Narrow the run: --county <name> or --city <name>.`);
}

console.log(opts.dryRun ? 'Mode    : DRY RUN — nothing will be spent\n' : 'Mode    : LIVE\n');

if (opts.dryRun) {
  for (const j of jobList) {
    console.log(`${j.county.padEnd(13)} ${j.city.padEnd(16)} "${j.searchString}"`);
  }
  console.log('\nSample input for the first job:');
  console.log(JSON.stringify(actorInput(jobList[0].searchString, opts), null, 2));
  process.exit(0);
}

const token = loadToken();
const me = await whoami(token);
console.log(`Account : ${me.username} (${me.plan ?? 'unknown plan'})\n`);

const snapshot = [];
const failures = [];
const startedAt = new Date().toISOString();

for (const [i, job] of jobList.entries()) {
  const tag = `${i + 1}/${jobList.length} ${job.city}`;
  try {
    const run = await runActor(ACTOR, actorInput(job.searchString, opts), {
      token,
      maxChargeUsd: perCity,
      label: tag,
    });
    const raw = await datasetItems(run.datasetId, token);
    const rows = raw.map((it) => normalize(it, job.city, job.county));

    writeJson(path.join(OUT, slug(job.county), `${slug(job.city)}.json`), {
      county: job.county,
      city: job.city,
      searchString: job.searchString,
      runId: run.runId,
      scrapedAt: new Date().toISOString(),
      costUsd: run.usageTotalUsd,
      count: rows.length,
      places: rows,
    });

    snapshot.push(...rows);
    console.log(`  ${rows.length} places, $${(run.usageTotalUsd ?? 0).toFixed(3)}`);
  } catch (err) {
    failures.push({ ...job, error: String(err.message ?? err) });
    console.error(`  FAILED: ${err.message ?? err}`);
  }
}

// --- combined snapshot, deduped by placeId, brand removed
const brandSlugs = CONFIG.brand.map(slug);
const seen = new Map();
for (const row of snapshot) {
  const key = row.placeId ?? `${row.name}|${row.address}`;
  const isUs = row.name && brandSlugs.some((b) => slug(row.name).includes(b.slice(0, 12)));
  if (isUs) continue;
  if (seen.has(key)) {
    const prev = seen.get(key);
    if ((row.reviews ?? 0) > (prev.reviews ?? 0)) prev.reviews = row.reviews; // best-known review count
    if (!prev.matchedCities.includes(row.city)) prev.matchedCities.push(row.city);
    continue;
  }
  seen.set(key, { ...row, matchedCities: [row.city] });
}

const combined = [...seen.values()].sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
writeJson(path.join(OUT, '_snapshot.json'), {
  generatedAt: new Date().toISOString(),
  startedAt,
  ...(failures.length ? { failures } : {}),
  cities: jobList.length,
  totalRows: snapshot.length,
  uniqueCompetitors: combined.length,
  competitors: combined,
});

console.log(`\nDone in ${Math.round((Date.now() - new Date(startedAt)) / 1000)}s`);
console.log(`  raw places      : ${snapshot.length}`);
console.log(`  unique rivals   : ${combined.length}`);
console.log(`  files           : data/competitors/`);
if (failures.length) console.log(`  failures        : ${failures.length} (see _snapshot.json)`);
console.log(`\nNext: node scripts/apify/report.mjs`);
