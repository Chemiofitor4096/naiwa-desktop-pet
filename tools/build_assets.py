"""奶蛙桌宠素材流水线。

从 milkyfrog.com 官方视频（assets/source）里裁出两段动作和一张待机帧，
逐帧 AI 抠图，统一裁剪后输出透明 WebM（含音轨）、GIF、待机 PNG、音效与图标。

用法（需要 rembg / numpy / pillow，建议 Python 3.13）：
    python tools/build_assets.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "source"
SRC = SOURCE / "milky-frog.mp4"
OUT = ROOT / "pet"
TMP = ROOT / "assets" / ".build"
FPS = 24

# 秒。laugh 结束在 5.85s——音轨在那里的句间停顿，收得干净。
SEGMENTS = {
    "laugh": (1.55, 4.30),
    "fall": (11.95, 5.50),
}
IDLE_TIME = 12.1


def run(cmd: list[str], **kw) -> None:
    print("+", " ".join(str(c) for c in cmd[:14]), "..." if len(cmd) > 14 else "")
    subprocess.run(cmd, check=True, **kw)


def extract_idle() -> Image.Image:
    p = TMP / "idle_src.png"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{IDLE_TIME:.3f}", "-i", str(SRC), "-frames:v", "1", str(p),
    ])
    return Image.open(p).convert("RGBA")


def extract_frames(name: str, start: float, dur: float) -> list[Path]:
    d = TMP / f"src_{name}"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{start:.3f}", "-i", str(SRC), "-t", f"{dur:.3f}",
        "-vf", f"fps={FPS}", "-q:v", "1", str(d / "f_%04d.png"),
    ])
    frames = sorted(d.glob("f_*.png"))
    print(f"  {name}: {len(frames)} frames")
    return frames


def matte(frames: list[Path], session) -> list[Path]:
    d = TMP / f"matte_{frames[0].parent.name}"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    out_paths = []
    for i, f in enumerate(frames):
        im = Image.open(f).convert("RGBA")
        cut = remove(im, session=session, alpha_matting=False)
        p = d / f.name
        cut.save(p)
        out_paths.append(p)
        if (i + 1) % 25 == 0:
            print(f"    matted {i + 1}/{len(frames)}")
    return out_paths


def union_bbox(paths: list[Path], extra: list[Path]) -> tuple[int, int, int, int]:
    x0 = y0 = 10**9
    x1 = y1 = -1
    for p in paths + extra:
        a = np.asarray(Image.open(p))[..., 3]
        ys, xs = np.where(a > 8)
        if len(xs) == 0:
            continue
        x0, y0 = min(x0, int(xs.min())), min(y0, int(ys.min()))
        x1, y1 = max(x1, int(xs.max())), max(y1, int(ys.max()))
    return x0, y0, x1, y1


def crop_to(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    return img.crop(box)


def main() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("找不到 ffmpeg，请先安装并加入 PATH。")
    if not SRC.exists():
        raise SystemExit(
            f"缺少源视频：{SRC}\n"
            "先运行 python tools/fetch_source.py，"
            "或手动把官网演示视频放到这个路径。"
        )

    OUT.mkdir(exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    # 0. 有缓存就跳过抽帧与抠图（编码调试时省几分钟）
    cache = TMP / "crop.json"
    cuts = {name: TMP / f"cut_{name}" for name in SEGMENTS}
    if (
        cache.exists()
        and all((d / "f_0001.png").exists() for d in cuts.values())
        and (OUT / "idle.png").exists()
    ):
        box = tuple(json.loads(cache.read_text(encoding="utf-8"))["box"])
        print(f"reuse cached frames, crop={box}")
    else:
        session = new_session("u2net")

        # 1. 抽帧 + 抠图
        srcs = {name: extract_frames(name, s, d) for name, (s, d) in SEGMENTS.items()}
        mattes = {name: matte(frames, session) for name, frames in srcs.items()}

        # 2. 待机帧
        idle_cut = remove(extract_idle(), session=session, alpha_matting=False)
        idle_tmp = TMP / "idle_matte.png"
        idle_cut.save(idle_tmp)

        # 3. 全动作共用裁剪框，保证切换时角色不跳动
        x0, y0, x1, y1 = union_bbox(
            [p for ps in mattes.values() for p in ps], [idle_tmp]
        )
        pad = 12
        box = (max(0, x0 - pad), max(0, y0 - pad), x1 + pad + 1, y1 + pad + 1)
        print(f"union bbox={x0, y0, x1, y1} -> crop={box} "
              f"size={box[2] - box[0]}x{box[3] - box[1]}")

        # 4. 输出裁剪后的序列
        for name, paths in mattes.items():
            d = cuts[name]
            if d.exists():
                shutil.rmtree(d)
            d.mkdir(parents=True)
            for p in paths:
                crop_to(Image.open(p), box).save(d / p.name)
        crop_to(Image.open(idle_tmp), box).save(OUT / "idle.png")
        cache.write_text(json.dumps({"box": box}), encoding="utf-8")

    crop_w, crop_h = box[2] - box[0], box[3] - box[1]

    # 5. 编码透明 WebM(VP9 alpha) + Opus 音轨
    for name, (start, dur) in SEGMENTS.items():
        d = TMP / f"cut_{name}"
        webm = OUT / f"{name}.webm"
        fade_start = max(0.0, dur - 0.55)
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-framerate", str(FPS), "-i", str(d / "f_%04d.png"),
            "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(SRC),
            "-map", "0:v", "-map", "1:a",
            "-af", f"afade=t=in:st=0:d=0.12,afade=t=out:st={fade_start:.2f}:d=0.55",
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0",
            "-crf", "30", "-auto-alt-ref", "0",
            "-lag-in-frames", "0", "-row-mt", "1", "-cpu-used", "2",
            "-c:a", "libopus", "-b:a", "96k", "-ac", "2",
            "-shortest", str(webm),
        ])
        print(f"  {webm.name}: {webm.stat().st_size / 1024:.0f} KB")

    # 6. GIF（1-bit 透明，12fps，360 宽）
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-framerate", str(FPS), "-i", str(TMP / "cut_laugh" / "f_%04d.png"),
        "-vf", "fps=12,scale=360:-1:flags=lanczos,split[s0][s1];"
               "[s0]palettegen=stats_mode=diff:reserve_transparent=1[p];"
               "[s1][p]paletteuse=alpha_threshold=128:dither=none",
        "-loop", "0", str(OUT / "laugh.gif"),
    ])
    print(f"  laugh.gif: {(OUT / 'laugh.gif').stat().st_size / 1024:.0f} KB")

    # 7. 单独的音效文件
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", "1.55", "-t", "4.30", "-i", str(SRC), "-vn",
        "-af", "afade=t=in:st=0:d=0.12,afade=t=out:st=3.75:d=0.55",
        "-c:a", "libmp3lame", "-b:a", "192k", str(OUT / "laugh.mp3"),
    ])

    # 8. 图标（头部特写 + 深色底）
    subprocess.run([sys.executable, str(ROOT / "tools" / "make_icon.py")], check=True)

    meta = {
        "fps": FPS,
        "crop": box,
        "width": crop_w,
        "height": crop_h,
        "aspect": round(crop_w / crop_h, 4),
        "idle_time": IDLE_TIME,
        "segments": {k: {"start": v[0], "duration": v[1]} for k, v in SEGMENTS.items()},
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("done.")


if __name__ == "__main__":
    main()
