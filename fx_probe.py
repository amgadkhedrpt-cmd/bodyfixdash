# فحص مؤقت: شيت التثبيتات (الهرم) — من غير أسامي مرضى (بصمة بس)
import urllib.request, json, hashlib, re
U = "https://script.google.com/macros/s/AKfycbx2zEjS2Bk3IT9NAQgounmv_YRNGCNvbgqt5sxkyVjkIlGbprO69rA3CmSdoqu_V3j_/exec?callback=cb"
raw = urllib.request.urlopen(U, timeout=60).read().decode("utf-8")
d = json.loads(raw[raw.index("(") + 1:raw.rindex(")")])
D = d.get("doctors") or []
print("doctors", len(D), "keys", sorted(D[0].keys()) if D else None)
def h(s): return hashlib.sha1(re.sub(r"\s+", " ", str(s)).strip().encode()).hexdigest()[:10]
for doc in D:
    sl = doc.get("slots") or {}
    one = next(iter(sl.values()), {}) if sl else {}
    days = [k for k, v in (doc.get("days") or {}).items() if v]
    out = []
    for num, s in sorted(sl.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 99):
        p = (s or {}).get("patient")
        out.append(f"{num}@{(s or {}).get('time','')}:" + (("P" + h(p) + "/" + str(len(str(p).split()))) if p and p != "-" else "FREE"))
    print("DOC", doc.get("name"), "|", doc.get("gender"), "|", ",".join(days), "| slotkeys", sorted(one.keys()) if one else [], "|", " ".join(out))
