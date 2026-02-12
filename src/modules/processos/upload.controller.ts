
import { StorageService } from '../../infra/services/storage.service.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extname } from 'node:path';

export async function uploadRoutes(app: FastifyInstance) {
  
  // Instancia seu serviço
  const storage = new StorageService();

  app.post('/upload', async (req: FastifyRequest, rep: FastifyReply) => {
    // 1. Pega o arquivo do multipart
    const data = await req.file();
    
    if (!data) {
      return rep.status(400).send({ error: 'Nenhum arquivo enviado.' });
    }

    try {
      // 2. Prepara os dados para o seu Service
      const buffer = await data.toBuffer();
      
      // Remove o ponto da extensão (ex: '.pdf' -> 'pdf') para bater com seu Service
      const extension = extname(data.filename).replace('.', ''); 

      // 3. Chama o SEU serviço existente
      // Vamos salvar na pasta 'anexos-processos' para organizar
      const uploadResult = await storage.uploadFile(buffer, extension, 'anexos-processos');

      // 4. Retorna no formato que o Frontend espera
      return rep.send({
        url: uploadResult.url,      // URL pública do R2
        nomeOriginal: data.filename, // Nome original do arquivo (ex: "Contrato.pdf")
        tipo: data.mimetype         // MimeType (ex: "application/pdf")
      });

    } catch (err) {
      console.error('Erro no upload:', err);
      return rep.status(500).send({ error: 'Erro interno ao processar upload.' });
    }
  });
}