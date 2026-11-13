# Complete-errors snapshot — the same comparison as the dashboard's «مراجعة الكومبليت» tab (index.html _aud_doAudit),
# run every night on data/audit.json so errors fixed later in the month are still kept for payroll.
import json, re, urllib.request

REQ_URL = "https://script.google.com/macros/s/AKfycbzy1UbUmQmVOLnrgP69vALV_RH8VlejQ5Npo9a9xS1u9Hhz5oRiPKF7GIgSVYAxCp_m/exec"
BIDI = re.compile("[‎‏‪-‮⁦-⁩ـ]")
COLS = ["التاريخ", "اسم المريض", "اسم الدكتور", "الخدمة", "عدد المواعيد", "عدد العمليات", "الملحوظة", "الفرع", "أول ما ظهر"]


def audN(x):
    s = BIDI.sub("", str(x or ""))
    s = re.sub("[أإآ]", "ا", s).replace("ى", "ي").replace("ة", "ه")
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"[\s\d.٠-٩]+$", "", s).strip().lower()


def default_map(html):
    i = html.index("var AUD_MAP_DEFAULT=") + len("var AUD_MAP_DEFAULT=")
    t = html[i:html.index("];", i) + 1]
    t = re.sub(r"([{,]\s*)(g|cat|on|a|s):", r'\1"\2":', t).replace("'", '"')
    return json.loads(t)


def overrides():
    """AUDMAP|<group> rows saved from the dashboard (the user's edits to the service table)"""
    try:
        raw = urllib.request.urlopen(REQ_URL + "?action=getAll&callback=cb", timeout=40).read().decode("utf-8")
        j = json.loads(raw[raw.index("(") + 1: raw.rindex(")")])
        out = {}
        for k, v in (j.get("reasons") or {}).items():
            if k.startswith("AUDMAP|") and str(v).strip():
                try:
                    out[k[7:]] = json.loads(v)
                except Exception:
                    pass
        return out, None
    except Exception as e:
        return {}, str(e)[:120]


def build_map(base, ovr):
    m = [dict(r, a=list(r["a"]), s=list(r["s"])) for r in base]
    for g, o in ovr.items():
        i = next((k for k, r in enumerate(m) if r["g"] == g), -1)
        if o and o.get("del"):
            if i >= 0:
                m.pop(i)
            continue
        if not o:
            continue
        row = {"g": g, "on": 1 if o.get("on") else 0, "a": o.get("a") or [], "s": o.get("s") or [],
               "cat": o["cat"] if o.get("cat") is not None else (m[i].get("cat", "") if i >= 0 else "")}
        if i >= 0:
            m[i] = row
        else:
            m.append(row)
    A, S = {}, {}
    for r in m:
        if not r.get("on"):
            continue
        for x in r["a"]:
            k = audN(x)
            if k:
                A[k] = r["g"]
        for x in r["s"]:
            k = audN(x)
            if k:
                S[k] = r["g"]
    return A, S


def fmt(d):
    return "%s/%s/%s" % (d[8:10], d[5:7], d[0:4])


