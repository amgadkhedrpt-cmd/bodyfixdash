"""🔎 فحص حقل actions على الميعاد في Medicolize (تاريخ التغييرات؟) — قراية بس · بيطبع أسامي حقول وقيم حالات وأسامي موظفين بس (من غير مرضى)."""
import re, json
SUB = ["fields", "userIP", "id", "type", "action", "name", "status", "newStatus", "oldStatus", "from", "to", "value", "oldValue", "newValue", "field",
       "createdAt", "updatedAt", "date", "time", "createdBy", "user", "by", "doneBy", "performedBy", "description", "details", "note", "title", "key", "kind"]
async def run(gql_call, page, cookie, headers):
    print("🔎 HIST PROBE 2 — Appointment.actions")
    base = ("query A($skip:Int!,$take:Int!,$rangeDate:[DateTime!]!){createdAppointments(orderBy:\"start-asc\",skip:$skip,take:$take,rangeDate:$rangeDate,filters:{status:[],rangeDateKey:\"start\"})"
            "{id status actions{%s}}}")
    v = {"skip": 0, "take": 30, "rangeDate": ["2026-11-10T00:00:00.000Z", "2026-11-10T23:59:59.000Z"]}
    ok = []
    try:
        await gql_call(page, cookie, headers, base % "__typename", v); print("actions exists (object list)")
    except Exception as e:
        print("actions __typename:", str(e)[:200]); return
    for f in SUB:
        try:
            await gql_call(page, cookie, headers, base % f, v); ok.append(f); print("✅", f, "(scalar)")
        except Exception as e:
            m = str(e)
            if "selection" in m.lower():
                for g in ("name", "fullName", "id"):
                    try:
                        await gql_call(page, cookie, headers, base % (f + "{" + g + "}"), v); ok.append(f + "{" + g + "}"); print("✅", f + "{" + g + "}"); break
                    except Exception:
                        pass
            elif "did you mean" in m.lower():
                print("💡", f, "·", re.findall(r'Did you mean ([^?]+)\?', m)[:1])
    if not ok: return
    PII = re.compile(r"\d{7,}")
    def dec(a, key):
        if isinstance(a, dict): return a.get(key)
        if not isinstance(a, list): return None
        def r(i):
            v = a[i]
            if isinstance(v, dict): return {k: r(x) for k, x in v.items()}
            return [r(x) for x in v] if isinstance(v, list) else v
        for i, v in enumerate(a):
            if isinstance(v, dict) and key in v: return r(i)[key]
    for day in ("2026-11-10", "2026-11-20", "2026-11-24"):
        v = {"skip": 0, "take": 150, "rangeDate": [day + "T00:00:00.000Z", day + "T23:59:59.000Z"]}
        try:
            d = await gql_call(page, cookie, headers, base % " ".join(ok), v)
        except Exception as e:
            print(day, "combined:", str(e)[:200]); continue
        rows = dec(d, "createdAppointments")
        if not isinstance(rows, list):
            print(day, "not decoded", str(d)[:200]); continue
        print("=====", day, "appointments:", len(rows), "· with actions:", sum(1 for r in rows if isinstance(r, dict) and r.get("actions")))
        from collections import Counter
        C = Counter(); 
        for r in rows:
            for a in (r.get("actions") or []) if isinstance(r, dict) else []:
                if isinstance(a, dict): C[str(a.get("action"))] += 1
        print("action values:", C.most_common(20))
        shown = 0
        for r in rows:
            acts = (r.get("actions") or []) if isinstance(r, dict) else []
            if not acts: continue
            print("— appt status", r.get("status"), "· actions", len(acts))
            for a in acts[:10]:
                if isinstance(a, dict):
                    fl = a.get("fields")
                    fk = (list(fl.keys()) if isinstance(fl, dict) else [type(x).__name__ for x in fl][:5] if isinstance(fl, list) else type(fl).__name__)
                    st = ""
                    if isinstance(fl, dict):   # قيمة الحالة بس لو موجودة (مش بيانات مريض)
                        st = {k: str(fl[k])[:20] for k in fl if "status" in k.lower()}
                    print("   ", a.get("action"), "·", str(a.get("createdAt"))[:19], "·", (a.get("createdBy") or {}).get("name") if isinstance(a.get("createdBy"), dict) else "", "· fields:", fk, st)
            shown += 1
            if shown >= 5: break
    return
    n = 0
    print("appointments:", len(rows), "· with actions:", n)
    PII = re.compile(r"\d{7,}")
    for r in rows[:12]:
        if not isinstance(r, dict): continue
        acts = r.get("actions") or []
        print("— appt status", r.get("status"), "· actions", len(acts))
        for a in acts[:8]:
            if isinstance(a, dict):
                print("   ", {k: (PII.sub("#", str(v))[:60]) for k, v in a.items() if k not in ("id",)})
