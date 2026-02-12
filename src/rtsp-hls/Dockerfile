FROM alpine:latest

RUN apk add --no-cache \
    ffmpeg \
    nginx \
    bash

COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
