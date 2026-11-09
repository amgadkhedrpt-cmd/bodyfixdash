import os
import json
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
            created  = resolve_val(flat, appt_obj.get('createdAt'))
            doctor_obj  = resolve_obj(flat, appt_obj.get('doctor'))
            branch_obj  = resolve_obj(flat, appt_obj.get('branch'))
            patient_obj = resolve_obj(flat, appt_obj.get('patient'))
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
                "doctor":  {"name": doctor_obj.get('name'), "color": doctor_obj.get('color')},
                "branch":  {"name": branch_obj.get('name')},
                "patient": {
                    "id":          patient_obj.get('id'),
                    "firstName":   patient_obj.get('firstName'),
                    "lastName":    patient_obj.get('lastName'),
                    "phoneNumber": patient_obj.get('phoneNumber'),
                    "birthDate":   patient_obj.get('birthDate'),
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
              "{id createdAt total patient{id} referralSource{name} createAppointment{start}}}")
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
    for b in me.get("branches") or []:
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
    cache["updated"] = now.isoformat()
    with open(PACKAGES_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    pk = sum(1 for v in inv.values() if v.get("s"))
    print(f"[{ts()}] ✅ الفواتير: {len(inv)} متخزنة · {new} جديدة · فتحنا تفاصيل {done} (فاضل {max(0, len(todo) - done)}) · باقات معروفة: {pk}")
    return cache


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
            "query": GQL_QUERY,
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
                    "appointments": [{**a, "patient": {k: v for k, v in (a.get("patient") or {}).items() if k != "birthDate"}} for a in appointments[:500]],   # تاريخ الميلاد ما يتنشرش
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

            # ── تنبيهات اللوحة الرئيسية (محسوبة على التاريخ كله) ──
            try:
                from alerts import build_alerts
                alerts = build_alerts(appointments, packages=packages)
                alerts["last_updated"] = now_str
                with open("alerts.json", "w", encoding="utf-8") as f:
                    json.dump(alerts, f, ensure_ascii=False, separators=(",", ":"))
                print(f"   ✅ alerts.json: {len(alerts['dropped'])} dropped regular patients")
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
