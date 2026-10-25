# -*- coding: utf-8 -*-
r"""生成内嵌中文字体子集 cjk_font.ttf。

目的：Rust/egui 打包的 .exe 默认字体不含中文字形，中文会显示为 □（豆腐块）。
本脚本把微软雅黑子集化后随 exe 编译期内嵌，保证任何 Windows 机器上中文不乱码。

字符来源：
  1. src/main.rs 源码中的全部字符（UI 静态文本）
  2. assets/data.json 中的全部字符（全国省市名/大学名/通告文本，含 \uXXXX 转义解码）
  3. GB2312 全集（6763 汉字 + 符号区，覆盖用户可能输入的生僻字）
  4. ASCII 可打印字符 + 常用 UI 符号

用法：py make_cjk_font.py   （需要 fontTools）
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC_MAIN = ROOT / "src" / "main.rs"
DATA_JSON = ROOT / "assets" / "data.json"
FONT_SRC = Path(r"C:\Windows\Fonts\msyh.ttc")
OUT = ROOT / "assets" / "cjk_font.ttf"

# 额外补充的 UI 符号（折叠箭头/分隔线/中文标点等）
EXTRA_CHARS = "⏵▶▼◀▲·｜—～【】（）“”‘’…、。，；：？！《》％℃¥"


def collect_chars() -> list:
    chars = set()

    def feed(text: str):
        # 先解码 \uXXXX 转义序列，再收字符
        text = re.sub(
            r"\\u([0-9a-fA-F]{4})",
            lambda m: chr(int(m.group(1), 16)),
            text,
        )
        chars.update(text)

    for p in (SRC_MAIN, DATA_JSON):
        if p.exists():
            feed(p.read_text(encoding="utf-8"))
            print(f"已收集: {p}")
        else:
            print(f"警告: 文件不存在 {p}")

    # GB2312 全集（双字节 0xA1A1 - 0xF7FE，含符号区与汉字区）
    gb = 0
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes((hi, lo)).decode("gb2312"))
                gb += 1
            except UnicodeDecodeError:
                pass
    print(f"GB2312 字符: {gb}")

    # ASCII
    chars.update(chr(cp) for cp in range(0x20, 0x7F))
    # 控制/空白字符
    chars.update("\n\r\t")
    # 额外符号
    chars.update(EXTRA_CHARS)

    return sorted({ord(c) for c in chars if ord(c) != 0})


def main():
    if not FONT_SRC.exists():
        raise SystemExit(f"找不到系统字体: {FONT_SRC}")

    cps = collect_chars()
    print(f"子集码位总数: {len(cps)}")

    from fontTools import subset, ttLib

    coll = ttLib.TTCollection(str(FONT_SRC))
    font = coll.fonts[0]
    print(f"字体 face: {font['name'].getDebugName(4)}")

    tmp = HERE / "_msyh_full.tmp.ttf"
    font.save(str(tmp))

    opts = subset.Options()
    opts.layout_features = []   # 中文排版无需复杂整形，关闭以缩小体积
    opts.name_IDs = ["*"]       # 保留字体名称记录
    opts.recalc_bounds = True
    opts.recalc_timestamp = False
    opts.hinting = False        # egui 渲染不用字体 hinting，关闭可显著减小体积

    f2 = subset.load_font(str(tmp), opts)
    ss = subset.Subsetter(opts)
    ss.populate(unicodes=cps)
    ss.subset(f2)
    f2.save(str(OUT))
    try:
        tmp.unlink(missing_ok=True)
    except OSError:
        print(f"提示: 临时文件 {tmp.name} 未能自动删除，可手动删除")

    size_kb = OUT.stat().st_size / 1024
    print(f"输出: {OUT}  ({size_kb:.0f} KB)")
    if size_kb < 200:
        print("警告: 输出文件异常偏小，请检查")


if __name__ == "__main__":
    main()
