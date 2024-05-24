FROM node:22-alpine3.20

WORKDIR /app

ADD package.json package.json
ADD package-lock.json package-lock.json

RUN npm install

ADD . .

RUN npm run build

ENTRYPOINT [ "npm" ]
CMD [ "run", "start" ]
