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
COPY services/notification-service/src ./services/notification-service/src
COPY services/notification-service/tsconfig.json ./services/notification-service/
RUN cd services/notification-service && npx nest build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3006
CMD ["node", "dist/main"]
