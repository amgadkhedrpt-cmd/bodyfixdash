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

async def do_login(context, page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")

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

    # Wait for redirect away from login page
    print(f"[{ts()}] Waiting for redirect...")
    try:
        await page.wait_for_url(lambda url: "/auth/login" not in url, timeout=15000)
    except:
        pass
    await page.wait_for_timeout(3000)

    # Print ALL cookies for debugging
    cookies = await context.cookies()
    print(f"[{ts()}] Cookies found: {len(cookies)}")
    for c in cookies:
        print(f"  - {c['name']} @ {c['domain']} = {str(c['value'])[:30]}...")

    # Build cookie header string
    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])

    # Also check current URL
    print(f"[{ts()}] Current URL: {page.url}")

    return cookie_str, cookies

async def fetch_all_appointments(cookie_str, cookies, page):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip, take, page_num = 0, 100, 1

    print(f"[{ts()}] Cookie string length: {len(cookie_str)}")
    print(f"[{ts()}] Fetching appointments...")

    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {"skip": skip, "take": take, "orderBy": "createdAt-desc",
                          "searchTerm": "", "rangeDate": range_date,
                          "filters": {"rangeDateKey": "start"}},
            "query": GQL_QUERY,
        }

        # Pass cookies explicitly in the header
        result = await page.evaluate("""
            async (args) => {
                try {
                    const res = await fetch(args.url, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cookie': args.cookieStr,
                            'Origin': 'https://my.medicolize.com',
                            'Referer': 'https://my.medicolize.com/'
                        },
                        body: JSON.stringify(args.payload)
                    });
                    return { ok: true, text: await res.text(), status: res.status };
                } catch(e) { return { ok: false, error: e.message }; }
            }
        """, {"url": API_URL, "payload": payload, "cookieStr": cookie_str})

        if not result.get("ok"):
            print(f"[{ts()}] Error: {result.get('error')}"); break

        print(f"[{ts()}] HTTP {result.get('status')} page {page_num}")

        try: data = json.loads(result["text"])
        except Exception as e:
            print(f"[{ts()}] Parse error: {result['text'][:300]}"); break

        if isinstance(data, dict) and data.get("errors"):
            print(f"[{ts()}] GQL error: {data['errors'][0]['message']}")
            print(f"[{ts()}] Full response: {result['text'][:500]}")
            break

        raw = []
        if isinstance(data, list): raw = data
        elif isinstance(data, dict):
            inner = data.get("data") or {}
            raw = (inner.get("createdAppointments") or []) if isinstance(inner, dict) else (inner or [])

        if not raw: print(f"[{ts()}] No data"); break

        batch = parse_flat_array(raw) if raw and isinstance(raw[0], (str, int)) else \
                [x for x in raw if isinstance(x, dict)]
        if not batch: print(f"[{ts()}] Empty batch"); break

        all_appts.extend(batch)
        print(f"[{ts()}] Page {page_num}: {len(batch)} (total: {len(all_appts)})")

        if len(batch) < take: break
        skip += take; page_num += 1
        await asyncio.sleep(0.5)
        if len(all_appts) >= 10000: break

    print(f"[{ts()}] Total: {len(all_appts)}")
    return all_appts

def parse_flat_array(flat):
    appointments = []
    for item in flat:
        if not isinstance(item, dict): continue
        if not all(k in item for k in ['id','start','end','status','doctor','branch','patient']): continue
        def resolve(val):
            if isinstance(val, int) and 0 <= val < len(flat): return flat[val]
            return val
        def resolve_obj(ref):
            obj = resolve(ref)
            return {k: resolve(v) for k, v in obj.items() if k != '__typename'} if isinstance(obj, dict) else {}
        try:
            appointments.append({
                "id": resolve(item['id']), "start": resolve(item['start']),
                "end": resolve(item['end']), "status": resolve(item['status']),
                "type": resolve(item.get('other')) or resolve(item.get('type')),
                "createdAt": resolve(item.get('createdAt')),
                "doctor":  {"name": resolve_obj(item.get('doctor')).get('name')},
                "branch":  {"name": resolve_obj(item.get('branch')).get('name')},
                "patient": resolve_obj(item.get('patient')),
            })
        except: continue
    return appointments

def analyze(appointments):
    by_doctor = defaultdict(list); by_branch = defaultdict(list)
    by_date = defaultdict(int); by_type = defaultdict(int); by_status = defaultdict(int)
    for a in appointments:
        if not isinstance(a, dict): continue
        doc    = (a.get("doctor") or {}).get("name") or "Unknown"
        branch = (a.get("branch") or {}).get("name") or "Unknown"
        start  = str(a.get("start") or "")[:10]
        atype  = str(a.get("type") or "Unknown")
        status = str(a.get("status") or "Unknown")
        pat    = a.get("patient") or {}
        name   = f"{pat.get('firstName') or ''} {pat.get('lastName') or ''}".strip()
        entry  = {"id": a.get("id"), "start": a.get("start"), "end": a.get("end"),
                  "status": status, "type": atype, "doctor": doc, "branch": branch,
                  "patient": name, "phone": pat.get("phoneNumber") or ""}
        by_doctor[doc].append(entry); by_branch[branch].append(entry)
        if start: by_date[start] += 1
        by_type[atype] += 1; by_status[status] += 1
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
            cookie_str, cookies = await do_login(context, page)
            appointments = await fetch_all_appointments(cookie_str, cookies, page)
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
                           "by_type": analysis["by_type"], "by_status": analysis["by_status"],
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
