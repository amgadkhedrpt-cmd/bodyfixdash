import os
import json
import re
import asyncio
import time
import collections
from datetime import datetime, timezone, timedelta
from collections import defaultdict

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH", "/home/runner/.cache/ms-playwright"
)

from playwright.async_api import async_playwright

SITE_URL = os.environ.get("MEDICOLIZE_URL",  "https://my.medicolize.com")
USERNAME = os.environ.get("MEDICOLIZE_USER", "")
PASSWORD = os.environ.get("MEDICOLIZE_PASS", "")
SESSION_FILE = ".session/state.json"   # الجلسة المحفوظة بين الـ runs (cache في GitHub Actions)
LAST_LOGIN_REUSED = False
GMAIL_USER = os.environ.get("GMAIL_USER", "").strip()
GMAIL_PASS = os.environ.get("GMAIL_APP_PASS", "").replace(" ", "").strip()
API_URL  = "https://api.medicolize.com/"
HEADLESS = True
TIMEOUT  = 45000

# أسامي أنواع المواعيد — الحقيقية من إعدادات Medicolize (بتتحدث لوحدها أول كل سحب من load_type_names)
# الجدول ده احتياطي بس لو القراءة فشلت — اتنقل من إعدادات Medicolize يوم 9 نوفمبر 2026
APPOINTMENT_TYPES = {
    "Enum1": "كشف علاج طبيعي", "Enum40": "تقييم الجلسه الأخيره", "Enum12": "اعادة تقييم",
    "Enum5": "جلسة علاج طبيعي", "Enum11": "ج ريكفري", "Enum14": "ج حجامه", "Enum2": "كشف تغذيه",
    "Enum3": "متابعة تغذيه", "Enum4": "متابعة تغذيه اونلاين", "Enum6": "جلسة تغذيه", "Enum7": "حقن ميزوثيرابي",
    "Enum8": "شوك ويف منطقه واحده", "Enum15": "شوك ويف علي منطقتين", "Enum29": "شد فقرات", "Enum10": "ماجنتك",
    "Enum13": "جلسة علاج طبيعي علي منطقتين", "Enum17": "جلسه منزليه", "Enum18": "موعد محجوز",
    "Enum19": "العنايه بالبشره", "Enum20": "أجهزه", "Enum21": "استرداد", "Enum22": "تقرير بالحاله",
    "Enum24": "Feedback", "Enum25": "الغاء مفاجئ", "Enum26": "Cavitation", "Enum28": "RF", "Enum16": "Cryo",
    "Enum27": "Cryo-blade", "Enum9": "Cryo-Air", "Enum30": "Excilis", "Enum32": "علاج طبيعي اونلاين",
    "Enum31": "حقن مونجارو", "Enum33": "متابعه", "Enum23": "متابعه انقطاع", "Enum34": "منقطع نهائي",
    "Enum35": "شكوي", "Enum36": "تصوير", "Enum37": "مساج فقرات", "Enum38": "تيكار", "Enum39": "gym",
    "Enum41": "ليزر", "Enum42": "جلسه تصريف ليمفاوي",
}

STATUS_NAMES = {
    "OPEN":        "Open",
    "CONFIRMED":   "Confirmed",
    "WAITING":     "Waiting List",
    "COMPLETED":   "Completed",
    "CANCELLED":   "Canceled",
    "CHECKED":     "Checked In",
    "IN_PROGRESS": "In Progress",
    "CHECKEDIN":   "Checked In",
    "INPROGRESS":  "In Progress",
    "CANCELED":    "Canceled",
    "NOSHOW":      "No Show",
    "DELAYED":     "Delayed",
    "NOTE":        "Note",
}

GQL_QUERY = "query CREATED_APPOINTMENTS($orderBy:String!,$skip:Int!,$take:Int!,$searchTerm:String,$rangeDate:[DateTime!]!,$filters:Filter){createdAppointments(orderBy:$orderBy skip:$skip take:$take searchTerm:$searchTerm rangeDate:$rangeDate filters:$filters){id start end status type other doctor{id name color __typename}branch{id name __typename}patient{id firstName lastName phoneNumber birthDate __typename}createdAt __typename}}"

NOTE_FIELD = None   # اسم خانة ملحوظة الميعاد في Medicolize — بنكتشفه أول السحب
NOTE_CANDIDATES = ["note", "notes", "description", "comment", "comments", "details", "remarks", "remark",
                   "patientNote", "appointmentNote", "memo", "info"]
NOTE_PROBE = {}
PAT_FIELDS = []     # خانات تفاصيل المريض (ملحوظة / تاجز) اللي اشتغلت
PAT_CANDIDATES = ["notes", "note", "details", "description", "comment", "comments", "remarks", "info", "medicalNotes",
                  "tags{name}", "tags{id name}", "status", "patientStatus", "type", "category"]
PAT_PROBE = {}
CANCEL_FIELD = None  # وقت الإلغاء (عشان نعرف اعتذر قبل ميعاده بكام ساعة)
CANCEL_CANDIDATES = ["canceledAt", "cancelledAt", "cancelDate", "cancellationDate", "statusUpdatedAt", "statusChangedAt", "updatedAt"]
CANCEL_PROBE = {}
NOTE_PAST_DAYS = 7    # ملحوظات المواعيد اللي بتظهر في الداشبورد: من أسبوع فات
NOTE_NEXT_DAYS = 14   # ... لحد أسبوعين جايين


def gql_query_with_note():
    q = GQL_QUERY
    if NOTE_FIELD:
        q = q.replace("type other ", "type other " + NOTE_FIELD + " ", 1)
    if CANCEL_FIELD and CANCEL_FIELD != NOTE_FIELD:
        q = q.replace("type other ", "type other " + CANCEL_FIELD + " ", 1)
    if PAT_FIELDS:
        q = q.replace("phoneNumber birthDate __typename}", "phoneNumber birthDate " + " ".join(PAT_FIELDS) + " __typename}", 1)
    return q


def _flat_text(flat, v, depth=0):
    """يحوّل أي قيمة (كلام / ليستة تاجز / object) لنص — بيفك المراجع بتاعة الرد المضغوط."""
    if depth > 4:
        return ""
    v = resolve_val(flat, v) if isinstance(v, int) else v
    if isinstance(v, str):
        return v.strip()
    if isinstance(v, list):
        return " · ".join(t for t in (_flat_text(flat, x, depth + 1) for x in v) if t)
    if isinstance(v, dict):
        for k in ("name", "title", "label", "text", "value"):
            if k in v:
                return _flat_text(flat, v[k], depth + 1)
    return ""


def build_date_range():
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end   = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.999Z")
    return [start, end]

def resolve_val(flat, val):
    if isinstance(val, int) and 0 <= val < len(flat):
        return flat[val]
    return val

def resolve_obj(flat, ref):
    obj = resolve_val(flat, ref)
    if isinstance(obj, dict):
        return {k: resolve_val(flat, v) for k, v in obj.items() if k != '__typename'}
    return {}

def parse_flat_array(flat):
    appointments = []
    root_idx = None
    for item in reversed(flat):
        if isinstance(item, dict) and "createdAppointments" in item:
            root_idx = item["createdAppointments"]
            break
    if root_idx is None:
        return []
    appt_indices = resolve_val(flat, root_idx)
    if not isinstance(appt_indices, list):
        return []
    for idx in appt_indices:
        appt_obj = resolve_val(flat, idx)
        if not isinstance(appt_obj, dict):
            continue
        try:
            appt_id  = resolve_val(flat, appt_obj.get('id'))
            start    = resolve_val(flat, appt_obj.get('start'))
            end      = resolve_val(flat, appt_obj.get('end'))
            status   = resolve_val(flat, appt_obj.get('status'))
            type_raw = resolve_val(flat, appt_obj.get('type'))
            other    = resolve_val(flat, appt_obj.get('other'))
            note_v   = resolve_val(flat, appt_obj.get(NOTE_FIELD)) if NOTE_FIELD else None
            cancel_v = resolve_val(flat, appt_obj.get(CANCEL_FIELD)) if CANCEL_FIELD else None
            created  = resolve_val(flat, appt_obj.get('createdAt'))
            doctor_obj  = resolve_obj(flat, appt_obj.get('doctor'))
            branch_obj  = resolve_obj(flat, appt_obj.get('branch'))
            patient_obj = resolve_obj(flat, appt_obj.get('patient'))
            pat_raw = resolve_val(flat, appt_obj.get('patient'))
            pnote = " · ".join(t for t in (_flat_text(flat, pat_raw.get(f.split("{")[0])) for f in PAT_FIELDS)
                               if t) if isinstance(pat_raw, dict) else ""
            if other and isinstance(other, str) and not other.startswith("Enum"):
                appt_type = other
            elif type_raw and isinstance(type_raw, str) and not type_raw.startswith("Enum"):
                appt_type = type_raw
            else:
                enum_key = other if isinstance(other, str) and other.startswith("Enum") else \
                           type_raw if isinstance(type_raw, str) and type_raw.startswith("Enum") else None
                appt_type = APPOINTMENT_TYPES.get(enum_key, enum_key or "غير محدد")
            status_mapped = STATUS_NAMES.get(status, status) if isinstance(status, str) else str(status)
            appointments.append({
                "id":        appt_id,
                "start":     start,
                "end":       end,
                "status":    status_mapped,
                "status_en": status,
                "type":      appt_type,
                "createdAt": created,
                "note":      (note_v.strip()[:300] if isinstance(note_v, str) and note_v.strip() else None),
                "cancel_at": cancel_v if isinstance(cancel_v, str) else None,
                "doctor":  {"name": doctor_obj.get('name'), "color": doctor_obj.get('color')},
                "branch":  {"name": branch_obj.get('name')},
                "patient": {
                    "id":          patient_obj.get('id'),
                    "firstName":   patient_obj.get('firstName'),
                    "lastName":    patient_obj.get('lastName'),
                    "phoneNumber": patient_obj.get('phoneNumber'),
                    "birthDate":   patient_obj.get('birthDate'),
                    "pnote":       pnote[:300] or None,
                },
            })
        except Exception:
            continue
    return appointments

