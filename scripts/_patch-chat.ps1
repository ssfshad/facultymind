$chatPath = "D:\facultymind\src\renderer\js\chat.js"
$backupPath = "D:\facultymind\src\renderer\js\chat.js.bak"

# Backup first
Copy-Item -LiteralPath $chatPath -Destination $backupPath -Force

# Read existing file
$existing = [System.IO.File]::ReadAllText($chatPath, [System.Text.Encoding]::UTF8)

# Insert the chatSync block right before "const ChatModule = (() => {"
$insertBefore = "const ChatModule = (() => {"
$chatSyncBlock = @"
// -- Shared Render Layer -------------------------------------------------------
// Renders messages to BOTH the static DASH chat AND the floating chat,
// so the conversation is always visually in sync across both UIs.
if (!window.chatSync) {
  const _csStatic  = document.getElementById('chat-messages');
  const _csFloat   = document.getElementById('fc-messages');

  function _csEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _csMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>`$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>`$1</em>')
      .replace(/^• (.+)$/gm, '<span style="display:block;padding-left:12px">• `$1</span>')
      .replace(/\n/g, '<br>');
  }
  function _csScroll(el) { if (el) el.scrollTop = el.scrollHeight; }

  window.chatSync = {
    appendUserMsg(text) {
      const esc = _csEsc(text);
      const ts = Date.now();
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg user" id="su-` + ts + `"><div class="msg-avatar">You</div><div class="msg-bubble">' + esc + '</div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-user" id="suf-` + ts + `"><div class="fc-bubble-user">' + esc + '</div></div>');
        _csScroll(_csFloat);
      }
    },
    appendAiMsg(text) {
      const html = _csMd(_csEsc(text));
      const ts = Date.now() + '-' + Math.random().toString(36).slice(2,7);
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg ai" id="sa-` + ts + `"><div class="msg-avatar">D</div><div class="msg-bubble">' + html + '</div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-ai" id="saf-` + ts + `"><div class="fc-avatar-sm">D</div><div class="fc-bubble-ai">' + html + '</div></div>');
        _csScroll(_csFloat);
      }
    },
    appendThinking(label) {
      const id = 'sth-' + Date.now();
      const lbl = _csEsc(label || 'Thinking\u2026');
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg ai msg-thinking" id="' + id + '-s"><div class="msg-avatar">D</div><div class="msg-bubble"><span>' + lbl + '</span><span class="typing-dots"><span></span><span></span><span></span></span></div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-ai" id="' + id + '-f"><div class="fc-avatar-sm">D</div><div class="fc-bubble-ai fc-thinking"><span></span><span></span><span></span></div></div>');
        _csScroll(_csFloat);
      }
      return id;
    },
    removeThinking(id) {
      document.getElementById(id + '-s')?.remove();
      document.getElementById(id + '-f')?.remove();
    },
    escHtml: _csEsc,
    fmtMd: _csMd,
  };
}

"@

$newContent = $existing.Replace($insertBefore, $chatSyncBlock + "`n" + $insertBefore)
[System.IO.File]::WriteAllText($chatPath, $newContent, (New-Object System.Text.UTF8Encoding $false))
Write-Output "chat.js updated: $((Get-Item $chatPath).Length) bytes"
