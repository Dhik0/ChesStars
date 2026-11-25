[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md)

<div align="center">

# ChesStars

**輕量、100% 離線的《荒野亂鬥》排位 BP 助手，以 3v3 迴歸與對稱剋制模型為核心。**

[![GitHub Release](https://img.shields.io/github/v/release/Dhik0/ChesStars?style=flat-square&color=2ea44f)](https://github.com/Dhik0/ChesStars/releases/latest)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%205.1%2B-3DDC84?style=flat-square&logo=android&logoColor=white)](https://github.com/Dhik0/ChesStars/releases/latest)

</div>

> ### 📱 iOS 與 Web 版開發中
> Web / PWA 版本（支援 iPhone、iPad 與桌面瀏覽器）正在開發中。
> **現在就想在 iOS 上使用？** 加入 [Discord](https://discord.gg/RXM7E5e4U)，上線當天會第一時間通知你。

## 為什麼選 ChesStars

排位 BP 每個禁用位、每個選擇位只有大約二十秒。ChesStars 就是為這二十秒而做，不是賽後才翻資料的工具。

### 對稱剋制引擎

多數 BP 工具只按英雄熱度排序。ChesStars 看的是**雙方**：你每填入一個禁用或選擇，推薦就會重新計算，既算你能剋制誰，也算誰已經在剋制你。候選英雄依**綜合推薦得分**排序——一個「現在這個位置該不該拿」的單一結論，而不是勝率。

### 100% 離線 · 零追蹤

整套推薦邏輯都在你的手機本機執行，資料隨安裝檔一併提供。

- 不需要帳號、不需要登入、不需要填玩家 Tag、不需要綁定 Supercell 帳號。
- 沒有統計追蹤、沒有廣告、沒有遙測，你選了什麼不會離開這支手機。
- 飛航模式、捷運上、訊號只剩一格的等待時間，照樣能用。
- 它是獨立的輔助工具，不會接觸你的遊戲客戶端與遊戲帳號。

唯一可選的連網動作是檢查是否有新版本；不檢查，App 就完全離線。

### 快、順手

一個介面，一隻手。點格子填入，長按看詳情，選錯了直接復原。沒有新手引導，沒有初始化流程，一分鐘內就能開始 BP。

### 多語言

內建 **English**、**简体中文**、**繁體中文**，首次啟動會跟隨系統語言。

## 介面預覽

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/draft-board-en.png" width="230" alt="禁用與選擇面板" /><br />
      <sub>BP 面板</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/worlds-grand-final.png" width="330" alt="世界大賽決賽現場，安全區域，比分 3-3" /><br />
      <sub>世界大賽決賽現場，安全區域</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/worlds-penny-pick.png" width="330" alt="現場大螢幕公布最後一手潘妮" /><br />
      <sub>第 6 手現場公布潘妮</sub>
    </td>
  </tr>
</table>

> **以真實世界賽對局驗證過。** 左側面板重現的是世界大賽決賽這一局的 BP——安全區域，藍方，第 6 手。引擎給這一手的候選裡就有潘妮，而現場第 6 手喊出的也正是潘妮。

## 下載與安裝

### Android

**[⬇ 下載最新版 APK](https://github.com/Dhik0/ChesStars/releases/latest)**

1. 在 Releases 頁面下載 `ChesStars-vX.X.X.apk`。
2. 直接開啟安裝檔。系統會提示「允許來自此來源的應用程式」——非應用程式商店安裝都會出現這個提示，屬正常現象。
3. 安裝後開啟即可開始 BP，無需註冊或登入。

支援 Android 5.1 以上。App 內可以檢查新版本，不必每次都回來找下載頁。

### iOS / Web —— 即將推出（PWA）

Web / PWA 版本正在開發，完成後可在 iPhone、iPad 與桌面瀏覽器上使用。在此之前，歡迎[加入 Discord](https://discord.gg/RXM7E5e4U)，上線時會收到通知。

## 社群與回饋

- **Discord** —— [加入伺服器](https://discord.gg/RXM7E5e4U)：排位 BP 建議、問題回報、翻譯協作。
- **Issues** —— [提交 Issue](https://github.com/Dhik0/ChesStars/issues)：程式錯誤與功能建議。
- **翻譯** —— 介面文案是獨立的 JSON 語言檔。想讓 App 支援你的語言？開個 Issue 認領即可，改動範圍很小。

## 授權

本專案以 **GNU GPLv3** 授權釋出，全文見 [LICENSE](LICENSE)。你可以自由使用、研究、分享與修改；若散佈修改後的版本，必須沿用同一授權並公開對應原始碼。

《荒野亂鬥》及相關素材、商標皆屬 Supercell 所有。ChesStars 為**非官方粉絲內容**，與 Supercell 並無隸屬關係，亦未獲其認可或贊助，依 [Supercell 粉絲內容政策](https://www.supercell.com/fan-content-policy) 使用。GPL 僅涵蓋本專案自身的原始碼，不涵蓋 Supercell 的素材。
