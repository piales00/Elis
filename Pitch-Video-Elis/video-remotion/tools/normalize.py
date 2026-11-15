# Usage: python3 tools/normalize.py ../assets/imagenes/screenshots public/shots
# Cover-scales each screenshot to 1920x1080, center-crops it, and writes PNGs plus meta.json (scale and crop offsets).
# Copy meta.json to src/lib/shots-meta.json if the geometry ever changes.
import sys, cv2, json, os
src, out = sys.argv[1], sys.argv[2]
meta = {}
for name in sorted(os.listdir(src)):
    if not name.lower().endswith(('.jpg','.jpeg','.png')): continue
    im = cv2.imread(os.path.join(src,name))
    h, w = im.shape[:2]
    s = max(1920/w, 1080/h)
    nw, nh = round(w*s), round(h*s)
    r = cv2.resize(im, (nw,nh), interpolation=cv2.INTER_LANCZOS4)
    ox, oy = (nw-1920)//2, (nh-1080)//2
    r = r[oy:oy+1080, ox:ox+1920]
    base = os.path.splitext(name)[0]
    cv2.imwrite(os.path.join(out, base+'.png'), r)
    meta[base] = dict(w=w,h=h,s=s,ox=ox,oy=oy)
json.dump(meta, open(os.path.join(out,'meta.json'),'w'), indent=1)
print(json.dumps(meta, indent=1))
