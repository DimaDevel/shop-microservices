FROM node:22-alpine AS builder
RUN npm install -g npm@11.6.2 --quiet
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/gateway/package.json ./services/gateway/
COPY services/auth-service/package.json ./services/auth-service/
COPY services/user-service/package.json ./services/user-service/
COPY services/product-service/package.json ./services/product-service/
COPY services/order-service/package.json ./services/order-service/
COPY services/payment-service/package.json ./services/payment-service/
COPY services/pdf-service/package.json ./services/pdf-service/
COPY services/notification-service/package.json ./services/notification-service/
RUN npm ci --legacy-peer-deps
COPY packages/shared/src ./packages/shared/src
COPY packages/kafka ./packages/kafka
COPY services/product-service/src ./services/product-service/src
COPY services/product-service/tsconfig.json ./services/product-service/
RUN cd services/product-service && npx nest build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/services/product-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/kafka ./packages/kafka
EXPOSE 3003
CMD ["node", "dist/main"]
