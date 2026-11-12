"""
BODYFIX — حساب تنبيهات اللوحة الرئيسية
بيتنده من scraper.py على كل المواعيد اللي اتسحبت من Medicolize
وبيطلع alerts.json صغير بدل ما ننشر التاريخ كله.

1) dropped  : مرضى منتظمين انقطعوا
   - منتظم = حضر 4 أيام مختلفة أو أكتر في الـ 14 يوم اللي بتنتهي بآخر حضور له
             (يعني يومين في الأسبوع على الأقل)
   - منقطع = آخر حضور فعلي له من 4 لـ 7 أيام (DROP_DAYS+1 .. LOOKBACK_DAYS)
   - الحضور = Completed / Checked In / In Progress فقط
     (Canceled / No Show / Waiting List مش حضور)
   - لو عنده ميعاد محجوز جاي بيظهر في قسم لوحده (has_next)

2) day_counts : عدد المواعيد لكل دكتور ولكل فرع في النهارده ونفس اليوم الأسبوع اللي فات
   (من غير الملغي وقائمة الانتظار والملاحظات) — الصفحة بتحدد الفرع من شيت الدكاترة
"""
from datetime import datetime, timezone, timedelta, date
from collections import defaultdict, Counter
import re

try:
    from zoneinfo import ZoneInfo
    CAIRO = ZoneInfo("Africa/Cairo")
except Exception:  # احتياطي لو مفيش tzdata
    CAIRO = timezone(timedelta(hours=2))

DROP_DAYS      = 3    # منقطع لو عدى 4 أيام أو أكتر من غير حضور
REGULAR_WINDOW = 14   # أيام نافذة الانتظام
REGULAR_MIN    = 4    # أقل عدد أيام حضور في النافذة (= يومين في الأسبوع)
RECENT_DAYS    = 7    # القايمة الأساسية: آخر حضور من 4 لـ 7 أيام
LOOKBACK_DAYS  = 30   # قسم "أقدم" مقفول: من 8 لـ 30 يوم

# أنواع المواعيد بالأسامي الحقيقية من Medicolize (Enum5 = جلسة علاج طبيعي · Enum13 = على منطقتين)
PT_TYPES       = {"جلسة علاج طبيعي", "جلسة علاج طبيعي علي منطقتين", "جلسة علاج طبيعي على منطقتين",
                  "جلسة"}   # "جلسة" = الاسم القديم من الجدول الاحتياطي، احتياطي بس
EVAL_TYPES     = {"تقييم الجلسه الأخيره", "تقييم الجلسة الأخيرة", "اعادة تقييم", "إعادة تقييم"}
CYCLE          = 12   # عدد جلسات الدورة — بعد 12 العد يرجع 1
MILESTONES     = {3, 6, 9, 12}   # الجلسات اللي تظهر في قايمة النهارده
RENEW_AT       = {11, 12}        # جلسة النهارده دي = الباقة بتخلص — اعرض التجديد (بيظهر في أداة التحصيل)
FINISHED_DAYS  = 60              # "خلص باقة ومجددش": آخر جلسة (رقم 12) في آخر 60 يوم
COURSE_GAP     = 21   # انقطاع أكتر من 3 أسابيع = كورس جديد


def _is_pt(t):
    return (t or "").strip() in PT_TYPES


# ── الخدمات العلاجية (عشان نعرف المريض بيعمل أكتر من خدمة) ──
NOT_SERVICE = ("متابع", "تقييم", "كشف", "منقطع", "موعد محجوز", "الغاء", "إلغاء", "تقرير", "استرداد", "feedback",
               "شكو", "تصوير", "تغذ", "مونجارو", "اونلاين", "أونلاين", "منزلي", "gym")
def _svc_name(t):
    """اسم الخدمة الموحّد، أو "" لو مش خدمة علاجية."""
    t = (t or "").strip()
    tl = t.lower()
    if "متابع" in t and "تغذ" in t:
        return "متابعة تغذيه"                     # عادي أو أونلاين
    if not t or any(k in tl for k in NOT_SERVICE):
        return ""
    if "علاج طبيع" in t:
        return "علاج طبيعي"
    if "شوك" in t:
        return "شوك ويف"
    if tl.startswith("cryo"):
        return "Cryo"
    if "ريكفر" in t:
        return "ريكفري"
    if "حجام" in t:
        return "حجامه"
    return t


# نظام كل خدمة (لو مش متسجلة هنا: بنحسب من نظام المريض نفسه في آخر أسبوعين)
SVC_RULES = {
    "شوك ويف":      {"every": 2},                  # 3 مرات في الأسبوع → لو عدّى يومين من آخر مرة يبقى عليه
    "ماجنتك":       {"with_pt": True},             # مع كل جلسة علاج طبيعي
    "ليزر":         {"with_pt": True},             # مع كل جلسة علاج طبيعي
    "متابعة تغذيه": {"every": 7, "any_day": True}, # مرة في الأسبوع — مش لازم تكون في نفس يوم الجلسة
}

# ── المتابعات: متابعه ×3 ← متابعه انقطاع ×3 (يوم بعد يوم) ← منقطع نهائي ──
import re as _re
def _fu_kind(t):
    t = (t or "").strip()
    if "تغذ" in t:
        return ""
    if "منقطع" in t and "نهائ" in t:
        return "final"
    if "متابع" in t and "انقطاع" in t:
        return "inq"
    if t in ("متابعه", "متابعة") or t.startswith("متابعه ") or t.startswith("متابعة "):
        return "fu"
    return ""

_TIME_RE = _re.compile(r"(?<![\d])([01]?\d|2[0-3])\s*[:.٫]\s*([0-5]\d)(?![\d])")
_TIME_RE2 = _re.compile(r"(?:الساع[هة]\s*(\d{1,2}))|(?:(?<![\d:.])(\d{1,2})\s*(?:م|ص|pm|am|PM|AM)(?![؀-ۿ]))")
_UNREACH = _re.compile(r"مغلق|مقفول|قافل|لا ?يرد|لا ?ترد|مش ?بيرد|مش ?بترد|مش ?بتترد|مبتردش|ما ?بتردش|مردتش|ما ?ردتش|غير ?صحيح|رقم ?غلط|مش ?مجمع|مبيردش|ما ?بيردش|مردش|ما ?ردش|لم ?يرد|غير ?متاح|مش ?متاح|خارج ?نطاق|بر[هة] ?نطاق|بر[هة] ?الخدم|غير ?موجود|بيرن|رن ?كتير|جرس|مشغول|واتس|whats|لا ?يمكن|مفيش ?رد|بدون ?رد|no ?answer|busy|مقفل", _re.I)
_CALLBACK = _re.compile(r"(?:(?:نكلم|تكلم|نتصل|هيكلم|هتكلم|هيتصل|هتتصل|هيتواصل|هتتواصل|نتواصل|يكلمنا|تكلمنا|يتصل|نرن|هيرن|طلب)[^\n]{0,30}?(?:بعد|فتر[هة]|يوم|الاسبوع|الأسبوع|الشهر|بكر[هة]|السبت|الحد|الأحد|الاحد|الاتنين|الإثنين|الثلاث|التلات|الاربع|الأربع|الخميس|الجمع|\d))|(?:بعد\s*(?:اسبوع|أسبوع|اسبوعين|أسبوعين|شهر|يومين|العيد|\d+\s*(?:يوم|ايام|أيام)))|(?:(?:نستن[ىي]|يستن[ىي]|استن[ىي]|كمان|ممكن)[^\n]{0,20}?(?:شهر|اسبوع|أسبوع|اسبوعين|يومين|ايام|أيام|العيد))|(?:(?:فتر[هة]|اسبوع|أسبوع|شهر|يومين)[^\n]{0,20}?(?:نكلم|تكلم|نتصل|نتواصل|نرن))", _re.I)
_REACHED = _re.compile(r"\bرد\b|ردت|اتكلم|كلمت|تم ?التواصل|اتواصل|قال|قالت|جاي|جايه|هييجي|هيجي|هتيجي|هيحجز|حجز|محجوز|اتحجز|موعد|ميعاد|موافق|مسافر|تعبان|ظروف|مش ?عايز|مش ?عاوز|اعتذر|لغى|الغى|كنسل|هيجدد|نشوف|لما ?يروح|هيكمل|مكمل", _re.I)

def _note_times(note):
    out = []
    for h, m in _TIME_RE.findall(note or ""):
        out.append(f"{int(h)}:{m}")
    for h1, h2 in _TIME_RE2.findall(note or ""):
        h = h1 or h2
        if h and 0 < int(h) <= 12:
            out.append(f"{int(h)}")
    seen, res = set(), []
    for t in out:
        if t not in seen:
            seen.add(t); res.append(t)
    return res

def _pt_counts(att):
    """(إجمالي جلسات PT، جلسات الكورس الحالي، أول جلسة في الكورس) — يوم واحد = جلسة واحدة."""
    days = sorted({a["start"].date() for a in att if _is_pt(a["type"])})
    if not days:
        return 0, 0, ""
    start = 0
    for i in range(1, len(days)):
        if (days[i] - days[i - 1]).days > COURSE_GAP:
            start = i
    return len(days), len(days) - start, days[start].isoformat()


