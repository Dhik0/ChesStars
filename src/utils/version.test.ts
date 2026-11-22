import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  isNewerVersion,
  isValidVersion,
  normalizeVersion,
  parseSemver,
} from './version';

describe('版本号解析', () => {
  it('去掉 v / V 前缀', () => {
    expect(normalizeVersion('v1.1.0')).toBe('1.1.0');
    expect(normalizeVersion(' V2.0.3 ')).toBe('2.0.3');
    expect(normalizeVersion('refs/tags/v1.0.0')).toBe('1.0.0');
  });

  it('解析三段版本与预发布标识', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: [] });
    expect(parseSemver('v1.2.3-beta.1')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: ['beta', 1],
    });
    // 省略 minor / patch 按 0 补
    expect(parseSemver('1')).toEqual({ major: 1, minor: 0, patch: 0, pre: [] });
    expect(parseSemver('1.2')).toEqual({ major: 1, minor: 2, patch: 0, pre: [] });
  });

  it('非法输入返回 null', () => {
    expect(parseSemver('latest')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('v1.0.0.0')).toBeNull();
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('abc')).toBe(false);
  });
});

describe('版本号比较', () => {
  it('按 major / minor / patch 逐段比较（数字而非字典序）', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBe(1);
    expect(compareSemver('1.9.0', '1.10.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
  });

  it('兼容 v 前缀', () => {
    expect(compareSemver('v1.1.0', '1.1.0')).toBe(0);
    expect(isNewerVersion('v1.2.0', '1.1.0')).toBe(true);
    expect(isNewerVersion('v1.0.9', '1.1.0')).toBe(false);
  });

  it('预发布版本低于同号正式版', () => {
    expect(compareSemver('1.1.0-beta.1', '1.1.0')).toBe(-1);
    expect(compareSemver('1.1.0', '1.1.0-rc.1')).toBe(1);
    expect(compareSemver('1.1.0-beta.2', '1.1.0-beta.1')).toBe(1);
    expect(compareSemver('1.1.0-alpha', '1.1.0-beta')).toBe(-1);
  });

  it('无法解析时按相等处理，不会误报新版本', () => {
    expect(compareSemver('nightly', '1.1.0')).toBe(0);
    expect(isNewerVersion('nightly', '1.1.0')).toBe(false);
  });
});
