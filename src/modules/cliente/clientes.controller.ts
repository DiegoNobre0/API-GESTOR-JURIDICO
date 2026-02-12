
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClientesService } from './clientes.service.js';
import { z } from 'zod';

export class ClientesController {
  private service = new ClientesService();

  // GET /clientes/:id
  async getById(req: FastifyRequest, rep: FastifyReply) {
    const paramsSchema = z.object({
      id: z.string()
    });

    const { id } = paramsSchema.parse(req.params);

    const cliente = await this.service.findById(id);

    if (!cliente) {
      return rep.status(404).send({ message: "Cliente não encontrado" });
    }

    return rep.send(cliente);
  }

  // PUT /clientes/:id
  async update(req: FastifyRequest, rep: FastifyReply) {
    const paramsSchema = z.object({
      id: z.string()
    });
    
    // Schema flexível para edição (tudo opcional)
    const bodySchema = z.object({
      nome: z.string().optional(),
      email: z.string().email().optional().nullable(),
      cpf: z.string().optional().nullable(),
      telefone: z.string().optional(),
      endereco: z.string().optional().nullable(),
    });

    const { id } = paramsSchema.parse(req.params);
    const data = bodySchema.parse(req.body);

    try {
      const atualizado = await this.service.update(id, data);
      return rep.send(atualizado);
    } catch (error) {
      return rep.status(400).send({ error: "Erro ao atualizar cliente" });
    }
  }

  // GET /clientes (Busca)
  async list(req: FastifyRequest, rep: FastifyReply) {
    const querySchema = z.object({
      q: z.string().optional() // ?q=Diego
    });

    const { q } = querySchema.parse(req.query);
    const clientes = await this.service.list(q);
    
    return rep.send(clientes);
  }
}