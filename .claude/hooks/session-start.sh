#!/bin/bash
# SessionStart hook for Hitstar Online.
# - Installs dependencies (so typecheck/tests/build work) in the web sandbox.
# - Prints a DEV + DEPLOY cheat sheet to stdout, which is added to the session
#   context so a fresh session never forgets how to develop/deploy this project.
# Idempotent and non-interactive. Secrets are never printed (presence only).
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

# 1) Install dependencies (web env only; keep noisy logs OUT of the context).
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
    if npm install >/tmp/hitstar-npm-install.log 2>&1; then
      DEP_STATUS="✅ npm install 完了"
    else
      DEP_STATUS="‼️ npm install 失敗 — /tmp/hitstar-npm-install.log を確認"
    fi
  else
    DEP_STATUS="✅ 依存関係は導入済み（スキップ）"
  fi
else
  DEP_STATUS="ℹ️ ローカル環境のため依存導入はスキップ（必要なら npm install）"
fi

# 2) Cheat sheet → added to session context.
cat <<SHEET
================ Hitstar Online — DEV CHEAT SHEET ================
（このメッセージは .claude/hooks/session-start.sh が毎セッション出力。詳細は CLAUDE.md）

概要 : Hitster風 音楽年代当ての「オンライン対戦」ゲーム
構成 : Next.js15 + React19 + TS / Supabase(Auth,DB,Realtime) / Vercel
状態 : ${DEP_STATUS}

開発コマンド:
  npm run dev          # http://localhost:3000
  npm run test:engine  # ゲームエンジンのスモークテスト(ネット不要/42項目)
  npm run typecheck    # 実質これがリンタ(ESLint未設定)
  npm run build        # 本番ビルド検証
変更後は typecheck と test:engine を必ず通す(= Definition of Done)。

要点:
  - 答え(年/曲名)は room_secrets に隔離、公開stateには youtubeId のみ(アンチチート)
  - engine.ts/deck.ts/rooms.ts/youtube.ts/supabase/admin.ts は「サーバ専用」。
    クライアントから import しない。型は protocol.ts から。
  - ゲーム操作は src/app/api/** がservice roleで権威的に処理(楽観ロック)

デプロイ(詳細 DEPLOY.md / CLAUDE.md §5):
  - Supabase Management API は Cloudflare配下 → User-Agent ヘッダ必須(無いと403/1010)
  - egress で api.supabase.com / api.vercel.com が403なら迂回せずユーザーに許可依頼
  - ⚠️ SUPABASE_DB_URL の wdyquwheodarrmwtljqa は既存"faultray-pro"。
    本ゲーム用は専用Supabaseプロジェクトを新規作成して使う(ユーザー確認の上)
  - Vercel team: mattyopons-projects / Google認証はOAuth client要(匿名は即動作)
SHEET

# 3) Deploy token presence (names only — never values).
echo "デプロイ用トークンの有無:"
for v in SUPABASE_ACCESS_TOKEN VERCEL_TOKEN SUPABASE_DB_URL; do
  if [ -n "${!v:-}" ]; then echo "  ✅ ${v} = set"; else echo "  ❌ ${v} = unset"; fi
done
echo "=================================================================="

exit 0
