#!/bin/sh
set -e

echo "➡️ Ejecutando migraciones de Prisma..."
./node_modules/.bin/prisma db push --accept-data-loss

echo "🚀 Iniciando servidor OmniPOS en puerto ${PORT:-3000}..."
exec node server.js