# ── DOC MAP: ربط أسماء Medicolize بأسماء الشيت ──────────────────
def load_doc_map():
    """يقرأ doc_map.json لو موجود"""
    if os.path.exists("doc_map.json"):
        try:
            with open("doc_map.json", "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {}

def save_doc_map(doc_map):
    """يحفظ doc_map.json"""
    with open("doc_map.json", "w", encoding="utf-8") as f:
        json.dump(doc_map, f, ensure_ascii=False, indent=2)
    import shutil
    if os.path.exists("doc_map.json"):
        shutil.copy("doc_map.json", "data/doc_map.json")

def update_doc_map(med_doctors, existing_map):
    """
    يضيف أي دكتور جديد من Medicolize للـ map لو مش موجود
    بيحفظ الأسماء الجديدة بـ null عشان الداشبورد يعرف يعرضها للربط اليدوي
    """
    updated = False
    for doc in med_doctors:
        if doc and doc not in existing_map:
            existing_map[doc] = None  # null = مش مربوط لسه
            updated = True
            print(f"   📋 دكتور جديد في الـ map: {doc}")
    return updated

def _fetch_code_from_gmail(since_utc, timeout_s=180):
    """يقرا كود التحقق من أحدث إيميل وصل بعد since_utc (IMAP — قراءة بس)."""
    import imaplib, email, re, time
    from email.utils import parsedate_to_datetime
    from email.header import decode_header, make_header
    if not GMAIL_USER or not GMAIL_PASS:
        raise RuntimeError("Medicolize طالبة كود تحقق — ضيف GMAIL_USER و GMAIL_APP_PASS في Secrets")

    def _hdr(v):
        try: return str(make_header(decode_header(v or "")))
        except Exception: return str(v or "")

    def _all_mail(M):
        # اسم فولدر "كل البريد" بيختلف حسب لغة الـ Gmail — نجيبه بعلامة \All
        try:
            _, boxes = M.list()
            for b in boxes or []:
                line = b.decode(errors="ignore")
                if "\\All" in line:
                    return line.split(' "/" ')[-1].strip()
        except Exception:
            pass
        return "INBOX"

    seen = set()
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            M = imaplib.IMAP4_SSL("imap.gmail.com")
            M.login(GMAIL_USER, GMAIL_PASS)
            box = _all_mail(M)
            M.select(box, readonly=True)
            day = (since_utc - timedelta(days=1)).strftime("%d-%b-%Y")
            _, ids = M.search(None, f"(SINCE {day})")
            for mid in reversed(ids[0].split()[-25:]):
                _, data = M.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])
                try:
                    sent = parsedate_to_datetime(msg["Date"]).astimezone(timezone.utc)
                except Exception:
                    continue
                if sent < since_utc - timedelta(seconds=90):
                    continue
                frm, subj = _hdr(msg.get("From")), _hdr(msg.get("Subject"))
                if mid not in seen:
                    seen.add(mid)
                    print(f"   📧 [{box}] {sent:%H:%M:%S} from={frm[:60]} | subject={subj[:60]}")
                text = ""
                for part in msg.walk():
                    if part.get_content_type() in ("text/plain", "text/html"):
                        try:
                            text += part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore") + " "
                        except Exception:
                            pass
                text = re.sub(r"<[^>]+>", " ", text)
                text = re.sub(r"&nbsp;|\s+", " ", text)
                blob = (frm + " " + subj + " " + text).lower()
                if not any(w in blob for w in ("medicolize", "verification", "verify", "code", "كود", "رمز", "تحقق")):
                    continue
                m = re.search(r"(?:code|كود|رمز)[^0-9]{0,80}(\d{4,8})\b", subj + " " + text, re.I) \
                    or re.search(r"(?<![\d#])(\d{6})(?!\d)", text) \
                    or re.search(r"(?<![\d#])(\d{4,8})(?!\d)", subj)
                if m:
                    print(f"   ✅ code found in email from {frm[:40]}")
                    M.logout()
                    return m.group(1)
            M.logout()
        except imaplib.IMAP4.error as e:
            raise RuntimeError(f"دخول Gmail فشل — راجع GMAIL_USER و GMAIL_APP_PASS ({e})")
        except Exception as e:
            print(f"   ⚠️ Gmail: {e}")
        time.sleep(6)
    raise RuntimeError("ما وصلش إيميل فيه كود خلال 3 دقايق — شوف أسماء الإيميلات اللي فوق في اللوج")

async def do_login(context, page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    print(f"[{ts()}] Opening login page...")
    captured = {}
    def _on_req(req):
        try:
            if "api.medicolize.com" in req.url:
                for k, v in req.headers.items():
                    kl = k.lower()
                    if kl == "authorization" or kl.startswith("x-") or "token" in kl:
                        captured[k] = v
        except Exception:
            pass
    page.on("request", _on_req)
    global LAST_LOGIN_REUSED
    LAST_LOGIN_REUSED = False
    if os.path.exists(SESSION_FILE):
        await page.goto(SITE_URL, wait_until="networkidle", timeout=TIMEOUT)
        await page.wait_for_timeout(4000)
        if "/auth" not in page.url:
            LAST_LOGIN_REUSED = True
            print(f"[{ts()}] ♻️ Saved session reused — no login / no code email")
    if not LAST_LOGIN_REUSED:
        await page.goto(f"{SITE_URL}/auth/login", wait_until="networkidle", timeout=TIMEOUT)
        await page.wait_for_timeout(3000)
        for sel in ['input[type="email"]', 'input[name="email"]', 'input']:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=2000):
                    await loc.click(); await loc.fill(""); await loc.type(USERNAME, delay=50)
                    print(f"[{ts()}] Email entered"); break
            except: continue
        for sel in ['input[type="password"]', 'input[name="password"]']:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=2000):
                    await loc.click(); await loc.fill(""); await loc.type(PASSWORD, delay=50)
                    print(f"[{ts()}] Password entered"); break
            except: continue
        try:
            rm = page.get_by_text("Remember me", exact=False).first
            if await rm.is_visible(timeout=1500):
                await rm.click(); print(f"[{ts()}] Remember me checked")
        except Exception:
            pass
        login_clicked_at = datetime.now(timezone.utc)
        for sel in ['button[type="submit"]', 'button:has-text("Login")', 'button']:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=2000):
                    await loc.click(); print(f"[{ts()}] Login clicked"); break
            except: continue
        await page.wait_for_timeout(6000)

        # ── كود التحقق (Medicolize بتبعته على الإيميل) ──
        if "/auth/login" in page.url:
            code_inputs = page.locator('input:visible:not([type="email"]):not([type="password"]):not([type="checkbox"]):not([type="hidden"])')
            n = await code_inputs.count()
            names = []
            for i in range(min(n, 8)):
                try:
                    el = code_inputs.nth(i)
                    names.append(f"{await el.get_attribute('type')}/{await el.get_attribute('name')}/{await el.get_attribute('maxlength')}")
                except Exception:
                    pass
            print(f"[{ts()}] Still on login page — candidate code inputs: {names}")
            body_txt = ""
            try: body_txt = await page.inner_text("body")
            except Exception: pass
            if "verification" in body_txt.lower() and n:
                print(f"[{ts()}] Verification code requested — reading Gmail...")
                code = await asyncio.to_thread(_fetch_code_from_gmail, login_clicked_at)
                print(f"[{ts()}] Code received ({len(code)} digits)")
                # نختار خانة الكود: آخر خانات مش الإيميل — تشتغل مع خانة واحدة أو خانة لكل رقم
                singles = []
                for i in range(n):
                    el = code_inputs.nth(i)
                    if (await el.get_attribute("maxlength")) == "1":
                        singles.append(el)
                if len(singles) >= len(code):
                    for el, ch in zip(singles, code):
                        await el.fill(ch)
                else:
                    target = code_inputs.nth(n - 1)
                    await target.click(); await target.fill(""); await target.type(code, delay=60)
                for sel in ['button:has-text("Verify")', 'button:has-text("Continue")', 'button[type="submit"]', 'button:has-text("Login")']:
                    try:
                        loc = page.locator(sel).first
                        if await loc.is_visible(timeout=1500):
                            await loc.click(); print(f"[{ts()}] Code submitted"); break
                    except: continue
                await page.wait_for_timeout(8000)
    print(f"[{ts()}] After login URL: {page.url}")
    if "/auth/login" in page.url:
        try:
            body = (await page.inner_text("body"))[:300].replace("\n", " | ")
        except Exception:
            body = ""
        raise RuntimeError(f"اللوجين فشل — لسه على صفحة الدخول. نص الصفحة: {body}")
    cookies = await context.cookies()
    print(f"[{ts()}] Cookies: {len(cookies)} ({', '.join(c['name'] for c in cookies)[:200]})")
    # لو الموقع ما بعتش طلب للـ API لوحده، ندور على توكن في الـ storage
    if not any(k.lower() == "authorization" for k in captured):
        try:
            store = await page.evaluate("""() => { const o = {};
                for (const s of [localStorage, sessionStorage])
                    for (let i = 0; i < s.length; i++) { const k = s.key(i); o[k] = s.getItem(k); }
                return o; }""")
        except Exception:
            store = {}
        print(f"[{ts()}] Storage keys: {list(store.keys())[:15]}")
        import re as _re
        for k, v in (store or {}).items():
            m = _re.search(r"eyJ[\w-]+\.[\w-]+\.[\w-]+", str(v or ""))
            if m:
                captured["Authorization"] = "Bearer " + m.group(0)
                print(f"[{ts()}] Token found in storage key: {k}")
                break
    print(f"[{ts()}] Auth headers captured: {list(captured.keys())}")
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    return cookie_str, captured

# ══ استدعاء GraphQL عام (نفس طريقة سحب المواعيد) + فك الرد المضغوط ══
async def gql_call(page, cookie_str, extra_headers, query, variables):
    headers = {"Content-Type": "application/json", "Origin": "https://my.medicolize.com",
               "Referer": "https://my.medicolize.com/", "Cookie": cookie_str}
    headers.update(extra_headers or {})
    res = await page.evaluate("""
        async (args) => {
            try {
                const r = await fetch(args.url, {method:'POST', credentials:'include', headers: args.headers, body: JSON.stringify(args.payload)});
                return { ok: true, text: await r.text() };
            } catch(e) { return { ok: false, error: e.message }; }
        }
    """, {"url": API_URL, "payload": {"query": query, "variables": variables}, "headers": headers})
    if not res.get("ok"):
        raise RuntimeError(res.get("error"))
    j = json.loads(res["text"])
    if isinstance(j, dict) and j.get("errors"):
        raise RuntimeError(str(j["errors"])[:200])
    return j.get("data") if isinstance(j, dict) else j


