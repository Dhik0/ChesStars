# 复盘音效（可选，只有 `!!` 一档）

复盘里**只有 `!!`（妙手）会出声**，其余评级只有视觉弹出动画。所以这里只需要一个文件：

| 文件名 | 对应评级 | 含义 |
| --- | --- | --- |
| `brilliant.mp3` | `!!` | 妙手 / 逆天改命 |

扩展名也支持 `ogg` / `wav`（同名只保留一个）。放进去重新构建即可生效，代码不需要改动。

**目录为空也能正常工作**：构建时用 `import.meta.glob` 静态扫描，没有文件就自动使用
Web Audio 合成的 `!!` 音色（明亮上升大三和弦琶音 + 高频闪烁），不会产生任何 404 请求。

## 推荐素材

Supercell 官方 Fan Kit 里的 `brawl_hypercharge_01`（转换为 `mp3` 后命名为 `brilliant.mp3`）。

- Fan Kit：<https://supercell.com/en/fan-kit/>
- 使用时请遵守 Supercell 的 Fan Content Policy；本仓库不附带任何官方音频文件。
