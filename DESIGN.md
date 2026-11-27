# DESIGN.md — 原生移动端 UI/UX 开发指南

> 适用：React + Tailwind + Capacitor 的 4-Tab 应用。本文是 UI 改动的唯一参数真源；代码与本文冲突时，以 `src/index.css` 实际值为准。

## 1. 设计定位与参考源

| 层 | 参考 | 落地结论 |
| --- | --- | --- |
| 视觉比例 | HyperOS / `compose-miuix-ui/miuix` | 大圆角、无分割线分组卡片、大标题页头、锚点弹层；仓库页只给组件方向，不给数值，数值取本项目已定型值 |
| 色阶与动效 | Material Design 3 | Surface 灰阶分层、State Layer 8%–12% 叠层反馈、Emphasized「快出缓停」、48px 最小热区、Monet 克制掺色 |
| 工程底线 | Apple HIG + Capacitor / Konsta 类原生实践 | `viewport-fit=cover` + 安全区、`overscroll-behavior: none`、清浏览器杂质、1:1 跟手返回、手势优先级栈、`@capacitor/haptics` |
| 基底 | OLED 优先 | 默认主题即纯黑 `#000000`，不闪深蓝；浅色仅为用户选择 |

| 主题 | 底板 / 卡片 | 微染关强调色 | 卡片阴影 |
| --- | --- | --- | --- |
| `oled` | `#000000` / `#1C1C1E` | `#5B8DEF` | `none` |
| `navy` | `#020617` / `#182136` | `#5B8DEF` | `none` |
| `light` | `#F4F6F9` / `#FFFFFF` | `#2563EB` | `0 1px 2px rgb(15 23 42 / .06)` |

## 2. Design Tokens 与色彩规则

### 2.1 真实变量（`src/index.css`，值为空格分隔 RGB 通道）

| 变量 | RGB | HEX | 用途 |
| --- | --- | --- | --- |
| `--c-app` | `0 0 0` | `#000000` | 页面纯黑底板通道值（OLED） |
| `--app-bg` | `rgb(var(--c-app))` | — | 渲染层实际底色：微染关 = 纯 `--c-app`，微染开 = 同色系 5% 微染；html/body/#root 与 `.page-veil` 都读它 |
| `--c-surface` / `--c-card` | `28 28 30` | `#1C1C1E` | 卡片 / 一级表面 |
| `--c-raised` | `34 36 39` | `#222427` | 输入底、胶囊、分段容器 |
| `--c-press` | `46 48 52` | `#2E3034` | 按压态 / 抬升一档 |
| `--c-line` | `34 36 39` | `#222427` | 弱描边 |
| `--c-line-strong` | `56 58 62` | `#383A3E` | 浮层顶边、选中描边 |
| `--c-fg` | `240 240 243` | `#F0F0F3` | 主字 / 标题 |
| `--c-body` | `212 212 212` | `#D4D4D4` | 正文 |
| `--c-muted` | `163 163 163` | `#A3A3A3` | 副字 |
| `--c-subtle` | `138 138 138` | `#8A8A8A` | 三级字 / 底栏未选中 |
| `--c-faint` | `136 136 136` | `#888888` | 占位 / 脚注（卡片底 4.8:1，过 WCAG AA） |
| `--c-brand` | `91 141 239` | `#5B8DEF` | 深色原生系统蓝 |
| `--c-strong` / `--c-danger` | `34 197 94` / `248 113 113` | `#22C55E` / `#F87171` | 正向 / 负向 |
| `--c-gold` / `--c-brilliant` / `--c-mark` | `252 211 77` / `34 211 238` / `196 181 253` | `#FCD34D` / `#22D3EE` / `#C4B5FD` | 评级 / 妙手 / 顺位 |
| `--c-ally` / `--c-enemy` | `59 130 246` / `239 68 68` | `#3B82F6` / `#EF4444` | BP 阵营（受保护） |

