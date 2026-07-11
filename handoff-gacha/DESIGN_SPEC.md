# Hitstar Online · BILIBILI Gacha デザイン仕様

**世界観：かわいい中華ACG × 15人ミューズ × 音楽の年代当てガチャゲーム**

`handoff-gacha/mocks/index.html` がピクセル参照、本書がトークン正本。

---

## 🎨 カラー（CSS変数）

`src/app/globals.css` の `:root` を以下のように刷新。**既存のキー名は維持し、値を差し替え**、新規キーは末尾に追加。

```css
:root {
  /* base — BILIBILI kawaii palette */
  --bg: #fff8fb;              /* cream white */
  --bg-2: #fff0f5;            /* pink bg */
  --panel: rgba(255,255,255,.92);
  --panel-2: #ffd6e3;         /* pink soft */
  --line: rgba(251,114,153,.22);

  /* ink */
  --text: #1a1a3a;
  --muted: #a3a8c8;

  /* accents */
  --accent: #fb7299;          /* bilibili pink */
  --accent-2: #ff85a8;
  --pink-soft: #ffd6e3;
  --cyan: #23ade5;            /* bilibili blue */
  --cyan-soft: #bff0ff;
  --gold: #ffc44a;
  --good: #3ddc97;
  --bad: #ff5d6c;

  /* rarity (new) */
  --ssr-a: #ff8a3d;
  --ssr-b: #ff5a1a;
  --sr-a:  #bd87ff;
  --sr-b:  #9050d0;
  --r-a:   #7ec6ff;
  --r-b:   #3a8ad0;

  /* radius / shadow */
  --radius: 14px;
  --radius-pill: 999px;
  --shadow: 0 14px 36px -16px rgba(251,114,153,.35);
}
```

### body 背景
```css
html, body {
  background: var(--bg);
  color: var(--text);
  font-family: "Quicksand", "Noto Sans SC", "Hiragino Sans", sans-serif;
}
```

---

## ✍️ タイポグラフィ

### フォント追加（layout.tsx）
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;700&family=ZCOOL+KuaiLe&family=Noto+Sans+SC:wght@400;500;700;900&family=Bebas+Neue&display=swap" rel="stylesheet">
```

### 階層
| 用途 | font-family | weight | size |
|---|---|---|---|
| ブランド・大見出し | ZCOOL KuaiLe | 400 | 88px（title）/ 44px（gacha h2）/ 20px（panel h3） |
| ボタン日本語 | ZCOOL KuaiLe | 400 | 18-22px |
| 数値・カウンター | Bebas Neue | 400 | 14-90px |
| ラベル（小） | Bebas Neue | 400 | 9-12px, letter-spacing .2em, uppercase |
| 本文 | Quicksand | 500-700 | 13-15px |
| キャラ名日本語 | Quicksand | 700 | 10-16px |

### 特徴的な装飾
- ZCOOL KuaiLe の見出しには **オフセットシャドウ**：`text-shadow: 5px 5px 0 var(--cyan), -2px -2px 0 #fff` で漫画的な立体感

---

## 🧱 コンポーネント

### ボタン `.btn-primary`
```css
{
  background: linear-gradient(180deg, var(--accent), var(--accent-2));
  color: #fff;
  border-radius: 999px;
  padding: 18px 30px;
  font-family: "ZCOOL KuaiLe", sans-serif;
  font-size: 22px;
  box-shadow:
    0 0 0 4px #fff inset,
    0 0 0 6px var(--pink-soft) inset,
    0 12px 30px -6px rgba(251,114,153,.55);
}
```
特徴：**四重ボーダー**（白リング + ピンクソフトリング）+ 大きな影で「押せるお菓子」感。

### カード `.panel`
```css
{
  background: rgba(255,255,255,.92);
  border: 1.5px solid var(--line);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 14px 36px -16px rgba(251,114,153,.35);
  backdrop-filter: blur(8px);
}
```

### アバター（ロータリングボーダー付き）
```css
.av-circle {
  position: relative;
  width: 44px; height: 44px;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(135deg, var(--accent), var(--cyan));
}
.av-circle::after {
  content: "";
  position: absolute; inset: -2px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--accent), var(--gold), var(--cyan), var(--accent));
  -webkit-mask: radial-gradient(closest-side, transparent 88%, #000 90%);
          mask: radial-gradient(closest-side, transparent 88%, #000 90%);
  animation: rotate 6s linear infinite;
}
@keyframes rotate { to { transform: rotate(360deg) } }
```
→ アバターの周りにグラデがゆっくり回る演出。

### レアリティチップ（キャラカード用）
```css
.ctile.ssr { border-color: var(--ssr-a); box-shadow: 0 8px 20px -6px var(--ssr-a); }
.ctile.sr  { border-color: var(--sr-a);  box-shadow: 0 8px 20px -6px var(--sr-a);  }
.ctile.r   { border-color: var(--r-a);   box-shadow: 0 8px 20px -6px var(--r-a);   }
```

