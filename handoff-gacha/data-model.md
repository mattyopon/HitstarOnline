# Gacha レイヤー追加時のデータモデル設計

Supabase に追加すべきテーブル / カラム / RPC の設計案。

---

## 🗄️ 追加テーブル

### `player_gems` — プレイヤーのリソース
```sql
CREATE TABLE player_gems (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gems INT NOT NULL DEFAULT 500,           -- 💎 プレミアム通貨（ガチャ用）
  notes INT NOT NULL DEFAULT 3000,         -- 🎵 通常通貨（強化用）
  tokens INT NOT NULL DEFAULT 0,           -- 🪙 対戦用トークン（既存とは別、ガチャログイン報酬）
  daily_pull_at TIMESTAMPTZ,               -- 最終フリープル時刻
  pity_count INT NOT NULL DEFAULT 0,       -- 天井カウンター（0〜90）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE player_gems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player reads own gems" ON player_gems FOR SELECT USING (auth.uid() = user_id);
-- writes only via service role
```

### `player_characters` — 所有キャラ
```sql
CREATE TABLE player_characters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,              -- 'synthea', 'velvet' 等（gachaChars.tsの id と対応）
  level INT NOT NULL DEFAULT 1,
  dupes INT NOT NULL DEFAULT 0,            -- 凸カウント
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, character_id)
);
ALTER TABLE player_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player reads own chars" ON player_characters FOR SELECT USING (auth.uid() = user_id);
```

### `player_party` — 現在編成中のパーティ（最大5人）
```sql
CREATE TABLE player_party (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot INT NOT NULL CHECK (slot BETWEEN 0 AND 4),
  character_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);
ALTER TABLE player_party ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player reads own party" ON player_party FOR SELECT USING (auth.uid() = user_id);
```

### `gacha_pulls` — ガチャロール履歴（分析・ピティ判定用）
```sql
CREATE TABLE gacha_pulls (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_id TEXT NOT NULL,                 -- 'showa_genesis' 等
  character_id TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('SSR','SR','R')),
  pity_at INT NOT NULL,                    -- ロール時点でのpity count
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON gacha_pulls (user_id, pulled_at DESC);
ALTER TABLE gacha_pulls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player reads own pulls" ON gacha_pulls FOR SELECT USING (auth.uid() = user_id);
```

---

## 🎣 API エンドポイント

### `POST /api/gacha/roll`
Body: `{ count: 1 | 10, banner: string }`
- サーバー権威で確率判定
- ジェムを消費（×1=160, ×10=1440）
- 結果を `player_characters` / `gacha_pulls` に書き込み
- レスポンス：`{ results: [{ characterId, rarity, isNew }], gemsRemaining }`

### `POST /api/gacha/daily-pull`
- 24時間に1回無料
- `player_gems.daily_pull_at` をチェック

### `POST /api/party/set`
Body: `{ slot: 0-4, characterId: string | null }`
- 所有キャラ・スロット範囲をバリデート

### `GET /api/character/list`
- 現在の所有キャラ・パーティ・リソースを一括返却

---

## 📊 レアリティ抽選アルゴリズム

```typescript
// src/lib/gachaRoll.ts
export function rollOne(pityCount: number): { rarity: 'SSR'|'SR'|'R', pityNew: number } {
  if (pityCount >= 89) return { rarity: 'SSR', pityNew: 0 };
  const r = Math.random();
  if (r < 0.03) return { rarity: 'SSR', pityNew: 0 };
  if (r < 0.15) return { rarity: 'SR', pityNew: pityCount + 1 };
  return { rarity: 'R', pityNew: pityCount + 1 };
}

// pickup logic (50/50 SSR = feature vs off-banner)
export function pickCharacter(rarity: 'SSR'|'SR'|'R', banner: string, pool: Character[]): string {
  const filtered = pool.filter(c => c.rarity === rarity);
  if (rarity === 'SSR' && banner) {
    const pickupId = getBannerPickup(banner);
    if (Math.random() < 0.5) return pickupId;
  }
  return filtered[Math.floor(Math.random() * filtered.length)].id;
}
```

---

## 🔧 初回プレイヤーのシード

`SignIn.tsx` の onSuccess 内で以下を呼ぶ RPC を追加：

```sql
CREATE OR REPLACE FUNCTION public.seed_new_player()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO player_gems (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  -- 初回スタータの3体を付与
  INSERT INTO player_characters (user_id, character_id) VALUES
    (auth.uid(), 'synthea'),
    (auth.uid(), 'popciel'),
    (auth.uid(), 'lofi')
  ON CONFLICT DO NOTHING;
  -- デフォルトパーティに配置
  INSERT INTO player_party (user_id, slot, character_id) VALUES
    (auth.uid(), 0, 'synthea'),
    (auth.uid(), 1, 'popciel'),
    (auth.uid(), 2, 'lofi')
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.seed_new_player() TO authenticated;
```

---

## ⚡ TypeScript 型

```typescript
// src/lib/gachaTypes.ts
export type Rarity = 'SSR' | 'SR' | 'R';
export type Attribute = 'STAR' | 'POP' | 'LIGHT' | 'SHADOW' | 'DREAM' | 'GRACE';
export type Era = '1960s' | '1970s' | '1980s' | '1990s' | '2000s' | '2010s' | '2020s';

export interface Character {
  id: string;
  nm: string;
  jp: string;
  era: Era;
  attr: Attribute;
  rarity: Rarity;
  lv: number;
  img: string;
  quote: string;
  atk: number;
  def: number;
  spd: number;
  focus: string;
}

export interface PlayerGems {
  gems: number;
  notes: number;
  tokens: number;
  pityCount: number;
  dailyPullAt: string | null;
}

export interface PlayerCharacter {
  characterId: string;
  level: number;
  dupes: number;
  acquiredAt: string;
}
```
