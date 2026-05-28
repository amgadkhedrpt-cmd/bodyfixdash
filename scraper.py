import os
import json
import asyncio
from datetime import datetime, timezone, timedelta
from collections import defaultdict

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH", "/home/runner/.cache/ms-playwright"
)

from playwright.async_api import async_playwright

SITE_URL = os.environ.get("MEDICOLIZE_URL",  "https://my.medicolize.com")
USERNAME = os.environ.get("MEDICOLIZE_USER", "")
PASSWORD = os.environ.get("MEDICOLIZE_PASS", "")
API_URL  = "https://api.medicolize.com/"
HEADLESS = True
TIMEOUT  = 45000

# Map of known Enum codes to Arabic names
APPOINTMENT_TYPES = {
    "Enum1":  "كشف",
    "Enum2":  "متابعة",
    "Enum3":  "استشارة",
    "Enum4":  "علاج",
    "Enum5":  "جلسة",
    "Enum6":  "عملية",
    "Enum7":  "أشعة",
    "Enum8":  "تحليل",
    "Enum9":  "طوارئ",
    "Enum10": "مراجعة",
    "Enum11": "كشف",
    "Enum12": "حجز",
    "Enum23": "علاج طبيعي",
    "Enum33": "متابعة",
    "Enum34": "إعادة جلسة",
    "Enum40": "استشارة أونلاين",
    "Enum41": "فحص",
    "Enum42": "تقييم",
    "Enum50": "طوارئ",
}

STATUS_NAMES = {
    "OPEN":      "مفتوح",
    "CONFIRMED": "مؤكد",
    "WAITING":   "قائمة انتظار",
    "COMPLETED": "مكتمل",
    "CANCELLED": "ملغي",
    "CHECKED":   "حضر",
    "IN_PROGRESS": "جاري",
}

GQL_QUERY = "query CREATED_APPOINTMENTS($orderBy:String!,$skip:Int!,$take:Int!,$searchTerm:String,$rangeDate:[DateTime!]!,$filters:Filter){createdAppointments(orderBy:$orderBy skip:$skip take:$take searchTerm:$searchTerm rangeDate:$rangeDate filters:$filters){id start end status type other doctor{id name color __typename}branch{id name __typename}patient{id firstName lastName phoneNumber __typename}createdAt __typename}}"

def build_date_range():
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end   = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.999Z")
    return [start, end]

def resolve_val(flat, val):
    """Resolve a value — if int, treat as index into flat array."""
    if isinstance(val, int) and 0 <= val < len(flat):
        return flat[val]
    return val

def resolve_obj(flat, ref):
    """Resolve an object reference from the flat array."""
    obj = resolve_val(flat, ref)
    if isinstance(obj, dict):
        return {k: resolve_val(flat, v) for k, v in obj.items() if k != '__typename'}
    return {}

def parse_flat_array(flat):
    """
    Apollo flat array format:
    - Last item is a dict like {"createdAppointments": 48} pointing to the index list
    - That index points to a list of appointment indices
    - Each index points to an appointment object dict
    """
    appointments = []

    # Find the root object {"createdAppointments": N}
    root_idx = None
    for item in reversed(flat):
        if isinstance(item, dict) and "createdAppointments" in item:
            root_idx = item["createdAppointments"]
            break

    if root_idx is None:
        return []

    # Get the list of appointment indices
    appt_indices = resolve_val(flat, root_idx)
    if not isinstance(appt_indices, list):
        return []

    for idx in appt_indices:
        appt_obj = resolve_val(flat, idx)
        if not isinstance(appt_obj, dict):
            continue

        try:
            # Resolve all fields
            appt_id  = resolve_val(flat, appt_obj.get('id'))
            start    = resolve_val(flat, appt_obj.get('start'))
            end      = resolve_val(flat, appt_obj.get('end'))
            status   = resolve_val(flat, appt_obj.get('status'))
            type_raw = resolve_val(flat, appt_obj.get('type'))
            other    = resolve_val(flat, appt_obj.get('other'))
            created  = resolve_val(flat, appt_obj.get('createdAt'))

            # Resolve nested objects
            doctor_obj  = resolve_obj(flat, appt_obj.get('doctor'))
            branch_obj  = resolve_obj(flat, appt_obj.get('branch'))
            patient_obj = resolve_obj(flat, appt_obj.get('patient'))

            # Get appointment type — prefer 'other' (human readable), fallback to mapped Enum
            if other and isinstance(other, str) and not other.startswith("Enum"):
                appt_type = other
            elif type_raw and isinstance(type_raw, str) and not type_raw.startswith("Enum"):
                appt_type = type_raw
            else:
                # Map Enum to Arabic
                enum_key = other if isinstance(other, str) and other.startswith("Enum") else \
                           type_raw if isinstance(type_raw, str) and type_raw.startswith("Enum") else None
                appt_type = APPOINTMENT_TYPES.get(enum_key, enum_key or "غير محدد")

            # Map status to Arabic
            status_ar = STATUS_NAMES.get(status, status) if isinstance(status, str) else str(status)

            appointments.append({
                "id":        appt_id,
                "start":     start,
                "end":       end,
                "status":    status_ar,
                "status_en": status,
                "type":      appt_type,
                "createdAt": created,
                "doctor":  {"name": doctor_obj.get('name'), "color": doctor_obj.get('color')},
                "branch":  {"name": branch_obj.get('name')},
                "patient": {
                    "firstName":   patient_obj.get('firstName'),
                    "lastName":    patient_obj.get('lastName'),
                    "phoneNumber": patient_obj.get('phoneNumber'),
                },
            })
        except Exception as e:
            continue

    return appointments

