FROM node:19-alpine3.15
WORKDIR /usr/app
COPY ./app.js ./package.json ./index.html ./init.sql ./
RUN npm install
EXPOSE 5002
ENTRYPOINT ["node", "app.js"]