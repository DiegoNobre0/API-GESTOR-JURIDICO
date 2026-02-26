import type { FastifyInstance } from "fastify"
import { FallbackController } from "./fallback.controller.js"

export async function fallbackModule(app: FastifyInstance) {

  const controller = new FallbackController()

  app.post('/fallback/testar/:phone', (req, rep) => controller.testar(req, rep))
  app.post('/fallback/resetar/:phone', (req, rep) => controller.resetar(req, rep))

}