MISS_WINDOW     = 14    # بييجي بانتظام: نبص على آخر أسبوعين
MISS_DAILY_MIN  = 6     # "بييجي يوميًا": 6 أيام حضور على الأقل في الأسبوعين
MISS_DAILY_RATIO = 0.7  # ... و70% من أيام شغل الفرع
SUDDEN_WINDOW   = 14    # اعتذار مفاجئ / No Show: آخر أسبوعين
SUDDEN_HOURS    = 3     # اعتذار قبل الميعاد بأقل من 3 ساعات = مفاجئ
FU_WINDOW       = 14    # المتابعات: آخر أسبوعين
KASHF_PEND_DAYS = 30    # جه كشف في آخر 30 يوم ولسه متثبتش
PERF_DAYS       = 180   # أداء الدكاترة: آخر 6 شهور
RENEW_WAIT      = 14    # الباقة لازم تكون خلصت من أسبوعين على الأقل عشان نحكم جدد ولا لأ
DROP_WAIT       = 21    # الكورس لازم يكون بدأ من 3 أسابيع على الأقل
KASHF_WAIT      = 14    # الكشف لازم يكون من أسبوعين على الأقل
SVC_WINDOW      = 14    # الخدمات اللي عملها في آخر أسبوعين
SVC_SINGLE_WAIT = 7     # لو عملها مرة واحدة بس: ننبّه بعد أسبوع
SVC_SOON        = 3     # لو الخدمة الناقصة محجوزة في خلال 3 أيام → مش ناقصة
MISS_NEXT_MAX   = 2     # حاجز بكره (أو بعده لو بكره جمعة)
STREAK_MIN     = 2    # إلغاء / غياب ورا بعض
STREAK_RECENT  = 14   # آخر إلغاء لازم يكون في آخر 14 يوم
MISS_ONLY = {"canceled", "cancelled", "no show", "noshow"}   # Waiting List بيتجاهل

ATTENDED  = {"completed", "checked in", "checkedin", "in progress", "inprogress"}
BOOKED    = {"open", "confirmed", "checked in", "checkedin", "delayed"}
MISSED    = {"canceled", "cancelled", "no show", "noshow", "waiting list", "waiting"}
NOT_COUNT ={"canceled", "cancelled", "waiting list", "waiting", "note"}
SKIP_DOCS = {"follow up"}  # طابور المتابعة مش جلسات فعلية


def _norm(a):
    """يقبل الشكل الخام من Medicolize أو الشكل المختصر بتاع analyze()."""
    doc = a.get("doctor")
    doc = (doc or {}).get("name") if isinstance(doc, dict) else doc
    br = a.get("branch")
    br = (br or {}).get("name") if isinstance(br, dict) else br
    pat = a.get("patient")
    if isinstance(pat, dict):
        name = f"{pat.get('firstName') or ''} {pat.get('lastName') or ''}".strip()
        phone = pat.get("phoneNumber") or ""
        pid = pat.get("id") or ""
        bdate = pat.get("birthDate") or ""
        pnote = pat.get("pnote") or ""
    else:
        bdate = ""
        pnote = ""
        name, phone, pid = (pat or "").strip(), a.get("phone") or "", a.get("patient_id") or ""
    try:
        start = datetime.fromisoformat(str(a.get("start")).replace("Z", "+00:00")).astimezone(CAIRO)
    except Exception:
        return None
    return {
        "doctor": (doc or "").strip(), "branch": (br or "").strip(), "pid": str(pid or ""),
        "name": name, "phone": phone, "start": start,
        "status": str(a.get("status") or "").strip().lower(),
        "type": str(a.get("type") or "").strip(), "bdate": str(bdate or "")[:10],
        "note": (a.get("note") or "").strip() if isinstance(a.get("note"), str) else "",
        "pnote": str(pnote or "").strip(),
        "cancel_at": _parse_dt(a.get("cancel_at")),
        "by": str(a.get("by") or "").strip(),
        "reason": str(a.get("reason") or "").strip(),
    }


def _parse_dt(v):
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).astimezone(CAIRO) if v else None
    except Exception:
        return None


def _pkey(name, phone, pid=""):
    """رقم المريض في Medicolize لو موجود — وإلا التليفون + الاسم (عيلة ممكن تكون على نفس الرقم)."""
    if pid:
        return "id:" + pid
    digits = re.sub(r"\D", "", phone or "")
    nm = re.sub(r"\s+", " ", re.sub(r"[أإآ]", "ا", name or "").replace("ة", "ه").replace("ى", "ي")).strip()
    return (digits[-10:] if len(digits) >= 9 else "") + "|" + nm


def build_analysis(patients, today, window_days=28, weeks=8, daily_days=90):
    """بيانات تاب التحليل — جلسات علاج طبيعي بس (النوع "جلسة").
    cells[doctor]["dow-hour"] = [حضر، ما حضرش، ملغي، انتظار]   (dow: 0=الأحد .. 6=السبت)
    dates[doctor][dow] = عدد الأيام اللي الدكتور كان فيها شغال (أي ميعاد) — عشان الإجازات ما تحسبش طاقة."""
    w_to = today - timedelta(days=1)
    w_from = today - timedelta(days=window_days)
    cells = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    worked = defaultdict(lambda: defaultdict(set))
    week0 = today - timedelta(days=(today.weekday() - 5) % 7)          # بداية الأسبوع الحالي (السبت)
    wk_starts = [week0 - timedelta(days=7 * i) for i in range(weeks, 0, -1)]
    wk = {ws.isoformat(): defaultdict(lambda: [0, 0, 0, 0]) for ws in wk_starts}   # [حضر، ما حضرش، ملغي، مرضى جداد]
    first_seen = {}
    d_from = today - timedelta(days=daily_days)
    daily = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))   # [حضر PT، ما حضرش PT، ملغي PT، أي ميعاد]
    for appts in patients.values():
        first = min(appts, key=lambda a: a["start"])
        if first["status"] not in ("canceled", "cancelled"):
            first_seen[id(appts)] = first
        for a in appts:
            d = a["start"].date()
            doc = a["doctor"]
            st = a["status"]
            dow = (d.weekday() + 1) % 7
            if w_from <= d <= w_to:
                worked[doc][dow].add(d)
            if d_from <= d < today:
                daily[doc][d.isoformat()][3] = 1
                if a["type"].strip() in PT_TYPES:
                    k = 0 if st in ATTENDED else 1 if st in ("no show", "noshow") else 2 if st in ("canceled", "cancelled") else -1
                    if k >= 0:
                        daily[doc][d.isoformat()][k] += 1
            if a["type"].strip() not in PT_TYPES:
                continue
            slot = 0 if st in ATTENDED else 1 if st in ("no show", "noshow") else 2 if st in ("canceled", "cancelled") else 3 if st in ("waiting list", "waiting") else -1
            if slot < 0:
                continue
            if w_from <= d <= w_to:
                cells[doc][f"{dow}-{a['start'].hour}"][slot] += 1
            ws = (d - timedelta(days=(d.weekday() - 5) % 7)).isoformat()
            if ws in wk and slot < 3:
                wk[ws][doc][slot] += 1
    for f in first_seen.values():
        d = f["start"].date()
        ws = (d - timedelta(days=(d.weekday() - 5) % 7)).isoformat()
        if ws in wk:
            wk[ws][f["doctor"]][3] += 1
    return {
        "window_from": w_from.isoformat(), "window_to": w_to.isoformat(),
        "cells": {doc: dict(c) for doc, c in cells.items()},
        "dates": {doc: {str(k): len(v) for k, v in dd.items()} for doc, dd in worked.items()},
        "weeks": [{"start": k, "by_doc": {doc: v for doc, v in wk[k].items()}} for k in sorted(wk)],
        "daily_from": d_from.isoformat(),
        "daily": {doc: dict(v) for doc, v in daily.items()},
    }


