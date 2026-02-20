import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import multipart from '@fastify/multipart';
import cron from 'node-cron';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// --- IMPORTAÇÕES ---
import { prisma } from "./lib/prisma.js";
import { MailService } from './infra/services/mail-service.js';

import { authModule } from './modules/auth/auth.module.js';
import { dashboardModule } from './modules/dashboard/dashboard.module.js';
import { processosModule } from './modules/processos/processos.module.js';
import { usersModule } from './modules/users/users.module.js';
import { NotifyDailyAgendaService } from './modules/agenda/notify-daily-agenda.service.js';
import { whatsappModule } from './modules/whatsapp/whatsapp.module.js';
import { webhookModule } from './infra/controllers/webhook.module.js';
import { leadsModule } from './modules/leads/leads.module.js';
import { uploadRoutes } from './modules/processos/upload.controller.js';
import { clientesRoutes } from './modules/cliente/clientes.module.js';
import { financeiroModule } from './modules/financeiro/financeiro.module.js';
import { agendaRoutes } from './modules/agenda/agenda.routes.js';

const app = Fastify({ logger: true });

/* =======================================================
   1️⃣ PLUGINS
======================================================= */

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'secret-2026'
});

app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? ["https://gestor-juridico-front.vercel.app"]
    : true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
  }
});

app.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ message: "Sessão expirada ou inválida." });
  }
});

/* =======================================================
   2️⃣ MÓDULOS
======================================================= */

app.register(authModule);
app.register(dashboardModule);
app.register(processosModule);
app.register(financeiroModule);
app.register(usersModule);
app.register(whatsappModule);
app.register(webhookModule);
app.register(leadsModule, { prefix: 'leads' });
app.register(uploadRoutes);
app.register(agendaRoutes);
app.register(clientesRoutes, { prefix: 'clientes' });

/* =======================================================
   3️⃣ CRON LOCAL
======================================================= */

const mailService = new MailService();

cron.schedule('0 18 * * *', async () => {
  app.log.info("📅 [SCHEDULER] Iniciando notificações de agenda...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  try {
    await notifyService.execute();
  } catch (err: any) {
    app.log.error("❌ Falha no scheduler local:", err);
  }
});

/* =======================================================
   4️⃣ START SERVER COM SOCKET (VPS)
======================================================= */

/* =======================================================
   4️⃣ START SERVER COM SOCKET (VPS)
======================================================= */

async function start() {
  try {
    // 1. Instancie o Socket.io usando o servidor interno do Fastify (app.server)
    const io = new SocketIOServer(app.server, {
      cors: {
        origin: '*', // depois coloque domínio do front
      },
    });

    // 2. Disponibilize o 'io' dentro do Fastify ANTES de iniciar a aplicação
    app.decorate('io', io);

    // 3. Configure os eventos do Socket
    io.on('connection', (socket) => {
      console.log('🟢 Cliente conectado:', socket.id);

      socket.on('disconnect', () => {
        console.log('🔴 Cliente desconectado:', socket.id);
      });
    });

    // 4. Inicie o Fastify. O método listen já lida com a preparação interna.
    await app.listen({ port: 3333, host: '0.0.0.0' });
    console.log("🚀 RCS Advogados rodando com Socket na porta 3333");

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
