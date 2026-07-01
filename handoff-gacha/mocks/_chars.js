// 15-character roster for the unified BILIBILI pattern
window.CHARS = [
  // ── SSR × 3 ──────────────────────────────────────────
  { id:'synthea',  nm:'Synthea Neon',    jp:'シンセア・ネオン',   era:'1980s', attr:'STAR',   rarity:'SSR', lv:42, img:'img/char-synthea.jpg',  quote:'光に乗って、踊りましょう♪',           atk:1820, def:940,  spd:128, focus:'30% 12%' },
  { id:'popciel',  nm:'Popciel Candy',   jp:'ポップシエル',       era:'2000s', attr:'POP',    rarity:'SSR', lv:35, img:'img/char-popciel.jpg',   quote:'ピース！キミとつながりたいな♡',         atk:1640, def:880,  spd:142, focus:'50% 5%' },
  { id:'stellaris',nm:'EDM Stellaris',   jp:'ステラリス',         era:'2010s', attr:'LIGHT',  rarity:'SSR', lv:22, img:'img/char-stellaris.jpg', quote:'このフロアは私のステージ！',           atk:1780, def:780,  spd:165, focus:'50% 10%' },

  // ── SR × 6 ───────────────────────────────────────────
  { id:'grungia',  nm:'Grungia Noir',    jp:'グランジア',         era:'1990s', attr:'SHADOW', rarity:'SR',  lv:28, img:'img/char-grungia.jpg',   quote:'ノイズの中に、私はいる。',             atk:1450, def:1050, spd:118, focus:'50% 12%' },
  { id:'lofi',     nm:'Lo-fi Muse',      jp:'ローファイ',         era:'2020s', attr:'DREAM',  rarity:'SR',  lv:18, img:'img/char-lofi.jpg',      quote:'…ねぇ、もう少しだけ眠らせて？',         atk:1280, def:1180, spd:108, focus:'50% 10%' },
  { id:'velvet',   nm:'Velvet Lin',      jp:'ヴェルヴェット・リン', era:'1960s', attr:'GRACE',  rarity:'SR',  lv:24, img:'img/char-velvet.jpg',    quote:'昔の歌、聴いてくれる？',               atk:1420, def:1020, spd:124, focus:'50% 10%' },
  { id:'meilan',   nm:'Mei Lan',         jp:'メイラン',           era:'1990s', attr:'SHADOW', rarity:'SR',  lv:30, img:'img/char-meilan.jpg',    quote:'撃ち抜くよ、私のリフで。',             atk:1620, def:880,  spd:138, focus:'50% 10%' },
  { id:'mirage',   nm:'Mirage Yumi',     jp:'ミラージュ由美',     era:'2010s', attr:'LIGHT',  rarity:'SR',  lv:19, img:'img/char-mirage.jpg',    quote:'いっしょに光らせちゃおっ★',           atk:1380, def:920,  spd:158, focus:'50% 8%' },
  { id:'nova',     nm:'Nova Lyra',       jp:'ノヴァ・ライラ',     era:'1980s', attr:'STAR',   rarity:'SR',  lv:27, img:'img/char-nova.jpg',      quote:'スポットライト、私だけのもの♡',       atk:1560, def:920,  spd:132, focus:'50% 10%' },

  // ── R × 6 ────────────────────────────────────────────
  { id:'sakura',   nm:'Sakura Akane',    jp:'朱音サクラ',         era:'1970s', attr:'GRACE',  rarity:'R',   lv:16, img:'img/char-sakura.jpg',    quote:'今夜は、ジャズね。',                    atk:1180, def:1080, spd:114, focus:'50% 12%' },
  { id:'cocoa',    nm:'Cocoa Tsubaki',   jp:'ココア椿',           era:'1990s', attr:'POP',    rarity:'R',   lv:14, img:'img/char-cocoa.jpg',     quote:'お代わり、いる…？べ、別に！',           atk:1080, def:1180, spd:128, focus:'50% 10%' },
  { id:'honey',    nm:'Honey Hina',      jp:'ハニーヒナ',         era:'2000s', attr:'POP',    rarity:'R',   lv:17, img:'img/char-honey.jpg',     quote:'カセット聴く？私のおすすめ♪',          atk:1140, def:1140, spd:122, focus:'50% 10%' },
  { id:'ruby',     nm:'Ruby Kurenai',    jp:'紅蘭ルビー',         era:'2010s', attr:'STAR',   rarity:'R',   lv:20, img:'img/char-ruby.jpg',      quote:'ジャズと炎、どっちが熱い？',           atk:1280, def:980,  spd:120, focus:'50% 8%' },
  { id:'lilac',    nm:'Lilac Yua',       jp:'ライラック優亜',     era:'2020s', attr:'DREAM',  rarity:'R',   lv:15, img:'img/char-lilac.jpg',     quote:'え？私を…選んでくれるの…？',           atk:1020, def:1240, spd:104, focus:'50% 10%' },
  { id:'aria',     nm:'Aria Iki',        jp:'アリア粋',           era:'2000s', attr:'LIGHT',  rarity:'R',   lv:18, img:'img/char-aria.jpg',      quote:'ターンテーブル、回しちゃう？',         atk:1220, def:980,  spd:148, focus:'50% 8%' },
];

// Color tokens for rarity flair
window.RARITY = {
  SSR: { bg:'linear-gradient(180deg,#ff8a3d,#ff5a1a)', text:'#fff', glow:'rgba(255,138,61,.5)' },
  SR:  { bg:'linear-gradient(180deg,#bd87ff,#9050d0)', text:'#fff', glow:'rgba(189,135,255,.4)' },
  R:   { bg:'linear-gradient(180deg,#7ec6ff,#3a8ad0)', text:'#fff', glow:'rgba(126,198,255,.4)' },
};
