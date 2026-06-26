import { json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WeChat OAuth callback — SCAFFOLD ONLY.
export async function GET(req: Request) {
  const enabled = process.env.NEXT_PUBLIC_WECHAT_ENABLED === "true";
  if (!enabled) return json({ error: "WeChatログインは準備中です" }, 501);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return json({ error: "Invalid callback" }, 400);
  // Real flow (NOT implemented):
  //  1. Verify `state` (CSRF).
  //  2. POST https://api.weixin.qq.com/sns/oauth2/access_token?appid&secret&code&grant_type
  //  3. GET  https://api.weixin.qq.com/sns/userinfo?access_token&openid → {openid,unionid,nickname,headimgurl}
  //  4. Bridge to Supabase (admin createUser keyed by unionid, or a custom JWT), set the
  //     session cookie, then redirect to /. Requires WeChat Open Platform creds + ICP.
  return json({ error: "WeChatログインは未実装です" }, 501);
}
