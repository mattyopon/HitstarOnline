# Hitstar Online — Gacha Renewal 実装タスク

あなたは Hitstar Online のフルスタックエンジニアです。既存の Next.js 15 + React 19 + Supabase 構成のコードベースに対し、**BILIBILI風かわいい中華ACG × 15人ミューズ美少女ガチャゲーム** へ全面リニューアルしてください。

既存のゲーム対戦ロジック（サーバー権威・memo最適化・realtime同期）は温存しつつ、**キャラクター/パーティ/ガチャ/図鑑** のガチャゲームレイヤーを追加し、全画面をBILIBILI調のかわいいUIに刷新します。

---

## 🎯 タスクの全体像

1. **デザイントークン刷新**：`globals.css` を BILIBILI ピンク×シアン系に
2. **15キャラマスターデータ組み込み**：`handoff-gacha/mocks/_chars.js` をそのままTS定数化
3. **画像アセット導入**：`handoff-gacha/mocks/img/` を `public/img/gacha/` へコピー
4. **5画面実装**：Title / Lobby / Battle / Roster / Gacha
5. **DB拡張**：`player_gems`、`player_characters` テーブル追加（`data-model.md` 参照）
6. **API追加**：`/api/gacha/*`, `/api/party/*` 系エンドポイント
7. **既存のBattle動線は守る**：Timeline / PlacementArea / RevealCard は維持
8. **検証**：typecheck → test:engine → build 全通過

**完了条件**：上記すべてが通り、`npm run dev` で全画面が動作すること。

---

## 🎨 デザイン方向：BILIBILI かわいい中華ACG

**世界観の核**
- ピンク（#fb7299）× シアン（#23ade5）× 白ベース
- 温かく明るく、キラキラハートと音符が飛ぶ
- 中華フォント混じり：ZCOOL KuaiLe + Quicksand + Bebas Neue
- ダンマク（弾幕）風の流れるコメント演出
- 全体的にラウンドコーナー（12-24px）、影は柔らかいピンク系

**キャラクター**
- 15人のミューズ（全員BILIBILI調ピンク水色イラスト、実データは `_chars.js` 参照）
- レアリティ：SSR × 3、SR × 6、R × 6
- 各キャラに ATK / DEF / SPD 3ステータス、属性（STAR/POP/LIGHT/SHADOW/DREAM/GRACE）、年代（1960s-2020s）

詳細は **`handoff-gacha/DESIGN_SPEC.md`** 参照。ピクセル参照は **`handoff-gacha/mocks/index.html`**。

---

## 📐 参照ファイル

| ファイル | 用途 |
|---|---|
| `handoff-gacha/DESIGN_SPEC.md` | デザインシステム仕様 |
| `handoff-gacha/target-files.md` | 改修対象ファイル・作業順 |
| `handoff-gacha/data-model.md` | DB/型定義の設計 |
| `handoff-gacha/mocks/index.html` | **ピクセル参照モック**（5画面） |
| `handoff-gacha/mocks/_chars.js` | 15キャラのマスターデータ |
| `handoff-gacha/mocks/img/*.jpg` | 立ち絵15枚 + 背景3枚 |

---

## 🔧 制約とルール

### 守ること
- **既存のゲーム対戦コアロジックは変更しない**：`src/lib/engine.ts`、`/api/game/*` 系のRPCは触らない
- **サーバー権威設計を維持**：答えはクライアントに漏れない、`room_secrets` の役割を変えない
- **既存の Timeline / PlacementArea / RevealCard は memo 最適化を保ったまま**、Battle 画面の中に組み込む
- **TypeScript 型を壊さない**
- **i18n 維持**（`useT()` 経由、日本語ハードコード禁止）
- **CSSフレームワーク導入禁止**（globals.cssの素CSSで完結）
- **AI画像や外部画像生成は禁止**（提供された `mocks/img/` の18枚のみ使用）
- **`data/deck.json` は変更しない**

### 変えてよい / 追加してよい
- `globals.css` の CSS変数と全クラス定義（BILIBILI調に一新）
- 各コンポーネントの JSX マークアップ
- **新規テーブル・カラム追加**（`player_gems`, `player_characters`, `player_party` 等 — `data-model.md` 参照）
- **新規APIルート追加**（`/api/gacha/roll`, `/api/party/set` 等）
- 新しいコンポーネント（`GachaRoll.tsx`, `Roster.tsx`, `PartyPicker.tsx` 等）
- Google Fonts 追加（ZCOOL KuaiLe / Quicksand / Bebas Neue / Noto Sans SC）

### 絶対NG
- 既存 API のブレイキング変更
- 既存マイグレーション（0001〜0005）の編集
- ゲスト参加フロー・匿名ログインの変更
- スモークテスト（`scripts/smoke.ts`）の変更

