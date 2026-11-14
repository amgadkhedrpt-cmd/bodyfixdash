# -*- coding: utf-8 -*-
"""🎯 إيميل المتابعة الشهرية — أول كل شهر: مؤشرات الشهر اللي خلص للفرعين، مقارنة بالشهر اللي قبله ومتوسط 3 شهور، والهدف.
نفس حسبة تاب «🎯 المتابعة الشهرية» في صفحة التحليلات (fin_kpi.js). الأهداف من شيت الداشبورد (KPITG|haram / KPITG|dokki)."""
import json, re
from datetime import date, datetime, timedelta
from collections import defaultdict

PTS = {"Enum5", "Enum13", "Enum17", "Enum32"}
EXAM = "Enum1"
LIVE = {"OPEN", "CONFIRMED", "CHECKEDIN", "INPROGRESS", "DELAYED"}
STOP_DAYS = 14
MAIN = {"dokki": (re.compile(r"kashef|كاشف", re.I), "د. محمود"), "haram": (re.compile(r"amgad|أمجد|امجد", re.I), "د. أمجد")}
BRN = {"haram": "الهرم", "dokki": "الدقي"}
MN = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
DEF = {"conv": {"dir": "up", "t": 85, "t2": 90}, "docConv": {"dir": "up", "t": 90}, "stop": {"dir": "down", "t": 15, "t2": 10},
       "s12": {"dir": "up", "t": 55, "t2": 60}, "beyond": {"dir": "up", "t": 60, "t2": 65}, "th40": {"dir": "down", "t": 20},
       "cancel": {"dir": "down", "t": 20}, "docS12": {"dir": "up", "t": 60}, "docStop": {"dir": "down", "t": 20, "t2": 10},
       "khaled": {"dir": "up", "t": 60}, "walk": {"dir": "down", "t": 25, "t2": 15}, "fb": {"dir": "up", "t": 85, "t2": 90}}
H = lambda x: str(x if x is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def ml(k):
    return f"{MN[int(k[5:7]) - 1]} {k[:4]}"


def add_m(k, n):
    y, m = int(k[:4]), int(k[5:7]) + n
    while m < 1:
        m += 12; y -= 1
    while m > 12:
        m -= 12; y += 1
    return f"{y}-{m:02d}"


def days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def n_ar(t):
    t = re.sub("[أإآٱ]", "ا", str(t or "")).replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"\s+", " ", t).strip().lower()


def src_of(s):
    n = n_ar(s)
    if re.search(r"khaled|خالد", n):
        return "khaled"
    if "مرور" in n:
        return "walk"
    if re.search(r"face|فيس", n):
        return "fb"
    return "other" if n else ""


