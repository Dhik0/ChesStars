# 乱斗BP助手（brawl-draft-app）

《荒野乱斗》排位赛实时 BP（禁用/选人）决策辅助 App，针对**安卓系统自由小窗 / 悬浮小窗**（窄至 320×520，极限 280×480）设计，离线秒开、支持远程 JSON 热更新。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Vite 5 + React 18 + TypeScript（`strict: true`） |
| 样式 | Tailwind CSS 3.4（深色电竞主题，无重型 UI 库） |
| 图标 / 测试 | `lucide-react` / `vitest` |
| 打包 | `@capacitor/core` + `@capacitor/cli` + `@capacitor/android`（无第三方原生插件） |

## 数据 Schema 实测结论（重要）

`public/data/brawl_meta.json`（Schema v2，约 685 KB，108 英雄 / 24 地图 / 6 模式）的真实结构**与最初需求文档存在三处差异**，代码以实测结构为准：

1. **1v1 克制矩阵不在 mode 顶层**，而是嵌在 `modes[].brawlers[].matchups[]` 内，以 `opponent_id` 指向对手：
   ```jsonc
   "modes": [{ "mode": "bounty", "total_games": 612,
     "brawlers": [{ "id": 16000043, "name": "EDGAR", "smoothed_wr": 0.5848,
       "matchups": [{ "opponent_id": 16000003, "games": 29, "smoothed_wr": 0.6564 }] }] }]
   ```
   因此 `src/data/metaIndex.ts` 会把它展平成 `Map<mode, Map<selfId, Map<oppId, wr>>>` 做 O(1) 查询。矩阵实测**完全对称**（816 条边，反向边全部存在，A 打 B + B 打 A ≈ 1）。

2. **`brawlers` 是数组而非字典**；`roles[].brawler_ids` 实测为**空数组**，角色归属只能靠 `roles[].brawlers` 的英文名匹配。且 roles 写 `"Larry & Laurie"`、字典写 `"LARRY & LAWRIE"`，已用 `ROLE_NAME_ALIAS` 修正。

3. **地图层只覆盖 63~89 名英雄，模式层覆盖 94~106 名**，所以推荐候选集以「当前地图的 brawlers」为准；地图层字段为 `score`(0~100，该图第一名为 100)、`smoothed_wr`、`use_rate`、`games`、`pick_order`(`FIRST`/`MIDDLE`/`LAST`)。

## 目录结构

```
brawl-draft-app/
├── public/data/brawl_meta.json     # 内置兜底数据（随包分发）
├── src/
│   ├── types/meta.ts               # 严格按真实 JSON 定义的类型 + 运行时校验 validateMeta
│   ├── data/
│   │   ├── localization.ts         # 108 英雄中文名/拼音首字母/别名、24 地图、6 模式
│   │   └── metaIndex.ts            # 运行时索引（对位矩阵、角色归属、地图统计）
│   ├── services/metaStore.ts       # 缓存优先 + 内置兜底 + 远程热更新（SWR）
│   ├── utils/
│   │   ├── draftEngine.ts          # 纯函数算分引擎（Ban/Pick/克制/阵容预警/顺位）
│   │   └── draftEngine.test.ts     # 45 项单测，直接跑真实 JSON 端到端
│   ├── components/                 # TopBar / MapPicker / BrawlerRow / BrawlerDetail / DraftBar / SettingsSheet / Avatar
│   └── App.tsx
├── scripts/verify-ui.mjs           # Playwright 小窗交互回归脚本
├── capacitor.config.ts
└── android/                        # Capacitor 生成的 Android 工程
```

## 常用命令

```bash
npm install
npm run dev          # 本地开发（默认 http://localhost:5173）
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run build        # 类型检查 + 生产构建到 dist/
npm run cap:sync     # 构建并同步到 android/
```

三项验收命令（每次改动后应全绿）：

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

UI 回归（需先 `npm run build` 并启动 `npx vite preview --port 4173`）：

```bash
node scripts/verify-ui.mjs   # 输出截图到 shots/，并检查横向溢出与控制台错误
```

## 数据热更新

- **读取顺序**：`localStorage` 缓存 → 内置 `./data/brawl_meta.json` → 后台静默拉取远程。
- **默认远程地址**：
  ```
  https://cdn.jsdelivr.net/gh/Dhik0/-brawl-draft-core-@main/dist/brawl_meta.json
  ```
  可在 App 内「设置」中修改并保存；支持「立即拉取最新数据」与「清除本地缓存（回退内置数据）」。
- **超时策略**：启动静默检查 5 秒超时即放弃，绝不阻塞界面；手动拉取 15 秒。
- **更新判定**：仅当远程 `updated_at` 比本地新才替换，避免回滚到旧数据。
- 断网时使用缓存或内置数据，零延迟打开；头像加载失败自动降级为「按 ID 确定性配色 + 首字」色块。

## 算分引擎说明（可解释，无黑盒）

