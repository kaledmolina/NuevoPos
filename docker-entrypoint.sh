#!/bin/sh
set -e

# Si la URL de conexión es MySQL, adaptar automáticamente el schema a MySQL
if echo "$DATABASE_URL" | grep -q "^mysql"; then
  echo "🐬 Configurando Prisma para MySQL..."
  sed -i 's/provider = "sqlite"/provider = "mysql"/' prisma/schema.prisma
  rm -rf node_modules/.prisma
  ./node_modules/.bin/prisma generate
fi

echo "➡️ Ejecutando migraciones de Prisma..."
./node_modules/.bin/prisma db push --accept-data-loss

echo "🌱 Inicializando Superadmin y datos esenciales..."
node scripts/seed-auto.mjs

echo "🚀 Iniciando servidor OmniPOS en puerto ${PORT:-3000}..."
exec node server.js
