"""🔎 فحص: Medicolize بيحفظ تاريخ تغيير حالة الميعاد (مين خلاه «مؤكد» وإمتى) للمواعيد القديمة؟
تشغيلة بإيدك · قراية بس · بيطبع أسامي الحقول/الأنواع بس (من غير أي بيانات مرضى)."""
import re, json
RX = re.compile(r"log|histor|activit|audit|event|change|timeline|track|status", re.I)
GUESS = ["history", "histories", "logs", "log", "activities", "activityLogs", "auditLogs", "audits", "statusHistory",
         "statusLogs", "statusChanges", "changes", "events", "timeline", "tracks", "updates", "versions", "revisions", "appointmentLogs"]
async def run(gql_call, page, cookie, headers):
    print("🔎 HIST PROBE")
    try:
        d = await gql_call(page, cookie, headers, "{__schema{queryType{fields{name}} types{name kind fields{name type{name kind ofType{name kind ofType{name}}}}}}}", {})
        T = (d or {}).get("__schema") or {}
        q = [f["name"] for f in ((T.get("queryType") or {}).get("fields") or [])]
        print("QUERY root (matching):", [x for x in q if RX.search(x)])
        for t in T.get("types") or []:
            nm = t.get("name") or ""
            if nm.startswith("__"): continue
            fs = [f["name"] for f in (t.get("fields") or [])]
            if re.fullmatch(r"Appointment\w*", nm) or RX.search(nm):
                print("TYPE", nm, "→", fs[:80])
        return
    except Exception as e:
        print("introspection off:", str(e)[:200])
    base = ("query A($skip:Int!,$take:Int!,$rangeDate:[DateTime!]!){createdAppointments(orderBy:\"start-asc\",skip:$skip,take:$take,rangeDate:$rangeDate,filters:{status:[],rangeDateKey:\"start\"})"
            "{id %s}}")
    v = {"skip": 0, "take": 1, "rangeDate": ["2026-11-10T00:00:00.000Z", "2026-11-10T23:59:59.000Z"]}
    for g in GUESS:
        try:
            r = await gql_call(page, cookie, headers, base % g, v)
            print("✅ field exists (scalar?):", g)
        except Exception as e:
            m = str(e)
            if "subselection" in m.lower() or "must have a selection" in m.lower():
                print("✅ field exists (object):", g, "·", m[:160])
            elif "did you mean" in m.lower():
                print("💡", g, "·", re.findall(r"Did you mean[^\"']*[\"']?([^\"'?]+)", m)[:3], m[:200])
            else:
                print("✗", g, "·", m[:90])
