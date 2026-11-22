// ==UserScript==
// @name         音樂內嵌播放器 (YouTube / Bandcamp / SoundCloud / Spotify) — 通用版
// @name:zh-TW   音樂內嵌播放器 (YouTube / Bandcamp / SoundCloud / Spotify) — 通用版
// @name:en      Music Embed Player (YouTube / Bandcamp / SoundCloud / Spotify) — Universal
// @name:ja      音楽埋め込みプレーヤー (YouTube / Bandcamp / SoundCloud / Spotify) — 汎用版
// @namespace    https://github.com/Paracehll/Usa-Sukuriputo
// @version      1.0.0
// @description  將網頁中的 YouTube、Bandcamp、SoundCloud、Spotify 連結換成小播放器（YouTube 為隱藏的嵌入播放器，只留聲音）。透過「站點設定檔 + CSS 選擇器」匹配各網站的貼文與預覽卡片，支援 Threads、X、Instagram、Facebook、Messenger（找不到設定檔時使用通用規則）。Spotify 僅支援 30 秒試聽。
// @description:zh-TW 將網頁中的 YouTube、Bandcamp、SoundCloud、Spotify 連結換成小播放器（YouTube 為隱藏的嵌入播放器，只留聲音）。透過「站點設定檔 + CSS 選擇器」匹配各網站的貼文與預覽卡片，支援 Threads、X、Instagram、Facebook、Messenger（找不到設定檔時使用通用規則）。Spotify 僅支援 30 秒試聽。
// @description:en Replaces YouTube, Bandcamp, SoundCloud and Spotify links on web pages with a compact player (YouTube uses a hidden embedded player, audio only). Per-site profiles with CSS selectors match each site's posts and link preview cards: Threads, X, Instagram, Facebook and Messenger are covered (a generic rule is used when no profile matches). Spotify is limited to 30-second previews.
// @description:ja Webページ内の YouTube・Bandcamp・SoundCloud・Spotify のリンクを小型プレーヤーに置き換えます（YouTube は非表示の埋め込みプレーヤーで音声のみ）。サイトごとのプロファイルと CSS セレクターで投稿やリンクプレビューカードを判別し、Threads・X・Instagram・Facebook・Messenger に対応（該当するプロファイルがない場合は汎用ルールを使用）。Spotify は 30 秒のプレビューのみ対応です。

// @match        *://x.com/*
// @match        *://www.threads.com/*
// @match        *://www.threads.net/*
// @match        *://www.instagram.com/*
// @match        *://www.facebook.com/*
// @match        *://m.facebook.com/*
// @match        *://www.messenger.com/*

// @exclude      *://*.youtube.com/*
// @exclude      *://youtu.be/*
// @exclude      *://*.bandcamp.com/*
// @exclude      *://bandcamp.com/*
// @exclude      *://*.soundcloud.com/*
// @exclude      *://soundcloud.com/*
// @exclude      *://*.spotify.com/*

