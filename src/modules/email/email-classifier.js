const CATEGORY_SYSTEM_PROMPT = `You are an email triage assistant for a university professor in Bangladesh (Daffodil International University).
Classify each email into EXACTLY one category. Be strict — do not default to Personal when another category fits better.

CATEGORY RULES (read carefully):

"Students"
→ Any email from a student. Signs: student email addresses (@diu.edu.bd, @std.diu.edu.bd, @s.diu.edu.bd, gmail with student names), mentions of marks/grades/assignments/submission/exam/result/course/teacher/sir/ma'am, requests for help with coursework, attendance queries, permission requests.
→ Examples: "Sir can I get an extension?", "My assignment marks were wrong", "I missed class today"

"Work"
→ Professional/institutional emails. Signs: from university admin, department heads, colleagues, official notices, meeting invitations, policy updates, DIU official email (@daffodilvarsity.edu.bd, @diu.edu.bd from staff), research collaboration, conference invitations, journal submissions.
→ Examples: "Faculty meeting this Thursday", "Please submit your course outline", "Research grant opportunity"

"OTP"
→ ONLY one-time passwords and login verification codes. Signs: "OTP", "verification code", "your code is", "security code", "two-factor authentication", "login attempt detected".
→ Examples: "Your OTP is 482910", "Verify your email with code 7823"
→ NOT for payment confirmations or bank alerts — those are "Payments"

"Payments"
→ Anything related to money, banking, transactions, bills, subscriptions. Signs: payment received/sent, transaction alert, bill due, invoice, card usage, bank statement, debit/credit alert, bKash, Nagad, Rocket, mobile banking, utility bill, recharge.
→ Examples: "Your card was charged BDT 500", "Payment received from...", "Invoice #1234 due", "bKash transaction successful", "Your electricity bill is due", "Subscription renewal", "Bank statement"

"Advertisement"
→ Promotional, marketing, newsletters, sales, offers. Signs: "unsubscribe", "offer", "discount", "deal", "shop now", "sale", "newsletter", "promotional", no direct personal addressing.
→ Examples: Marketing emails, LinkedIn notifications, app promotions, news digests

"Personal"
→ ONLY use this when none of the above fit. True personal emails from friends/family with no academic/work/OTP/promo content.

PRIORITY RULES:
- "HIGH": Dean/admin requiring action, urgent deadlines, student in distress, exam irregularities
- "NORMAL": Standard work emails, student queries, routine communication
- "LOW": Newsletters, FYI-only emails, automatic notifications

Valid categories are: "Students", "Work", "OTP", "Advertisement", "Payments", "Personal"

Respond ONLY with a valid JSON array. No markdown. No explanation. No \`\`\`json wrapper.
Schema: [{"id":"...","category":"...","priority":"...","summary":"..."}]`;

/**
 * Perform batch AI classification on an array of raw emails.
 */
const BATCH_SIZE = 10; // classify in chunks so model doesn't lose focus

async function classifyBatch(aiRouter, emails, apiKey, activeModel) {
  if (!emails || emails.length === 0) return [];

  const results = [];

  // Process in chunks
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const classified = await classifyChunk(aiRouter, chunk, apiKey, activeModel);
    results.push(...classified);
  }

  return results;
}

async function classifyChunk(aiRouter, emails, apiKey, activeModel) {
  const batchList = emails.map(e => {
    const body = e.body || e.snippet || '';
    return `ID: ${e.id}\nFrom: ${e.from_name} <${e.from_email}>\nSubject: ${e.subject}\nBody: ${body}`;
  }).join('\n\n---\n\n');

  try {
    // Student emails carry names/IDs: local model only (S2 local-only policy)
    const response = await aiRouter.send(batchList, {}, {
      apiKey,
      model: activeModel,
      localOnly: true,
      systemPrompt: CATEGORY_SYSTEM_PROMPT,
      maxTokens: 1200,
    });

    let parsed = [];
    try {
      const clean = response.text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) parsed = [];
    } catch (err) {
      console.error('[EmailClassifier] Parse error:', err.message, '| Raw:', response.text.slice(0, 200));
      return emails.map(e => ({ ...e, ai_category: 'Unread', ai_priority: 'NORMAL', ai_summary: e.snippet || '' }));
    }

    return emails.map(e => {
      const r = parsed.find(p => p.id === e.id);
      return {
        ...e,
        ai_category: r?.category  || 'Personal',
        ai_priority: r?.priority  || 'NORMAL',
        ai_summary:  r?.summary   || e.snippet || '',
      };
    });

  } catch (err) {
    console.error('[EmailClassifier] Router error:', err.message);
    return emails.map(e => ({ ...e, ai_category: 'Personal', ai_priority: 'NORMAL', ai_summary: e.snippet || '' }));
  }
}

module.exports = {
  classifyBatch
};
