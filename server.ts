import 'dotenv/config' // 1. Carrega o arquivo .env para o Node ler a URL
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { PrismaClient } from './generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { randomUUID } from 'crypto'

const fastify = Fastify({ logger: true })

// Permite que as rotas recebam multipart/form-data (upload de arquivos)
fastify.register(multipart)

// Cliente do Supabase Storage (usa a Service Role Key, que tem permissão de escrita)
// IMPORTANTE: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar no .env
// Como só usamos Storage (não Realtime), desativamos o módulo de realtime
// e passamos o pacote "ws" para evitar o erro de WebSocket no Node 20.
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    realtime: {
      transport: ws as any,
    },
  }
)

const BUCKET_NAME = 'alert-photos'

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

// ============================================================
// ROTAS DE ALERT (Ocorrências / Alertas Urbanos)
// ============================================================

// Listar todos os alertas (com filtros opcionais por query string)
// Ex: /alerts?status=PENDING&category=Asfalto
fastify.get('/alerts', async (request, reply) => {
  const { status, category } = request.query as { status?: string; category?: string }

  try {
    const alerts = await prisma.alert.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { id: 'desc' },
    })
    return alerts
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao buscar alertas no banco' })
  }
})

// Buscar um alerta específico pelo id
fastify.get('/alerts/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const alert = await prisma.alert.findUnique({ where: { id } })

    if (!alert) {
      return reply.status(404).send({ error: 'Alerta não encontrado' })
    }

    return alert
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao buscar alerta no banco' })
  }
})

// Criar um novo alerta (recebe multipart/form-data: campos de texto + arquivo(s) de foto)
fastify.post('/alerts', async (request, reply) => {
  try {
    const parts = request.parts()

    const fields: Record<string, string> = {}
    const photoUrls: string[] = []

    for await (const part of parts) {
      if (part.type === 'file') {
        // Faz upload de cada foto enviada para o bucket do Supabase Storage
        const buffer = await part.toBuffer()
        const extensao = part.filename?.split('.').pop() ?? 'jpg'
        const nomeArquivo = `${randomUUID()}.${extensao}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(nomeArquivo, buffer, {
            contentType: part.mimetype,
          })

        if (uploadError) {
          fastify.log.error(uploadError)
          return reply.status(500).send({ error: 'Erro ao enviar foto para o Storage' })
        }

        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(nomeArquivo)

        photoUrls.push(publicUrlData.publicUrl)
      } else {
        // Campos de texto comuns (title, description, category, latitude, longitude, userId)
        fields[part.fieldname] = part.value as string
      }
    }

    const { title, description, category, latitude, longitude, userId } = fields

    if (!title || !description || !category || !latitude || !longitude || !userId) {
      return reply.status(400).send({ error: 'Campos obrigatórios: title, description, category, latitude, longitude, userId' })
    }

    const alert = await prisma.alert.create({
      data: {
        title,
        description,
        category,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        photos: photoUrls,
        status: 'PENDING',
        userId,
      },
    })

    return reply.status(201).send(alert)
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao criar alerta' })
  }
})

// Atualizar um alerta existente (ex: trocar status, editar descrição etc)
fastify.put('/alerts/:id', async (request, reply) => {
  const { id } = request.params as { id: string }
  const { title, description, category, status, photos } = request.body as {
    title?: string
    description?: string
    category?: string
    status?: string
    photos?: string[]
  }

  try {
    const existing = await prisma.alert.findUnique({ where: { id } })

    if (!existing) {
      return reply.status(404).send({ error: 'Alerta não encontrado' })
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(photos !== undefined ? { photos } : {}),
      },
    })

    return alert
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao atualizar alerta no banco' })
  }
})

// Atualizar somente o status do alerta (rota auxiliar bem comum em apps de prefeitura)
// Ex: PATCH /alerts/123/status  body: { "status": "RESOLVED" }
fastify.patch('/alerts/:id/status', async (request, reply) => {
  const { id } = request.params as { id: string }
  const { status } = request.body as { status: string }

  const statusValidos = ['PENDING', 'APPROVED', 'RESOLVED']

  if (!status || !statusValidos.includes(status)) {
    return reply.status(400).send({ error: `Status inválido. Use um destes: ${statusValidos.join(', ')}` })
  }

  try {
    const existing = await prisma.alert.findUnique({ where: { id } })

    if (!existing) {
      return reply.status(404).send({ error: 'Alerta não encontrado' })
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: { status },
    })

    return alert
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao atualizar status do alerta' })
  }
})

// Adicionar foto(s) a um alerta já existente
// Recebe multipart/form-data com um ou mais arquivos
fastify.post('/alerts/:id/photos', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const existing = await prisma.alert.findUnique({ where: { id } })

    if (!existing) {
      return reply.status(404).send({ error: 'Alerta não encontrado' })
    }

    const parts = request.parts()
    const novasFotos: string[] = []

    for await (const part of parts) {
      if (part.type !== 'file') continue

      const buffer = await part.toBuffer()
      const extensao = part.filename?.split('.').pop() ?? 'jpg'
      const nomeArquivo = `${randomUUID()}.${extensao}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(nomeArquivo, buffer, { contentType: part.mimetype })

      if (uploadError) {
        fastify.log.error(uploadError)
        return reply.status(500).send({ error: 'Erro ao enviar foto para o Storage' })
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(nomeArquivo)

      novasFotos.push(publicUrlData.publicUrl)
    }

    if (novasFotos.length === 0) {
      return reply.status(400).send({ error: 'Nenhum arquivo de foto foi enviado' })
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: { photos: [...existing.photos, ...novasFotos] },
    })

    return alert
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao adicionar fotos ao alerta' })
  }
})

// Deletar um alerta
fastify.delete('/alerts/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const existing = await prisma.alert.findUnique({ where: { id } })

    if (!existing) {
      return reply.status(404).send({ error: 'Alerta não encontrado' })
    }

    await prisma.alert.delete({ where: { id } })

    return reply.status(204).send()
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao deletar alerta no banco' })
  }
})

