"""Rebuild site/fonts/rim-serif-*.woff2 after changing page text.

The site self-hosts subsets of Noto Serif CJK TC (SIL OFL 1.1) so that no
third-party font service is contacted. Only characters that appear in the
site's HTML/JS and in the Apps Script messages are kept; any character typed
by a visitor that is not in the subset falls back to the system serif font.

Requirements: pip install fonttools brotli
Usage:        python scripts/subset-fonts.py /path/to/NotoSerifCJK-{weight}.ttc
              (the directory containing NotoSerifCJK-Regular/Bold/Black.ttc,
               or the three NotoSerifTC-*.otf files)
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
EXTRA = "，。、；：？！「」『』（）《》〈〉—…－～・＊／｜●○←→↗×✓"


def collect_text():
    files = glob.glob(os.path.join(SITE, "*.html")) + glob.glob(os.path.join(SITE, "*.js"))
    files.append(os.path.join(SITE, "backend", "Code.gs"))
    text = "".join(open(f, encoding="utf-8").read() for f in files)
    chars = {c for c in text if ord(c) > 127} | set(EXTRA)
    return "".join(chr(i) for i in range(32, 127)) + "".join(sorted(chars))


def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/opentype/noto"
    text_file = os.path.join(ROOT, "scripts", ".font-chars.txt")
    open(text_file, "w", encoding="utf-8").write(collect_text())
    for weight in ("Regular", "Bold", "Black"):
        ttc = os.path.join(src_dir, f"NotoSerifCJK-{weight}.ttc")
        otf = os.path.join(src_dir, f"NotoSerifTC-{weight}.otf")
        args = [ttc, "--font-number=3"] if os.path.exists(ttc) else [otf]
        out = os.path.join(SITE, "fonts", f"rim-serif-{weight}.woff2")
        subprocess.run(["pyftsubset", *args, f"--text-file={text_file}", "--flavor=woff2",
                        "--layout-features=kern,liga,palt,vpal,halt", "--no-hinting",
                        "--desubroutinize", f"--output-file={out}"], check=True)
        print(out, os.path.getsize(out))
    os.remove(text_file)


if __name__ == "__main__":
    main()
