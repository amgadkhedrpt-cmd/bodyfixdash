"""🔎 جورجينا مقابل بسنت — الأيام اللي سجل المكالمات فيها كامل (11–16/11) · أعداد بس (من غير مرضى)
Confirmed من سجل نشاط Medicolize · المكالمات من المخزن (الشيت) · مستثنى: كان في العيادة يوم الشغل اللي قبل ميعاده"""
import json, re, datetime as dt
from collections import Counter, defaultdict
import conf_probe as CP
CAI = dt.timezone(dt.timedelta(hours=2))
def dec(a, key):
    if isinstance(a, dict): return a.get(key)
    if not isinstance(a, list): return None
    def r(i):
        v = a[i]
        if isinstance(v, dict): return {k: r(x) for k, x in v.items()}
        return [r(x) for x in v] if isinstance(v, list) else v
    for i, v in enumerate(a):
        if isinstance(v, dict) and key in v: return r(i)[key]
def wall(s): return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).astimezone(CAI).replace(tzinfo=None)
async def run(gql_call, page, cookie, headers, appts):
    print("🔎 HIST PROBE 8 — Georgina vs Bassant on full-log days")
    calls = defaultdict(list); perday = Counter(); lines = Counter()
    for m in ("2026-10", "2026-11"):
        for x in (CP.call({"action": "list", "prefix": f"calls/{m}/days"}).get("docs") or []):
            d = CP.dd(x); lines[d.get("ln")] += len(d.get("r") or [])
            base = dt.datetime.fromisoformat(d["d"] + "T00:00:00")
            for r in d.get("r") or []:
                t = base + dt.timedelta(seconds=r[1]); ty = {"i": "in", "o": "out", "m": "miss"}.get(r[2], "?")
                calls[str(r[0])[-10:]].append((t, ty, r[3] or 0)); perday[(d.get("ln"), t.date())] += 1
    print("lines:", lines.most_common())
    dk = [ln for ln in lines if ln and ("دق" in ln or "dok" in ln.lower() or "fix" in ln.lower())]
    print("Dokki lines guess:", dk)
    for day in range(1, 26):
        D = dt.date(2026, 11, day); print("  ", D.isoformat()[5:], {ln: perday[(ln, D)] for ln in lines if perday[(ln, D)]})
    A = {}; att = set()
    for a in appts:
        try: st = wall(a["start"])
        except Exception: continue
        A[a.get("id")] = a
        s = (a.get("status") or "").lower().replace(" ", "")
        if s in ("completed", "checkedin", "inprogress"): att.add(((a.get("patient") or {}).get("id"), st.date()))
    q = 'query Q($s:Int!,$t:Int!,$r:[DateTime!]!){userActions(orderBy:"createdAt-asc",skip:$s,take:$t,rangeDate:$r){action createdAt fields appointmentId createdBy{name}}}'
    ev = []
    day = dt.datetime(2026, 11, 9, 22, tzinfo=dt.timezone.utc)
    while day < dt.datetime(2026, 11, 16, 22, tzinfo=dt.timezone.utc):
        sk = 0
        while True:
            d = await gql_call(page, cookie, headers, q, {"s": sk, "t": 500, "r": [day.strftime("%Y-%m-%dT%H:%M:%S.000Z"), (day + dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")]})
            L = dec(d, "userActions") or []
            for u in L:
                if not isinstance(u, dict) or u.get("action") != "EDIT_APPOINTMENT": continue
                f = u.get("fields")
                if isinstance(f, str):
                    try: f = json.loads(f)
                    except Exception: f = []
                if any(isinstance(it, dict) and str(it.get("status") or "").upper() == "CONFIRMED" for it in f or []):
                    ev.append((u.get("appointmentId"), wall(u["createdAt"]), ((u.get("createdBy") or {}).get("name") or "?").split(" ")[0]))
            if len(L) < 500: break
            sk += 500
        day += dt.timedelta(days=1)
    def prevw(d):
        p = d - dt.timedelta(days=1)
        return p - dt.timedelta(days=1) if p.weekday() == 4 else p
    R = defaultdict(Counter); miss_appt = 0
    for aid, t, by in ev:
        a = A.get(aid)
        if not a: miss_appt += 1; continue
        if (a.get("branch") or {}).get("name") != "FIX ZONE": continue
        if not (dt.date(2026, 11, 11) <= t.date() <= dt.date(2026, 11, 16)): continue
        st = wall(a["start"]); pid = (a.get("patient") or {}).get("id")
        try:
            if abs((wall(a.get("createdAt")) - t).total_seconds()) < 180: R[by]["اتحجز مؤكد"] += 1; continue
        except Exception: pass
        k = R[by]; k["n"] += 1
        if (pid, prevw(st.date())) in att: k["مستثنى: في العيادة"] += 1; continue
        if sum(perday[(ln, t.date())] for ln in dk) < 10: k["يوم سجله ناقص"] += 1; continue
        p = CP.ph10((a.get("patient") or {}).get("phoneNumber"))
        L = [c for c in calls.get(p, []) if t - dt.timedelta(hours=36) <= c[0] <= t + dt.timedelta(minutes=15)]
        cat = "بمكالمة اترد عليها" if any(c[2] > 0 and c[1] != "miss" for c in L) else "اتصلت وما ردش" if any(c[1] == "out" for c in L) else "مفيش أي مكالمة"
        k["اتقارن"] += 1; k[cat] += 1
        s = (a.get("status") or "").lower()
        if cat != "بمكالمة اترد عليها" and ("cancel" in s or ("no" in s and "show" in s)): k["من غير اتصال واعتذر/ما جاش"] += 1
    print("events:", len(ev), "· appointment not in fetched list:", miss_appt)
    for by, k in sorted(R.items(), key=lambda x: -x[1]["n"]):
        if k["n"] < 3: continue
        c = k["اتقارن"]; nc = k["اتصلت وما ردش"] + k["مفيش أي مكالمة"]
        print(f"===== {by}: {dict(k)} · من غير اتصال {nc}/{c} = {round(nc*100/c) if c else '-'}%")
# run 1795621762
