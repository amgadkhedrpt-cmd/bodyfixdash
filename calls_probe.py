"""فحص سجل المكالمات (تشغيلة بإيدك): آخر رفع لكل خط + المكالمات الفايتة اللي لسه ما اترجعلهاش — أعداد بس، من غير أرقام كاملة."""
import os, json, urllib.request, datetime as dt
from collections import defaultdict
URL, KEY = os.environ["SHEET_URL"], os.environ["SHEET_KEY"]
def call(body):
    body = dict(body, key=KEY)
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
def dd(x):
    d = x.get("data", x) if isinstance(x, dict) else x
    if isinstance(d, str):
        try: d = json.loads(d)
        except Exception: pass
    if isinstance(d, dict) and "data" in d and not d.get("r") and not d.get("ln") and not d.get("at"):
        d = d["data"]; d = json.loads(d) if isinstance(d, str) else d
    return d or {}
CAI = dt.timezone(dt.timedelta(hours=2))
now = dt.datetime.now(CAI); months = sorted({now.strftime("%Y-%m"), (now.replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")})
lines = {}
for k in ("config/call_lines",):
    try:
        j = call({"action": "get", "path": k}); 
        if j.get("doc"): lines = dd(j["doc"]); break
    except Exception as e: print("lines", k, e)
print("LINES:", json.dumps(lines, ensure_ascii=False)[:400])
ups = []
for m in months:
    for x in (call({"action": "list", "prefix": f"calls/{m}/up"}).get("docs") or []): ups.append(dd(x))
ups.sort(key=lambda u: u.get("at") or 0, reverse=True)
print("\nLAST UPLOADS (Cairo time):")
seen = defaultdict(int)
for u in ups:
    ln = u.get("ln"); seen[ln] += 1
    if seen[ln] > 8: continue
    at = dt.datetime.fromtimestamp((u.get("at") or 0) / 1000, CAI).strftime("%Y-%m-%d %H:%M")
    wl = lambda t: dt.datetime.fromtimestamp((t or 0) / 1000, dt.timezone.utc).strftime("%m-%d %H:%M") if t else "-"   # أوقات المكالمات متخزنة ساعة القاهرة كأنها UTC
    print(f"  line {ln}: uploaded {at} · file calls from {wl(u.get('mn'))} to {wl(u.get('mx'))} · n {u.get('n')} add {u.get('add')} · by {u.get('by','')}")
calls = []
for m in months:
    for x in (call({"action": "list", "prefix": f"calls/{m}/days"}).get("docs") or []):
        d = dd(x); base = dt.datetime.fromisoformat(d.get("d") + "T00:00:00+00:00").timestamp() * 1000
        for r in d.get("r") or []:
            calls.append({"ph": r[0], "t": base + r[1] * 1000, "ty": {"i": "in", "o": "out", "m": "miss"}.get(r[2], "?"), "dur": r[3] or 0, "ln": d.get("ln")})
day = lambda t: dt.datetime.fromtimestamp(t / 1000, CAI).strftime("%Y-%m-%d")
# 🕳️ من أول الشهر: فترات شغل (10ص-12م، غير الجمعة) مش متغطية بأي ملف اترفع — نفس منطق الداشبورد (أوقات الملفات ساعة القاهرة)
print("\nUPLOAD COVERAGE GAPS since month start (work hours, >=2h):")
M0 = dt.datetime(now.year, now.month, 1, 10, 0)
def workmin(a, b):
    m, t = 0, a
    while t < b:
        if t.weekday() != 4 and t.hour >= 10: m += min(15, (b - t).total_seconds() / 60)
        t += dt.timedelta(minutes=15)
    return m
W = lambda ms: dt.datetime.utcfromtimestamp(ms / 1000)
byln = defaultdict(list)
for u in ups:
    if u.get("mn") and u.get("mx"):
        mx = W(u["mx"]); at = dt.datetime.fromtimestamp(u["at"] / 1000, CAI).replace(tzinfo=None)
        while mx > at + dt.timedelta(minutes=5): mx -= dt.timedelta(hours=12)
        byln[u.get("ln")].append((W(u["mn"]), mx))
nowW = now.replace(tzinfo=None)
for ln, U in byln.items():
    U.sort(); cur = max(M0, U[0][0]); end = max(x[1] for x in U); found = 0
    for a_, b_ in U:
        if b_ <= cur: continue
        if a_ > cur:
            w = workmin(cur, min(a_, end))
            if w >= 120: found += 1; print(f"  {ln}: {cur:%a %m-%d %H:%M} -> {a_:%a %m-%d %H:%M}  ({w/60:.1f} work h)")
        cur = max(cur, b_)
    w = workmin(max(end, M0), nowW)
    print(f"  {ln}: middle gaps {found} · last uploaded call {end:%a %m-%d %H:%M} · not uploaded since: {w/60:.1f} work h")
print("\nDAYS SINCE MONTH START WITH NO CALLS AT ALL (per line, not Friday):")
dset = defaultdict(set)
for c in calls: dset[c["ln"]].add(dt.datetime.fromtimestamp(c["t"] / 1000, dt.timezone.utc).strftime("%Y-%m-%d"))
for ln in sorted(dset):
    miss = []; d = M0.date()
    while d <= nowW.date():
        if d.weekday() != 4 and d.isoformat() not in dset[ln]: miss.append(d.strftime("%m-%d"))
        d += dt.timedelta(days=1)
    print(f"  {ln}: {miss}")
print("\nCALLS PER LINE PER HOUR (last 3 days, Cairo wall time) — hours with at least one call:")
hh = defaultdict(set)
for c in calls:
    w = dt.datetime.fromtimestamp(c["t"] / 1000, dt.timezone.utc)
    if w.strftime("%Y-%m-%d") >= (now - dt.timedelta(days=3)).strftime("%Y-%m-%d"): hh[(c["ln"], w.strftime("%Y-%m-%d"))].add(w.hour)
for k in sorted(hh): print(f"  {k[0]} {k[1]}: {sorted(hh[k])}")
print("\nCALLS PER LINE PER DAY (last 5 days) in/out/miss:")
cnt = defaultdict(lambda: defaultdict(int))
for c in calls: cnt[(c["ln"], day(c["t"]))][c["ty"]] += 1
for (ln, d) in sorted(cnt):
    if d >= (now - dt.timedelta(days=5)).strftime("%Y-%m-%d"):
        v = cnt[(ln, d)]; print(f"  {ln} {d}: in {v['in']} · out {v['out']} · miss {v['miss']}")
# فايتة ولسه مفيش كلام بعدها (لا هو اتصل ولا احنا رجعناله بمكالمة اتردت) — آخر 3 أيام
by = defaultdict(list)
for c in calls: by[c["ph"]].append(c)
d3 = (now - dt.timedelta(days=3)).strftime("%Y-%m-%d"); openN = defaultdict(int); tried = defaultdict(int)
for ph, L in by.items():
    L.sort(key=lambda c: c["t"])
    for i, c in enumerate(L):
        if c["ty"] != "miss" or day(c["t"]) < d3 or len(str(ph)) < 9: continue
        later = L[i + 1:]
        if any(x["dur"] > 0 and x["ty"] != "miss" for x in later): continue
        if any(x["ty"] == "miss" for x in later): continue        # نعدّ الرقم مرة واحدة (آخر فايتة)
        openN[(c["ln"], day(c["t"]))] += 1
        if any(x["ty"] == "out" for x in later): tried[(c["ln"], day(c["t"]))] += 1
print("\nMISSED, STILL NO TALK (per line / day of the miss) — open (of them we tried calling back):")
for k in sorted(openN): print(f"  {k[0]} {k[1]}: {openN[k]} (tried {tried[k]})")
print("\nlatest call in data:", day(max(c['t'] for c in calls)) if calls else None, "· total calls", len(calls))

# ── من أول الشهر: كل «فاتتنا» اتقفلت بإيه؟ (نفس قواعد الداشبورد) ──
import re
def cph(s):
    d = re.sub(r"\D", "", str(s or ""))
    return d[-10:] if len(d) >= 10 else ("0" + d if len(d) == 9 else d)
last_visit = {}
try:
    A = json.load(open("alerts.json", encoding="utf-8"))
    for r in A.get("pt_index") or []:
        p = cph(r[1]); v = str(r[4] or "")[:10]
        if p and v > last_visit.get(p, ""): last_visit[p] = v
except Exception as e: print("pt_index", e)
utcday = lambda t: dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).strftime("%Y-%m-%d")
today = now.strftime("%Y-%m-%d"); M1 = now.strftime("%Y-%m-01")
E = []
for ph, L in by.items():
    e = None
    for c in L:
        if c["dur"] > 0 and c["ty"] != "miss":
            if e: e["tC"] = c["t"]; E.append(e); e = None
            continue
        if not e: e = {"ph": ph, "t0": c["t"], "s": "out" if c["ty"] == "out" else "miss", "ln": c["ln"], "tC": None}
    if e: E.append(e)
GAP = 30 * 60e3
res = defaultdict(int); ages = defaultdict(int)
for e in E:
    if e["s"] != "miss" or len(str(e["ph"])) < 9 or utcday(e["t0"]) < M1: continue
    lv = last_visit.get(cph(e["ph"]), "")
    if e["tC"] is not None: res["اتكلمنا (هو أو احنا)"] += 1; continue
    if lv and lv >= utcday(e["t0"]): res["جه العيادة بعدها"] += 1; continue
    byd = defaultdict(list)
    for c in by[e["ph"]]:
        if c["ty"] == "out" and c["t"] >= e["t0"]: byd[utcday(c["t"])].append(c["t"])
    full = []
    for d_ in sorted(byd):
        n, lt = 0, -1e18
        for t in sorted(byd[d_]):
            if t - lt >= GAP: n += 1; lt = t
        if n >= 3: full.append(d_)
    if len(full) >= 3 and full[2] < today: res["اتقفلت: 3 أيام × 3 محاولات"] += 1; continue
    res["لسه مفتوحة"] += 1
    ages[(e["ln"], utcday(e["t0"]))] += 1
print("\nFROM", M1, "— missed calls (unique episodes) closed by:")
for k, v in res.items(): print(f"  {k}: {v}")
print("still open by line/day:"); 
for k in sorted(ages): print(f"  {k[0]} {k[1]}: {ages[k]}")
