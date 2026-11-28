# DESIGN.md — Material 3 Expressive 原生移动端 UI 规范

> 唯一视觉真源。方向：Material 3 Expressive（Tonal 色彩分层 + 分段组合卡片 + 标志性 M3 控件）+ Capacitor 类原生工程底线。
> 迁移期代码与本文冲突时以 `src/index.css` 实际值为准；新组件按本文类名/数值逐屏落地，不一次性重写。
## 1. 设计定位与主题矩阵

| 层 | 参照 | 落地结论 |
| --- | --- | --- |
| 视觉 | Material 3 Expressive / KernelSU Next 类 | Tonal 表面分层、分段独立卡片、胶囊药丸指示、大圆角 20/28px、State Layer 按压 |
| 色彩 | M3 Dynamic Color（Monet） | `data-monet=on` 从 `--accent-rgb` 用 `color-mix` 派生 Tonal 角色；关闭回落 Tonal Slate Blue |
| 动效 | M3 Emphasized | 快出缓停 + 轻微回弹；进场 280–400ms / 退场 170–200ms；State Layer 8%–12% |
| 工程 | Capacitor + Apple HIG | `viewport-fit=cover`、安全区、清浏览器杂质、1:1 跟手返回、手势优先级栈、触觉预留 |
| 基底 | 四主题 | Tonal Dark / OLED Pure Black / Light / 跟随系统；默认深色或跟随系统，不闪白 |

| 主题 | `surface` | `surface-container` | `surface-container-high` | `primary` | 卡片阴影 |
| --- | --- | --- | --- | --- | --- |
| Tonal Dark | `#101418` | `#1B2026` | `#262D36` | `#AECBFA` | `none` |
| OLED Pure Black | `#000000` | `#16181C` | `#20242A` | `#AECBFA` | `none` |
| Light | `#F7F9FC` | `#FFFFFF` | `#EDF1F7` | `#24548F` | `0 1px 2px rgb(15 23 42/.06)` |
| 跟随系统 | 随 `prefers-color-scheme` 切上表深/浅 | — | — | — | — |

## 2. M3 色彩角色与 Token 映射

### 2.1 角色 → 现有变量（渐进迁移映射）

| M3 角色 | 现有 CSS 变量 | 用途 |
| --- | --- | --- |
| `surface` | `--c-app` / `--app-bg` | 页面底板 |
| `surface-container` | `--c-card` / `--card-bg` | 卡片面 |
| `surface-container-high` | `--c-raised` | 浮层 / 弹窗 / 搜索栏 |
| `surface-container-highest` | `--c-press` | Switch 关闭轨、抬升控件 |
| `on-surface` / `on-surface-variant` | `--c-fg` / `--c-muted` | 主字 / 副字 |
| `primary` / `on-primary` | `--accent` / `--accent-on` | 实心强调、Switch 开启轨 |
| `primary-container` / `on-primary-container` | `--accent-soft` / `--accent` | 强调胶囊、选中分段、徽标 |
| `secondary-container` / `on-secondary-container` | `--control-selected-bg` / `--control-selected-fg` | 底栏选中药丸 |
| `outline` / `outline-variant` | `--c-line-strong` / `--c-line` | 描边 / 弱描边 |
| `surface-variant` | `--menu-bg` | 悬浮选单面 |

### 2.2 受保护业务语义色（禁止被 M3 动态色污染）

| 类别 | Token / 类名 | 规则 |
| --- | --- | --- |
| BP 阵营 | `--c-ally` `#3B82F6` / `--c-enemy` `#EF4444` | 固定，不随 `data-monet` / `data-accent` 变化 |
| 复盘 9 档 | `.grade-brilliant` / `.grade-great` / `.grade-best` / `.grade-good` / `.grade-book` / `.grade-inaccuracy` / `.grade-mistake` / `.grade-miss` / `.grade-blunder` | 沿用各自色阶；浅色压 600/700，不套 `--accent` |
| `!!` 特效 | `.brilliant-glow`、`--c-brilliant` `#22D3EE`、`brilliant-sweep/ring/flash` | 仅 `!!` 联动，不迁移到普通卡片 |
| 金标 / 提示 | `--c-gold` `#FCD34D`、`--c-strong` `#22C55E`、`--c-danger` `#F87171`、`.tone-orange`、`.ban-active-glow` | 语义固定，改主题只做同色系深浅校准 |

