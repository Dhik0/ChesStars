import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
await build({ entryPoints: ['src/utils/draftEngine.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '.tmp/e2.mjs', logLevel: 'silent' });
await build({ entryPoints: ['src/data/metaIndex.ts'], bundle: true, format: 'esm', platform: 'node', outfile: '.tmp/m2.mjs', logLevel: 'silent' });
const eng = await import(pathToFileURL('.tmp/e2.mjs').href);
const midx = await import(pathToFileURL('.tmp/m2.mjs').href);
const meta = JSON.parse(readFileSync('public/data/brawl_meta.json', 'utf-8'));
const idx = midx.buildIndex(meta);
let s = eng.createDraft('Shooting Star', 'bounty', 'ally');

console.log('=== Ban 推荐前 6（出场率主导）===');
for (const c of eng.banRecommendations(idx, s, 6)) {
  const st = idx.mapStatTable.get('Shooting Star').get(c.id);
  console.log(`  ${c.name.padEnd(10)} Ban分 ${c.banScore.toFixed(1).padStart(5)}  出场 ${(st.use_rate*100).toFixed(0).padStart(2)}%  强度 ${st.score.toFixed(0).padStart(3)}`);
}

// 按推荐 ban 掉前 6 个
for (const c of eng.banRecommendations(idx, s, 6)) s = eng.applyPick(s, c.id);

console.log('\n=== Pick 推荐前 6（克制+胜率主导）===');
for (const c of eng.pickRecommendations(idx, s, 6)) {
  const st = idx.mapStatTable.get('Shooting Star').get(c.id);
  console.log(`  ${c.name.padEnd(10)} 动态分 ${c.score.toFixed(1).padStart(5)}  胜率 ${(st.smoothed_wr*100).toFixed(0)}%  出场 ${(st.use_rate*100).toFixed(0)}%`);
}

const all = eng.pickRecommendations(idx, s, 200);
const noDataIdx = all.findIndex((c) => !c.hasData);
console.log(`\n无样本英雄首次出现位置: 第 ${noDataIdx + 1} 条 / 共 ${all.length} 条`);
console.log('前 3 条都 hasData:', all.slice(0,3).every(c=>c.hasData));
