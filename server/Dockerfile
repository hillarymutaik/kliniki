# Build from the repository root, because the server reuses the app's business rules in src/domain:
#   docker build -f server/Dockerfile -t kliniki-api .

FROM node:24-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY server server
COPY src/domain src/domain
RUN cd server && npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist dist
COPY server/migrations migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Run migrations first with:  node dist/migrate-cli.js   (needs DATABASE_OWNER_URL)
CMD ["node", "dist/index.js"]