// ============================================================
// ROTAS DE USER (Cadastro e Login)
// ============================================================

// Cadastrar novo usuário
fastify.post('/users', async (request, reply) => {
  const { name, email, password } = request.body as {
    name: string
    email: string
    password: string
  }

  if (!name || !email || !password) {
    return reply.status(400).send({ error: 'Campos obrigatórios: name, email, password' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      return reply.status(409).send({ error: 'Já existe um usuário com esse e-mail' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: { name, email, password: passwordHash },
    })

    // Nunca retornar o hash da senha na resposta
    const { password: _senha, ...userSemSenha } = user

    return reply.status(201).send(userSemSenha)
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao criar usuário no banco' })
  }
})

// Login do usuário
fastify.post('/login', async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string }

  if (!email || !password) {
    return reply.status(400).send({ error: 'Campos obrigatórios: email, password' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      return reply.status(401).send({ error: 'E-mail ou senha inválidos' })
    }

    const senhaCorreta = await bcrypt.compare(password, user.password)

    if (!senhaCorreta) {
      return reply.status(401).send({ error: 'E-mail ou senha inválidos' })
    }

    const { password: _senha, ...userSemSenha } = user

    return userSemSenha
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao realizar login' })
  }
})

// Buscar dados de um usuário pelo id (sem retornar a senha)
fastify.get('/users/:id', async (request, reply) => {
  const { id } = request.params as { id: string }

  try {
    const user = await prisma.user.findUnique({ where: { id } })

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' })
    }

    const { password: _senha, ...userSemSenha } = user

    return userSemSenha
  } catch (error) {
    fastify.log.error(error)
    reply.status(500).send({ error: 'Erro ao buscar usuário no banco' })
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