class Base:
    """apt: [{d, h, st (UPPER), ty, pid, doc, pn}] · inv: [{d, pid, src}]"""

    def __init__(self, apt, inv, td):
        self.td = td
        self.apt = apt
        byp = defaultdict(list)
        for a in apt:
            if a["pid"]:
                byp[a["pid"]].append(a)
        src = {}
        for i in sorted(inv, key=lambda x: x["d"]):
            if i["pid"] and i.get("src") and i["pid"] not in src:
                src[i["pid"]] = i["src"]
        self.P = []
        for pid, L in byp.items():
            L.sort(key=lambda a: (a["d"], a["h"]))
            ses = [a for a in L if a["st"] == "COMPLETED" and a["ty"] in PTS]
            ex = [{"d": a["d"], "doc": a["doc"]} for a in L if a["st"] == "COMPLETED" and a["ty"] == EXAM]
            fv = next((a for a in L if a["st"] == "COMPLETED"), None)
            dc = defaultdict(int)
            for a in ses:
                if not re.match(r"^\s*follow[\s-]*up\s*$", a["doc"] or "", re.I):
                    dc[a["doc"]] += 1
            l3, th = {a["doc"] for a in ses[-3:]}, ""
            for d, c in sorted(dc.items(), key=lambda x: -x[1]):
                if c >= 0.4 * len(ses) and d in l3:
                    th = d; break
            sd = [a["d"] for a in ses]
            self.P.append({"pid": pid, "ses": sd, "n": len(sd), "ex": ex, "fut": any(a["d"] >= td and a["st"] in LIVE for a in L),
                           "first": fv["d"] if fv else None, "s1": sd[0] if sd else None, "s12": sd[11] if len(sd) >= 12 else None,
                           "last": sd[-1] if sd else None, "th": th, "src": src_of(src.get(pid, ""))})
        hist = [p for p in self.P if p["s1"] and days(p["s1"], td) > 150]
        self.pr = {}
        for n in range(1, 12):
            r = [p for p in hist if p["n"] >= n]
            self.pr[n] = (sum(1 for p in r if p["n"] >= 12) / len(r)) if len(r) >= 10 else None

    def stat(self, p):
        if p["n"] >= 12:
            return "done"
        if p["fut"] or (p["last"] and days(p["last"], self.td) <= STOP_DAYS):
            return "run"
        return "stop"

    def calc(self, b, M):
        td, P = self.td, self.P
        rat = lambda a, f: (sum(1 for x in a if f(x)) / len(a)) if a else None
        w = (add_m(M, -3), add_m(M, -1))
        inw = lambda d, ww=w: bool(d) and ww[0] <= d[:7] <= ww[1]
        coh = [p for p in P if inw(p["s1"])]

        def proj(a):
            if not a:
                return None
            s = 0.0
            for p in a:
                st = self.stat(p)
                s += 1 if st == "done" else ((self.pr.get(p["n"]) or 0) if st == "run" else 0)
            return s / len(a)
        stp = lambda a: rat(a, lambda p: self.stat(p) == "stop" and p["n"] <= 5)
        exm = [(p, e) for p in P for e in p["ex"] if e["d"][:7] == M]
        conv = lambda a: rat(a, lambda x: any(d >= x[1]["d"] for d in x[0]["ses"]))
        main = MAIN.get(b)
        ap = [a for a in self.apt if a["d"][:7] == M and a["ty"] in PTS and a["d"] < td and a["st"] in ("COMPLETED", "CANCELED", "NOSHOW")]
        by = [p for p in P if inw(p["s12"]) and days(p["s12"], td) >= STOP_DAYS]
        w6 = (add_m(M, -6), add_m(M, -1))
        G = defaultdict(list)
        for p in P:
            if p["th"] and inw(p["s1"], w6):
                G[p["th"]].append(p)
        thr = [(d, len(a), proj(a)) for d, a in G.items() if len(a) >= 8]
        thn = sum(x[1] for x in thr)
        thl = sum(x[1] for x in thr if x[2] < 0.4)
        docp, docby = [], "th"
        if main:
            docp = [p for p in coh if main[0].search(p["th"] or "")]
            if len(docp) < 5:
                docp, docby = [p for p in coh if any(main[0].search(e["doc"] or "") for e in p["ex"])], "ex"
        fbx = [(p, e) for p in P if p["src"] == "fb" for e in p["ex"] if inw(e["d"], (add_m(M, -2), M))]
        kh = [p for p in coh if p["src"] == "khaled"]
        wk = [p for p in coh if p["src"] == "walk"]
        st = defaultdict(int)
        for p in coh:
            st[self.stat(p)] += 1
        return {"newP": sum(1 for p in P if p["first"] and p["first"][:7] == M),
                "ses": sum(1 for a in self.apt if a["d"][:7] == M and a["st"] == "COMPLETED" and a["ty"] in PTS),
                "exN": len(exm), "conv": conv(exm),
                "docConv": conv([x for x in exm if main[0].search(x[1]["doc"] or "")]) if main else None,
                "stop": stp(coh), "s12a": rat(coh, lambda p: p["n"] >= 12), "s12": proj(coh), "beyond": rat(by, lambda p: p["n"] > 12 or p["fut"]),
                "th40": (thl / thn) if thn else None, "cancel": (sum(1 for a in ap if a["st"] != "COMPLETED") / len(ap)) if ap else None,
                "docS12": proj(docp), "docStop": stp(docp), "docN": len(docp), "docBy": docby,
                "khaled": proj(kh), "khN": len(kh), "walk": stp(wk), "wkN": len(wk), "fb": conv(fbx), "fbN": len(fbx),
                "cohN": len(coh), "st": dict(st), "w": w,
                "low": sorted([(d, n, v) for d, n, v in thr if v < 0.4], key=lambda x: x[2])}


