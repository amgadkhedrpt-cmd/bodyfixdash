"""🔎 فحص حقل actions على الميعاد في Medicolize (تاريخ التغييرات؟) — قراية بس · بيطبع أسامي حقول وقيم حالات وأسامي موظفين بس (من غير مرضى)."""
import re, json
SUB = ["id", "type", "action", "name", "status", "newStatus", "oldStatus", "from", "to", "value", "oldValue", "newValue", "field",
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
    try:
        d = await gql_call(page, cookie, headers, base % " ".join(ok), v)
    except Exception as e:
        print("combined:", str(e)[:200]); return
    rows = None
    def find(o):
        nonlocal rows
        if isinstance(o, dict):
            if "createdAppointments" in o: rows = o["createdAppointments"]; return
            for x in o.values(): find(x)
        elif isinstance(o, list):
            for x in o: find(x)
    find(d)
    if not isinstance(rows, list):
        print("rows not decoded; type:", type(d).__name__, str(d)[:300]); return
    n = sum(1 for r in rows if isinstance(r, dict) and r.get("actions"))
    print("appointments:", len(rows), "· with actions:", n)
    PII = re.compile(r"\d{7,}")
    for r in rows[:12]:
        if not isinstance(r, dict): continue
        acts = r.get("actions") or []
        print("— appt status", r.get("status"), "· actions", len(acts))
        for a in acts[:8]:
            if isinstance(a, dict):
                print("   ", {k: (PII.sub("#", str(v))[:60]) for k, v in a.items() if k not in ("id",)})
