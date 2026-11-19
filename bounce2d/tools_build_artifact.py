#!/usr/bin/env python3
"""아티팩트 게시용 파일 만들기: style.css와 스크립트들(engine.js·patterns.js·courses.js·themes.js·track.js)을 index.html 안에 넣고 문서 뼈대(doctype/head/body)를 뺀다.
사용: python3 bounce2d/tools_build_artifact.py 출력파일.html"""
import re, sys, pathlib
here = pathlib.Path(__file__).parent
s = (here / "index.html").read_text(encoding="utf-8")
tag = '<link rel="stylesheet" href="style.css">'
assert s.count(tag) == 1
s = s.replace(tag, "<style>\n" + (here / "style.css").read_text(encoding="utf-8") + "</style>")
for name in ["engine.js", "patterns.js", "courses.js", "themes.js", "track.js"]:
    tag = '<script src="%s"></script>' % name
    assert s.count(tag) == 1
    s = s.replace(tag, "<script>\n" + (here / name).read_text(encoding="utf-8") + "</script>")
s = s.replace('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n', "")
s = re.sub(r'<meta name="viewport"[^>]*>\n', "", s, count=1)
s = s.replace("</style>\n</head>\n<body>\n", "</style>\n").replace("</script>\n</body>\n</html>\n", "</script>\n")
for t in ["<body", "<html", "<head>", "</head>", "</body>", "</html>", "<!doctype"]:
    assert t not in s, t
pathlib.Path(sys.argv[1]).write_text(s, encoding="utf-8")
print("wrote", sys.argv[1], len(s), "bytes")
