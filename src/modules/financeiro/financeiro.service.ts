import { prisma } from "../../lib/prisma.js";
import type { CreateFinanceiroInput } from "./dto/create-financeiro.dto.js";
import { randomUUID } from "crypto";

export class FinanceiroService {
  
  async create(data: CreateFinanceiroInput, userId: string) {
    return await prisma.$transaction(async (tx) => {
      
      let safeProcessoId: string | null = null; 
      if (data.processoId) {
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(data.processoId);
        if (isValidObjectId) safeProcessoId = data.processoId;
        else safeProcessoId = null;
      }

      const qtdMeses = data.recorrente ? (data.meses_recorrencia || 1) : 1;
      const transacoesParaCriar = [];
      const dataBase = new Date(data.data);
      
      // 👇 Cria um ID único para amarrar todas as parcelas desse lote
      const grupoId = data.recorrente ? randomUUID() : null; 

      for (let i = 0; i < qtdMeses; i++) {
        const dataParcela = new Date(dataBase);
        dataParcela.setMonth(dataBase.getMonth() + i);

        const sufixoDescricao = data.recorrente ? ` (${i + 1}/${qtdMeses})` : '';

        transacoesParaCriar.push({
          tipo: data.tipo,       
          categoria: data.categoria,
          valor: data.valor,
          data: dataParcela.toISOString(),
          descricao: `${data.descricao}${sufixoDescricao}`,
          recorrente: data.recorrente,
          mesesRecorrencia: data.meses_recorrencia,
          grupoRecorrenciaId: grupoId, // 👈 Salva a amarração
          processoId: safeProcessoId,
          createdBy: userId 
        });
      }

      const transacoesCriadas = await Promise.all(
        transacoesParaCriar.map(t => tx.transacao.create({ data: t }))
      );

      // Soma o valor total das parcelas no Processo (se atrelado)
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
             const valorTotalAAcrecentar = data.valor * qtdMeses;
             await tx.processo.update({
               where: { id: safeProcessoId },
               data: { [field]: { increment: valorTotalAAcrecentar } }
             });
          } catch (error) {
            console.error(`Erro ao atualizar totais do processo`, error);
          }
        }
      }

      return transacoesCriadas[0]; 
    });
  }

  async list(userId: string) {
    return await prisma.transacao.findMany({
      where: {  arquivado: false },
      orderBy: { data: 'desc' }, // Melhor ordenar pela data da transação ao invés de createdAt
      include: {
        user: { select: { nome: true } }
      }
    });
  }

 // MÉTODO DE EDITAR (Atualiza a transação e calcula a diferença de caixa no processo)
  async update(id: string, userId: string, data: Partial<CreateFinanceiroInput>) {
    return await prisma.$transaction(async (tx) => {
      const transacaoAntiga = await tx.transacao.findFirst({ where: { id } });
      if (!transacaoAntiga) throw new Error("Transação não encontrada.");

      // Se o valor mudou e há um processo vinculado, precisamos arrumar o cofre do processo!
      if (data.valor && data.valor !== transacaoAntiga.valor && transacaoAntiga.processoId) {
        const diferenca = data.valor - transacaoAntiga.valor;
        let field: any = null;
        const catLower = transacaoAntiga.categoria.toLowerCase();

        if (transacaoAntiga.tipo === 'entrada') {
            if (catLower.includes("iniciais")) field = "valorHonorariosIniciaisPago"; 
            else if (catLower.includes("êxito") || catLower.includes("exito")) field = "valorHonorariosExitoPago";
        } else {
            field = "custosProcessuais"; 
        }

        if (field) {
            // O Prisma entende decrementos sozinhos se enviarmos número negativo no increment
            await tx.processo.update({
                where: { id: transacaoAntiga.processoId },
                data: { [field]: { increment: diferenca } }
            });
        }
      }

      // 👇 CORREÇÃO DO TYPESCRIPT AQUI
      const updateData: any = {};
      if (data.categoria !== undefined) updateData.categoria = data.categoria;
      if (data.descricao !== undefined) updateData.descricao = data.descricao;
      if (data.valor !== undefined) updateData.valor = data.valor;
      if (data.data !== undefined) updateData.data = new Date(data.data).toISOString();

      // Atualiza a transação
      return await tx.transacao.update({
        where: { id },
        data: updateData
      });
    });
  }

  async setArquivado(id: string, userId: string, status: boolean) {
    return await prisma.transacao.updateMany({
      where: { id },
      data: { arquivado: status }
    });
  }

  // 👇 DELETAR AGORA SUPORTA APAGAR LOTE E DESCONTAR DO PROCESSO
  async delete(id: string, userId: string, apagarLoteCompleto: boolean = false) {
    return await prisma.$transaction(async (tx) => {
      const transacao = await tx.transacao.findFirst({ where: { id} });
      if (!transacao) throw new Error("Transação não encontrada.");

      let whereClause: any = { id };
      let valorParaDescontar = transacao.valor;

      // Se pedir pra apagar o lote e essa transação fizer parte de um lote
      if (apagarLoteCompleto && transacao.grupoRecorrenciaId) {
        whereClause = { grupoRecorrenciaId: transacao.grupoRecorrenciaId};
        
        // Descobre quantas parcelas existem e qual o valor total pra devolver no Processo
        const loteDeTransacoes = await tx.transacao.findMany({ where: whereClause });
        valorParaDescontar = loteDeTransacoes.reduce((acc, curr) => acc + curr.valor, 0);
      }

      // Estorna o valor do caixa do processo (se houver)
      if (transacao.processoId) {
        let field: any = null;
        const catLower = transacao.categoria.toLowerCase();

        if (transacao.tipo === 'entrada') {
            if (catLower.includes("iniciais")) field = "valorHonorariosIniciaisPago"; 
            else if (catLower.includes("êxito") || catLower.includes("exito")) field = "valorHonorariosExitoPago";
        } else {
            field = "custosProcessuais"; 
        }

        if (field) {
            await tx.processo.update({
                where: { id: transacao.processoId },
                data: { [field]: { decrement: valorParaDescontar } }
            });
        }
      }

      // Finalmente, apaga (só uma ou o lote todo)
      return await tx.transacao.deleteMany({ where: whereClause });
    });
  }
}