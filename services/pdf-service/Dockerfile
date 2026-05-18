FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/pdf-service/package.json ./services/pdf-service/
RUN npm ci
COPY packages/shared/src ./packages/shared/src
COPY services/pdf-service/src ./services/pdf-service/src
COPY services/pdf-service/tsconfig.json ./services/pdf-service/
RUN cd services/pdf-service && npx nest build

FROM node:20-alpine
WORKDIR /app
RUN mkdir -p /app/pdfs
COPY --from=builder /app/services/pdf-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3005
CMD ["node", "dist/main"]
