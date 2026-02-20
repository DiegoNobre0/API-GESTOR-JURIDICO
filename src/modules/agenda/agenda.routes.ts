import type { FastifyInstance } from 'fastify'
import { AgendaController } from './agenda.controller.js'

export async function agendaRoutes(app: FastifyInstance) {
  const controller = new AgendaController()

  // Registramos um grupo para aplicar o middleware de segurança em todas as rotas
  app.register(async (group) => {
    
    // ESTA LINHA É ESSENCIAL: Garante que req.user.sub esteja disponível
    // Bloqueia acessos sem token JWT válido
    group.addHook("preHandler", app.authenticate);

    // GET: Listar tudo (Compromissos + Tarefas do usuário logado)
    group.get('/', (req, res) => controller.list(req, res));

    // POST: Criação de itens vinculados ao ID do token
    group.post('/compromisso', (req, res) => controller.create(req, res));
    group.post('/tarefa', (req, res) => controller.createTarefa(req, res));

    // PATCH: Atualização de status (concluir tarefa)
    group.patch('/tarefa/:id/concluir', (req, res) => controller.toggleTarefa(req, res));

    // DELETE: Remoção de compromissos
    group.delete('/compromisso/:id', (req, res) => controller.delete(req, res));

  }, { prefix: '/agenda' });
}