---

## 🌳 ブランチとコミット

1. `design/gacha-renewal` ブランチを切る
2. コミットは論理単位で分割：
   - `feat(style): introduce BILIBILI kawaii design tokens in globals.css`
   - `feat(data): add character master data (15 muses)`
   - `feat(db): migration for player_gems / player_characters / player_party tables`
   - `feat(api): add gacha roll / party endpoints`
   - `feat(ui): redesign Title screen with hero character`
   - `feat(ui): redesign Lobby with party strip + resource bar`
   - `feat(ui): integrate Battle into gacha UI shell (Timeline preserved)`
   - `feat(ui): add Roster screen (15 char grid + filter + detail modal)`
   - `feat(ui): add Gacha screen (rates + pull buttons)`
   - `chore: pass typecheck / build / smoke`
3. 最後に `git push -u origin design/gacha-renewal`
4. **PRは作らない**（ユーザーがレビュー後に自分で作る）

---

## ✅ 検証手順（必ず実行）

```bash
npm run typecheck     # 型エラー0
npm run test:engine   # 既存スモークテスト通過（変更しない）
npm run build         # 成功
```

3つすべて通ったあと、`npm run dev` で以下の動線を手動確認：

- [ ] `/` (Title) が表示され、ゲスト参加できる
- [ ] Lobby が表示され、ジェム/音符/トークンが並ぶ
- [ ] Roster で 15キャラすべてが表示され、フィルターが動く
- [ ] Roster のキャラをクリックすると詳細モーダルが開く
- [ ] Gacha で ×1 / ×10 のUIが表示される（実際のロールはダミーでOK、確率のみ実装）
- [ ] 既存の対戦フロー（部屋作成 → 出撃 → タイムライン配置）が壊れていない

**全部通るまで諦めない**。失敗したら原因特定 → 修正 → 再走。

---

## 🚦 進め方の指示

1. **最初に計画を立てる**：このプロンプトと参照ファイルを全部読んだ上で、TodoWriteツールで作業計画を立てる（15〜20項目）
2. **既存コードを最初にざっと把握**：`src/app/globals.css`, `src/components/Lobby.tsx`, `src/components/GameRoom.tsx` を読み込んで既存の構造を理解
3. **画像アセットをコピー**：`handoff-gacha/mocks/img/` → `public/img/gacha/` に18ファイル移動
4. **キャラマスターデータをTS化**：`_chars.js` を `src/lib/gachaChars.ts` に変換（型定義 + as const）
5. **calculateし、着手**：ステップごとに `git add` → `git commit`
6. **ファイルは触る前に必ず読む**：思い込みで書き換えない
7. **既存の Battle 画面は "内側の1コンポーネントとして" 保持**：新しい Roster / Gacha は独立画面として並列に追加

---

## 🎬 完了報告フォーマット

実装が完了したら、以下を出力：

```markdown
## ✅ 完了レポート

### ブランチ
- `design/gacha-renewal`
- リモートにプッシュ済み

### 変更ファイル
- `src/app/globals.css` — BILIBILI トークン全刷新
- `src/lib/gachaChars.ts` — NEW（15キャラマスター）
- `src/components/Title.tsx` — NEW
- `src/components/Roster.tsx` — NEW
- `src/components/CharacterModal.tsx` — NEW
- `src/components/GachaScreen.tsx` — NEW
- `src/components/PartyStrip.tsx` — NEW
- `src/components/Lobby.tsx` — 刷新
- `src/components/GameRoom.tsx` — Battle 画面としてラップ
- `src/app/api/gacha/roll/route.ts` — NEW
- `src/app/api/party/set/route.ts` — NEW
- `supabase/migrations/0006_gacha.sql` — NEW
- `public/img/gacha/*` — 18ファイル追加
- ...

### コミット履歴
（要約）

### 検証結果
- ✅ typecheck: 0 errors
- ✅ test:engine: passed
- ✅ build: success
- ✅ dev server: 全画面表示OK

### 注意点・申し送り
- ガチャロールの確率実装は 30%/60%/10% でサーバーサイド
- 10連演出は placeholder（後日 Lottie 等の追加を推奨）
- キャラのATK/DEF/SPDは表示のみ（現状のゲームロジックには影響しない、将来のバトル拡張用）
- 手動確認：Roster フィルター動作、Gacha 画面遷移
```

---

## 📝 補足

- 既存の README / DEPLOY.md / CLAUDE.md を読んで、プロジェクトの規約を把握してから着手
- 不明点があれば `mocks/index.html` を精読、それでもわからなければユーザーに聞く
- **画像は18枚のみ提供** — 追加生成しない。プレースホルダーが必要な場合はCSSで表現

それでは、頑張ってください 🎮💖
