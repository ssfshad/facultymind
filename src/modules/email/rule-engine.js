const db = require('../../database/db');

const RULE_PARSER_PROMPT = `You are converting a professor's natural language email filter instruction into a structured JSON filter rule object to control desktop notifications.

Available categories: Personal, Work, Students, OTP, Advertisement
HIGH priority emails always fire notifications regardless of rules unless explicitly blocked.

Respond ONLY with valid JSON.
Schema:
{
  "snooze_categories": ["Personal", ...],
  "allow_categories": ["Work", ...],
  "specific_senders_allow": ["email@domain.com", ...],
  "specific_senders_snooze": ["email@domain.com", ...],
  "duration_hours": number,
  "vip_request": {
     "is_vip_request": boolean,
     "email": "string",
     "name": "string"
  }
}`;

async function parseAndAddRule(aiRouter, instruction, apiKey, activeModel) {
  try {
    const response = await aiRouter.send(instruction, { role: 'system', content: RULE_PARSER_PROMPT }, { apiKey, model: activeModel, temperature: 0.1 });
    const cleanString = response.text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanString);

    // If it's a VIP request, insert to vip_senders
    if (parsed.vip_request && parsed.vip_request.is_vip_request && parsed.vip_request.email) {
      db.prepare(`INSERT OR IGNORE INTO vip_senders (email, name) VALUES (?, ?)`).run(parsed.vip_request.email, parsed.vip_request.name || 'VIP');
      return `Added ${parsed.vip_request.email} to VIP list.`;
    }

    // Otherwise, it's an email rule
    let expiresAt = null;
    if (parsed.duration_hours) {
      const d = new Date();
      d.setHours(d.getHours() + parsed.duration_hours);
      expiresAt = d.toISOString();
    }

    db.prepare(`INSERT INTO email_rules (rule_json, active, expires_at) VALUES (?, 1, ?)`).run(JSON.stringify(parsed), expiresAt);
    return `Notification rule saved! Suppressing: ${parsed.snooze_categories?.join(', ') || 'none'}.`;

  } catch(e) {
    console.error("[RuleEngine] Parse Error:", e.message);
    return `Sorry, I couldn't understand that email rule.`;
  }
}

function getActiveRules() {
  const stmt = db.prepare(`SELECT * FROM email_rules WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`);
  return stmt.all().map(r => JSON.parse(r.rule_json));
}

function isVip(email) {
  const stmt = db.prepare(`SELECT 1 FROM vip_senders WHERE email = ?`);
  return !!stmt.get(email);
}

module.exports = {
  parseAndAddRule,
  getActiveRules,
  isVip
};
