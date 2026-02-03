import 'dotenv/config';
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import cron from 'node-cron';

// Instâncias Globais e Módulos
import { prisma } from "@/lib/prisma.js";
import { MailService } from "@/infra/services/mail-service.js";

import { authModule } from '@/modules/auth/auth.module.js';
import { dashboardModule } from '@/modules/dashboard/dashboard.module.js';
import { processosModule } from '@/modules/processos/processos.module.js';
import { financeiroModule } from '@/modules/financeiro/financeiro.module.js'; // Novo!
import { whatsappModule } from './modules/whatsapp/whatsapp.module.js';
// Serviços do Cron


import { NotifyDailyAgendaService } from './modules/agenda/notify-daily-agenda.service.js';
import { usersModule } from './modules/users/users.module.js';
import fastifySocketIO from 'fastify-socket.io';


const app = Fastify({ logger: true });

// --- 1. PLUGINS GLOBAIS ---
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'secret-2026'
});

app.register(cors, { origin: true });

// Registro do Socket.io
app.register(fastifySocketIO as any, {
  cors: {
    origin: "*", // Em produção, coloque o endereço do seu front
    methods: ["GET", "POST"]
  }
});

// Decorator de Autenticação Centralizado
app.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ message: "Sessão expirada ou inválida." });
  }
});

// --- 2. REGISTRO DE MÓDULOS (UNIFICADOS) ---
// Cada módulo agora carrega suas próprias rotas e lógica
app.register(authModule);
app.register(dashboardModule);
app.register(processosModule);
app.register(financeiroModule);
app.register(usersModule);
app.register(whatsappModule);

// --- 3. AGENDADORES (CRON JOBS) ---
const mailService = new MailService();

// Notificação de Agenda (18:00)
cron.schedule('0 18 * * *', async () => {
  app.log.info("📅 [SCHEDULER] Iniciando notificações de agenda...");
  const notifyService = new NotifyDailyAgendaService(mailService);
  try {
    await notifyService.execute();
    app.log.info("✅ Notificações enviadas com sucesso.");
  } catch (err : any) {
    app.log.error("❌ Falha no scheduler de agenda:", err);
  }
});

// --- 4. START SERVER ---
const start = async () => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' });
    console.log("🚀 RCS Advogados - Backend 2.0 Rodando na porta 3333");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();