// @grant        GM_xmlhttpRequest
// @connect      *
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* =====================================================================
   * 設定區：要支援新網站，只需要在 PROFILES 新增一筆
   *
   *   name  : 名稱（僅供辨識）
   *   host  : 比對 location.hostname 的正規表示式
   *   post  : 「單一貼文／留言」根節點的 CSS 選擇器
   *           （同一根節點內的卡片與文字連結視為同一則貼文）
   *   card  : 「預覽卡片」的 CSS 選擇器（可選）。
   *           符合者（或其祖先符合者）會被整個換成播放器；
   *           不符合的連結視為文字連結，保留原連結並在其下方插入播放器。
   *
   * 由上而下比對，第一個符合的生效；最後一筆為通用規則。
   * ===================================================================== */

  const PROFILES = [
    {
      name: 'threads',
      host: /(^|\.)threads\.(net|com)$/,
      post: '[data-pressable-container]',
      card: 'a:has(img)',
    },
    // ↓ 以下為範例，尚未逐一驗證，若版面改版請自行調整選擇器
    {
      name: 'x',
      host: /(^|\.)(x|twitter)\.com$/,
      post: 'article[data-testid="tweet"]',
      card: '[data-testid="card.wrapper"] a',
    },
    {
      name: 'instagram',
      host: /(^|\.)instagram\.com$/,
      post: 'article',
      card: 'a:has(img)',
    },
    {
      // Facebook 貼文／留言為 role="article"，Messenger 訊息列為 role="row"
      name: 'facebook',
      host: /(^|\.)(facebook|messenger)\.com$/,
      post: '[role="article"], [role="row"]',
      card: 'a:has(img)',
    },
    {
      name: 'generic',
      host: /./,
      post: 'article, [role="article"], .post, .comment, .entry, .message, .status, .tweet',
      card: null, // 通用模式：一律當文字連結處理，不取代任何既有元素
    },
  ];

  const CONFIG = {
    // 這些區域內的連結不處理
    exclude: 'nav, header, footer, [contenteditable="true"], textarea, input, script, style',
    // 播放器最大寬度（避免在寬版頁面過長）
    maxWidth: '640px',
  };

  /* ---------- 基本設定 ---------- */

  const profile = PROFILES.find((p) => p.host.test(location.hostname)) || PROFILES[PROFILES.length - 1];

  const DONE_ATTR = 'data-music-embed';
  const LINK_SELECTOR = [
    'a[href*="bandcamp.com"]',
    'a[href*="soundcloud.com"]',
    'a[href*="spotify.com"]',
    'a[href*="youtube.com"]',
    'a[href*="youtu.be"]',
  ].join(', ');
  const metaCache = new Map(); // url -> Promise<meta|null>
  const lastInserted = new WeakMap(); // 區塊 -> 最後插入的節點（維持多個連結的順序）
  let currentAudio = null; // 同時只播放一個

  /* ---------- 工具 ---------- */

  function gm(url, responseType = 'text') {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType,
        timeout: 90000,
        onload: (r) =>
          r.status >= 200 && r.status < 300 ? resolve(r) : reject(new Error('HTTP ' + r.status)),
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }

  // 還原各站的外連跳轉（Threads l.threads.net、Facebook l.facebook.com、
  // Instagram l.instagram.com、Messenger l.messenger.com 等：?u=真實網址）
  function unwrapUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (classify(u)) return u;
      for (const k of ['u', 'url', 'q', 'target', 'to']) {
        const v = u.searchParams.get(k);
        if (v && /^https?:\/\//i.test(v)) {
          try {
            const real = new URL(v);
            if (classify(real)) return real;
          } catch (e) {}
        }
      }
      return u;
    } catch (e) {
      return null;
    }
  }

  function keyOf(u) {
    // YouTube 以影片 ID 為準（watch?v=、youtu.be、shorts 視為同一支）
    const yt = youtubeId(u);
    if (yt) return 'youtube:' + yt;
    return u.origin + u.pathname.replace(/\/+$/, '');
  }

  function fmtTime(s) {
    if (!isFinite(s)) return '0:00';
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // open.spotify.com/[intl-xx/][embed/]{track|album|playlist}/{id}
  function spotifyRef(u) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] && /^intl-/.test(parts[0])) parts.shift();
    if (parts[0] === 'embed') parts.shift();
    const type = parts[0];
    const id = parts[1] || '';
    if (['track', 'album', 'playlist'].includes(type) && /^[A-Za-z0-9]+$/.test(id)) {
      return { type, id };
    }
    return null;
  }

  // youtube.com/watch?v=ID、youtu.be/ID、/shorts/ID、/embed/ID、/live/ID、music.youtube.com/watch?v=ID
  // 只處理單支影片（純播放清單連結不處理）
  function youtubeId(u) {
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const ok = (id) => (/^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null);
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return ok(parts[0]);
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      if (parts[0] === 'watch') return ok(u.searchParams.get('v'));
      if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) return ok(parts[1]);
    }
    return null;
  }

  function classify(u) {
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);
    if (youtubeId(u)) return 'youtube';
    if (host === 'open.spotify.com' && spotifyRef(u)) return 'spotify';
    if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) {
      if (parts[0] === 'track' || parts[0] === 'album') return 'bandcamp';
    }
    if (host === 'soundcloud.com' || host === 'm.soundcloud.com' || host === 'on.soundcloud.com') {
      return 'soundcloud';
    }
    return null;
  }

  /* ---------- 取得曲目資訊 ---------- */
  // meta = { artist, album, subline?, note?, tracks: [{ title, artist?, direct?, resolve: () => Promise<mp3 url | youtube id> }] }

  async function getBandcamp(url) {
    const r = await gm(url);
    const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
    const el = doc.querySelector('script[data-tralbum]');
    if (!el) throw new Error('no tralbum');
    const d = JSON.parse(el.getAttribute('data-tralbum'));
    const tracks = (d.trackinfo || [])
      .filter((t) => t.file)
      .map((t) => {
        let src = t.file['mp3-128'] || Object.values(t.file)[0];
        if (src.startsWith('//')) src = 'https:' + src;
        return { title: t.title, resolve: async () => src };
      });
    if (!tracks.length) throw new Error('no streamable tracks');

    // 副標題格式：from {專輯} by {發行者}
    const text = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
    let bandName = '';
    try {
      const bandEl = doc.querySelector('script[data-band]');
      if (bandEl) bandName = JSON.parse(bandEl.getAttribute('data-band')).name || '';
    } catch (e) {}
    const fromAlbum = text(doc.querySelector('.albumTitle .fromAlbum'));
    const byArtist = text(doc.querySelector('.albumTitle [itemprop="byArtist"]'));
    let subline = '';
    if (fromAlbum) {
      subline = 'from ' + fromAlbum + (byArtist || bandName ? ' by ' + (byArtist || bandName) : '');
    } else if (tracks.length > 1 && d.current && d.current.title) {
      subline = 'from ' + d.current.title + (bandName || d.artist ? ' by ' + (bandName || d.artist) : '');
    } else if (bandName) {
      subline = 'by ' + bandName;
    }

    return { artist: d.artist, album: d.current && d.current.title, subline, tracks };
  }

  // 盡力而為：從頁面的 __sc_hydration 取 client_id 與 progressive 串流網址
  async function getSoundcloud(url) {
    const r = await gm(url);
    const m = r.responseText.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!m) throw new Error('no hydration');
    const hyd = JSON.parse(m[1]);
    const client = (hyd.find((x) => x.hydratable === 'apiClient') || {}).data;
    const sound = (hyd.find((x) => x.hydratable === 'sound') || {}).data;
    if (!client || !sound) throw new Error('not a single track');
    const tc = ((sound.media || {}).transcodings || []).find(
      (x) => x.format && x.format.protocol === 'progressive'
    );
    if (!tc) throw new Error('no progressive stream');
    return {
      artist: sound.user && sound.user.username,
      tracks: [
        {
          title: sound.title,
          resolve: async () => {
            const j = await gm(
              `${tc.url}?client_id=${client.id}&track_authorization=${encodeURIComponent(
                sound.track_authorization || ''
              )}`
            );
            return JSON.parse(j.responseText).url;
          },
        },
      ],
    };
  }

  // Spotify 沒有公開的完整串流，這裡讀取嵌入頁 (__NEXT_DATA__) 內的 30 秒試聽音檔
  function findSpotifyEntity(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12) return null;
    if (Array.isArray(node.trackList) || (node.audioPreview && node.audioPreview.url)) return node;
    for (const k of Object.keys(node)) {
      const hit = findSpotifyEntity(node[k], depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  async function getSpotify(url) {
    const ref = spotifyRef(new URL(url));
    if (!ref) throw new Error('bad spotify url');
    const r = await gm(`https://open.spotify.com/embed/${ref.type}/${ref.id}`);
    const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
    const el = doc.querySelector('script#__NEXT_DATA__');
    if (!el) throw new Error('no next data');
    const data = JSON.parse(el.textContent);
    const pp = data && data.props && data.props.pageProps;
    const entity =
      (pp && pp.state && pp.state.data && pp.state.data.entity) || findSpotifyEntity(data);
    if (!entity) throw new Error('no entity');

    const list = Array.isArray(entity.trackList) ? entity.trackList : [entity];
    const tracks = list
      .map((t) => {
        const src = t.audioPreview && t.audioPreview.url;
        if (!src) return null; // 沒有試聽音檔的曲目略過
        const artist =
          t.subtitle || (Array.isArray(t.artists) ? t.artists.map((a) => a.name).join(', ') : '');
        return { title: t.title || t.name, artist, resolve: async () => src };
      })
      .filter(Boolean);
    if (!tracks.length) throw new Error('no preview available');
    return {
      album: ref.type === 'track' ? null : entity.name || entity.title,
      note: '30 秒試聽',
      tracks,
    };
  }

  // YouTube：YouTube 不提供可直接下載的音訊串流，因此以 oEmbed 取得標題／頻道，
  // 播放則交給隱藏的 YouTube 嵌入播放器 (YTAudio)。禁止嵌入的影片 oEmbed 會回 401，
  // 此時視為失敗並保留原連結／卡片。
  async function getYoutube(url) {
    const id = youtubeId(new URL(url));
    if (!id) throw new Error('bad youtube url');
    const r = await gm(
      'https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + id)
    );
    const d = JSON.parse(r.responseText);
    return {
      artist: d.author_name,
      note: 'YouTube',
      tracks: [{ title: d.title, direct: true, resolve: async () => id }],
    };
  }

  const FETCHERS = {
    bandcamp: getBandcamp,
    soundcloud: getSoundcloud,
    spotify: getSpotify,
    youtube: getYoutube,
  };

  function getMeta(kind, url) {
    if (metaCache.has(url)) return metaCache.get(url);
    const p = FETCHERS[kind](url).catch((e) => {
      console.warn('[music-embed] meta failed', url, e);
      return null;
    });
    metaCache.set(url, p);
    return p;
  }

  /* ---------- YouTube 播放引擎 ---------- */
  // 以 enablejsapi=1 的隱藏 iframe + postMessage 控制，不需載入 iframe_api 腳本（避免 script-src CSP）。
  // 對外介面刻意仿照 HTMLAudioElement（src / play / pause / currentTime / duration / paused / ended
  // 與 play、pause、ended、timeupdate 事件），讓播放器 UI 可以共用同一套邏輯。

  class YTAudio extends EventTarget {
    constructor(mount) {
      super();
      this._mount = mount;
      this._frame = null;
      this._id = '';
      this._ready = false;
      this._want = false;
      this._paused = true;
      this._ended = false;
      this._time = 0;
      this._dur = NaN;
      this._timer = 0;
      this._onMsg = (e) => this._onMessage(e);
      window.addEventListener('message', this._onMsg);
    }

    get src() {
      return this._id;
    }
    set src(id) {
      if (id === this._id && this._frame) return;
      this._id = id;
      this._build();
    }
    get paused() {
      return this._paused;
    }
    get ended() {
      return this._ended;
    }
    get duration() {
      return this._dur;
    }
    get currentTime() {
      return this._time;
    }
    set currentTime(t) {
      this._time = t;
      if (this._ready) this._cmd('seekTo', [t, true]);
    }

    play() {
      this._want = true;
      this._ended = false;
      if (this._ready) this._cmd('playVideo');
      return Promise.resolve();
    }
    pause() {
      this._want = false;
      if (this._ready) this._cmd('pauseVideo');
    }

    _build() {
      this._teardown();
      if (!this._id) return;
      const f = document.createElement('iframe');
      f.allow = 'autoplay; encrypted-media';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.style.cssText =
        'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
      f.src =
        `https://www.youtube-nocookie.com/embed/${this._id}` +
        `?enablejsapi=1&autoplay=1&controls=0&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
      f.addEventListener('load', () => {
        // 通知嵌入頁開始回傳狀態
        this._post({ event: 'listening', id: 1, channel: 'widget' });
      });
      this._frame = f;
      this._mount.append(f);
      // 若網站 CSP 擋掉 frame，或影片無法載入，一段時間後仍未就緒就回報失敗
      this._timer = setTimeout(() => {
        if (!this._ready) this._fail('無法載入 YouTube 播放器（可能被網站阻擋）');
      }, 12000);
    }

    _teardown() {
      clearTimeout(this._timer);
      if (this._frame) this._frame.remove();
      this._frame = null;
      this._ready = false;
      this._time = 0;
      this._dur = NaN;
      this._ended = false;
      this._paused = true;
    }

    _post(obj) {
      try {
        this._frame.contentWindow.postMessage(JSON.stringify(obj), 'https://www.youtube-nocookie.com');
      } catch (e) {}
    }
    _cmd(func, args = []) {
      this._post({ event: 'command', func, args });
    }

    _setReady() {
      if (this._ready) return;
      this._ready = true;
      clearTimeout(this._timer);
      if (this._want) this._cmd('playVideo');
    }

    _setState(s) {
      // 1 播放中 / 2 暫停 / 0 結束 / 3 緩衝 / 5 已排入 / -1 未開始
      if (s === 1) {
        if (this._paused) {
          this._paused = false;
          this._ended = false;
          this.dispatchEvent(new Event('play'));
        }
      } else if (s === 2 || s === 0) {
        if (!this._paused) {
          this._paused = true;
          this.dispatchEvent(new Event('pause'));
        }
        if (s === 0 && !this._ended) {
          this._ended = true;
          this.dispatchEvent(new Event('ended'));
        }
      }
    }

    _fail(msg) {
      this._id = '';
      this._teardown();
      this._want = false;
      this.dispatchEvent(new CustomEvent('error', { detail: msg }));
    }

    _onMessage(e) {
      if (!this._frame || e.source !== this._frame.contentWindow) return;
      let d = e.data;
      if (typeof d === 'string') {
        try {
          d = JSON.parse(d);
        } catch (err) {
          return;
        }
      }
      if (!d || typeof d !== 'object') return;
      if (d.event === 'onReady') {
        this._setReady();
      } else if (d.event === 'onStateChange') {
        this._setReady();
        this._setState(d.info);
      } else if (d.event === 'onError') {
        this._fail('此影片無法嵌入播放（代碼 ' + d.info + '）');
      } else if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && d.info) {
        this._setReady();
        if (d.info.duration) this._dur = d.info.duration;
        if ('playerState' in d.info) this._setState(d.info.playerState);
        if (typeof d.info.currentTime === 'number') {
          this._time = d.info.currentTime;
          this.dispatchEvent(new Event('timeupdate'));
        }
      }
    }
  }

  /* ---------- 播放器 UI ---------- */
  // 使用 Shadow DOM 隔離宿主網站的 CSS；顏色與字型一律繼承宿主元素（currentColor / inherit），
  // 並以半透明灰階做背景與邊框，因此不需判斷亮/暗主題，在任何網站都能自然融入。

  function createPlayer(meta, origUrl, kind) {
    const accent = { soundcloud: '#ff5500', spotify: '#1db954', youtube: '#ff0033' }[kind] || '#1da0c3';

    const host = document.createElement('div');
    host.setAttribute(DONE_ATTR, 'embedded');
    host.style.cssText =
      `display:block;box-sizing:border-box;width:100%;max-width:${CONFIG.maxWidth};margin:8px 0;`;
    const root = host.attachShadow({ mode: 'open' });

    const wrap = document.createElement('div');
    wrap.style.cssText =
      `display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;` +
      `padding:8px 12px;border:1px solid rgba(127,127,127,.35);border-radius:10px;` +
      `background:rgba(127,127,127,.12);color:inherit;font-family:inherit;` +
      `font-size:13px;line-height:1.3;text-align:left;`;

    const btnStyle =
      `all:unset;cursor:pointer;flex:none;width:32px;height:32px;border-radius:50%;` +
      `display:flex;align-items:center;justify-content:center;font-size:14px;`;

    const play = document.createElement('button');
    play.type = 'button';
    play.textContent = '▶';
    play.style.cssText = btnStyle + `background:${accent};color:#fff;`;

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;';

    const title = document.createElement('div');
    title.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;';

    const subline = document.createElement('div');
    subline.style.cssText =
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.65;font-size:12px;';

    // 時間軸 + 秒數 + 連結 同一水平列
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';

    const seek = document.createElement('input');
    seek.type = 'range';
    seek.min = 0;
    seek.max = 1000;
    seek.value = 0;
    seek.style.cssText = `flex:1;min-width:0;height:12px;margin:0;accent-color:${accent};cursor:pointer;`;

    const time = document.createElement('div');
    time.style.cssText =
      'flex:none;opacity:.65;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;';
    time.textContent = '0:00';

    const open = document.createElement('a');
    open.href = origUrl;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = '↗';
    open.title = '開啟原始連結';
    open.style.cssText = 'flex:none;color:inherit;opacity:.65;text-decoration:none;font-size:14px;line-height:1;';

    bar.append(seek, time, open);
    info.append(title, subline, bar);

    const multi = meta.tracks.length > 1;
    const prev = document.createElement('button');
    const next = document.createElement('button');
    [prev, next].forEach((b) => {
      b.type = 'button';
      b.style.cssText = btnStyle + 'width:24px;height:24px;color:inherit;';
    });
    prev.textContent = '⏮';
    next.textContent = '⏭';

    wrap.append(play);
    if (multi) wrap.append(prev);
    wrap.append(info);
    if (multi) wrap.append(next);
    root.append(wrap);

    // 避免點擊播放器時觸發宿主頁面（例如貼文導航）
    ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown'].forEach((ev) =>
      host.addEventListener(ev, (e) => e.stopPropagation())
    );

    /* --- 播放邏輯 --- */
    const isYT = kind === 'youtube';
    const audio = isYT ? new YTAudio(root) : new Audio();
    if (!isYT) audio.preload = 'none';
    host._audio = audio;
    const blobs = []; // 每首曲目的 blob URL 快取
    let idx = 0;
    let loading = false;

    function showTrack() {
      const t = meta.tracks[idx];
      title.textContent = t.title || '(untitled)';
      const base =
        meta.subline ||
        [t.artist || meta.artist, meta.album && meta.album !== t.title ? meta.album : null, meta.note]
          .filter(Boolean)
          .join(' · ');
      subline.textContent = base + (multi ? `  (${idx + 1}/${meta.tracks.length})` : '');
      seek.value = 0;
      time.textContent = '0:00';
    }

    async function loadTrack(i) {
      const t = meta.tracks[i];
      if (t.direct) return t.resolve(); // YouTube：直接回傳影片 ID，交給嵌入播放器
      if (blobs[i]) return blobs[i];
      const url = await t.resolve();
      // 以 blob: 播放，避免被宿主網站的 media-src CSP 擋掉
      const r = await gm(url, 'blob');
      blobs[i] = URL.createObjectURL(new Blob([r.response], { type: 'audio/mpeg' }));
      return blobs[i];
    }

    async function playIndex(i) {
      if (loading) return;
      idx = i;
      showTrack();
      loading = true;
      play.textContent = '…';
      try {
        const src = await loadTrack(i);
        audio.src = src;
        await audio.play();
      } catch (e) {
        console.warn('[music-embed] play failed', e);
        subline.textContent = '播放失敗：' + (e && e.message ? e.message : e);
        play.textContent = '▶';
      } finally {
        loading = false;
      }
    }

    play.addEventListener('click', () => {
      if (loading) return;
      if (audio.src && !audio.paused) audio.pause();
      else if (audio.src && audio.currentTime > 0 && !audio.ended) audio.play();
      else playIndex(idx);
    });
    prev.addEventListener('click', () => playIndex((idx - 1 + meta.tracks.length) % meta.tracks.length));
    next.addEventListener('click', () => playIndex((idx + 1) % meta.tracks.length));

    audio.addEventListener('play', () => {
      if (currentAudio && currentAudio !== audio) currentAudio.pause();
      currentAudio = audio;
      play.textContent = '⏸';
    });
    audio.addEventListener('pause', () => (play.textContent = '▶'));
    audio.addEventListener('ended', () => {
      if (idx < meta.tracks.length - 1) playIndex(idx + 1);
      else play.textContent = '▶';
    });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
      time.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration);
    });
    audio.addEventListener('error', (e) => {
      // YTAudio 會帶 detail 說明原因；原生 Audio 的錯誤沒有 detail，維持原行為
      if (!e.detail) return;
      subline.textContent = '播放失敗：' + e.detail;
      play.textContent = '▶';
    });
    seek.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration;
    });

    showTrack();
    return host;
  }

  /* ---------- 以選擇器定位元素 ---------- */

  // 往上找到第一個非 inline 的區塊，播放器插在它後面
  function blockOf(a) {
    let el = a;
    while (el.parentElement && el.parentElement !== document.body) {
      const d = getComputedStyle(el).display;
      if (d !== 'inline' && d !== 'inline-block' && d !== 'contents') break;
      el = el.parentElement;
    }
    return el;
  }

  // 這則貼文的根節點：同一則貼文裡的卡片與文字連結必須得到同一個根
  function postRoot(a) {
    const r = profile.post && a.closest(profile.post);
    if (r) return r;
    const b = blockOf(a);
    return b.parentElement && b.parentElement !== document.body ? b.parentElement : b;
  }

  // 若連結屬於「預覽卡片」，回傳要被取代的卡片元素；否則回傳 null
  function cardOf(a) {
    if (!profile.card) return null;
    try {
      return a.matches(profile.card) ? a : a.closest(profile.card);
    } catch (e) {
      return null;
    }
  }

  /* ---------- 統一同一則貼文內所有播放器的寬度 ---------- */
  // 文字區塊與媒體區塊的容器寬度可能不同，量出各自可用寬度後統一取最小值

  const parentRoot = new WeakMap(); // 播放器的父容器 -> 貼文根節點
  const dirtyRoots = new Set();
  let resizeTimer = 0;

  const ro = new ResizeObserver((entries) => {
    entries.forEach((e) => {
      const r = parentRoot.get(e.target);
      if (r && r.isConnected) dirtyRoots.add(r);
    });
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const rs = [...dirtyRoots];
      dirtyRoots.clear();
      rs.forEach(syncWidths);
    }, 120);
  });

  function syncWidths(root) {
    if (!root || !root.isConnected) return;
    const ps = [...root.querySelectorAll(`[${DONE_ATTR}="embedded"]`)];
    if (!ps.length) return;
    ps.forEach((p) => (p.style.width = '100%')); // 先還原，量出各自的可用寬度
    const w = Math.floor(Math.min(...ps.map((p) => p.getBoundingClientRect().width)));
    if (!(w > 0)) return;
    ps.forEach((p) => {
      p.style.width = w + 'px';
      const par = p.parentElement;
      if (par && !parentRoot.has(par)) {
        parentRoot.set(par, root);
        ro.observe(par);
      }
    });
  }

  function scheduleSync(el) {
    requestAnimationFrame(() => syncWidths(postRoot(el)));
  }

  /* ---------- 掃描並處理 ---------- */

  // 有預覽卡片：整張卡片換成播放器
  async function processCard(a, cardEl, u, kind) {
    a.setAttribute(DONE_ATTR, 'pending');
    const meta = await getMeta(kind, u.href);
    if (!meta || !cardEl.isConnected) {
      a.setAttribute(DONE_ATTR, 'failed'); // 失敗就保留原卡片
      return;
    }
    const key = keyOf(u);
    const root = postRoot(cardEl);
    // 若先前已為同一連結獨立生成過播放器（卡片較晚才出現），移除以免重複
    root.querySelectorAll('[data-music-from="text"], [data-music-from="placeholder"]').forEach((el) => {
      if (el.getAttribute('data-music-key') === key) {
        if (el._audio) el._audio.pause();
        el.remove();
      }
    });
    const player = createPlayer(meta, u.href, kind);
    player.setAttribute('data-music-key', key);
    player.setAttribute('data-music-from', 'card');
    cardEl.replaceWith(player);
    scheduleSync(player);
  }

  // 沒有預覽卡片：在貼文中獨立生成播放器（保留原連結）
  async function processText(a, u, kind) {
    a.setAttribute(DONE_ATTR, 'text');
    const key = keyOf(u);
    const root = postRoot(a);

    // 同一貼文已有同連結的預覽卡片、卡片播放器，或已有文字播放器 → 不重複
    const hasCard = [...root.querySelectorAll('a[href]')].some((x) => {
      if (x === a || !cardOf(x)) return false;
      const xu = unwrapUrl(x.href);
      return xu && keyOf(xu) === key;
    });
    const hasPlayer = [
      ...root.querySelectorAll('[data-music-from]'),
    ].some((x) => x.getAttribute('data-music-key') === key);
    if (hasCard || hasPlayer) return;

    // 先同步放入隱藏的佔位元素，確保多個連結的播放器依原本順序排列
    const blk = blockOf(a);
    const placeholder = document.createElement('div');
    placeholder.setAttribute(DONE_ATTR, 'placeholder');
    placeholder.setAttribute('data-music-from', 'placeholder');
    placeholder.setAttribute('data-music-key', key);
    placeholder.style.display = 'none';
    let ref = lastInserted.get(blk);
    if (!ref || !ref.isConnected) ref = blk;
    ref.after(placeholder);
    lastInserted.set(blk, placeholder);

    const meta = await getMeta(kind, u.href);
    if (!meta || !placeholder.isConnected) {
      placeholder.remove();
      return;
    }

    const player = createPlayer(meta, u.href, kind);
    player.setAttribute('data-music-key', key);
    player.setAttribute('data-music-from', 'text');
    placeholder.replaceWith(player);
    if (lastInserted.get(blk) === placeholder) lastInserted.set(blk, player);
    scheduleSync(player);
  }

  function processLink(a) {
    if (a.getAttribute(DONE_ATTR)) return;
    if (a.closest(`[${DONE_ATTR}]`)) return;
    if (CONFIG.exclude && a.closest(CONFIG.exclude)) return;
    const u = unwrapUrl(a.href);
    if (!u) return;
    const kind = classify(u);
    if (!kind) return;

    const cardEl = cardOf(a);
    if (cardEl) processCard(a, cardEl, u, kind);
    else processText(a, u, kind);
  }

  function scan() {
    document.querySelectorAll(`${LINK_SELECTOR}`).forEach((a) => {
      if (!a.getAttribute(DONE_ATTR)) processLink(a);
    });
  }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });

  scan();
})();