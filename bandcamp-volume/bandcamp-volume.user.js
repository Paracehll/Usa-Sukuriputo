// ==UserScript==
// @name         Bandcamp Volume Control
// @name:zh-TW   Bandcamp 音量調整
// @name:zh-CN   Bandcamp 音量调整
// @name:ja      Bandcamp 音量コントロール
// @namespace    https://github.com/Paracehll/Usa-Sukuriputo
// @version      1.0.0
// @description  Adds a volume slider and mute button to the inline player on *.bandcamp.com (saved via GM storage, shared across subdomains).
// @description:zh-TW  為 *.bandcamp.com 的內嵌播放器加上音量滑桿與靜音按鈕（設定以 GM 儲存，跨子網域共用）
// @description:ja     *.bandcamp.com のインラインプレーヤーに音量スライダーとミュートボタンを追加します（GM ストレージに保存、サブドメイン間で共有）
// @match        *://*.bandcamp.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @downloadURL  https://raw.githubusercontent.com/Paracehll/Usa-Sukuriputo/main/bandcamp-volume/bandcamp-volume.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ========== 音量設定 ========== */
  // 使用 GM_getValue / GM_setValue 儲存：不受網頁 localStorage 影響，
  // 即使另外安裝清理腳本也不會被清掉，且各藝人子網域共用同一份設定。
  const VOL_KEY = 'bc_vol_helper_v1';
  const state = { volume: 0.8, muted: false };

  try {
    const saved = GM_getValue(VOL_KEY, null);
    if (saved && typeof saved.volume === 'number') {
      state.volume = Math.min(1, Math.max(0, saved.volume));
      state.muted = !!saved.muted;
    }
  } catch (e) {}

  function saveState() {
    try { GM_setValue(VOL_KEY, { volume: state.volume, muted: state.muted }); } catch (e) {}
  }

  /* ========== 攔截所有 <audio>（含 new Audio() 建立、不在 DOM 內的） ========== */
  const mediaSet = new Set();

  function applyTo(el) {
    try {
      el.volume = state.volume;
      el.muted = state.muted;
    } catch (e) {}
  }

  function track(el) {
    if (!el || mediaSet.has(el)) return;
    mediaSet.add(el);
    applyTo(el);
    el.addEventListener('volumechange', () => {
      if (el.volume !== state.volume || el.muted !== state.muted) applyTo(el);
    });
    el.addEventListener('play', () => applyTo(el));
    el.addEventListener('loadstart', () => applyTo(el));
  }

  function applyAll() { mediaSet.forEach(applyTo); }

  try {
    const proto = unsafeWindow.HTMLMediaElement.prototype;
    const origPlay = proto.play;
    proto.play = function () {
      track(this);
      return origPlay.apply(this, arguments);
    };
  } catch (e) {
    console.warn('[bc-vol] 無法攔截 play()', e);
  }

  function scanDom() {
    document.querySelectorAll('audio, video').forEach(track);
  }

  /* ========== UI ========== */
  const refreshers = new Set();

  function ensureStyle() {
    if (document.getElementById('bc-vol-style')) return;
    const style = document.createElement('style');
    style.id = 'bc-vol-style';
    style.textContent = `
      .bc-vol-row td{padding:0;border:0}
      .bc-vol-cell{padding-top:6px !important}
      .bc-vol{display:flex;align-items:center;gap:8px;user-select:none}
      .bc-vol-mute{all:unset;cursor:pointer;display:flex;width:18px;height:18px;
        align-items:center;justify-content:center;color:var(--bc-vol-icon,currentColor);opacity:.85}
      .bc-vol-mute:hover{opacity:1}
      .bc-vol-mute:focus-visible{outline:1px solid currentColor}
      .bc-vol-mute svg{width:18px;height:18px;fill:currentColor}
      .bc-vol-slider{position:relative;flex:1 1 auto;height:var(--bc-vol-h,6px);
        background:var(--bc-vol-empty,#ddd);border:var(--bc-vol-empty-border,0);
        border-radius:var(--bc-vol-radius,0);cursor:pointer;touch-action:none;box-sizing:border-box}
      .bc-vol-slider::before{content:"";position:absolute;left:0;right:0;top:-8px;bottom:-8px}
      .bc-vol-slider:focus-visible{outline:1px solid var(--bc-vol-fill,currentColor);outline-offset:3px}
      .bc-vol-fill{position:absolute;left:0;top:0;bottom:0;background:var(--bc-vol-fill,#0687f5);
        border-radius:inherit;pointer-events:none}
      .bc-vol-thumb{position:absolute;top:50%;width:var(--bc-vol-thumb,14px);height:var(--bc-vol-thumb,14px);
        margin:calc(var(--bc-vol-thumb,14px) / -2) 0 0 calc(var(--bc-vol-thumb,14px) / -2);
        background:var(--bc-vol-thumb-bg,#fff);border:var(--bc-vol-thumb-border,1px solid #999);
        border-radius:50%;box-sizing:border-box;pointer-events:none}
      .bc-vol-num{min-width:3.2em;text-align:right;font-size:inherit}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // 從頁面現有的進度條取得顏色與尺寸，讓樣式一致
  function readTheme(player) {
    const css = {};
    const empty = player.querySelector('.progbar_empty');
    const fill = player.querySelector('.progbar_fill');
    const thumb = player.querySelector('.thumb');
    try {
      if (empty) {
        const s = getComputedStyle(empty);
        css['--bc-vol-empty'] = s.backgroundColor;
        css['--bc-vol-radius'] = s.borderRadius;
        if (s.borderTopWidth !== '0px') css['--bc-vol-empty-border'] = `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`;
        const h = empty.getBoundingClientRect().height;
        if (h > 0) css['--bc-vol-h'] = h + 'px';
      }
      if (fill) css['--bc-vol-fill'] = getComputedStyle(fill).backgroundColor;
      if (thumb) {
        const s = getComputedStyle(thumb);
        const w = thumb.getBoundingClientRect().width;
        if (w > 0) css['--bc-vol-thumb'] = w + 'px';
        if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') css['--bc-vol-thumb-bg'] = s.backgroundColor;
        if (s.borderTopWidth !== '0px') css['--bc-vol-thumb-border'] = `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`;
      }
    } catch (e) {}
    return css;
  }

  const ICON = {
    high: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>',
    low: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>'
  };

  function createVolumeRow(player) {
    const tr = document.createElement('tr');
    tr.className = 'bc-vol-row';
    tr.innerHTML = `
      <td class="bc-vol-cell" colspan="4">
        <div class="bc-vol secondaryText">
          <button type="button" class="bc-vol-mute" aria-label="Mute" title="靜音"></button>
          <div class="bc-vol-slider" role="slider" tabindex="0" aria-label="Volume"
               aria-valuemin="0" aria-valuemax="100" title="音量（可用滾輪調整）">
            <div class="bc-vol-fill"></div>
            <div class="bc-vol-thumb"></div>
          </div>
          <span class="bc-vol-num secondaryText"></span>
        </div>
      </td>`;

    const theme = readTheme(player);
    Object.entries(theme).forEach(([k, v]) => tr.style.setProperty(k, v));

    const muteBtn = tr.querySelector('.bc-vol-mute');
    const slider = tr.querySelector('.bc-vol-slider');
    const fill = tr.querySelector('.bc-vol-fill');
    const thumb = tr.querySelector('.bc-vol-thumb');
    const num = tr.querySelector('.bc-vol-num');

    function refresh() {
      const pct = state.muted ? 0 : Math.round(state.volume * 100);
      fill.style.width = pct + '%';
      thumb.style.left = pct + '%';
      slider.setAttribute('aria-valuenow', String(pct));
      num.textContent = state.muted ? 'mute' : pct + '%';
      muteBtn.innerHTML = state.muted || state.volume === 0 ? ICON.mute : state.volume < 0.5 ? ICON.low : ICON.high;
    }
    refresh();
    refreshers.add(refresh);

    function commit(v) {
      state.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
      state.muted = state.volume === 0 ? state.muted : false;
      saveState(); applyAll(); refreshers.forEach(f => f());
    }

    function fromPointer(e) {
      const r = slider.getBoundingClientRect();
      commit((e.clientX - r.left) / r.width);
    }

    slider.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      slider.setPointerCapture(e.pointerId);
      fromPointer(e);
      const move = ev => fromPointer(ev);
      const up = ev => {
        slider.removeEventListener('pointermove', move);
        slider.removeEventListener('pointerup', up);
        slider.removeEventListener('pointercancel', up);
        try { slider.releasePointerCapture(ev.pointerId); } catch (x) {}
      };
      slider.addEventListener('pointermove', move);
      slider.addEventListener('pointerup', up);
      slider.addEventListener('pointercancel', up);
    });

    slider.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.05;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { commit(state.volume + step); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { commit(state.volume - step); e.preventDefault(); }
      else if (e.key === 'Home') { commit(0); e.preventDefault(); }
      else if (e.key === 'End') { commit(1); e.preventDefault(); }
    });

    tr.addEventListener('wheel', e => {
      e.preventDefault();
      commit(state.volume + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });

    muteBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      state.muted = !state.muted;
      saveState(); applyAll(); refreshers.forEach(f => f());
    });

    return tr;
  }

  function injectVolumeUI() {
    ensureStyle();
    document.querySelectorAll('.inline_player').forEach(player => {
      if (player.querySelector('.bc-vol-row')) return;
      const tbody = player.querySelector('table > tbody') || player.querySelector('table');
      if (!tbody) return;
      tbody.appendChild(createVolumeRow(player));
    });
  }

  /* ========== 監看 DOM ========== */
  function onMutate() {
    scanDom();
    injectVolumeUI();
  }

  new MutationObserver(onMutate).observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onMutate);
  } else {
    onMutate();
  }

  window.addEventListener('load', onMutate);
  let ticks = 0;
  const timer = setInterval(() => {
    onMutate();
    if (++ticks >= 120) clearInterval(timer); // 60 秒
  }, 500);
})();