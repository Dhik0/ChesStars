/**
 * 语义化版本（SemVer 2.0）解析与比较。
 *
 * 只做更新检测需要的那部分：三段数字 + 预发布标识。
 * 刻意不引第三方依赖——这点逻辑自己写清楚，比多一个包更可控，也方便单测。
 */

export interface Semver {
  major: number;
  minor: number;
  patch: number;
  /** 预发布标识，如 1.2.0-beta.1 → ['beta', 1]；正式版为空数组 */
  pre: Array<string | number>;
}

const SEMVER_RE = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** 去掉 `refs/tags/`、`v` / `V` 前缀与首尾空白（GitHub tag 常见 `v1.1.0`） */
export function normalizeVersion(tag: string): string {
  return tag
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^[vV]/, '')
    .trim();
}

/** 解析版本号；非法输入返回 null。允许省略 minor / patch（按 0 补） */
export function parseSemver(input: string): Semver | null {
  const raw = normalizeVersion(input);
  const m = SEMVER_RE.exec(raw);
  if (!m) return null;
  const [, major, minor, patch, pre] = m;
  return {
    major: Number(major),
    minor: Number(minor ?? 0),
    patch: Number(patch ?? 0),
    pre: pre
      ? pre.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))
      : [],
  };
}

function comparePre(a: Array<string | number>, b: Array<string | number>): number {
  // 没有预发布标识 = 正式版，优先级高于任何预发布版本
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = typeof x === 'number';
    const yn = typeof y === 'number';
    // 数字标识永远低于字母数字标识
    if (xn && !yn) return -1;
    if (!xn && yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** 比较两个版本：a > b 返回 1，a < b 返回 -1，相等（或无法解析）返回 0 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  return comparePre(pa.pre, pb.pre);
}

/** candidate 是否比 current 更新 */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0;
}

/** 是否是可用的版本号字符串 */
export function isValidVersion(input: string): boolean {
  return parseSemver(input) !== null;
}
