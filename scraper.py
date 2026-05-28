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
    await page.goto(f"{SITE_URL}/auth/login", wait_until="networkidle", timeout=TIMEOUT)
    await page.wait_for_timeout(3000)

    # Screenshot page title for debug
    title = await page.title()
    print(f"[{ts()}] Page title: {title}")

    # Fill email
    print(f"[{ts()}] Filling email: {USERNAME}")
    filled_email = False
    for sel in ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="mail" i]', 'input[placeholder*="user" i]', 'input']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                await loc.fill("")
                await loc.type(USERNAME, delay=50)
                filled_email = True
                print(f"[{ts()}] Email typed with selector: {sel}")
                break
        except: continue

    await page.wait_for_timeout(500)

    # Fill password
    filled_pass = False
    for sel in ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="pass" i]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                await loc.fill("")
                await loc.type(PASSWORD, delay=50)
                filled_pass = True
                print(f"[{ts()}] Password typed with selector: {sel}")
                break
        except: continue

    await page.wait_for_timeout(500)
    print(f"[{ts()}] Email filled: {filled_email}, Password filled: {filled_pass}")

    # Click login button
    clicked = False
    for sel in ['button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign in")',
                'input[type="submit"]', 'button']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                clicked = True
                print(f"[{ts()}] Clicked: {sel}")
                break
        except: continue

    if not clicked:
        # Try pressing Enter on password field
        print(f"[{ts()}] Pressing Enter...")
        await page.keyboard.press("Enter")

    # Wait for navigation
    print(f"[{ts()}] Waiting for navigation after login...")
    await page.wait_for_timeout(8000)
    print(f"[{ts()}] URL after login: {page.url}")

    # If still on login page, try GraphQL login directly
    if "/auth/login" in page.url:
        print(f"[{ts()}] Still on login page — trying GraphQL login mutation...")
        login_result = await page.evaluate("""
            async (args) => {
                const mutation = `mutation LOGIN($email: String!, $password: String!) {
                    login(email: $email, password: $password) {
                        token
                        user { id name email __typename }
                        __typename
                    }
                }`;
                try {
                    const res = await fetch('https://api.medicolize.com/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            operationName: 'LOGIN',
                            variables: { email: args.username, password: args.password },
                            query: mutation
                        })
                    });
                    const text = await res.text();
                    return { ok: true, text: text };
                } catch(e) {
                    return { ok: false, error: e.message };
                }
            }
        """, {"username": USERNAME, "password": PASSWORD})

        print(f"[{ts()}] GraphQL login response: {login_result.get('text', '')[:300]}")

        if login_result.get("ok"):
            try:
                data = json.loads(login_result["text"])
                token = None
                if isinstance(data, dict):
                    login_data = (data.get("data") or {}).get("login") or {}
                    if isinstance(login_data, dict):
                        token = login_data.get("token")
                    # Also check top level
                    if not token:
                        token = data.get("token")
                if token:
                    print(f"[{ts()}] ✅ Got token from GraphQL login!")
                    return None, None, f"Bearer {token}"
            except Exception as e:
                print(f"[{ts()}] Parse error: {e}")

    # Get all cookies
    cookies = await context.cookies()
    print(f"[{ts()}] Cookies: {len(cookies)}")
    for c in cookies:
        print(f"  {c['name']} @ {c['domain']}")

    cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
    return cookie_str, cookies, None

async def fetch_all_appointments(cookie_str, token, page):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip, take, page_num = 0, 100, 1

    print(f"[{ts()}] Using token: {bool(token)}, cookies: {len(cookie_str or '')}")

    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {"skip": skip, "take": take, "orderBy": "createdAt-desc",
                          "searchTerm": "", "rangeDate": range_date,
                          "filters": {"rangeDateKey": "start"}},
            "query": GQL_QUERY,
        }

        headers = {
            "Content-Type": "application/json",
            "Origin": "https://my.medicolize.com",
            "Referer": "https://my.medicolize.com/",
        }
        if token:
            headers["Authorization"] = token
        if cookie_str:
            headers["Cookie"] = cookie_str

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

        print(f"[{ts()}] HTTP {result.get('status')} page {page_num}")

        try: data = json.loads(result["text"])
        except:
            print(f"[{ts()}] Parse error: {result['text'][:200]}"); break

        if isinstance(data, dict) and data.get("errors"):
            print(f"[{ts()}] GQL error: {data['errors'][0]['message']}"); break

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
            cookie_str, cookies, token = await do_login(context, page)
            appointments = await fetch_all_appointments(cookie_str, token, page)
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
