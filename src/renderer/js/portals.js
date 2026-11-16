/**
 * portals.js — Quick Portal Module Renderer Logic
 */

'use strict';

const PortalsModule = (() => {

  function init() {
    setupListeners();
  }

  function setupListeners() {
    const btnDiu = document.getElementById('btn-portal-diu');
    const btnBlc = document.getElementById('btn-portal-blc');
    const webDiu = document.getElementById('webview-diu');
    const webBlc = document.getElementById('webview-blc');

    if (!btnDiu || !btnBlc) return;

    btnDiu.addEventListener('click', () => {
      btnDiu.className = 'btn-primary small';
      btnBlc.className = 'btn-ghost small';
      webDiu.classList.remove('hidden');
      webBlc.classList.add('hidden');
    });

    btnBlc.addEventListener('click', () => {
      btnBlc.className = 'btn-primary small';
      btnDiu.className = 'btn-ghost small';
      webBlc.classList.remove('hidden');
      webDiu.classList.add('hidden');
    });
  }

  return { init };
})();

// Auto-init 
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'portal') PortalsModule.init();
  });
});