def gql_dec(a, key):
    """يفك رد Medicolize المضغوط (list فيها مراجع بالأرقام) ويرجع قيمة key."""
    if isinstance(a, dict):
        return a.get(key)
    if not isinstance(a, list):
        return None
    def r(i):
        v = a[i]
        if isinstance(v, dict):
            return {k: r(x) for k, x in v.items()}
        return [r(x) for x in v] if isinstance(v, list) else v
    for i, v in enumerate(a):
        if isinstance(v, dict) and key in v:
            return r(i)[key]
    return None


async def detect_note_field(page, cookie_str, extra_headers):
    """يجرب أسامي خانة الملحوظة على 5 مواعيد، ويستخدم أول اسم بيرجع كلام."""
    global NOTE_FIELD
    now = datetime.now(timezone.utc)
    rng = [(now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.000Z"), now.strftime("%Y-%m-%dT%H:%M:%S.999Z")]
    first_ok = None
    for f in NOTE_CANDIDATES:
        q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{createdAppointments(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate){id " + f + "}}")
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, {"orderBy": "createdAt", "skip": 0, "take": 30, "rangeDate": rng})
            lst = gql_dec(d, "createdAppointments") or []
            vals = [x.get(f) for x in lst if isinstance(x, dict)]
            has_text = any(isinstance(v, str) and v.strip() for v in vals)
            NOTE_PROBE[f] = "OK text" if has_text else "OK " + ("empty" if not any(vals) else type(next(v for v in vals if v)).__name__)
            if has_text and not NOTE_FIELD:
                NOTE_FIELD = f
            if first_ok is None:
                first_ok = f
        except Exception as e:
            NOTE_PROBE[f] = "ERR " + str(e)[:80]
    if not NOTE_FIELD and first_ok:
        NOTE_FIELD = first_ok
    # وقت الإلغاء: أول خانة شغالة ليها قيمة على المواعيد الملغية
    global CANCEL_FIELD
    for f in CANCEL_CANDIDATES:
        q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{createdAppointments(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate){id status " + f + "}}")
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, {"orderBy": "createdAt", "skip": 0, "take": 80, "rangeDate": rng})
            lst = [x for x in (gql_dec(d, "createdAppointments") or []) if isinstance(x, dict)]
            canc = [x.get(f) for x in lst if "CANCEL" in str(x.get("status") or "").upper()]
            CANCEL_PROBE[f] = f"OK {sum(1 for v in canc if v)}/{len(canc)} ملغي"
            if not CANCEL_FIELD and any(canc):
                CANCEL_FIELD = f
        except Exception as e:
            CANCEL_PROBE[f] = "ERR " + str(e)[:60]
    print(f"   ⏱ خانة وقت الإلغاء: {CANCEL_FIELD or 'مش موجودة'} · {CANCEL_PROBE}")
    # تفاصيل المريض نفسه (مش الميعاد)
    seen_keys = set()
    for f in PAT_CANDIDATES:
        key = f.split("{")[0]
        if key in seen_keys:
            continue
        q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{createdAppointments(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate){id patient{id " + f + "}}}")
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, {"orderBy": "createdAt", "skip": 0, "take": 60, "rangeDate": rng})
            lst = gql_dec(d, "createdAppointments") or []
            vals = [((x.get("patient") or {}) if isinstance(x, dict) else {}).get(key) for x in lst]
            txt = [v for v in vals if (isinstance(v, str) and v.strip()) or (isinstance(v, list) and v)]
            PAT_PROBE[f] = f"OK {len(txt)}/{len(vals)}"
            if txt and key not in ("status", "type", "category", "patientStatus") or (txt and any("منقطع" in str(v) for v in vals)):
                PAT_FIELDS.append(f); seen_keys.add(key)
        except Exception as e:
            PAT_PROBE[f] = "ERR " + str(e)[:60]
    print(f"   👤 خانات تفاصيل المريض: {PAT_FIELDS or 'مفيش'} · {PAT_PROBE}")
    print(f"   📝 خانة الملحوظة: {NOTE_FIELD or 'مش موجودة'} · {NOTE_PROBE}")


async def load_type_names(page, cookie_str, extra_headers):
    """أسامي أنواع المواعيد الحقيقية من إعدادات الشركة في Medicolize (Enum5 = جلسة علاج طبيعي …)."""
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    try:
        data = await gql_call(page, cookie_str, extra_headers, "{me{company{appointmentTypes}}}", {})
        me = gql_dec(data, "me") or {}
        raw = (me.get("company") or {}).get("appointmentTypes")
        lst = json.loads(raw) if isinstance(raw, str) else (raw or [])
        n = 0
        for t in lst:
            if isinstance(t, dict) and t.get("enum") and t.get("name"):
                APPOINTMENT_TYPES[t["enum"]] = str(t["name"]).strip(); n += 1
        print(f"[{ts()}] ✅ أسامي أنواع المواعيد من Medicolize: {n}")
    except Exception as e:
        print(f"[{ts()}] ⚠️ ما قدرتش أقرا أسامي الأنواع — هستخدم الجدول الاحتياطي ({str(e)[:120]})")


# ══ الباقات وجهة التحويل من الفواتير ══
# لستة الفواتير سريعة (فيها جهة التحويل)، بس خدمات الفاتورة (ب 6 / ب 12) بتيجي من تفاصيل كل فاتورة لوحدها،
# فبنفتح تفاصيل الفواتير اللي قيمتها 1000 أو أكتر بس، ونحفظ النتيجة في packages.json عشان ما نكررهاش.
PACKAGES_FILE   = "packages.json"
PKG_MIN_TOTAL   = 1000
PKG_BACKFILL    = 365     # أول مرة: نرجع سنة
PKG_DETAILS_MAX = 4000    # أقصى عدد تفاصيل فواتير في السحب الواحد (الباقي في اللي بعده)
PKG_PARALLEL    = 8       # كام فاتورة نفتحها في نفس الوقت
PKG_TIME_BUDGET = 300     # أقصى 5 دقايق للتفاصيل في السحب الواحد
PKG_RE = __import__("re").compile(r"ب\s*(\d{1,2})(?!\d)")
PKG_RE2 = __import__("re").compile(r"(?:باق[ةه]\s*(\d{1,2})(?!\d))|(?:(?<!\d)(\d{1,2})\s*(?:جلس|ج\b))")
PKG_VER = 2   # لما نغيّر طريقة القراية: الفواتير اللي اتقرت قبل كده من غير باقة بتتقري تاني
_BIDI = dict.fromkeys(map(ord, "\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u061c\u00a0\u0640"), " ")
_ARDIG = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def pkg_size_of(name, price):
    """(حجم الباقة، طريقة) من اسم خدمة الفاتورة. 'ب 12 ع ط 12 جلسه علاج طبيعي' → 12."""
    nm = " ".join(str(name or "").translate(_BIDI).translate(_ARDIG).split())
    m = PKG_RE.search(nm)
    if m and int(m.group(1)) in (3, 4, 5, 6, 8, 10, 12, 15, 18, 20, 24):
        return int(m.group(1)), "name"
    m = PKG_RE2.search(nm)
    if m:
        n = int(m.group(1) or m.group(2))
        if n in (6, 12, 10, 8, 18, 24):
            return n, "name"
    try:
        pr = float(price or 0)
    except Exception:
        pr = 0
    if ("علاج" in nm or "ع ط" in nm) and pr >= 1000:      # من غير رقم: من السعر (6: لحد 2200 — 12: من 2500)
        return (12 if pr >= 2400 else 6), "price"
    return 0, ""
INV_LIST_Q = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
              "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate)"
              "{id createdAt total paid discount patient{id} referralSource{name} createAppointment{start}}}")
INV_MONEY_Q = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
               "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate){id createdAt total paid discount}}")
INV_STATS = {}   # فلوس النهارده والشهر لكل فرع — للملخص بس (مش بتتحفظ في أي ملف)


def _cairo_day(iso):
    try:
        return (datetime.fromisoformat(str(iso).replace("Z", "+00:00")) + timedelta(hours=2)).strftime("%Y-%m-%d")
    except Exception:
        return ""


def _money_add(acc, r):
    acc["n"] += 1
    for k_src, k in (("total", "total"), ("paid", "paid"), ("discount", "discount")):
        try:
            acc[k] += float(r.get(k_src) or 0)
        except Exception:
            pass
INV_DETAILS_Q = "query D($invoice:ID!){invoiceDetails(invoice:$invoice){id operations{name price}}}"


def load_packages():
    try:
        with open(PACKAGES_FILE, encoding="utf-8") as f:
            d = json.load(f)
            if isinstance(d, dict) and isinstance(d.get("inv"), dict):
                return d
    except Exception:
        pass
    return {"updated": "", "inv": {}}


