import { prisma } from "@/lib/prisma.js";
import type { CreateFinanceiroInput } from "./dto/create-financeiro.dto.js";


export class FinanceiroService {
  async create(data: CreateFinanceiroInput, userId: string) {
  return await prisma.$transaction(async (tx) => {
    
   // 1. VALIDAÇÃO E TIPO CORRETO
    // Inicializamos EXPLICITAMENTE com 'null' (não deixe sem valor/undefined)
    let safeProcessoId: string | null = null; 

    if (data.processoId) {
      // Verifica se é um ID do MongoDB válido (24 caracteres hex)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(data.processoId);
      
      if (isValidObjectId) {
        safeProcessoId = data.processoId;
      } else {
        console.warn(`⚠️ [Financeiro] ID inválido ignorado: "${data.processoId}"`);
        // Mantém como null
        safeProcessoId = null;
      }
    }

    // 2. Criação
    const transacao = await tx.transacao.create({
      data: {
        tipo: data.tipo,
        categoria: data.categoria,
        valor: data.valor,
        data: new Date(data.data).toISOString(), 
        descricao: data.descricao,
        recorrente: data.recorrente,
        
        // Agora o TypeScript sabe que isso é string ou null
        processoId: safeProcessoId, 
        
        createdBy: userId
      }
    });

    // --- 3. Sincroniza os totais do Processo (Só se o ID for válido) ---
    if (safeProcessoId) {
      let field: "totalRecebidoIniciais" | "totalRecebidoExito" | "totalCustosReais" | null = null;

      // Normaliza para evitar erros de Case Sensitive (Ex: "iniciais" vs "Iniciais")
      const catLower = data.categoria.toLowerCase();

      if (catLower.includes("iniciais")) field = "totalRecebidoIniciais";
      else if (catLower.includes("êxito") || catLower.includes("exito")) field = "totalRecebidoExito";
      else if (data.tipo === "saida") field = "totalCustosReais";

      if (field) {
        // Tenta atualizar. O try/catch aqui é opcional mas recomendável 
        // caso o processo tenha sido deletado nesse meio tempo.
        try {
          await tx.processo.update({
            where: { id: safeProcessoId },
            data: { [field]: { increment: data.valor } }
          });
        } catch (error) {
          console.error(`Erro ao atualizar totais do processo ${safeProcessoId}:`, error);
        }
      }
    }

    return transacao;
  });
}

  async list(userId: string) {
    return await prisma.transacao.findMany({
      where: { createdBy: userId, arquivado: false },
      orderBy: { createdAt: 'desc' }
    });
  }

  async setArquivado(id: string, userId: string, status: boolean) {
    return await prisma.transacao.updateMany({
      where: { id, createdBy: userId },
      data: { arquivado: status }
    });
  }

  // Método que centraliza a exclusão e protege os dados por usuário
  async delete(id: string, userId: string) {
    return await prisma.transacao.deleteMany({
      where: { 
        id, 
        createdBy: userId // Proteção: só deleta se for o dono do registro
      }
    });
  }
}