def load_branch(data, b, td):
    import digest_fin as F
    apt, inv = [], []
    for g in F.rows(data, "apt", b):
        ty = g("type") or ""
        st = str(g("status") or "").upper().replace("_", "").replace(" ", "")
        if ty in F.NOT_VISIT or st in ("NOTE", "WAITING"):
            continue
        if re.search(r"waiting list", str(g("room.name") or ""), re.I):
            continue
        d = F.cday(g("start"))
        if d:
            apt.append({"d": d, "h": F.chour(g("start")), "st": st, "ty": ty, "pid": g("patient.referenceId"), "doc": g("doctor.name") or ""})
    for g in F.rows(data, "inv", b):
        d = F.cday(g("createdAt"))
        if d:
            inv.append({"d": d, "pid": g("patient.referenceId"), "src": g("referralSource.name") or ""})
    return Base(apt, inv, td)


def targets(R):
    """R = reasons من شيت الداشبورد (digest.plan_data)"""
    out = {b: {k: dict(v) for k, v in DEF.items()} for b in ("haram", "dokki")}
    try:
        R = R or {}
        for b in out:
            v = R.get("KPITG|" + b)
            if v:
                for k, x in (json.loads(v) or {}).items():
                    if k in out[b] and isinstance(x, dict):
                        out[b][k].update({kk: vv for kk, vv in x.items() if kk in ("t", "t2")})
    except Exception as e:
        print(f"kpi targets: {str(e)[:80]}")
    return out


def _fp(v):
    return "—" if v is None else f"{round(v * 100)}%"


def _fn(v):
    return "—" if v is None else f"{int(v):,}"