def build_alerts(appointments, now=None, packages=None):
    now = (now or datetime.now(timezone.utc)).astimezone(CAIRO)
    today = now.date()
    last_week = today - timedelta(days=7)

    patients = defaultdict(list)
    patients_all = defaultdict(list)
    day_counts = {today.isoformat(): defaultdict(lambda: defaultdict(int)),
                  last_week.isoformat(): defaultdict(lambda: defaultdict(int))}

    for raw in appointments:
        if not isinstance(raw, dict):
            continue
        a = _norm(raw)
        if not a:
            continue
        d = a["start"].date()
        if d.isoformat() in day_counts and a["status"] not in NOT_COUNT:
            day_counts[d.isoformat()][a["doctor"] or "غير محدد"][a["branch"] or "غير محدد"] += 1
        if not (a["name"] or a["phone"]):
            continue
        k = _pkey(a["name"], a["phone"], a["pid"])
        patients_all[k].append(a)                      # فيها مواعيد طابور المتابعة (دكتور "Follow up")
        if a["doctor"].lower() in SKIP_DOCS:
            continue
        patients[k].append(a)

    # ── الباقات (من الفواتير) + جهة التحويل + السن ──
    LIVE_TODAY = {"open", "confirmed", "checked in", "checkedin", "in progress", "inprogress", "completed", "delayed"}
    hist_start = min((a["start"].date() for v in patients.values() for a in v), default=today)
    pk_by_pid, ref_by_pid = defaultdict(list), {}
    for iid, v in ((packages or {}).get("inv") or {}).items():
        pid = v.get("p")
        if not pid:
            continue
        if v.get("s"):
            try:
                st = datetime.fromisoformat(v["a"].replace("Z", "+00:00")).astimezone(CAIRO).date() if v.get("a") else date.fromisoformat(v["d"])
            except Exception:
                continue
            pk_by_pid[pid].append((st, int(v["s"])))
        if v.get("r") and (pid not in ref_by_pid or v.get("d", "") > ref_by_pid[pid][0]):
            ref_by_pid[pid] = (v.get("d", ""), v["r"])
    for pid in pk_by_pid:
        pk_by_pid[pid].sort()

    def info(appts):
        pid = appts[0]["pid"]
        bd = next((a["bdate"] for a in appts if a.get("bdate")), "")
        age = None
        try:
            if bd:
                b0 = date.fromisoformat(bd)
                age = today.year - b0.year - ((today.month, today.day) < (b0.month, b0.day))
                if age < 0 or age > 110:
                    age = None
        except Exception:
            age = None
        return {"referral": (ref_by_pid.get(pid) or ("", ""))[1], "age": age}

    dropped = []
    for appts in patients.values():
        att = [a for a in appts if a["status"] in ATTENDED and a["start"].date() <= today]
        if not att:
            continue
        last = max(a["start"] for a in att)
        gap = (today - last.date()).days
        if gap <= DROP_DAYS or gap > LOOKBACK_DAYS:
            continue
        win_start = last.date() - timedelta(days=REGULAR_WINDOW - 1)
        win = [a for a in att if a["start"].date() >= win_start]
        att_days = len({a["start"].date() for a in win})
        if att_days < REGULAR_MIN:
            continue
        # آخر حالة بعد آخر حضور (إلغاء / غياب / انتظار)
        after = sorted([a for a in appts if last.date() < a["start"].date() and a["start"] <= now and a["status"] in MISSED],
                       key=lambda a: a["start"])
        nxt = sorted([a for a in appts if a["start"] > now and a["status"] in BOOKED],
                     key=lambda a: a["start"])
        ref = max(att, key=lambda a: a["start"])
        doctor = Counter(a["doctor"] for a in win).most_common(1)[0][0]
        pt_total, pt_course, course_from = _pt_counts(att)
        dropped.append({
            "name": ref["name"], "phone": ref["phone"], "pid": ref["pid"],
            "doctor": doctor, "branch": ref["branch"],
            "last_attended": last.date().isoformat(), "days_since": gap,
            "attended_days_2w": att_days,
            "pt_total": pt_total, "pt_course": pt_course, "course_from": course_from,
            "last_status": after[-1]["status"].title() if after else "",
            "last_status_date": after[-1]["start"].date().isoformat() if after else "",
            "next_appt": nxt[0]["start"].isoformat() if nxt else "",
            "next_doctor": nxt[0]["doctor"] if nxt else "",
            "next_status": nxt[0]["status"].title() if nxt else "",
            **info(appts),
        })
    dropped.sort(key=lambda x: (x["next_appt"] != "", x["days_since"]))   # الأحدث انقطاعًا فوق

    # ── عندهم ميعاد النهارده (أي حالة) ومالهمش أي ميعاد بعد النهارده بأي حالة ──
    NOT_FUTURE = {"canceled", "cancelled", "no show", "noshow", "note"}
    no_next = []
    for appts in patients.values():
        today_att = [a for a in appts if a["start"].date() == today]
        if not today_att:
            continue
        future = [a for a in appts if a["start"].date() > today]   # أي موعد بعد النهارده بأي حالة (حتى Canceled / No Show) يتحسب
        if future:
            continue
        last = max(today_att, key=lambda a: a["start"])
        # مكتوب في تفاصيل المريض "منقطع" / "منقطع نهائي" (أو آخر ميعاد ليه منقطع نهائي) → مش محتاج ميعاد جاي
        if any("منقطع" in (a.get("pnote") or "") for a in appts) or \
           "منقطع" in max(appts, key=lambda a: a["start"])["type"]:
            continue
        no_next.append({
            "name": last["name"], "phone": last["phone"], "pid": last["pid"],
            "doctor": last["doctor"], "branch": last["branch"],
            "time": last["start"].isoformat(), "type": last["type"], "status": last["status"].title(),
            **info(appts),
        })
    no_next.sort(key=lambda x: x["time"], reverse=True)

    # ── بييجي بانتظام ومالوش ميعاد النهارده، بس حاجز بكره/بعده (غالبًا السكرتارية نسيت تحجزله) ──
    WD_AR = ["الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"]
    def _svc(t):
        t = t or ""
        return _is_pt(t) or "ريكفر" in t or "حجام" in t
    win_from = today - timedelta(days=MISS_WINDOW)
    br_days = defaultdict(lambda: defaultdict(int))      # فرع → يوم → عدد الحضور (عشان نعرف أيام الشغل)
    br_today = defaultdict(int)                          # فرع → مواعيد النهارده
    for v in patients.values():
        for a in v:
            d = a["start"].date()
            if win_from <= d < today and a["status"] in ATTENDED:
                br_days[a["branch"]][d] += 1
            if d == today and a["status"] not in NOT_FUTURE:
                br_today[a["branch"]] += 1
    missing_today = []
    for appts in patients.values():
        if any(a["start"].date() == today for a in appts):
            continue                                     # عنده أي ميعاد النهارده (حتى لو ملغي/Waiting) → مش منسي
        fut = sorted([a for a in appts if today < a["start"].date() <= today + timedelta(days=MISS_NEXT_MAX)
                      and a["status"] not in NOT_FUTURE], key=lambda a: a["start"])
        if not fut:
            continue
        att = [a for a in appts if win_from <= a["start"].date() < today and a["status"] in ATTENDED and _svc(a["type"])]
        if not att:
            continue
        br = Counter(a["branch"] for a in att).most_common(1)[0][0]
        if br_today.get(br, 0) < 5:
            continue                                     # الفرع مش شغال النهارده (إجازة/جمعة)
        work = {d for d, n in br_days[br].items() if n >= 5}
        days = {a["start"].date() for a in att}
        last = max(days)
        if (today - last).days > 4:
            continue
        n_work = len(work) or 1
        daily = len(days) >= MISS_DAILY_MIN and len(days) >= MISS_DAILY_RATIO * n_work
        weekly = (today - timedelta(days=7)) in days and (today - timedelta(days=14)) in days
        # يومين شغل ورا بعض (الخميس ← السبت يتحسبوا ورا بعض لو الجمعة إجازة)
        wl = sorted(work | days)
        runs, cur = [], 0                                 # أطوال فترات الحضور ورا بعض
        for d in wl:
            if d in days:
                cur += 1
            else:
                if cur: runs.append(cur)
                cur = 0
        if cur: runs.append(cur)
        pairs = sum(r - 1 for r in runs if r >= 2)        # عدد مرات "يومين ورا بعض"
        max_run = max(runs or [0])
        runs2 = sum(1 for r in runs if r >= 2)            # كام مرة جه يومين أو أكتر ورا بعض
        consec = max_run >= 3 or runs2 >= 2               # 3 أيام ورا بعض، أو يومين ورا بعض مرتين
        if not (daily or consec):
            continue
        doc = Counter(a["doctor"] for a in att).most_common(1)[0][0]
        hr = Counter(a["start"].hour for a in att).most_common(1)[0][0]
        ref = max(att, key=lambda a: a["start"])
        nx = fut[0]
        missing_today.append({
            "name": ref["name"], "phone": ref["phone"], "pid": ref["pid"],
            "doctor": doc, "branch": br,
            "why": "daily" if daily else "consec" if consec else "weekly",
            "consec_pairs": pairs, "max_run": max_run, "runs2": runs2, "weekly_too": weekly,
            "att_days": len(days), "work_days": len(work), "weekday": WD_AR[today.weekday()],
            "usual_hour": hr, "last_attended": last.isoformat(),
            "next_appt": nx["start"].isoformat(), "next_doctor": nx["doctor"],
            "next_status": nx["status"].title(), "next_type": nx["type"],
            **info(appts),
        })

    # ── محجوز النهارده خدمة، وناقصه خدمة تانية بيعملها معاها (مثلاً علاج طبيعي من غير شوك ويف) ──
    svc_gap = []
    sg_from = today - timedelta(days=SVC_WINDOW)
    for appts in patients.values():
        tday = [a for a in appts if a["start"].date() == today and a["status"] not in NOT_FUTURE and _svc_name(a["type"])]
        if not tday:
            continue
        today_svcs = {_svc_name(a["type"]) for a in tday}
        hist = defaultdict(set)                                     # يوم → الخدمات اللي اتعملت
        for a in appts:
            d = a["start"].date()
            if sg_from <= d < today and a["status"] in ATTENDED and _svc_name(a["type"]):
                hist[d].add(_svc_name(a["type"]))
        if not hist:
            continue
        soon = {_svc_name(a["type"]) for a in appts
                if today < a["start"].date() <= today + timedelta(days=SVC_SOON) and a["status"] not in NOT_FUTURE}
        missing = []
        cands = {x for svs in hist.values() for x in svs} - today_svcs - soon
        for b in sorted(cands):
            rule = SVC_RULES.get(b, {})
            together = [d for d, svs in hist.items() if b in svs and svs & today_svcs]
            if rule.get("with_pt"):
                if "علاج طبيعي" not in today_svcs:
                    continue
                together = [d for d, svs in hist.items() if b in svs and "علاج طبيعي" in svs]
            if not together and not rule.get("any_day"):
                continue                                            # عمرها ما اتعملت مع خدمة النهارده
            bdays = sorted(d for d, svs in hist.items() if b in svs)
            since = (today - bdays[-1]).days
            if rule.get("with_pt"):
                every, why = 0, "with_pt"                           # المفروض مع كل جلسة علاج طبيعي
            elif rule.get("every"):
                every, why = rule["every"], "rule"
                if since < every:
                    continue
            else:
                gaps = [(bdays[i] - bdays[i - 1]).days for i in range(1, len(bdays))]
                every, why = (sorted(gaps)[len(gaps) // 2] if gaps else 0), "pattern"   # بيعملها كل كام يوم (الوسيط)
                if every and since < every:
                    continue                                        # لسه مش ميعادها
                if not every and since < SVC_SINGLE_WAIT:
                    continue                                        # عملها مرة واحدة بس من قريب — مش عارفين نظامها
            missing.append({"svc": b, "times": len(bdays), "together": len(together), "why": why,
                            "last": bdays[-1].isoformat(), "every": every, "days_since": since})
        if not missing:
            continue
        first = min(tday, key=lambda a: a["start"])
        svc_gap.append({
            "name": first["name"], "phone": first["phone"], "pid": first["pid"],
            "doctor": first["doctor"], "branch": first["branch"],
            "time": first["start"].isoformat(), "status": first["status"].title(),
            "today_svcs": sorted(today_svcs), "missing": missing,
            **info(appts),
        })
    svc_gap.sort(key=lambda x: x["time"])

    # ── جه كشف علاج طبيعي في آخر 30 يوم (الداشبورد بيفلتر اللي مش في شيت التثبيتات) ──
    kashf_pending = []
    kp_from = today - timedelta(days=KASHF_PEND_DAYS)
    for appts in patients_all.values():
        ks = [a for a in appts if "كشف" in a["type"] and "تغذ" not in a["type"] and kp_from <= a["start"].date() <= today
              and (a["status"] in ATTENDED or (a["start"].date() == today and a["status"] not in NOT_FUTURE))]
        if not ks:
            continue
        k = max(ks, key=lambda a: a["start"])
        kd = k["start"].date()
        pid = k["pid"]
        after = sorted({a["start"].date() for a in appts if _is_pt(a["type"]) and a["status"] in ATTENDED and kd <= a["start"].date() < today})
        fut = sorted([a for a in appts if _is_pt(a["type"]) and a["start"].date() >= today and a["status"] not in NOT_FUTURE
                      and a["start"] > k["start"]], key=lambda a: a["start"])
        pkg = [p for p in pk_by_pid.get(pid, []) if kd - timedelta(days=3) <= p[0]]
        nx = fut[0] if fut else None
        kashf_pending.append({
            "name": k["name"], "phone": k["phone"], "pid": pid, "doctor": k["doctor"], "branch": k["branch"],
            "kashf_date": k["start"].isoformat(), "days_since": (today - kd).days, "kashf_status": k["status"].title(),
            "sessions_after": len(after), "last_session": after[-1].isoformat() if after else None,
            "next_pt": nx["start"].isoformat() if nx else None, "next_doctor": nx["doctor"] if nx else None,
            "next_status": nx["status"].title() if nx else None,
            "pkg_size": pkg[0][1] if pkg else 0,
            # كل مواعيده (من أسبوع قبل الكشف لحد أي ميعاد جاي) بملحوظاتها
            "appts": [{"start": a["start"].isoformat(), "type": a["type"], "status": a["status"].title(),
                       "doctor": a["doctor"], "note": a.get("note") or ""}
                      for a in sorted(appts, key=lambda a: a["start"], reverse=True)
                      if a["start"].date() >= kd - timedelta(days=7)][:25],
            **info(appts),
        })
    kashf_pending.sort(key=lambda x: x["kashf_date"], reverse=True)

    # ── المتابعات ──
    fu_from = today - timedelta(days=FU_WINDOW)
    fu_return, fu_calls, fu_order, fu_pool = [], [], [], []
    calls_today = []   # كل متابعات النهارده (للخطة): الحالة + الملحوظة + أوقات الاتصال
    fu_patients = 0
    for appts in patients_all.values():
        srt = sorted(appts, key=lambda a: a["start"])
        fus = [a for a in srt if _fu_kind(a["type"]) and a["status"] not in ("canceled", "cancelled")]
        svc = lambda a: _is_pt(a["type"]) or "ريكفر" in a["type"] or "حجام" in a["type"]
        att_pt = [a for a in srt if svc(a) and a["status"] in ATTENDED]
        win = [a for a in fus if fu_from <= a["start"].date() <= today and _fu_kind(a["type"]) in ("fu", "inq")]
        # الخطوة: كام متابعه / متابعه انقطاع من بعد آخر جلسة حضرها قبلها
        def step(a):
            last = max([x["start"] for x in att_pt if x["start"] < a["start"]], default=None)
            k = _fu_kind(a["type"])
            return sum(1 for x in fus if _fu_kind(x["type"]) == k and x["start"] <= a["start"] and (last is None or x["start"] > last))
        base = lambda a, extra: {"name": a["name"], "phone": a["phone"], "pid": a["pid"], "doctor": a["doctor"],
                                  "branch": a["branch"], **extra, **info(appts)}
        # البيانات الأساسية للمريض: الفرع والدكتور من آخر جلسة حضرها
        ref = att_pt[-1] if att_pt else (srt[-1] if srt else None)
        def who(a):
            r = ref or a
            return {"doctor": r["doctor"], "branch": r["branch"]}
        if win:
            fu_patients += 1
            last_fu = win[-1]
            fu_pool.append({"pid": last_fu["pid"], **who(last_fu), "first": win[0]["start"].isoformat(),
                            "last": last_fu["start"].isoformat(), "kinds": sorted({_fu_kind(x["type"]) for x in win})})
            came = [a for a in att_pt if a["start"] > win[0]["start"]]
            booked = [a for a in srt if svc(a) and a["start"] > last_fu["start"] and a["status"] not in NOT_FUTURE
                      and a["status"] not in ATTENDED and a["start"].date() >= today]
            if came or booked:
                fr = win[0] if came else last_fu
                rec = base(fr, {"fu_date": fr["start"].isoformat(), "fu_kind": _fu_kind(fr["type"]), "fu_step": step(fr),
                                "fu_type": fr["type"], "fu_count": len(win),
                                "state": "came" if came else "booked",
                                "ret_date": (came[0] if came else booked[0])["start"].isoformat(),
                                "ret_doctor": (came[0] if came else booked[0])["doctor"],
                                "ret_status": (came[0] if came else booked[0])["status"].title(),
                                "ret_by": (came[0] if came else booked[0]).get("by") or "",
                                "fu_by": fr.get("by") or "",
                                "fu_note": (fr.get("note") or "")[:200]})
                rec.update(who(fr))
                fu_return.append(rec)
        # الاتصالات: كل متابعة في الفترة
        for a in win:
            note = a.get("note") or ""
            times = _note_times(note)
            cb = bool(_CALLBACK.search(note))
            unr = bool(_UNREACH.search(note))
            reached = bool(_REACHED.search(note))
            if not note.strip():
                verdict = "no_note"
            elif cb:
                later = [x for x in srt if x["start"] > a["start"] and x["status"] not in ("canceled", "cancelled")]
                verdict = "callback_ok" if later else "callback_unbooked"
            elif unr and len(times) < 3:
                verdict = "few_calls"
            elif not unr and not reached and len(times) < 3:
                verdict = "unclear"
            else:
                verdict = "ok"
            if a["start"].date() == today:
                calls_today.append({"pid": a["pid"], "name": a["name"], "phone": a["phone"], "doctor": a["doctor"], "branch": a["branch"],
                                    "time": a["start"].isoformat(), "type": a["type"], "step": step(a), "status": a["status"].title(),
                                    "note": note[:300], "times": times, "verdict": verdict, "reached": reached or cb,
                                    # تمت: الموعد Completed + فيه ملحوظة باللي حصل، أو اتصال مرتين على الأقل مكتوب وقتهم ونتيجتهم
                                    "done": a["status"] in ATTENDED and bool(note.strip()) and (verdict in ("ok", "callback_ok") or reached or cb or len(times) >= 2)})
            if verdict in ("ok", "callback_ok"):
                continue
            rec = base(a, {"date": a["start"].isoformat(), "kind": _fu_kind(a["type"]), "step": step(a), "type": a["type"],
                           "status": a["status"].title(), "note": note, "times": times, "verdict": verdict,
                           "is_today": a["start"].date() == today})
            rec.update(who(a))
            fu_calls.append(rec)
        # الترتيب
        # (أ) 3 متابعه انقطاع وخلاص — ومفيش منقطع نهائي ولا رجوع
        inqs = [a for a in fus if _fu_kind(a["type"]) == "inq"]
        if inqs:
            li = inqs[-1]
            if step(li) >= 3 and fu_from <= li["start"].date() < today:
                after = [x for x in srt if x["start"] > li["start"] and x["status"] not in ("canceled", "cancelled")]
                if not after:
                    rec = base(li, {"date": li["start"].isoformat(), "issue": "no_final", "kind": "inq", "step": step(li),
                                    "detail": "خلص 3 متابعه انقطاع ومتحجزلوش منقطع نهائي"})
                    rec.update(who(li)); fu_order.append(rec)
        # (ب) متابعه انقطاع مش يوم بعد يوم
        seq = [a for a in fus if _fu_kind(a["type"]) == "inq" and fu_from <= a["start"].date() <= today]
        for i in range(1, len(seq)):
            if step(seq[i]) <= 1:
                continue
            d0, d1 = seq[i - 1]["start"].date(), seq[i]["start"].date()
            gap = (d1 - d0).days
            fri = any((d0 + timedelta(days=k)).weekday() == 4 for k in range(1, gap))
            if gap != 2 and not (fri and gap == 3):
                rec = base(seq[i], {"date": seq[i]["start"].isoformat(), "issue": "gap", "kind": "inq", "step": step(seq[i]),
                                    "detail": f"متابعه انقطاع {step(seq[i])} بعد {gap} {'يوم' if gap in (1,) or gap >= 11 else 'أيام'} من اللي قبلها (المفروض يوم بعد يوم)"})
                rec.update(who(seq[i])); fu_order.append(rec)
        # (ج) أكتر من 3 متابعه أو 3 متابعه انقطاع
        for k, lbl in (("fu", "متابعه"), ("inq", "متابعه انقطاع")):
            ks = [a for a in fus if _fu_kind(a["type"]) == k and fu_from <= a["start"].date() <= today]
            if ks and step(ks[-1]) > 3:
                rec = base(ks[-1], {"date": ks[-1]["start"].isoformat(), "issue": "too_many", "kind": k, "step": step(ks[-1]),
                                    "detail": f"اتحجزله {lbl} رقم {step(ks[-1])} (المفروض 3 بس)"})
                rec.update(who(ks[-1])); fu_order.append(rec)
        # (د) متابعه انقطاع من غير ما يخلص 3 متابعه
        if inqs:
            first_inq = [a for a in inqs if step(a) == 1 and fu_from <= a["start"].date() <= today]
            for a in first_inq:
                last = max([x["start"] for x in att_pt if x["start"] < a["start"]], default=None)
                nfu = sum(1 for x in fus if _fu_kind(x["type"]) == "fu" and x["start"] < a["start"] and (last is None or x["start"] > last))
                if nfu < 3:
                    rec = base(a, {"date": a["start"].isoformat(), "issue": "early_inq", "kind": "inq", "step": 1,
                                   "detail": f"اتحجز متابعه انقطاع بعد {nfu} متابعه بس (المفروض 3)"})
                    rec.update(who(a)); fu_order.append(rec)
        # (هـ) ما جاش ومتحجزلوش متابعة
        ns = [a for a in srt if svc(a) and a["status"] in ("no show", "noshow") and fu_from <= a["start"].date() < today]
        if ns:
            n0 = ns[-1]
            after = [x for x in srt if x["start"] > n0["start"] and x["status"] not in ("canceled", "cancelled")]
            if not after and (today - n0["start"].date()).days >= 1:
                rec = base(n0, {"date": n0["start"].isoformat(), "issue": "no_followup", "kind": "", "step": 0,
                                "detail": "ما جاش ومتحجزلوش متابعه ولا أي ميعاد بعدها"})
                fu_order.append(rec)
    fu_calls.sort(key=lambda x: x["date"], reverse=True)
    fu_order.sort(key=lambda x: x["date"], reverse=True)
    fu_return.sort(key=lambda x: x["ret_date"], reverse=True)
    followups = {"window": FU_WINDOW, "patients": fu_patients, "returned": fu_return, "calls": fu_calls, "order": fu_order, "pool": fu_pool}

    # ── اعتذار مفاجئ (أقل من 3 ساعات قبل الميعاد) / No Show — وعمل كده قبل كده ولا لأ ──
    SUDDEN = lambda t: bool(_re.search(r"(?:الغاء|إلغاء|اعتذار)\s*مفاجئ", t or ""))
    sudden = []
    sd_from = today - timedelta(days=SUDDEN_WINDOW)
    for appts in patients_all.values():
        srt = sorted(appts, key=lambda a: a["start"])
        marks = [a for a in srt if SUDDEN(a["type"])]
        events = []
        for a in srt:
            d = a["start"].date()
            if not (sd_from <= d <= today) or not (_svc_name(a["type"]) or SUDDEN(a["type"])):
                continue
            if SUDDEN(a["type"]):
                continue                                   # ده التسجيل نفسه — بنربطه بالحدث تحت
            st = a["status"]
            if st in ("no show", "noshow"):
                events.append((a, "noshow", None))
            elif st in ("canceled", "cancelled") and a.get("cancel_at"):
                hrs = (a["start"] - a["cancel_at"]).total_seconds() / 3600
                # وقت الإلغاء جاي من "آخر تعديل" على الميعاد — لو بعد الميعاد يبقى غالبًا تعديل تاني (زي ملحوظة اتصال) مش الإلغاء
                if 0 <= hrs < SUDDEN_HOURS:
                    events.append((a, "late", round(hrs, 1)))
        # ميعاد نوعه "الغاء مفاجئ" من غير ما نلاقي الإلغاء نفسه (لو خانة وقت الإلغاء مش موجودة)
        for mk in marks:
            d = mk["start"].date()
            if sd_from <= d <= today and not any(e[0]["start"].date() == d for e in events):
                events.append((mk, "late", None))
        for a, kind, hrs in events:
            d = a["start"].date()
            prior = [m for m in marks if m["start"].date() < d]
            prior_ns = [x for x in srt if x["start"] < a["start"] and x["status"] in ("no show", "noshow")
                        and x["start"].date() >= d - timedelta(days=180) and _svc_name(x["type"])]
            recorded = any(m["start"].date() == d for m in marks)
            sudden.append({
                "name": a["name"], "phone": a["phone"], "pid": a["pid"], "doctor": a["doctor"], "branch": a["branch"],
                "date": a["start"].isoformat(), "type": a["type"], "kind": kind, "hours_before": hrs,
                "cancel_at": a["cancel_at"].isoformat() if a.get("cancel_at") else None,
                "note": " · ".join(t for t in ((a.get("reason") and "سبب الإلغاء: " + a["reason"]), a.get("note")) if t),
                "prior_sudden": [m["start"].date().isoformat() for m in prior][-10:],
                "prior_noshow": len(prior_ns),
                "recorded": recorded,
                # الإجراء: الموعد اتحول لـ "الغاء مفاجئ" وبقى Completed
                "converted": any(m["start"].date() == d and m["status"] in ATTENDED for m in marks),
                **info(appts),
            })
    sudden.sort(key=lambda x: x["date"], reverse=True)
    missing_today.sort(key=lambda x: (-x["consec_pairs"], x["usual_hour"], x["name"]))   # الأقوى (يومين ورا بعض أكتر) فوق

    def pkg_state(appts, upto_incl=False):
        """حالة الباقة الحالية: حجمها، رقمها، اتحضر منها كام، وبدأت إمتى. upto_incl = نحسب حضور النهارده كمان."""
        days = sorted({a["start"].date() for a in appts
                       if (a["start"].date() <= today if upto_incl else a["start"].date() < today)
                       and _is_pt(a["type"]) and a["status"] in ATTENDED})
        pid = appts[0]["pid"]
        pks = [p for p in pk_by_pid.get(pid, []) if p[0] <= today]
        if pks:
            st, size = pks[-1]
            done = sum(1 for d in days if d >= st)
            return {"src": "inv", "size": size, "pkg_no": len(pks), "done": done, "start": st.isoformat(),
                    "total": len(days), "first": days[0].isoformat() if days else st.isoformat(),
                    "approx": st < hist_start + timedelta(days=3), "last": days[-1] if days else None}
        total = len(days)
        return {"src": "est", "size": CYCLE, "pkg_no": total // CYCLE + 1, "done": total % CYCLE,
                "start": "", "total": total, "first": days[0].isoformat() if days else today.isoformat(),
                "approx": bool(days) and days[0] <= hist_start + timedelta(days=7), "last": days[-1] if days else None,
                "est_full": total > 0 and total % CYCLE == 0}

    # ── أداء الدكاترة: التجديد · الوقوف بدري (أول 3 جلسات) · الكشف ← باقة ──
    RENEW_GAPS = []
    def doc_perf():
        P_FROM = today - timedelta(days=PERF_DAYS)
        out = defaultdict(lambda: {"branch": Counter(), "renew": [0, 0], "drop": [0, 0, 0, 0, 0], "kashf": [0, 0]})
        for appts in patients.values():
            att = sorted([a for a in appts if a["status"] in ATTENDED and a["start"].date() < today and _is_pt(a["type"])],
                         key=lambda a: a["start"])
            byday = {}
            for a in att:
                byday.setdefault(a["start"].date(), a)
            days = sorted(byday)
            pid = appts[0]["pid"]
            future = any(a["start"].date() >= today and a["status"] not in NOT_FUTURE for a in appts)
            # 1) التجديد: كل باقة خلصت (من الفاتورة أو كل 12) — جدد لو حضر جلسة بعدها في خلال 60 يوم
            pks = sorted(p for p in pk_by_pid.get(pid, []) if p[0] < today)
            segs = []
            if pks:
                for i, (st, size) in enumerate(pks):
                    nxt = pks[i + 1][0] if i + 1 < len(pks) else None
                    segs.append((size, [d for d in days if d >= st and (nxt is None or d < nxt)], st < hist_start + timedelta(days=3)))
            else:
                for i in range(0, len(days), CYCLE):
                    segs.append((CYCLE, days[i:i + CYCLE], i == 0 and days[0] <= hist_start + timedelta(days=7)))
            for size, sd, approx in segs:
                if approx or len(sd) < size:
                    continue
                end = sd[size - 1]
                if not (P_FROM <= end <= today - timedelta(days=RENEW_WAIT)):
                    continue
                doc = Counter(byday[d]["doctor"] for d in sd[:size]).most_common(1)[0][0]
                nx = [d for d in days if d > end]
                RENEW_GAPS.append((nx[0] - end).days if nx else None)
                o = out[doc]; o["branch"][byday[sd[0]]["branch"]] += 1
                o["renew"][0] += 1
                if any(end < d <= end + timedelta(days=60) for d in days) or (future and not any(d > end for d in days)):
                    o["renew"][1] += 1
            # 2) الوقوف بدري: كورس جديد (أول جلسة أو بعد انقطاع 3 أسابيع) وقف عند جلسة 3 أو أقل
            courses, cur = [], []
            for d in days:
                if cur and (d - cur[-1]).days > COURSE_GAP:
                    courses.append(cur); cur = []
                cur.append(d)
            if cur:
                courses.append(cur)
            for ci, c in enumerate(courses):
                if not (P_FROM <= c[0] <= today - timedelta(days=DROP_WAIT)):
                    continue
                if ci == 0 and c[0] <= hist_start + timedelta(days=COURSE_GAP):
                    continue                                    # بدأ قبل أول البيانات — مش عارفين أوله
                doc = byday[c[0]]["doctor"]
                o = out[doc]; o["branch"][byday[c[0]]["branch"]] += 1
                o["drop"][0] += 1
                last_course = ci == len(courses) - 1
                if len(c) <= 3 and last_course and not future and (today - c[-1]).days >= 14:
                    o["drop"][1] += 1
                    o["drop"][1 + len(c)] += 1                  # وقف عند جلسة 1 / 2 / 3
            # 3) الكشف ← باقة: كشف علاج طبيعي حضره، وبعده جلسة علاج طبيعي في خلال 30 يوم
            for a in appts:
                if "كشف" not in a["type"] or "تغذ" in a["type"] or a["status"] not in ATTENDED:
                    continue
                d = a["start"].date()
                if not (P_FROM <= d <= today - timedelta(days=KASHF_WAIT)):
                    continue
                o = out[a["doctor"]]; o["branch"][a["branch"]] += 1
                o["kashf"][0] += 1
                if any(d <= x <= d + timedelta(days=30) for x in days) or \
                   any(d - timedelta(days=3) <= st <= d + timedelta(days=30) for st, _ in pk_by_pid.get(pid, [])):
                    o["kashf"][1] += 1
        res = {}
        for doc, o in out.items():
            if doc.lower() in SKIP_DOCS or not doc:
                continue
            res[doc] = {"branch": o["branch"].most_common(1)[0][0] if o["branch"] else "",
                        "renew": o["renew"], "drop": o["drop"], "kashf": o["kashf"]}
        g = RENEW_GAPS; n = len(g); b = Counter()
        for x in g:
            k = "لم يرجع" if x is None else "≤3" if x <= 3 else "4-7" if x <= 7 else "8-10" if x <= 10 else "11-14" if x <= 14 else "15-21" if x <= 21 else "22-30" if x <= 30 else "31-60" if x <= 60 else ">60"
            b[k] += 1
        print("📊 فرق الأيام بين آخر جلسة في الباقة وأول جلسة بعدها:", n, "باقة ·",
              " · ".join(f"{k}: {b[k]}" for k in ["≤3", "4-7", "8-10", "11-14", "15-21", "22-30", "31-60", ">60", "لم يرجع"]))
        return {"from": P_FROM.isoformat(), "to": today.isoformat(), "days": PERF_DAYS, "docs": res,
                "rules": {"renew_wait": RENEW_WAIT, "drop_wait": DROP_WAIT, "kashf_wait": KASHF_WAIT}}
    try:
        perf = doc_perf()
    except Exception as e:
        perf = {"error": str(e)[:200]}

    # ── جلسة النهارده رقم كام في الباقة (3 / 6 / 9 / 12) ──
    milestones_all = []
    for appts in patients.values():
        today_pt = [a for a in appts if a["start"].date() == today and _is_pt(a["type"]) and a["status"] in LIVE_TODAY]
        if not today_pt:
            continue
        ps = pkg_state(appts)
        t = min(today_pt, key=lambda a: a["start"])
        m = {
            "name": t["name"], "phone": t["phone"], "pid": t["pid"],
            "doctor": t["doctor"], "branch": t["branch"],
            "time": t["start"].isoformat(), "status": t["status"].title(),
            "session_no": ps["done"] + 1, "size": ps["size"], "pkg_no": ps["pkg_no"], "pkg_src": ps["src"],
            "pkg_start": ps["start"], "total": ps["total"] + 1,
            "cycles_done": ps["pkg_no"] - 1, "first_session": ps["first"], "approx": ps["approx"],
        }
        m.update(info(appts))
        milestones_all.append(m)
    milestones_all.sort(key=lambda x: x["time"])
    milestones = [m for m in milestones_all if m["session_no"] in MILESTONES]

    # ── فهرس كل المرضى للبحث ──
    # كل صف: [الاسم, التليفون, جلسات حضرها قبل النهارده, أول جلسة, آخر جلسة, ميعاد النهارده أو الجاي, دكتوره, حالته,
    #          حجم الباقة, اتحضر من الباقة, رقم الباقة, مصدر الباقة (inv/est), جهة التحويل, السن, بداية الباقة]
    pt_index = []
    for appts in patients.values():
        upcoming = sorted([a for a in appts if a["start"].date() >= today and _is_pt(a["type"]) and a["status"] in LIVE_TODAY],
                          key=lambda a: a["start"])
        ps = pkg_state(appts)
        if not ps["total"] and not upcoming:
            continue
        ref = upcoming[0] if upcoming else max(appts, key=lambda a: a["start"])
        inf = info(appts)
        pt_index.append([
            ref["name"], (ref["phone"] or "").replace("+2_", "").replace("_", ""), ps["total"],
            ps["first"] if ps["total"] else "", ps["last"].isoformat() if ps["last"] else "",
            upcoming[0]["start"].isoformat() if upcoming else "", upcoming[0]["doctor"] if upcoming else ref["doctor"],
            upcoming[0]["status"].title() if upcoming else "",
            ps["size"], ps["done"], ps["pkg_no"], ps["src"], inf["referral"], inf["age"], ps["start"],
        ])
    pt_index.sort(key=lambda r: r[0])

    # ── تجديد الباقة: (1) جلسته النهارده آخر جلستين في باقته  (2) خلص باقته ومالوش ميعاد جاي ──
    renew_today = [m for m in milestones_all if m["session_no"] >= m["size"] - 1]
    finished = []
    for appts in patients.values():
        ps = pkg_state(appts, upto_incl=True)
        if not ps["last"]:
            continue
        full = (ps["done"] >= ps["size"]) if ps["src"] == "inv" else ps.get("est_full")
        if not full:
            continue
        last = ps["last"]
        gap = (today - last).days
        if gap > FINISHED_DAYS or gap == 0:            # اللي خلص النهارده بيظهر في تنبيه التجديد في أداة التحصيل
            continue
        if any(a["start"] > now and a["status"] in LIVE_TODAY for a in appts):
            continue                                   # حاجز ميعاد جاي = جدد أو راجع
        ref = max((a for a in appts if a["start"].date() == last and _is_pt(a["type"])), key=lambda a: a["start"])
        ev = sorted([a for a in appts if a["type"] in EVAL_TYPES and a["start"].date() >= last - timedelta(days=3)],
                    key=lambda a: a["start"])
        ev_done = [a for a in ev if a["status"] in ATTENDED]
        ev_book = [a for a in ev if a["start"] > now and a["status"] in LIVE_TODAY]
        f = {
            "name": ref["name"], "phone": ref["phone"], "pid": ref["pid"],
            "doctor": ref["doctor"], "branch": ref["branch"],
            "last_session": last.isoformat(), "days_since": gap,
            "total": ps["total"], "packages": ps["pkg_no"] if ps["src"] == "inv" else ps["total"] // CYCLE,
            "size": ps["size"], "pkg_src": ps["src"], "done_in_pkg": ps["done"],
            "approx": ps["approx"],
            "eval": "done" if ev_done else "booked" if ev_book else "none",
            "eval_date": (ev_done or ev_book)[-1]["start"].date().isoformat() if (ev_done or ev_book) else "",
            "eval_type": (ev_done or ev_book)[-1]["type"] if (ev_done or ev_book) else "",
            "eval_doctor": (ev_done or ev_book)[-1]["doctor"] if (ev_done or ev_book) else "",
            "eval_note": ((ev_done or ev_book)[-1].get("note") or "")[:300] if (ev_done or ev_book) else "",
            # مواعيد تقييم اتحجزت وما اتعملتش (اتلغت / ما جاش)
            "eval_missed": [{"date": a["start"].date().isoformat(), "type": a["type"], "doctor": a["doctor"],
                             "status": a["status"].title(), "note": (a.get("note") or "")[:300]}
                            for a in ev if a["start"] <= now and a["status"] not in ATTENDED][-2:],
        }
        f.update(info(appts))
        finished.append(f)
    finished.sort(key=lambda x: x["days_since"])

    # ── التقييم والتجديد: كل باقة خلصت آخر 6 شهور — دخل تقييم (الجلسه الأخيره / اعادة تقييم) ولا لأ، وجدد خلال 10 أيام ولا لأ ──
    EVR_WIN_BEFORE, EVR_WIN_AFTER, EVR_RENEW = 3, 10, 10
    eval_renew = []
    try:
        E_FROM = today - timedelta(days=PERF_DAYS)
        for appts in patients.values():
            att = sorted([a for a in appts if a["status"] in ATTENDED and a["start"].date() <= today and _is_pt(a["type"])],
                         key=lambda a: a["start"])
            byday = {}
            for a in att:
                byday.setdefault(a["start"].date(), a)
            days = sorted(byday)
            if not days:
                continue
            pid = appts[0]["pid"]
            evs = sorted([a for a in appts if a["type"] in EVAL_TYPES and a["status"] in ATTENDED], key=lambda a: a["start"])
            pks = sorted(p for p in pk_by_pid.get(pid, []) if p[0] <= today)
            segs = []
            if pks:
                for i, (st, size) in enumerate(pks):
                    nxt = pks[i + 1][0] if i + 1 < len(pks) else None
                    segs.append((size, [d for d in days if d >= st and (nxt is None or d < nxt)], st < hist_start + timedelta(days=3)))
            else:
                for i in range(0, len(days), CYCLE):
                    segs.append((CYCLE, days[i:i + CYCLE], i == 0 and days[0] <= hist_start + timedelta(days=7)))
            for size, sd, approx in segs:
                if approx or len(sd) < size:
                    continue
                end = sd[size - 1]
                if not (E_FROM <= end <= today):
                    continue
                main_doc = Counter(byday[d]["doctor"] for d in sd[:size]).most_common(1)[0][0]
                ev = [a for a in evs if end - timedelta(days=EVR_WIN_BEFORE) <= a["start"].date() <= end + timedelta(days=EVR_WIN_AFTER)]
                ev = ev[-1] if ev else None
                nx = [d for d in days if end < d <= end + timedelta(days=EVR_RENEW)]
                if nx:
                    st_, rdoc, rdate = "renewed", byday[nx[0]]["doctor"], nx[0].isoformat()
                elif (today - end).days < EVR_RENEW:
                    st_, rdoc, rdate = "pending", "", ""
                else:
                    st_, rdoc, rdate = "no", "", ""
                ref = byday[end]
                eval_renew.append({
                    "name": ref["name"], "phone": ref["phone"], "pid": pid, "branch": ref["branch"], "doctor": main_doc,
                    "end": end.isoformat(), "size": size, "status": st_, "renew_doc": rdoc, "renew_date": rdate,
                    "eval": ({"type": ev["type"], "date": ev["start"].date().isoformat(), "doctor": ev["doctor"],
                              "note": (ev.get("note") or "")[:200]} if ev else None),
                })
        eval_renew.sort(key=lambda x: x["end"], reverse=True)
    except Exception as e:
        print(f"⚠️ eval_renew: {e}")

    # أول يوم شغل بعد النهارده (الجمعة مثلاً مقفول) = أقرب يوم فيه 5 مواعيد أو أكتر
    _dc = Counter(a["start"].date() for v in patients.values() for a in v
                  if a["start"].date() > today and a["status"] in LIVE_TODAY)
    next_work = min([d for d, c in _dc.items() if c >= 5] or [today + timedelta(days=1)])

    # ── تنبيه: 6 جلسات علاج طبيعي من غير أي تقييم (الجلسه الأخيره / اعادة تقييم) — على جلسة النهارده أو بكره ──
    EVAL_DUE_N = 6
    eval_due = []
    try:
        tomorrow = next_work
        for appts in patients.values():
            nxt = sorted([a for a in appts if _is_pt(a["type"]) and a["start"].date() in (today, tomorrow)
                          and a["status"] in LIVE_TODAY], key=lambda a: a["start"])
            if not nxt:
                continue
            ses = nxt[0]; sday = ses["start"].date()
            if any(a["type"] in EVAL_TYPES and a["start"].date() >= today and a["status"] in LIVE_TODAY for a in appts):
                continue                                         # حاجز تقييم خلاص
            pdays = sorted({a["start"].date() for a in appts if _is_pt(a["type"]) and a["status"] in ATTENDED and a["start"].date() < sday})
            cstart = None                                         # بداية الكورس الحالي (بعد انقطاع 3 أسابيع)
            for i, d in enumerate(pdays):
                if i == 0 or (d - pdays[i - 1]).days > COURSE_GAP:
                    cstart = d
            if pdays and (sday - pdays[-1]).days > COURSE_GAP:
                cstart = sday
            last_ev = max((a for a in appts if a["type"] in EVAL_TYPES and a["status"] in ATTENDED and a["start"].date() < sday),
                          key=lambda a: a["start"], default=None)
            frm = max([d for d in (cstart, last_ev["start"].date() if last_ev else None) if d] or [sday])
            n = sum(1 for d in pdays if d >= frm and not (last_ev and d == last_ev["start"].date())) + 1
            if n < EVAL_DUE_N:
                continue
            eval_due.append({
                "name": ses["name"], "phone": ses["phone"], "pid": ses["pid"], "branch": ses["branch"],
                "doctor": ses["doctor"], "session": ses["start"].isoformat(), "day": "today" if sday == today else "tomorrow",
                "n": n, "note": (ses.get("note") or "")[:200],
                "last_eval": ({"type": last_ev["type"], "date": last_ev["start"].date().isoformat(), "doctor": last_ev["doctor"]}
                              if last_ev else None),
                **info(appts),
            })
        eval_due.sort(key=lambda x: (x["day"] != "today", -x["n"], x["session"]))
    except Exception as e:
        print(f"⚠️ eval_due: {e}")

    # ── خطة اليوم: مواعيد النهارده (للاستقبال) · تأكيد بكره · مواعيد Open قديمة · وقفوا بدري ──
    plan = {"today": [], "tomorrow_confirm": [], "stale_open": [], "early_drop": []}
    try:
        CLOSED_BAD = {"canceled", "cancelled", "no show", "noshow", "note", "waiting list", "waiting"}
        tomorrow_ = next_work
        R_FROM = today - timedelta(days=90)
        for appts in patients.values():
            risk = sum(1 for a in appts if R_FROM <= a["start"].date() < today and
                       (a["status"] in ("no show", "noshow") or
                        (a["status"] in ("canceled", "cancelled") and a.get("cancel_at") and
                         0 <= (a["start"] - a["cancel_at"]).total_seconds() / 3600 < 3)))
            tod = sorted([a for a in appts if a["start"].date() == today and a["status"] not in CLOSED_BAD], key=lambda a: a["start"])
            if tod:
                a0 = tod[0]
                plan["today"].append({"pid": a0["pid"], "name": a0["name"], "phone": a0["phone"], "time": a0["start"].isoformat(),
                                      "doctor": a0["doctor"], "branch": a0["branch"], "type": a0["type"], "status": a0["status"].title(),
                                      "types": sorted({a["type"] for a in tod}), "risk": risk, "note": (a0.get("note") or "")[:200]})
            tmr = sorted([a for a in appts if a["start"].date() == tomorrow_ and (a["status"] in LIVE_TODAY or a["status"] in ("canceled", "cancelled"))],
                         key=lambda a: (a["status"] in ("canceled", "cancelled"), a["start"]))
            if tmr:
                a0 = tmr[0]
                pt_before = [a for a in appts if _is_pt(a["type"]) and a["status"] in ATTENDED and a["start"].date() <= today]
                kashf = [a for a in appts if "كشف" in a["type"] and a["status"] in ATTENDED and a["start"].date() >= today - timedelta(days=30)]
                why = []
                if risk >= 2: why.append(f"عنده {risk} غياب/اعتذار مفاجئ آخر 3 شهور")
                if kashf and not pt_before and _is_pt(a0["type"]): why.append("أول جلسة بعد الكشف")
                if why:
                    plan["tomorrow_confirm"].append({"pid": a0["pid"], "name": a0["name"], "phone": a0["phone"], "time": a0["start"].isoformat(),
                                                     "doctor": a0["doctor"], "branch": a0["branch"], "type": a0["type"], "why": why,
                                                     "status": a0["status"].title(), "auto": a0["status"] in ("confirmed", "canceled", "cancelled")})
            for a in appts:   # ⏳ مواعيد على الويتنج ليست النهارده / يوم الشغل الجاي
                if a["status"] in ("waiting list", "waiting") and a["start"].date() in (today, tomorrow_):
                    nt = (a.get("note") or "").strip()
                    upd = a.get("cancel_at")   # = آخر تعديل على الميعاد
                    plan.setdefault("waiting", []).append({
                        "pid": a["pid"], "name": a["name"], "phone": a["phone"], "doctor": a["doctor"], "branch": a["branch"],
                        "time": a["start"].isoformat(), "type": a["type"], "note": nt[:300],
                        "day": "today" if a["start"].date() == today else "next",
                        "note_today": bool(nt) and bool(upd) and upd.date() == today})
            for a in appts:   # مواعيد عدت وما اتقفلتش (لسه Open / Confirmed / Delayed) — آخر 14 يوم
                if today - timedelta(days=14) <= a["start"].date() < today and a["status"] in ("open", "confirmed", "delayed"):
                    plan["stale_open"].append({"pid": a["pid"], "name": a["name"], "time": a["start"].isoformat(), "doctor": a["doctor"],
                                               "branch": a["branch"], "type": a["type"], "status": a["status"].title()})
            # وقفوا بدري: كورس جديد حضر فيه 1-2 جلسة، آخرها من 3 لـ 10 أيام، ومالوش ميعاد جاي
            pdays = sorted({a["start"].date() for a in appts if _is_pt(a["type"]) and a["status"] in ATTENDED and a["start"].date() < today})
            if pdays:
                cs = 0
                for i in range(1, len(pdays)):
                    if (pdays[i] - pdays[i - 1]).days > COURSE_GAP: cs = i
                course = pdays[cs:]
                gap = (today - course[-1]).days
                fut = any(a["start"].date() >= today and a["status"] not in NOT_FUTURE for a in appts)
                if len(course) <= 2 and 3 <= gap <= 10 and not fut:
                    ref = max((a for a in appts if a["start"].date() == course[-1] and _is_pt(a["type"])), key=lambda a: a["start"])
                    plan["early_drop"].append({"pid": ref["pid"], "name": ref["name"], "phone": ref["phone"], "doctor": ref["doctor"],
                                               "branch": ref["branch"], "sessions": len(course), "last": course[-1].isoformat(), "days": gap})
        # 👔 ملحوظات محتاجة المدير: شكوى / فلوس / الدكتور / الألم زاد … في ملحوظة الموعد أو سبب الإلغاء (آخر 3 أيام)
        MGR = _re.compile(r"شكو[يى]|بيشتكي|اشتك|زعلان|زعلانه|متضايق|متضايقه|مستاء|مش ?راضي|مش ?راضيه|غير ?راض|"
                          r"المدير|الادار[هة]|الإدار[هة]|د\.? ?امجد|دكتور ?امجد|"
                          r"استرداد|يسترد|ترجع ?(?:له|لها)? ?فلوس|فلوسه|فلوسها|رجوع ?الفلوس|يرجع ?الفلوس|"
                          r"غلط ?في ?(?:الحساب|الفاتور)|اتخصم ?غلط|زياد[هة] ?في ?السعر|غالي|السعر|خصم|"
                          r"يغير ?الدكتور|تغيير ?الدكتور|مش ?مرتاح|مش ?مرتاحه|معامل[هة]|اسلوب|أسلوب|وحش|سيئ|"
                          r"اتأخر ?عليه|اتاخر ?عليه|استنى ?كتير|استنت ?كتير|التأخير|"
                          r"الوجع ?زاد|الألم ?زاد|الالم ?زاد|تعب ?بعد ?الجلس|اتعور|اصاب[هة]|إصاب[هة]|حرق|كدمه|التهاب", _re.I)
        mgr = []
        for appts in patients_all.values():
            for a in appts:
                n = (a.get("note") or "").strip()
                if not n or not (today - timedelta(days=3) <= a["start"].date() <= today):
                    continue
                m = MGR.search(n)
                if not m:
                    continue
                nx = min((x for x in appts if x["start"] > now and x["status"] not in NOT_FUTURE and x["doctor"].lower() not in SKIP_DOCS),
                         key=lambda x: x["start"], default=None)
                mgr.append({"pid": a["pid"], "name": a["name"], "phone": a["phone"], "doctor": a["doctor"], "branch": a["branch"],
                            "time": a["start"].isoformat(), "type": a["type"], "status": a["status"].title(), "note": n[:400], "hit": m.group(0),
                            "next": ({"time": nx["start"].isoformat(), "type": nx["type"], "status": nx["status"].title(), "doctor": nx["doctor"]} if nx else None)})
        mgr.sort(key=lambda x: x["time"], reverse=True)
        plan["manager"] = mgr
        plan["today"].sort(key=lambda x: x["time"])
        # المهام اللي ظهرت النهارده واختفت = اتعملت على السيستم (حجز / تقييم / قفل الموعد …) → تتحسب في الإنجاز
        try:
            import os as _os, json as _json
            act = {
                "miss":   {x["pid"]: x for x in missing_today},
                "kashf":  {x["pid"]: x for x in kashf_pending if 1 <= (x.get("days_since") or 0) <= 3 and not x.get("next_pt") and not x.get("sessions_after")},
                "kashf0": {x["pid"]: x for x in kashf_pending if (x.get("days_since") or 0) == 0 and not x.get("next_pt") and not x.get("sessions_after")
                           and str(x.get("kashf_status") or "").lower() in ATTENDED},
                "drop":   {x["pid"]: x for x in plan["early_drop"]},
                "nonext": {x["pid"]: x for x in no_next},
                "eval":   {x["pid"]: x for x in eval_due if x.get("day") == "today"},
                "stale":  {x["pid"] + "|" + x["time"]: x for x in plan["stale_open"]},
                "waittoday": {x["pid"] + "|" + x["time"]: x for x in plan.get("waiting", []) if x["day"] == "today" and not x["note_today"]},
                "waitnext":  {x["pid"] + "|" + x["time"]: x for x in plan.get("waiting", []) if x["day"] == "next" and not x["note_today"]},
            }
            fn = _os.path.join(".session", "plan_seen.json")
            seen = {}
            if _os.path.exists(fn):
                try:
                    seen = _json.load(open(fn, encoding="utf-8"))
                except Exception:
                    seen = {}
            if seen.get("date") != today.isoformat():
                seen = {"date": today.isoformat(), "items": {}}
            items = seen.setdefault("items", {})
            resolved = []
            for typ, cur in act.items():
                old_ = items.setdefault(typ, {})
                for k, x in cur.items():
                    old_[k] = {f: x.get(f) for f in ("pid", "name", "phone", "doctor", "branch", "time", "type", "status") if x.get(f) is not None}
                for k, x in old_.items():
                    if k not in cur:
                        resolved.append(dict(x, kind=typ, key=k))
            # اللي اتعمل بالظبط: الميعاد اللي اتحجز / الحالة الجديدة
            by_pid = defaultdict(list)
            for v in patients_all.values():
                for a in v:
                    by_pid[a["pid"]].append(a)
            fmt = lambda a: f'{a["type"]} يوم {a["start"].strftime("%d/%m")} الساعة {a["start"].strftime("%H:%M")} مع {a["doctor"]}'
            for r in resolved:
                ap = sorted(by_pid.get(r.get("pid"), []), key=lambda a: a["start"])
                k = r["kind"]
                if k in ("waittoday", "waitnext"):
                    try:
                        d0 = datetime.fromisoformat(r.get("time")).date()
                    except Exception:
                        d0 = None
                    same = [a for a in ap if d0 and a["start"].date() == d0 and a["status"] not in ("waiting list", "waiting")]
                    if same:
                        a = same[-1]
                        r["what"] = (f'اتلغى' if a["status"] in ("canceled", "cancelled") else f'اتنقل من الويتنج: {a["status"].title()} الساعة {a["start"].strftime("%H:%M")} مع {a["doctor"]}')
                    else:
                        r["what"] = "اتشال من الويتنج"
                    continue
                if k == "stale":
                    cur = next((a for a in ap if a["start"].isoformat() == r.get("time")), None)
                    r["what"] = f'الموعد اتقفل: {cur["status"].title()}' if cur else "الموعد اتقفل / اتمسح"
                    continue
                if k == "miss" and any(a["start"].date() == today and a["status"] in LIVE_TODAY for a in ap):
                    r["what"] = "اتحجزله النهارده / جه النهارده"; continue
                fut = [a for a in ap if a["start"] > now and a["status"] not in NOT_FUTURE and a["doctor"].lower() not in SKIP_DOCS]
                if k == "eval":
                    fut = [a for a in fut if a["type"] in EVAL_TYPES] or fut
                if k in ("kashf", "kashf0"):
                    fut = [a for a in fut if _is_pt(a["type"])] or fut
                r["what"] = ("اتحجز " + fmt(fut[0])) if fut else "اتحلّت على السيستم"
            plan["resolved"] = resolved
            _os.makedirs(".session", exist_ok=True)
            _json.dump(seen, open(fn, "w", encoding="utf-8"), ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ plan resolved: {e}")
        plan["stale_open"].sort(key=lambda x: x["time"], reverse=True)
    except Exception as e:
        print(f"⚠️ plan: {e}")

    # ── إلغاء / غياب ورا بعض (الصفحة بتطابقهم مع شيت التثبيتات بالاسم) ──
    streaks = []
    for appts in patients.values():
        past = sorted([a for a in appts if a["start"] <= now], key=lambda a: a["start"], reverse=True)
        # نحسب باليوم: أي يوم فيه حضور = يوم حضور (حتى لو فيه ميعاد تاني اتلغى نفس اليوم)
        by_day = defaultdict(list)
        for a in past:
            by_day[a["start"].date()].append(a)
        misses = []
        for day in sorted(by_day, reverse=True):
            day_appts = by_day[day]
            if any(a["status"] in ATTENDED for a in day_appts):
                break                      # أول يوم حضور يقفل العداد
            day_miss = [a for a in day_appts if a["status"] in MISS_ONLY]
            if day_miss:
                misses.append(day_miss[-1])  # Waiting / Open / Note بيتجاهلوا
        if len(misses) < STREAK_MIN:
            continue
        if (today - misses[0]["start"].date()).days > STREAK_RECENT:
            continue
        att = [a for a in past if a["status"] in ATTENDED]
        nxt = sorted([a for a in appts if a["start"] > now and a["status"] in BOOKED], key=lambda a: a["start"])
        streaks.append({
            "name": misses[0]["name"], "phone": misses[0]["phone"], "pid": misses[0]["pid"],
            "doctor": misses[0]["doctor"], "branch": misses[0]["branch"],
            "streak": len(misses),
            "misses": [{"date": m["start"].date().isoformat(), "status": m["status"].title(),
                        "doctor": m["doctor"]} for m in misses[:6]],
            "last_attended": att[0]["start"].date().isoformat() if att else "",
            "next_appt": nxt[0]["start"].isoformat() if nxt else "",
            "next_status": nxt[0]["status"].title() if nxt else "",
            **info(appts),
        })
    streaks.sort(key=lambda x: (x["misses"][0]["date"], x["streak"]), reverse=True)   # آخر إلغاء الأحدث فوق

    starts = [a["start"].date() for v in patients.values() for a in v]
    return {
        "generated_at": now.isoformat(),
        "history_from": min(starts).isoformat() if starts else "",
        "today": today.isoformat(),
        "last_week": last_week.isoformat(),
        "rules": {"drop_days": DROP_DAYS, "regular_window": REGULAR_WINDOW,
                  "regular_min_days": REGULAR_MIN, "recent_days": RECENT_DAYS,
                  "streak_min": STREAK_MIN, "streak_recent_days": STREAK_RECENT,
                  "lookback_days": LOOKBACK_DAYS},
        "dropped": dropped,
        "streaks": streaks,
        "today_no_next": no_next,
        "missing_today": missing_today,
        "svc_gap": svc_gap,
        "kashf_pending": kashf_pending,
        "followups": followups,
        "sudden": sudden,
        "milestones": milestones,
        "pt_index": pt_index,
        "renew_today": renew_today,
        "finished_packages": finished,
        "eval_renew": eval_renew,
        "eval_due": eval_due,
        "plan": dict(plan, calls_today=calls_today),
        "cycle": CYCLE,
        "analysis": build_analysis(patients, today),
        "doc_perf": perf,
        "day_counts": {k: {doc: dict(br) for doc, br in v.items()} for k, v in day_counts.items()},
    }