def do_audit(aRows, oRows):
    """aRows/oRows: dicts {d, p, dr, svc, b}; mirrors _aud_doAudit exactly"""
    def build(rows):
        m, br = {}, {}
        for r in rows:
            if not r["d"] or not str(r["p"] or "").strip():
                continue
            k = (r["d"], str(r["p"]).strip())
            sk = (str(r["dr"] or "").strip(), r["svc"])
            m.setdefault(k, {})
            m[k][sk] = m[k].get(sk, 0) + 1
            br.setdefault(k, r.get("b", ""))
        return m, br
    am, ab = build(aRows)
    om, ob = build(oRows)
    keys = list(dict.fromkeys(list(am) + list(om)))
    keys.sort(key=lambda k: (k[0], k[1]))
    out = []
    for k in keys:
        date, pat = fmt(k[0]), k[1]
        b = ab.get(k) or ob.get(k) or ""
        add = lambda doc, svc, a, o, note: out.append([date, pat, doc, svc, a, o, note, b])
        ac, oc = dict(am.get(k, {})), dict(om.get(k, {}))
        if not oc:
            for (doc, svc), c in ac.items():
                for _ in range(c):
                    add(doc, svc, 1, 0, "موعد بدون كومبليت")
            continue
        if not ac:
            for (doc, svc), c in oc.items():
                for _ in range(c):
                    add(doc, svc, 0, 1, "كومبليت بدون موعد")
            continue
        for sk in list(ac):
            if oc.get(sk):
                mx = min(ac[sk], oc[sk])
                ac[sk] -= mx
                oc[sk] -= mx
                if not ac[sk]:
                    del ac[sk]
                if not oc[sk]:
                    del oc[sk]
        if not ac and not oc:
            continue
        lA = [sk for sk, c in ac.items() for _ in range(c)]
        lO = [sk for sk, c in oc.items() for _ in range(c)]
        mA, mO = [False] * len(lA), [False] * len(lO)
        for i, (da, sa) in enumerate(lA):
            for j, (do, so) in enumerate(lO):
                if not mO[j] and da == do:
                    mA[i] = mO[j] = True
                    if sa != so:
                        add(da, "(المواعيد: %s / العمليات: %s)" % (sa, so), 1, 1, "اختلاف في الخدمة")
                    break
        uA = [x for i, x in enumerate(lA) if not mA[i]]
        uO = [x for j, x in enumerate(lO) if not mO[j]]
        mA2, mO2 = [False] * len(uA), [False] * len(uO)
        for i, (da, sa) in enumerate(uA):
            for j, (do, so) in enumerate(uO):
                if not mO2[j] and sa == so:
                    mA2[i] = mO2[j] = True
                    add("(المواعيد: %s / العمليات: %s)" % (da, do), sa, 1, 1, "اختلاف اسم الدكتور")
                    break
        fA = [x for i, x in enumerate(uA) if not mA2[i]]
        fO = [x for j, x in enumerate(uO) if not mO2[j]]
        pairs = min(len(fA), len(fO))
        for i in range(pairs):
            add("(المواعيد: %s / العمليات: %s)" % (fA[i][0], fO[i][0]), "(المواعيد: %s / العمليات: %s)" % (fA[i][1], fO[i][1]), 1, 1,
                "اختلاف اسم الدكتور واختلاف في الخدمة")
        for i in range(pairs, len(fA)):
            add(fA[i][0], fA[i][1], 1, 0, "موعد بدون كومبليت")
        for j in range(pairs, len(fO)):
            add(fO[j][0], fO[j][1], 0, 1, "كومبليت بدون موعد")
    return out


def snapshot(audit, html, upto):
    """errors for session days up to `upto` (YYYY-MM-DD), all services in the table, completed steps only (the tab's default)"""
    ovr, err = overrides()
    A, S = build_map(default_map(html), ovr)
    st_ok = lambda s: bool(re.search(r"complet|done|finish|منته|مكتمل", str(s or ""), re.I))
    aRows = [{"d": r["d"], "p": r["p"], "dr": r.get("dr"), "b": r.get("b", ""), "svc": A[audN(r.get("s"))]}
             for r in audit.get("appts", []) if r.get("d", "") <= upto and A.get(audN(r.get("s")))]
    oRows = [{"d": r["d"], "p": r["p"], "dr": r.get("dr"), "b": r.get("b", ""), "svc": S[audN(r.get("s"))]}
             for r in audit.get("steps", []) if r.get("d", "") <= upto and st_ok(r.get("st")) and S.get(audN(r.get("s")))]
    return do_audit(aRows, oRows), {"overrides": len(ovr), "override_error": err, "appts": len(aRows), "steps": len(oRows)}
