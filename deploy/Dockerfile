# Alternative zu nginx auf dem Server: Die Seite läuft in einem Container.
# Bauen und starten (aus dem Projektordner):
#   docker build -t finanzapp -f deploy/Dockerfile .
#   docker run -d --restart unless-stopped -p 80:80 finanzapp
# HTTPS dann über einen Reverse-Proxy davor (z. B. Caddy oder Nginx mit Certbot).
FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js styles.css emojis.js manifest.webmanifest icon-180.png icon-512.png /var/www/finanzapp/
EXPOSE 80
