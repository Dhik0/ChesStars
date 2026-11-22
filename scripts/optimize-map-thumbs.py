#!/usr/bin/env python3
"""把 public/maps/*.png 缩到缩略图尺寸并做调色板压缩。

官方地图原图是 690x1050 / 932x1463，卡片里最大也只显示到 ~150px 宽，
直接打包会让 APK 里白白多出 ~1.2MB。这里统一压到宽 300（2x DPR 够用）
并按 256 色调色板重新量化——地图是平涂像素风，量化后肉眼几乎无差别。

用法：python scripts/optimize-map-thumbs.py [--width 300]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / "public" / "maps"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=300)
    args = ap.parse_args()

    files = sorted(p for p in MAPS.glob("*.png"))
    if not files:
        raise SystemExit("public/maps 下没有 png")

    before = after = 0
    rows = []
    for p in files:
        before += p.stat().st_size
        im = Image.open(p).convert("RGBA")
        w, h = im.size
        if w > args.width:
            nh = round(h * args.width / w)
            im = im.resize((args.width, nh), Image.LANCZOS)
        # 地图是满铺不透明的，去掉 alpha 才能走 MEDIANCUT 量化
        im = im.convert("RGB").quantize(colors=256, method=Image.MEDIANCUT, dither=Image.NONE)
        im.save(p, format="PNG", optimize=True)
        size = p.stat().st_size
        after += size
        rows.append((p.name, f"{w}x{h}", f"{im.size[0]}x{im.size[1]}", size))

    for name, src, dst, size in rows:
        print(f"  {name:34} {src:>10} -> {dst:>9} {size / 1024:6.1f}KB")
    print(f"\n合计 {before / 1024:.0f}KB -> {after / 1024:.0f}KB（省 {100 - after * 100 / before:.0f}%）")

    # 同步 manifest 里的尺寸/体积，避免文档与实际文件对不上
    mf = MAPS / "manifest.json"
    if mf.exists():
        data = json.loads(mf.read_text(encoding="utf-8"))
        by_slug = {r["slug"]: r for r in data.get("maps", [])}
        for p in files:
            rec = by_slug.get(p.stem)
            if not rec:
                continue
            with Image.open(p) as im:
                rec["width"], rec["height"] = im.size
            rec["bytes"] = p.stat().st_size
        data["optimized_width"] = args.width
        mf.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("manifest.json 已同步尺寸")


if __name__ == "__main__":
    main()
