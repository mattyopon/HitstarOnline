#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// Bilibili VUP カバー動画ハーベスタ（★あなたのPCで実行するツール★）
//
// なぜローカル実行か: 開発環境からは bilibili.com への通信が遮断されているため、
// BV番号の収集・実在確認はあなたの回線からしかできません。このスクリプトは
// Bilibili の公開Web API（wbi署名付き）を叩いて、VUPのカバー動画一覧を
// bilibili-harvest.json に書き出します。結果ファイルをチャットにアップロード
// してもらえば、原曲マッチ＋年代付与してデッキに一括投入します。
//
// 使い方:
//   1) Node.js 18+ を用意（このリポジトリが動く環境ならOK）
//   2) 必要なら scripts/bilibili-harvest.config.json の keywords / vups を編集
//   3) 実行:  node scripts/bilibili-harvest.mjs
//      ログイン状態で叩きたい場合（推奨・レート制限に強い）:
//        ブラウザで bilibili.com を開く → F12 → Network → 任意のリクエストの
//        Cookie ヘッダ値を丸ごとコピー → 環境変数に入れて実行:
//        BILI_COOKIE='(コピーした値)' node scripts/bilibili-harvest.mjs
//      ※Cookieはあなたのマシンから出ません（出力JSONには含まれません）
//   4) 出来上がった bilibili-harvest.json をチャットにアップロード
//
// 注意: 公開APIを常識的なレート（約1リクエスト/秒）で読むだけの読み取り専用
// ツールです。書き込み・自動視聴などは一切しません。
// ───────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, "bilibili-harvest.config.json");
const OUT_PATH = join(process.cwd(), "bilibili-harvest.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const headers = {
  "User-Agent": UA,
  Referer: "https://www.bilibili.com/",
  Accept: "application/json",
};
if (process.env.BILI_COOKIE) headers.Cookie = process.env.BILI_COOKIE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash("md5").update(s).digest("hex");

// ── wbi 署名（Bilibili Web APIの標準署名方式・公開仕様）─────────────────────
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];
let mixinKey = null;
async function getMixinKey() {
  if (mixinKey) return mixinKey;
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers });
  const j = await res.json();
  const img = j?.data?.wbi_img?.img_url ?? "";
  const sub = j?.data?.wbi_img?.sub_url ?? "";
  const raw =
    img.split("/").pop().split(".")[0] + sub.split("/").pop().split(".")[0];
  mixinKey = MIXIN_TAB.map((i) => raw[i]).join("").slice(0, 32);
  return mixinKey;
}
async function wbiSign(params) {
  const key = await getMixinKey();
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(p)
    .sort()
    .map((k) => {
      const v = String(p[k]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .join("&");
  return `${query}&w_rid=${md5(query + key)}`;
}

async function apiGet(path, params) {
  const qs = await wbiSign(params);
  const url = `https://api.bilibili.com${path}?${qs}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      const j = await res.json();
      if (j.code === 0) return j.data;
      // -412 = リスクコントロール（Cookie無し高頻度アクセスで出やすい）
      console.warn(`  API code=${j.code} (${j.message}) — attempt ${attempt}`);
      if (j.code === -412) await sleep(15000);
      else await sleep(3000);
    } catch (e) {
      console.warn(`  fetch error: ${e.message} — attempt ${attempt}`);
      await sleep(3000);
    }
  }
  return null;
}

const stripEm = (s) => String(s ?? "").replace(/<\/?em[^>]*>/g, "");

// キーワード動画検索（1ページ=最大約40件程度）
async function searchVideos(keyword, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page++) {
    const data = await apiGet("/x/web-interface/wbi/search/type", {
      search_type: "video",
      keyword,
      page,
      order: "click", // 再生数順 = 人気カバー優先
    });
    const list = data?.result ?? [];
    for (const v of list) {
      if (!v.bvid) continue;
      rows.push({
        bvid: v.bvid,
        title: stripEm(v.title),
        author: v.author,
        mid: v.mid,
        play: v.play,
        duration: v.duration, // "mm:ss"
        pubdate: v.pubdate ? new Date(v.pubdate * 1000).toISOString().slice(0, 10) : "",
        from: `search:${keyword}`,
      });
    }
    console.log(`  [search] "${keyword}" p${page}: +${list.length}`);
    if (!list.length) break;
    await sleep(1200);
  }
  return rows;
}

// UP主の投稿動画一覧（mid指定・再生数順）
async function spaceVideos(name, mid, max) {
  const rows = [];
  const ps = 30;
  for (let pn = 1; rows.length < max; pn++) {
    const data = await apiGet("/x/space/wbi/arc/search", {
      mid,
      pn,
      ps,
      order: "click",
    });
    const list = data?.list?.vlist ?? [];
    for (const v of list) {
      rows.push({
        bvid: v.bvid,
        title: stripEm(v.title),
        author: v.author || name,
        mid: v.mid ?? mid,
        play: v.play,
        duration: v.length,
        pubdate: v.created ? new Date(v.created * 1000).toISOString().slice(0, 10) : "",
        from: `space:${name}`,
      });
    }
    console.log(`  [space] ${name}(${mid}) p${pn}: +${list.length}`);
    if (list.length < ps) break;
    await sleep(1200);
  }
  return rows.slice(0, max);
}

async function main() {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const pages = cfg.pagesPerKeyword ?? 2;
  const maxPerSpace = cfg.maxPerSpace ?? 100;
  const all = [];

  console.log(`keywords: ${cfg.keywords.length}, vups(mid付き): ${cfg.vups.filter((v) => v.mid).length}`);
  if (!process.env.BILI_COOKIE) {
    console.log("(ヒント) BILI_COOKIE 未設定。エラー -412 が頻発する場合はログインCookieを設定してください。");
  }

  for (const kw of cfg.keywords) {
    all.push(...(await searchVideos(kw, pages)));
  }
  for (const vup of cfg.vups) {
    if (vup.mid) all.push(...(await spaceVideos(vup.name, vup.mid, maxPerSpace)));
  }

  // bvid で重複排除し、再生数降順に
  const byId = new Map();
  for (const r of all) {
    if (!byId.has(r.bvid) || (r.play ?? 0) > (byId.get(r.bvid).play ?? 0)) byId.set(r.bvid, r);
  }
  const rows = [...byId.values()].sort((a, b) => (b.play ?? 0) - (a.play ?? 0));
  writeFileSync(OUT_PATH, JSON.stringify({ harvestedAt: new Date().toISOString(), rows }, null, 1), "utf8");
  console.log(`\nDONE: ${rows.length} unique videos -> ${OUT_PATH}`);
  console.log("このファイルをチャットにアップロードしてください。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
