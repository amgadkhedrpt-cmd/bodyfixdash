# فحص مؤقت: حالة مهام الخطة في المخزن المشترك ليوم 26/11 — أعداد بس (من غير أسامي مرضى)
import urllib.request, json, re, collections, datetime as dt
U="https://script.google.com/macros/s/AKfycbzy1UbUmQmVOLnrgP69vALV_RH8VlejQ5Npo9a9xS1u9Hhz5oRiPKF7GIgSVYAxCp_m/exec?action=getAll&callback=cb"
raw=urllib.request.urlopen(U,timeout=60).read().decode("utf-8")
d=json.loads(raw[raw.index("(")+1:raw.rindex(")")]); R=d.get("reasons") or {}
print("keys:",len(R),"total chars:",sum(len(k)+len(str(v)) for k,v in R.items()), "top-level:",list(d.keys())[:8])
pre=collections.Counter(k.split("|")[0] for k in R); print("prefixes:",pre.most_common(12))
day="2026-11-26"; C=collections.Counter(); H=collections.defaultdict(collections.Counter); G=collections.defaultdict(collections.Counter)
for k,v in R.items():
    if not k.startswith("PLAN|"): continue
    try: o=json.loads(v)
    except Exception: continue
    ts=o.get("ts") or o.get("nts") or ""
    try: t=dt.datetime.fromisoformat(ts.replace("Z","+00:00"))+dt.timedelta(hours=2)
    except Exception: continue
    if t.date().isoformat()!=day: continue
    who=o.get("by") or o.get("nby") or "?"; s=o.get("s") or "note"
    C[(who,s)]+=1; H[who][f"{t.hour:02d}"]+=1
    g=k.split("|")[2] if k.count("|")>=2 else "?"; G[who][g]+=1
print("by person/state:",sorted(C.items()))
for w in H: print("hours",w,sorted(H[w].items()))
for w in G: print("groups",w,G[w].most_common(15))
s=R.get("PLANSUM|"+day)
if s:
    o=json.loads(s); print("PLANSUM at:",o.get("at")); print("PLANSUM sec:",o.get("sec"))
