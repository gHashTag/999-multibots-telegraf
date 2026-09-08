import json, urllib.request, os, sys

B = os.environ.get("MOCK_BASE", "http://localhost:3336")
passed = []; failed = []

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B+path, data=data, method=method,
        headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(r, timeout=10) as resp:
        return json.loads(resp.read() or "{}")

def check(label, method, path, body=None, ok=lambda d: True):
    try:
        d = req(method, path, body)
        if ok(d): passed.append(label)
        else: failed.append((label, "неверный ответ: "+json.dumps(d,ensure_ascii=False)[:80]))
    except Exception as e:
        failed.append((label, str(e)[:80]))

# ── the agent tools, one call each (MCP tools/call) ──
tools = json.loads(json.dumps(req("POST","/mcp",{"jsonrpc":"2.0","id":1,"method":"tools/list"})))["result"]["tools"]
for t in tools:
    n = t["name"]
    check(f"MCP:{n}", "POST", "/mcp",
        {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":n,"arguments":{}}},
        ok=lambda d: d.get("result",{}).get("structuredContent") is not None)

# ── MCP протокол ──
check("MCP:initialize","POST","/mcp",{"jsonrpc":"2.0","id":1,"method":"initialize"}, ok=lambda d:"result" in d)
# 35 -> 34: the `club` tool is gone. It sold a subscription that has never
# been charged for, so it had no billing path to unwind -- see the PR that
# removed it from all four surfaces. The count is checked BY NAME too, so a
# tool leaving and another arriving cannot cancel out in the total.
check("MCP:tools/list","POST","/mcp",{"jsonrpc":"2.0","id":1,"method":"tools/list"}, ok=lambda d:len(d["result"]["tools"])==34 and "club" not in [t["name"] for t in d["result"]["tools"]])
check("MCP:card(GET)","GET","/mcp")

# ── A2A ──
check("A2A:agent-card","GET","/.well-known/agent-card.json", ok=lambda d: len(d.get("skills",[]))==34 and "club" not in [s.get("id") or s.get("name") for s in d.get("skills",[])])
check("A2A:message/send(текст)","POST","/a2a",{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"parts":[{"kind":"text","text":"привет"}]}}}, ok=lambda d:"result" in d)
check("A2A:message/send(skill)","POST","/a2a",{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"metadata":{"skill":"feed_stats"}}}}, ok=lambda d:"result" in d)

# ── Генерация (таб с ИИ) ──
gen_ok = lambda d: d.get("success") is True and bool(d.get("url"))
check("gen:image","POST","/api/generate/image",{"prompt":"x"}, gen_ok)
check("gen:audio","POST","/api/generate/audio",{"text":"x"}, gen_ok)
check("gen:video","POST","/api/generate/video",{"prompt":"x"}, gen_ok)
check("gen:lipsync","POST","/api/generate/lipsync",{"audio_url":"a","image_url":"i"}, gen_ok)

# ── Рендер ──
check("render:template","POST","/render/template",{"compositionId":"TrinityBlogReel"}, ok=lambda d:d.get("renderId"))
check("render:status","GET","/render/mock-1", ok=lambda d:d.get("status")=="completed")

# ── Лента/провайдеры ──
check("feed:list(GET)","GET","/api/feed", ok=lambda d:len(d.get("templates",[]))>0)
check("providers:status","GET","/api/providers", ok=lambda d:d.get("работает")==4)

