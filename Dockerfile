FROM node:18

WORKDIR /sermas-toolkit
ADD ./package.json .
RUN npm i
ADD ./* .