FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
# Exec-форма (в квадратных скобках) — это важно!
CMD ["node", "server.js"]
