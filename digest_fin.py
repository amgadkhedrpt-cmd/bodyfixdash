# -*- coding: utf-8 -*-
"""جزء الإيميل اليومي اللي محتاج التاريخ: أداء اليوم قصاد متوسط نفس اليوم (4 أسابيع) والسنة اللي فاتت، الأسبوع والشهر،
والمشاكل المفتوحة (بتتقفل لوحدها) — بيفك البيانات المتشفرة بـ FIN_PASS جوه السيرفر بس."""
import os, re, json
from datetime import datetime, timedelta, date
from collections import defaultdict
try:
    from zoneinfo import ZoneInfo
    TZC = ZoneInfo("Africa/Cairo")
except Exception:
    TZC = None

BR = {"haram": "الهرم", "dokki": "الدقي"}
NOT_VISIT = {"Enum23", "Enum33", "Enum34", "Enum18", "Enum24", "Enum35", "Enum22", "Enum21", "Enum25"}
DONE = {"COMPLETED", "CHECKEDIN", "INPROGRESS"}
LOST = {"CANCELED", "NOSHOW"}
H = lambda x: str(x if x is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
money = lambda v: f"{int(round(v or 0)):,}"
sub = lambda t: f'<span style="color:#64748b;font-size:11px">{t}</span>'


def cday(iso):
    if not iso:
        return None
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if d.tzinfo is None:
            return d.date().isoformat()
        return (d.astimezone(TZC) if TZC else d + timedelta(hours=2)).date().isoformat()
    except Exception:
        return None


def chour(iso):
    try:
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return (d.astimezone(TZC) if TZC else d + timedelta(hours=2)).hour
    except Exception:
        return 0


_LOADED = {}


def load():
    if "d" in _LOADED:
        return _LOADED["d"]
    _LOADED["d"] = _load()
    return _LOADED["d"]


def _load():
    if not os.environ.get("FIN_PASS"):
        return None
    import fin_sync
    parts = []
    for fn in ("data/fin.enc", "data/fin_c.enc"):
        if os.path.exists(fn):
            try:
                parts.append(fin_sync.decrypt(open(fn).read()))
            except Exception as e:
                print("digest_fin: can't open", fn, str(e)[:80])
    if not parts:
        return None
    out = {"kinds": {}, "types": {}, "at": ""}
    for p in parts:
        out["types"].update(p.get("types") or {})
        out["at"] = max(out["at"], p.get("at") or "")
        for kd, bs in (p.get("kinds") or {}).items():
            for b, ms in bs.items():
                out["kinds"].setdefault(kd, {}).setdefault(b, {}).update(ms)
    # ملف النهارده (كل نص ساعة)
    if os.path.exists("data/fin_today.enc"):
        try:
            T = fin_sync.decrypt(open("data/fin_today.enc").read())
            if (T.get("at") or "") > out["at"]:
                m = T["day"][:7]
                for kd, dc in (("pay", "createdAt"), ("apt", "start")):
                    for b, tt in ((T.get("kinds") or {}).get(kd) or {}).items():
                        B = out["kinds"].setdefault(kd, {}).setdefault(b, {})
                        t = B.get(m)
                        if not t:
                            B[m] = tt
                            continue
                        ci = t["cols"].index(dc) if dc in t["cols"] else -1
                        keep = [r for r in t["rows"] if ci < 0 or cday(r[ci]) != T["day"]]
                        idx = [tt["cols"].index(c) if c in tt["cols"] else -1 for c in t["cols"]]
                        B[m] = {"cols": t["cols"], "rows": keep + [[r[i] if i >= 0 else None for i in idx] for r in tt["rows"]]}
                out["at"] = T["at"]
        except Exception as e:
            print("digest_fin: today file", str(e)[:80])
    return out


def rows(data, kind, b):
    for m, t in sorted((data["kinds"].get(kind) or {}).get(b, {}).items()):
        if not t or not t.get("cols"):
            continue
        c = {n: i for i, n in enumerate(t["cols"])}
        for r in t["rows"]:
            yield (lambda n, r=r, c=c: r[c[n]] if n in c and c[n] < len(r) else None)


class Br:
    def __init__(self, data, b):
        self.b = b
        types = data.get("types") or {}
        self.exam_t = {k for k, v in types.items() if "كشف" in str(v)} | {"Enum1", "Enum2"}
        self.apt, self.byp = [], defaultdict(list)
        for g in rows(data, "apt", b):
            ty, st = g("type") or "", str(g("status") or "").upper().replace("_", "").replace(" ", "")
            if ty in NOT_VISIT or st in ("NOTE", "WAITING"):
                continue
            d = cday(g("start"))
            if not d:
                continue
            a = {"d": d, "h": chour(g("start")), "st": st, "ty": ty, "pid": g("patient.referenceId"), "cr": cday(g("createdAt")), "doc": g("doctor.name") or ""}
            self.apt.append(a)
            if a["pid"]:
                self.byp[a["pid"]].append(a)
        self.pay = []
        for g in rows(data, "pay", b):
            d = cday(g("createdAt"))
            if d:
                self.pay.append({"d": d, "amt": float(g("amount") or 0), "bal": str(g("type") or "").upper() == "BALANCE",
                                 "ref": str(g("refunded")).lower() == "true", "pid": g("invoice.patient.referenceId"),
                                 "pn": " ".join(x for x in (g("invoice.patient.firstName"), g("invoice.patient.lastName")) if x)})
        self.inv = []
        for g in rows(data, "inv", b):
            d = cday(g("createdAt"))
            if d:
                tot, paid, disc = float(g("total") or 0), float(g("paid") or 0), float(g("discount") or 0)
                self.inv.append({"d": d, "tot": tot, "paid": paid, "disc": disc, "rem": max(0.0, tot - disc - paid), "pid": g("patient.referenceId"),
                                 "pn": " ".join(x for x in (g("patient.firstName"), g("patient.lastName")) if x), "ref": g("referenceId")})
        self.nm = {}
        for x in self.inv + self.pay:
            if x["pid"] and x["pn"] and x["pid"] not in self.nm:
                self.nm[x["pid"]] = x["pn"]
        self.first = {}
        for a in self.apt:
            if a["st"] in DONE and a["pid"] and (a["pid"] not in self.first or a["d"] < self.first[a["pid"]]):
                self.first[a["pid"]] = a["d"]
        months = sorted({a["d"][:7] for a in self.apt})
        self.m0 = months[0] if months else ""
        self.ok = bool(self.apt)

    def day(self, T):
        A = [a for a in self.apt if a["d"] == T]
        done = [a for a in A if a["st"] in DONE]
        lost = [a for a in A if a["st"] in LOST]
        np_ = sum(1 for p, f in self.first.items() if f == T and f[:7] != self.m0)
        ex = [a for a in done if a["ty"] in self.exam_t]
        exb = [a for a in ex if any(x["d"] > T and x["cr"] and x["cr"] <= T and x["ty"] not in self.exam_t and x["st"] not in LOST for x in self.byp[a["pid"]])]
        rev = sum(p["amt"] for p in self.pay if p["d"] == T and not p["bal"])
        return {"rev": rev, "ses": len(done), "booked": len(A), "canc": (len(lost) / len(A)) if A else None, "np": np_,
                "exR": (len(exb) / len(ex)) if ex else None, "ex": len(ex), "exB": len(exb)}

    def period(self, a, b):
        A = [x for x in self.apt if a <= x["d"] <= b]
        return {"rev": sum(p["amt"] for p in self.pay if a <= p["d"] <= b and not p["bal"]), "ses": sum(1 for x in A if x["st"] in DONE),
                "np": sum(1 for p, f in self.first.items() if a <= f <= b and f[:7] != self.m0)}

    def ptval(self, T):
        a = (date.fromisoformat(T) - timedelta(days=90)).isoformat()
        rev = sum(p["amt"] for p in self.pay if a <= p["d"] <= T and not p["bal"])
        pts = {x["pid"] for x in self.apt if a <= x["d"] <= T and x["st"] in DONE}
        return rev / len(pts) / 3 if pts else 0

    # ---------- المشاكل (لحد يوم T) ----------
    def streak(self, T):
        out = {}
        lim = (date.fromisoformat(T) - timedelta(days=14)).isoformat()
        for pid, L in self.byp.items():
            days = defaultdict(list)
            for a in L:
                if a["d"] <= T:
                    days[a["d"]].append(a)
            miss = []
            for d in sorted(days, reverse=True):
                l = days[d]
                if any(a["st"] in DONE for a in l):
                    break
                if all(a["st"] in LOST for a in l):
                    miss.append(d)
                elif d == T:
                    continue
                else:
                    break
            if len(miss) >= 2 and miss[0] >= lim:
                out[pid] = {"age": age(miss[-2] if len(miss) >= 2 else miss[0], T), "x": f"{len(miss)} مرات ورا بعض"}
        return out

    def exams(self, T):
        out = {}
        lo = (date.fromisoformat(T) - timedelta(days=14)).isoformat()
        for pid, L in self.byp.items():
            for e in L:
                if e["st"] in DONE and e["ty"] in self.exam_t and lo <= e["d"] < T:
                    if any(x["d"] > e["d"] and x["cr"] and x["cr"] <= T and x["st"] not in LOST and x["ty"] not in self.exam_t for x in L):
                        continue
                    out.setdefault(pid, {"age": age(e["d"], T), "x": "كشف " + e["d"][8:] + "/" + e["d"][5:7]})
        return out

    def newgone(self, T):
        out = {}
        t = date.fromisoformat(T)
        lo, hi = (t - timedelta(days=30)).isoformat(), (t - timedelta(days=7)).isoformat()
        for pid, f in self.first.items():
            if f[:7] == self.m0 or not (lo <= f <= hi):
                continue
            L = self.byp[pid]
            if any(a["st"] in DONE and f < a["d"] <= T for a in L) or any(a["d"] > T and a["cr"] and a["cr"] <= T and a["st"] not in LOST for a in L):
                continue
            out[pid] = {"age": age(f, T), "x": "أول زيارة " + f[8:] + "/" + f[5:7]}
        return out

    # 💸 خدمات اتاخدت ومتدفعتش
    def unpaid(self, T):
        """فواتير فيها باقي (آخر 180 يوم، لحد T). المفتاح = رقم الفاتورة"""
        lo = (date.fromisoformat(T) - timedelta(days=180)).isoformat()
        return {x["ref"] or (x["pid"], x["d"]): x for x in self.inv if lo <= x["d"] <= T and x["rem"] > 1}

    def unbilled(self, T):
        """حضر النهارده ومالوش أي فاتورة في آخر 120 يوم ولا دفع"""
        lo = (date.fromisoformat(T) - timedelta(days=120)).isoformat()
        invp = {x["pid"] for x in self.inv if lo <= x["d"] <= T}
        payp = {p["pid"] for p in self.pay if lo <= p["d"] <= T}
        out = {}
        for a in self.apt:
            if a["d"] == T and a["st"] in DONE and a["pid"] and a["pid"] not in invp and a["pid"] not in payp:
                out[a["pid"]] = {"age": 0, "x": "حضر النهارده"}
        return out


def age(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def ch(a, b, r=False):
    if a is None or b is None:
        return None
    if r:
        return a - b
    return (a - b) / abs(b) if b else None


def arrow(v, r=False, good=1, lbl=""):
    if v is None:
        return ""
    big = abs(v) >= (0.05 if r else 0.10)
    g = (v >= 0) == (good > 0)
    col = ("#16a34a" if g else "#dc2626") if big else "#94a3b8"
    s = f"{abs(v) * 100:.0f} نقطة" if r else f"{abs(v) * 100:.0f}%"
    return f'<span style="color:{col};font-size:11px">{lbl} {"▲" if v >= 0 else "▼"}{s}</span>'


MET = [("rev", "💰 التحصيل", False, 1), ("ses", "✅ الجلسات اللي اتعملت", False, 1), ("canc", "❌ الإلغاء والغياب", True, -1),
       ("np", "🆕 مرضى جداد", False, 1), ("exR", "🩺 كشوفات اتحجزلها قبل ما تمشي", True, 1)]


def section(today_s):
    data = load()
    if not data:
        return "", ""
    B = {b: Br(data, b) for b in BR}
    B = {b: x for b, x in B.items() if x.ok}
    T = today_s
    t = date.fromisoformat(T)
    wd = ["الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"][t.weekday()]
    C = {}
    for b, x in B.items():
        cur = x.day(T)
        w = [x.day((t - timedelta(days=7 * k)).isoformat()) for k in range(1, 5)]
        w = [d for d in w if d["booked"]]
        ly = x.day((t - timedelta(days=364)).isoformat())
        avg = {}
        for k, *_ in MET:
            v = [d[k] for d in w if d[k] is not None]
            avg[k] = sum(v) / len(v) if v else None
        C[b] = (cur, avg, ly if ly["booked"] else None, len(w))
    # جملة لكل فرع
    head = []
    for b, (cur, avg, ly, n) in C.items():
        if not cur["booked"]:
            head.append(f"<b>{BR[b]}</b>: مفيش مواعيد النهارده.")
            continue
        r, s = ch(cur["rev"], avg["rev"]), ch(cur["ses"], avg["ses"])
        lvl = (r or 0) + (s or 0)
        word = "يوم أحسن من العادي 👍" if lvl >= 0.15 else "يوم أقل من العادي ⚠️" if lvl <= -0.15 else "يوم عادي"
        head.append(f"<b>{BR[b]}</b>: {word} — التحصيل {arrow(r)} والجلسات {arrow(s)} عن متوسط {wd} في آخر {n} أسابيع")
    td = lambda v: f'<td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center;font-size:13px;line-height:1.6">{v}</td>'
    tbl = ['<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th></th>'
           + "".join(f'<th style="padding:6px;background:#eff6ff;color:#1d4ed8">{BR[b]}</th>' for b in C) + "</tr>"]
    for k, lbl, r, good in MET:
        cells = []
        for b, (cur, avg, ly, n) in C.items():
            v = cur[k]
            f = "—" if v is None else (f"{v * 100:.0f}%" if r else money(v))
            extra = f' {sub("من " + str(cur["booked"]))}' if k == "ses" else (f' {sub("(" + str(cur["exB"]) + " من " + str(cur["ex"]) + ")")}' if k == "exR" and cur["ex"] else "")
            a1 = arrow(ch(v, avg[k], r), r, good, "عن العادي")
            a2 = arrow(ch(v, ly[k], r), r, good, "عن السنة اللي فاتت") if ly else ""
            cells.append(td(f"<b>{f}</b>{extra}<br>{' · '.join(x for x in (a1, a2) if x)}"))
        tbl.append(f'<tr><td style="padding:6px;border-top:1px solid #e2e8f0;font-size:13px">{lbl}</td>{"".join(cells)}</tr>')
    tbl.append("</table>")
    # الأسبوع والشهر
    sat = t - timedelta(days=(t.weekday() - 5) % 7)
    m1 = t.replace(day=1)

    def per(a, bb, lyfn):
        out = []
        for b, x in B.items():
            A, L = x.period(a.isoformat(), bb.isoformat()), x.period(lyfn(a).isoformat(), lyfn(bb).isoformat())
            out.append(f"<b>{BR[b]}</b>: {money(A['rev'])} جنيه · {A['ses']:,} جلسة · {A['np']} مريض جديد "
                       + (f"{sub('— قصاد نفس الفترة السنة اللي فاتت:')} {arrow(ch(A['rev'], L['rev']), lbl='التحصيل')} {arrow(ch(A['ses'], L['ses']), lbl='الجلسات')} {arrow(ch(A['np'], L['np']), lbl='الجداد')}" if L["ses"] else ""))
        return "<br>".join(out)
    ly_wk = lambda d: d - timedelta(days=364)

    def ly_m(d):
        try:
            return d.replace(year=d.year - 1)
        except ValueError:
            return d.replace(year=d.year - 1, day=28)
    perf = (f'<div style="line-height:1.9;font-size:13px;margin:6px 0 10px">{"<br>".join(head)}</div>' + "".join(tbl)
            + f'<div style="font-size:13px;line-height:1.9;margin-top:8px"><b>📆 الأسبوع لحد النهارده</b> (من السبت):<br>{per(sat, t, ly_wk)}'
            + f'<br><b>🗓️ الشهر لحد النهارده</b>:<br>{per(m1, t, ly_m)}</div>'
            + f'<div style="color:#64748b;font-size:11px;margin-top:4px">«عن العادي» = متوسط نفس اليوم في آخر 4 أسابيع · «عن السنة اللي فاتت» = نفس اليوم من الأسبوع السنة اللي فاتت</div>')
    # ---------- المشاكل المفتوحة ----------
    Y = (t - timedelta(days=1)).isoformat()
    P = []
    AUD = load_audit()
    STATE = load_state(T)
    for b, x in B.items():
        v = x.ptval(T)
        # 💸 الفلوس: خدمات اتعملت (خطوة Completed في Operation Steps) ومتدفعتش — نفس حساب تاب المراجعة (data/audit.json)
        P.extend(steps_money(b, x, T, AUD, STATE))
        # خصم كبير / استرداد النهارده
        big = [i for i in x.inv if i["d"] == T and i["tot"] > 0 and i["disc"] / i["tot"] >= 0.3]
        if big:
            P.append({"lvl": 1, "b": b, "t": "🏷️ خصم 30% أو أكتر النهارده", "own": "المدير", "items": [{"n": i["pn"], "age": None, "x": f"خصم {money(i['disc'])} من {money(i['tot'])} ({i['disc'] / i['tot'] * 100:.0f}%)"} for i in big],
                      "n": len(big), "val": sum(i["disc"] for i in big), "prev": None, "solved": 0, "unit": "فاتورة"})
        rf = [p for p in x.pay if p["d"] == T and p["ref"]]
        if rf:
            P.append({"lvl": 1, "b": b, "t": "↩️ دفعات اتردت النهارده", "own": "المدير", "items": [{"n": p["pn"], "age": None, "x": f"{money(p['amt'])} جنيه"} for p in rf],
                      "n": len(rf), "val": sum(p["amt"] for p in rf), "prev": None, "solved": 0, "unit": "دفعة"})
        # المرضى
        for title, fn, own in (("🔁 بيلغوا ورا بعض (مرتين أو أكتر ومجوش بعدها)", x.streak, "الاستقبال"),
                               ("🩺 عملوا كشف وما اتحجزلهمش (آخر 14 يوم)", x.exams, "الاستقبال"),
                               ("🚶 مرضى جداد ما رجعوش ومالهمش ميعاد (أول زيارة من 7–30 يوم)", x.newgone, "الاستقبال + الدكتور")):
            now, yd = fn(T), fn(Y)
            solved = len([p for p in yd if p not in now])
            if now or solved:
                P.append({"lvl": 1, "b": b, "t": title, "own": own, "items": sorted(({"n": x.nm.get(p, ""), "age": z["age"], "x": z["x"]} for p, z in now.items()), key=lambda i: -(i["age"] or 0)),
                          "n": len(now), "val": len(now) * v, "prev": len(yd), "solved": solved, "unit": "مريض"})
    save_state(T, AUD)
    P.sort(key=lambda p: (-p["lvl"], -(p["val"] or 0)))
    global LAST_P
    LAST_P = P
    out = []
    for b in B:
        PB = [p for p in P if p["b"] == b]
        shown = [p for p in PB if p["n"]][:7]
        sol = sum(p["solved"] for p in PB)
        out.append(f'<div style="background:#eff6ff;color:#1d4ed8;font-weight:700;padding:5px 10px;border-radius:6px;margin:14px 0 4px">🏥 {BR[b]}'
                   + (f' <span style="color:#16a34a;font-weight:400;font-size:12px">· ✓ اتحل {sol} من امبارح</span>' if sol else "") + '</div>')
        if not shown:
            out.append('<div style="color:#16a34a;font-size:13px">✅ مفيش مشاكل مفتوحة</div>')
        for p in shown:
            old = max([i["age"] for i in p["items"] if i["age"] is not None] or [0])
            tr = "" if p["prev"] is None else (f'<span style="color:#dc2626">▲ زادت (امبارح {p["prev"]})</span>' if p["n"] > p["prev"] else f'<span style="color:#16a34a">▼ قلّت (امبارح {p["prev"]})</span>' if p["n"] < p["prev"] else sub("زي امبارح"))
            col = "#b91c1c" if p["lvl"] == 3 else "#dc2626" if p["lvl"] == 2 else "#ea580c"
            names = "".join(f'<li style="margin:1px 0">{H(i["n"] or "—")} {sub("— " + (i["x"] if i.get("raw") else H(i["x"])) + ((" · من " + str(i["age"]) + " يوم") if i["age"] else ""))}</li>' for i in p["items"][:6])
            more = sub(f"+ {len(p['items']) - 6} كمان") if len(p["items"]) > 6 else ""
            out.append(f'<div style="border-inline-start:3px solid {col};padding:4px 10px;margin:8px 0;font-size:13px">'
                       f'<div style="font-weight:700">{p["t"]}: {p["n"]} {p["unit"]} <span style="font-weight:400">— {own_html(p)}</span></div>'
                       f'<div>{tr}{" · " if tr else ""}{("أقدم واحدة من " + str(old) + " يوم · ") if old else ""}{("القيمة " + money(p["val"]) + " جنيه") if p["val"] else ""}'
                       f'{(" · <span style=color:#16a34a>✓ اتحل " + str(p["solved"]) + " " + p.get("unitS", "") + " من امبارح</span>") if p["solved"] else ""}</div>'
                       f'<ul style="margin:2px 0;padding-inline-start:18px">{names}</ul>{more}</div>')
    return perf, "".join(out)


# ================= خدمات اتعملت ومتدفعتش (Operation Steps) =================
AUD_B = {"BODYFIX Center": "haram", "FIX ZONE": "dokki"}
CALL_T = re.compile(r"متابع|انقطاع|منقطع|استرداد|ملاحظ|تقييم الجلسه|اتصال|مكالم", re.I)
STATE_F = "data/digest_open.json"
PLAN = None       # pid → مهام التحصيل في خطة النهارده (digest.py بيملاها)
LAST_P = []       # المشاكل بالتفصيل (للكروت)
PLAN_ALL = None   # كل مهام خطة النهارده — عشان نكتب اسم السكرتيرة المسئولة جنب كل مشكلة
PB = {"haram": "BODYFIX Center", "dokki": "FIX ZONE"}
OWN_G = [("حضر تاني", ["debt", "debtph", "invrev", "invfix"]), ("خدمة اتعملت ومتدفعتش (آخر 30", ["debtph", "debt", "invrev", "invfix"]), ("فلوس قديمة", ["invrev", "invfix", "debtph"]),
         ("خدمة اتعملت النهارده", ["debt"]), ("ومفيش خدمة اتسجلت", ["aud", "stale"]), ("عملوا كشف", ["kashf0", "kashf", "fix"]),
         ("بيلغوا ورا بعض", ["streak", "recur"]), ("مرضى جداد", ["idle", "nonext", "call"])]


def own_html(p):
    o = owner_of(p)
    if o:
        return f'<b style="color:#1d4ed8">👤 {H(o)}</b>'
    if p["own"] == "المدير":
        return sub("المسئول: المدير")
    return sub("المسئول: " + p["own"]) + (' <span style="color:#b45309;font-size:11px">(مفيش سكرتيرة متحددة ليها في خطة النهارده)</span>' if PLAN_ALL else "")


def owner_of(p):
    """اسم السكرتيرة: من مهام نفس المرضى في الخطة الأول، وإلا مسئولة نفس نوع المهمة في الفرع النهارده"""
    if p["own"] == "المدير" or not PLAN_ALL:
        return None
    gs = next((g for k, g in OWN_G if k in p["t"]), None)
    if not gs:
        return None
    cnt = defaultdict(int)
    for pid in p.get("pids") or []:
        for t in (PLAN or {}).get(pid) or []:
            if t.get("o"):
                cnt[t["o"]] += 1
    if not cnt:
        for t in PLAN_ALL:
            if t.get("br") == PB.get(p["b"]) and t.get("g") in gs and t.get("o") and t["o"] != "المدير":
                cnt[t["o"]] += 2 if t["g"] == gs[0] else 1
    if not cnt:
        return None
    L = sorted(cnt, key=lambda o: -cnt[o])
    return " + ".join(L[:2])
nrm = lambda t: re.sub(r"\s+", " ", re.sub("[أإآ]", "ا", str(t or "")).replace("ة", "ه").replace("ى", "ي")).strip()


def load_audit():
    try:
        return json.load(open("data/audit.json", encoding="utf-8"))
    except Exception as e:
        print("digest_fin: audit.json", str(e)[:80])
        return None


def load_state(T):
    """آخر حالة قبل النهارده (أرقام الخطوات المفتوحة بس — من غير أسامي ولا مبالغ)"""
    try:
        S = json.load(open(STATE_F, encoding="utf-8")).get("days") or {}
        ks = sorted(k for k in S if k < T)
        return S[ks[-1]] if ks else None
    except Exception:
        return None


def save_state(T, AUD):
    if not AUD or os.environ.get("DIGEST_PREVIEW"):
        return
    try:
        S = json.load(open(STATE_F, encoding="utf-8")).get("days") or {} if os.path.exists(STATE_F) else {}
        S[T] = {b: sorted(str(d.get("id")) for d in AUD.get("debts") or [] if AUD_B.get(d.get("b")) == b and d.get("d") and d["d"] <= T) for b in BR}
        S = {k: S[k] for k in sorted(S)[-10:]}   # التقرير الأسبوعي بيقارن بحالة من أسبوع
        json.dump({"days": S}, open(STATE_F, "w", encoding="utf-8"), separators=(",", ":"))
    except Exception as e:
        print("digest_fin: state", str(e)[:80])


def steps_money(b, x, T, AUD, STATE):
    out = []
    if not AUD:
        return out
    debts = [d for d in AUD.get("debts") or [] if AUD_B.get(d.get("b")) == b and d.get("d") and d["d"] <= T]
    prev_ids = set((STATE or {}).get(b) or [])
    now_ids = {str(d["id"]) for d in AUD.get("debts") or []}
    # زيارات بعد الخدمة: من المراجعة (نفس رقم المريض) أو من المواعيد المالية (بالاسم)
    seen = defaultdict(set)
    for a in (AUD.get("appts") or []) + [s_ for s_ in AUD.get("steps") or [] if s_.get("st") == "COMPLETED"]:
        if AUD_B.get(a.get("b")) == b and a.get("d") and a["d"] <= T and not CALL_T.search(str(a.get("s") or "")):
            seen["id:" + str(a.get("pid"))].add(a["d"])
    ref_by_name = {}
    for r, n in x.nm.items():
        ref_by_name.setdefault(nrm(n), r)
    for d in debts:
        r = ref_by_name.get(nrm(d.get("p")))
        if r:
            for a in x.byp.get(r, []):
                if a["st"] in DONE and a["d"] <= T:
                    seen["id:" + str(d["pid"])].add(a["d"])
    by_p = defaultdict(list)
    for d in debts:
        by_p[str(d["pid"])].append(d)
    came, older, today = [], [], []
    for pid, L in by_p.items():
        first = min(d["d"] for d in L)
        later = {v for v in seen["id:" + pid] if v > first}
        rem = sum(float(d.get("rem") or 0) for d in L)
        item = {"n": L[0].get("p") or "", "age": age(first, T), "rem": rem, "k": len(L), "pid": pid,
                "s": "، ".join(sorted({str(d.get("s") or "") for d in L}))[:60], "dr": L[0].get("dr") or "", "later": len(later), "ids": {str(d["id"]) for d in L}}
        if rem < 20:      # فروق قروش/تقريب
            continue
        if later:
            came.append(item)
        elif first < T:
            older.append(item)
        else:
            today.append(item)
    solved = len([i for i in prev_ids if i not in now_ids]) if STATE else 0
    def fmt(i, extra=""):
        t = f"{H(i['s'])} · {i['k']} خدمة · باقي {money(i['rem'])} جنيه{extra}"
        if PLAN is not None:
            import digest_plan
            t += " · " + digest_plan.task_badge(PLAN.get(i["pid"]))
        return t
    def fillp(L):
        return [i["pid"] for i in L]
    if came:
        out.append({"lvl": 3, "b": b, "t": "🚨 حضر تاني وسايب خدمة اتعملت ومتدفعتش", "own": "الاستقبال + الحسابات", "pids": fillp(came),
                    "items": sorted(({"n": i["n"], "age": i["age"], "x": fmt(i, f" · حضر {i['later']} مرة بعدها"), "raw": 1, "pid": i["pid"], "remv": i["rem"], "came": 1} for i in came), key=lambda i: -i["age"]),
                    "n": len(came), "val": sum(i["rem"] for i in came), "prev": None, "solved": 0, "unit": "مريض"})
    lim30 = (date.fromisoformat(T) - timedelta(days=30)).isoformat()
    fresh = [i for i in older if (date.fromisoformat(T) - timedelta(days=i["age"])).isoformat() >= lim30]
    oldq = [i for i in older if i not in fresh]
    if oldq:
        out.append({"lvl": 1, "b": b, "t": "🗂️ فلوس قديمة (أكتر من 30 يوم) — في مراجعة الفواتير", "own": "الحسابات", "pids": fillp(oldq), "oldq": 1,
                    "items": [], "n": len(oldq), "val": sum(i["rem"] for i in oldq), "prev": None, "solved": 0, "unit": "مريض"})
    if fresh:
        out.append({"lvl": 2, "b": b, "t": "💸 خدمة اتعملت ومتدفعتش (آخر 30 يوم)", "own": "الاستقبال + الحسابات", "pids": fillp(fresh),
                    "items": sorted(({"n": i["n"], "age": i["age"], "x": fmt(i), "raw": 1, "pid": i["pid"], "remv": i["rem"]} for i in fresh), key=lambda i: -i["age"]),
                    "n": len(fresh), "val": sum(i["rem"] for i in fresh), "prev": None, "solved": 0, "unit": "مريض"})
    if today:
        out.append({"lvl": 2, "b": b, "t": "💸 خدمة اتعملت النهارده ومتدفعتش", "own": "الاستقبال", "pids": fillp(today),
                    "items": [{"n": i["n"], "age": None, "x": fmt(i) + (" · " + H(i["dr"]) if i["dr"] else ""), "raw": 1, "pid": i["pid"], "remv": i["rem"], "today": 1} for i in today],
                    "n": len(today), "val": sum(i["rem"] for i in today), "prev": None, "solved": 0, "unit": "مريض"})
    if out and solved:
        out[0]["solved"] = solved   # خدمات اتدفعت (اتقفلت) من امبارح
        out[0]["unitS"] = "خدمة"
    # حضر النهارده (زيارة مش مكالمة) ومفيش ولا خدمة متسجلة اتعملت
    st_today = {str(s_["pid"]) for s_ in AUD.get("steps") or [] if s_.get("d") == T and s_.get("st") == "COMPLETED"}
    if AUD.get("to", "") >= T:
        nos = {}
        for a in AUD.get("appts") or []:
            if AUD_B.get(a.get("b")) == b and a.get("d") == T and not CALL_T.search(str(a.get("s") or "")) and str(a.get("pid")) not in st_today:
                nos.setdefault(str(a.get("pid")), {"n": a.get("p") or "", "age": None, "x": f"{a.get('s') or ''} · {a.get('dr') or ''}"})
        if nos:
            out.append({"lvl": 1, "b": b, "t": "🧾 حضر النهارده ومفيش خدمة اتسجلت اتعملت في العمليات (للمراجعة — مش للسكرتارية لسه)", "own": "الاستقبال", "mgr_only": 1,
                        "items": list(nos.values()), "n": len(nos), "val": 0, "prev": None, "solved": 0, "unit": "مريض"})
    return out


# ================= 🩺 كشوفات النهارده (في جزء المدير) =================
_DOCAR = {}


def doc_ar(en):
    """اسم الدكتور بالعربي من جدول الداشبورد (DOC_MAP في index.html)"""
    if not _DOCAR:
        try:
            src = open("index.html", encoding="utf-8").read()
            i = src.index("var DOC_MAP={")
            blk = src[i:src.index("};", i)]
            for k, v in re.findall(r"'([^']+)'\s*:\s*'([^']+)'", blk):
                _DOCAR[k.strip().lower()] = v
        except Exception:
            _DOCAR["_"] = ""
    en = str(en or "")
    v = _DOCAR.get(en.strip().lower())
    return ("د. " + v) if v else en.replace("Dr. ", "د. ").replace("Dr ", "د. ")

ATT = {"completed", "checked in", "checkedin", "in progress", "inprogress"}


def exams_today(T, alerts, dash_url):
    """لكل دكتور: كام كشف واتحجز لكام · اللي اتحجزله: باقة كام جلسة ودفع كام النهارده · اللي ما اتحجزلوش: ملحوظاته + لينك مواعيده"""
    import urllib.parse
    ks = [x for x in (alerts or {}).get("kashf_pending") or []
          if str(x.get("kashf_date") or "")[:10] == T and str(x.get("kashf_status") or "").lower() in ATT]
    if not ks:
        return ""
    data = load()
    B = {b: Br(data, b) for b in BR} if data else {}
    BRK = {"BODYFIX Center": "haram", "FIX ZONE": "dokki"}

    def money_of(x):
        b = B.get(BRK.get(x.get("branch")))
        if not b:
            return None
        ref = None
        n0 = nrm(x.get("name"))
        for r, n in b.nm.items():
            if nrm(n) == n0:
                ref = r
                break
        if not ref:
            return None
        paid = sum(p["amt"] for p in b.pay if p["d"] == T and p["pid"] == ref and not p["bal"] and not p["ref"])
        inv = [i for i in b.inv if i["d"] == T and i["pid"] == ref]
        return paid, sum(i["tot"] - i["disc"] for i in inv)
    out = ['<h3 style="margin:18px 0 6px">🩺 كشوفات النهارده</h3>']
    for br in ("BODYFIX Center", "FIX ZONE"):
        L = [x for x in ks if x.get("branch") == br]
        if not L:
            continue
        docs = defaultdict(list)
        for x in L:
            docs[x.get("doctor") or "—"].append(x)
        head = " · ".join(f'{H(doc_ar(d))} {len(v)} ({sum(1 for x in v if x.get("next_pt"))} اتحجزلهم)' for d, v in sorted(docs.items(), key=lambda kv: -len(kv[1])))
        rows = []
        for d, v in sorted(docs.items(), key=lambda kv: -len(kv[1])):
            for x in sorted(v, key=lambda x: bool(x.get("next_pt"))):
                m = money_of(x)
                pay = (f' · دفع النهارده <b>{money(m[0])}</b>' + (f' من {money(m[1])}' if m[1] else "")) if m and (m[0] or m[1]) else (" · مدفعش حاجة النهارده" if m else "")
                if x.get("next_pt"):
                    pk = f'باقة <b>{x["pkg_size"]} جلسة</b>' if x.get("pkg_size") else "اتحجزله جلسات (من غير فاتورة باقة)"
                    rows.append(f'<li style="margin:3px 0">✅ {H(x.get("name"))} {sub("— " + H(doc_ar(d)))} — {pk}{pay}</li>')
                else:
                    notes = [a.get("note") for a in x.get("appts") or [] if (a.get("note") or "").strip()]
                    nt = "<br>".join("📝 " + H(n[:200]) for n in dict.fromkeys(notes)) or sub("مفيش ملحوظات")
                    link = f'{dash_url}#pt={urllib.parse.quote(str(x.get("pid") or "") + "|" + str(x.get("name") or ""))}'
                    rows.append(f'<li style="margin:5px 0">❌ <b>{H(x.get("name"))}</b> {sub("— " + H(doc_ar(d)))} — ما اتحجزلوش{pay}'
                                f' · <a href="{link}" style="color:#2563eb">📅 مواعيده الجاية</a><div style="font-size:12px;color:#334155;margin-top:2px">{nt}</div></li>')
        out.append(f'<div style="font-size:13px;margin:6px 0"><b>🏥 {"الهرم" if br == "BODYFIX Center" else "الدقي"}</b>: {head}'
                   f'<ul style="margin:3px 0;padding-inline-start:18px">{"".join(rows)}</ul></div>')
    return "".join(out)
