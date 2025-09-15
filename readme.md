# 1) Crear proyecto
mkdir smokeeat-backend && cd smokeeat-backend


# 2) Inicializar + deps
npm init -y
npm i express cors helmet bcryptjs jsonwebtoken zod dotenv express-rate-limit mysql2 uuid
npm i -D typescript ts-node-dev @types/express @types/jsonwebtoken @types/cors @types/bcryptjs @types/node


# 3) TS config
npx tsc --init # usa el tsconfig del doc


# 4) Copiá los archivos del doc en tu repo


# 5) Config .env con las credenciales MySQL de Hostinger


# 6) Crear tablas en MySQL remoto (ejecutá sql/schema.sql en tu instancia)
# y seed de tiers (sql/seed.sql) o el script Node seed.ts


# 7) Levantar
npm run dev