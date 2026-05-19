FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/payment-service/package.json ./services/payment-service/
RUN npm install
COPY packages/shared ./packages/shared
COPY packages/kafka ./packages/kafka
COPY services/payment-service ./services/payment-service
RUN npm run build --prefix services/payment-service

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/kafka ./packages/kafka
COPY --from=builder /app/services/payment-service/dist ./dist
CMD ["node", "dist/main"]