### 2.3 Monet 关闭：Tonal Slate Blue 冷灰蓝盘

| 角色 | Dark / OLED | Light |
| --- | --- | --- |
| `primary` / `on-primary` | `#AECBFA` / `#0A2545` | `#24548F` / `#FFFFFF` |
| `primary-container` / `on-primary-container` | `#1B3A5C` / `#D7E3FF` | `#D7E3FF` / `#0A2E5C` |
| `secondary-container` / `on-secondary-container` | `#2E3A4A` / `#C9D6E8` | `#DDE3ED` / `#2B3543` |
| `outline` / `outline-variant` | `#8A94A6` / `#414755` | `#747F91` / `#C4CAD5` |
| 分组 / 图标 | `--section-label-fg #8E8E93` / `--list-icon-fg #E5E5EA` | `#6E6E73` / `#1C1C1E` |
| 底栏选中 / 未选 | `#FFFFFF` / `#7D8187` | `#111113` / `--c-subtle` |

### 2.4 Monet 开启：`data-monet="on"` 派生

| 声明 | 值（`color-mix` 前保留中性兜底行） |
| --- | --- |
| 底板 | `--app-bg: color-mix(in srgb, rgb(var(--c-app)) 95%, rgb(var(--accent-rgb)) 5%)` |
| 卡片 | `--card-bg: color-mix(in srgb, rgb(var(--c-card)) 91%, rgb(var(--accent-rgb)) 9%)`；Light 为 94%/6% |
| 浮层 | `--menu-bg: color-mix(in srgb, #242426 92%, rgb(var(--accent-rgb)) 8%)`；Light 为 `#FFFFFF` 94%/6% |
| Tonal 角色 | `primary-container = color-mix(accent 22%, surface-container)`、`surface-tint = color-mix(accent 8%, surface)`；`on-*` 按 WCAG 亮度二选一 |
| 种子预设 | `mint 124 232 216`、`sky 122 162 247`、`violet 183 148 244`、`amber 246 173 85`、`sakura 246 135 179`；`custom` 读 `--custom-accent-rgb/alpha/on` |
| 生效优先级 | 规则写 `:root[data-monet='on']`（0,2,0）压过 `:root:not([data-theme='light'])`；老 WebView 解析失败靠前一行兜底不透明 |
| 对比硬线 | 文字/容器 ≥ 4.5:1（WCAG AA）；粉彩亮底 `on=#101319`，压深底 `on=#FFFFFF`；禁止高饱和亮底配白字 |
| 字阶对比 | `--c-muted` / `--c-subtle` / `--c-faint` 在各自卡片底上 ≥ 4.5:1 且保持明度差，承载时间/模式/数值，禁止再压暗 |

## 3. 分段组合卡片与排版标尺

| 对象 | 参数 |
| --- | --- |
| 分段卡片组 | `.m3-group` / `.m3-item`：每项独立成卡，行间距 `2px–3px`，无 `1px` 分割线 |
| 分段圆角 | 首项顶边、末项底边 `20px`；组内相邻边 `4px`；单项独立卡四角 `20px`；迁移期 `--card-top` 顶边微光仅用于独立卡 |
| 一级页头 | `.page-head` `padding: calc(env(safe-area-inset-top)+26px) 20px 20px`；`.page-title` `30px / font-medium(500) / 1.18 / -0.02em` 左对齐 |
| 二级页 | 标准 M3 Top App Bar：返回键 `40×40` + 标题 `22px–24px font-medium`，或大标题折叠式 `32px`；`.subpage-head` 安全区 +16px |
| 列表行 | `min-h-[64px]` / `px-4 py-3.5`（16px / 14px）；主字 `16px–17px font-medium`，副字 `13px–14px`，左侧图标 `22px–24px` |
| 触控 | 最小热区 `48px`；`--tap-sm:34px`、`--chip-h:26px`、`--avatar:38px` 外扩至 48px 才用于主操作 |
| 分组标题 | `.section-label` `14px / 500`、卡片上方 `10px`、`padding: 0 4px`（设置页 0） |
| 矮视口 | `@media (max-height:660px) and (orientation:portrait)`：`--slot-h/--slot-avatar-w:44px`、`--slot-gap:3px`、`--ban-max:32px`、`--act-h:34px`、`--draft-pt/pb/gap:4px` |

## 4. 标志性 M3 组件

