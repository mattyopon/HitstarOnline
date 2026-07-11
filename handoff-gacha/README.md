# 📦 Hitstar Online · Gacha Renewal ハンドオフパッケージ

`mattyopon/HitstarOnline` を **BILIBILI風かわいい中華ACG × 15人ミューズ美少女ガチャゲーム** に全面リニューアルするためのClaude Code用資料一式。

---

## 📁 内容物

```
handoff-gacha/
├── README.md              ← この案内
├── PROMPT.md              ← Claude Code に貼り付ける本体プロンプト ⭐
├── DESIGN_SPEC.md         ← デザインシステム正本（色・タイポ・トークン）
├── target-files.md        ← 改修対象ファイル一覧と作業順
├── data-model.md          ← 追加が必要なDB/API/型定義の設計案
└── mocks/
    ├── index.html         ← 統合BILIBILIモック（Title/Lobby/Battle/Roster/Gacha）
    ├── _chars.js          ← 15キャラのマスターデータ（そのままRuntime定数として使える）
    └── img/               ← キャラ立ち絵 15枚 + 背景 3枚（合計 ~2MB）
```

---

## 🎯 このパッケージが提案する変更

| 領域 | 従来 | 新（Gacha版） |
|---|---|---|
| 世界観 | ネオンパーティー音楽ゲーム | かわいい中華ACG × 15人ミューズ美少女ガチャ |
| キャラ | なし | 15人（SSR×3, SR×6, R×6）— 各年代の擬人化 |
| 画面数 | 3画面 (SignIn / Lobby / GameRoom) | 5画面 (Title / Lobby / Battle / Roster / Gacha) |
| メカニクス | 音楽 + 年代当て | 音楽 + 年代当て + パーティ編成 + ガチャ |
| 通貨 | トークン (🪙) | ジェム💎、音符🎵、トークン🪙 |
| コアループ | ロビー → 出撃 → 対戦 → 戦績 | ロビー → 編成 → 出撃 → 対戦 → 戦績 → ガチャ → 図鑑 |

---

## 🚀 使い方（3ステップ）

### 1. handoff-gacha フォルダをリポジトリにコピー
```bash
cd ~/projects/HitstarOnline
cp -r /path/to/handoff-gacha ./
git checkout -b prep/gacha-renewal
git add handoff-gacha/
git commit -m "chore: add gacha renewal handoff package"
```

### 2. Claude Code を起動
```bash
cd ~/projects/HitstarOnline
claude
```

### 3. プロンプトを渡す
> `handoff-gacha/PROMPT.md` を読んで、その指示に従って実装してください。

---

## ✅ Claude Code が実施する作業

- [x] `design/gacha-renewal` ブランチを切って作業
- [x] CSS変数を BILIBILI ピンク／シアン系に刷新
- [x] 15人キャラのマスターデータをコードに組み込む
- [x] 5画面（Title / Lobby / Battle / Roster / Gacha）を実装
- [x] キャラ選択・パーティ編成 UI 追加
- [x] ガチャ画面（10連演出は最低限のシミュレーション）
- [x] ロスター図鑑（フィルター・詳細モーダル）
- [x] 既存のゲーム対戦ロジック（サーバー権威）はそのまま維持
- [x] Supabase スキーマに `player_gems`, `player_characters` テーブル追加案（詳細は `data-model.md`）
- [x] `npm run typecheck && npm run test:engine && npm run build` 全通過
- [x] リモートへ push（PRはユーザーが作る）

---

## ⚠️ 重要な制約（プロンプトで明記済み）

- **画像は既存のjpgをそのまま使用**（追加のAI画像生成は不要）
- Tailwind 等の CSS フレームワーク導入禁止
- 既存の楽曲デッキ・年代当てロジックは温存
- スモークテスト・既存マイグレーションを変えない（**新規マイグレーションはOK**）
- 既存の i18n (`useT()`) を維持

---

## 🎨 モックをブラウザで開く

```bash
open handoff-gacha/mocks/index.html
```

上部のセグメントで **Title / Lobby / Battle / Roster / Gacha** を切り替えて確認できます。
Roster では 15キャラのカードをクリックすると詳細モーダルが開きます。

---

## 📋 デザイン参照

- 色トークン・タイポ階層・コンポーネント定義は **`DESIGN_SPEC.md`**
- 15キャラのマスターデータは **`mocks/_chars.js`**（そのままRuntime定数として使える）
- 既存ファイル一覧と作業順は **`target-files.md`**
- 追加が必要なデータモデルは **`data-model.md`**

---

## 🐛 何かおかしいと感じたら

Claude Code 実行中に判断迷いが発生した場合：

- **デザイン判断の質問** → `mocks/index.html` の該当箇所を pixel-perfect 参照
- **ロジック変更の必要性** → 保留してコミットメッセージに `// TODO:` を残す
- **既存 GameRoom との統合** → **既存の Timeline / PlacementArea / RevealCard コンポーネントは維持し、その周囲だけ Battle 画面のガワとして拡張する**

それでも不明ならユーザー（あなた）にエスカレーション。

---

## 📞 完了後の確認ポイント

1. **ブランチがプッシュされているか**：`git fetch && git log origin/<branch> --oneline`
2. **検証コマンドが全通っているか**：Claude Code の完了レポートで確認
3. **手動確認**：`npm run dev` で `/` (Title) → ゲスト開始 → Lobby → 出撃 → Battle → Gacha → Roster の全動線
4. **問題なければ PR 作成**：レビュー → マージ → Vercel デプロイ

---

美少女ガチャゲーム化、頑張ってきてください 🎮💖
