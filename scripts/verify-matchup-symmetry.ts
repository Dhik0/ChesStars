/**
 * 3×3 对位格对称性核对表。
 *
 * 用法：
 *   npx vite-node scripts/verify-matchup-symmetry.ts [meta.json 路径]
 *   （默认读 public/data/brawl_meta.json）
 *
 * 输出：
 *   1. 数据概况（版本号、三张查表的条目数）
 *   2. 《Double Swoosh》指定 3 蓝 3 红共 9 组对位的**正向** 9 格
 *   3. 反向 9 格（红方视角看蓝方），逐格核对颜色与数值是否镜像
 *   4. 这 6 个英雄在该图的综合分与配色分档
 *
 * 直接调用 src 下的真实引擎（validateMeta / buildIndex / matchupCell），
 * 不复制任何判定逻辑——脚本与 App 走同一条代码路径。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildIndex, hasMatchupTables, lookupMatchup } from '../src/data/metaIndex';
import { matchupCell, type CounterLight } from '../src/utils/draftEngine';
import { COUNTER_LIGHT_CLASS, baseScoreColor } from '../src/utils/display';
import { validateMeta } from '../src/types/meta';

const MAP_NAME = 'Double Swoosh';
const BLUE = ['EDGAR', 'AMBER', 'EL PRIMO'];
const RED = ['BO', 'BERRY', 'SURGE'];

const LIGHT_LABEL: Record<CounterLight, string> = {
  good: '绿',
  bad: '红',
  even: '黄',
  none: '空',
};

const path = resolve(process.argv[2] ?? 'public/data/brawl_meta.json');
const meta = validateMeta(JSON.parse(readFileSync(path, 'utf-8')) as unknown);
const idx = buildIndex(meta);

const map = idx.mapByName.get(MAP_NAME);
if (!map) {
  console.error(`找不到地图 ${MAP_NAME}`);
  process.exit(1);
}

const idOf = (name: string): number => {
  const hit = meta.brawlers.find((b) => b.name.toUpperCase() === name.toUpperCase());
  if (!hit) {
    console.error(`找不到英雄 ${name}`);
    process.exit(1);
  }
  return hit.id;
};

const blue = BLUE.map(idOf);
const red = RED.map(idOf);

const countRows = (table: Map<string, unknown>): number => table.size;
const mapRows = [...idx.mapMatchup.values()].reduce((s, t) => s + countRows(t), 0);
const modeRows = [...idx.modeMatchup.values()].reduce((s, t) => s + countRows(t), 0);

console.log('='.repeat(78));
console.log('数据文件      :', path);
console.log('schema_version:', meta.schema_version);
console.log('查表条目      :', `地图 ${mapRows} ｜ 模式 ${modeRows} ｜ 全局 ${countRows(idx.globalMatchup)}`);
console.log('是否含 v5 查表:', hasMatchupTables(idx) ? '是' : '否（旧版数据，对位格会全空）');
console.log('地图          :', `${map.map_name} · ${map.mode}`);
console.log(
  '色条图例      :',
  (['good', 'bad', 'even', 'none'] as CounterLight[])
    .map((k) => `${LIGHT_LABEL[k]}=${COUNTER_LIGHT_CLASS[k]}`)
    .join('  '),
);
console.log('='.repeat(78));

const pad = (s: string, n: number): string => {
  // 中文占 2 列，按显示宽度补空格
  const width = [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, n - width));
};

const cellText = (a: number, b: number): string => {
  const cell = matchupCell(idx, map.map_name, map.mode, a, b);
  if (cell.deltaPp === null) return `${LIGHT_LABEL.none}  —`;
  const sign = cell.deltaPp > 0 ? '+' : '';
  return `${LIGHT_LABEL[cell.light]} ${sign}${cell.deltaPp.toFixed(2)} (${cell.source}, n=${Math.round(cell.nEff ?? 0)})`;
};

const header = `${pad('蓝方 \\ 红方', 14)}${RED.map((n) => pad(n, 30)).join('')}`;
console.log('\n【正向】蓝方 → 红方');
console.log(header);
for (let i = 0; i < blue.length; i += 1) {
  const row = blue.map((id, k) => (k === i ? pad(BLUE[k]!, 14) : pad('', 14)))[i]!;
  console.log(row + red.map((r) => pad(cellText(blue[i]!, r), 30)).join(''));
}

console.log('\n【反向】红方 → 蓝方（数值必须与正向相反，颜色绿↔红、黄↔黄、空↔空）');
console.log(`${pad('红方 \\ 蓝方', 14)}${BLUE.map((n) => pad(n, 30)).join('')}`);
for (let i = 0; i < red.length; i += 1) {
  const row = red.map((id, k) => (k === i ? pad(RED[k]!, 14) : pad('', 14)))[i]!;
  console.log(row + blue.map((b) => pad(cellText(red[i]!, b), 30)).join(''));
}

const MIRROR: Record<CounterLight, CounterLight> = {
  good: 'bad',
  bad: 'good',
  even: 'even',
  none: 'none',
};

let checked = 0;
const problems: string[] = [];
for (const a of blue) {
  for (const b of red) {
    const fwd = matchupCell(idx, map.map_name, map.mode, a, b);
    const rev = matchupCell(idx, map.map_name, map.mode, b, a);
    checked += 1;
    if (rev.light !== MIRROR[fwd.light]) {
      problems.push(`颜色不镜像：${a}→${b} ${fwd.light} / ${b}→${a} ${rev.light}`);
    }
    if (fwd.deltaPp === null || rev.deltaPp === null) {
      if (fwd.deltaPp !== rev.deltaPp) problems.push(`空值不对称：${a}×${b}`);
    } else if (Math.abs(fwd.deltaPp + rev.deltaPp) > 1e-9) {
      problems.push(`数值不相反：${a}→${b} ${fwd.deltaPp} / ${b}→${a} ${rev.deltaPp}`);
    }
  }
}

console.log('\n【对称性核对】');
console.log(`检查 ${checked} 组 × 2 方向 = ${checked * 2} 个格子：${problems.length === 0 ? '全部通过' : `${problems.length} 处不一致`}`);
for (const p of problems) console.log('  ✗', p);

// 同一条查表记录被两侧共用的证据：来源层 + n_eff 必须完全一致
let sharedOk = true;
for (const a of blue) {
  for (const b of red) {
    const f = lookupMatchup(idx, map.map_name, map.mode, a, b);
    const r = lookupMatchup(idx, map.map_name, map.mode, b, a);
    if (f === null && r === null) continue;
    if (!f || !r || f.source !== r.source || f.nEff !== r.nEff) sharedOk = false;
  }
}
console.log(`来源层 / 有效样本共用同一条记录：${sharedOk ? '是' : '否'}`);

console.log('\n【综合分 / 分档 / 顺位】（v5 跨图统一标尺：头部 65~90 / 常规 55~65 / 冷门 <50）');
const bandLabel = (score: number): string => {
  const cls = baseScoreColor(score);
  if (cls === 'text-strong') return '头部主力·绿';
  if (cls === 'text-sky-400') return '常规主力·天蓝';
  if (cls === 'text-slate-200') return '可用·浅灰';
  return '冷门·暗灰';
};
const statOf = (id: number) => idx.mapStatTable.get(map.map_name)?.get(id);
for (const [team, ids] of [
  ['蓝方', blue],
  ['红方', red],
] as const) {
  for (const id of ids) {
    const s = statOf(id);
    const name = meta.brawlers.find((b) => b.id === id)!.name;
    const score = s ? s.score.toFixed(1) : '—';
    const band = s ? bandLabel(s.score) : '无数据';
    const order = s ? s.pick_order : '—';
    console.log(
      `  ${team} ${pad(name, 12)} ${pad(String(score), 7)} ${pad(band, 14)} ${pad(order, 8)} ${s ? baseScoreColor(s.score) : ''}`,
    );
  }
}

console.log('');
