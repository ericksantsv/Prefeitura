import 'dotenv/config' // 1. Carrega o arquivo .env para o Node ler a URL
import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const fastify = Fastify({ logger: true })

// 2. Cria a piscina (Pool) de conexões usando a URL do Supabase
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// 3. Instancia o Driver Adapter exigido pelo Prisma 7
const adapter = new PrismaPg(pool)

// 4. Inicializa o cliente injetando o adapter de conexão
const prisma = new PrismaClient({ adapter })

// Rota de teste para ver se a API está viva
fastify.get('/', async (request, reply) => {
  return { message: 'API do Resolve Aí está online!' }
})

// Rota que o App vai usar para listar os alertas no mapa de Uberaba
fastify.get('/alerts', async (request, reply) => {
  try {
    const alerts = await prisma.alert.findMany()
    return alerts
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao buscar alertas no banco' })
  }
})

// Iniciar o servidor na porta 3333
const start = async () => {
  try {
    await fastify.listen({ port: 3333, host: '0.0.0.0' })
    console.log('🚀 Servidor rodando em http://localhost:3333')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()