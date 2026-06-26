# CLAUDE.md — Hitstar Online 開発ガイド（毎セッション自動読込）

> このファイルは Claude Code が新しいセッションで最初に読む「恒久メモリ」です。
> 開発・デプロイ方法を毎回思い出すために、**作業前に必ずここを確認**してください。
> 起動時には `.claude/hooks/session-start.sh` も実行され、要点と環境状態を出力します。

## 1. このプロジェクトは何か

**Hitstar Online** — Hitster 風の「曲を聴いて発売年を当て、年表に並べる」オンライン対戦
パーティーゲーム。Google ログインで、離れた友達と部屋を作ってリアルタイムに遊べる。

確定済みのプロダクト判断（ユーザー合意済み）:
- 音楽再生 = **YouTube 埋め込み**（曲名は伏せて再生 → リビールで公開）
- ルール = **公式フルルール**（配置 / 横取り / トークン / スキップ / カード購入 / 勝敗）
- バックエンド = **Supabase**（Auth / DB / Realtime）、デプロイ = **Vercel**
- 認証 = Google OAuth ＋ 匿名（ゲスト）

## 2. 技術スタック / アーキテクチャ

- Next.js 15 (App Router) + React 19 + TypeScript（フロント＆サーバ）
- Supabase: Postgres + RLS + Realtime + Auth
- ゲームロジックは **Next.js API Routes** が `service_role` で**サーバ権威的**に判定
- 状態同期: クライアントは `rooms.state`(JSONB, サニタイズ済み公開状態) を Realtime 購読

```
Browser ─(Google/匿名)→ Supabase Auth
   │ ▲ Realtime購読: rooms.state（答えは含まない）
   ▼
Next.js API Routes (Vercel) ─service role→ Supabase Postgres
   └ engine.ts で配置/横取り/トークンを判定、楽観ロック(version)で競合防止
   └ 出題曲の YouTube ID を解決し track_cache にキャッシュ
```

**アンチチート設計（重要）**: 出題中カードの答え（年/曲名/アーティスト）は
`room_secrets`（クライアント参照不可）にのみ保持。公開 `rooms.state` には再生用の
`youtubeId` だけを載せ、リビール時に初めて答えを公開する。

## 3. 開発コマンド

```bash
npm install
npm run dev          # http://localhost:3000
npm run test:engine  # ゲームエンジンのスモークテスト（ネット不要 / 42項目）
npm run typecheck    # tsc --noEmit（実質これがリンタ。ESLintは未設定）
npm run build        # next build（本番ビルド検証）
```

変更後は最低限 `typecheck` と `test:engine`、可能なら `build` を通すこと（= Definition of Done）。

## 4. 重要ファイル

| パス | 役割 |
|---|---|
| `src/lib/engine.ts` | フルルールのゲーム状態機械（**純粋関数 / now・乱数は引数で注入**） |
| `src/lib/protocol.ts` | 共有型・設定。**クライアントからも import 可（型/定数のみ）** |
| `src/lib/rooms.ts` | 部屋管理・楽観ロック・YouTube解決（**サーバ専用 / admin client**） |
| `src/lib/deck.ts` | デッキ読込・シャッフル（**サーバ専用 / 答えを含むので client 禁止**） |
| `src/lib/youtube.ts` | YouTube ID 解決（Data API or スクレイプ、サーバ専用） |
| `src/app/api/**` | 部屋/ゲーム操作 API（create/join/leave/start/place/steal/skip/buy/advance） |
| `src/components/GameRoom.tsx` | ゲーム盤（フェーズ別UI・自動進行・音声有効化・チャット/VC のマウント） |
| `src/hooks/useRoom.ts` | Realtime 購読フック |
| `src/lib/chat.ts` / `src/components/ChatDock.tsx` / `src/hooks/useChat.ts` | 弾幕チャット＋エモート（private channel `chat:<CODE>`） |
| `src/lib/profanity.ts` | 多言語の暴言マスク（純粋・client可） |
| `src/app/api/translate/route.ts` | チャット自動翻訳（Google Translate サーバプロキシ＋キャッシュ） |
| `src/lib/voice.ts` / `src/hooks/useVoice.ts` / `src/components/VoicePanel.tsx` | VC（WebRTCメッシュ・perfect negotiation・private channel `voice:<CODE>`） |
| `src/app/api/turn/route.ts` | VC の ICE(STUN/TURN) サーバ一覧（認証必須） |
| `src/lib/stats.ts`（**サーバ専用**）/ `src/app/api/stats/route.ts` / `src/components/StatsPanel.tsx` | 戦績・カテゴリ別精度・ランク記録 |
| `supabase/migrations/0001_init.sql` 〜 `0004_stats.sql` | スキーマ/RLS/原子RPC/Realtime認可/戦績（下記） |
| `data/deck.json` | 楽曲デッキ（346曲 / 16カテゴリ・国別） |
| `scripts/smoke.ts` | エンジンのスモークテスト（55項目） |

