"""🔎 فحص: فيه query على مستوى Medicolize لسجل النشاط (مين غيّر إيه)؟ — أسامي بس."""
import re
ROOT = ["actions", "action", "logs", "activityLogs", "activities", "auditLogs", "userActions", "appointmentActions", "history",
        "appointmentHistory", "events", "notifications", "userLogs", "systemLogs", "changeLogs", "trackings", "appointmentLogs", "operationsLogs"]
async def run(gql_call, page, cookie, headers):
    print("🔎 HIST PROBE 3 — root queries")
    for f in ROOT:
        try:
            await gql_call(page, cookie, headers, "{" + f + "}", {}); print("✅", f, "(scalar/no args)")
        except Exception as e:
            m = str(e)
            if "Cannot query field" in m:
                sug = re.findall(r'Did you mean ([^?]+)\?', m)
                print("✗", f, ("· 💡 " + sug[0]) if sug else "")
            else:
                print("✅?", f, "·", m[:220])
