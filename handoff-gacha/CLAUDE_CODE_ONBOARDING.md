# 🎮 Claude Code へのオンボーディング＆実装指示

**このファイル全体をコピーして、Claude Code の最初のメッセージに貼り付けてください。**

---

## 👋 まず状況を把握してください

あなたは今、`mattyopon/HitstarOnline` リポジトリのローカルクローンで作業しています。このプロジェクトの**デザイン全面リニューアル**を任されました。

### プロジェクト概要
- **アプリ名**: Hitstar Online
- **正体**: Hitster風の音楽年代当てパーティーゲーム（オンライン対戦）
- **本番URL**: https://hitstar-online.vercel.app
- **技術スタック**: Next.js 15 (App Router) + React 19 + TypeScript + Supabase (Auth/DB/Realtime) + YouTube IFrame Player
- **デプロイ**: Vercel (フロント) + Supabase (バックエンド)
- **現状のデザイン**: ネオンパープル×ピンクの音楽パーティーゲームUI
- **既存ロジック**: サーバー権威のゲームエンジン、memo+rAF最適化、i18n、ダンマク、ボイスチャット完備

---

## 🎯 これから何をするか

**デザインを全面リニューアルします。** 具体的には：

**現状 → 新しい姿：**
```
音楽対戦パーティーゲーム (ネオン)
        ↓ リニューアル
BILIBILI風かわいい中華ACG × 15人ミューズ美少女ガチャゲーム
```

### 新しいコアループ
```
ゲスト参加/Google Login
   ↓
Title (5人のミューズが並ぶランディング)
   ↓
Lobby (ホーム画面：リソースバー・パーティ編成・出撃メニュー)
   ↓
├─ Battle (既存の対戦ロジック × キャラアバター付き演出)
├─ Roster (15キャラ図鑑・フィルター・詳細モーダル)
├─ Gacha (×1/×10 サモン画面・排出率・ピックアップ)
└─ Friends / Shop
```

### 15人のミューズ設定
各キャラは音楽年代の擬人化。全員BILIBILI調（ピンク×水色×かわいい）で統一：

**SSR × 3**
- Synthea Neon (1980s / STAR / シンセウェーブアイドル)
- Popciel Candy (2000s / POP / Y2Kポップ)
- EDM Stellaris (2010s / LIGHT / EDMフェス)

**SR × 6**
- Grungia Noir (1990s / SHADOW)
- Lo-fi Muse (2020s / DREAM)
- Velvet Lin (1960s / GRACE / チャイナドレス歌姫)
- Mei Lan (1990s / SHADOW / ロックガール)
- Mirage Yumi (2010s / LIGHT / フェス娘)
- Nova Lyra (1980s / STAR / グラムアイドル)

**R × 6**
- Sakura Akane, Cocoa Tsubaki, Honey Hina, Ruby Kurenai, Lilac Yua, Aria Iki

---

## 📁 リポジトリ直下にあるハンドオフパッケージ

`handoff-gacha/` フォルダに、必要な資料と素材が揃っています。**最初に必ず全部読んでください：**

```
handoff-gacha/
├── README.md            ← 全体案内
├── PROMPT.md            ← 詳細な実装指示（このメッセージの補足）
├── DESIGN_SPEC.md       ← CSS変数・タイポ・コンポーネント定義
├── target-files.md      ← 改修対象ファイル一覧と作業順
├── data-model.md        ← 追加が必要なDB/API/型定義
└── mocks/
    ├── index.html       ← ★ ピクセル参照モック（5画面全部入り）
    ├── _chars.js        ← 15キャラのマスターデータ
    └── img/             ← キャラ立ち絵15枚 + 背景3枚（JPEG圧縮済み、計約2MB）
```

**特に `handoff-gacha/mocks/index.html` はブラウザで開いて確認してください。ピクセル単位で参照すべき「最終形」です。**

---

## 🚦 作業指示（必ずこの順序で）

### Step 0: 情報収集（最初の10分）
1. `handoff-gacha/README.md` を読む
2. `handoff-gacha/PROMPT.md` を読む（詳細な制約とルール）
3. `handoff-gacha/DESIGN_SPEC.md` を読む（デザイントークン正本）
4. `handoff-gacha/target-files.md` を読む（改修対象と作業順）
5. `handoff-gacha/data-model.md` を読む（DB追加設計）
6. `handoff-gacha/mocks/index.html` を **ブラウザで開いて** 5画面を目で確認（Bash tool で `open handoff-gacha/mocks/index.html` OK）
7. 既存の主要ファイルを読む：
   - `README.md` `CLAUDE.md` `package.json`
   - `src/app/globals.css` （21KB — 現状スタイル全部）
   - `src/app/page.tsx` `src/app/layout.tsx`
   - `src/components/Lobby.tsx` `src/components/GameRoom.tsx`
   - `src/components/Timeline.tsx` `src/components/PlacementArea.tsx` `src/components/RevealCard.tsx`（← memo保持必須）
   - `supabase/migrations/` 全部（既存スキーマ把握）

### Step 1: 計画策定
TodoWrite ツールで **15〜25項目の作業リスト** を作成してから宣言：「これで進めます」

### Step 2: ブランチ作成
```bash
git checkout -b design/gacha-renewal
```

