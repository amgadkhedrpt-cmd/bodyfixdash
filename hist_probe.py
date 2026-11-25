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
    import json
    print("🔎 HIST PROBE 6 — fields structure")
    q = 'query Q($s:Int!,$t:Int!,$r:[DateTime!]!){userActions(orderBy:"createdAt-desc",skip:$s,take:$t,rangeDate:$r){id action createdAt fields appointmentId createdBy{name}}}'
    d = await gql_call(page, cookie, headers, q, {"s": 0, "t": 300, "r": ["2026-11-11T15:00:00.000Z", "2026-11-11T21:59:59.000Z"]})
    L = dec(d, "userActions") or []
    E = [x for x in L if isinstance(x, dict) and x.get("action") == "EDIT_APPOINTMENT"]
    print("edits:", len(E))
    keys = Counter(); stat = Counter(); shapes = Counter()
    for x in E:
        f = x.get("fields")
        if isinstance(f, str):
            try: f = json.loads(f)
            except Exception: pass
        shapes[type(f).__name__] += 1
        for it in (f or []) if isinstance(f, list) else []:
            if isinstance(it, dict):
                keys.update(it.keys())
                nm = str(it.get("field") or it.get("name") or it.get("key") or "")
                if "status" in nm.lower() or "status" in json.dumps(it).lower()[:200]:
                    stat[json.dumps({k: (str(v)[:30] if not isinstance(v, (dict, list)) else "…") for k, v in it.items()}, ensure_ascii=False)[:200]] += 1
            else:
                keys.update(["<" + type(it).__name__ + ">"])
                if isinstance(it, str) and "status" in it.lower(): stat[it[:80]] += 1
    print("shapes:", shapes); print("item keys:", keys.most_common(20))
    for k, n in stat.most_common(15): print(n, k)
    # sample non-status item names (field names only)
    nm = Counter()
    for x in E:
        f = x.get("fields")
        if isinstance(f, str):
            try: f = json.loads(f)
            except Exception: f = None
        for it in (f or []) if isinstance(f, list) else []:
            if isinstance(it, dict): nm[str(it.get("field") or it.get("name") or it.get("key") or "?")] += 1
            elif isinstance(it, str): nm[it[:30]] += 1
    print("field names:", nm.most_common(25))
