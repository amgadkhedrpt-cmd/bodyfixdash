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
from datetime import datetime, timezone, timedelta
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

PT_TYPES       = {"جلسة", "جلسة علاج طبيعي"}   # جلسة علاج طبيعي بس (Enum5 في Medicolize)
CYCLE          = 12   # عدد جلسات الدورة — بعد 12 العد يرجع 1
MILESTONES     = {3, 6, 9, 12}   # الجلسات اللي تظهر في قايمة النهارده
RENEW_AT       = {11, 12}        # جلسة النهارده دي = الباقة بتخلص — اعرض التجديد (بيظهر في أداة التحصيل)
FINISHED_DAYS  = 60              # "خلص باقة ومجددش": آخر جلسة (رقم 12) في آخر 60 يوم
COURSE_GAP     = 21   # انقطاع أكتر من 3 أسابيع = كورس جديد


def _is_pt(t):
    return (t or "").strip() in PT_TYPES


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
    else:
        name, phone, pid = (pat or "").strip(), a.get("phone") or "", a.get("patient_id") or ""
    try:
        start = datetime.fromisoformat(str(a.get("start")).replace("Z", "+00:00")).astimezone(CAIRO)
    except Exception:
        return None
    return {
        "doctor": (doc or "").strip(), "branch": (br or "").strip(), "pid": str(pid or ""),
        "name": name, "phone": phone, "start": start,
        "status": str(a.get("status") or "").strip().lower(),
        "type": str(a.get("type") or ""),
    }


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


