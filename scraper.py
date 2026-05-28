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

GQL_QUERY = "query CREATED_APPOINTMENTS($orderBy:String!,$skip:Int!,$take:Int!,$searchTerm:String,$rangeDate:[DateTime!]!,$filters:Filter){createdAppointments(orderBy:$orderBy skip:$skip take:$take searchTerm:$searchTerm rangeDate:$rangeDate filters:$filters){id start end status type other doctor{id name color __typename}branch{id name __typename}patient{id firstName lastName phoneNumber __typename}createdAt __typename}}"

def build_date_range():
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end   = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.999Z")
    return [start, end]

async def do_login_and_get_token(page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    token_holder = {"token": None, "headers": {}}

    # Intercept all requests to api.medicolize.com to capture the auth token
    async def capture_request(request):
        if "api.medicolize.com" in request.url:
            hdrs = request.headers
            auth = hdrs.get("authorization") or hdrs.get("Authorization")
            if auth and auth.startswith("Bearer "):
                token_holder["token"] = auth
                token_holder["headers"] = dict(hdrs)
                print(f"[{ts()}] ✅ Token captured!")

    page.on("request", capture_request)

    print(f"[{ts()}] Opening login page...")
    await page.goto(f"{SITE_URL}/auth/login", wait_until="domcontentloaded", timeout=TIMEOUT)
    await page.wait_for_timeout(2000)

    for sel in ['input[type="email"]', 'input[name="email"]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(USERNAME)
                print(f"[{ts()}] Email entered")
                break
        except: continue

    for sel in ['input[type="password"]', 'input[name="password"]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(PASSWORD)
                print(f"[{ts()}] Password entered")
                break
        except: continue

    for sel in ['button[type="submit"]', 'button:has-text("Login")']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                print(f"[{ts()}] Login clicked")
                break
        except: continue

    # Wait for redirect and token
    print(f"[{ts()}] Waiting for token...")
    for _ in range(20):
        await page.wait_for_timeout(1000)
        if token_holder["token"]:
            break

    if not token_holder["token"]:
        print(f"[{ts()}] Token not captured yet, waiting more...")
        await page.wait_for_timeout(5000)

    print(f"[{ts()}] Token found: {bool(token_holder['token'])}")
    return token_holder

def parse_flat_array(flat):
    appointments = []
    for item in flat:
        if not isinstance(item, dict):
            continue
        if not all(k in item for k in ['id', 'start', 'end', 'status', 'doctor', 'branch', 'patient']):
            continue

        def resolve(val):
            if isinstance(val, int) and 0 <= val < len(flat):
                return flat[val]
            return val

        def resolve_obj(ref):
            obj = resolve(ref)
            if isinstance(obj, dict):
                return {k: resolve(v) for k, v in obj.items() if k != '__typename'}
            return {}

        try:
            doctor_obj  = resolve_obj(item.get('doctor'))
            branch_obj  = resolve_obj(item.get('branch'))
            patient_obj = resolve_obj(item.get('patient'))

            appointments.append({
                "id":      resolve(item['id']),
                "start":   resolve(item['start']),
                "end":     resolve(item['end']),
                "status":  resolve(item['status']),
                "type":    resolve(item.get('other')) or resolve(item.get('type')),
                "createdAt": resolve(item.get('createdAt')),
                "doctor":  {"id": doctor_obj.get('id'),  "name": doctor_obj.get('name'),  "color": doctor_obj.get('color')},
                "branch":  {"id": branch_obj.get('id'),  "name": branch_obj.get('name')},
                "patient": {"id": patient_obj.get('id'), "firstName": patient_obj.get('firstName'),
                            "lastName": patient_obj.get('lastName'), "phoneNumber": patient_obj.get('phoneNumber')},
            })
        except Exception:
            continue
    return appointments

async def fetch_all_appointments(token_holder, page):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip       = 0
    take       = 100
    page_num   = 1

    auth_token = token_holder.get("token")
    print(f"[{ts()}] Using token: {bool(auth_token)}")
    print(f"[{ts()}] Fetching appointments...")

    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {
                "skip": skip, "take": take,
                "orderBy": "createdAt-desc", "searchTerm": "",
                "rangeDate": range_date, "filters": {"rangeDateKey": "start"},
            },
            "query": GQL_QUERY,
        }

        # Build headers
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = auth_token

        result = await page.evaluate("""
            async (args) => {
                try {
                    const res = await fetch(args.url, {
                        method: 'POST',
                        credentials: 'include',
                        headers: args.headers,
                        body: JSON.stringify(args.payload)
                    });
                    return { ok: true, text: await res.text(), status: res.status };
                } catch(e) {
                    return { ok: false, error: e.message };
                }
            }
        """, {"url": API_URL, "payload": payload, "headers": headers})

        if not result.get("ok"):
            print(f"[{ts()}] Fetch error: {result.get('error')}")
            break

        print(f"[{ts()}] HTTP {result.get('status')} — page {page_num}")

        try:
            data = json.loads(result["text"])
        except Exception as e:
            print(f"[{ts()}] Parse error: {e} — raw: {result['text'][:300]}")
            break

        if isinstance(data, dict) and data.get("errors"):
            print(f"[{ts()}] GraphQL error: {data['errors'][0]['message']}")
            break

        raw = []
        if isinstance(data, list):
            raw = data
        elif isinstance(data, dict):
            inner = (data.get("data") or {})
            raw = inner.get("createdAppointments") or [] if isinstance(inner, dict) else inner or []

        if not raw:
            print(f"[{ts()}] No more data")
            break

        batch = parse_flat_array(raw) if raw and isinstance(raw[0], (str, int)) else raw
        if not batch:
            print(f"[{ts()}] Empty after parsing")
            break

        all_appts.extend(batch)
        print(f"[{ts()}] Page {page_num}: {len(batch)} (total: {len(all_appts)})")

        if len(batch) < take:
            break
        skip += take
        page_num += 1
        await asyncio.sleep(0.5)
        if len(all_appts) >= 10000:
            break

    print(f"[{ts()}] Total: {len(all_appts)}")
    return all_appts

def analyze(appointments):
    by_doctor = defaultdict(list)
    by_branch = defaultdict(list)
    by_date   = defaultdict(int)
    by_type   = defaultdict(int)
    by_status = defaultdict(int)

    for a in appointments:
        if not isinstance(a, dict): continue
        doc    = (a.get("doctor")  or {}).get("name") or "Unknown"
        branch = (a.get("branch")  or {}).get("name") or "Unknown"
        start  = str(a.get("start") or "")[:10]
        atype  = str(a.get("type")  or "Unknown")
        status = str(a.get("status") or "Unknown")
        pat    = a.get("patient") or {}
        name   = f"{pat.get('firstName') or ''} {pat.get('lastName') or ''}".strip()

        entry = {"id": a.get("id"), "start": a.get("start"), "end": a.get("end"),
                 "status": status, "type": atype, "doctor": doc, "branch": branch,
                 "patient": name, "phone": pat.get("phoneNumber") or ""}

        by_doctor[doc].append(entry)
        by_branch[branch].append(entry)
        if start: by_date[start] += 1
        by_type[atype] += 1
        by_status[status] += 1

    return {
        "by_doctor": {d: {"total": len(v), "appointments": v[:200]} for d, v in sorted(by_doctor.items())},
        "by_branch": {b: {"total": len(v), "appointments": v[:200]} for b, v in sorted(by_branch.items())},
        "by_date":   dict(sorted(by_date.items(), reverse=True)[:60]),
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
            token_holder = await do_login_and_get_token(page)
            appointments = await fetch_all_appointments(token_holder, page)
            analysis     = analyze(appointments)
            now_str      = datetime.now(timezone.utc).isoformat()

            os.makedirs("data", exist_ok=True)

            with open("data/appointments.json", "w", encoding="utf-8") as f:
                json.dump({"last_updated": now_str, "total": len(appointments),
                           "appointments": appointments[:500], "analysis": analysis},
                          f, ensure_ascii=False, indent=2)

            with open("data/summary.json", "w", encoding="utf-8") as f:
                json.dump({"last_updated": now_str, "total": len(appointments),
                           "doctors": list(analysis["by_doctor"].keys()),
                           "branches": list(analysis["by_branch"].keys()),
                           "by_type": analysis["by_type"],
                           "by_status": analysis["by_status"],
                           "by_date": analysis["by_date"],
                           "doctor_totals": {d: v["total"] for d, v in analysis["by_doctor"].items()}},
                          f, ensure_ascii=False, indent=2)

            print(f"\n✅ Done! {len(appointments)} appointments")
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
