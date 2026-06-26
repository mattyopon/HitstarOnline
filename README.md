# 🎵 Hitstar Online

離れた友達とオンラインで遊べる、**音楽の年代当てパーティーゲーム**（[Hitster](https://hitstergame.com/) 風）。
曲を聴いて発売年を推理し、自分の「年表」に正しい順番で並べていきます。先に10枚そろえた人が勝ち！

### 🚀 ライブデモ: **https://hitstar-online.vercel.app**
（Googleログイン、または「ゲストとして始める」ですぐ遊べます。フレンドには部屋コードを共有）

- 🔐 **Googleでログイン**（＋ゲストでもすぐ遊べる）
- 🌐 **オンラインの部屋**でフレンドとリアルタイム対戦（部屋コードで参加）
- 🎬 **YouTube** で曲を再生（曲名は伏せたまま再生 → リビールで公開）
- 🃏 **公式フルルール**：配置・**横取り**・**トークン**・**スキップ**・**カード購入**
- ⚙️ バックエンドは **Supabase**（認証 / DB / リアルタイム）、ホスティングは **Vercel**

> ⚠️ 個人利用・学習目的のファンプロジェクトです。音源は YouTube 埋め込みプレーヤーで再生します。

---

## 技術スタック

| 領域 | 採用 |
|---|---|
| フロント / サーバ | Next.js 15 (App Router) + React 19 + TypeScript |
| 認証 | Supabase Auth（Google OAuth ＋ 匿名サインイン） |
| データ / リアルタイム | Supabase Postgres + Realtime（`rooms.state` を購読） |
| ゲームロジック | Next.js API Routes（service role でサーバ権威的に判定） |
| 音楽再生 | YouTube IFrame Player API（ID は実行時に解決＋キャッシュ） |
| デプロイ | Vercel（フロント/関数） + Supabase（DB/認証/Realtime） |

### アーキテクチャ概要

```
ブラウザ ──(Google/匿名ログイン)──▶ Supabase Auth
   │  ▲
   │  └─ Realtime購読: rooms.state（サニタイズ済み公開状態のみ）
   ▼
Next.js API Routes (Vercel) ──service role──▶ Supabase Postgres
   └─ ゲームエンジン(engine.ts)で配置/横取り/トークンを権威的に判定
   └─ 現在の曲の YouTube ID を解決し track_cache にキャッシュ
```

- **答えは絶対にクライアントへ送らない**：現在出題中カードの年/曲名/アーティストは
  `room_secrets`（クライアント参照不可）に保持。公開 `rooms.state` には再生用の
  `youtubeId` のみ。リビール時に初めて答えを公開します。
- すべての操作は API ルートで**サーバ権威的**に処理し、楽観ロック（version）で競合を防止します。

---

## ローカル開発

```bash
npm install

# .env.local を用意（下記）
cp .env.example .env.local   # 値を埋める

npm run dev          # http://localhost:3000
npm run test:engine  # ゲームエンジンのスモークテスト（ネット不要）
npm run typecheck
npm run build
```

`.env.local` に必要な値（取得方法は [DEPLOY.md](./DEPLOY.md)）:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
YOUTUBE_API_KEY=        # 任意（無くてもスクレイピングで解決）
```

---

## デプロイ（Supabase + Vercel）

最短15分で公開できます。**詳しい手順は [DEPLOY.md](./DEPLOY.md) を参照**。要点だけ:

1. **Supabase**：プロジェクト作成 → `supabase/migrations/0001_init.sql` を SQL Editor で実行 →
   Authentication で **匿名サインインを有効化** ＋ **Google プロバイダ** を設定。
2. **Vercel**：このリポジトリを Import → 環境変数（URL / anon / service_role）を設定 → Deploy。
3. デプロイ後の URL を Supabase の **Redirect URLs**（`<URL>/auth/callback`）と
   Google OAuth の承認済みリダイレクトに追加。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/mattyopon/hitstaronline)

> ボタンは既定ブランチをクローンします。PR ブランチで試す場合は Vercel の Import で
> 対象ブランチを選択してください。

---

## 遊び方（フルルール / オリジナル）

1. 各プレイヤーは開始時に1枚（年が見える）と**トークン2枚**を持つ。
2. 自分の番：曲が流れる → 発売年だと思う位置を自分の年表で選んで**配置**。
   - 任意で**曲名＋アーティスト**を回答 → **両方正解でトークン+1**（上限5）。
   - **スキップ**（🪙1）：別の曲に変更。
   - **カード購入**（🪙3）：自動で正しい位置に置いて獲得。
3. 配置後、他プレイヤーは**横取り**できる（🪙1）。出題者が間違っていて、横取り側が
   自分の年表で正しい位置に置けばカードを奪取。
4. **先に10枚**（開始カードを除く）集めたら勝ち！

モード：**オリジナル**（配置のみで獲得・推測でトークン）／**プロ**（配置＋曲名/アーティスト正解が必要）／**エキスパート**。

---

## 楽曲デッキ

`data/deck.json`（101曲・1954〜2023年・洋楽/邦楽）。各曲は `title / artist / year`
を持ち、**YouTube の動画IDは実行時にサーバが解決**して `track_cache` に保存します
（`YOUTUBE_API_KEY` があれば Data API、無ければ検索結果から解決）。曲の追加・差し替えは
JSON を編集するだけです。

---

## ライセンス / 注意

- 学習・個人利用向けのファンメイド作品です。"Hitster" は各権利者の商標です。
- 楽曲は YouTube の埋め込みプレーヤーで再生され、本リポジトリは音源を保持しません。