**Ban 分** = 地图强度 `score`×60% + 归一化热度×25% + `pick_order === "FIRST"`×15%（满分 100）。

**Pick 动态分**（0~100）三项加权后归一化，再叠加顺位修正：

| 项 | 权重 | 说明 |
| --- | --- | --- |
| 基础地图强度 | 50% | 直接取该图 `score` |
| 对位克制 | 35% × (已亮牌数/3)，后手位 ×1.35 | 对敌方每名英雄查 `smoothed_wr`，无样本按 0.50；`delta = avg - 0.5`，±0.15 映射为满格 0/100 |
| 阵容结构 | 15% | 补前排 / 补射程 / 补刺客 / 补输出 / 避免定位重复 |

- 克制标签：`>= 0.54` 标绿「克制 布洛克 66%」，`<= 0.46` 标红「怕 佩佩 41%」，取偏离度最大的两条。
- 阵容预警：双脆皮无坦克 →「缺少前排承伤」；双近战 →「手短易被风筝」；敌方有投掷且我方无刺客 →「建议补刺客切后排」。
- 顺位：第 1-2 手为先手位（`FIRST` 加分 / `LAST` 提示易被针对），第 5-6 手为后手C位（放大克制系数、`LAST` 加分）。
- **敌方槽位**录入时排序改为「地图强度 70% + 热度 30%」，便于快速点选敌方可能选的英雄；标签显示「克制我方 X」；切回己方槽位立即恢复我方视角。

详情面板会把三项权重折算成合计 100% 并展示每项贡献分，逐条列出加减分理由与对位明细，保证「总分 = 三项贡献 + 顺位修正」。

## 职业分类（一级标签，单选）

数据自带的 `roles` 表把「破墙」这类**能力**和「坦克/火力手」这类**职业**混在一起，不能直接用。
职业改为取自 `api.brawlapi.com` 的官方 `class` 字段，实现在 `src/data/brawlerProfile.ts`。

| 职业 | 数量 | 说明 |
| --- | --- | --- |
| 坦克 Tank | 16 | 高血量近战，开团吃伤害 |
| 火力手 Damage Dealer | 22 | 中近距离持续/爆发输出 |
| 狙击手 Marksman | 11 | 超远射程单点压制 |
| 投手 Artillery | 7 | 越墙投掷，压制掩体 |
| 刺客 Assassin | 19 | 突进秒后排 |
| 控场 Controller | 21 | 减速/眩晕/分割战场 |
| 辅助 Support | 13 | 治疗/增益/召唤 |

108 个英雄**全部覆盖**，无兜底值。

**官方分类有时反直觉，但以官方为准**：杰西 = 控场（不是召唤）、妮塔 = 火力手、塔拉 = 火力手、
格里夫 = 控场、阿博 = 控场。「召唤」「破墙」「位移」都是能力，不属于任何职业。

**UI 上的体现**

- 列表行：职业用职业主题色的实心标签。
- 详情面板：职业显示在名字右侧。
- 筛选栏分两段（竖线分隔）：`全部 / 先手 / C位` ｜ `7 个职业`。
- 引擎的阵容判断也走这套体系：`damage` 计入「火力手 + 狙击手」（都需前排保护的远程脆皮），
  `melee` 计入「坦克 + 刺客」，敌方有投手且我方无刺客时提示「建议补刺客切后排」。

**维护方式**：直接改 `src/data/brawlerProfile.ts` 的 `BRAWLER_CLASS`，
key 规则同英雄名（小写去符号，数字开头要加引号如 `'8bit'`）。

## 安卓打包（Windows PowerShell）

### 前置环境

1. **JDK 17**（Capacitor 6 / Gradle 8.2.1 的硬性要求，**不要用 JDK 21/22**）
   ```powershell
   winget install --id EclipseAdoptium.Temurin.17.JDK
   # 验证（应显示 17.x）
   java -version
   ```
2. **Android SDK**（装 Android Studio 最省事，或只装 Command-line Tools）
   - Android Studio → SDK Manager → 勾选 **Android SDK Platform 34**、**Android SDK Build-Tools 34.x**、**Android SDK Platform-Tools**
   - 设置环境变量：
   ```powershell
   setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
   setx ANDROID_SDK_ROOT "$env:LOCALAPPDATA\Android\Sdk"
   setx PATH "$env:PATH;$env:LOCALAPPDATA\Android\Sdk\platform-tools"
   ```
   - **关掉并重开 PowerShell**，再验证：`adb version`

### 发版前必改：版本号

APK 的版本号**不在 `package.json`**（那个只给 npm 用），而在 `android/app/build.gradle`：

```gradle
defaultConfig {
    versionCode 2              // 每次发版必须 +1，否则无法覆盖安装
    versionName "1.0"             // 系统「应用信息」页显示的版本
}
```

改完重新 `.\gradlew.bat assembleDebug` 才会生效。App 内「设置」页底部的版本文案在
`src/components/SettingsSheet.tsx`，需要同步改。

