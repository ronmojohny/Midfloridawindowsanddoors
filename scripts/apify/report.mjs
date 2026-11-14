#!/usr/bin/env node
/**
 * Turn data/competitors/_snapshot.json into a competitor briefing.
 *
 *   node scripts/apify/report.mjs
 *
 * Writes:
 *   data/competitors/report.md      — readable briefing (county by county)
 *   data/competitors/competitors.csv — flat export for Sheets/Excel
 *
 * Scoring note: Google review counts are the best free public proxy for a
 * window contractor's lead volume, so ranking sorts on reviews first and
 * rating second. A 4.9 with 12 reviews is not a comparable threat to a 4.4
 * with 700. "Strength" = reviews × rating penalty, a deliberately simple
 * index — it is for prioritising attention, not for quoting in a deck.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'data/competitors');
const SNAP = path.join(DIR, '_snapshot.json');

if (!fs.existsSync(SNAP)) {
  console.error('No snapshot found. Run: node scripts/apify/scrape-competitors.mjs');
  process.exit(1);
}

const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const all = snap.competitors ?? [];

const ratingPenalty = (r) => {
  if (r == null) return 0.5;        // unknown rating, discount heavily
  if (r >= 4.7) return 1.0;
  if (r >= 4.5) return 0.9;
  if (r >= 4.2) return 0.75;
  if (r >= 3.8) return 0.55;
  return 0.3;
};
const strength = (p) => Math.round((p.reviews ?? 0) * ratingPenalty(p.rating));

const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

// ---------------------------------------------------------------- CSV
const csvEsc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvHeader = [
  'county', 'city', 'name', 'rating', 'reviews', 'strength', 'category',
  'phone', 'website', 'address', 'claimed', 'placeId', 'matchedCities',
];
const csvRows = all.map((p) => [
  p.county, p.city, p.name, p.rating, p.reviews, strength(p), p.category,
  p.phone, p.website, p.address, p.claimed, p.placeId, (p.matchedCities ?? []).join('|'),
].map(csvEsc).join(','));
fs.writeFileSync(
  path.join(DIR, 'competitors.csv'),
  [csvHeader.join(','), ...csvRows].join('\n') + '\n',
);

// ---------------------------------------------------------------- stats
const byCounty = new Map();
for (const p of all) {
  if (!byCounty.has(p.county)) byCounty.set(p.county, []);
  byCounty.get(p.county).push(p);
}

const ranked = [...all].sort((a, b) => strength(b) - strength(a));
const totalReviews = all.reduce((s, p) => s + (p.reviews ?? 0), 0);
const noSite = all.filter((p) => !p.website).length;

// NOTE: `claimed` is deliberately NOT reported. The actor's claimThisBusiness
// field came back false for every listing in a live Clearwater run — including
// a competitor with 869 reviews, which cannot plausibly be unclaimed. The
// semantics are undocumented by Apify and we could not establish the polarity,
// so publishing a count would risk asserting the exact opposite of the truth.
// The raw value is still carried into competitors.csv for manual inspection.
const withPhone = all.filter((p) => p.phone).length;

// A county is "contestable" when the median rival is below 100 reviews.
const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const counties = [...byCounty.entries()]
  .map(([county, list]) => {
    const med = median(list.map((p) => p.reviews ?? 0));
    return { county, list, med, weak: med < 100 };
  })
  .sort((a, b) => a.med - b.med);

// ---------------------------------------------------------------- markdown
const L = [];
const add = (...lines) => L.push(...lines);

add(
  '# Competitor Briefing — Central Florida Window & Door Contractors',
  '',
  `Generated **${new Date(snap.generatedAt).toLocaleDateString('en-US', { dateStyle: 'long' })}** from ${snap.cities} city-level Google Maps searches across ${counties.length} ${counties.length === 1 ? 'county' : 'counties'} (of the eight listed on \`service-area.html\`).`,
  '',
  '## Headline numbers',
  '',
  '| Metric | Value |',
  '| --- | --- |',
  `| Unique competitors found | **${all.length}** |`,
  `| Total Google reviews in the market | **${fmt(totalReviews)}** |`,
  `| Competitors with no website | ${noSite} (${pct(noSite, all.length)}) |`,
  `| Listings with a phone number | ${withPhone} (${pct(withPhone, all.length)}) |`,
  '',
  '> Review counts are a public proxy for lead volume, not a revenue figure. Every number here is from the Google Maps "places" dataset on the date above — re-run the scraper before quoting any of it.',
  '',
  '## The ten who dominate the market',
  '',
  '| # | Company | Rating | Reviews | Strength | County | Website |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...ranked.slice(0, 10).map((p, i) =>
    `| ${i + 1} | ${esc(p.name)} | ${p.rating ?? '—'} | ${fmt(p.reviews)} | ${strength(p)} | ${esc(p.county)} | ${p.website ? `[link](${p.website})` : '**none**'} |`),
  '',
  '## Ranked by county — where the fight is easiest',
  '',
  'Counties are ordered by median competitor review count. The lowest medians are where a well-reviewed local profile can reach the top three fastest.',
  '',
);

for (const c of counties) {
  const top = [...c.list].sort((a, b) => strength(b) - strength(a));
  add(
    `### ${c.county} County — median ${c.med} reviews ${c.weak ? '🟢 contestable' : '🔴 entrenched'}`,
    '',
    `Top ${Math.min(8, top.length)} of ${c.list.length} found:`,
    '',
    '| Company | Rating | Reviews | Strength | Phone | Website |',
    '| --- | --- | --- | --- | --- | --- |',
    ...top.slice(0, 8).map((p) =>
      `| ${esc(p.name)} | ${p.rating ?? '—'} | ${fmt(p.reviews)} | ${strength(p)} | ${p.phone ?? '—'} | ${p.website ? `[link](${p.website})` : '**none**'} |`),
    '',
  );
  if (noSiteIn(c.list)) {
    add(`Weak spots: ${noSiteIn(c.list)} listing(s) in this county have no website at all.`, '');
  }
}

add(
  '## Openings worth acting on',
  '',
  ...[]
    .concat(
      noSite ? [`- **${noSite} competitors have no website.** A ranking page for their city plus a review push can beat them on trust alone.`] : [],
      counties.filter((c) => c.weak).length
        ? [`- **Low-competition counties:** ${counties.filter((c) => c.weak).map((c) => `${c.county} (median ${c.med})`).join(', ')}. These are where a review-generation push has the quickest payoff.`]
        : [],
      [`- **Review gap to close:** the top contender holds ${fmt(ranked[0]?.reviews)} reviews. Mid-Florida does not appear in this dataset, which means it is not surfacing for "${esc(all[0]?.searchString ?? 'replacement windows')}"-style searches in these cities — that is the core local-SEO problem to solve.`],
    ),
  '',
  '## Method',
  '',
  `- Actor: \`compass/crawler-google-places\` (Google Maps Scraper) via the Apify REST API.`,
  `- ${snap.cities} searches, one per city, "${esc(all[0]?.searchString ?? '')}" pattern, up to 20 places each.`,
  `- Deduplicated by Google \`placeId\`; a business found in several cities keeps its best-known review count and the full city list (\`matchedCities\`).`,
  `- Rows whose name matched a Mid-Florida brand variant were removed before ranking.`,
  '- Strength = reviews × rating penalty (1.0 at ≥4.7 down to 0.3 below 3.8). Ordering device only.',
  '',
  `Flat data: \`data/competitors/competitors.csv\` — ${all.length} rows.`,
);

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}
function pct(n, d) {
  return d ? `${Math.round((n / d) * 100)}%` : '0%';
}
function noSiteIn(list) {
  return list.filter((p) => !p.website).length;
}

fs.writeFileSync(path.join(DIR, 'report.md'), L.join('\n') + '\n');

console.log(`Wrote data/competitors/report.md and competitors.csv`);
console.log(`  ${all.length} competitors, ${fmt(totalReviews)} total reviews`);
console.log(`  contestable counties: ${counties.filter((c) => c.weak).map((c) => c.county).join(', ') || 'none'}`);
