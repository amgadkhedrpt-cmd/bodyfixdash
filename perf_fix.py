# مرة واحدة: تقييم داليا 26/11 = 125 من 179 (70%) — بإضافة ملحوظات المدير (13 اتعملوا)
import json, urllib.request, digest
k = "PERF|2026-11-26|Dalia"
raw = urllib.request.urlopen(digest.REQ_SCRIPT_URL + "?action=getAll&callback=cb", timeout=60).read().decode("utf-8")
R = json.loads(raw[raw.index("(") + 1:raw.rindex(")")]).get("reasons") or {}
o = json.loads(R[k]); o.pop("d", None)
G = o.setdefault("g", {})
G["mgr"] = {"n": 13, "sys": 0, "btn": 13, "nr": 0, "open": 0, "timed": 0, "fast": 0, "moved": 0}
n = sum(x.get("n", 0) for x in G.values()); d = sum(x.get("sys", 0) + x.get("btn", 0) for x in G.values())
print("Dalia", d, "/", n, round(100 * d / n))
digest.perf_save("2026-11-26", {"Dalia": o})
