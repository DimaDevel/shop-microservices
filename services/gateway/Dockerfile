FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/gateway/package.json ./services/gateway/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY services/gateway/src ./services/gateway/src
COPY services/gateway/tsconfig.json ./services/gateway/
RUN cd services/gateway && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main"]
