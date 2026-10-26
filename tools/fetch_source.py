"""下载奶蛙官网首页的公开演示视频和封面，供 tools/build_assets.py 使用。

用法：
    python tools/fetch_source.py
    python tools/fetch_source.py --force   # 已存在时也重新下载

官网地址：https://milkyfrog.com/
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import urllib.request
from pathlib import Path

BASE = "https://milkyfrog.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
)

# (官网路径, 本地文件名, 最小体积)
FILES = [
    ("/assets/mf-stream-90303387e2.mp4", "milky-frog.mp4", 500_000),
    ("/assets/mf-poster-a73129b5.jpg", "milky-frog-poster.jpg", 5_000),
]


def download(url: str, dest: Path, min_size: int) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": UA, "Referer": BASE + "/"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    if len(data) < min_size:
        raise RuntimeError(
            f"下载内容只有 {len(data)} bytes，可能被拦截或官网改版：{url}"
        )
    if dest.suffix == ".mp4" and data[4:8] != b"ftyp":
        raise RuntimeError(f"下载到的不是有效 MP4：{url}")
    dest.write_bytes(data)
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="下载奶蛙官方演示素材")
    parser.add_argument("--force", action="store_true", help="已存在也重新下载")
    args = parser.parse_args()

    dest_dir = Path(__file__).resolve().parent.parent / "assets" / "source"
    dest_dir.mkdir(parents=True, exist_ok=True)

    for remote_path, name, min_size in FILES:
        dest = dest_dir / name
        if dest.exists() and not args.force:
            print(f"skip  {name}（已存在）")
            continue
        print(f"fetch {name} ...")
        try:
            data = download(BASE + remote_path, dest, min_size)
        except Exception as exc:  # noqa: BLE001
            sys.exit(
                f"\n下载失败：{exc}\n\n"
                f"手动方式：打开 {BASE}/ ，把首页的演示视频另存为\n"
                f"  {dest}\n"
                "封面可选；然后再运行 tools/build_assets.py。"
            )
        digest = hashlib.sha256(data).hexdigest()[:16]
        print(f"      {len(data) / 1024:.0f} KB  sha256:{digest}")

    print("\ndone. 下一步：python tools/build_assets.py")


if __name__ == "__main__":
    main()