async def sync_invoices(page, cookie_str, extra_headers):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    cache = load_packages()
    inv = cache["inv"]
    now = datetime.now(timezone.utc)
    if cache.get("updated"):
        since = datetime.fromisoformat(cache["updated"]) - timedelta(days=3)
    else:
        since = now - timedelta(days=PKG_BACKFILL)
    rng = [since.strftime("%Y-%m-%dT%H:%M:%S.000Z"), now.strftime("%Y-%m-%dT%H:%M:%S.999Z")]
    me = gql_dec(await gql_call(page, cookie_str, extra_headers, "{me{branches{id name}}}", {}), "me") or {}
    new = 0
    today_c = (now + timedelta(hours=2)).strftime("%Y-%m-%d")
    for b in me.get("branches") or []:
        INV_STATS[b["name"]] = {"today": {"n": 0, "total": 0.0, "paid": 0.0, "discount": 0.0}, "today_ids": [], "today_rows": []}
        skip = 0
        while True:
            data = await gql_call(page, cookie_str, extra_headers, INV_LIST_Q,
                                  {"branchId": b["id"], "orderBy": "createdAt-desc", "skip": skip, "take": 500, "rangeDate": rng})
            rows = gql_dec(data, "invoices") or []
            for r in rows:
                iid = r.get("id")
                if not iid:
                    continue
                cur = inv.get(iid) or {}
                if not cur:
                    new += 1
                if _cairo_day(r.get("createdAt")) == today_c:
                    _money_add(INV_STATS[b["name"]]["today"], r)
                    INV_STATS[b["name"]]["today_ids"].append(iid)
                    INV_STATS[b["name"]]["today_rows"].append({"pid": (r.get("patient") or {}).get("id") or "",
                                                              "total": float(r.get("total") or 0), "paid": float(r.get("paid") or 0)})
                cur.update({"p": (r.get("patient") or {}).get("id") or "", "d": str(r.get("createdAt") or "")[:10],
                            "a": str((r.get("createAppointment") or {}).get("start") or ""),
                            "r": ((r.get("referralSource") or {}).get("name") or "").strip(),
                            "big": 1 if float(r.get("total") or 0) >= PKG_MIN_TOTAL else 0})
                inv[iid] = cur
            if len(rows) < 500:
                break
            skip += 500
            await asyncio.sleep(0.3)
    # الأولوية: آخر فاتورة كبيرة لكل مريض الأول (هي اللي بتحدد باقته الحالية)، بعدين اللي قبلها، وهكذا
    by_p = {}
    for i, v in inv.items():
        if v.get("big"):
            by_p.setdefault(v.get("p", ""), []).append(i)
    ranked = []
    for p, ids in by_p.items():
        ids.sort(key=lambda i: (inv[i].get("a") or inv[i].get("d", "")), reverse=True)
        for rank, i in enumerate(ids):
            if "s" not in inv[i] or (not inv[i].get("s") and inv[i].get("v", 1) < PKG_VER):
                ranked.append((rank, inv[i].get("d", ""), i))
    ranked.sort(key=lambda t: t[1], reverse=True)                     # الأحدث الأول
    ranked.sort(key=lambda t: t[0])                                   # وآخر فاتورة لكل مريض قبل أي حاجة
    todo = [t[2] for t in ranked]
    done = 0
    names = collections.Counter()
    t_end = time.time() + PKG_TIME_BUDGET

    async def one(iid):
        det = gql_dec(await gql_call(page, cookie_str, extra_headers, INV_DETAILS_Q, {"invoice": iid}), "invoiceDetails") or {}
        size, how = 0, ""
        for o in det.get("operations") or []:
            nm = str(o.get("name") or "").strip()
            names[nm] += 1
            n, h = pkg_size_of(nm, o.get("price"))
            if n and (n > size or (h == "name" and how == "price")):
                size, how = n, h
        inv[iid]["s"] = size
        inv[iid]["v"] = PKG_VER
        if how == "price":
            inv[iid]["sp"] = 1
        else:
            inv[iid].pop("sp", None)

    errors = 0
    for k in range(0, min(len(todo), PKG_DETAILS_MAX), PKG_PARALLEL):
        if time.time() > t_end:
            break
        batch = todo[k:k + PKG_PARALLEL]
        res = await asyncio.gather(*(one(i) for i in batch), return_exceptions=True)
        for r in res:
            if isinstance(r, Exception):
                errors += 1
                if errors <= 3:
                    print(f"[{ts()}] ⚠️ invoice details: {str(r)[:100]}")
            else:
                done += 1
        if errors > 20:
            break
        await asyncio.sleep(0.2)
    # أسماء الخدمات بس (من غير أي بيانات مرضى) — عشان نتأكد إن "ب 6 / ب 12" بيتقري صح
    if names:
        print(f"[{ts()}] 🧾 أكتر أسماء خدمات في الفواتير اللي اتفتحت:")
        for nm, c in names.most_common(25):
            n, h = pkg_size_of(nm, 0)
            print(f"      {c:>4} × {nm[:60]!r}  →  {('باقة ' + str(n)) if n else '-'}")
    # الفواتير الصغيرة (مش باقات) محتاجين منها آخر فاتورة لكل مريض بس (عشان جهة التحويل)
    latest = {}
    for i, v in inv.items():
        if not v.get("big") and (v["p"] not in latest or v.get("d", "") > inv[latest[v["p"]]].get("d", "")):
            latest[v["p"]] = i
    keep = set(latest.values())
    for i in [i for i, v in inv.items() if not v.get("big") and i not in keep]:
        del inv[i]
    # باقات اتباعت النهارده (من الفواتير اللي اتفتحت تفاصيلها)
    for bn, st in INV_STATS.items():
        sizes = collections.Counter(inv[i].get("s") for i in st["today_ids"] if i in inv and inv[i].get("s"))
        st["pkgs"] = {str(k): v for k, v in sizes.items()}
    # فلوس الشهر لحد النهارده (بس وقت الملخص بالليل — عشان ما نتقلش السحب طول اليوم)
    if (now + timedelta(hours=2)).hour >= DIGEST_HOUR or os.environ.get("DIGEST_FORCE") == "1":
        m0 = (now + timedelta(hours=2)).replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=2)
        mrng = [m0.strftime("%Y-%m-%dT%H:%M:%S.000Z"), now.strftime("%Y-%m-%dT%H:%M:%S.999Z")]
        for b in me.get("branches") or []:
            acc = {"n": 0, "total": 0.0, "paid": 0.0, "discount": 0.0}
            skip = 0
            try:
                while True:
                    rows = gql_dec(await gql_call(page, cookie_str, extra_headers, INV_MONEY_Q,
                                                  {"branchId": b["id"], "orderBy": "createdAt-desc", "skip": skip, "take": 500, "rangeDate": mrng}), "invoices") or []
                    for r in rows:
                        _money_add(acc, r)
                    if len(rows) < 500:
                        break
                    skip += 500
                INV_STATS[b["name"]]["month"] = acc
            except Exception as e:
                print(f"[{ts()}] ⚠️ فلوس الشهر: {str(e)[:80]}")
    cache["updated"] = now.isoformat()
    with open(PACKAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    pk = sum(1 for v in inv.values() if v.get("s"))
    print(f"[{ts()}] ✅ الفواتير: {len(inv)} متخزنة · {new} جديدة · فتحنا تفاصيل {done} (فاضل {max(0, len(todo) - done)}) · باقات معروفة: {pk}")
    return cache


# ── تجربة لمرة واحدة: إيه الخانات المتاحة في الفاتورة (المدفوع/الخصم/الدكتور...) ──
# بتتحفظ في packages.json تحت "_probe": أسامي الخانات ونوعها بس — من غير أي قيم أو بيانات مرضى
PROBE_VER = 2
PROBE_OP_FIELDS = ["id", "quantity", "qty", "count", "discount", "discountValue", "discountAmount", "discountPercentage",
                   "discountType", "paid", "paidAmount", "amountPaid", "totalPaid", "remaining", "remainingAmount", "due",
                   "total", "totalPrice", "finalPrice", "netPrice", "net", "amount", "status", "paymentStatus", "isPaid",
                   "paidFull", "fullyPaid", "isFullyPaid", "createdAt", "updatedAt", "paidAt", "date", "type", "code",
                   "category", "insurance", "insuranceShare", "patientShare", "coverage", "tax", "notes", "note", "description",
                   "doctor{id}", "doctor{name}", "createdBy{name}", "procedure{name}", "service{name}", "appointment{id}",
                   "appointment{start}", "operation{name}", "product{name}", "payments{amount}", "payments{id}"]
PROBE_INV_FIELDS = ["total", "subTotal", "subtotal", "paid", "paidAmount", "totalPaid", "remaining", "remainingAmount",
                    "discount", "discountValue", "totalDiscount", "status", "paymentStatus", "isPaid", "requiredToPay",
                    "preAuth", "details", "createdAt", "updatedAt", "doctor{name}", "branch{name}", "createdBy{name}",
                    "assignedTo{name}", "insuranceCompany{name}", "insurancePolicy{name}", "tags{name}",
                    "payments{id}", "payments{amount}", "payments{createdAt}", "payments{method}", "payments{paymentMethod}",
                    "payments{type}", "payments{treasury{name}}", "payments{createdBy{name}}", "payments{status}",
                    "appointment{start}", "createAppointment{start}", "referralSource{name}"]
PROBE_LIST_FIELDS = ["paid", "paidAmount", "remaining", "discount", "status", "doctor{name}", "createdBy{name}",
                     "payments{amount}", "operations{name}", "operations{price}"]


def _ptype(v):
    if v is None: return "null"
    if isinstance(v, bool): return "bool"
    if isinstance(v, (int, float)): return "number"
    if isinstance(v, str): return "string"
    if isinstance(v, list): return "list[" + (_ptype(v[0]) if v else "") + "]"
    if isinstance(v, dict): return "{" + ",".join(f"{k}:{_ptype(x)}" for k, x in list(v.items())[:6]) + "}"
    return type(v).__name__


async def probe_invoice_fields(page, cookie_str, extra_headers, cache):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    if (cache.get("_probe") or {}).get("v") == PROBE_VER:
        return cache
    inv = cache.get("inv") or {}
    ids = sorted([i for i, v in inv.items() if v.get("big") and v.get("s")], key=lambda i: inv[i].get("d", ""), reverse=True)[:3]
    if not ids:
        return cache
    out = {"v": PROBE_VER, "at": datetime.now(timezone.utc).isoformat(), "op": {}, "inv": {}, "list": {}}
    import re as _re
    def short_err(e):
        m = str(e)
        sug = _re.findall(r"[Dd]id you mean ([^?\]]+)", m)
        return ("ERR" + (" · did you mean " + sug[0][:120] if sug else " · " + m[:90]))

    async def try_q(q, var, path):
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, var)
            return "OK", d
        except Exception as e:
            return short_err(e), None

    for f in PROBE_OP_FIELDS:
        q = "query D($invoice:ID!){invoiceDetails(invoice:$invoice){id operations{name " + f + "}}}"
        st, d = await try_q(q, {"invoice": ids[0]}, f)
        if st == "OK":
            ops = (gql_dec(d, "invoiceDetails") or {}).get("operations") or []
            key = f.split("{")[0]
            vals = [o.get(key) for o in ops if isinstance(o, dict)]
            st = "OK " + (_ptype(next((v for v in vals if v is not None), None)))
        out["op"][f] = st
        await asyncio.sleep(0.1)
    for f in PROBE_INV_FIELDS:
        q = "query D($invoice:ID!){invoiceDetails(invoice:$invoice){id " + f + "}}"
        st, d = await try_q(q, {"invoice": ids[0]}, f)
        if st == "OK":
            det = gql_dec(d, "invoiceDetails") or {}
            st = "OK " + _ptype(det.get(f.split("{")[0]))
        out["inv"][f] = st
        await asyncio.sleep(0.1)
    now = datetime.now(timezone.utc)
    rng = [(now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z"), now.strftime("%Y-%m-%dT%H:%M:%S.999Z")]
    for f in PROBE_LIST_FIELDS:
        q = ("query INV($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{invoices(orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate){id " + f + "}}")
        st, d = await try_q(q, {"orderBy": "createdAt", "skip": 0, "take": 5, "rangeDate": rng}, f)
        if st == "OK":
            lst = gql_dec(d, "invoices") or []
            st = "OK " + _ptype(next((x.get(f.split("{")[0]) for x in lst if isinstance(x, dict) and x.get(f.split("{")[0]) is not None), None))
        out["list"][f] = st
        await asyncio.sleep(0.1)
    out["appt_note"] = dict(NOTE_PROBE)
    out["patient_fields"] = dict(PAT_PROBE)
    out["cancel_time"] = dict(CANCEL_PROBE)
    out["cancel_time_used"] = CANCEL_FIELD
    out["patient_fields_used"] = list(PAT_FIELDS)
    out["appt_note_field"] = NOTE_FIELD
    cache["_probe"] = out
    with open(PACKAGES_FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
    okc = sum(1 for g in ("op", "inv", "list") for v in out[g].values() if v.startswith("OK"))
    print(f"[{ts()}] 🔎 تجربة خانات الفواتير: {okc} خانة شغالة — اتحفظت في packages.json (_probe)")
    return cache


# ══ ملخص آخر اليوم بالإيميل (بيتبعت مرة واحدة بعد الساعة 9 بالليل) ══
DIGEST_HOUR = 23
DASH_URL = "https://amgadkhedrpt-cmd.github.io/bodyfixdash/"
BR_AR = {"BODYFIX Center": "الهرم", "FIX ZONE": "الدقي"}


def _h(x):
    return str(x if x is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_digest(alerts, today_appts, today_str, appointments=None):
    """ملخص مختصر: جدول واحد للفرعين + قايمة قصيرة باللي محتاج أكشن. التفاصيل في الداشبورد."""
    from alerts import _norm, ATTENDED
    NOT_FUTURE = {"canceled", "cancelled", "no show", "noshow", "note"}
    svc = lambda t: bool(_re_svc.search(t or "")) and not _re_not_svc.search(t or "")
    today = datetime.strptime(today_str, "%Y-%m-%d").date()
    money = lambda v: f"{int(round(v)):,}"
    def delta(a, b):
        if not b:
            return ""
        d = round((a - b) * 100 / b)
        return f'<span style="color:{"#16a34a" if d >= 0 else "#dc2626"};font-size:11px"> {"▲" if d >= 0 else "▼"}{abs(d)}%</span>'
    N = [x for x in (_norm(r) for r in (appointments or []) if isinstance(r, dict)) if x]
    def day(br, d):
        A = [a for a in N if a["branch"] == br and a["start"].date() == d and svc(a["type"])]
        return {"A": A, "all": len(A), "att": sum(1 for a in A if a["status"] in ATTENDED),
                "loss": sum(1 for a in A if a["status"] in ("no show", "noshow", "canceled", "cancelled")),
                "cx": sum(1 for a in A if a["status"] in ("canceled", "cancelled")),
                "open": sum(1 for a in A if a["status"] == "open")}
    week0 = today - timedelta(days=(today.weekday() - 5) % 7)
    fu = alerts.get("followups") or {}
    rows = []          # (عنوان, [قيمة لكل فرع])
    acts = []          # (أيقونة, عنوان, لون, [(فرع, اسم, تفاصيل)])
    cols = {}
    for br, br_ar in BR_AR.items():
        inb = lambda x, br=br: (x.get("branch") or "") == br
        T, W, TM = day(br, today), day(br, today - timedelta(days=7)), day(br, today + timedelta(days=1))
        wk = sum(day(br, week0 + timedelta(days=i))["att"] for i in range((today - week0).days + 1))
        lwk = sum(day(br, week0 - timedelta(days=7) + timedelta(days=i))["att"] for i in range((today - week0).days + 1))
        st = INV_STATS.get(br) or {}
        td, mo, pk = st.get("today"), st.get("month"), st.get("pkgs") or {}
        kp = [x for x in alerts.get("kashf_pending") or [] if inb(x) and x.get("days_since") == 0]
        kp_no = [x for x in kp if not (x.get("next_pt") or x.get("sessions_after"))]
        fin = [x for x in alerts.get("finished_packages") or [] if inb(x) and (x.get("days_since") or 99) <= 7]
        calls = [x for x in fu.get("calls") or [] if inb(x) and x.get("is_today")]
        bad_calls = [x for x in calls if x.get("verdict") in ("few_calls", "no_note")]
        came = [x for x in fu.get("returned") or [] if inb(x) and x.get("state") == "came" and str(x.get("ret_date", ""))[:10] == today_str]
        sd = [x for x in alerts.get("sudden") or [] if inb(x) and str(x.get("date", ""))[:10] == today_str]
        sd_rep = [x for x in sd if x.get("prior_sudden") or x.get("prior_noshow")]
        mt = [x for x in alerts.get("missing_today") or [] if inb(x)]
        nn = [x for x in alerts.get("today_no_next") or [] if inb(x)]
        cols[br_ar] = [
            f'<b>{T["att"]}</b>{delta(T["att"], W["att"])}',
            f'{T["loss"]} <span style="color:#64748b;font-size:11px">({round(T["loss"] * 100 / T["all"]) if T["all"] else 0}%)</span>',
            f'<b>{wk}</b>{delta(wk, lwk)}',
            (f'<b>{money(td["paid"])}</b> <span style="color:#64748b;font-size:11px">من {money(td["total"])}</span>' if td else "—"),
            (" · ".join(f'{k}×{v}' for k, v in sorted(pk.items(), key=lambda x: -int(x[0]))) or "0") if td else "—",
            (money(mo["paid"]) if mo else "—"),
            f'{len(kp)} <span style="color:#64748b;font-size:11px">(حجز {len(kp) - len(kp_no)})</span>',
            f'{len(came)}',
            f'{TM["all"] - TM["cx"]} <span style="color:#64748b;font-size:11px">(Open {TM["open"]})</span>',
        ]
        for x in kp_no: acts.append(("🩺", "كشف النهارده وما حجزش جلسة", "#7c3aed", br_ar, x["name"], ""))
        for x in fin: acts.append(("❌", "خلص باقته ومجددش (آخر أسبوع)", "#dc2626", br_ar, x["name"],
                                   f'باقة {x.get("size") or 12} · ' + {"done": "دخل التقييم", "booked": "حاجز تقييم", "none": "ما دخلش التقييم"}.get(x.get("eval"), "")))
        for x in sd_rep: acts.append(("⚡", "اعتذار مفاجئ / No Show — ومتكرر", "#ea580c", br_ar, x["name"], "No Show" if x.get("kind") == "noshow" else "اعتذار مفاجئ"))
        for x in mt: acts.append(("🙋", "بييجي بانتظام ومالوش ميعاد النهارده", "#e11d48", br_ar, x["name"], ""))
        acts.append(("📞", "متابعات النهارده ناقصة اتصالات أو ملحوظة", "#ca8a04", br_ar, None, len(bad_calls)))
        acts.append(("📅", "حضروا النهارده ومالهمش ميعاد جاي", "#0284c7", br_ar, None, len(nn)))
    labels = ["✅ حضروا النهارده", "❌ إلغاء + No Show", "📆 من أول الأسبوع", "💰 مدفوع النهارده", "🛒 باقات اتباعت", "💰 مدفوع من أول الشهر",
              "🩺 كشوفات", "🔁 رجعوا من المتابعة", "📅 بكره محجوز"]
    brs = list(cols)
    th = "".join(f'<th style="padding:6px;background:#eff6ff;color:#1d4ed8">{b}</th>' for b in brs)
    trs = "".join(f'<tr><td style="padding:6px;border-top:1px solid #e2e8f0;font-size:13px">{l}</td>' +
                  "".join(f'<td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center;font-size:13px">{cols[b][k]}</td>' for b in brs) + "</tr>"
                  for k, l in enumerate(labels))
    out = [f'<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#0f172a;max-width:600px;margin:auto">'
           f'<h2 style="margin:0">📋 ملخص يوم {today_str}</h2>'
           f'<div style="color:#64748b;font-size:12px;margin:2px 0 10px">▲▼ مقارنة بنفس اليوم الأسبوع اللي فات · الجلسات = علاج طبيعي + ريكفري + حجامه</div>'
           f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px"><tr><th></th>{th}</tr>{trs}</table>'
           f'<h3 style="margin:16px 0 6px">🔴 محتاج أكشن</h3>']
    groups = {}
    for ic, title, col, br_ar, name, det in acts:
        groups.setdefault((ic, title, col), []).append((br_ar, name, det))
    for (ic, title, col), items in groups.items():
        named = [it for it in items if it[1]]
        counts = [it for it in items if it[1] is None]
        if counts:
            tot = sum(int(c[2] or 0) for c in counts)
            if not tot:
                continue
            per = " · ".join(f'{c[0]} {c[2]}' for c in counts if c[2])
            out.append(f'<div style="border-inline-start:3px solid {col};padding:4px 10px;margin:6px 0;font-size:13px">{ic} {title}: <b>{tot}</b> <span style="color:#64748b">({per})</span></div>')
            continue
        lis = "".join(f'<li>{_h(n)} <span style="color:#64748b">— {b}{(" · " + _h(d)) if d else ""}</span></li>' for b, n, d in named[:6])
        more = f'<div style="color:#64748b;font-size:12px">+ {len(named) - 6} كمان</div>' if len(named) > 6 else ""
        out.append(f'<div style="border-inline-start:3px solid {col};padding:4px 10px;margin:6px 0"><div style="font-size:13px;font-weight:700">{ic} {title}: {len(named)}</div>'
                   f'<ul style="margin:2px 0;padding-inline-start:18px;font-size:13px">{lis}</ul>{more}</div>')
    if len(out) == 5:
        out.append('<div style="color:#16a34a;font-size:13px">✅ مفيش حاجة محتاجة أكشن</div>')
    out.append(f'<div style="margin-top:14px"><a href="{DASH_URL}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px">افتح الداشبورد للتفاصيل ←</a></div>'
               f'<div style="color:#94a3b8;font-size:11px;margin-top:10px">المدفوع = من فواتير اتعملت النهارده / الشهر.</div></div>')
    return "".join(out)


def write_digest_ctx(appointments, today_str):
    """بيانات خاصة للملخص (digest.py) — في .session، مش بتترفع على الريبو."""
    from alerts import _norm
    t = datetime.strptime(today_str, "%Y-%m-%d").date()
    lo, hi = t - timedelta(days=15), t + timedelta(days=2)
    rows = []
    for r in appointments or []:
        a = _norm(r) if isinstance(r, dict) else None
        if not a or not (lo <= a["start"].date() <= hi):
            continue
        rows.append({"start": a["start"].isoformat(), "branch": a["branch"], "doctor": a["doctor"], "type": a["type"],
                     "status": a["status"], "name": a["name"], "pid": a.get("pid") or ""})
    os.makedirs(".session", exist_ok=True)
    with open(".session/digest_ctx.json", "w", encoding="utf-8") as f:
        json.dump({"date": today_str, "appts": rows, "inv_stats": INV_STATS}, f, ensure_ascii=False)
    print(f"   📨 digest ctx: {len(rows)} ميعاد")


_re_svc = __import__("re").compile(r"جلسة?\s*علاج\s*طبيع|ريكفر|حجام")
_re_not_svc = __import__("re").compile(r"منزل|اونلاين|أونلاين|online", __import__("re").I)


def maybe_send_digest(alerts, today_appts, today_str, appointments=None):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    now_c = datetime.now(timezone.utc) + timedelta(hours=2)
    force = os.environ.get("DIGEST_FORCE") == "1"
    if now_c.hour < DIGEST_HOUR and not force:
        return
    try:
        cache = load_packages()
    except Exception:
        cache = {"updated": "", "inv": {}}
    if (cache.get("_digest") or {}).get("date") == today_str and not force:
        return
    to = os.environ.get("DIGEST_TO", "").strip() or GMAIL_USER
    if not GMAIL_USER or not GMAIL_PASS or not to:
        print(f"[{ts()}] ⚠️ الملخص: مفيش GMAIL_USER / GMAIL_APP_PASS")
        return
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📋 ملخص BODYFIX — {today_str}"
    msg["From"] = GMAIL_USER
    msg["To"] = to
    msg.attach(MIMEText(build_digest(alerts, today_appts, today_str, appointments), "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as sm:
        sm.login(GMAIL_USER, GMAIL_PASS)
        sm.sendmail(GMAIL_USER, [to], msg.as_string())
    cache["_digest"] = {"date": today_str, "at": now_c.isoformat()}
    with open(PACKAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[{ts()}] 📧 الملخص اتبعت")


# ── تجربة لمرة واحدة: إزاي نقرا "خطوات العمليات" (Operations Steps) ──
STEPS_PROBE_VER = 2
STEPS_PATHS = ["/logs/operations/operation-steps", "/logs/operations/operations-steps", "/logs/operation-steps",
               "/logs/operations-steps", "/logs/created-operation-steps", "/logs/operations"]
STEPS_ROOTS = []
STEPS_FIELDS = ["id", "name", "createdAt", "updatedAt", "start", "end", "date", "status", "price", "amount", "total", "paid",
                "doctor{name}", "patient{id firstName lastName}", "branch{name}", "invoice{id}", "invoice{id total paid}",
                "operation{id name}", "appointment{id start}", "createdBy{name}", "step", "stepNumber", "number", "count"]


async def probe_steps(page, cookie_str, extra_headers, cache):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    if (cache.get("_probe_steps") or {}).get("v") == STEPS_PROBE_VER:
        return cache
    out = {"v": STEPS_PROBE_VER, "at": datetime.now(timezone.utc).isoformat(), "pages": {}, "ops": [], "roots": {}}
    seen = []
    def on_req(req):
        try:
            if "api.medicolize.com" in req.url and req.method == "POST":
                b = json.loads(req.post_data or "{}")
                for x in (b if isinstance(b, list) else [b]):
                    if isinstance(x, dict) and x.get("query"):
                        seen.append(x)
        except Exception:
            pass
    page.on("request", on_req)
    try:
        for path in STEPS_PATHS:
            n0 = len(seen)
            try:
                await page.goto(SITE_URL + path, wait_until="domcontentloaded", timeout=40000)
                await page.wait_for_timeout(7000)
            except Exception as e:
                out["pages"][path] = "ERR " + str(e)[:60]
                continue
            if path == "/logs/operations":
                # Logs ← Operations ← Operation Steps: ندوس على التاب بالاسم
                for label in ("Operation Steps", "Operations Steps", "خطوات العمليات"):
                    try:
                        await page.get_by_text(label, exact=False).first.click(timeout=5000)
                        await page.wait_for_timeout(7000)
                        out["pages"][path + " (click)"] = {"label": label, "url": page.url[:160]}
                        break
                    except Exception:
                        pass
            names = sorted({(x.get("operationName") or (re.findall(r"(?:query)\s+(\w+)", x["query"]) or ["?"])[0]) for x in seen[n0:]})
            out["pages"][path] = {"url": page.url[:120], "ops": names[:30]}
            for x in seen[n0:]:
                q = x["query"]
                nm = x.get("operationName") or ""
                if re.search(r"step", nm + " " + q[:300], re.I) and not any(o["query"] == q[:3000] for o in out["ops"]):
                    out["ops"].append({"page": path, "name": nm, "query": q[:3000], "vars": sorted((x.get("variables") or {}).keys())})
    finally:
        try:
            page.remove_listener("request", on_req)
        except Exception:
            pass
    # createdOperationSteps بنفس شكل createdAppointments — نجرب كل خانة لوحدها
    now = datetime.now(timezone.utc)
    rng = [(now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z"), now.strftime("%Y-%m-%dT%H:%M:%S.999Z")]
    out["fields"] = {}
    for f in STEPS_FIELDS:
        q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{createdOperationSteps(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate){id " + (f if f != "id" else "") + "}}")
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, {"orderBy": "createdAt", "skip": 0, "take": 5, "rangeDate": rng})
            lst = gql_dec(d, "createdOperationSteps")
            k = f.split("{")[0]
            v = next((x.get(k) for x in (lst or []) if isinstance(x, dict) and x.get(k) is not None), None)
            out["fields"][f] = f"OK {len(lst or [])} rows · " + type(v).__name__
        except Exception as e:
            m = str(e)
            sug = re.findall(r"[Dd]id you mean ([^?\]]+)", m)
            out["fields"][f] = ("did you mean " + sug[0][:150]) if sug else ("ERR " + m[:150])
    cache["_probe_steps"] = out
    with open(PACKAGES_FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[{ts()}] 🔎 تجربة خطوات العمليات: {len(out['ops'])} query اتسجلت")
    return cache


# ══ مراجعة الكومبليت أوتوماتيك: مواعيد Completed ↔ خطوات العمليات ══
AUDIT_DAYS = 35
STEPS_LOOKBACK = 365   # بنسحب سنة عشان نشوف الفلوس المدفوعة على خطوات Planned اتعملت من بدري (باقات)
STEPS_Q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
           "{createdOperationSteps(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate)"
           "{id name end createdAt status total paid %s operation{id name} doctor{name} patient{id firstName lastName} branch{name}}}")
STEPS_OP_FIELDS = ["discount", ""]   # خصم الخطوة (خصم الباقة متوزع) — لو مش مقبول نكمل من غيره
_RE_DONE = re.compile(r"complet|done|finish|منته|مكتمل", re.I)
_RE_PLAN = re.compile(r"plan|مخطط|pending", re.I)
_RE_CANC = re.compile(r"cancel|الغ|إلغ", re.I)

def _cairo_date(iso):
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except Exception:
        return None
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo("Africa/Cairo")).strftime("%Y-%m-%d")
    except Exception:
        return (dt + timedelta(hours=2)).strftime("%Y-%m-%d")

def _pname(p):
    p = p or {}
    return " ".join(str(x or "").strip() for x in (p.get("firstName"), p.get("lastName")) if str(x or "").strip())

def _step_kind(st, has_done):
    st = str(st or "")
    if _RE_CANC.search(st): return "cancel"
    if _RE_DONE.search(st): return "done"
    if _RE_PLAN.search(st): return "plan"
    return "plan" if has_done else "done"

def _money_scale(rows):
    """Total بييجي رقم صحيح (غالباً بالقرش) والمدفوع بالجنيه — نعرف المعامل من الخطوات اللي عليها مدفوع."""
    net = lambda x: float(x.get("total") or 0) - float(x.get("discount") or 0)
    ratios = sorted(net(x) / float(x.get("paid")) for x in rows if float(x.get("paid") or 0) > 0 and net(x) > 0)
    if not ratios:
        return 1.0
    med = ratios[len(ratios) // 2]
    return 100.0 if 50 <= med <= 200 else 1.0

REM_ = {}   # id → (المدفوع شامل اللي اتغطى من P، المطلوب بعد الخصم، الباقي)

def _cover_unpaid(rows, has_done, inv_money=None):
    """طريقة أمجد: المدفوع جنب الخطوة قصاد الـ Total بتاعها. خطوة C عليها باقي بتتغطى من
    الفلوس المدفوعة على خطوات P في نفس الباقة (نفس العملية). يرجّع ({id: 'paid'|'covered'|'unpaid'}, المعامل)."""
    REM_.clear()
    k_ = _money_scale(rows)
    tot_ = lambda x: max(0.0, (float(x.get("total") or 0) - float(x.get("discount") or 0)) / k_)   # المطلوب بعد الخصم
    by_op = defaultdict(list)
    for x in rows:
        op = x.get("operation") or {}
        by_op[str(op.get("id") or "") or ("step:" + str(x.get("id")))].append(x)
    res = {}
    for key, lst in by_op.items():
        done, plan = [], []
        for x in lst:
            k = _step_kind(x.get("status"), has_done)
            if k == "done": done.append(x)
            elif k == "plan": plan.append(x)
        done.sort(key=lambda x: str(x.get("end") or x.get("createdAt") or ""))
        credit = sum(float(x.get("paid") or 0) for x in plan)                       # فلوس على خطوات P
        credit += sum(max(0.0, float(x.get("paid") or 0) - tot_(x)) for x in done)  # زيادة على خطوات C
        for x in done:
            need = tot_(x) - float(x.get("paid") or 0)
            if tot_(x) <= 0 or need <= 1:
                res[x.get("id")] = "paid"
            elif credit + 1 >= need:
                credit -= need; res[x.get("id")] = "covered"
            else:
                REM_[x.get("id")] = (round(float(x.get("paid") or 0) + credit, 2), round(tot_(x), 2), round(need - credit, 2))
                credit = 0.0; res[x.get("id")] = "unpaid"
    return res, k_

INV_PAY_Q = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate){id total paid discount patient{id}}}")

async def patient_money(page, cookie_str, extra_headers, days):
    """المتبقي على فواتير كل مريض في الفترة — الفرعين."""
    now = datetime.now(timezone.utc)
    rng = [(now - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00.000Z"), now.strftime("%Y-%m-%dT23:59:59.999Z")]
    me = gql_dec(await gql_call(page, cookie_str, extra_headers, "{me{branches{id name}}}", {}), "me") or {}
    money, seen = defaultdict(float), set()
    for b in me.get("branches") or []:
        skip = 0
        while True:
            rows = gql_dec(await gql_call(page, cookie_str, extra_headers, INV_PAY_Q,
                                          {"branchId": b["id"], "orderBy": "createdAt-desc", "skip": skip, "take": 500, "rangeDate": rng}), "invoices") or []
            for r in rows:
                if r.get("id") in seen: continue
                seen.add(r.get("id"))
                pid = str((r.get("patient") or {}).get("id") or "")
                if pid:   # المتبقي على الفاتورة (من غير سالب) — الفاتورة هي الحكم
                    money[pid] += max(0.0, float(r.get("total") or 0) - float(r.get("paid") or 0) - float(r.get("discount") or 0))
            if len(rows) < 500 or skip > 40000: break
            skip += 500
            await asyncio.sleep(0.2)
    return money, len(seen)

OPS_CATALOG_Q = [   # قايمة العمليات من إعدادات Medicolize — بنجرب أكتر من اسم لحد ما واحد يرد
    ("operations", "{operations{id name}}"),
    ("operations", "{operations(skip:0,take:2000){id name}}"),
    ("allOperations", "{allOperations{id name}}"),
    ("companyOperations", "{companyOperations{id name}}"),
    ("services", "{services{id name}}"),
    ("operationTypes", "{operationTypes{id name}}"),
    ("me", "{me{company{operations}}}"),
    ("me", "{me{company{services}}}"),
]

async def ops_catalog(page, cookie_str, extra_headers, cache):
    """يرجّع أسامي كل العمليات من الإعدادات (لو لقى الـ query) + يسجّل نتيجة التجربة في packages.json['_probe_ops']."""
    log, names = {}, []
    for key, q in OPS_CATALOG_Q:
        try:
            d = await gql_call(page, cookie_str, extra_headers, q, {})
            v = gql_dec(d, key)
            if key == "me":
                v = ((v or {}).get("company") or {})
                v = v.get("operations") if "operations" in q else v.get("services")
                if isinstance(v, str):
                    try: v = json.loads(v)
                    except Exception: v = []
            lst = [str((x or {}).get("name") or "").strip() for x in (v or []) if isinstance(x, dict)]
            lst = [x for x in lst if x]
            log[q] = f"OK {len(lst)}"
            if lst:
                names = lst
                break
        except Exception as e:
            m = str(e); sug = re.findall(r"[Dd]id you mean ([^?\]]+)", m)
            log[q] = ("did you mean " + sug[0][:150]) if sug else ("ERR " + m[:120])
    try:
        cache = cache if isinstance(cache, dict) else load_packages()
        cache["_probe_ops"] = {"at": datetime.now(timezone.utc).isoformat(), "found": len(names), "log": log}
        with open(PACKAGES_FILE, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        pass
    return names

async def sync_steps(page, cookie_str, extra_headers, appointments, packages=None):
    """يسحب خطوات العمليات ويكتب data/audit.json (من غير مبالغ — بس علامة مش مدفوع بعد خصم المدفوع على Planned)."""
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    now = datetime.now(timezone.utc)
    d_from = _cairo_date((now - timedelta(days=AUDIT_DAYS)).isoformat())
    d_to = _cairo_date(now.isoformat())
    rng = [(now - timedelta(days=STEPS_LOOKBACK)).strftime("%Y-%m-%dT00:00:00.000Z"),
           (now + timedelta(days=1)).strftime("%Y-%m-%dT23:59:59.999Z")]
    op_fields = None
    for f in STEPS_OP_FIELDS:          # نشوف Medicolize بيقبل المتبقي على العملية ولا لا
        try:
            await gql_call(page, cookie_str, extra_headers, STEPS_Q % f, {"orderBy": "createdAt", "skip": 0, "take": 5, "rangeDate": rng})
            op_fields = f; break
        except Exception as e:
            print(f"[{ts()}] ℹ️ step field '{f}': {str(e)[:120]}")
    q = STEPS_Q % (op_fields or "")
    rows, skip = [], 0
    while True:
        d = await gql_call(page, cookie_str, extra_headers, q,
                           {"orderBy": "createdAt", "skip": skip, "take": 500, "rangeDate": rng})
        lst = gql_dec(d, "createdOperationSteps") or []
        rows.extend(lst)
        if len(lst) < 500 or len(rows) >= 60000:
            break
        skip += 500
        await asyncio.sleep(0.2)
    statuses = collections.Counter(str(x.get("status") or "") for x in rows)
    has_done = any(_RE_DONE.search(k) for k in statuses)
    pay, n_rem = _cover_unpaid(rows, has_done)
    # الفاتورة هي الحكم: لو المتبقي على فواتير المريض 0 → مفيش عليه حاجة، ولو فيه متبقي → نعرض لحد المبلغ ده بس (الأحدث الأول)
    inv_rem, n_inv = None, 0
    try:
        inv_rem, n_inv = await patient_money(page, cookie_str, extra_headers, STEPS_LOOKBACK + 35)
    except Exception as e:
        print(f"[{ts()}] ⚠️ متبقي الفواتير: {str(e)[:150]}")
    if inv_rem is not None:
        cleared = 0
        by_p = defaultdict(list)
        for x in rows:
            if pay.get(x.get("id")) == "unpaid":
                by_p[str((x.get("patient") or {}).get("id") or "")].append(x)
        for pid_, lst in by_p.items():
            cap = float(inv_rem.get(pid_) or 0)
            for x in sorted(lst, key=lambda x: str(x.get("end") or x.get("createdAt") or ""), reverse=True):
                pd_, net_, rem_ = REM_.get(x.get("id"), (0, 0, 0))
                if cap <= 1:
                    pay[x.get("id")] = "covered"; cleared += 1
                    continue
                if rem_ > cap:
                    REM_[x.get("id")] = (round(net_ - cap, 2), net_, round(cap, 2))
                cap -= min(rem_, cap)
        print(f"[{ts()}] 🧾 متبقي الفواتير: {n_inv} فاتورة · اتشال {cleared} خدمة فواتيرها مدفوعة")
    steps, n_cov = [], 0
    for x in rows:
        dd = _cairo_date(x.get("end") or x.get("createdAt"))
        if not dd or dd < d_from or dd > d_to:
            continue
        pv = pay.get(x.get("id"))
        n_cov += pv == "covered"
        steps.append({"d": dd, "pid": str((x.get("patient") or {}).get("id") or ""), "p": _pname(x.get("patient")),
                      "dr": ((x.get("doctor") or {}).get("name") or "").strip(), "s": (x.get("name") or "").strip(),
                      "b": ((x.get("branch") or {}).get("name") or ""), "st": str(x.get("status") or ""),
                      "u": 1 if pv == "unpaid" else 0, "c": 1 if pv == "covered" else 0})
    appts = []
    for a in appointments or []:
        if str(a.get("status_en") or "").upper() != "COMPLETED" and a.get("status") != "Completed":
            continue
        dd = _cairo_date(a.get("start"))
        if not dd or dd < d_from or dd > d_to:
            continue
        appts.append({"d": dd, "pid": str((a.get("patient") or {}).get("id") or ""), "p": _pname(a.get("patient")),
                      "dr": ((a.get("doctor") or {}).get("name") or "").strip(), "s": (a.get("type") or "").strip(),
                      "b": ((a.get("branch") or {}).get("name") or "")})
    # كتالوج كامل للجدول: كل أنواع المواعيد من الإعدادات + كل أسامي الخطوات/العمليات (سنة + قايمة الإعدادات)
    strip = lambda t: re.sub(r"[\s\d.\u0660-\u0669]+$", "", str(t or "").strip()).strip()
    step_names = collections.Counter()
    for x in rows:
        nm = strip(x.get("name"))          # اسم الخطوة بس — اسم الباقة (ب 6 …) مش خطوة
        if nm: step_names[nm] += 1
    try:
        for nm in await ops_catalog(page, cookie_str, extra_headers, packages):
            nm = strip(nm)
            if nm and nm not in step_names: step_names[nm] = 0
    except Exception as e:
        print(f"[{ts()}] ⚠️ ops catalog: {str(e)[:120]}")
    appt_types = collections.Counter({strip(v): 0 for v in APPOINTMENT_TYPES.values() if strip(v)})
    for a in appointments or []:
        if str(a.get("status_en") or "").upper() == "COMPLETED" or a.get("status") == "Completed":
            t = strip(a.get("type"))
            if t: appt_types[t] += 1
    debts = []   # كل الخدمات غير المدفوعة في السنة (عشان الفلوس القديمة تظهر حتى لو الفلتر على النهارده)
    for x in rows:
        if pay.get(x.get("id")) != "unpaid":
            continue
        pd_, net_, rem_ = REM_.get(x.get("id"), (0, 0, 0))
        debts.append({"id": str(x.get("id") or ""), "d": _cairo_date(x.get("end") or x.get("createdAt")), "pid": str((x.get("patient") or {}).get("id") or ""),
                      "p": _pname(x.get("patient")), "dr": ((x.get("doctor") or {}).get("name") or "").strip(),
                      "s": (x.get("name") or "").strip(), "b": ((x.get("branch") or {}).get("name") or ""),
                      "pd": pd_, "net": net_, "rem": rem_})
    out = {"last_updated": now.isoformat(), "from": d_from, "to": d_to, "lookback_days": STEPS_LOOKBACK,
           "statuses": dict(statuses), "appts": appts, "steps": steps, "debts": debts,
           "catalog": {"appt_types": dict(appt_types), "step_names": dict(step_names)}}
    os.makedirs("data", exist_ok=True)
    with open("data/audit.json", "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"[{ts()}] ✅ audit.json: {len(appts)} مواعيد Completed · {len(steps)} خطوة · "
          f"{sum(s_['u'] for s_ in steps)} مش مدفوعة · {n_cov} متغطية من الباقة · معامل الـ Total ÷{n_rem:g} · خصم الخطوة: {'آه' if op_fields else 'مش متاح'} · من {len(rows)} خطوة سنة · حالات: {dict(statuses)}")
    return out

async def fetch_all_appointments(cookie_str, page, extra_headers=None):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip, take, page_num = 0, 100, 1
    print(f"[{ts()}] Fetching appointments...")
    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {"skip": skip, "take": take, "orderBy": "start-desc",
                          "searchTerm": "", "rangeDate": range_date,
                          "filters": {"rangeDateKey": "start"}},
            "query": gql_query_with_note(),
        }
        headers = {
            "Content-Type": "application/json",
            "Origin":  "https://my.medicolize.com",
            "Referer": "https://my.medicolize.com/",
            "Cookie":  cookie_str,
        }
        headers.update(extra_headers or {})
        result = await page.evaluate("""
            async (args) => {
                try {
                    const res = await fetch(args.url, {
                        method: 'POST', credentials: 'include',
                        headers: args.headers, body: JSON.stringify(args.payload)
                    });
                    return { ok: true, text: await res.text(), status: res.status };
                } catch(e) { return { ok: false, error: e.message }; }
            }
        """, {"url": API_URL, "payload": payload, "headers": headers})
        if not result.get("ok"):
            print(f"[{ts()}] Error: {result.get('error')}"); break
        try: data = json.loads(result["text"])
        except: print(f"[{ts()}] Parse error"); break
        if isinstance(data, dict) and data.get("errors"):
            print(f"[{ts()}] GQL error (HTTP {result.get('status')}): {json.dumps(data['errors'], ensure_ascii=False)[:400]}"); break
        raw = []
        if isinstance(data, dict) and "data" in data:
            inner = data["data"]
            if isinstance(inner, list): raw = inner
            elif isinstance(inner, dict): raw = inner.get("createdAppointments") or []
        elif isinstance(data, list): raw = data
        if not raw:
            print(f"[{ts()}] No data — HTTP {result.get('status')}: {str(result.get('text'))[:400]}"); break
        batch = parse_flat_array(raw)
        if not batch:
            batch = [x for x in raw if isinstance(x, dict) and 'id' in x and 'start' in x]
        if not batch: print(f"[{ts()}] Empty batch"); break
        all_appts.extend(batch)
        print(f"[{ts()}] Page {page_num}: {len(batch)} (total: {len(all_appts)})")
        if len(batch) < take: break
        skip += take; page_num += 1
        await asyncio.sleep(0.5)
        if len(all_appts) >= 23000: break
    print(f"[{ts()}] Total: {len(all_appts)}")
    return all_appts

def analyze(appointments):
    by_doctor  = defaultdict(list)
    by_branch  = defaultdict(list)
    by_date    = defaultdict(lambda: defaultdict(list))
    by_type    = defaultdict(int)
    by_status  = defaultdict(int)

    today_str = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%d")
    today_appointments = []
    # الملحوظات بتتنشر للمواعيد القريبة بس (من أسبوع فات لحد أسبوعين جايين)
    note_from = (datetime.now(timezone.utc) + timedelta(hours=2) - timedelta(days=NOTE_PAST_DAYS)).strftime("%Y-%m-%d")
    note_to = (datetime.now(timezone.utc) + timedelta(hours=2) + timedelta(days=NOTE_NEXT_DAYS)).strftime("%Y-%m-%d")

    for a in appointments:
        if not isinstance(a, dict): continue
        doc    = (a.get("doctor") or {}).get("name") or "غير محدد"
        branch = (a.get("branch") or {}).get("name") or "غير محدد"
        start  = str(a.get("start") or "")[:10]
        atype  = str(a.get("type")   or "غير محدد")
        status = str(a.get("status") or "غير محدد")
        pat    = a.get("patient") or {}
        name   = f"{pat.get('firstName') or ''} {pat.get('lastName') or ''}".strip()

        entry = {
            "id":      a.get("id"),
            "start":   a.get("start"),
            "end":     a.get("end"),
            "status":  status,
            "type":    atype,
            "doctor":  doc,
            "branch":  branch,
            "patient": name,
            "phone":   pat.get("phoneNumber") or "",
        }
        if a.get("note") and note_from <= start <= note_to:
            entry["note"] = a["note"]

        by_doctor[doc].append(entry)
        by_branch[branch].append(entry)
        if start:
            by_date[start][doc].append(entry)
        by_type[atype]   += 1
        by_status[status] += 1

        if start == today_str:
            today_appointments.append(entry)

    by_date_output = {}
    for date, doc_map in sorted(by_date.items(), reverse=True)[:90]:
        by_date_output[date] = {
            "total":   sum(len(v) for v in doc_map.values()),
            "doctors": {doc: len(appts) for doc, appts in doc_map.items()}
        }

    return {
        "by_doctor": {
            d: {"total": len(v), "appointments": v[:300]}
            for d, v in sorted(by_doctor.items())
        },
        "by_branch": {
            b: {"total": len(v), "appointments": v[:300]}
            for b, v in sorted(by_branch.items())
        },
        "by_date":        by_date_output,
        "by_type":        dict(sorted(by_type.items(), key=lambda x: -x[1])),
        "by_status":      dict(sorted(by_status.items(), key=lambda x: -x[1])),
        "today_date":     today_str,
        "today_appointments": today_appointments,
    }

AUTH_CTX = {}

async def main():
    print("=" * 55)
    print("   BODYFIX — Medicolize Sync")
    print(f"   Time: {datetime.now():%Y-%m-%d %H:%M:%S}")
    print("=" * 55)
    if not USERNAME or not PASSWORD:
        raise ValueError("Secrets not set")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"]
        )
        async def _attempt(use_state):
            ctx = await browser.new_context(
                viewport={"width": 1400, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                storage_state=SESSION_FILE if use_state else None,
            )
            pg = await ctx.new_page()
            cookie_str, auth_headers = await do_login(ctx, pg)
            await load_type_names(pg, cookie_str, auth_headers)
            try:
                await detect_note_field(pg, cookie_str, auth_headers)
            except Exception as e:
                print(f"   ⚠️ note field: {e}")
            appts = await fetch_all_appointments(cookie_str, pg, auth_headers)
            AUTH_CTX.update(cookie=cookie_str, headers=auth_headers)
            return ctx, pg, appts
        try:
            use_state = os.path.exists(SESSION_FILE)
            context, page, appointments = await _attempt(use_state)
            if not appointments and use_state:
                print("   ♻️ الجلسة المحفوظة خلصت — دخول جديد بكود")
                await context.close()
                os.remove(SESSION_FILE)
                context, page, appointments = await _attempt(False)
            if appointments:
                os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
                await context.storage_state(path=SESSION_FILE)
                print("   💾 Session saved for next run")
            if not appointments:
                # ما نكتبش ملفات فاضية فوق الداتا السليمة — نخلي الـ run يفشل باللون الأحمر
                raise RuntimeError("Medicolize رجع 0 مواعيد — غالبًا اللوجين فشل أو الـ API اتغير")
            analysis     = analyze(appointments)
            now_str      = datetime.now(timezone.utc).isoformat()

            os.makedirs("data", exist_ok=True)

            # ── تحديث doc_map.json ──────────────────────────────
            doc_map = load_doc_map()
            med_doctors = list(analysis["by_doctor"].keys())
            updated = update_doc_map(med_doctors, doc_map)
            if updated or not os.path.exists("doc_map.json"):
                save_doc_map(doc_map)
                print(f"   ✅ doc_map.json updated ({len(doc_map)} entries)")
            else:
                save_doc_map(doc_map)  # نحفظ دايما عشان data/ يتحدث
                print(f"   ✅ doc_map.json saved ({len(doc_map)} entries)")

            with open("appointments.json", "w", encoding="utf-8") as f:
                json.dump({
                    "last_updated": now_str,
                    "total": len(appointments),
                    "appointments": [{**{k: v for k, v in a.items() if k not in ("note", "cancel_at")}, "patient": {k: v for k, v in (a.get("patient") or {}).items() if k not in ("birthDate", "pnote")}} for a in appointments[:500]],   # تاريخ الميلاد ما يتنشرش
                    "analysis": analysis
                }, f, ensure_ascii=False, indent=2)

            with open("summary.json", "w", encoding="utf-8") as f:
                json.dump({
                    "last_updated":       now_str,
                    "total":              len(appointments),
                    "doctors":            list(analysis["by_doctor"].keys()),
                    "branches":           list(analysis["by_branch"].keys()),
                    "by_type":            analysis["by_type"],
                    "by_status":          analysis["by_status"],
                    "by_date":            analysis["by_date"],
                    "doctor_totals":      {d: v["total"] for d, v in analysis["by_doctor"].items()},
                    "today_date":         analysis["today_date"],
                    "today_appointments": analysis["today_appointments"],
                    "doc_map":            doc_map,  # ← بنضيف الـ map هنا كمان
                }, f, ensure_ascii=False, indent=2)

            # ── الباقات وجهة التحويل من الفواتير (لو فشلت ما توقفش المزامنة) ──
            packages = load_packages()
            try:
                packages = await sync_invoices(page, AUTH_CTX.get("cookie", ""), AUTH_CTX.get("headers"))
            except Exception as e:
                print(f"   ⚠️ invoices/packages failed: {e}")
            try:
                packages = await probe_invoice_fields(page, AUTH_CTX.get("cookie", ""), AUTH_CTX.get("headers"), packages)
            except Exception as e:
                print(f"   ⚠️ invoice probe failed: {e}")
            try:
                await sync_steps(page, AUTH_CTX.get("cookie", ""), AUTH_CTX.get("headers"), appointments, packages)
            except Exception as e:
                print(f"   ⚠️ steps sync failed: {e}")

            # ── تنبيهات اللوحة الرئيسية (محسوبة على التاريخ كله) ──
            try:
                from alerts import build_alerts
                alerts = build_alerts(appointments, packages=packages)
                alerts["last_updated"] = now_str
                with open("alerts.json", "w", encoding="utf-8") as f:
                    json.dump(alerts, f, ensure_ascii=False, separators=(",", ":"))
                print(f"   ✅ alerts.json: {len(alerts['dropped'])} dropped regular patients")
                try:
                    write_digest_ctx(appointments, analysis["today_date"])
                except Exception as e:
                    print(f"   ⚠️ digest ctx failed: {e}")
            except Exception as e:  # التنبيهات ما توقفش المزامنة
                print(f"   ⚠️ alerts failed: {e}")

            import shutil
            shutil.copy("appointments.json", "data/appointments.json") if os.path.exists("appointments.json") else None
            shutil.copy("summary.json", "data/summary.json") if os.path.exists("summary.json") else None

            print(f"\n✅ Done! {len(appointments)} appointments")
            print(f"   Today: {len(analysis['today_appointments'])} appointments on {analysis['today_date']}")
            print(f"   Doctors:  {list(analysis['by_doctor'].keys())[:8]}")
            print(f"   Branches: {list(analysis['by_branch'].keys())}")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback; traceback.print_exc()
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
