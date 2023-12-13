FROM --platform=amd64 node:20-alpine

WORKDIR /srv

ADD *.json  ./

RUN npm ci

ADD ./dist ./dist
ADD ./views ./views

USER node

CMD npm run start:prod
