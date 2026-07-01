# 改修対象ファイル一覧

`mattyopon/HitstarOnline` リポジトリで、Gacha Renewal 時に **必ず触る** / **触るべき** / **触らないほうがよい** ファイル。

> ブランチ起点：`claude/multiplayer-room-google-auth-twq8va`（デフォルト）
> 作業ブランチ：`design/gacha-renewal`

---

## 🔴 必ず触る（Tier 1）

### スタイル・設定
| ファイル | 変更 |
|---|---|
| `src/app/globals.css` | CSS変数全刷新 + BILIBILI調クラス群を追加 |
| `src/app/layout.tsx` | Google Fonts 追加（ZCOOL KuaiLe / Quicksand / Bebas Neue / Noto Sans SC） |
| `src/app/page.tsx` | Title 画面へリダイレクト、または新規Title統合 |

### 新規コンポーネント
| ファイル | 役割 |
|---|---|
| `src/components/Title.tsx` | **NEW** — サインイン兼ヒーローランディング |
| `src/components/Roster.tsx` | **NEW** — 15キャラ図鑑・フィルター |
| `src/components/CharacterModal.tsx` | **NEW** — キャラ詳細ダイアログ |
| `src/components/GachaScreen.tsx` | **NEW** — ガチャ画面 |
| `src/components/PartyStrip.tsx` | **NEW** — ロビーのパーティ編成ストリップ |
| `src/components/ResourceBar.tsx` | **NEW** — 💎 / 🎵 / 🪙 リソース表示 |
| `src/components/DanmuStrip.tsx` | **NEW** — 弾幕ストリップ |

### 既存コンポーネントの改修
| ファイル | 変更 |
|---|---|
| `src/components/Brand.tsx` | ZCOOL KuaiLe オフセットシャドウ表現に |
| `src/components/SignIn.tsx` | Title 画面に統合、または簡略化 |
| `src/components/Lobby.tsx` | 全面刷新（パーティストリップ + リソースバー + ダンマクなど） |
| `src/components/GameRoom.tsx` | **Battle 画面としてラップ**（内部の Timeline / PlacementArea / RevealCard は維持） |
| `src/components/GameHeader.tsx` | BILIBILI調ヘッダー |
| `src/components/PlayerList.tsx` | アバター画像対応、レア枠追加 |
| `src/components/Avatar.tsx` | 回転グラデ枠 + 画像プロップ対応 |

### データ・API
| ファイル | 役割 |
|---|---|
| `src/lib/gachaChars.ts` | **NEW** — 15キャラマスター（`mocks/_chars.js` をTS化） |
| `src/lib/rarity.ts` | **NEW** — レアリティ色トークン・確率テーブル |
| `src/app/api/gacha/roll/route.ts` | **NEW** — ×1 / ×10 サーバーサイドロール |
| `src/app/api/party/set/route.ts` | **NEW** — パーティ編成の保存 |
| `src/app/api/character/list/route.ts` | **NEW** — プレイヤーの所有キャラ一覧 |
| `supabase/migrations/0006_gacha.sql` | **NEW** — 追加テーブル（`data-model.md` 参照） |

### アセット
| パス | 内容 |
|---|---|
| `public/img/gacha/char-*.jpg` × 15 | キャラ立ち絵 |
| `public/img/gacha/bg-*.jpg` × 3 | 画面背景（title / lobby / battle） |

---

## 🟡 触ったほうがよい（Tier 2）

| ファイル | 触る理由 |
|---|---|
| `src/components/ChatDock.tsx` | ダンマク配色と統合検討 |
| `src/components/VoicePanel.tsx` | 色調整 |
| `src/components/StatsPanel.tsx` | BILIBILI 調カードに |
| `src/components/SettingsPanel.tsx` | パーティ編成メニューへの動線追加 |
| `src/components/GameOverBanner.tsx` | 勝利演出をキャラアバター付きに |
| `src/components/RankIcon.tsx` | レアリティ枠と統合検討 |
| `src/components/Timeline.tsx` | memo保持のまま色調整のみ |
| `src/components/PlacementArea.tsx` | mystery カードの見た目調整（DnDロジック維持） |
| `src/components/RevealCard.tsx` | 正解演出をキャラ画像入りに |

---

## 🟢 慎重に触る（Tier 3）

| ファイル | 触る理由 |
|---|---|
| `src/hooks/useTimelineFit.ts` | カードサイズ変更時の gap 微調整のみ |
| `src/hooks/useUser.ts` | ガチャリソース（gems等）を追加読み取りが必要な場合 |
| `src/lib/protocol.ts` | クライアント型を追加（既存を壊さない） |

---

## ⛔ 絶対に触らない

| ファイル | 理由 |
|---|---|
| `data/deck.json` | 楽曲データ |
| `supabase/migrations/0001-0005*.sql` | 既存マイグレーション |
| `src/app/api/game/**` | 対戦コアAPI（サーバー権威） |
| `src/lib/engine.ts` | ゲームエンジン |
| `scripts/smoke.ts` | スモークテスト |
| `middleware.ts` | ミドルウェア |
| `next.config.mjs` | フォント追加以外触らない |
| `.claude/`, `CLAUDE.md`, `DEPLOY.md` | プロジェクト規約 |

---

## 📂 推奨作業順（Step by Step）

1. **Step 1**：画像コピー — `handoff-gacha/mocks/img/*` → `public/img/gacha/*`（18枚）
2. **Step 2**：`_chars.js` を `src/lib/gachaChars.ts` に変換（型定義 + as const）
3. **Step 3**：`globals.css` 刷新（CSS変数 + 全クラス）— typecheck通過確認
4. **Step 4**：`layout.tsx` に Google Fonts 追加
5. **Step 5**：`Brand.tsx` / `Avatar.tsx`（小コンポーネント先行）
6. **Step 6**：`Title.tsx` を新規実装
7. **Step 7**：`Lobby.tsx` 刷新（PartyStrip / ResourceBar / DanmuStrip の順に実装 → 統合）
8. **Step 8**：`Roster.tsx` + `CharacterModal.tsx` を新規実装
9. **Step 9**：`GachaScreen.tsx` を新規実装（ロール確率のみ実装、演出は最低限）
10. **Step 10**：マイグレーション `0006_gacha.sql` 追加 → `/api/gacha/*`, `/api/party/*`, `/api/character/list` を実装
11. **Step 11**：`GameRoom.tsx` を BILIBILI Battle にラップ（内部の Timeline / PlacementArea / RevealCard は維持）
12. **Step 12**：周辺パネル群を統一
13. **Step 13**：typecheck / test:engine / build 全通し、dev で動線確認
14. **Step 14**：ブランチをリモートへ push

各 Step ごとに **git commit** を切る。

---

## 🧪 動作確認チェックリスト

- [ ] Title → ゲスト開始 → Lobby に遷移
- [ ] ジェム/音符/トークンが表示される
- [ ] パーティストリップに5キャラが並ぶ
- [ ] Roster で15キャラ一覧
- [ ] Roster フィルター（All / SSR / SR / R / 年代）動作
- [ ] キャラをクリックすると詳細モーダル
- [ ] Gacha ×1 / ×10 のUI表示
- [ ] Gacha ロールAPIが動く（結果はまだ表示だけでOK）
- [ ] 既存の部屋作成 → 対戦 → 配置 → リビール が壊れていない
- [ ] スマホ幅（880px以下）で1列レイアウト
- [ ] ダンマクは prefers-reduced-motion で消える
