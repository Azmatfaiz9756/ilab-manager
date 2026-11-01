FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/backend/package*.json ./apps/backend/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Build shared library
RUN cd packages/shared && npm run build

# Generate Prisma and build backend
RUN cd apps/backend && npx prisma generate && npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000

CMD ["sh", "-c", "cd apps/backend && npx prisma db push && npm run start"]
