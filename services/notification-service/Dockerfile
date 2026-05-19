FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/notification-service/package.json ./services/notification-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY packages/kafka ./packages/kafka
COPY services/notification-service/src ./services/notification-service/src
COPY services/notification-service/tsconfig.json ./services/notification-service/
RUN cd services/notification-service && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3006
CMD ["node", "dist/main"]
