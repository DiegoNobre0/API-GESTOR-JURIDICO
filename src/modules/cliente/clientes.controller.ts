
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClientesService } from './clientes.service.js';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

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


  async buscarProcessosPorCpf(request: FastifyRequest, reply: FastifyReply) {
    // Pegamos o CPF que virá na URL, ex: /portal-cliente/processos?cpf=123.456.789-00
    const { cpf } = request.query as { cpf?: string };

    if (!cpf) {
      return reply.status(400).send({ error: 'O CPF ou CNPJ é obrigatório para a consulta.' });
    }

    // 1. Sanitização: Remove pontos, traços e barras (deixa só números)
    const documentoLimpo = cpf.replace(/\D/g, '');

    if (documentoLimpo.length !== 11 && documentoLimpo.length !== 14) {
      return reply.status(400).send({ error: 'Formato de CPF ou CNPJ inválido.' });
    }

    try {
      // 2. Busca no Prisma a "Árvore" completa de dados do Cliente
      const cliente = await prisma.cliente.findUnique({
        where: { cpf: documentoLimpo },
        include: {
          processos: {
            where: { arquivado: false }, // Mostra apenas processos ativos
            include: {
              // Traz o nome do advogado responsável para o cliente ver
              user: { 
                select: { nome: true, email: true } 
              },
              // Traz os andamentos ordenados do mais novo pro mais antigo
              andamentos: {
                orderBy: { createdAt: 'desc' },
                take: 15 // Limita aos últimos 15 para não travar a tela
              }
            }
          }
        }
      });

      // 3. Validações de resposta
      if (!cliente) {
        return reply.status(404).send({ error: 'Nenhum cadastro encontrado para este CPF/CNPJ.' });
      }

      if (cliente.processos.length === 0) {
        return reply.status(404).send({ error: 'Você não possui processos ativos no momento.' });
      }

      // 4. Monta a resposta limpa para o Angular
      return reply.send({
        cliente: {
          nome: cliente.nome,
          documento: cliente.cpf
        },
        processos: cliente.processos.map((proc: any) => ({
          id: proc.id,
          numeroProcesso: proc.numeroCNJ,
          descricao: proc.descricaoObjeto,
          advogadoResponsavel: proc.user.nome,
          status: proc.statusGeral,
          andamentos: proc.andamentos.map((and: any) => ({
            data: and.createdAt,
            titulo: and.titulo,
            descricao: and.descricao
          }))
        }))
      });

    } catch (error) {
      console.error('Erro na consulta do portal do cliente:', error);
      return reply.status(500).send({ error: 'Erro interno ao consultar o banco de dados.' });
    }
  }

  // DELETE /clientes/:id
  async delete(req: FastifyRequest, rep: FastifyReply) {
    const paramsSchema = z.object({
      id: z.string()
    });

    const { id } = paramsSchema.parse(req.params);

    try {
      await this.service.delete(id);
      return rep.send({ message: "Cliente excluído com sucesso" });
    } catch (error: any) {
      // Erro P2003: Violação de chave estrangeira (Cliente tem processos vinculados)
      if (error.code === 'P2003') {
        return rep.status(400).send({ error: "Não é possível excluir este cliente, pois existem processos vinculados a ele." });
      }
      return rep.status(500).send({ error: "Erro interno ao tentar excluir o cliente." });
    }
  }
}