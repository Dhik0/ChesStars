import { useState } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { LANGS, LANG_LABEL, useTranslation, type Lang } from '../i18n';

/**
 * 语言选择：内联手风琴折叠面板。
 *
 * 刻意不用原生 `<select>`，也不用悬浮气泡：安卓 Capacitor WebView 里原生下拉的
 * 弹层会被裁切、跟系统主题打架，而折叠面板完全走文档流布局，三端表现一致。
 *
 * 折叠态一行说清「这是什么 + 当前值」，展开后三选一，选中即切换并自动收起。
 * 选项名固定用各语言的母语写法（见 `LANG_LABEL`），切错语言也能认回自己的母语。
 */
export default function LanguageAccordion() {
  const { t, lang, setLang } = useTranslation();
  const [open, setOpen] = useState(false);

  /** 选中即生效：写入上下文 + localStorage（`setLang` 内部完成），然后收起面板 */
  const choose = (next: Lang) => {
    setLang(next);
    setOpen(false);
  };

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-900/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="language-options"
        className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left transition-colors active:bg-slate-800/70"
      >
        <Languages size={14} className="shrink-0 text-sky-400" />
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-200">
          {t('settings.language')}
        </span>
        <span className="shrink-0 text-[11px] text-slate-400">{LANG_LABEL[lang]}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* 用 grid-rows 0fr → 1fr 做高度过渡：不用测量内容高度，展开收起的曲线一致 */}
      <div
        id="language-options"
        aria-hidden={!open}
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 border-t border-slate-800 p-1.5">
            {LANGS.map((code) => {
              const active = code === lang;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => choose(code)}
                  // 收起时整块是 0 高度，仍可被 Tab 聚焦，这里显式摘掉
                  tabIndex={open ? 0 : -1}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] transition-colors ${
                    active
                      ? 'bg-sky-500/15 font-semibold text-sky-200'
                      : 'text-slate-400 active:bg-slate-800'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{LANG_LABEL[code]}</span>
                  {active && <Check size={14} className="shrink-0 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