派生：`--card-bg`（卡片实际底色）、`--accent-rgb` / `--accent` / `--accent-on` / `--accent-soft`、`--section-label-fg`、`--list-icon-fg`、`--menu-bg` / `--menu-filter` / `--menu-selected-fg`、`--control-selected-bg/fg/shadow`、`--switch-thumb`、`--radius-card: 18px`、`--radius-card-lg: 28px`。组件只写 `.card` / `.section-label` / `.text-accent`，不写死色值。

**文字对比度硬线**：`--c-muted` / `--c-subtle` / `--c-faint` 在各自卡片底色上都 ≥ 4.5:1（WCAG AA），且保持 muted > subtle > faint 的明度差。当前三套：OLED `163/138/136`、navy `170 182 199 / 148 163 184 / 132 147 170`、light `71 85 105 / 100 116 139 / 106 112 126`。这三级承载实际信息（时间、模式、数值），不是纯装饰，禁止为"层次感"再压暗。

| 派生 Token | OLED 深色 | 说明 |
| --- | --- | --- |
| `--card-bg` | `rgb(var(--c-card))` | 微染开：深色 91%/9%、浅色 94%/6% |
| `--app-bg` | `rgb(var(--c-app))` | 微染开：底板 95%/5%，比卡片暗一档；关闭严格回纯色（保留兜底行） |
| `--accent-rgb` / `--accent` | `var(--c-brand)` / `rgb(var(--accent-rgb) / var(--accent-alpha))` | 微染关只等于系统蓝；`--accent-alpha` 由调色盘透明度控制 |
| `--accent-on` / `--switch-thumb` | `#FFFFFF` / `#FFFFFF` | 微染开变 `#101319` |
| `--accent-soft` | `rgba(91,141,239,0.16)` | 浅色主题 0.12 |
| `--section-label-fg` / `--list-icon-fg` | `#8E8E93` / `#E5E5EA` | 浅色主题跟随 `--accent` |
| `--menu-bg` / `--menu-filter` | `#242426` / `drop-shadow(0 12px 28px rgb(0 0 0 / .45))` | 微染开：深色 `#242426` 92% + 强调色 8%、浅色 `#FFFFFF` 94% + 6%；关闭严格回纯色；投影只放外层 |
| `--menu-selected-fg` | `#5B8DEF` | 浅色主题 `#2563EB` |
| `--control-selected-bg/fg` | `#2C2C2E` / `#F2F2F7` | 微染关走中性抬升 |
| `--switch-off` | `#4A4A4E` | 浅色 `#D1D1D6`；开启轨走 `--accent` |
| `--card-top` / `--row-divider` / `--nav-line` | `rgba(255,255,255,.03/.06/.06)` | OLED 顶边微光与弱线 |
| `--shadow-card` | `none` | 深色扁平；浅色才启用微阴影 |
| `.scrim` / `.scrim-strong` | `rgb(0 0 0 / .6)` / `.7` | 浅色 `.35` / `.45` |

### 2.2 Monet 关闭：严格黑白灰（深色）

| 元素 | 值 |
| --- | --- |
| 分组标题 `--section-label-fg` / 图标 `--list-icon-fg` | `#8E8E93` / `#E5E5EA` |
| 底栏选中 / 未选中 | `#FFFFFF` / `#7D8187` |
| 分段选中 `--control-selected-bg` / `--control-selected-fg` | `#2C2C2E` / `#F2F2F7` |
| 悬浮选单 `--menu-bg` / 选中字 `--menu-selected-fg` | `#242426` / `#5B8DEF` |
| 允许的蓝色 | 仅小面积焦点：选单高亮字与 `✓`、激活开关、可点强调字；深 `#5B8DEF`，浅色主题 `#2563EB` |

浅色主题在微染关闭时**同样严格单色**：分组标题 `--section-label-fg: #6E6E73`、列表图标 `--list-icon-fg: #1C1C1E`、底栏选中 `#111113` / 未选 `--c-subtle`；白卡片上靠深灰黑撑对比度，不靠强调色。微染一开，这三项才回到 `--accent`。蓝色只剩选单选中字/✓、激活开关这类小面积焦点，浅色仍是 `#2563EB`。

