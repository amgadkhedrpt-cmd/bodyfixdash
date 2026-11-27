# فحص مؤقت: كشوفات الدقي حسب الدكتور (أعداد بس)
import collections
from datetime import date, timedelta
import digest_fin as F
data = F.load(); x = F.Br(data, "FIX ZONE")
t = date(2026, 11, 26); lo, hi, td = (t - timedelta(days=90)).isoformat(), (t - timedelta(days=30)).isoformat(), t.isoformat()
print("exam types:", sorted(x.exam_t))
C = collections.Counter(); W = collections.Counter(); TY = collections.Counter()
for pid, L in x.byp.items():
    for e in L:
        if e["st"] in F.DONE and e["ty"] in x.exam_t and lo <= e["d"] <= hi:
            C[e["doc"]] += 1; W[(e["doc"], date.fromisoformat(e["d"]).strftime("%a"))] += 1; TY[(e["doc"], e["ty"])] += 1
print("by doctor:", C.most_common())
print("by weekday:", sorted(W.items()))
print("by type:", TY.most_common())
# كل المواعيد المكتملة (أي نوع) لكل دكتور في نفس الفترة
A = collections.Counter(a["doc"] for a in x.apt if lo <= a["d"] <= hi and a["st"] in F.DONE)
print("all done appts by doctor:", A.most_common(6))
# r
# r2
