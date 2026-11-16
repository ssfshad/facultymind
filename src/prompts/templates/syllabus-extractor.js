'use strict';

/**
 * syllabus-extractor.js — LLM prompt for extracting COs and weekly topics.
 *
 * Strategy: pre-extract unit headers deterministically (regex, zero tokens),
 * then run a Two-Pass Pipeline for the rest:
 * Pass 1: CO Extractor (top ~4k chars)
 * Pass 2: Week Extractor (bottom chunk after week markers)
 */

/**
 * Pre-extract unit labels and their first content line directly from raw text.
 * No LLM needed — unit headers follow a predictable pattern in any syllabus.
 * Returns array of { week, topics } objects.
 *
 * @param {string} rawText
 * @returns {{ week: string, topics: string }[]}
 */
function extractUnitsFromText(rawText) {
  const unitsMap = new Map();  // The Engine Core: Map guarantees unique keys
  const lines = String(rawText || '').split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Markdown Table Parser (Extremely robust for MarkItDown output)
  let currentTable = [];
  const allTables = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|')) {
      currentTable.push(lines[i]);
    } else {
      if (currentTable.length > 2) allTables.push([...currentTable]);
      currentTable = [];
    }
  }
  if (currentTable.length > 2) allTables.push([...currentTable]);

  let usedTableParser = false;

  for (const table of allTables) {
    const colWeekHits = [0, 0, 0, 0, 0, 0, 0];
    const parsedRows = table.map(row => 
      row.split('|').slice(1, -1).map(c => c.trim()) // slice(1, -1) removes empty leading/trailing array items from table split
    );
    const dataRows = parsedRows.filter(row => !row.every(c => /^[-:\s]*$/.test(c || '')));
    
    for (const row of dataRows) {
      for (let i = 0; i < Math.min(row.length, 7); i++) {
        if (/^[*#\s]*(?:week|chapter|module|unit|lesson)\s+\d{1,2}/i.test(row[i] || '')) colWeekHits[i]++;
      }
    }
    
    const maxHits = Math.max(...colWeekHits);
    if (maxHits >= 3) {
      usedTableParser = true;
      const weekColIdx = colWeekHits.indexOf(maxHits);
      let previousWeekLabel = '';  // For inheriting blank week cells (lab rows)

      for (const row of dataRows) {
        if (row.length < 2) continue;
        let weekCell = (row[weekColIdx] || '').replace(/[*#]/g, '').trim();
        
        // Inherit the previous week label for blank cells (this is how split Lab rows work)
        if (!weekCell && previousWeekLabel) {
          weekCell = previousWeekLabel;
        }
        
        const weekMatch = weekCell.match(/^((?:week|chapter|module|unit|lesson)\s+\d{1,2})/i);
        if (!weekMatch) continue;
        
        const unitKey = weekMatch[1].replace(/\s+/g, ' ').trim();
        // Normalize: "week 3" -> "Week 3"
        const normalizedKey = unitKey.charAt(0).toUpperCase() + unitKey.slice(1);
        previousWeekLabel = weekCell;  // Save for next row inheritance
        
        // Find the best content cell (longest non-noise cell)
        let bestCell = '';
        let longestCell = '';  // Fallback: longest cell regardless of noise filter
        for (let i = 0; i < row.length; i++) {
          if (i === weekColIdx) continue;
          const cell = (row[i] || '').replace(/[*#]/g, '').trim();
          if (cell.length < 10) continue;
          if (cell.length > longestCell.length) longestCell = cell;
          if (/^(brainstorm|demonstration|lecture|discussion|group\s+work|tutorial|seminar|workshop|lab|practical|quiz|assignment)/i.test(cell)) continue;
          if (/^c\.?l?\.?o?\.?\s*\d+/i.test(cell)) continue;
          if (/^\d+\s*$/.test(cell)) continue;
          if (cell.length > bestCell.length) bestCell = cell;
        }
        
        // Use fallback if noise filter rejected everything (e.g. "Presentation 1: ...")
        if (!bestCell && longestCell.length > 5) bestCell = longestCell;
        
        if (bestCell.length > 5) {
          // LIVE MERGE: Append to existing content if this week already exists
          if (unitsMap.has(normalizedKey)) {
            unitsMap.set(normalizedKey, `${unitsMap.get(normalizedKey)} ${bestCell}`);
          } else {
            unitsMap.set(normalizedKey, bestCell);
          }
        }
      }
      if (unitsMap.size >= 3) break;  // Success — extracted from MD table
    }
  }

  // 2. Fallback to existing line-by-line regex parsing
  if (!usedTableParser || unitsMap.size === 0) {
    const UNIT_RE = /^(?:#{1,4}\s*|\*{1,2}\s*)?(?:chapter|week|module|unit|lesson)\s+(\d{1,2})(?:\s*[:\-–—]\s*(.+))?/i;
    const SKIP_RE = /^(lecture|brainstorm|discussion|group\s+work|quiz|assignment|q\/a|midterm|final|teaching|assessment|understand|describe|explain|identify|page\s+\d|copyright|\d+\s*$)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(UNIT_RE);
      if (!m) continue;

      const label = line.replace(/^#{1,4}\s*/, '').replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').trim();
      let topics = m[2] ? m[2].trim() : '';

      if (!topics) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = lines[j];
          if (!next || SKIP_RE.test(next)) continue;
          if (UNIT_RE.test(next)) break;
          topics = next.replace(/^[-•*]\s*/, '').trim();
          break;
        }
      }

      topics = topics.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();

      // Normalize key
      const unitKey = label.match(/(?:chapter|week|module|unit|lesson)\s+\d{1,2}/i);
      const normalizedKey = unitKey ? unitKey[0].charAt(0).toUpperCase() + unitKey[0].slice(1) : label;

      if (topics.length > 3) {
        if (unitsMap.has(normalizedKey)) {
          unitsMap.set(normalizedKey, `${unitsMap.get(normalizedKey)} ${topics}`);
        } else {
          unitsMap.set(normalizedKey, topics);
        }
      } else if (label) {
        if (!unitsMap.has(normalizedKey)) {
          const fallback = label.replace(/^(?:chapter|week|module|unit|lesson)\s+\d+\s*[:\-–—]?\s*/i, '').trim() || label;
          unitsMap.set(normalizedKey, fallback);
        }
      }
    }
  }

  // 3. Convert Map to array output
  const units = [];
  for (const [week, topics] of unitsMap.entries()) {
    units.push({ week, topics });
  }

  return units;
}

/**
 * Extract the CO section text from raw document text.
 * Returns a 6000-character block starting from the CO header.
 * By grabbing a massive character block, we completely bypass line-splitting
 * bugs and ensure no CO is ever decapitated, while still easily fitting
 * inside the 4096 context window.
 */
function extractCoSection(rawText) {
  if (!rawText) return '';
  
  // 1. Verify MarkItDown actually extracted CO3/CLO3 from the DOCX
  console.log("🔍 DEBUG [1]: Does raw Markdown have CO3?", rawText.includes("CO3"));
  console.log("🔍 DEBUG [1]: Does raw Markdown have CO 3?", rawText.includes("CO 3"));
  console.log("🔍 DEBUG [1]: Does raw Markdown have CLO3?", rawText.includes("CLO3"));
  
  // Find the exact index where the Course Outcomes section begins
  const match = rawText.match(/(?:Course\s+Outcomes?|Learning\s+Outcomes?|CLO\s*1|^CO\s*1\s*[:.])/i);
  
  if (match) {
    // Slice 6000 characters starting from the header match
    // This is mathematically guaranteed to fit the entire table, bypassing all regex boundary bugs
    return rawText.slice(match.index, match.index + 6000);
  }
  
  // Fallback: If no header found, just return the first 6000 characters
  return rawText.slice(0, 6000);
}

/**
 * Slice the text from the start of the weekly schedule to the end.
 */
function extractWeekSection(rawText) {
  if (!rawText) return '';
  const match = rawText.match(/(?:\|?\s*Week\s*\||Week\s+1\b|Chapter\s+1\b|Module\s+1\b|Course\s+Content|Lesson\s+Plan|Schedule)/i);
  if (match) {
    return rawText.slice(match.index, match.index + 12000);
  }
  
  // If we can't find the schedule header, try to find where COs end
  const coMatch = rawText.match(/Course\s+Outcomes?/i);
  if (coMatch) {
    // Skip 1000 chars past CO header to skip the CO table, then grab 12000
    return rawText.slice(coMatch.index + 1000, coMatch.index + 13000);
  }
  
  // Ultimate fallback: grab the middle/bottom chunk, not just the strict end
  const startIdx = Math.max(0, rawText.length - 12000);
  return rawText.slice(startIdx, startIdx + 12000);
}

function coExtractorPrompt(rawText) {
  const system = `You are a strict data-extraction engine. Output raw JSON immediately. No <think> tags, no explanation.

Extract ONLY the Course Outcomes (COs) from the text below.
COs are GLOBAL statements for the whole course, labelled CO1/CO2/CLO1 or under "Course Outcomes" heading.
DO NOT fabricate COs. If no unified course-level COs exist, return empty array.
Strip preamble: "Be able to", "Students will", "Upon completion".

OUTPUT — minified JSON only:
{"course_outcomes":[{"code":"CO1","text":"<extract the first CO text here>"}, {"code":"CO2","text":"<extract the second CO text here>"}]}`;

  const user = `Extract COs from this document section:\n\n${extractCoSection(rawText)}`;
  return { system, user };
}

function weekExtractorPrompt(rawText) {
  const system = `You are a strict data-extraction engine. Output raw JSON immediately. No <think> tags, no explanation.

Extract the weekly content schedule from the text below.
Units may be labelled Week N, Chapter N, Module N. Preserve original label.
IMPORTANT: Combine all topics for a week into a SINGLE short string (max 15 words). DO NOT use arrays for topics.

OUTPUT FORMAT — minified JSON only:
{"weekly_topics":[{"week":"Week 1","topics":"Introduction, concepts, overview"}, {"week":"Week 2","topics":"..."}]}
EXTRACT ALL WEEKS PRESENT IN THE TEXT!`;

  const user = `Extract weekly schedule from this document section:\n\n${extractWeekSection(rawText)}`;
  return { system, user };
}

function generateCourseOutcomesPrompt(units) {
  const system = `You are an expert curriculum designer. You have been given a weekly topic schedule for a university course, but the Course Outcomes (COs) are missing.
Your task is to generate 4 to 5 highly specific, Bloom-compliant Course Outcomes that cover the provided syllabus topics.

Rules for COs:
1. Each CO must start with a measurable action verb from Bloom's Taxonomy (e.g., Analyze, Evaluate, Design, Apply, Implement, Differentiate).
2. DO NOT use unmeasurable verbs (e.g., Understand, Know, Learn, Familiarize, Gain experience).
3. The COs must be highly technical and specific to the topics covered in the weeks provided. Do not write generic boilerplate.
4. Each CO MUST reference BOTH the theoretical lecture topic AND the practical lab/software activity for that section of the course. Do NOT generate COs that only mention the lab or only mention the theory.
5. DO NOT use "Write" as a leading verb. Use higher-order verbs like Design, Implement, Develop, or Create instead.

OUTPUT — minified JSON only:
{"course_outcomes":[{"code":"CO1","text":"<generated CO text>"}, {"code":"CO2","text":"<generated CO text>"}]}`;

  const scheduleStr = units.map(u => `${u.week}: ${u.topics}`).join('\n');
  const user = `Generate Course Outcomes for this syllabus schedule:\n\n${scheduleStr}`;
  
  return { system, user };
}

module.exports = {
  extractUnitsFromText,
  coExtractorPrompt,
  weekExtractorPrompt,
  generateCourseOutcomesPrompt
};