### 2.3 Monet 开启：6%–8% 克制微染

- `[data-monet='on']` 才接管强调色：`--app-bg = color-mix(app 95%, accent 5%)`（页面底板），`--card-bg = color-mix(card 91%, accent 9%)`（深色卡片，始终比底板亮一档）；浅色主题底板同为 `95% / 5%`、卡片 `94% / 6%`。底色微染不超过 5%，卡片不超过 9%。关闭时两行兜底让 `--app-bg` / `--card-bg` 严格回纯色，老 WebView 不认识 `color-mix` 也不会透明。
- 语言悬浮选单选中态 `--menu-selected-fg` 随 `[data-monet='on']` 切换为 `var(--accent)`，选中文字与 `✓` 同触发行上下箭头同步变色；微染关闭时保持深色 `#5B8DEF` / 浅色 `#2563EB`。生效前提是微染规则用 `:root[data-monet='on']`（0,2,0）压过 `:root:not([data-theme='light'])` 的中性块，不能只写 `[data-monet='on']`（0,1,0），否则被上游同优先级按源码顺序锁回系统蓝。
- 语言悬浮选单背景 `--menu-bg` 同为同色系微染：深色 `#242426 92% + 强调色 8%`、浅色 `#FFFFFF 94% + 6%`；`color-mix` 前各保留一行中性灰兜底（`#242426` / `#FFFFFF`），关闭微染时严格纯色不变。_bg 微染 ≤8%，选中态仍是中性底色 + 变色文字/`✓`，不加彩色胶囊。
- 5 组预设：`mint 124 232 216`、`sky 122 162 247`、`violet 183 148 244`、`amber 246 173 85`、`sakura 246 135 179`；`data-accent` 仅在微染开启时生效。
- `data-accent='custom'` = 调色盘自定义色：`themeStore` 写 `--custom-accent-rgb`（空格分隔通道）、`--custom-accent-alpha`（0–1）、`--custom-accent-on`（按 WCAG 亮度二选一：浅底 `#101319` / 深底白字）三个变量到 root；`index.html` 内联脚本同步写一遍防首屏闪。自定义色不套预设的浅色压深逻辑，用户选什么就是什么。微染比例仍 ≤7%/6%，透明度靠 `rgb(var(--accent-rgb) / var(--accent-alpha))` 生效，不改掺色比例。
- 高对比：深色粉彩底 `--accent-on: #101319`（开关滑块同色）；浅色压深后 `--accent-on: #FFFFFF`。禁止高饱和底配白字。
- `color-mix` 前保留一行中性灰兜底，老 WebView 解析失败不会透明。

### 2.4 受保护业务语义色（禁止被通用 `--accent` 污染）

- BP：`--c-ally` 我方蓝 / `--c-enemy` 敌方红；阵营色不随微染切换。
- 复盘角标类：`.grade-brilliant` / `.grade-great` / `.grade-best` / `.grade-good` / `.grade-book` / `.grade-inaccuracy` / `.grade-mistake` / `.grade-miss` / `.grade-blunder`；`!!` 另有 `.brilliant-glow`、`.tone-orange`、`.ban-active-glow`、金标 `--c-gold`。
- 浅色主题下角标同色系压到 600/700 档；改主题时逐档核对，不整体套用强调色。

## 3. 排版、间距与圆角标尺

