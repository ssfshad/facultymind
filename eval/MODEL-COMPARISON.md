# Local model comparison (2026-11-11)

Same machine (6-core Ryzen 5 5600, 32 GB, CPU only), same app code, thinking off, JSON constrained.
Tool: `eval/tools/model-compare.js` (`MODEL=<name> electron eval/tools/model-compare.js [routing] [entities] [explain]`); results in `eval/model-compare/`.

| | qwen2.5:3b-instruct (current) | **qwen3.5:4b** |
|---|---|---|
| Routing, model alone, 328 held-out test commands | 82.0% (clean 147/163, typo 65/81, Banglish 57/84) | **93.6%** (157/163, 74/81, 76/84) |
| Entity extraction, 50 commands (reminder text+time, vault url/password/content/query, course code, model, portal) | 60% (reminders 4/14, vault search 0/8) | **100%** |
| Weak-CLO explanation, 8 scenarios, auto fact-checked | **8/8** | 5/8 (invented `15` and `58.5%`; caught by the checker) |
| Speed per call (median) | **2.4 s** routing, 7.2 s explanation | 10.4 s routing (13.6 s with entities), 8.7 s explanation |
| Memory while loaded | ~2.1 GB | ~3.0 GB |

## Round 2 (2026-11-11): Gemma 4 E2B and Phi-4-mini

| | qwen2.5:3b | qwen3.5:4b | **gemma4:e2b (new default)** | phi4-mini |
|---|---|---|---|---|
| Routing, model alone (328) | 82.0% | 93.6% | **93.6%** (158/163, 77/81, 72/84) | 76.5% (136/163, 65/81, 50/84) |
| Entities (50) | 60% | 100% | **96%** (misses: reminder time in "tonight", wifi password) | 82% |
| Explanation (8, fact-checked) | 8/8 | 5/8 | **8/8** | 8/8 |
| Median per call: routing / explanation | 2.4 s / 7.2 s | 10.4 s / 8.7 s | **2.5 s / 5.1 s** | 2.9 s / 5.4 s |
| Real RAM loaded (llama-server working set, CPU, ctx 4096) | ~2.1 GB | ~3.0 GB | **~4.6 GB** (5.4 GB committed) | not measured |

`ollama ps` under-reports Gemma 4 (1.0 GB on CPU, 294 MB on GPU) because of its large embedding tables; measure the `llama-server` process instead. Decision (Shad, 2026-11-11): Gemma 4 E2B is the default, qwen2.5:3b-instruct stays installed for now, qwen3.5:4b and phi4-mini were removed. Open: 8 GB laptops are untested and likely tight with Gemma.

What made the difference (fixes that apply to ANY model):
- Ollama JSON constraint (`jsonObject`) / JSON schema (`jsonSchema`): small models otherwise emit stray brackets or loop.
- Weak CLOs are computed by code (`explain-check.failingClos`) and passed to the model; the schema allows exactly one entry per weak CLO.
- Classifier schema now asks for the fields the vault handlers read (content, url, password, username, title, query) and is told today's date.
- Qwen3.x needs light sampling (temperature 0.7, top_p 0.8, top_k 20, presence_penalty 1.5): greedy decoding loops.

Caveat: 8 explanation scenarios and 50 entity commands are small; routing numbers are on 328 commands. Not yet measured on an 8 GB laptop.
