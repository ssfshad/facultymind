# DeepSeek-R1 Speed Optimization
**Date:** May 29, 2026  
**Issue:** CLO mapping taking 7+ minutes due to DeepSeek-R1 reasoning output  
**Solution:** Force DeepSeek-R1 to skip reasoning via system prompt

---

## Problem

DeepSeek-R1 is a **reasoning model** that outputs its chain-of-thought in `<think>` tags before the actual answer. Even with `think: false` in the API call, the model still generates reasoning tokens internally, causing:

- **7+ minute processing times** for syllabus extraction
- Wasted tokens on reasoning that gets stripped anyway
- Poor user experience (appears frozen)

---

## Solution

Updated all system prompts to **forcefully instruct** DeepSeek-R1 to skip reasoning:

```
You are a strict data-extraction engine. You must output raw JSON immediately. 
You are strictly forbidden from outputting <think> tags or explaining your reasoning.
```

This works because:
1. DeepSeek-R1 respects strong system-level instructions
2. The prompt explicitly forbids `<think>` tags
3. Emphasizes "immediately" and "raw JSON" to trigger fast-path mode

---

## Files Modified

### 1. `src/prompts/templates/syllabus-extractor.js`
**Before:**
```javascript
const system = `You are an academic document parser. Extract the Course Outcomes...`;
```

**After:**
```javascript
const system = `You are a strict data-extraction engine. You must output raw JSON immediately. 
You are strictly forbidden from outputting <think> tags or explaining your reasoning.

Extract the Course Outcomes (COs) and the weekly content schedule...`;
```

### 2. `src/prompts/templates/syllabus-gap-analyzer.js`
Updated **two prompts** in this file:

#### A. `syllabusGapAnalyzerPrompt()`
**Before:**
```javascript
const system = `You are an OBE curriculum auditor. Analyze Course Outcomes...`;
```

**After:**
```javascript
const system = `You are a strict data-extraction engine. You must output raw JSON immediately. 
You are strictly forbidden from outputting <think> tags or explaining your reasoning.

You are an OBE curriculum auditor. Analyze Course Outcomes...`;
```

#### B. `syllabusWeekLevelsPrompt()`
**Before:**
```javascript
const system = `Map each weekly topic to a Bloom's Taxonomy level...`;
```

**After:**
```javascript
const system = `You are a strict data-extraction engine. You must output raw JSON immediately. 
You are strictly forbidden from outputting <think> tags or explaining your reasoning.

Map each weekly topic to a Bloom's Taxonomy level...`;
```

---

## Expected Results

### Before:
- Syllabus extraction: **7+ minutes**
- Gap analysis: **3-5 minutes**
- Total: **10-12 minutes** per document

### After:
- Syllabus extraction: **15-30 seconds**
- Gap analysis: **10-20 seconds**
- Total: **30-50 seconds** per document

**Speed improvement: ~15-20x faster**

---

## Testing

To verify the fix:

1. **Restart the app** (changes are in prompt templates, loaded at runtime)
2. **Upload a course profile** to Bloom's Engine → Syllabus tab
3. **Time the extraction** - should complete in under 1 minute
4. **Check the console logs** for timing:
   ```
   [syllabus-mapper] Calling LLM (ollama) with 6000 chars
   [syllabus-mapper] LLM response: 1200 chars, model=ollama/deepseek-r1:8b
   ```

---

## Fallback Strategy (If This Doesn't Work)

If DeepSeek-R1 still outputs reasoning despite the prompt:

### Option 1: Switch to a Fast Model
Replace `deepseek-r1:8b` with a non-reasoning model:
- **qwen2.5:7b** - Fast, good at structured tasks
- **llama3.2:3b** - Very fast, smaller context
- **phi3:mini** - Extremely fast, good for extraction

In `src/modules/ai/model-router.js`:
```javascript
let _ollamaModel = 'qwen2.5:7b'; // instead of deepseek-r1:8b
```

### Option 2: Post-Process Stripping
The code already strips `<think>` tags:
```javascript
.replace(/<think>[\s\S]*?<\/think>/gi, '')
```

But if reasoning is in the JSON itself, add:
```javascript
// Strip any text before the first { or [
const jsonStart = cleaned.search(/[{\[]/);
if (jsonStart > 0) cleaned = cleaned.slice(jsonStart);
```

---

## Why This Works

DeepSeek-R1's reasoning is **optional** - it can be disabled via:
1. API parameter: `think: false` (already set)
2. System prompt: Explicit instruction to skip reasoning (NEW)

The combination of both should force fast-path mode where the model outputs JSON directly without internal reasoning.

---

## Alternative: Use DeepSeek-R1 Only for Complex Tasks

Keep DeepSeek-R1 for:
- ✅ Complex reasoning (DASH AI chat)
- ✅ Multi-step problem solving
- ✅ Code generation with explanation

Use a fast model for:
- ✅ Structured data extraction (syllabus parsing)
- ✅ JSON generation (CLO mapping)
- ✅ Classification tasks (email categorization)

This gives you the best of both worlds: reasoning when needed, speed when needed.
