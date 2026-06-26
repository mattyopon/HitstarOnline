import { json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WeChat OAuth initiation — SCAFFOLD ONLY. Gated by env; returns 501 until a real
// integration lands (Supabase has no native WeChat provider).
export async function GET() {
  const enabled = process.env.NEXT_PUBLIC_WECHAT_ENABLED === "true";
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!enabled || !appId || !appSecret) {
    return json({ error: "WeChatログインは準備中です" }, 501);
  }
  // Real flow (NOT implemented): build a CSRF `state`, then redirect to
  // https://open.weixin.qq.com/connect/qrconnect?appid=<APPID>
  //   &redirect_uri=<encoded origin>/api/auth/wechat/callback
  //   &response_type=code&scope=snsapi_login&state=<state>#wechat_redirect
  return json({ error: "WeChatログインは未実装です" }, 501);
}
