import pathlib
d = pathlib.Path(__file__).parent
h = (d/'shell.html').read_text(encoding='utf-8')
for tag, f in [('/*STYLES*/','styles.js'),('/*ENGINE*/','engine.js'),('/*APP*/','app.js')]:
    h = h.replace(tag, (d/f).read_text(encoding='utf-8'))
(d/'index.html').write_text(h, encoding='utf-8'); print('index.html', len(h))
