import urllib.request, html

en = urllib.request.urlopen("https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.md", timeout=15).read().decode("utf-8")
zh = urllib.request.urlopen("https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.zh-CN.md", timeout=15).read().decode("utf-8")

verdir = r"E:\Dev\tokenfence-studio-final\docs\assets\verification"

css = """
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e1e;color:#d4d4d4;font-family:Consolas,monospace;font-size:13px;line-height:1.5}
.addr-bar{background:#2d2d2d;padding:8px 12px;border-bottom:1px solid #444;display:flex;align-items:center;gap:8px}
.addr-icon{color:#888;font-size:16px}
.addr-text{background:#1e1e1e;color:#ccc;padding:4px 10px;border-radius:4px;flex:1;font-family:Consolas,monospace;font-size:13px}
.content{padding:12px 16px}
.line{display:flex}
.line-num{color:#858585;text-align:right;padding-right:12px;min-width:48px;user-select:none;border-right:1px solid #333;margin-right:12px}
.line-text{white-space:pre}
"""

def make_page(url, content):
    lines_html = ""
    for i, line in enumerate(content.split("\n"), 1):
        lines_html += f'<div class="line"><span class="line-num">{i}</span><span class="line-text">{html.escape(line)}</span></div>\n'
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Raw</title><style>{css}</style></head><body>
<div class="addr-bar"><span class="addr-icon">&#128274;</span><span class="addr-text">{url}</span></div>
<div class="content">{lines_html}</div></body></html>"""

with open(f"{verdir}/_raw-readme-en.html", "w", encoding="utf-8") as f:
    f.write(make_page("https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.md", en))

with open(f"{verdir}/_raw-readme-zh.html", "w", encoding="utf-8") as f:
    f.write(make_page("https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.zh-CN.md", zh))

print(f"EN: {len(en)} chars, {en.count(chr(10))} LF, {en.count(chr(13))} CR")
print(f"ZH: {len(zh)} chars, {zh.count(chr(10))} LF, {zh.count(chr(13))} CR")
print("HTML files created")
