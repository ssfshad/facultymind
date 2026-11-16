const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, narrow API to the renderer via window.api
contextBridge.exposeInMainWorld('api', {

  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },

  // Auth
  auth: {
    isFirstLaunch:     ()       => ipcRenderer.invoke('auth:is-first-launch'),
    setupPin:          (pin, currentPin) => ipcRenderer.invoke('auth:setup-pin', pin, currentPin),
    verifyPin:         (pin)    => ipcRenderer.invoke('auth:verify-pin', pin),
    verifyActivePin:   (pin)    => ipcRenderer.invoke('auth:verify-active-pin', pin),
    session:           ()       => ipcRenderer.invoke('auth:session'),
    resetSessionTimer: ()       => ipcRenderer.send('auth:reset-session-timer'),
  },

  // API keys
  keys: {
    save:     (service, key) => ipcRenderer.invoke('keys:save', { service, key }),
    get:      (service)      => ipcRenderer.invoke('keys:get', service),
    checkAll: ()             => ipcRenderer.invoke('keys:check-all'),
  },

  // AI
  ai: {
    send:               (message, context, options) => ipcRenderer.invoke('ai:send', { message, context, options }),
    switchModel:        (model)   => ipcRenderer.invoke('ai:model-switch', model),
    getActiveModel:     ()        => ipcRenderer.invoke('ai:get-active-model'),
    setOpenRouterModel: (modelId) => ipcRenderer.invoke('ai:set-openrouter-model', modelId),
    getOpenRouterModel: ()        => ipcRenderer.invoke('ai:get-openrouter-model'),
    setOllamaModel:     (modelId) => ipcRenderer.invoke('ai:set-ollama-model', modelId),
    getOllamaModel:     ()        => ipcRenderer.invoke('ai:get-ollama-model'),
    checkOllama:        ()        => ipcRenderer.invoke('ai:check-ollama'),
    smartRoute:         (buffer, mimeType, fileName) => ipcRenderer.invoke('ai:smart-route', buffer, mimeType, fileName),
    onProactive:        (cb)      => ipcRenderer.on('ai:proactive', (_, payload) => cb(payload)),
    onModelChanged:     (cb)      => ipcRenderer.on('ai:model-changed', (_, model) => cb(model)),
    onNavigate:         (cb)      => ipcRenderer.on('ai:navigate', (_, route) => cb(route)),
  },

  // Cortex — live intelligence layer
  cortex: {
    log:          (eventType, mod, payload) => ipcRenderer.send('cortex:log', { eventType, module: mod, payload }),
    getRules:     ()          => ipcRenderer.invoke('cortex:get-rules'),
    addRule:      (opts)      => ipcRenderer.invoke('cortex:add-rule', opts),
    deleteRule:   (id)        => ipcRenderer.invoke('cortex:delete-rule', id),
    getThoughts:  ()          => ipcRenderer.invoke('cortex:get-thoughts'),
    setProactive: (enabled)   => ipcRenderer.invoke('cortex:set-proactive', enabled),
    getState:     ()          => ipcRenderer.invoke('cortex:get-state'),
    navLog:       (view)      => ipcRenderer.send(`nav:${view}:visited`, { view }),
  },

  // Voice
  voice: {
    transcribe: (audioBuffer) => ipcRenderer.invoke('voice:transcribe', audioBuffer),
  },

  // Schedule
  schedule: {
    get:    ()      => ipcRenderer.invoke('schedule:get'),
    save:   (entry) => ipcRenderer.invoke('schedule:save', entry),
    delete: (id)    => ipcRenderer.invoke('schedule:delete', id),
  },

  // Lesson log
  lessonLog: {
    get:  (courseId) => ipcRenderer.invoke('lesson-log:get', courseId),
    save: (entry)    => ipcRenderer.invoke('lesson-log:save', entry),
  },

  // Database
  db: {
    export: (opts) => ipcRenderer.invoke('db:export', opts),
    import: (opts) => ipcRenderer.invoke('db:import', opts),
  },

  // Student data key (recovery file, status)
  studentKey: {
    status:       ()           => ipcRenderer.invoke('student-key:status'),
    saveRecovery: (passphrase) => ipcRenderer.invoke('student-key:save-recovery', { passphrase }),
    restore:      (passphrase) => ipcRenderer.invoke('student-key:restore', { passphrase }),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
  },

  // Blooms
  blooms: {
    generate:        (pdfBuffer, courseCode, mimeType) => ipcRenderer.invoke('blooms:generate', { pdfBuffer, courseCode, mimeType }),
    mapCLOs:         (text, buffer, mimeType, courseCode) => ipcRenderer.invoke('blooms:map-clos', { text, buffer, mimeType, courseCode }),
    exportPdf:       (html) => ipcRenderer.invoke('blooms:export-pdf', html),
    analyzeSyllabus:       (buffer, mimeType) => ipcRenderer.invoke('blooms:analyze-syllabus', { buffer, mimeType }),
    analyzeSyllabusManual: (cosText, weeksText) => ipcRenderer.invoke('blooms:analyze-syllabus-manual', { cosText, weeksText }),
    onOcrProgress:      (cb) => ipcRenderer.on('blooms:ocr-progress',      (_, data) => cb(data)),
    onCloProgress:      (cb) => ipcRenderer.on('blooms:clo-progress',      (_, data) => cb(data)),
    onSyllabusProgress: (cb) => ipcRenderer.on('blooms:syllabus-progress', (_, data) => cb(data)),
  },

  // Email Intel
  email: {
    authenticate:    () => ipcRenderer.invoke('email:authenticate'),
    fetch:           () => ipcRenderer.invoke('email:fetch'),
    profile:         () => ipcRenderer.invoke('email:profile'),
    refresh:         () => ipcRenderer.invoke('email:refresh'),
    signout:         () => ipcRenderer.invoke('email:signout'),
    onInboxUpdate:   (cb) => ipcRenderer.on('email:inbox-update', (_, data) => cb(data)),
    onNewCount:      (cb) => ipcRenderer.on('email:new-count',    (_, data) => cb(data)),
  },

  // ShadSync
  shadsync: {
    data:           (courseCode) => ipcRenderer.invoke('shadsync:data', courseCode),
    attainment:     (courseCode) => ipcRenderer.invoke('shadsync:attainment', courseCode),
    saveStudent:    (p) => ipcRenderer.invoke('shadsync:saveStudent', p),
    saveMarks:      (p) => ipcRenderer.invoke('shadsync:saveMarks', p),
    saveAttendance: (p) => ipcRenderer.invoke('shadsync:saveAttendance', p),
    saveClo:        (p) => ipcRenderer.invoke('shadsync:saveClo', p),
    saveCo:         (p) => ipcRenderer.invoke('shadsync:saveCo', p),
    savePo:         (p) => ipcRenderer.invoke('shadsync:savePo', p),
    importMarksSheet: (p) => ipcRenderer.invoke('shadsync:import-marks-sheet', p),
    exportPdf:      (html) => ipcRenderer.invoke('shadsync:export-pdf', html),
  },

  // DIU Teachers Portal
  diu: {
    courses:        ()             => ipcRenderer.invoke('diu:courses'),
    students:       (courseId)     => ipcRenderer.invoke('diu:students', courseId),
    saveMarks:      (payload)      => ipcRenderer.invoke('diu:saveMarks', payload),
    saveCourse:     (course)       => ipcRenderer.invoke('diu:saveCourse', course),
    attendance:     (courseId)     => ipcRenderer.invoke('diu:attendance', courseId),
    saveAttendance: (payload)      => ipcRenderer.invoke('diu:saveAttendance', payload),
  },

  // Vault
  vault: {
    get:      () => ipcRenderer.invoke('vault:get'),
    save:     (record) => ipcRenderer.invoke('vault:save', record),
    decrypt:  (enc) => ipcRenderer.invoke('vault:decrypt', enc),
    delete:   (id) => ipcRenderer.invoke('vault:delete', id),
    favorite: (id, isFavorite) => ipcRenderer.invoke('vault:favorite', { id, isFavorite }),
    getPath:    () => ipcRenderer.invoke('vault:get-path'),
    changePath: () => ipcRenderer.invoke('vault:change-path'),
    resetPath:  () => ipcRenderer.invoke('vault:reset-path'),
  },

  // Desktop notifications
  notify: {
    send: (title, body, sound = true) => ipcRenderer.invoke('notify:send', { title, body, sound }),
  },

  // CLO Knowledge Base
  cloKb: {    importImages: (imageBuffers, mimeTypes, courseCode) => ipcRenderer.invoke('clo-kb:import-images', { imageBuffers, mimeTypes, courseCode }),
    saveBatch:      (records, courseCode) => ipcRenderer.invoke('clo-kb:save-batch', { records, courseCode }),
    get:            (courseCode) => ipcRenderer.invoke('clo-kb:get', { courseCode }),
    verify:         (id) => ipcRenderer.invoke('clo-kb:verify', id),
    unverify:       (id) => ipcRenderer.invoke('clo-kb:unverify', id),
    delete:         (id) => ipcRenderer.invoke('clo-kb:delete', id),
    stats:          ()   => ipcRenderer.invoke('clo-kb:stats'),
    scanFolder:     ()   => ipcRenderer.invoke('clo-kb:scan-folder'),
    onProgress:     (cb) => ipcRenderer.on('clo-kb:progress', (_, data) => cb(data)),
    verifyAll:      (courseCode) => ipcRenderer.invoke('clo-kb:verify-all', { courseCode }),
    deleteAll:      (courseCode) => ipcRenderer.invoke('clo-kb:delete-all', { courseCode }),
    // Poison prevention — call before saving a manual level override
    checkConflict:  (rootVerb, bloomLevel) => ipcRenderer.invoke('clo-kb:check-conflict', { rootVerb, bloomLevel }),
  },
});
