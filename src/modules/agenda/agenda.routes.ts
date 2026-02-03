
import type { FastifyInstance } from 'fastify'
import { AgendaController } from './agenda.controller.js'


export async function agendaRoutes(app: FastifyInstance) {
  const controller = new AgendaController()

  // Todas as rotas aqui já podem ter o prefixo /agenda
  app.get('/', (req, res) => controller.list(req, res))
  app.post('/compromisso', (req, res) => controller.create(req, res))
}