async def do_login(context, page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    print(f"[{ts()}] Opening login page...")
    await page.goto(f"{SITE_URL}/auth/login", wait_until="networkidle", timeout=TIMEOUT)
    await page.wait_for_timeout(3000)

    for sel in ['input[type="email"]', 'input[name="email"]', 'input']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click(); await loc.fill(""); await loc.type(USERNAME, delay=50)
                print(f"[{ts()}] Email entered")
                break
        except: continue

    for sel in ['input[type="password"]', 'input[name="password"]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click(); await loc.fill(""); await loc.type(PASSWORD, delay=50)
                print(f"[{ts()}] Password entered")
                break
        except: continue

    for sel in ['button[type="submit"]', 'button:has-text("Login")', 'button']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click(); print(f"[{ts()}] Login clicked"); break
        except: continue

    await page.wait_for_timeout(8000)
    print(f"[{ts()}] URL: {page.url}")

    cookies = await context.cookies()
    print(f"[{ts()}] Cookies: {[c['name'] for c in cookies]}")
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    return cookie_str

async def fetch_all_appointments(cookie_str, page):
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
            print(f"[{ts()}] GQL error: {data['errors'][0]['message']}"); break

        # Extract raw list
        raw = []
        if isinstance(data, dict) and "data" in data:
            inner = data["data"]
            if isinstance(inner, list):
                raw = inner
            elif isinstance(inner, dict):
                raw = inner.get("createdAppointments") or []
        elif isinstance(data, list):
            raw = data

        if not raw: print(f"[{ts()}] No data"); break

        # Parse using new parser
        batch = parse_flat_array(raw)

        if not batch:
            # Fallback: try old method
            batch = [x for x in raw if isinstance(x, dict) and 'id' in x and 'start' in x]

        if not batch: print(f"[{ts()}] Empty batch"); break

        all_appts.extend(batch)
        print(f"[{ts()}] Page {page_num}: {len(batch)} (total: {len(all_appts)})")

        if len(batch) < take: break
        skip += take; page_num += 1
        await asyncio.sleep(0.5)
        if len(all_appts) >= 23000: break  # كل المواعيد

    print(f"[{ts()}] Total: {len(all_appts)}")
    return all_appts

def analyze(appointments):
    by_doctor  = defaultdict(list)
    by_branch  = defaultdict(list)
    by_date    = defaultdict(lambda: defaultdict(list))  # date -> doctor -> appointments
    by_type    = defaultdict(int)
    by_status  = defaultdict(int)

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

    # Build by_date as simple count + per-doctor breakdown
    by_date_output = {}
    for date, doc_map in sorted(by_date.items(), reverse=True)[:90]:
        by_date_output[date] = {
            "total":   sum(len(v) for v in doc_map.values()),
            "doctors": {doc: len(appts) for doc, appts in doc_map.items()}
        }

    return {
        "by_doctor": {
            d: {"total": len(v), "appointments": v[:300],
                "color": (appointments[0].get("doctor") or {}).get("color") if appointments else None}
            for d, v in sorted(by_doctor.items())
        },
        "by_branch": {
            b: {"total": len(v), "appointments": v[:300]}
            for b, v in sorted(by_branch.items())
        },
        "by_date":   by_date_output,
        "by_type":   dict(sorted(by_type.items(), key=lambda x: -x[1])),
        "by_status": dict(sorted(by_status.items(), key=lambda x: -x[1])),
    }

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
        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        page = await context.new_page()
        try:
            cookie_str   = await do_login(context, page)
            appointments = await fetch_all_appointments(cookie_str, page)
            analysis     = analyze(appointments)
            now_str      = datetime.now(timezone.utc).isoformat()

            os.makedirs("data", exist_ok=True)

            with open("appointments.json", "w", encoding="utf-8") as f:
                json.dump({"last_updated": now_str, "total": len(appointments),
                           "appointments": appointments[:500], "analysis": analysis},
                          f, ensure_ascii=False, indent=2)

            with open("summary.json", "w", encoding="utf-8") as f:
                json.dump({
                    "last_updated":  now_str,
                    "total":         len(appointments),
                    "doctors":       list(analysis["by_doctor"].keys()),
                    "branches":      list(analysis["by_branch"].keys()),
                    "by_type":       analysis["by_type"],
                    "by_status":     analysis["by_status"],
                    "by_date":       analysis["by_date"],
                    "doctor_totals": {d: v["total"] for d, v in analysis["by_doctor"].items()},
                }, f, ensure_ascii=False, indent=2)

            # Also copy to root for Vercel
            import shutil
            shutil.copy("appointments.json", "data/appointments.json") if os.path.exists("appointments.json") else None
            shutil.copy("summary.json", "data/summary.json") if os.path.exists("summary.json") else None

            print(f"\n✅ Done! {len(appointments)} appointments")
            print(f"   Doctors:  {list(analysis['by_doctor'].keys())[:8]}")
            print(f"   Branches: {list(analysis['by_branch'].keys())}")
            print(f"   Types:    {list(analysis['by_type'].keys())[:6]}")
            print(f"   Statuses: {list(analysis['by_status'].keys())}")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback; traceback.print_exc()
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
