# 这里放生成的桌宠素材

源码仓库**不包含**这些文件，因为奶蛙的角色、动画和声音版权归原作者。

按 README 的「快速开始」生成：

1. `python tools/fetch_source.py` 下载官网演示视频与封面
2. `python tools/build_assets.py` 抽帧、抠图、编码

生成后的文件：

- `idle.png`：待机图
- `laugh.webm` / `fall.webm`：透明动画（VP9 alpha + Opus）
- `laugh.gif` / `laugh.mp3`：解码失败时的备用动画与音效
- `icon.png` / `icon.ico`：应用与托盘图标
- `meta.json`：裁剪框等元数据