def build_alerts(appointments, now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(CAIRO)
    today = now.date()
    last_week = today - timedelta(days=7)

    patients = defaultdict(list)
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
        if a["doctor"].lower() in SKIP_DOCS or not (a["name"] or a["phone"]):
            continue
        patients[_pkey(a["name"], a["phone"], a["pid"])].append(a)

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
        })
    dropped.sort(key=lambda x: (x["next_appt"] != "", x["days_since"]))   # الأحدث انقطاعًا فوق

    # ── عندهم ميعاد النهارده (أي حالة) ومالهمش أي ميعاد بعد النهارده (حتى Waiting يتحسب ميعاد) ──
    NOT_FUTURE = {"canceled", "cancelled", "no show", "noshow", "note"}
    no_next = []
    for appts in patients.values():
        today_att = [a for a in appts if a["start"].date() == today]
        if not today_att:
            continue
        future = [a for a in appts if a["start"].date() > today and a["status"] not in NOT_FUTURE]
        if future:
            continue
        last = max(today_att, key=lambda a: a["start"])
        no_next.append({
            "name": last["name"], "phone": last["phone"], "pid": last["pid"],
            "doctor": last["doctor"], "branch": last["branch"],
            "time": last["start"].isoformat(), "type": last["type"], "status": last["status"].title(),
        })
    no_next.sort(key=lambda x: x["time"], reverse=True)

    # ── جلسة رقم 3 / 6 / 9 / 12 النهارده: العد من أول جلسة خالص، وبعد 12 يرجع 1 (ومعاه عدد الـ 12 اللي خلصت) ──
    LIVE_TODAY = {"open", "confirmed", "checked in", "checkedin", "in progress", "inprogress", "completed", "delayed"}
    milestones_all = []
    for appts in patients.values():
        today_pt = [a for a in appts if a["start"].date() == today and _is_pt(a["type"]) and a["status"] in LIVE_TODAY]
        if not today_pt:
            continue
        prior_days = {a["start"].date() for a in appts
                      if a["start"].date() < today and _is_pt(a["type"]) and a["status"] in ATTENDED}
        total = len(prior_days) + 1                 # جلسة النهارده
        cycle_no = (total - 1) % CYCLE + 1          # رقمها جوه الـ 12
        t = min(today_pt, key=lambda a: a["start"])
        milestones_all.append({
            "name": t["name"], "phone": t["phone"], "pid": t["pid"],
            "doctor": t["doctor"], "branch": t["branch"],
            "time": t["start"].isoformat(), "status": t["status"].title(),
            "session_no": cycle_no, "total": total, "cycles_done": (total - 1) // CYCLE,
            "first_session": min(prior_days).isoformat() if prior_days else today.isoformat(),
        })
    milestones_all.sort(key=lambda x: x["time"])

    # ── فهرس كل المرضى للبحث: عدد جلسات العلاج الطبيعي اللي حضرها + جلسته الجاية رقم كام وفي أنهي باقة ──
    # كل صف: [الاسم, التليفون, جلسات حضرها قبل النهارده, أول جلسة, آخر جلسة, ميعاد النهارده أو الجاي, دكتوره, حالته]
    pt_index = []
    for appts in patients.values():
        done_days = sorted({a["start"].date() for a in appts
                            if a["start"].date() < today and _is_pt(a["type"]) and a["status"] in ATTENDED})
        upcoming = sorted([a for a in appts if a["start"].date() >= today and _is_pt(a["type"]) and a["status"] in LIVE_TODAY],
                          key=lambda a: a["start"])
        if not done_days and not upcoming:
            continue
        ref = upcoming[0] if upcoming else max(appts, key=lambda a: a["start"])
        pt_index.append([
            ref["name"], (ref["phone"] or "").replace("+2_", "").replace("_", ""), len(done_days),
            done_days[0].isoformat() if done_days else "", done_days[-1].isoformat() if done_days else "",
            upcoming[0]["start"].isoformat() if upcoming else "", upcoming[0]["doctor"] if upcoming else ref["doctor"],
            upcoming[0]["status"].title() if upcoming else "",
        ])
    pt_index.sort(key=lambda r: r[0])
    # التاريخ اللي معانا بيبدأ من أول يوم في البيانات — اللي أول جلسة ليه قريبة منه غالبًا بدأ قبلها، فرقمه تقريبي
    hist_start = min((a["start"].date() for v in patients.values() for a in v), default=today)
    for m in milestones_all:
        m["approx"] = m["first_session"] <= (hist_start + timedelta(days=7)).isoformat()
    milestones = [m for m in milestones_all if m["session_no"] in MILESTONES]

    # ── تجديد الباقة: (1) جلسته النهارده 11 أو 12  (2) خلص الجلسة 12 ومالوش ميعاد جاي ──
    renew_today = [m for m in milestones_all if m["session_no"] in RENEW_AT]
    finished = []
    for appts in patients.values():
        done_days = sorted({a["start"].date() for a in appts
                            if a["start"].date() <= today and _is_pt(a["type"]) and a["status"] in ATTENDED})
        if not done_days or len(done_days) % CYCLE:
            continue
        last = done_days[-1]
        gap = (today - last).days
        if gap > FINISHED_DAYS or gap == 0:            # اللي خلص النهارده بيظهر في تنبيه التجديد في أداة التحصيل
            continue
        if any(a["start"] > now and a["status"] in LIVE_TODAY for a in appts):
            continue                                   # حاجز ميعاد جاي = جدد أو راجع
        ref = max((a for a in appts if a["start"].date() == last and _is_pt(a["type"])), key=lambda a: a["start"])
        finished.append({
            "name": ref["name"], "phone": ref["phone"], "pid": ref["pid"],
            "doctor": ref["doctor"], "branch": ref["branch"],
            "last_session": last.isoformat(), "days_since": gap,
            "total": len(done_days), "packages": len(done_days) // CYCLE,
            "approx": done_days[0] <= hist_start + timedelta(days=7),
        })
    finished.sort(key=lambda x: x["days_since"])

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
        "milestones": milestones,
        "pt_index": pt_index,
        "renew_today": renew_today,
        "finished_packages": finished,
        "cycle": CYCLE,
        "analysis": build_analysis(patients, today),
        "day_counts": {k: {doc: dict(br) for doc, br in v.items()} for k, v in day_counts.items()},
    }
