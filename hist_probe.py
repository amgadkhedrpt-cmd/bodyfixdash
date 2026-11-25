"""🔎 بعد ما حد علّم «مؤكد»: إيه الحالة اللي بعدها وبعد قد إيه؟ (أعداد بس — من غير مرضى)"""
import json, datetime as dt
from collections import Counter, defaultdict
def dec(a, key):
    if isinstance(a, dict): return a.get(key)
    if not isinstance(a, list): return None
    def r(i):
        v = a[i]
        if isinstance(v, dict): return {k: r(x) for k, x in v.items()}
        return [r(x) for x in v] if isinstance(v, list) else v
    for i, v in enumerate(a):
        if isinstance(v, dict) and key in v: return r(i)[key]
def ts(s): return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
async def run(gql_call, page, cookie, headers):
    print("🔎 HIST PROBE 7 — what follows CONFIRMED")
    q = 'query Q($s:Int!,$t:Int!,$r:[DateTime!]!){userActions(orderBy:"createdAt-asc",skip:$s,take:$t,rangeDate:$r){action createdAt fields appointmentId createdBy{name}}}'
    seq = defaultdict(list)
    day = dt.datetime(2026, 10, 31, 22, tzinfo=dt.timezone.utc)
    while day < dt.datetime(2026, 11, 25, 22, tzinfo=dt.timezone.utc):
        sk = 0
        while True:
            d = await gql_call(page, cookie, headers, q, {"s": sk, "t": 500, "r": [day.strftime("%Y-%m-%dT%H:%M:%S.000Z"), (day + dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S.000Z")]})
            L = dec(d, "userActions") or []
            for u in L:
                if not isinstance(u, dict) or u.get("action") != "EDIT_APPOINTMENT" or not u.get("appointmentId"): continue
                f = u.get("fields")
                if isinstance(f, str):
                    try: f = json.loads(f)
                    except Exception: f = []
                for it in f or []:
                    if isinstance(it, dict) and it.get("status"):
                        seq[u["appointmentId"]].append((ts(u["createdAt"]), str(it["status"]).upper(), ((u.get("createdBy") or {}).get("name") or "?").split(" ")[0], tuple(sorted(k for x in (f or []) if isinstance(x, dict) for k in x))))
            if len(L) < 500: break
            sk += 500
        day += dt.timedelta(days=1)
    print("appointments with status changes:", len(seq))
    for who in ("Georgina", "Bassant"):
        prev = Counter(); other = Counter(); n = 0
        for aid, S in seq.items():
            S.sort()
            for i, x in enumerate(S):
                if x[1] != "CONFIRMED" or x[2] != who: continue
                n += 1
                prev[S[i - 1][1] if i else "(أول حالة متسجلة)"] += 1
                other["+".join(k for k in x[3] if k != "status") or "status بس"] += 1
        print("=====", who, "CONFIRMED events:", n)
        print("  الحالة اللي قبلها:", prev.most_common(10))
        print("  اتغير معاها في نفس التعديل:", other.most_common(10))
