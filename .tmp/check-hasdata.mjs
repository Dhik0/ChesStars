import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

await build({
  entryPoints: ['src/utils/draftEngine.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '.tmp/eng.mjs', logLevel: 'silent',
});
await build({
  entryPoints: ['src/data/metaIndex.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: '.tmp/midx.mjs', logLevel: 'silent',
});

const eng = await import(pathToFileURL('.tmp/eng.mjs').href);
const midx = await import(pathToFileURL('.tmp/midx.mjs').href);
const meta = JSON.parse(readFileSync('public/data/brawl_meta.json', 'utf-8'));
const idx = midx.buildIndex(meta);

let s = eng.createDraft('Shooting Star', 'bounty', 'ally');
// 填 6 个 ban
const bans = eng.banRecommendations(idx, s, 6);
for (const b of bans) s = eng.applyPick(s, b.id);
console.log('Ban 后阶段:', s.active);

const list = eng.pickRecommendations(idx, s, 12);
console.log('\n前 8 条:');
for (const c of list.slice(0, 8)) {
  console.log(`  ${c.name.padEnd(12)} score=${c.score.toFixed(1)} hasData=${c.hasData}`);
}
const noData = list.filter((c) => !c.hasData).length;
console.log(`\n无数据条数: ${noData} / ${list.length}`);