| 对象 | 参数 |
| --- | --- |
| 页头 | `.page-head` `padding: calc(env(safe-area-inset-top) + 26px) 20px 20px`；`.settings-page-head` 左右归零，与父级 `px-4` 合成 16px 基准 |
| 大标题 | `.page-title` 30px / `line-height:1.18` / `letter-spacing:-0.02em`；组件加 `font-medium`（实际 500）。严格左对齐下方分组与卡片 |
| 二级页头 | `.subpage-head` 两行式：安全区 +16px 上内距；`.subpage-back` 40×40 / 圆角 14 / 贴左缘；行间 12px、标题下留 20px；`.subpage-title` 32px / 550 / 左对齐卡片；`-webkit-font-smoothing: antialiased` |
| 分组标题 | `.section-label` 14px / 600 / 卡片上方 10px / `padding: 0 4px`（设置页为 0） |
| 列表行 | `.list-row` `min-height:64px`、`padding:16px`、`gap:14px`；紧凑行 `--row-h:52px` |
| 行内文字/图标 | `.list-title` 17px / 500；`.list-subtitle` 13px（上边距 3px）；`.list-icon` 22×22；`.list-trailing` 13px |
| 底栏 | `.h-16`（64px）+ 22px 图标 + 11px 标签；选中 `strokeWidth:2.6`，无顶部横杠 |
| 小控件 | `--tap-sm:34px`、`--chip-h:26px`、`--avatar:38px`；外扩热区到 48px 后再用于主操作 |
| 圆角 | 卡片 `.card` / `.list-card` 18px（主题卡 20px）；浮层选单 20px；主按钮 18px；分段/菜单项 14px、主题三按钮 15px；`.subpage-back` 14px；`--radius-card-lg` 28px |
| 独立三按钮 | 主题页 `grid-cols-3 gap-2.5` / 48px / 15px / 15px 字重 500；选中实底 `#2C2C2E` + 柔白字 `#F5F5F7`（浅色白+微阴影），未选透明 + 1px `rgba(255,255,255,.14)`（浅色 `rgba(0,0,0,.12)`）+ 字 `#A1A1AA`（浅色 `#52525B`） |
| 开关 | `.switch-track` 50×28 全圆角 + `.switch-thumb` 20px 圆点四周留 4px（开启右移 22px），关闭 `--switch-off`、开启 `--accent`，220ms 位移动画 |
| 调色盘入口 | 主题卡内的 `.theme-color-reveal` 随 Monet 开关手风琴展开：`grid-template-rows 0fr↔1fr` + opacity + `translateY(-4px)`，240ms Emphasized；收起时整行不占位、不响应点击，行间仍纯留白无分割线 |
| 调色盘 | 底部抽屉 `rounded-t-2xl`；顶部 44px 棋盘格预览条（`.theme-alpha-checker`，两档中性灰平铺，禁渐变）；色板 6 行 × 5 列 40px 平涂色块（`.theme-swatch`，选中 `ring-2 ring-fg`，按压 `scale(0.95)`）；透明度用原生 range（`.theme-alpha-range`，轨道从透明到实色、24px 白滑块、`touch-action:none` 防滚动穿透），取消/保存按钮 44px；保存即写盘并自动开启微染 |
| 分隔 | 卡内多行靠留白，禁止 `divide-y` / 横线；卡片只留 `border-top: 1px solid var(--card-top)`（OLED 3% 白） |

矮视口（`@media (max-height: 660px) and (orientation: portrait)`）：`--slot-h` / `--slot-avatar-w: 44px`、`--slot-gap: 3px`、`--ban-max: 32px`、`--act-h: 34px`、`--draft-pt: 4px`、`--draft-pb: max(4px, env(safe-area-inset-bottom, 0px))`、`--draft-gap: 4px`；仅竖屏生效，横屏走双栏弹性高度。

## 4. 物理动效与退场词典

