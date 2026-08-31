# Finansal Jarvis — çok aşamalı derleme.
#
# İki aşama olmasının sebebi `better-sqlite3`: yerel (native) derlenen bir modül ve
# kurulumu için python3/make/g++ gerekiyor. Bunları nihai imaja koymak, çalışma
# zamanında hiç kullanılmayacak ~250 MB derleyici taşımak demekti.

# ── Aşama 1: bağımlılıklar ───────────────────────────────────────────────────
FROM node:22-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev: test/tip paketleri üretime girmez. tsx bilinçli olarak `dependencies`
# altında — TypeScript doğrudan çalıştırılıyor, ayrı bir derleme adımı yok.
RUN npm ci --omit=dev

# ── Aşama 2: çalışma zamanı ──────────────────────────────────────────────────
FROM node:22-slim AS runtime

# tzdata olmadan konteyner saat dilimini çözemez ve TZ ayarı sessizce UTC'de kalır —
# brifingler yanlış saatte giderdi.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=Europe/Istanbul \
    DB_PATH=/app/data/jarvis.db

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Veritabanı dizini volume'e bağlanır; root olmayan kullanıcı yazabilmeli.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

# Uzun yoklama (long polling) kullanıldığı için AÇILAN PORT YOK — sunucunun
# dışarıya hiçbir şey sunması gerekmiyor, saldırı yüzeyi o kadar küçük.
CMD ["npx", "tsx", "src/index.ts"]
