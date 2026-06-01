FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka/package.json ./packages/kafka/
COPY services/user-service/package.json ./services/user-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY packages/kafka ./packages/kafka
COPY services/user-service/src ./services/user-service/src
COPY services/user-service/tsconfig.json ./services/user-service/
RUN cd services/user-service && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/user-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/kafka ./packages/kafka
EXPOSE 3002
CMD ["node", "dist/main"]
