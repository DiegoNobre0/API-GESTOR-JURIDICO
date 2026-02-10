import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

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

  /**
   * Faz upload de um buffer (imagem/pdf) para o R2
   * @param fileBuffer O buffer do arquivo
   * @param extension A extensão (ex: 'jpg', 'pdf')
   * @param folder Pasta opcional (ex: 'documentos')
   */
  async uploadFile(fileBuffer: Buffer, extension: string, folder: string = 'uploads') {
    const fileName = `${randomUUID()}.${extension}`;
    const key = `${folder}/${fileName}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
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
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      pdf: 'application/pdf',
    };
    return types[extension] || 'application/octet-stream';
  }
}