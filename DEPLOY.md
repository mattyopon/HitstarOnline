# デプロイ手順（Supabase + Vercel）

所要時間 約15分。Supabase と Vercel の無料プランで動きます。

---

## 1. Supabase プロジェクト

1. <https://supabase.com> でプロジェクトを作成（既存の `wdyquwheodarrmwtljqa` を使う場合はそのまま）。
2. 左メニュー **SQL Editor** を開き、`supabase/migrations/0001_init.sql` の中身を貼り付けて **Run**。
   - テーブル（profiles / rooms / room_members / room_secrets / track_cache）、RLS、
     プロフィール自動作成トリガ、Realtime publication が作成されます。
3. **Project Settings → API** で以下を控える：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`（**秘密。サーバ専用**）

### CLI で行う場合（任意）

```bash
npm i -g supabase
supabase login                       # SUPABASE_ACCESS_TOKEN でも可
supabase link --project-ref <your-ref>
supabase db push                     # マイグレーション適用
# 認証設定(config.toml)も反映する場合:
SITE_URL=https://<your-app>.vercel.app \
GOOGLE_CLIENT_ID=xxx GOOGLE_SECRET=yyy \
supabase config push
```

---

## 2. 認証（Authentication）

Supabase ダッシュボード **Authentication → Providers / Sign In**：

1. **Anonymous Sign-ins を ON**（ゲストですぐ遊べるように）。
2. **Google** を有効化し、`Client ID` と `Client Secret` を設定。
   - Google Cloud Console → 「APIとサービス → 認証情報 → OAuth クライアント ID（ウェブ）」を作成。
   - **承認済みのリダイレクト URI** に Supabase のコールバックを追加：
     `https://<your-ref>.supabase.co/auth/v1/callback`
3. **Authentication → URL Configuration**：
   - `Site URL` に本番URL（例 `https://<your-app>.vercel.app`）
   - `Redirect URLs` に `https://<your-app>.vercel.app/auth/callback` と
     `http://localhost:3000/auth/callback` を追加。

> Google 設定が未完でも、**ゲスト（匿名）ログインだけで全機能を試せます**。

---

## 3. Vercel デプロイ

1. <https://vercel.com> でこのリポジトリ（`mattyopon/hitstaronline`）を **Import**。
   - PR ブランチを試す場合は Import 時に対象ブランチを選択。
2. **Environment Variables** に設定：

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key（Secret） |
   | `YOUTUBE_API_KEY` | 任意（無くても可） |

3. **Deploy** を実行 → 発行された URL を控える。
4. その URL を **手順2-3** の Supabase Redirect URLs と、必要なら Google OAuth に反映。

### CLI で行う場合（任意）

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel --prod
```

---

## 4. 動作確認

1. 本番URLを開く → 「ゲストとして始める」または「Googleでログイン」。
2. 「部屋を作る」→ 表示された**部屋コード**を別ブラウザ/スマホで「参加」。
3. ホストが「ゲーム開始」（2人以上）。曲が流れ、年表に配置 → 横取り → リビール。

うまく動かないときの確認ポイントは下表。

| 症状 | 原因 / 対処 |
|---|---|
| ログインできない | Supabase の Provider 設定 / Redirect URLs を確認 |
| ゲスト参加が無効 | Anonymous Sign-ins を ON |
| 参加しても画面が更新されない | Realtime が `rooms` を publication に含むか（マイグレーション再実行） |
| 音が出ない | 初回の「タップして開始」を押す。曲が見つからない場合は `YOUTUBE_API_KEY` 設定を検討 |
| 「サーバーエラー」 | Vercel に `SUPABASE_SERVICE_ROLE_KEY` 等の環境変数が設定済みか |

---

## このサンドボックスから自動デプロイできない理由

本リポジトリを生成した実行環境では、組織のネットワークポリシーにより
`api.supabase.com`（Supabase Management API / CLI）と `api.vercel.com`（Vercel デプロイ）
への通信が **403 で遮断**されています。そのため、コードの作成・型チェック・本番ビルドの
検証までは完了していますが、**この環境から直接デプロイして本番URLを払い出すことはできません**。

URL を取得するには次のいずれかを行ってください：

- **A. 自分でデプロイ**（推奨・上記手順、約15分）。
- **B. ネットワーク許可**：環境のegressポリシーで上記2ホストを許可すれば、
  設定済みの `SUPABASE_ACCESS_TOKEN` / `VERCEL_TOKEN` を使って自動デプロイを代行できます。
