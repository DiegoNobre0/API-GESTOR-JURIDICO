import { prisma } from "../../lib/prisma.js";
import type { CreateFinanceiroInput } from "./dto/create-financeiro.dto.js";

export class FinanceiroService {
  
  async create(data: CreateFinanceiroInput, userId: string) {
    return await prisma.$transaction(async (tx) => {
      
      // 1. Tratamento do ID do Processo
      let safeProcessoId: string | null = null; 

      if (data.processoId) {
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(data.processoId);
        if (isValidObjectId) {
          safeProcessoId = data.processoId;
        } else {
          if (data.processoId.trim() !== '') {
             console.warn(`⚠️ [Financeiro] ID inválido ignorado: "${data.processoId}"`);
          }
          safeProcessoId = null;
        }
      }

      // 2. Criação (CORRIGIDO: tx.transacao em vez de tx.movimentacao)
      const transacao = await tx.transacao.create({
        data: {
          tipo: data.tipo,       
          categoria: data.categoria,
          valor: data.valor,
          data: new Date(data.data).toISOString(), // Garante string ISO para o Mongo
          descricao: data.descricao,
          recorrente: data.recorrente,
          
          processoId: safeProcessoId,
          createdBy: userId 
        }
      });

      // 3. Sincronização com Processo (Opcional)
      if (safeProcessoId) {
        let field: any = null;
        const catLower = data.categoria.toLowerCase();

        if (data.tipo === 'entrada') {
            if (catLower.includes("iniciais")) field = "valorHonorariosIniciaisPago"; 
            else if (catLower.includes("êxito") || catLower.includes("exito")) field = "valorHonorariosExitoPago";
        } else {
            field = "custosProcessuais"; 
        }

        if (field) {
          try {
             // Descomente se quiser ativar a atualização automática
             
             await tx.processo.update({
               where: { id: safeProcessoId },
               data: { [field]: { increment: data.valor } }
             });
             
          } catch (error) {
            console.error(`Erro ao atualizar totais do processo`, error);
          }
        }
      }

      return transacao;
    });
  }

 async list(userId: string) {
  return await prisma.transacao.findMany({
    where: { 
      createdBy: userId, 
      arquivado: false 
    },
    orderBy: { 
      createdAt: 'desc' 
    },
    // ADICIONE ISSO:
    include: {
      user: {
        select: {
          nome: true // Busca apenas o campo 'nome' do modelo User
        }
      }
    }
  });
}

  async setArquivado(id: string, userId: string, status: boolean) {
    // CORRIGIDO: prisma.transacao
    return await prisma.transacao.updateMany({
      where: { id, createdBy: userId },
      data: { arquivado: status }
    });
  }

  async delete(id: string, userId: string) {
    // CORRIGIDO: prisma.transacao
    return await prisma.transacao.deleteMany({
      where: { 
        id, 
        createdBy: userId 
      }
    });
  }
}