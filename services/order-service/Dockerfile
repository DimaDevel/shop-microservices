FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/order-service/package.json ./services/order-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY services/order-service/src ./services/order-service/src
COPY services/order-service/tsconfig.json ./services/order-service/
RUN cd services/order-service && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/order-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3004
CMD ["node", "dist/main"]
