#!/bin/sh
set -e

echo "➡️ Ejecutando migraciones de Prisma..."
npx prisma db push --skip-generate

echo "🚀 Iniciando servidor OmniPOS en puerto ${PORT:-3000}..."
exec node server.js
