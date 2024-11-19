FROM node:19-alpine3.15
WORKDIR /usr/app
COPY ./worker.js ./package.json ./
RUN npm install
EXPOSE 5002
ENTRYPOINT ["node", "worker.js"]