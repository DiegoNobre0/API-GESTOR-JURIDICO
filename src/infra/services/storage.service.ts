import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import sharp from 'sharp'; // 👈 IMPORTAÇÃO NOVA

export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    
    this.bucketName = process.env.R2_BUCKET_NAME || 'advocacia-bot';
    this.publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-seu-hash.r2.dev';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('Credenciais do Cloudflare R2 não configuradas.');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  // 👇 NOVA FUNÇÃO DE OTIMIZAÇÃO
private async otimizarArquivo(fileBuffer: Buffer, extension: string): Promise<Buffer> {
    const cleanExt = extension.replace('.', '').toLowerCase();

    try {
      // Se for imagem, aplicamos uma compressão LEVE para não prejudicar o OCR e as provas judiciais
      if (['jpg', 'jpeg', 'png', 'webp'].includes(cleanExt)) {
        console.log(`🖼️ Otimizando imagem ${cleanExt}... (Tamanho original: ${(fileBuffer.length / 1024).toFixed(2)} KB)`);
        
        const pipeline = sharp(fileBuffer)
          // 2048px é o sweet-spot recomendado pela OpenAI para o modo "High Detail" de visão
          .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });

        // Aplica a compressão dependendo do formato mantendo altíssima qualidade (95%+)
        if (cleanExt === 'png') {
          // PNG é lossless, o nível 8 apenas demora mais para comprimir, mas não perde qualidade
          return await pipeline.png({ compressionLevel: 8 }).toBuffer();
        } else if (cleanExt === 'webp') {
          return await pipeline.webp({ quality: 95 }).toBuffer(); // Subimos de 80 para 95
        } else {
          // Para JPG / JPEG
          // Subimos a qualidade de 80 para 95. Evita borrar números pequenos como CPF.
          return await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();
        }
      }

      // Se for PDF, Vídeo ou Áudio (ou se falhar), retorna o buffer original intocado
      return fileBuffer;

    } catch (error) {
      console.error('❌ Erro ao otimizar imagem, salvando versão original:', error);
      return fileBuffer;
    }
  }

  async uploadFile(fileBuffer: Buffer, extension: string, folder: string = 'uploads') {
    // 1. Passa o arquivo pela nossa "catraca" de otimização antes de subir
    const bufferOtimizado = await this.otimizarArquivo(fileBuffer, extension);
    
    const fileName = `${randomUUID()}.${extension}`;
    const key = `${folder}/${fileName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: bufferOtimizado, // 👈 Usa o buffer que saiu do Sharp
        ContentType: this.getMimeType(extension),
      })
    );

    return {
      url: `${this.publicUrl}/${key}`,
      path: key,
      fileName: fileName
    };
  }

  private getMimeType(extension: string) {
    const cleanExt = extension.replace('.', '').toLowerCase();

    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      oga: 'audio/ogg',
      aac: 'audio/aac',

      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    };

    return types[cleanExt] || 'application/octet-stream';
  }
}