from playwright.sync_api import sync_playwright
from pathlib import Path

verdir = Path(r"E:\Dev\tokenfence-studio-final\docs\assets\verification")
verdir.mkdir(parents=True, exist_ok=True)

screenshots = [
    ("verify-raw-readme-en.png", "https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.md"),
    ("verify-raw-readme-zh.png", "https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/main/README.zh-CN.md"),
    ("verify-github-home.png", "https://github.com/Chrisbetheking/tokenfence-studio"),
    ("verify-github-zh-readme.png", "https://github.com/Chrisbetheking/tokenfence-studio/blob/main/README.zh-CN.md"),
    ("verify-release-rc2.png", "https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v1.0.0-rc2"),
    ("verify-release-v0524.png", "https://github.com/Chrisbetheking/tokenfence-studio/releases/tag/v0.5.24"),
]

results = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    
    for filename, url in screenshots:
        try:
            print(f"Loading: {url}")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            path = str(verdir / filename)
            page.screenshot(path=path, full_page=False)
            size = Path(path).stat().st_size
            print(f"  => {filename} ({size} bytes)")
            results.append((filename, size, "OK"))
        except Exception as e:
            print(f"  => FAILED: {e}")
            results.append((filename, 0, str(e)[:100]))
    
    browser.close()

print("\n=== RESULTS ===")
for name, size, status in results:
    print(f"{status:6s} {name:40s} {size:>8d} bytes")
