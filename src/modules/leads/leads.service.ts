import { prisma } from '@/lib/prisma.js'; // Ajuste o import conforme seu projeto
import type { DocumentoView, LeadJuridico } from './leads.types.js';


export class LeadsService {
  // Não precisa de construtor vazio se não for injetar nada
  
  async findAll(): Promise<LeadJuridico[]> {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        documents: true,
      },
    });

    return conversations.map((conv) => {
      const tempData = (conv.tempData as any) || {};

      const docs = conv.documents.map((doc) => ({
        id: doc.id,
        tipo: doc.tipo,
        fileName: doc.fileName || '',
        mediaUrl: doc.mediaUrl || '',
        validado: doc.validado,
        etapa: doc.etapa as 'ESSENCIAL' | 'COMPLEMENTAR',
      })) as DocumentoView[];

      return {
        id: conv.id,
        nome: conv.customerName || 'Sem Nome',
        telefone: conv.customerPhone,
        canal: conv.channel,
        dataEntrada: conv.createdAt,
        ultimaMensagem: conv.lastMessageBody || '',
        
        tipoCaso: conv.tipoCaso || tempData.tipoCaso || 'GERAL',
        empresa: tempData.empresa || '',
        dataOcorrido: tempData.data_do_ocorrido || tempData.dataOcorrido || '', 
        dinamicaDoDano: tempData.dinamica_do_dano || tempData.dinamicaDoDano || '',
        prejuizo: tempData.prejuizo || '',
        
        workflowStep: conv.workflowStep,
        aguardandoDocumentos: !!tempData.aguardandoDocumentos, 

        documentosEssenciais: docs.filter((d) => d.etapa === 'ESSENCIAL'),
        documentosComplementares: docs.filter((d) => d.etapa === 'COMPLEMENTAR'),
      };
    });
  }
}