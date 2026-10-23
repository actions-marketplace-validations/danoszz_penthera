# node:22-alpine, pinned by digest (multi-arch index). Dependabot bumps it.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

LABEL org.opencontainers.image.source="https://github.com/danoszz/penthera"
LABEL org.opencontainers.image.description="Offline, rule-based security checks for your repo, dependencies, AI agent config and local app."

WORKDIR /penthera

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY lib ./lib
COPY skills ./skills
COPY docs ./docs
COPY pentest.config.example.js ./

ENV NODE_ENV=production
ENV NO_COLOR=1

RUN mkdir -p /penthera/reports && chown node:node /penthera/reports
USER node

ENTRYPOINT ["node", "bin/penthera.js"]
CMD ["--help"]
