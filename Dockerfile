FROM oven/bun:1.1

WORKDIR /usr/app

COPY package.json ./
RUN bun install

COPY . .

EXPOSE 8888

CMD ["bun", "run", "start"]
