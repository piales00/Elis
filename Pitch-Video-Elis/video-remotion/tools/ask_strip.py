# Builds one tall strip of the Ask Elis answer panel from the two authentic screenshots.
# Content comes only from the screenshots; the overlap is matched, not invented.
# Usage: python3 tools/ask_strip.py   (run after tools/normalize.py has produced public/shots/compare.png)
# Reads ../assets/imagenes/screenshots/ and writes public/shots/ask-strip.png + ask-strip.json.
# Copy ask-strip.json to src/lib/ask-strip.json if the geometry ever changes.
import cv2, numpy as np, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
S = os.path.join(ROOT, '..', 'assets', 'imagenes', 'screenshots') + os.sep
OUT = os.path.join(ROOT, 'public', 'shots') + os.sep
a2 = cv2.imread(S+'ask-elis-02-respuesta-superior.jpg')
a3 = cv2.imread(S+'ask-elis-03-respuesta-inferior.jpg')
tpl = a3[100:300, 100:480]
r = cv2.matchTemplate(a2, tpl, cv2.TM_CCOEFF_NORMED); _, score, _, loc = cv2.minMaxLoc(r)
dx, d = loc[0]-100, loc[1]-100
print('match score', round(score,4), 'dx', dx, 'scroll d', d)
X0, X1, TOP, BOT = 74, 511, 82, 958          # viewport in ask-03 pixels
H = BOT-TOP
up = np.zeros((H, X1-X0, 3), np.uint8)
up[:] = a2[TOP:BOT, X0+dx:X1+dx]
lo = a3[TOP:BOT, X0:X1]                        # covers content rows [d, d+H)
strip = np.zeros((H+d, X1-X0, 3), np.uint8)
strip[:H] = up
strip[H:] = lo[H-d:]
seam, feather = 620, 24                        # content row where we switch, inside the overlap
for y in range(seam-feather, H):
    w = min(1, max(0, (y-(seam-feather))/(2*feather)))
    strip[y] = (up[y]*(1-w) + lo[y-d]*w).astype(np.uint8)
diff = np.abs(up[d:].astype(int) - lo[:H-d].astype(int)).mean()
print('mean abs diff in overlap', round(diff,2))
cv2.imwrite(OUT+'ask-strip.png', strip)
json.dump(dict(x0=X0, top=TOP, bot=BOT, w=X1-X0, h=H, d=d, src='ask-elis-03-respuesta-inferior'), open(OUT+'ask-strip.json','w'))
# panel/background colors for masks
c = cv2.imread(OUT+'compare.png'); print('compare panel bg BGR', c[640,300].tolist(), c[900,600].tolist())
print('ask panel bg', a3[600,95].tolist(), 'outer bg', a3[960,300].tolist())
