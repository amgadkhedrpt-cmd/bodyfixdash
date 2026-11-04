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
    else:
        name, phone = (pat or "").strip(), a.get("phone") or ""
    try:
        start = datetime.fromisoformat(str(a.get("start")).replace("Z", "+00:00")).astimezone(CAIRO)
    except Exception:
        return None
    return {
        "doctor": (doc or "").strip(), "branch": (br or "").strip(),
        "name": name, "phone": phone, "start": start,
        "status": str(a.get("status") or "").strip().lower(),
        "type": str(a.get("type") or ""),
    }


def _pkey(name, phone):
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 9 else "n:" + re.sub(r"\s+", " ", name)


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
        patients[_pkey(a["name"], a["phone"])].append(a)

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
        after = sorted([a for a in appts if last < a["start"] <= now and a["status"] in MISSED],
                       key=lambda a: a["start"])
        nxt = sorted([a for a in appts if a["start"] > now and a["status"] in BOOKED],
                     key=lambda a: a["start"])
        ref = max(att, key=lambda a: a["start"])
        doctor = Counter(a["doctor"] for a in win).most_common(1)[0][0]
        dropped.append({
            "name": ref["name"], "phone": ref["phone"],
            "doctor": doctor, "branch": ref["branch"],
            "last_attended": last.date().isoformat(), "days_since": gap,
            "attended_days_2w": att_days,
            "last_status": after[-1]["status"].title() if after else "",
            "last_status_date": after[-1]["start"].date().isoformat() if after else "",
            "next_appt": nxt[0]["start"].isoformat() if nxt else "",
            "next_doctor": nxt[0]["doctor"] if nxt else "",
        })
    dropped.sort(key=lambda x: (x["next_appt"] != "", x["days_since"]))   # الأحدث انقطاعًا فوق

    return {
        "generated_at": now.isoformat(),
        "today": today.isoformat(),
        "last_week": last_week.isoformat(),
        "rules": {"drop_days": DROP_DAYS, "regular_window": REGULAR_WINDOW,
                  "regular_min_days": REGULAR_MIN, "recent_days": RECENT_DAYS,
                  "lookback_days": LOOKBACK_DAYS},
        "dropped": dropped,
        "day_counts": {k: {doc: dict(br) for doc, br in v.items()} for k, v in day_counts.items()},
    }
