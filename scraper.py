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
    token_holder = {"token": None, "all_headers": {}}

    # Intercept ALL requests and responses to find the token
    async def on_request(request):
        hdrs = request.headers
        for key, val in hdrs.items():
            if key.lower() == "authorization" and val.startswith("Bearer "):
                token_holder["token"] = val
                print(f"[{ts()}] ✅ Token from request: {val[:30]}...")

    async def on_response(response):
        try:
            if "api.medicolize" in response.url or "medicolize" in response.url:
                hdrs = response.headers
                # Check for token in response headers
                for key, val in hdrs.items():
                    if "token" in key.lower() or "auth" in key.lower():
                        print(f"[{ts()}] Response header: {key}={val[:50]}")
                # Try to read JSON response for token
                if "json" in hdrs.get("content-type", ""):
                    try:
                        body = await response.json()
                        if isinstance(body, dict):
                            tok = (body.get("data") or {}).get("login", {})
                            if isinstance(tok, dict):
                                t = tok.get("token") or tok.get("accessToken") or tok.get("jwt")
                                if t:
                                    token_holder["token"] = f"Bearer {t}"
                                    print(f"[{ts()}] ✅ Token from login response!")
                            # Also check top level
                            for key in ["token","accessToken","jwt","access_token"]:
                                if body.get(key):
                                    token_holder["token"] = f"Bearer {body[key]}"
                                    print(f"[{ts()}] ✅ Token from response body key: {key}")
                    except:
                        pass
        except:
            pass

    page.on("request",  on_request)
    page.on("response", on_response)

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

    # Wait up to 15 seconds for token
    print(f"[{ts()}] Waiting for token...")
    for _ in range(15):
        await page.wait_for_timeout(1000)
        if token_holder["token"]:
            print(f"[{ts()}] ✅ Token captured!")
            break

    # If still no token, try extracting from JS memory
    if not token_holder["token"]:
        print(f"[{ts()}] Trying JS memory extraction...")
        token = await page.evaluate("""() => {
            // Try various storage locations
            for (const key of Object.keys(localStorage)) {
                const val = localStorage.getItem(key);
                if (val && val.length > 20) {
                    try {
                        const parsed = JSON.parse(val);
                        if (parsed && typeof parsed === 'object') {
                            const t = parsed.token || parsed.accessToken || parsed.jwt || parsed.access_token;
                            if (t) return 'Bearer ' + t;
                        }
                        if (typeof parsed === 'string' && parsed.startsWith('eyJ')) return 'Bearer ' + parsed;
                    } catch(e) {
                        if (val.startsWith('eyJ')) return 'Bearer ' + val;
                    }
                }
            }
            for (const key of Object.keys(sessionStorage)) {
                const val = sessionStorage.getItem(key);
                if (val && val.startsWith('eyJ')) return 'Bearer ' + val;
                try {
                    const parsed = JSON.parse(val);
                    if (parsed && (parsed.token || parsed.accessToken)) {
                        return 'Bearer ' + (parsed.token || parsed.accessToken);
                    }
                } catch(e) {}
            }
            // Try Apollo client
            try {
                const ac = window.__APOLLO_CLIENT__;
                if (ac) {
                    const cache = ac.cache.extract();
                    const keys = Object.keys(cache);
                    for (const k of keys) {
                        const v = cache[k];
                        if (v && (v.token || v.accessToken)) return 'Bearer ' + (v.token || v.accessToken);
                    }
                }
            } catch(e) {}
            return null;
        }""")
        if token:
            token_holder["token"] = token
            print(f"[{ts()}] ✅ Token from JS memory!")

    # Navigate to appointments page to trigger API calls with token
    if not token_holder["token"]:
        print(f"[{ts()}] Navigating to appointments to trigger API...")
        await page.goto(
            f"{SITE_URL}/logs/created-appointments?start=2025-12-31T22%3A00%3A00.000Z&end=2026-12-31T21%3A59%3A59.999Z&queryName=createdAppointments&filters=%7B%22rangeDateKey%22%3A%22start%22%7D",
            wait_until="domcontentloaded", timeout=TIMEOUT
        )
        await page.wait_for_timeout(5000)

    print(f"[{ts()}] Token found: {bool(token_holder['token'])}")
    if token_holder["token"]:
        print(f"[{ts()}] Token preview: {token_holder['token'][:40]}...")
    return token_holder

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
            if isinstance(obj, dict): return {k: resolve(v) for k, v in obj.items() if k != '__typename'}
            return {}
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

async def fetch_all_appointments(token_holder, page):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip, take, page_num = 0, 100, 1
    auth_token = token_holder.get("token")

    print(f"[{ts()}] Fetching appointments (token={bool(auth_token)})...")

    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {"skip": skip, "take": take, "orderBy": "createdAt-desc",
                          "searchTerm": "", "rangeDate": range_date,
                          "filters": {"rangeDateKey": "start"}},
            "query": GQL_QUERY,
        }
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = auth_token

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
        except Exception as e:
            print(f"[{ts()}] Parse error: {e} — {result['text'][:200]}"); break

        if isinstance(data, dict) and data.get("errors"):
            print(f"[{ts()}] GQL error: {data['errors'][0]['message']}"); break

        raw = []
        if isinstance(data, list): raw = data
        elif isinstance(data, dict):
            inner = data.get("data") or {}
            raw = (inner.get("createdAppointments") or []) if isinstance(inner, dict) else (inner or [])

        if not raw: print(f"[{ts()}] No data"); break

        batch = parse_flat_array(raw) if raw and isinstance(raw[0], (str, int)) else (raw if isinstance(raw[0], dict) else [])
        if not batch: print(f"[{ts()}] Empty batch"); break

        all_appts.extend(batch)
        print(f"[{ts()}] Page {page_num}: {len(batch)} (total: {len(all_appts)})")

        if len(batch) < take: break
        skip += take; page_num += 1
        await asyncio.sleep(0.5)
        if len(all_appts) >= 10000: break

    print(f"[{ts()}] Total: {len(all_appts)}")
    return all_appts

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
