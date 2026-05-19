FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/product-service/package.json ./services/product-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY packages/kafka ./packages/kafka
COPY services/product-service/src ./services/product-service/src
COPY services/product-service/tsconfig.json ./services/product-service/
RUN cd services/product-service && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/product-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/kafka ./packages/kafka
EXPOSE 3003
CMD ["node", "dist/main"]