| 组件 | 结构 | 状态与动效 |
| --- | --- | --- |
| M3 Switch | `.m3-switch` `52×32px` 全圆角；关闭轨 `surface-container-highest` + `2px solid outline`；圆点 `24px`（`16px→24px` 弹性） | 关闭：左 `24px` 圆点含 `×`；开启：轨填 `primary`、右 `24px` `on-primary` 圆点含 `✓`；位移 220ms Emphasized |
| Bottom Navigation | `.m3-nav` 高 `68px–72px` + 底部安全区；4 Tab 顺序 `draft → history → settings → about` | 选中：图标外包 `64×32px rounded-full secondary-container` + 实心图标 + `font-medium` 标签；切换药丸 `scaleX(0.5)→1` 淡入 |
| 分段按钮 | 胶囊式三段 / 四段组；容器 `surface-container`，选中项 `primary-container` 填充 + `on-primary-container` 字 | State Layer 按压 8%–12%、140ms ease；选中态 200ms Emphasized |
| 弹窗 / 底部抽屉 | 圆角 `28px`（`--radius-card-lg`）；面 `surface-container-high`，遮罩 `.scrim` 深 `rgb(0 0 0/.6)` / 浅 `rgb(15 23 42/.35)` | 弹簧进场快出缓停 + 轻微回弹；State Layer 8%–12%；投影只放外层 `filter: var(--menu-filter)` |
| 调色盘 | 底部抽屉 6×5 `40px` 平涂色块、透明度 range `24px` 滑块 | `theme-color-in 300ms` / `theme-color-out 185ms`；草稿色只在组件内，取消不写盘 |

## 5. 物理动效与退场词典

| 场景 | 类 / 动画 | 参数 |
| --- | --- | --- |
| Emphasized 曲线 | `cubic-bezier(0.22, 1, 0.36, 1)` | 进场 280–400ms 快出缓停 + 微回弹；退场 `cubic-bezier(0.4, 0, 1, 1)` 170–200ms |
| 一级切页 | `.animate-page-in-next/-prev` | 200ms `cubic-bezier(0.22, 0.8, 0.3, 1)` |
| 二级子页 | `.animate-subpage-in` | 260ms；底层 `.settings-underlay translate3d(-22px,0,0)` 同曲线 |
| 锚定浮层 | `lang-menu-up/down-in` | 280ms；`clip-path inset(68% 0 0 0 round 20px)` 方向性揭幕；scale `0.86→1.015→1` |
| 浮层收起 | `lang-menu-up/down-out` | 170ms，scale 至 0.88；遮罩 220ms ease-out / 170ms ease-in |
| 主题手风琴 | `.theme-color-reveal` | 240ms；`grid-template-rows 0fr↔1fr` + opacity + `translateY(-4px)` |
| 调色盘 | `theme-color-in/out` | 300ms / 185ms；`translateY(44px) scale(.94)` → 越过 `-4px/1.008` → 稳落 |
| 按压态 | `button.list-row:active` | State Layer 8%–12%（深 `rgb(255 255 255/.06)`、浅 `--c-press/.45`），140ms；移动端禁粘滞 `hover:` |
| 妙手联动 | `brilliant-sweep 900ms` / `ring 850ms` / `flash 520ms` | 仅 `!!`，不迁移普通卡片 |
| 降级 | `@media (prefers-reduced-motion: reduce)` | 上述动画统一 `animation: none !important`，仅保留静态描边 |

**退场硬规则**：浮层 / 子页 / 抽屉必须先播完反向动画再卸载 DOM；语言选单 180ms 定时器（>170ms）、调色盘 190ms（>185ms）、子页 `SWIPE_BACK_MS`；`commitClose` 加 `finished` 幂等；调色盘 Escape 在 `document` 捕获阶段拦下；关闭 Monet 用 `monetEnabled` 下降沿一并收起。

## 6. 手势仲裁、返回栈与类原生工程底线