### 构建 Debug APK
```powershell
cd D:\brawl-draft-app

# 1) 构建 Web 产物并同步进 Android 工程
npm run build
npx cap sync android

# 2) 编译 Debug APK
cd android
.\gradlew.bat assembleDebug

# 3) 产物位置
#    android\app\build\outputs\apk\debug\app-debug.apk
```

安装到手机（USB 调试已开启）：

```powershell
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
```

### 构建签名 Release APK

```powershell
# 1) 生成签名密钥（只需一次，务必保存好 keystore 与密码）
keytool -genkeypair -v -keystore brawldraft-release.keystore `
  -alias brawldraft -keyalg RSA -keysize 2048 -validity 10000 `
  -storetype PKCS12

# 2) 在 android\ 目录下创建 keystore.properties（不要提交到 git）
#    storeFile=../brawldraft-release.keystore
#    storePassword=你的密码
#    keyAlias=brawldraft
#    keyPassword=你的密码

# 3) 在 android\app\build.gradle 的 android{} 中加入签名配置
#    def keystorePropertiesFile = rootProject.file("keystore.properties")
#    def keystoreProperties = new Properties()
#    if (keystorePropertiesFile.exists()) {
#        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
#    }
#    signingConfigs {
#        release {
#            storeFile file(keystoreProperties['storeFile'])
#            storePassword keystoreProperties['storePassword']
#            keyAlias keystoreProperties['keyAlias']
#            keyPassword keystoreProperties['keyPassword']
#        }
#    }
#    buildTypes { release { signingConfig signingConfigs.release } }

# 4) 打包
cd android
.\gradlew.bat assembleRelease
# 产物：android\app\build\outputs\apk\release\app-release.apk
```

> 若本机没有 Android SDK，`npx cap add android` / `npx cap sync android` 仍可正常执行，
> 只是无法在本机 `gradlew` 编译；把 `android/` 目录连同 `dist/` 一起拷到装有 SDK 的机器即可构建。

### 小窗使用

- 已在 `AndroidManifest.xml` 中为 `MainActivity` 声明 `android:resizeableActivity="true"` 与
  `android:windowSoftInputMode="adjustResize"`，支持系统分屏、自由窗口、悬浮小窗，以及窗口尺寸变化时
  不重建 Activity（`configChanges` 已含 `screenSize|smallestScreenSize|screenLayout|uiMode`）。
- 根容器使用 `height: 100vh` + `100dvh` 双写回退，小窗高度变化时布局自动跟随；页面级横向滚动已彻底禁用，
  只有中部推荐列表可纵向滚动。

## 常见问题排查

| 现象 | 原因与处理 |
| --- | --- |
| `Unsupported class file major version 65/66` | JDK 版本过高。Capacitor 6 的 Gradle 8.2.1 需要 **JDK 17**，切换 `JAVA_HOME` 后重开终端 |
| `SDK location not found` | `ANDROID_HOME` 未生效。设置后**必须重开 PowerShell**；或在 `android/local.properties` 写 `sdk.dir=C\:\\Users\\你\\AppData\\Local\\Android\\Sdk` |
| Gradle 首次构建卡在下载 | 配国内镜像：在 `android/build.gradle` 的 `repositories` 中把 `maven { url 'https://maven.aliyun.com/repository/google' }` 放到 `google()` 之前 |
| App 打开白屏 | 确认 `vite.config.ts` 的 `base` 为 `'./'`；确认 `npm run build` 后再 `npx cap sync android`；用 `chrome://inspect` 连 WebView 看控制台 |
| 头像全是色块 | 断网或 Brawlify CDN 不可达。这是**预期的兜底行为**（确定性配色 + 首字），不影响算分 |
| 数据一直是旧版本 | 远程地址填错 / CORS 被拦 / `updated_at` 未变新。设置里点「立即拉取最新数据」看具体报错 |
| 小窗下底部槽位被裁 | 已做弹性尺寸（`flex-1` + `aspect-square` + `max-w-[46px]`），280px 下槽位约 41px、320px 下 46px。若自定义更窄，请检查是否引入了额外 padding |
| 键盘弹出遮挡搜索框 | 已设 `adjustResize`；若仍异常，确认未在 manifest 覆盖为 `adjustPan` |
| `cap sync` 后代码没更新 | `cap sync` 只拷贝 `dist/`，改动后必须先 `npm run build` |

## 已知限制

- 数据来自第三方统计（`min_tier: 20`，总计 5,746 场），样本量小的对位已由后端做贝叶斯平滑；
  引擎对无样本对位按中性 0.50 计入并在详情面板标注「无样本」。
- 角色标签依赖 `roles` 表，部分新英雄（如 `MAX`）未收录角色，列表会退化为显示热度。

> 以上关于「角色标签」的限制已通过独立的职业/能力体系解决，见下一节。
- 未引入任何原生插件，因此没有推送、后台保活等能力；小窗场景下系统可能随时回收进程，重进会重新加载（有缓存，仍可秒开）。