# ── ВСЕ ПРОВАЙДЕРЫ ──
S = lambda d: d.get("success") is True
# Kling
check("kling:video","POST","/api/kling/video",{"prompt":"x"}, S)
check("kling:i2v","POST","/api/kling/i2v",{"imageUrl":"x"}, S)
check("kling:task","GET","/api/kling/task/abc", ok=S)
check("kling:tasks","GET","/api/kling/tasks", ok=S)
# HeyGen
check("heygen:video","POST","/api/heygen/video",{"avatarId":"a","script":"s"}, S)
check("heygen:avatars","GET","/api/heygen/avatars", ok=S)
check("heygen:voices","GET","/api/heygen/voices", ok=S)
check("heygen:status","GET","/api/heygen/status/vid", ok=S)
# FAL
check("fal:neuro-photo","POST","/api/fal/neuro-photo",{"prompt":"x","loraUrl":"u"}, S)
check("fal:flux-kontext","POST","/api/fal/flux-kontext",{"prompt":"x","inputImageUrl":"u"}, S)
check("fal:nano-banana","POST","/api/fal/nano-banana",{"prompt":"x"}, S)
check("fal:status","GET","/api/fal/status/req", ok=S)
check("fal:result","GET","/api/fal/result/req", ok=S)
# Replicate ops
check("replicate:lipsync","POST","/api/replicate/lipsync",{"videoUrl":"v","audioUrl":"a"}, S)
check("replicate:morphing","POST","/api/replicate/morphing",{"startImageUrl":"s","endImageUrl":"e"}, S)
check("replicate:faceswap","POST","/api/replicate/faceswap",{"targetImageUrl":"t","swapImageUrl":"s"}, S)
check("replicate:upscale","POST","/api/replicate/upscale",{"imageUrl":"i"}, S)
check("replicate:train-lora","POST","/api/replicate/train-lora",{"imagesZipUrl":"z","triggerWord":"w","modelName":"m"}, S)
check("replicate:predictions","POST","/api/replicate/predictions",{"version":"v","input":{}}, ok=lambda d:d.get("status")=="succeeded")
check("replicate:poll","GET","/api/replicate/poll?url=x", ok=lambda d:d.get("status")=="succeeded")
# OpenAI
check("openai:transcribe","POST","/api/openai/transcribe",{"audioUrl":"a"}, S)
check("openai:vision","POST","/api/openai/vision",{"imageUrl":"i"}, S)
check("openai:improve-prompt","POST","/api/openai/improve-prompt",{"prompt":"p"}, S)
# Video editing
for op in ["concat","trim","watermark","add-audio","extract-audio","info"]:
    check(f"video:{op}","POST",f"/api/video/{op}",{"videoUrl":"v"}, S)
# B-roll
check("broll:generate","POST","/api/broll/generate",{"category":"abstract"}, S)
check("broll:templates","GET","/api/broll/templates", ok=S)
# Voice clone
check("voices:clone","POST","/api/voices/clone",{"name":"n","audioUrl":"a"}, S)
check("voices:list","GET","/api/voices", ok=lambda d:len(d.get("voices",[]))>0)
check("voices:delete","DELETE","/api/voices/vid", ok=S)
# Hedra / BFL
check("hedra:status","GET","/api/hedra/status/job", ok=S)
check("hedra:jobs","GET","/api/hedra/jobs", ok=S)
check("bfl:result","GET","/api/bfl/result/task", ok=lambda d:d.get("status")=="Ready")
# health
check("health","GET","/health", ok=lambda d:d.get("ok") is True)

total = len(passed)+len(failed)
print(f"\n{'='*50}")
print(f"ИТОГ: {len(passed)}/{total} прошло  ({round(100*len(passed)/total)}%)")
print(f"{'='*50}")
if failed:
    print("\n❌ ПРОВАЛЫ:")
    for l,e in failed: print(f"   {l}: {e}")
else:
    print("\n✅ 100% — ВСЕ функции и провайдеры отдают корректный ответ")
# группировка
groups={}
for p in passed:
    g=p.split(":")[0]; groups[g]=groups.get(g,0)+1
print("\nПо группам:", ", ".join(f"{g}={c}" for g,c in sorted(groups.items())))

# EXIT WITH A FAILURE CODE. Without this the script printed its failures and
# returned ZERO -- and the lefthook mock-functions gate judges by the exit
# code. A gate advertised as "fails loudly" could never fail: 86 of 87 was as
# silent as 87 of 87. Proven 2026-08-29 by breaking one check: 86/87 printed,
# failures listed, rc=0.
if failed:
    sys.exit(1)
