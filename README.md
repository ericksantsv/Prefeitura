# 📋 Detalhes dos Campos e Tipos de Dados

## 1. Tabela User (Usuários do Sistema)

| Campo | Tipo | Descrição |
|---------|---------|---------|
| `id` | String (UUID) | Chave primária gerada de forma automática e aleatória pelo sistema para garantir identificação global única. |
| `email` | String | Endereço de e-mail do usuário corporativo ou cidadão. Possui a restrição `@unique`, impedindo duplicidade de contas. |
| `name` | String | Nome completo informado pelo usuário no momento do cadastro. |
| `password` | String | Hash seguro da senha de acesso do usuário. |
| `createdAt` | DateTime | Carimbo de data e hora gerado automaticamente (`@default(now())`) no instante da criação da conta. |

---

## 2. Tabela Alert (Ocorrências / Alertas Urbanos)

| Campo | Tipo | Descrição |
|---------|---------|---------|
| `id` | String (UUID) | Chave primária gerada de forma automática exclusiva de cada alerta. |
| `title` | String | Título breve sintetizando a ocorrência. Ex.: "Vazamento de água limpa na calçada". |
| `description` | String | Texto descritivo detalhando o problema encontrado para triagem. |
| `category` | String | Categoria do problema para agrupamento e filtros. Ex.: "Asfalto", "Iluminação pública", "Saneamento". |
| `latitude` | Float | Coordenada decimal exata obtida via GPS do celular do usuário no momento do envio. |
| `longitude` | Float | Coordenada decimal exata obtida via GPS do celular do usuário no momento do envio. |
| `status` | String | Estado do ciclo de vida da ocorrência. Definido inicialmente como `PENDING`, podendo evoluir para `APPROVED` ou `RESOLVED`. |
| `photos` | String[] | Vetor de Strings nativo do PostgreSQL utilizado para armazenar caminhos ou URLs das mídias anexadas ao alerta. |
| `userId` | String | Chave estrangeira (Foreign Key) responsável por vincular o alerta ao usuário que realizou o registro. |

---

# ⚙️ Arquivos de Configuração de Ambiente

## 1. Arquivo `.env` (Armazenamento Seguro Local)

Este arquivo armazena as credenciais confidenciais de acesso ao banco de dados Supabase.

### Exemplo

```env
DATABASE_URL="postgresql://postgres:Sua_Senha@db.exitxdezymeqhaylohha.supabase.co:5432/postgres"
```

> **Observação:** Certifique-se de que a senha não possua caracteres reservados de URL sem conversão, como `?`. Caso utilize, substitua por `%3F` ou utilize uma senha composta apenas por caracteres alfanuméricos.

---

## 2. Arquivo `prisma.config.ts` (Configuração Prisma 7)

Este arquivo deve estar localizado na raiz do projeto para alimentar o ecossistema Prisma CLI.

```ts
import { defineConfig } from '@prisma/config'

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
```

---

# 🚀 Como Executar o Projeto Localmente (Guia de Integração do Grupo)

Como a estrutura do banco de dados e a infraestrutura na nuvem já foram criadas previamente, os demais integrantes do grupo precisam apenas sincronizar a API localmente.

## Passo 1: Instalar as Dependências do Projeto

Abra o terminal dentro do diretório do projeto (`resolve-ai-api`) e execute:

```bash
npm install
```

Este comando instalará automaticamente todas as dependências listadas no `package.json`, incluindo:

- Fastify
- Prisma Client
- `@prisma/adapter-pg`
- `pg`
- `dotenv`
- `tsx`

---

## Passo 2: Configurar as Variáveis de Ambiente

Crie (ou renomeie) o arquivo `.env` na raiz do projeto e adicione a string de conexão do banco Supabase com a senha atualizada do grupo.

---

## Passo 3: Sincronizar e Gerar o Cliente Prisma

Execute o comando:

```bash
npx prisma generate
```

Esse passo é fundamental para:

- Mapear as tabelas existentes no banco online.
- Gerar os tipos internos do Prisma.
- Habilitar autocompletar (IntelliSense) no VS Code.
- Garantir tipagem estática para toda a equipe.

---

## Passo 4: Iniciar o Servidor de Desenvolvimento

Execute:

```bash
npx tsx server.ts
```

Após a inicialização, o console exibirá os logs do Fastify e a mensagem:

```text
🚀 Servidor rodando em http://localhost:3333
```

---

# 🛣️ Rotas e Endpoints Iniciais Disponíveis

O arquivo principal `server.ts` está configurado para escutar requisições na porta **3333**.

## GET `/` (Health Check)

**Endpoint:**

```text
http://localhost:3333/
```

### Objetivo

Verificar se a API está respondendo corretamente.

### Resposta Esperada

```json
{
  "message": "API do Resolve Aí está online!"
}
```

---

## GET `/alerts` (Listagem Completa de Alertas)

**Endpoint:**

```text
http://localhost:3333/alerts
```

### Objetivo

Consultar o banco de dados Supabase através do Prisma Client e retornar todos os registros existentes na tabela `Alert`.

### Resposta Esperada

```json
[]
```

Ou um vetor contendo todos os alertas cadastrados.
