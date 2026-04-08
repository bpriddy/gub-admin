# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080

# Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma client for runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 8080
CMD ["node", "server.js"]
