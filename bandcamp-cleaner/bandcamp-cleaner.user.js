// ==UserScript==
// @name         Bandcamp Auto Cookie Cleaner
// @name:zh-TW   Bandcamp 自動清理 Cookie
// @name:zh-CN   Bandcamp 自动清理 Cookie
// @name:ja      Bandcamp Cookie 自動クリーナー
// @namespace    https://github.com/Paracehll/Usa-Sukuriputo
// @version      1.0.0
// @description  Automatically clears cookies and web storage on *.bandcamp.com, and removes the cookie consent dialog.
// @description:zh-TW  自動清理 *.bandcamp.com 的 cookie 與網頁端資料，並移除 Cookie 對話框
// @description:ja     *.bandcamp.com の Cookie とウェブストレージを自動で削除し、Cookie 同意ダイアログを除去します
// @match        *://*.bandcamp.com/*
// @run-at       document-start
// @grant        GM_cookie
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @downloadURL  https://raw.githubusercontent.com/Paracehll/Usa-Sukuriputo/main/bandcamp-cleaner/bandcamp-cleaner.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ========== 設定 ========== */
  const CFG = {
    cleanCookies: true,
    cleanLocalStorage: true,
    cleanSessionStorage: true,
    cleanIndexedDB: true,
    cacheStorage: true,
    serviceWorkers: true,
  };

  /* ========== 停用網站腳本建立的自訂元素（例如 <page-footer>） ========== */
  const BLOCKED_ELEMENTS = ['page-footer'];

  try {
    const registryProto = unsafeWindow.CustomElementRegistry.prototype;
    const origDefine = registryProto.define;
    registryProto.define = function (name, ctor, options) {
      if (BLOCKED_ELEMENTS.includes(String(name).toLowerCase())) {
        console.info('[bc-cleaner] 已停用自訂元素:', name);
        return;
      }
      return origDefine.call(this, name, ctor, options);
    };
  } catch (e) {
    console.warn('[bc-cleaner] 無法 hook customElements.define', e);
  }

  (function hideBlockedElements() {
    const style = document.createElement('style');
    style.textContent = BLOCKED_ELEMENTS.map(n => `${n}{display:none !important}`).join('');
    (document.head || document.documentElement).appendChild(style);
  })();

  /* ========== 清理 ========== */
  function hostVariants() {
    const parts = location.hostname.split('.');
    const list = [];
    for (let i = 0; i < parts.length - 1; i++) {
      const h = parts.slice(i).join('.');
      list.push(h, '.' + h);
    }
    return list;
  }

  function cleanCookiesFallback() {
    // 只能處理非 HttpOnly 的 cookie
    const names = document.cookie.split(';').map(s => s.split('=')[0].trim()).filter(Boolean);
    const paths = ['/', location.pathname.replace(/\/[^/]*$/, '') || '/'];
    for (const n of names) {
      for (const d of hostVariants()) {
        for (const p of paths) {
          document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}; domain=${d}`;
        }
      }
      document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }

  function cleanCookies() {
    cleanCookiesFallback();
    // GM_cookie 可刪除 HttpOnly cookie（需 Tampermonkey Beta/新版）
    try {
      if (typeof GM_cookie !== 'undefined' && GM_cookie.list) {
        GM_cookie.list({ url: location.href }, (cookies, err) => {
          if (err || !cookies) return;
          cookies.forEach(c => {
            GM_cookie.delete({ name: c.name, url: location.href }, () => {});
          });
        });
      }
    } catch (e) { /* 忽略 */ }
  }

  function cleanLocalStorage() {
    try { localStorage.clear(); } catch (e) {}
  }

  async function cleanIndexedDB() {
    try {
      if (!indexedDB.databases) return;
      const dbs = await indexedDB.databases();
      dbs.forEach(db => db.name && indexedDB.deleteDatabase(db.name));
    } catch (e) {}
  }

  async function cleanCaches() {
    try {
      if (!window.caches) return;
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (e) {}
  }

  async function cleanServiceWorkers() {
    try {
      if (!navigator.serviceWorker) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch (e) {}
  }

  function cleanAll() {
    if (CFG.cleanCookies) cleanCookies();
    if (CFG.cleanLocalStorage) cleanLocalStorage();
    if (CFG.cleanSessionStorage) { try { sessionStorage.clear(); } catch (e) {} }
    if (CFG.cleanIndexedDB) cleanIndexedDB();
    if (CFG.cacheStorage) cleanCaches();
    if (CFG.serviceWorkers) cleanServiceWorkers();
  }

  cleanAll(); // document-start 時先清一次

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('立即清理 Bandcamp 資料', () => {
      cleanAll();
      alert('已清理 cookie 與網頁端資料。');
    });
  }

  /* ========== 直接移除 Cookie 對話框（含遮罩）========== */
  let cookieDialogSeen = false;

  function unlockBodyScroll() {
    const b = document.body;
    if (!b || !b.classList.contains('vue-prevent-scroll')) return;
    if (document.querySelector('.dialog-container .dialog')) return;
    b.classList.remove('vue-prevent-scroll');
    b.style.removeProperty('top');
  }

  function autoDismissCookieDialog() {
    const dialogs = document.querySelectorAll('.cookie-control.dialog, .cookie-dialog-initial');
    for (const dlg of dialogs) {
      const container = dlg.closest('.dialog-container') || dlg;
      container.remove();
      cookieDialogSeen = true;
    }
    if (cookieDialogSeen) {
      document.querySelectorAll('.dialog-container > .overlay-background').forEach(ov => {
        if (!ov.parentElement.querySelector('.dialog')) ov.parentElement.remove();
      });
      unlockBodyScroll();
    }
  }

  // 在 Vue 掛載對話框前就先用 CSS 隱藏，避免畫面閃一下
  (function hideCookieDialogEarly() {
    const style = document.createElement('style');
    style.textContent = '.dialog-container:has(.cookie-control){display:none !important}';
    (document.head || document.documentElement).appendChild(style);
  })();

  function removeBlockedElements() {
    BLOCKED_ELEMENTS.forEach(n => document.querySelectorAll(n).forEach(el => el.remove()));
  }

  function onMutate() {
    removeBlockedElements();
    autoDismissCookieDialog();
  }

  new MutationObserver(onMutate).observe(document.documentElement, { childList: true, subtree: true });

  function watchBodyClass() {
    if (!document.body || watchBodyClass.done) return;
    watchBodyClass.done = true;
    new MutationObserver(() => { if (cookieDialogSeen) unlockBodyScroll(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function init() {
    watchBodyClass();
    onMutate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('load', () => { watchBodyClass(); onMutate(); });
  let ticks = 0;
  const timer = setInterval(() => {
    watchBodyClass();
    onMutate();
    if (++ticks >= 120) clearInterval(timer); // 60 秒
  }, 500);
})();