**境界ルール**: `engine.ts` / `deck.ts` / `rooms.ts` / `youtube.ts` /
`src/lib/supabase/admin.ts` は**サーバ専用**（答えや service_role を含む）。
クライアントコンポーネントから import しないこと。型は `protocol.ts` から取得する。

## 5. デプロイ（Supabase + Vercel）

詳細は `DEPLOY.md`。要点と既知のハマりどころ:

- **環境変数（この実行環境に設定済み）**:
  `SUPABASE_ACCESS_TOKEN`（Management API/CLI）, `VERCEL_TOKEN`（Vercel）, `SUPABASE_DB_URL`。
  値は出力しない。存在確認は session-start フックが行う。
- **Vercel**: team `mattyopons-projects`。`VERCEL_TOKEN` でプロジェクト作成・env設定・デプロイ可。
- **Supabase Management API のハマり所**: `api.supabase.com` は Cloudflare 配下。
  **User-Agent ヘッダが無いと 403(code 1010)** になる。必ずブラウザ風 UA を付ける。
- **egress ポリシー**: 環境によっては `api.supabase.com` / `api.vercel.com` が 403 で遮断される。
  その場合は迂回せず、ユーザーに egress 許可を依頼する（規約: ポリシー拒否は迂回禁止）。
- **⚠️ Supabase プロジェクト選定（要注意）**: `SUPABASE_DB_URL` が指す
  `wdyquwheodarrmwtljqa` は既存の別プロジェクト **"faultray-pro"**。ここへ直接スキーマ適用や
  匿名認証ON・リダイレクトURL変更を行うと既存アプリを壊す恐れがある。
  **このゲーム用には専用 Supabase プロジェクトを新規作成して使うこと**（ユーザー確認の上で）。
- **Google ログイン**: Supabase の Google プロバイダにユーザーの Google OAuth
  client_id / secret が必要。未設定でも**匿名/ゲストで全機能が動作**する。
- デプロイ後 URL を Supabase の `site_url` と Redirect(`<url>/auth/callback`) に登録する。

### 本番プロジェクト & 追加環境変数（値は出力しない）
- 本番 Supabase ref = `geagqyybikellhwkimbh`（専用プロジェクト。faultray-pro とは別）。
- 本番 URL = `https://hitstar-online.vercel.app`（Vercel project `hitstar-online`）。
- Vercel に設定済みの env: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_GOOGLE_ENABLED` / `CRON_SECRET` /
  `GOOGLE_TRANSLATE_API_KEY`（チャット翻訳）/ `NEXT_PUBLIC_VOICE_ENABLED=true`（VC有効化）/
  `NEXT_PUBLIC_TURN_URLS` `NEXT_PUBLIC_TURN_USERNAME` `NEXT_PUBLIC_TURN_CREDENTIAL`（metered TURN）/
  `METERED_API_KEY`（+任意 `METERED_HOST` で動的TURN）。
- **デプロイ**: `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx vercel --prod --token "$VERCEL_TOKEN" --yes`
  （TLS無効化は禁止。必ず CA bundle を使う。CLIは2分で打ち切られるが裏で完走するので API/ログで確認）。
- マイグレーション適用は Management API `/database/query`（UA必須）に SQL を POST。
  - `0002_atomic_apply.sql` = 原子的CAS RPC `apply_room_state`
  - `0003_realtime_authz.sql` = `realtime.messages` の RLS（private channel `chat:`/`voice:`/`presence:` を部屋メンバー限定）
  - `0004_stats.sql` = 戦績テーブル＋`bump_category_stat` RPC
- **テスト**: ブラウザE2Eはサンドボックスのproxyが *.supabase.co/*.vercel.app への
  WebSocket以外のブラウザ接続を遮断するため不可。代わりに python/node の API/Realtime
  レベルE2E（匿名サインイン＋@supabase/ssr クッキー再構成）で検証する。

Management API 呼び出し例（UA 必須）:
```bash
curl -sS --cacert /root/.ccr/ca-bundle.crt \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "User-Agent: Mozilla/5.0" -H "Accept: application/json" \
  https://api.supabase.com/v1/projects
```

## 6. ゲームルール要約（オリジナルモード）

開始: 各自 1枚(年見える) ＋ トークン2枚（上限5）。自分の番で曲が流れ、年表の正しい位置に**配置**。
任意で曲名＋アーティストを回答 → **両方正解でトークン+1**。**スキップ**(🪙1) / **購入**(🪙3, 自動正配置)。
配置後、他者は**横取り**(🪙1, 自分の年表で正しければ奪取)。**種札を除き10枚**で勝ち。
プロ/エキスパートは獲得に曲名/アーティスト(＋年)正解も必要。

## 7. ブランチ / PR

- 作業ブランチ: `claude/multiplayer-room-google-auth-twq8va`（→ PR #1 → `main`）
- `main` は空コミットから開始（最初の実装をレビュー可能な差分にするため）。
