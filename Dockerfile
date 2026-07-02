# Keep Android Open — production image
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