| 场景 | 类 / 动画 | 参数 |
| --- | --- | --- |
| 二级子页推入 | `.animate-subpage-in` / `subpage-in` | 260ms `cubic-bezier(0.22, 1, 0.36, 1)`；底层 `.settings-underlay` `translate3d(-22px,0,0)` 同曲线；遮罩 `bg-black/45` 压暗 |
| 一级切页 | `.animate-page-in-next` / `-prev` | 200ms `cubic-bezier(0.22, 0.8, 0.3, 1)` |
| 锚定浮层展开 | `lang-menu-up-in` / `down-in` | 280ms `cubic-bezier(0.22, 1, 0.36, 1)`；`clip-path: inset(68% 0 0 0 round 20px)` 方向性揭幕；scale `0.86 → 1.015 → 1` 微回弹；`transform-origin: 85% 100% / 85% 0%` |
| 锚定浮层收起 | `lang-menu-up-out` / `down-out` | 170ms `cubic-bezier(0.4, 0, 1, 1)`，scale 至 0.88；遮罩 `lang-scrim-in` 220ms ease-out / `lang-scrim-out` 170ms ease-in |
| 主题色手风琴 | `.theme-color-reveal` | 240ms `cubic-bezier(0.22, 1, 0.36, 1)`；`grid-template-rows 0fr→1fr` + opacity 0→1 + `translateY(-4px)→0`；`pointer-events` 随开合切换 |
| 调色盘进场 | `theme-color-in` / `theme-color-scrim-in` | 300ms `cubic-bezier(0.22, 1, 0.36, 1)`；`translateY(44px) scale(0.94)` → 72% 越过目标 `translateY(-4px) scale(1.008)` → 稳落 0/1；`transform-origin: bottom center`；遮罩 220ms ease-in |
| 调色盘退场 | `theme-color-out` / `theme-color-scrim-out` | 185ms `cubic-bezier(0.4, 0, 1, 1)`，`translateY(32px) scale(0.95)` + opacity→0；遮罩 185ms ease-in；双态挂载用 190ms 定时器播完再卸载，`finished` 幂等防双触发 |
| 浮层投影 | 外层容器 `filter: var(--menu-filter)` | `drop-shadow(0 12px 28px rgb(0 0 0 / 0.45))`；投影放外层防 `clip-path` 裁切 |
| 按压态 | `active:bg-white/[0.06]`、`button.list-row:active` | 140ms ease；浅色走 `--c-press / 0.45`；移动端禁用粘滞 `hover:` |
| M3 节奏换算 | Emphasized | 进场 400ms 减速、退场 200ms 加速、原地 500ms；本项目原生场景压缩到 260–280ms / 170ms，保持「快出缓停 + 微回弹」比例 |
| 妙手特效 | `brilliant-sweep` 900ms、`brilliant-ring` 850ms、`brilliant-flash` 520ms | 只用于 `!!` 联动，不迁移到普通卡片 |
| 降级 | `@media (prefers-reduced-motion: reduce)` | 上述动画统一 `animation: none !important`，仅保留静态描边 |

**退场硬规则**：浮层/子页必须先播完反向动画再卸载 DOM；语言选单关闭用 180ms 定时器（> 170ms 退场），调色盘用 190ms（> 185ms），子页用 `SWIPE_BACK_MS` 定时器；`commitClose` 加 `finished` 幂等保护，避免返回键与跟手手势双触发。调色盘的 Escape 在 `document` 捕获阶段拦下，不让 App 的 window 监听抢先卸载；关闭 Monet 时用 `monetEnabled` 下降沿一并收起调色盘。

## 5. 手势仲裁、返回栈与类原生工程底线

