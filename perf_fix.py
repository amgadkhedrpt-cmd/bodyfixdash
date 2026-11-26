# مرة واحدة: إعادة حساب تقييم يوم 26/11 بعد إصلاح «امسحي منقطع» و«مراجعة مالوش ميعاد» — أعداد بس
import json, urllib.request, re, digest
D = "2026-11-26"
a = json.load(open("alerts.json", encoding="utf-8")); print("alerts today:", a.get("today"))
assert a.get("today") == D, "الداتا اتنقلت ليوم جديد — مش هنكتب"
raw = urllib.request.urlopen(digest.REQ_SCRIPT_URL + "?action=getAll&callback=cb", timeout=60).read().decode("utf-8")
R = json.loads(raw[raw.index("(") + 1:raw.rindex(")")]).get("reasons") or {}
def short(o):
    return {k: v for k, v in o.items() if isinstance(v, (int, float))} if isinstance(o, dict) else o
for k, v in R.items():
    if k.startswith("PERF|" + D + "|"):
        try: print("BEFORE", k.split("|")[2], short(json.loads(v)))
        except Exception: pass
res = digest.plan_from_page()
perf = (res or {}).get("perf") or {}
for n, o in perf.items(): print("AFTER", n, short(o))
sec = ((res or {}).get("sum") or {}).get("sec") or {}
for n, x in sec.items(): print("SUM", n, x)
if perf:
    digest.perf_save(D, perf)
