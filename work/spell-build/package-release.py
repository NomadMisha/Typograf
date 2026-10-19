"""Package the existing docs build for GitHub Releases; never include source data."""
import argparse
import hashlib
from pathlib import Path
import re
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("version", help="Release tag, e.g. v2026.10.19")
args = parser.parse_args()
if not re.fullmatch(r"v\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.-]+)?", args.version):
    parser.error("Expected a version tag without path separators")

root = Path(__file__).resolve().parents[2]
readme = f"""Типограф — {args.version}

Распакуйте архив и откройте index.html в браузере.
Установка программ и моделей не нужна. Словарь, стили, JavaScript и лицензии
словаря включены в index.html. Без онлайн-переключателя текст проверяется локально.
Онлайн-проверка требует интернета и отправляет текст внешним сервисам.

editorial-review.html — отдельная форма для проверки редакторских примеров.
Сведения об источниках и лицензии её фрагментов: LICENSE-MDN.md.

История хранится в конкретном браузере. Для переноса из другой версии используйте
«Скачать JSON» и «Загрузить JSON» в приложении. Личных текстов в архиве нет.

Сайт: https://nomadmisha.github.io/Typograf/
Исходники и новые версии: https://github.com/NomadMisha/Typograf
"""
# Explicit allowlist excludes model weights, credentials, private drafts and runtime.
files = {
    "index.html": (root / "docs/index.html").read_bytes(),
    "editorial-review.html": (root / "docs/editorial-review.html").read_bytes(),
    "LICENSE-MDN.md": (root / "work/spell-build/TECHNICAL_CORPUS_LICENSE.md").read_bytes(),
    "README.txt": readme.encode("utf-8"),
}
destination = root / "dist"
destination.mkdir(exist_ok=True)
archive = destination / f"typograf-{args.version}.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for name, content in files.items():
        entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        package.writestr(entry, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None, "Corrupt ZIP entry"
    assert set(package.namelist()) == set(files), "Unexpected package contents"
    assert all(package.read(name) == content for name, content in files.items())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")
print(archive)
print(f"SHA-256: {checksum}")