| 项 | 规则 |
| --- | --- |
| 视口安全区 | `viewport-fit=cover`；`.safe-top` / `.safe-bottom` / `.safe-top-banner` 吃 `env(safe-area-inset-*)`；有底栏时 `.has-bottom-nav` 不重复垫高 |
| 顶部渐隐 | `.page-veil` 高 `calc(env(safe-area-inset-top)+24px)`，`--app-bg` 42% → 72% 透明 → 全透，列表上滑不压状态栏文字 |
| 清浏览器杂质 | `body overflow:hidden` + `overscroll-behavior:none`，滚动容器 `overscroll-contain` / `no-scrollbar`；非输入禁选字；`-webkit-tap-highlight-color:transparent`；`button touch-action:manipulation`；`input font-size:16px`；`.h-dvh` 回退 `100vh` |
| 返回优先级栈 | 浮层 → 弹窗 / 抽屉 → 二级子页 → 顶层 Tab → 系统边缘返回；返回键 / `Esc` 一次只消费一层 |
| 1:1 跟手侧滑 | `useSwipeBack` 位移 1:1，松手越过 30% 屏宽提交返回；子页 `touch-action: pan-y`；未达标回弹不卸载 |
| 4-Tab 滑动 5 条禁用 | ① BP 选人态 ② 任意弹窗 / 浮层 ③ 二级子页打开 ④ 屏幕左右 `28px` 边缘盲区 ⑤ 横滑子容器或输入焦点内；`MAIN_TABS` 顺序即滑动顺序，禁另立副本 |
| 触觉预留 | 引入 `@capacitor/haptics` 后：`impact(Light)` 用于开关 / 分段 / 语言选中，`impact(Medium)` 用于 BP 选人 / Ban，`notification(Success/Error)` 用于拉取结果；滚动与纯动画不震动；无设备静默降级 |

## 7. UI 文案规范

| 场景 | 文案 |
| --- | --- |
| 数据 | 只说数据是哪一天 |
| 更新 | 只说能否更新；失败提示「拉取失败，请检查网络后重试」 |
| 下载 / 反馈 | 只给去哪里下载、去哪里反馈 |
| 禁令 | 不出现算法、公式、贝叶斯 / Log5、CDN、SHA、超时秒数、重试次数、降级顺序、schema 版本 |

## 8. 反模式黑名单

| # | 禁止 |
| --- | --- |
| 1 | 混用 HyperOS / Miuix 样式：无符号内缩开关、无胶囊药丸底栏、整卡大留白混排、`divide-y` 分割线 |
| 2 | 硬编码 `sky-*` / `cyan-*` / `blue-*` 等 Tailwind 色阶或一次性色值 / 时长；一律走语义 Token |
| 3 | 中文标题用 `font-bold` / `font-black`；只允许 `font-medium` |
| 4 | 卡片加高对比描边、渐变、内高光、多层阴影；层级只靠 Tonal 明度差 |
| 5 | 高饱和亮底配白字；Monet 掺色超 5%/9%（浅 6%）或文字低于 4.5:1 |
| 6 | 业务语义色（阵营 / 评级 / `!!` / 金标）跟随 `--accent` 变色 |
| 7 | 退场动画未播完就卸载 DOM，或忽略 `prefers-reduced-motion` |
| 8 | 抢占 `28px` 系统边缘、在横滑容器嵌套 Tab 滑动、露出滚动条 / 页面橡皮筋 |
| 9 | 只写 `hover:` 或用 APNG/GIF 代替 State Layer 按压反馈 |
| 10 | 文案暴露内部实现（算法 / 网络链路 / 技术参数） |

## 9. 开发自检表（5 项）

| # | 自检 | 通过标准 |
| --- | --- | --- |
| 1 | 色彩 | Tonal 深 `#101418` / OLED `#000000` / 浅 `#F7F9FC`；Monet 掺色 5%/9%（浅 6%）、对比 ≥ 4.5:1；业务语义色未改 |
| 2 | 尺寸 | 标题 30 / 22–24、分组 14、主字 16–17、副字 13–14、图标 22–24、卡片组 20、弹层 28；热区 ≥ 48px |
| 3 | 组件与动效 | Switch 52×32 带 `×/✓`、底栏 `64×32` 药丸、分段 `primary-container`；Emphasized 快出缓停 + 微回弹；退场播完再卸载 |
| 4 | 手势 | 返回栈顺序正确；`28px` 盲区与 5 条禁用条件生效；`MAIN_TABS` 无副本；`.page-veil` 与浏览器杂质处理到位 |
| 5 | 文案与边界 | 面向玩家的一句话结论；减少动态效果下无动画

代码锚点：Token 与降级 `src/index.css`；四 Tab 样板 `src/components/BottomNav.tsx`；列表 / 选单 / 子页样板 `src/components/SettingsView.tsx`。新增视觉状态先补 Token 与本文条目，再改组件。
