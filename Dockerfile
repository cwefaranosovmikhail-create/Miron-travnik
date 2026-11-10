FROM node:22-alpine

WORKDIR /app
COPY index.html ./index.html

ENV PORT=3000
EXPOSE 3000

CMD ["node", "-e", "require('node:http').createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(require('node:fs').readFileSync('/app/index.html'))}).listen(process.env.PORT||3000,'0.0.0.0')"]
