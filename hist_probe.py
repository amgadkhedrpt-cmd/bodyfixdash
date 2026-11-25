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
    print("🔎 HIST PROBE 4 — userActions")
    try:
        await gql_call(page, cookie, headers, "{userActions{__typename}}", {}); print("no-arg call OK")
    except Exception as e:
        print("no-arg:", str(e)[:300])
    ok = []
    for f in SUB:
        try:
            await gql_call(page, cookie, headers, "{userActions{" + f + "}}", {}); ok.append(f); print("✅", f)
        except Exception as e:
            m = str(e)
            if "selection" in m.lower():
                for g in ("id", "name"):
                    try: await gql_call(page, cookie, headers, "{userActions{" + f + "{" + g + "}}}", {}); ok.append(f + "{" + g + "}"); print("✅", f + "{" + g + "}"); break
                    except Exception: pass
            elif "Cannot query field" in m:
                s = re.findall(r'Did you mean ([^?]+)\?', m); print("✗", f, ("💡 " + s[0]) if s else "")
            else:
                print("?", f, m[:160])
    if not ok: return
    try:
        d = await gql_call(page, cookie, headers, "{userActions{" + " ".join(ok) + "}}", {})
    except Exception as e:
        print("combined:", str(e)[:300]); return
    L = dec(d, "userActions")
    if not isinstance(L, list): print("not decoded:", str(d)[:200]); return
    print("rows:", len(L))
    for k in ("action", "type", "entity", "model", "table", "operation", "method"):
        c = Counter(str(x.get(k)) for x in L if isinstance(x, dict) and k in x)
        if c: print(k, c.most_common(25))
    ts = sorted(str(x.get("createdAt")) for x in L if isinstance(x, dict) and x.get("createdAt"))
    if ts: print("span:", ts[0][:19], "→", ts[-1][:19])
    fk = Counter()
    for x in L:
        f = x.get("fields") if isinstance(x, dict) else None
        if isinstance(f, dict): fk.update(f.keys())
        elif isinstance(f, str): fk.update(["<str>"])
        elif isinstance(f, list): fk.update(["<list>"])
    print("fields keys:", fk.most_common(25))
