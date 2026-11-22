# 音樂內嵌播放器 (YouTube / Bandcamp / SoundCloud / Spotify)

[繁中](#繁中) · [English](#english) · [日本語](#日本語)


---

## 繁中

### 簡介

將網頁中的 **YouTube**、**Bandcamp**、**SoundCloud**、**Spotify** 連結換成小播放器，不必離開頁面就能試聽。

透過「站點設定檔 + CSS 選擇器」來辨識各網站的貼文與連結預覽卡片，因此不只 Threads，也能用在 X、Instagram、Facebook、Messenger 等其他網站；找不到對應設定檔時會自動套用通用規則。

### 功能

- 支援 YouTube（單支影片）、Bandcamp（單曲／專輯）、SoundCloud（單曲）、Spotify（單曲／專輯／播放清單）
- 有預覽卡片時，整張卡片會被換成播放器；只有文字連結時，保留原連結並在其下方插入播放器
- 專輯／播放清單支援上一首、下一首與自動接續播放
- 同時只會播放一個播放器
- 顯示曲名、藝人、專輯資訊、時間軸與播放時間，並附有「開啟原始連結」按鈕
- 使用 Shadow DOM 隔離宿主網站的 CSS，顏色與字型繼承宿主頁面，自動適應亮／暗色主題
- Bandcamp／SoundCloud／Spotify 以 `blob:` 方式播放音訊，避免被宿主網站的 `media-src` CSP 擋掉
- 自動還原外連跳轉網址（例如 `l.threads.net`、`l.facebook.com`、`l.instagram.com`、`l.messenger.com`）
- 同一則貼文內的多個播放器會統一寬度，並依連結原本的順序排列
- 以 MutationObserver 監聽動態載入的內容

### 支援網站

預設啟用於以下網站：

| 網站 | 設定檔 | 狀態 |
| --- | --- | --- |
| Threads (`threads.com` / `threads.net`) | `threads` | 已驗證 |
| X / Twitter | `x` | 範例，尚未逐一驗證 |
| Instagram | `instagram` | 範例，尚未逐一驗證 |
| Facebook / Messenger | `facebook` | 範例，尚未逐一驗證 |
| 其他（自行加入 `@match`） | `generic`（通用規則） | 通用規則，一律視為文字連結 |

### 安裝

1. 安裝 Userscript 管理器，例如 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 建立新腳本，貼上本腳本的完整內容並儲存。
3. 重新整理支援的網站即可。

> 腳本使用 `GM_xmlhttpRequest` 並設定 `@connect *`，以跨網域讀取曲目資訊與音訊檔，首次執行時管理器可能會詢問授權。

### 使用方式

- 點擊 **▶** 開始播放，再次點擊暫停（播放中顯示 **⏸**）。
- 拖曳時間軸可跳轉進度。
- 專輯／播放清單會出現 **⏮ / ⏭** 按鈕切換曲目，播完一首會自動播放下一首。
- 點擊 **↗** 開啟原始連結。

### 各平台說明與限制

| 平台 | 說明 |
| --- | --- |
| YouTube | 支援 `watch?v=`、`youtu.be`、`shorts`、`embed`、`live` 與 `music.youtube.com` 的單支影片，不處理純播放清單連結。YouTube 沒有可直接取用的音訊串流，因此以 oEmbed 取得標題與頻道，並用**隱藏的 YouTube 嵌入播放器**播放（畫面不顯示，只有聲音）。禁止嵌入的影片會保留原連結；若宿主網站的 CSP 阻擋 `frame-src`，約 12 秒後會顯示播放失敗 |
| Bandcamp | 讀取頁面中的 `data-tralbum`，播放公開可串流的 `mp3-128` 音檔；沒有可串流曲目時不會取代原內容 |
| SoundCloud | 盡力而為：從頁面的 `__sc_hydration` 取得 `client_id` 與 progressive 串流網址，僅支援單曲；若 SoundCloud 改版可能失效 |
| Spotify | Spotify 沒有公開的完整串流，僅能播放嵌入頁內的 **30 秒試聽**；沒有試聽音檔的曲目會被略過 |

- 解析失敗時會保留原本的連結／卡片，不影響頁面。
- `youtube.com`、`youtu.be`、`bandcamp.com`、`soundcloud.com`、`spotify.com` 本身已被排除，不會在這些網站上執行。
- 導覽列、頁首、頁尾、輸入框與可編輯區域內的連結不會被處理。
- Instagram、Facebook、Messenger 的 DOM 結構經常改版，內建選擇器尚未逐一驗證；若沒有生效，請調整對應設定檔的 `post` / `card`。

### 自訂與擴充

要支援新網站，只需在腳本的 `PROFILES` 陣列新增一筆設定，並在檔案開頭加上對應的 `@match`：

```js
{
  name: 'my-site',                    // 名稱（僅供辨識）
  host: /(^|\.)example\.com$/,        // 比對 location.hostname 的正規表示式
  post: 'article.post',               // 單一貼文／留言根節點的 CSS 選擇器
  card: '.link-preview a',            // 預覽卡片的 CSS 選擇器（可選，不需要時填 null）
},
```

- `post`：同一根節點內的卡片與文字連結視為同一則貼文，用來避免重複產生播放器。
- `card`：符合者（或其祖先符合者）會被整個換成播放器；不符合的連結視為文字連結。
- 設定檔由上而下比對，第一個符合的生效；**最後一筆必須是通用規則**。

其他可調整項目位於 `CONFIG`：

| 選項 | 說明 | 預設 |
| --- | --- | --- |
| `exclude` | 這些區域內的連結不處理 | `nav, header, footer, [contenteditable="true"], textarea, input, script, style` |
| `maxWidth` | 播放器最大寬度 | `640px` |

### 授權與隱私

- 腳本只會向連結所指的音樂網站（YouTube、Bandcamp、SoundCloud、Spotify）發出請求，不會收集或上傳任何個人資料。
- 請尊重藝人與平台的使用條款，僅用於個人試聽。

---

## English

### Overview

A userscript that replaces **YouTube**, **Bandcamp**, **SoundCloud** and **Spotify** links on web pages with a compact player, so you can listen without leaving the page.

Per-site profiles with CSS selectors identify each site's posts and link preview cards, so it works beyond Threads (X, Instagram, Facebook and Messenger are included). A generic rule is used when no profile matches.

### Features

- Supports YouTube (single videos), Bandcamp (tracks/albums), SoundCloud (single tracks) and Spotify (tracks/albums/playlists)
- With a preview card, the whole card is replaced by the player; with a plain text link, the original link is kept and a player is inserted below it
- Previous / next buttons and auto-advance for albums and playlists
- Only one player plays at a time
- Shows title, artist, album info, a seek bar and elapsed time, plus an "open original link" button
- Shadow DOM isolates the host site's CSS; colors and fonts are inherited, so it blends into light and dark themes
- Bandcamp / SoundCloud / Spotify audio is played via `blob:` URLs to avoid the host site's `media-src` CSP
- Unwraps outbound redirect URLs (e.g. `l.threads.net`, `l.facebook.com`, `l.instagram.com`, `l.messenger.com`)
- Players within one post share the same width and keep the original link order
- Uses a MutationObserver to handle dynamically loaded content

### Supported sites

| Site | Profile | Status |
| --- | --- | --- |
| Threads (`threads.com` / `threads.net`) | `threads` | Verified |
| X / Twitter | `x` | Example, not fully verified |
| Instagram | `instagram` | Example, not fully verified |
| Facebook / Messenger | `facebook` | Example, not fully verified |
| Others (add your own `@match`) | `generic` | Generic rule, treated as text links |

### Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Create a new script, paste the full contents of this script and save.
3. Reload a supported site.

> The script uses `GM_xmlhttpRequest` with `@connect *` to fetch track info and audio across origins. Your manager may ask for permission on first run.

### Usage

- Click **▶** to play and again to pause (**⏸** while playing).
- Drag the seek bar to jump.
- Albums/playlists show **⏮ / ⏭** buttons and advance automatically.
- Click **↗** to open the original link.

### Platform notes and limitations

| Platform | Notes |
| --- | --- |
| YouTube | Single videos from `watch?v=`, `youtu.be`, `shorts`, `embed`, `live` and `music.youtube.com`; bare playlist links are ignored. YouTube has no directly usable audio stream, so the title/channel come from oEmbed and playback uses a **hidden YouTube embedded player** (nothing visible, audio only). Videos that disallow embedding keep their original link; if the host site's CSP blocks `frame-src`, a failure message appears after about 12 seconds |
| Bandcamp | Reads `data-tralbum` from the page and plays the publicly streamable `mp3-128` file; nothing is replaced if no track is streamable |
| SoundCloud | Best effort: gets `client_id` and the progressive stream URL from `__sc_hydration`; single tracks only; may break if SoundCloud changes its page |
| Spotify | No public full-length stream, so only the **30-second preview** from the embed page is played; tracks without a preview are skipped |

- If parsing fails, the original link/card is left untouched.
- `youtube.com`, `youtu.be`, `bandcamp.com`, `soundcloud.com` and `spotify.com` are excluded.
- Links inside nav, header, footer, inputs and editable areas are ignored.
- The DOM of Instagram, Facebook and Messenger changes often and the bundled selectors have not been fully verified; if a profile does not take effect, adjust its `post` / `card`.

### Customization

To support a new site, add an entry to the `PROFILES` array and a matching `@match` line in the header:

```js
{
  name: 'my-site',                    // label only
  host: /(^|\.)example\.com$/,        // regex tested against location.hostname
  post: 'article.post',               // CSS selector for a single post/comment root
  card: '.link-preview a',            // CSS selector for preview cards (optional, null if none)
},
```

- `post`: cards and text links inside the same root count as one post, preventing duplicate players.
- `card`: a match (or an ancestor match) is replaced entirely by the player; non-matching links are treated as text links.
- Profiles are matched top to bottom and the first match wins; **the last entry must be the generic rule**.

Other options live in `CONFIG`:

| Option | Description | Default |
| --- | --- | --- |
| `exclude` | Links inside these areas are ignored | `nav, header, footer, [contenteditable="true"], textarea, input, script, style` |
| `maxWidth` | Maximum player width | `640px` |

### Privacy

- Requests are only made to the linked music sites (YouTube, Bandcamp, SoundCloud, Spotify). No personal data is collected or uploaded.
- Please respect artists' and platforms' terms; intended for personal listening.

---

## 日本語

### 概要

Webページ内の **YouTube**・**Bandcamp**・**SoundCloud**・**Spotify** のリンクを小型プレーヤーに置き換えるユーザースクリプトです。ページを離れずに試聴できます。

サイトごとのプロファイルと CSS セレクターで投稿やリンクプレビューカードを判別するため、Threads 以外（X、Instagram、Facebook、Messenger）でも動作します。該当するプロファイルがない場合は汎用ルールを使用します。

### 機能

- YouTube（単一動画）、Bandcamp（トラック／アルバム）、SoundCloud（単一トラック）、Spotify（トラック／アルバム／プレイリスト）に対応
- プレビューカードがある場合はカード全体をプレーヤーに置換し、テキストリンクのみの場合は元のリンクを残して直下にプレーヤーを挿入
- アルバム／プレイリストは前へ・次へボタンと自動連続再生に対応
- 同時に再生されるのは常に1つだけ
- 曲名・アーティスト・アルバム情報・シークバー・再生時間を表示し、「元のリンクを開く」ボタン付き
- Shadow DOM でホストサイトの CSS を分離し、色とフォントを継承するため、ライト／ダークテーマに自然に馴染む
- Bandcamp／SoundCloud／Spotify は `blob:` で再生し、ホストサイトの `media-src` CSP を回避
- 外部リンクのリダイレクトURL（`l.threads.net`、`l.facebook.com`、`l.instagram.com`、`l.messenger.com` など）を自動で展開
- 同じ投稿内のプレーヤーは幅を揃え、元のリンク順に配置
- MutationObserver で動的に読み込まれる内容にも対応

### 対応サイト

| サイト | プロファイル | 状態 |
| --- | --- | --- |
| Threads（`threads.com` / `threads.net`） | `threads` | 動作確認済み |
| X / Twitter | `x` | サンプル（未検証） |
| Instagram | `instagram` | サンプル（未検証） |
| Facebook / Messenger | `facebook` | サンプル（未検証） |
| その他（`@match` を追加） | `generic` | 汎用ルール（テキストリンク扱い） |

### インストール

1. [Tampermonkey](https://www.tampermonkey.net/) や [Violentmonkey](https://violentmonkey.github.io/) などのユーザースクリプトマネージャーをインストールします。
2. 新規スクリプトを作成し、このスクリプトの全内容を貼り付けて保存します。
3. 対応サイトを再読み込みします。

> トラック情報や音声ファイルを取得するため、`GM_xmlhttpRequest` と `@connect *` を使用します。初回実行時にマネージャーから許可を求められる場合があります。

### 使い方

- **▶** で再生、もう一度押すと一時停止（再生中は **⏸**）。
- シークバーをドラッグして再生位置を移動。
- アルバム／プレイリストでは **⏮ / ⏭** で曲を切り替え、曲の終了後は自動で次へ。
- **↗** で元のリンクを開きます。

### プラットフォーム別の注意・制限

| プラットフォーム | 説明 |
| --- | --- |
| YouTube | `watch?v=`、`youtu.be`、`shorts`、`embed`、`live`、`music.youtube.com` の単一動画に対応。プレイリストのみのリンクは対象外です。YouTube には直接利用できる音声ストリームがないため、タイトルとチャンネル名は oEmbed から取得し、再生は**非表示の YouTube 埋め込みプレーヤー**で行います（映像は表示されず音声のみ）。埋め込みが禁止された動画は元のリンクを残します。ホストサイトの CSP が `frame-src` をブロックする場合は、約12秒後に再生失敗が表示されます |
| Bandcamp | ページ内の `data-tralbum` を読み取り、公開されているストリーミング用 `mp3-128` を再生。再生可能な曲がない場合は置換しません |
| SoundCloud | ベストエフォート：`__sc_hydration` から `client_id` と progressive ストリームURLを取得。単一トラックのみ対応で、仕様変更で動かなくなる可能性があります |
| Spotify | 公開されたフルストリームがないため、埋め込みページ内の **30秒プレビュー** のみ再生。プレビューのない曲はスキップされます |

- 解析に失敗した場合は元のリンク／カードをそのまま残します。
- `youtube.com`、`youtu.be`、`bandcamp.com`、`soundcloud.com`、`spotify.com` 自体は除外されています。
- ナビゲーション、ヘッダー、フッター、入力欄、編集可能領域内のリンクは処理されません。
- Instagram・Facebook・Messenger の DOM は頻繁に変わるため、内蔵セレクターは未検証です。動作しない場合は該当プロファイルの `post` / `card` を調整してください。

### カスタマイズ

新しいサイトに対応するには、`PROFILES` 配列にエントリを追加し、ヘッダーに対応する `@match` を追記します。

```js
{
  name: 'my-site',                    // 識別用の名前
  host: /(^|\.)example\.com$/,        // location.hostname と照合する正規表現
  post: 'article.post',               // 1件の投稿／コメントのルート要素のセレクター
  card: '.link-preview a',            // プレビューカードのセレクター（任意、不要なら null）
},
```

- `post`：同じルート内のカードとテキストリンクを同一投稿とみなし、プレーヤーの重複を防ぎます。
- `card`：一致した要素（またはその祖先）はプレーヤーに丸ごと置換され、一致しないリンクはテキストリンクとして扱われます。
- 上から順に照合し最初に一致したものが有効です。**最後のエントリは必ず汎用ルール**にしてください。

その他の設定は `CONFIG` にあります。

| オプション | 説明 | 既定値 |
| --- | --- | --- |
| `exclude` | これらの領域内のリンクは処理しない | `nav, header, footer, [contenteditable="true"], textarea, input, script, style` |
| `maxWidth` | プレーヤーの最大幅 | `640px` |

### プライバシー

- リンク先の音楽サイト（YouTube、Bandcamp、SoundCloud、Spotify）にのみリクエストを送信し、個人情報の収集・送信は行いません。
- アーティストおよび各プラットフォームの利用規約を尊重し、個人での試聴にご利用ください。

---

## Meta

- Version: 1.1.0
- Repository: <https://github.com/Paracehll/Usa-Sukuriputo>