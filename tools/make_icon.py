"""从待机图生成应用/托盘图标：深色底 + 奶蛙头，小尺寸也认得出。"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PET = ROOT / "pet"


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=radius, fill=255)
    return mask


def main() -> None:
    idle = Image.open(PET / "idle.png").convert("RGBA")
    w, h = idle.size
    # 头部+肩部，比例按 638x834 的素材标定
    head = idle.crop((int(w * 0.20), 0, int(w * 0.84), int(h * 0.41)))
    bbox = head.getbbox()
    if bbox:
        head = head.crop(bbox)

    # 底部渐隐，避免头像被一条直线切断
    hw, hh = head.size
    fade = Image.new("L", (hw, hh), 255)
    fd = ImageDraw.Draw(fade)
    fade_from = int(hh * 0.68)
    for y in range(fade_from, hh):
        t = (y - fade_from) / max(1, hh - fade_from)
        fd.line([(0, y), (hw, y)], fill=int(255 * (1 - t) ** 1.5))
    head.putalpha(Image.composite(head.getchannel("A"),
                                  Image.new("L", (hw, hh), 0), fade))

    size = 512
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(body)
    draw.rounded_rectangle([8, 8, size - 8, size - 8], radius=116,
                           fill=(35, 38, 47, 255))
    # 头像后面的暖色聚光，不贴边
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([96, 110, 416, 430], fill=(255, 206, 84, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(52))
    body.alpha_composite(glow)
    body.putalpha(rounded_mask(size, 116))
    icon.alpha_composite(body)

    head.thumbnail((400, 400), Image.LANCZOS)
    icon.alpha_composite(head, ((size - head.width) // 2,
                                size - head.height - 42))

    icon.save(PET / "icon.png")
    icon.save(PET / "icon.ico",
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                     (64, 64), (128, 128), (256, 256)])
    print("icon written", icon.size)


if __name__ == "__main__":
    main()
