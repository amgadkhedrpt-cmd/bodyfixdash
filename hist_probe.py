"""🔎 فحص userActions في Medicolize (سجل نشاط المستخدمين؟) — أسامي حقول وأعداد وقيم أكشن بس."""
import re
from collections import Counter
SUB = ["id", "action", "type", "createdAt", "fields", "userIP", "entity", "entityId", "model", "modelId", "table", "target", "targetId",
       "appointment", "appointmentId", "patient", "patientId", "createdBy", "user", "note", "operation", "data", "changes", "oldData", "newData", "description", "url", "method"]
def dec(a, key):
    if isinstance(a, dict): return a.get(key)
    if not isinstance(a, list): return None
    def r(i):
        v = a[i]
        if isinstance(v, dict): return {k: r(x) for k, x in v.items()}
        return [r(x) for x in v] if isinstance(v, list) else v
    for i, v in enumerate(a):
        if isinstance(v, dict) and key in v: return r(i)[key]
async def run(gql_call, page, cookie, headers):
    print("🔎 HIST PROBE 5 — userActions with args")
    F = "id action createdAt fields appointmentId patientId createdBy{name}"
    tries = [
        ('query Q{userActions(orderBy:"createdAt-desc"){%s}}', {}),
        ('query Q($s:Int!,$t:Int!){userActions(orderBy:"createdAt-desc",skip:$s,take:$t){%s}}', {"s": 0, "t": 300}),
        ('query Q($s:Int!,$t:Int!,$r:[DateTime!]!){userActions(orderBy:"createdAt-desc",skip:$s,take:$t,rangeDate:$r){%s}}', {"s": 0, "t": 500, "r": ["2026-11-09T00:00:00.000Z", "2026-11-11T23:59:59.000Z"]}),
    ]
    L = None
    for q, v in tries:
        for f in (F, F.replace(" createdBy{name}", "")):
            try:
                d = await gql_call(page, cookie, headers, q % f, v); L = dec(d, "userActions"); print("OK with", q[:70], "| fields:", f); break
            except Exception as e:
                print("✗", q[:60], "·", str(e)[:230])
        if isinstance(L, list): break
    if not isinstance(L, list): return
    print("rows:", len(L))
    c = Counter(str(x.get("action")) for x in L if isinstance(x, dict)); print("action:", c.most_common(30))
    ts = sorted(str(x.get("createdAt")) for x in L if isinstance(x, dict) and x.get("createdAt"))
    if ts: print("span:", ts[0][:19], "→", ts[-1][:19])
    print("with appointmentId:", sum(1 for x in L if isinstance(x, dict) and x.get("appointmentId")))
    fk = Counter(); stv = Counter()
    for x in L:
        f = x.get("fields") if isinstance(x, dict) else None
        if isinstance(f, str):
            try:
                import json; f = json.loads(f)
            except Exception: fk.update(["<str>"]); continue
        if isinstance(f, dict):
            fk.update(f.keys())
            for k in f:
                if "status" in k.lower(): stv[str(x.get("action")) + " → " + str(f[k])[:25]] += 1
        elif isinstance(f, list): fk.update(["<list>"])
    print("fields keys:", fk.most_common(30)); print("status values:", stv.most_common(20))
    who = Counter(((x.get("createdBy") or {}).get("name") if isinstance(x, dict) and isinstance(x.get("createdBy"), dict) else "?") for x in L); print("by:", who.most_common(15))
