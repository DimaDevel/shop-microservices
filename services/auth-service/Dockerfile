FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/auth-service/package.json ./services/auth-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY services/auth-service/src ./services/auth-service/src
COPY services/auth-service/tsconfig.json ./services/auth-service/
RUN cd services/auth-service && npx nest build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/main"]
