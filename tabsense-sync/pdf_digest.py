"""بصمة نص ملف PDF (بدون طباعة النص): لكل صفحة بصمة، وعدد الأسطر، والأسطر اللي فيها وقت/تاريخ طباعة."""
import hashlib, json, re, sys
import pymupdf

d = pymupdf.open(sys.argv[1])
pages = []
for p in d:
    lines = [l.strip() for l in p.get_text().splitlines() if l.strip()]
    pages.append({"hash": hashlib.sha256("\n".join(lines).encode()).hexdigest()[:12], "lines": len(lines),
                  "lineHashes": [hashlib.sha256(l.encode()).hexdigest()[:6] for l in lines]})
print(json.dumps({"pages": pages, "title": d.metadata.get("title", ""), "producer": d.metadata.get("producer", "")}, ensure_ascii=False))
