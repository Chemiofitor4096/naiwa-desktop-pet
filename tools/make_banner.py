"""用冒烟测试截图拼一张 README 预览图。"""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def wallpaper(size: tuple[int, int]) -> Image.Image:
    w, h = size
    wall = Image.new("RGB", size)
    d = ImageDraw.Draw(wall)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(112 - 44 * t), int(146 - 34 * t),
                                        int(186 - 26 * t)))
    d.ellipse([-90, h * 0.55, w * 0.65, h * 1.35], fill=(255, 196, 80))
    d.ellipse([w * 0.62, -h * 0.3, w * 1.25, h * 0.42], fill=(122, 222, 201))
    return wall.filter(ImageFilter.GaussianBlur(1))


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def main() -> None:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "smoke"
    shots = [("shot-idle.png", "待机 / 戳我一下"),
             ("shot-laugh-early.png", "点一下 · 哈哈大笑"),
             ("shot-fall.png", "连点 4 下 · 笑到倒地")]
    W, H = 1680, 780
    banner = Image.new("RGBA", (W, H), (23, 26, 33, 255))

    # 背景暖光 + 冷光
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.44, -H * 0.45, W * 1.2, H * 1.2],
               fill=(255, 198, 76, 82))
    gd.ellipse([-W * 0.25, H * 0.45, W * 0.38, H * 1.5],
               fill=(82, 160, 210, 55))
    background = glow.filter(ImageFilter.GaussianBlur(170))
    banner.alpha_composite(background)

    d = ImageDraw.Draw(banner)
    d.text((86, 182), "奶蛙桌宠", font=font(88), fill=(255, 216, 77, 255))
    d.text((92, 312), "戳一下，哈哈大笑", font=font(34),
           fill=(243, 245, 250, 255))
    d.text((94, 368), "透明置顶 · 可拖拽 · 右键菜单",
           font=font(22, bold=False), fill=(172, 182, 200, 255))
    d.text((94, 404), "系统托盘 · 全程离线",
           font=font(22, bold=False), fill=(172, 182, 200, 255))
    d.rounded_rectangle([94, 458, 190, 462], radius=2,
                        fill=(255, 216, 77, 220))

    chip = "Milky Frog · 奶蛙"
    cf = font(23)
    tw = d.textlength(chip, font=cf)
    d.rounded_rectangle([92, 490, 92 + tw + 36, 540], radius=25,
                        fill=(37, 41, 51, 255))
    d.text((110, 499), chip, font=cf, fill=(255, 216, 77, 255))

    d.text((94, 596), "官方动画逐帧抠图，本地离线运行",
           font=font(20, bold=False), fill=(150, 160, 178, 255))
    d.text((94, 634), "左键戳笑 · 连点四下笑到倒地",
           font=font(20, bold=False), fill=(150, 160, 178, 255))

    # 右侧三张卡片
    card_w, card_h = 340, 500
    gap = 24
    start_x = W - (card_w * 3 + gap * 2) - 70
    top = 136
    for i, (name, label) in enumerate(shots):
        path = src_dir / name
        if not path.exists():
            raise SystemExit(f"missing {path}")
        img = Image.open(path).convert("RGBA").resize((card_w, card_h),
                                                      Image.LANCZOS)
        card_bg = wallpaper((card_w, card_h)).convert("RGBA")
        card_bg.alpha_composite(img)
        card = rounded(card_bg, 22)

        x = start_x + i * (card_w + gap)
        shadow = Image.new("RGBA", (card_w + 80, card_h + 80), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle([40, 40, 40 + card_w, 40 + card_h],
                             radius=26, fill=(0, 0, 0, 120))
        shadow = shadow.filter(ImageFilter.GaussianBlur(24))
        banner.alpha_composite(shadow, (x - 40, top - 26))
        banner.alpha_composite(card, (x, top))

        lf = font(23)
        lw = d.textlength(label, font=lf)
        label_pill = max(180, lw + 36)
        lx = x + (card_w - label_pill) / 2
        d.rounded_rectangle([lx, top + card_h + 22,
                             lx + label_pill, top + card_h + 62],
                            radius=20, fill=(32, 36, 45, 255))
        d.text((lx + (label_pill - lw) / 2, top + card_h + 30), label,
               font=lf, fill=(255, 255, 255, 255))

    OUT.mkdir(exist_ok=True)
    banner.convert("RGB").save(OUT / "banner.png")
    for name, short in [("shot-idle.png", "idle.png"),
                        ("shot-laugh-early.png", "laugh.png"),
                        ("shot-fall.png", "fall.png")]:
        Image.open(src_dir / name).save(OUT / short)
    print("banner written", OUT / "banner.png")


if __name__ == "__main__":
    main()
