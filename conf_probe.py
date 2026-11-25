"""🔎 فحص تأكيد مواعيد الدقي من سجل المكالمات (تشغيلة بإيدك · قراية بس): لكل ميعاد — اتكلم المريض في يوم الشغل اللي قبله؟ الصبح ولا بالليل؟
وحضر ولا لغى ولا ما جاش — أعداد بس في اللوج (من غير أسامي ولا أرقام)."""
import os, json, re, urllib.request, datetime as dt
from collections import defaultdict
URL, KEY = os.environ.get("SHEET_URL", ""), os.environ.get("SHEET_KEY", "")
BR = os.environ.get("CONF_BR", "FIX ZONE")
LNS = set((os.environ.get("CONF_LN") or "الدقي").split(","))
SW = int(os.environ.get("CONF_SW") or (15 if BR == "BODYFIX Center" else 17))   # تغيير الشيفت
SKIP_T = re.compile(r"متابع|منقطع|تغذ|موعد محجوز")
def call(body):
    body = dict(body, key=KEY)
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read().decode())
def dd(x):
    d = x.get("data", x) if isinstance(x, dict) else x
    if isinstance(d, str):
        try: d = json.loads(d)
        except Exception: pass
    if isinstance(d, dict) and "data" in d and not d.get("r") and not d.get("ln"):
        d = d["data"]; d = json.loads(d) if isinstance(d, str) else d
    return d or {}
def ph10(s):
    d = re.sub(r"\D", "", str(s or ""))
    return d[-10:] if len(d) >= 10 else ""
def run(appts):
    CAI = dt.timezone(dt.timedelta(hours=2))
    now = dt.datetime.now(CAI)
    months = sorted({now.strftime("%Y-%m"), (now.replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")})
    calls = defaultdict(list); days_with_calls = set()
    for m in months:
        for x in (call({"action": "list", "prefix": f"calls/{m}/days"}).get("docs") or []):
            d = dd(x)
            if d.get("ln") not in LNS: continue
            base = dt.datetime.fromisoformat(d["d"] + "T00:00:00")
            for r in d.get("r") or []:
                t = base + dt.timedelta(seconds=r[1])          # ساعة الحيطة في القاهرة
                ty = {"i": "in", "o": "out", "m": "miss"}.get(r[2], "?")
                calls[str(r[0])[-10:]].append((t, ty, r[3] or 0)); days_with_calls.add(t.date())
    print("📞", BR, "· الخطوط", sorted(LNS), "· أيام فيها مكالمات:", len(days_with_calls))
    def prev_work(d):
        p = d - dt.timedelta(days=1)
        if p.weekday() == 4: p -= dt.timedelta(days=1)
        return p
    rows = defaultdict(lambda: defaultdict(int))
    for a in appts:
        if (a.get("branch") or {}).get("name") != BR: continue
        if "follow" in ((a.get("doctor") or {}).get("name") or "").lower(): continue
        if SKIP_T.search(a.get("type") or ""): continue
        st = datetime_ = None
        try: st = dt.datetime.fromisoformat(str(a["start"]).replace("Z", "+00:00")).astimezone(CAI).replace(tzinfo=None)
        except Exception: continue
        D = st.date()
        if not (dt.date(2026, 10, 20) <= D <= now.date()): continue
        P = prev_work(D)
        if P not in days_with_calls: continue                 # يوم التأكيد مالوش سجل مكالمات — ما نحكمش
        cr = None
        try: cr = dt.datetime.fromisoformat(str(a.get("createdAt")).replace("Z", "+00:00")).astimezone(CAI).replace(tzinfo=None)
        except Exception: pass
        if cr and cr.date() >= D: continue                    # اتحجز في نفس اليوم — مفيش تأكيد
        p = ph10((a.get("patient") or {}).get("phoneNumber"))
        L = [c for c in calls.get(p, []) if c[0].date() == P]
        out_am = any(c[1] == "out" and c[0].hour < SW for c in L)
        out_pm = any(c[1] == "out" and c[0].hour >= SW for c in L)
        talk = any(c[2] > 0 and c[1] in ("in", "out") for c in L)
        s = (a.get("status") or "").lower()
        res = "came" if s in ("completed", "checked in", "in progress", "checkedin", "inprogress") else "noshow" if "no" in s and "show" in s else "cancel" if "cancel" in s else "open"
        per = ("G" if P <= dt.date(2026, 11, 15) else "X") if BR == "FIX ZONE" else ("G" if P < dt.date(2026, 11, 12) else "X")   # الهرم: G = قبل خطة اليوم (12/11) · X = بعدها
        for key in (per, per + ("_called" if (out_am or out_pm) else "_nocall")):
            R = rows[key]; R["n"] += 1; R[res] += 1
            R["am"] += out_am; R["pm"] += out_pm; R["talk"] += talk; R["any"] += (out_am or out_pm)
        rows["day|" + P.isoformat()]["n"] += 1; rows["day|" + P.isoformat()]["any"] += (out_am or out_pm); rows["day|" + P.isoformat()]["pm"] += out_pm
    pc = lambda a, b: f"{(a * 100 / b):.0f}%" if b else "-"
    print("\n🔎 تأكيد المواعيد — G/X:", "قبل 16/11 / من 16/11" if BR == "FIX ZONE" else "قبل خطة اليوم 12/11 / من 12/11")
    for k in ("G", "X"):
        R = rows[k]
        print(f"  {k}: مواعيد {R['n']} · اتصلنا بيهم يوم قبلها {pc(R['any'], R['n'])} (الصبح {pc(R['am'], R['n'])} · بعد تغيير الشيفت {pc(R['pm'], R['n'])}) · اتكلمنا فعلاً {pc(R['talk'], R['n'])}"
              f" → حضر {pc(R['came'], R['n'])} · لغى {pc(R['cancel'], R['n'])} · ما جاش {pc(R['noshow'], R['n'])}")
        for z in ("_called", "_nocall"):
            Q = rows[k + z]
            print(f"     {'اتصلنا' if z == '_called' else 'ما اتصلناش'}: {Q['n']} → حضر {pc(Q['came'], Q['n'])} · لغى {pc(Q['cancel'], Q['n'])} · ما جاش {pc(Q['noshow'], Q['n'])}")
    print("\n📅 كل يوم تأكيد: مواعيد اليوم اللي بعده · اتصلنا بكام · منهم بعد 5:")
    for k in sorted(x for x in rows if x.startswith("day|")):
        R = rows[k]; print(f"  {k[4:]}: {R['n']} · {R['any']} ({pc(R['any'], R['n'])}) · بعد 5: {R['pm']}")