### ダンマク（弾幕）ストリップ
```css
.danmu-strip {
  background: rgba(0,0,0,.55);
  border-radius: 12px;
  color: #fff;
  overflow: hidden;
  display: flex;
  align-items: center;
  backdrop-filter: blur(4px);
}
.danmu-strip .marquee span {
  animation: scroll 16s linear infinite;
}
@keyframes scroll {
  from { transform: translateX(100%) }
  to   { transform: translateX(-100%) }
}
```

### 吹き出し `.speech-bub`
Live2D風のふきだし。三角の尻尾は擬似要素で。

### タイムラインカード（Battle用）
既存の `.tl-card` は残しつつ、色をBILIBILI寄せに：
- 背景：`#fff`
- ボーダー：`2px solid var(--accent)`（ピンク）
- 年号：Bebas Neue で `var(--accent)`
- レコード穴：右上の小さな黒円（`::after` で表現）

### mystery カード（配置対象）
```css
.tl-card.mystery {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-color: var(--gold);
  color: #fff;
  box-shadow: 0 0 20px rgba(251,114,153,.6);
}
```

---

## 📐 画面別構成

### Title
- 左：メインキャラ（EDM Stellarisなど）フルボディ + 上下に2体のミニキャラを浮かべる
- 右：ロゴテキスト + タグライン + プライマリボタン + Googleボタン + **15キャラアバターの帯**
- 下部：ONLINE / Ver / PLAYERS のフッター

### Lobby
- 上部：プレイヤーカード + リソースバー（💎 / 🎵 / 🪙）
- ダンマクストリップ
- **パーティ編成ストリップ**（5キャラのミニ表示）
- ミッションバナー
- 3カラム：メニュー / センターキャラ + ふきだし / クイックプレイ+フレンド
- 下部ナビ（Home / Battle / Friends / Gacha / Shop）

### Battle
既存の GameRoom コンポーネントの動作は保持。ガワだけ差し替え：
- パーティ4人がキャラ画像アバターで表示
- 中央：レコード + キャラが半身出て回転 + カウントダウン
- 右：Now Spinning キャラ表示（現在の曲のミューズ）
- 下：既存の Timeline + PlacementArea + RevealCard

### Roster
- ヘッダー：TOTAL / SSR / SR / R のカウンター
- フィルター：ALL / レアリティ / 年代
- **5列×3行のグリッド** で15キャラ表示
- クリックで詳細モーダル（画像・ステータス・台詞）

### Gacha
- ヘッダー：banner name + ピックアップ表示
- 中央：メインキャラ（ピックアップ）大表示 + 左右にミニキャラをジャケットカード風に
- 右：排出率カード + ピックアップ説明
- 下：×1 / ×10 / FREE の3ボタン
- フッター：確率リンク + イベント残り時間

---

## 🎯 15キャラ設定

`mocks/_chars.js` を参照。各キャラは以下のフィールドを持つ：
```ts
{
  id: string,        // 'synthea'
  nm: string,        // 'Synthea Neon'
  jp: string,        // 'シンセア・ネオン'
  era: string,       // '1980s'
  attr: 'STAR'|'POP'|'LIGHT'|'SHADOW'|'DREAM'|'GRACE',
  rarity: 'SSR'|'SR'|'R',
  lv: number,
  img: string,       // 'img/char-synthea.jpg'
  quote: string,     // 台詞
  atk: number,
  def: number,
  spd: number,
  focus: string      // background-position for portrait crop
}
```

---

## 🚫 廃止すべき表現

- 既存の `radial-gradient(1200px 700px at 70% -10%, #2a1f5e 0%, ...)` の夜背景
- 既存の `conic-gradient` レコードロゴ
- ネオンパープル系のグラデーションボタン
- ダンマクを既存互換で残すなら色調のみBILIBILI寄せに

---

## ♿ アクセシビリティ

- 本文コントラスト：`#1a1a3a` on `#fff` → 14:1 ✅
- ピンクボタン：`#fff` on `#fb7299` → 3.4:1 → **AA border**。太字なら合格
- レアリティタグは色だけでなくSSR/SR/R テキストも併記済み
- `:focus-visible` outline を必須で残す

---

## 🎁 おまけ

**特徴的な "オフセット文字影" レシピ：**
```css
.title-logo-text {
  color: var(--accent);
  text-shadow:
    5px 5px 0 var(--cyan),
    -2px -2px 0 #fff,
    10px 10px 30px rgba(0,0,0,.15);
}
```
→ ZCOOL KuaiLe の日本語文字が漫画のセリフのように立体的に浮かぶ。
