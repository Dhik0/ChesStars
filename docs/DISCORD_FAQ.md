# ChesStars · Discord `#faq`

> 维护说明（不要粘贴）：每两个 `---` 之间是一段**可直接复制到 Discord 的消息**，都控制在
> 2000 字符以内。前三条英文、后三条中文，内容一一对应；改文案时两边一起改。
> 频道里建议按「英文三条置顶 + 中文三条置顶」的顺序排列。

---

**ChesStars · FAQ — Web / PWA: updates & cache**

**Getting a new version**
The web app checks for a new build a few seconds after launch. When one is out, a thin bar appears at the top of the screen: **New version vX.X.X — Update now**. Tap it to reload into the new build. It never reloads on its own, so a draft in progress is never interrupted.
You can also check manually: **Settings → Check for updates**.

**Still seeing an old screen or old data?**
The app version and the match data update separately — check the data date in Settings first.

- Desktop: hard reload with `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac).
- iPhone / iPad (added to home screen): close it from the app switcher and reopen. Still stuck? Settings → Safari → Advanced → Website Data → delete `chesstars.pages.dev`.
- Android Chrome: ⋮ → Settings → Site settings → All sites → `chesstars.pages.dev` → Clear & reset.
- Then open **Settings → Update data now** to pull the latest dataset.

**Why the banner matters**
Updates are handed over by a service worker. If a very old copy is cached, the banner is the fastest way onto the current build — no reinstall, no data loss.

---

**ChesStars · 常见问题 — 网页版 / PWA：更新与缓存**

**怎么拿到新版本**
网页版启动几秒后会在后台检查新构建。有新版本时，页面顶部会出现一条提示：**发现新版本 vX.X.X — 立即更新**，点一下就会刷新到新版本。它不会自己刷新，所以正在进行的 BP 不会被打断。
也可以手动检查：**设置 → 检查更新**。

**刷新后还是旧界面 / 旧数据？**
应用版本和对战数据是分开更新的，先看设置里的「数据日期」。

- 电脑：`Ctrl+Shift+R` 强制刷新（Mac 是 `Cmd+Shift+R`）。
- iPhone / iPad（已添加到主屏幕）：从多任务里划掉再重新打开；还不行就去 设置 → Safari → 高级 → 网站数据，删除 `chesstars.pages.dev`。
- 安卓 Chrome：⋮ → 设置 → 网站设置 → 所有网站 → `chesstars.pages.dev` → 清除并重置。
- 之后进 **设置 → 立即拉取最新数据** 拉一次最新数据集。

**为什么需要那条提示条**
更新是由 Service Worker 接管的。缓存里那份太旧时，提示条是最快的切换方式——不用重装，也不会丢数据。

---

**ChesStars · FAQ — Android APK: install errors**

**Download only from GitHub Releases**
https://github.com/Dhik0/ChesStars/releases/latest
The mirror links inside the app point to exactly the same file.

**Signatures**
Every release APK carries both **V1 (JAR)** and **V2 (APK Signature Scheme)** signatures, so it installs on Android 5.1 and newer, including Android 14 / 15.

**"Package contains no certificates" / "There was a problem parsing the package"**
This is almost always a damaged or renamed file, not a broken build.

- Chat apps (Telegram, WeChat, QQ) often save the APK as `ChesStars-v1.3.2.apk.1` or `.apk.zip`. Android only installs files ending in `.apk` — rename it back first.
- Re-download from the Releases page above, then open the file from the system **Files** app instead of tapping it inside the chat.
- Check that there is enough free storage, and allow "Install unknown apps" for the app you open it from.

**Upgrading**
Installing over an older version keeps your settings. Uninstalling first is only needed if you previously installed a build with a different signature (for example a debug build).

---

**ChesStars · 常见问题 — 安卓 APK：安装报错**

**只从 GitHub Releases 下载**
https://github.com/Dhik0/ChesStars/releases/latest
App 内提供的国内镜像下载的是同一个文件。

**签名**
每个正式包都带完整的 **V1（JAR）** 与 **V2（APK Signature Scheme）** 签名，Android 5.1 及以上（含 Android 14 / 15）都能正常安装。

**提示「未包含任何证书」/「解析软件包时出现问题」**
基本都不是包坏了，而是下载不完整或被改了名。

- Telegram / 微信 / QQ 这类聊天软件经常把 APK 存成 `ChesStars-v1.3.2.apk.1` 或 `.apk.zip`。安卓只认以 `.apk` 结尾的文件，先把名字改回去。
- 从上面的 Releases 页面重新下载，然后用系统自带的「文件管理」打开安装，不要在聊天窗口里直接点。
- 顺便确认手机剩余空间够用，并给「文件管理 / 浏览器」打开「安装未知应用」权限。

**覆盖升级**
直接覆盖安装会保留设置。只有之前装的是签名不同的包（比如 debug 包）时，才需要先卸载。

---

**ChesStars · FAQ — Data updates & handy features**

**Daily data**
The match dataset is rebuilt every day. On launch the app checks in the background and pulls a newer set automatically; **Settings → Update data now** forces a check and tells you exactly what happened (updated / already current / failed, with the reason). The data date is always shown in Settings.

**Works offline**
The dataset ships inside the app (and is cached for the web version), so drafting works with no connection at all. Only pulling new data needs the network.

**Maps grouped by mode**
The map picker groups maps by mode and starts with every group collapsed — tap a mode to expand it. Picking a map expands its group and starts the draft.

**Block the brawlers you don't play**
Mark brawlers as blocked from the brawler pool or the detail sheet. This only filters **your own pick recommendations** — ban suggestions and the full brawler list stay untouched. The list is stored on your device and never uploaded.

---

**ChesStars · 常见问题 — 数据更新与实用功能**

**每日数据**
对战数据每天重建一次。启动时 App 会在后台检查并自动拉取更新的数据；**设置 → 立即拉取最新数据** 会强制检查一次，并明确告诉你结果（已更新 / 已是最新 / 失败及原因）。数据日期一直显示在设置里。

**断网也能用**
数据集随 App 一起打包（网页版由 Service Worker 预缓存），完全断网也能正常 BP。只有拉取新数据需要联网。

**地图按模式折叠**
选图页按模式分组，默认全部折叠，点模式名展开。选中一张地图后，它所在的模式会自动展开并直接进入 BP。

**屏蔽不喜欢的英雄**
在英雄池的「已屏蔽」入口或英雄详情里标记。它**只影响你自己的选人推荐**——Ban 推荐和全英雄列表都不受影响。名单存在本机，不会上传。