### Step 3: 実装（`target-files.md` の推奨順で）
1. 画像アセットコピー：`handoff-gacha/mocks/img/*` → `public/img/gacha/*`（18ファイル）
2. `_chars.js` を `src/lib/gachaChars.ts` に変換（TS型 + `as const`）
3. `globals.css` を BILIBILI トークンに全刷新（既存キー名維持、値差し替え）
4. `layout.tsx` に Google Fonts 追加（ZCOOL KuaiLe / Quicksand / Bebas Neue / Noto Sans SC）
5. 小コンポーネント（`Brand.tsx`, `Avatar.tsx`）刷新
6. `Title.tsx` 新規実装
7. `Lobby.tsx` 刷新（PartyStrip / ResourceBar / DanmuStrip を新規コンポーネント化）
8. `Roster.tsx` + `CharacterModal.tsx` 新規実装
9. `GachaScreen.tsx` 新規実装
10. Supabase マイグレーション `0006_gacha.sql` 追加
11. API 追加：`/api/gacha/roll`, `/api/party/set`, `/api/character/list`
12. `GameRoom.tsx` を Battle 画面としてラップ（**内部の Timeline/PlacementArea/RevealCard は完全維持**）
13. 周辺パネル群（ChatDock / VoicePanel / StatsPanel など）を統一

**各Step ごとに `git add` → `git commit` を切ってください。** コミットメッセージ規約：
```
feat(style): introduce BILIBILI kawaii design tokens in globals.css
feat(data): add character master data (15 muses)
feat(db): migration for player_gems / player_characters / player_party tables
feat(api): add gacha roll / party endpoints
feat(ui): redesign Title screen with hero character
feat(ui): redesign Lobby with party strip + resource bar
feat(ui): integrate Battle into gacha UI shell (Timeline preserved)
feat(ui): add Roster screen (15 char grid + filter + detail modal)
feat(ui): add Gacha screen (rates + pull buttons)
chore: pass typecheck / build / smoke
```

### Step 4: 検証（必ず全通過）
```bash
npm run typecheck     # 型エラー0
npm run test:engine   # 既存スモーク通過（変更しない）
npm run build         # ビルド成功
npm run dev &         # dev サーバー起動
sleep 5
curl -sI http://localhost:3000 | head -1  # HTTP/1.1 200 OK
kill %1
```

すべて通ったら手動確認チェックリストで動作確認（`target-files.md` 参照）。

### Step 5: リモートへプッシュ
```bash
git push -u origin design/gacha-renewal
```

**PRは作らないでください。** ユーザーがローカルでレビュー後に自分で作成します。

---

## ⚠️ 絶対に守ってほしい制約

### 触ってはいけないファイル・領域
- `data/deck.json` — 楽曲データ
- `supabase/migrations/0001_*.sql` 〜 `0005_*.sql` — 既存マイグレーション（追加はOK）
- `src/app/api/game/**` — 対戦コアAPI（サーバー権威）
- `src/lib/engine.ts` — ゲームエンジン
- `scripts/smoke.ts` — スモークテスト
- `middleware.ts` — ミドルウェア
- `.claude/`, `CLAUDE.md`, `DEPLOY.md`, `README.md`

### 動作を壊してはいけない箇所
- **既存の Timeline / PlacementArea / RevealCard は memo 最適化を保つ**（ラップは可、内部改変不可）
- **サーバー権威設計** — `room_secrets` の役割を変えない
- **i18n** — `useT()` 経由を維持、日本語ハードコード禁止
- **ゲスト参加フロー** — 匿名サインインの動作を維持

### やってはいけないこと
- AI画像生成 / 外部画像取得（提供された18枚のみ使用）
- CSS フレームワーク導入（Tailwind, MUI, styled-components 等）
- 既存API のブレイキング変更
- PR作成（Push まででストップ）

### 追加してよいもの
- 新規テーブル・カラム（`player_gems`, `player_characters`, `player_party`, `gacha_pulls`）
- 新規APIルート（`/api/gacha/*`, `/api/party/*`, `/api/character/*`）
- 新規コンポーネント
- Google Fonts

---

## 🎬 完了時のレポートフォーマット

すべて終わったら以下のフォーマットで報告してください：

```markdown
## ✅ 完了レポート

### ブランチ
- `design/gacha-renewal`
- `git push -u origin design/gacha-renewal` 完了

### 変更/追加ファイル一覧
- (箇条書き、各行に変更概要)

### コミット履歴（要約）
- abc1234 feat(style): ...
- def5678 feat(data): ...
- (以下略)

### 検証結果
- ✅ typecheck: 0 errors
- ✅ test:engine: passed
- ✅ build: success (X warnings, 0 errors)
- ✅ dev server: HTTP/1.1 200 OK

### 手動動作確認結果
- ✅ Title → ゲスト参加 → Lobby
- ✅ Roster で 15キャラ表示
- ✅ Roster フィルター動作
- ✅ Character 詳細モーダル動作
- ✅ Gacha 画面表示
- ✅ 既存の対戦フロー（部屋作成→出撃→タイムライン配置→リビール）壊れていない
- ✅ スマホ幅（880px以下）で1列レイアウト
- ✅ prefers-reduced-motion でダンマク消える

### 注意点・申し送り
- (触ったロジック、判断迷った箇所、TODO残しなど)
```

---

## 💡 何か迷ったら

1. **デザイン判断で迷ったら** → `handoff-gacha/mocks/index.html` を pixel-perfect で参照
2. **既存コードとの統合で迷ったら** → `handoff-gacha/target-files.md` のTier分類で判断（Tier1は必ず、Tier3は最小限）
3. **どうしても判断つかない** → 保守的な選択をしてコミットメッセージに `// TODO: designer confirm` を残す
4. **仕様の疑問点がある** → 手を止めてユーザーに質問

---

## 🚀 それでは始めてください

まず `handoff-gacha/` の中を全部読んで、TodoWrite で作業計画を立ててから宣言してください。良い実装を！ 🎮💖