- 视口与安全区：`viewport-fit=cover`；`.safe-top` / `.safe-bottom` / `.safe-top-banner` 吃 `env(safe-area-inset-*)`；`--draft-pb: max(8px, env(safe-area-inset-bottom, 0px))`；有底栏时 `.has-bottom-nav` 不再重复垫高。
- 顶部渐隐：`.page-veil` 高度 `calc(env(safe-area-inset-top) + 24px)`，`--c-app` 42% → 72% 透明 → 100% 全透，列表上滑时不压状态栏文字。
- 浏览器杂质：`body overflow:hidden` + `overscroll-behavior:none`，滚动容器 `overscroll-contain`；全局隐藏滚动条；非 `input/textarea` 禁选字；`-webkit-tap-highlight-color:transparent`；`button touch-action:manipulation`；`input font-size:16px` 防聚焦缩放；`.h-dvh` 回退 `100vh`。
- 手势优先级栈：浮层 → 弹窗/抽屉 → 二级子页 → 顶层 Tab → 系统边缘返回。返回键 / `Esc` 严格按此顺序消费，一次性只消费一层。
- 跟手侧滑：`useSwipeBack` 1:1 跟手位移，松手越过 30% 屏宽即提交返回；子页 `touch-action: pan-y`；未达标回弹复位，不卸载。
- 4-Tab 左右滑动的 5 条禁用条件：① BP 选人态 ② 任意弹窗/浮层 ③ 二级子页打开 ④ 屏幕左右 28px 系统边缘区 ⑤ 横滑子容器或输入焦点内。`MAIN_TABS` 顺序 `draft → history → settings → about` 即滑动顺序，禁止另立副本。
- 触觉反馈（预留，不接入依赖）：后续若引入 `@capacitor/haptics`，`npm install @capacitor/haptics && npx cap sync`；`impact(Light)` 用于开关/分段/语言选中，`impact(Medium)` 用于 BP 选人/Ban，`notification(Success|Error)` 用于拉取结果，滚动与纯动画不震动；无 Taptic/Vibrator 设备静默降级。

## 6. 反模式黑名单（AI 禁令）

1. 中文标题用 `font-bold` / `font-black`；只允许 `font-medium`（覆盖 `.page-title` 的 600）。
2. 硬编码 `sky-*` / `cyan-*` / `blue-*` 等 Tailwind 色阶；一律走语义 Token。
3. 露出滚动条、允许页面级橡皮筋；滚动容器必须 `no-scrollbar` + `overscroll-contain`。
4. 卡片加高对比描边、卡内 `divide-y`、渐变、内高光、多层阴影；层级只靠明度差。
5. 悬浮选单选中项加彩色胶囊底块；只允许中性文字 + `✓` 变色。
6. 纯 `opacity` 敷衍弹窗；必须有方向性揭幕 + 微过冲 + 外层投影。
7. 无微染时大面积高饱和填充；蓝色只作小面积焦点。
8. 只写 `hover:` 反馈或 APNG/GIF 动效替代按压态；移动端只认 `active:`。
9. 抢占 28px 系统边缘手势、在横滑子容器里嵌套 Tab 滑动。
10. 退场动画未播完就卸载 DOM，或忽略 `prefers-reduced-motion`。
11. UI 文案暴露算法、网络链路、超时/重试等内部实现（见项目长期文案规范）。

## 7. 组件开发检查清单与代码参考锚点

| # | 自检项 | 通过标准 |
| --- | --- | --- |
| 1 | 色彩 | 黑白灰（深/浅无微染都严格单色，浅色分组 `#6E6E73` / 图标 `#1C1C1E` / 底栏选中 `#111113`）+ 小面积焦点蓝；微染底板 5%、卡片深 9%/浅 6%；业务语义色未改 |
| 2 | 尺寸 | 标题 30/28、分组 14、主字 17、副字 13、图标 22、卡片 18、浮层 20；主操作热区 ≥ 48px |
| 3 | 动效 | 使用既有类名/动画名；浮层展开 280ms、收起 170ms、子页 260ms、调色盘进 300ms/退 185ms、手风琴 240ms；退场播完再卸载 |
| 4 | 手势 | 返回栈顺序正确；28px 边缘与 5 条禁用条件生效；无 duplicated `MAIN_TABS` |
| 5 | 文案与降级 | 面向玩家的一句话结论；减少动态效果下无动画；未触碰冻结文件 |

代码锚点：列表分组/选单/二级子页样板 `src/components/SettingsView.tsx`；四 Tab 与选中态样板 `src/components/BottomNav.tsx`；全部 Token、工具类、动画与降级规则 `src/index.css`；动画曲线与时长定义 `tailwind.config.js`。

新增视觉状态必须先补 Token 与本文对应条目，再改组件；禁止在组件里留一次性色值或时长。
