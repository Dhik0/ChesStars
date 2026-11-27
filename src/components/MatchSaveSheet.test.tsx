// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { LANG_STORAGE_KEY } from '../i18n/langs';
import { createMatchRecord, type MatchRecord } from '../services/matchHistoryStore';
import MatchSaveSheet, { type MatchSaveSheetHandle } from './MatchSaveSheet';

/**
 * 保存抽屉的交互守卫。
 *
 * 盯的是三件会直接影响用户数据的事：
 *   1. 底部只剩一个主操作，别再出现「取消 / 保存」两个容易点错的按钮；
 *   2. 任何关闭手势都要先落库（脏数据不丢），但完全没动过的新建局不许写空白条目；
 *   3. 「保存并复盘」要把表单数据带出去，交给上层打开复盘。
 */

beforeEach(() => {
  // 固定语言，断言文案才稳定（默认会跟着 navigator 走英文）
  localStorage.setItem(LANG_STORAGE_KEY, 'zh-CN');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function makeRecord(over: Partial<MatchRecord> = {}): MatchRecord {
  const record = createMatchRecord({
    mapId: 'Gem Fort',
    mode: 'gemGrab',
    firstPick: 'ally',
    bans: [],
    allyPicks: [
      { brawlerId: '16000020', pickOrder: 1 },
      { brawlerId: '16000013', pickOrder: 4 },
      { brawlerId: '16000011', pickOrder: 5 },
    ],
    enemyPicks: [
      { brawlerId: '16000002', pickOrder: 2 },
      { brawlerId: '16000003', pickOrder: 3 },
      { brawlerId: '16000004', pickOrder: 6 },
    ],
    now: 1_700_000_000_000,
  });
  return { ...record, ...over };
}

function renderSheet(options: { isNew?: boolean; record?: MatchRecord } = {}) {
  const record = options.record ?? makeRecord();
  const isNew = options.isNew ?? true;
  const onClose = vi.fn();
  const onSaveAndReview = vi.fn();
  const ref = { current: null as MatchSaveSheetHandle | null };

  const view = render(
    <I18nProvider>
      <MatchSaveSheet
        ref={ref}
        record={record}
        isNew={isNew}
        getBrawler={() => undefined}
        onSaveAndReview={onSaveAndReview}
        onClose={onClose}
      />
    </I18nProvider>,
  );

  return { ...view, record, onClose, onSaveAndReview, ref };
}

/** 第一行（我方第 1 人）的 6 个输入框，按 DOM 顺序：击杀 / 死亡 / 伤害 / 治疗 / 承伤 / 模式指标 */
const firstRowInputs = () => screen.getAllByRole('textbox').slice(0, 6);

describe('底部操作栏', () => {
  it('只渲染「保存并复盘」一个按钮，没有取消与保存', () => {
    renderSheet();

    expect(screen.getByRole('button', { name: '保存并复盘' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
  });

  it('按钮文案不随比分是否选择而增减', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /2:0/ }));

    const buttons = screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
    expect(buttons.filter((text) => text === '保存并复盘')).toHaveLength(1);
    expect(buttons).not.toContain('保存');
    expect(buttons).not.toContain('取消');
  });
});

describe('关闭手势自动保存', () => {
  it('改过数据后点右上角 ×：带着新数据关闭', () => {
    const { onClose, onSaveAndReview } = renderSheet();

    fireEvent.change(firstRowInputs()[0]!, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onSaveAndReview).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    const saved = onClose.mock.calls[0]![0] as MatchRecord;
    expect(saved.allyStats[0]!.kills).toBe(5);
  });

  it('只勾了「我」也算改过，不能当空白记录丢掉', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getAllByRole('button', { name: '我' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    const saved = onClose.mock.calls[0]![0] as MatchRecord;
    expect(saved).not.toBeNull();
    expect(saved.allyStats[0]!.isSelf).toBe(true);
  });

  it('选了比分也算改过', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /2:1/ }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    const saved = onClose.mock.calls[0]![0] as MatchRecord;
    expect(saved.score).toBe('2:1');
    expect(saved.result).toBe('win');
  });

  it('新建局什么都没填：直接关，不写空白条目', () => {
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalledWith(null);
  });

  it('编辑已有对局：即使没改也照样保存', () => {
    const { onClose, record } = renderSheet({ isNew: false });

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    const saved = onClose.mock.calls[0]![0] as MatchRecord;
    expect(saved).not.toBeNull();
    expect(saved.id).toBe(record.id);
  });

  it('Esc 与点击遮罩走同一条保存路径', () => {
    const { onClose, container } = renderSheet();

    fireEvent.change(firstRowInputs()[0]!, { target: { value: '3' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect((onClose.mock.calls[0]![0] as MatchRecord).allyStats[0]!.kills).toBe(3);

    onClose.mockClear();
    fireEvent.click(container.firstElementChild!);
    expect((onClose.mock.calls[0]![0] as MatchRecord).allyStats[0]!.kills).toBe(3);
  });

  it('返回键句柄与 × 等价（脏数据先落库）', () => {
    const { onClose, ref } = renderSheet();

    fireEvent.change(firstRowInputs()[3]!, { target: { value: '1.2' } });
    ref.current?.requestClose();

    const saved = onClose.mock.calls[0]![0] as MatchRecord;
    expect(saved.allyStats[0]!.healing).toBe(12000);
  });
});

describe('保存并复盘', () => {
  it('保存表单数据并交给上层打开复盘', () => {
    const { onSaveAndReview, onClose } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /2:0/ }));
    fireEvent.change(firstRowInputs()[0]!, { target: { value: '7' } });
    fireEvent.change(firstRowInputs()[2]!, { target: { value: '2.4' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并复盘' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(onSaveAndReview).toHaveBeenCalledTimes(1);
    const saved = onSaveAndReview.mock.calls[0]![0] as MatchRecord;
    expect(saved.score).toBe('2:0');
    expect(saved.allyStats[0]!.kills).toBe(7);
    expect(saved.allyStats[0]!.damage).toBe(24000);
  });
});
