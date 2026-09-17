"""Build a deterministic, allowlisted desktop Chrome ZIP with no local metadata."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent
FILES = (
    "manifest.json", "background.js", "content-v2.js", "popup.html",
    "popup.js", "report.js", "style.css", "guide.html", "README.txt",
    "使用说明.md", "PRIVACY.md",
)

def build():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    payloads = {}
    for name in FILES:
        source = ROOT / name
        if source.is_symlink():
            raise ValueError(f"Unexpected symlink: {name}")
        data = source.read_bytes()
        text = data.decode("utf-8")
        if re.search(r"/Users/|/home/[^\s/]+/|[A-Za-z]:\\Users\\|chrome-extension://[a-p]{32}", text):
            raise ValueError(f"Local path or installed extension ID found in {name}")
        payloads[name] = data
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"instagram-follow-checker-{version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name, data in payloads.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            info.extra = b""
            info.comment = b""
            bundle.writestr(info, data)
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert set(bundle.namelist()) == set(FILES)
        assert all(not entry.extra and not entry.comment for entry in bundle.infolist())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    print(f"Created {archive.name}: {archive.stat().st_size} bytes; {len(FILES)} files")
    print(f"SHA256 {digest}")

if __name__ == "__main__":
    build()