def branch_html(b, B, M, T):
    C, Pv = B.calc(b, M), B.calc(b, add_m(M, -1))
    A3 = [B.calc(b, add_m(M, -i)) for i in (1, 2, 3)]
    av = lambda k: (lambda v: sum(v) / len(v) if v else None)([x[k] for x in A3 if x[k] is not None])
    main = MAIN.get(b)

    def tg(k):
        t = T.get(k)
        if not t:
            return "متابعة بس"
        s = ("" if t["dir"] == "up" else "أقل من ") + f"{t['t']:g}%"
        return s + (f"، وبعدها {t['t2']:g}%" if t.get("t2") is not None else "")

    def ok(k, v):
        t = T.get(k)
        if not t or v is None:
            return ""
        g = v * 100 >= t["t"] if t["dir"] == "up" else v * 100 <= t["t"]
        return '<b style="color:#15803d">✔</b>' if g else '<b style="color:#b91c1c">✖</b>'

    def arrow(k, a, p):
        if a is None or p is None or abs(a - p) < 0.005:
            return ""
        good = (a < p) if (T.get(k) or {}).get("dir") == "down" else (a > p)
        return f' <span style="color:{"#15803d" if good else "#b91c1c"};font-size:11px">{"▲" if a > p else "▼"}</span>'

    def row(g, lbl, k, pct, note="", n=None):
        f = _fp if pct else _fn
        nn = f' <span style="color:#64748b;font-size:11px">({n})</span>' if n is not None else ""
        nt = f'<br><span style="color:#64748b;font-size:11px">{H(note)}</span>' if note else ""
        return (f"<tr><td>{H(g)}</td><td>{H(lbl)}{nt}</td><td style='text-align:center'><b>{f(C[k])}</b>{arrow(k, C[k], Pv[k])}{nn}</td>"
                f"<td style='text-align:center'>{f(Pv[k])}</td><td style='text-align:center'>{f(av(k))}</td><td>{tg(k) if pct else 'متابعة بس'}</td>"
                f"<td style='text-align:center'>{ok(k, C[k]) if pct else ''}</td></tr>")
    R = [row("الحجم", "مرضى جداد", "newP", 0), row("", "جلسات علاج طبيعي", "ses", 0),
         row("الكشوفات", "عدد كشوفات العلاج الطبيعي", "exN", 0), row("", "من الكشف لعلاج", "conv", 1)]
    if main:
        R.append(row("", f"كشوفات {main[1]}: بدأوا علاج", "docConv", 1))
    R += [row("الاستمرار", "وقفوا بين 1 و5 جلسات", "stop", 1, "من اللي بدأوا في الـ 3 شهور اللي فاتت"),
          row("", "كمّلوا 12 جلسة (متوقع)", "s12", 1, f"فعلي {_fp(C['s12a'])} + احتمال الجاريين"),
          row("", "كمّلوا بعد الـ 12", "beyond", 1), row("", "مرضى مع أخصائيين تحت 40%", "th40", 1, "آخر 6 شهور"),
          row("", "مواعيد اتلغت أو ما جاش", "cancel", 1)]
    if main:
        R += [row(f"مرضى {main[1]}", "كمّلوا 12 (متوقع)", "docS12", 1, "اللي كشف عليهم" if C["docBy"] == "ex" else "", C["docN"]),
              row("", "وقفوا بين 1 و5", "docStop", 1)]
    R += [row("حسب المصدر", "د. خالد: كمّلوا 12 (متوقع)", "khaled", 1, "", C["khN"]), row("", "مرور عابر: وقفوا بين 1 و5", "walk", 1, "", C["wkN"]),
          row("", "فيسبوك: من الكشف لعلاج", "fb", 1, "آخر 3 شهور", C["fbN"])]
    st = C["st"]
    run = st.get("run", 0)
    sm = (f'<div style="font-size:12px;color:#334155;margin:6px 0">بدأوا علاج ({ml(C["w"][0])} – {ml(C["w"][1])}): <b>{C["cohN"]}</b> · '
          f'كمّلوا 12: <b>{st.get("done", 0)}</b> · جاريين: <b>{run}</b> · وقفوا: <b>{st.get("stop", 0)}</b></div>')
    low = ""
    if C["low"]:
        low = '<div style="font-size:12px;color:#b91c1c;margin-top:4px">أخصائيين تحت 40% متوقع: ' + "، ".join(f"{H(d)} ({_fp(v)}، {n} مريض)" for d, n, v in C["low"]) + "</div>"
    head = "".join(f"<th style='background:#0E4D4A;color:#fff;padding:5px 6px;font-size:12px'>{h}</th>" for h in
                   ["", "المؤشر", ml(M), ml(add_m(M, -1)), "متوسط 3 شهور", "الهدف", ""])
    return (f'<h3 style="margin:18px 0 4px;color:#0E4D4A">{BRN[b]}</h3>{sm}'
            f'<table style="border-collapse:collapse;width:100%;font-size:12.5px" border="1" cellpadding="5" bordercolor="#e2e8f0">'
            f"<tr>{head}</tr>{''.join(R)}</table>{low}")


def build(today_s, reasons):
    """بيرجع (الموضوع، HTML) لإيميل الشهر اللي خلص — أو None لو مفيش بيانات"""
    import digest_fin as F
    data = F.load()
    if not data:
        return None
    M = add_m(today_s[:7], -1)
    T = targets(reasons)
    parts = []
    for b in ("dokki", "haram"):
        try:
            B = load_branch(data, b, today_s)
            if B.P:
                parts.append(branch_html(b, B, M, T[b]))
        except Exception as e:
            print(f"kpi {b}: {e}")
    if not parts:
        return None
    html = (f'<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:860px">'
            f'<h2 style="color:#0E4D4A;margin:0 0 4px">🎯 المتابعة الشهرية — {ml(M)}</h2>'
            f'<div style="color:#64748b;font-size:12px">نفس مؤشرات المتابعة الشهرية مع د. محمود. الاستمرار محسوب على اللي بدأوا علاج في الـ 3 شهور اللي قبل الشهر، '
            f'وحالتهم النهارده. «متوقع» = اللي كمّلوا + احتمال كمال المرضى الجاريين من تاريخ الفرع. الأهداف بتتعدّل من تاب «🎯 المتابعة الشهرية».</div>'
            + "".join(parts) + "</div>")
    return f"🎯 المتابعة الشهرية BODYFIX — {ml(M)}", html
