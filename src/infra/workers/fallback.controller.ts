import type { FastifyReply, FastifyRequest } from "fastify"
import { testarFallbackAgora, resetarFallback } from "@/infra/workers/fallback.worker.js"

export class FallbackController {

  async testar(req: FastifyRequest, reply: FastifyReply) {
    const { phone } = req.params as any

    await testarFallbackAgora(phone)

    return reply.send({ ok: true })
  }

  async resetar(req: FastifyRequest, reply: FastifyReply) {
    const { phone } = req.params as any

    await resetarFallback(phone)

    return reply.send({ ok: true })
  }

}