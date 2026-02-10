import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || '',
});

export class DocumentAnalysisService {

    async analyzeDocument(fileBuffer: Buffer, docTypeContext: string) {
        console.log(`🔍 [IA Vision] Analisando imagem como: ${docTypeContext}...`);

        try {
            const extractionSchema = z.object({
                tipo_identificado: z.enum(['RG', 'CNH', 'COMPROVANTE_RESIDENCIA', 'OUTROS']),
                nome_completo: z.string().optional(),
                rg_numero: z.string().optional().describe("Número do Registro Geral (RG) ou nº de registro da CNH"),
                cpf_numero: z.string().optional().describe("Número do CPF (Cadastro de Pessoa Física). Formato: xxx.xxx.xxx-xx"),
                endereco_completo: z.string().optional(),
                data_emissao: z.string().optional(),
                legivel: z.boolean().describe("Se o documento está nítido e legível"),
            });

            const { object } = await generateObject({
                model: google('gemini-2.5-flash'),
                schema: extractionSchema,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Analise este documento (${docTypeContext}) com precisão para fins jurídicos.
                       
                       REGRAS DE EXTRAÇÃO:
                       1. NOME: Extraia o nome completo.
                       2. CPF: É CRUCIAL extrair o CPF. Procure por 11 dígitos, geralmente rotulado como CPF ou CIC.
                       3. RG: Extraia o número do registro geral separadamente.
                       
                       Se for CNH, o 'rg_numero' é o número do registro e o 'cpf_numero' fica abaixo.
                       Extraia tudo com pontuação se houver.`
                            },
                            { type: 'image', image: fileBuffer }
                        ],
                    },
                ],
            });

            return object;
        } catch (error) {
            console.error("❌ Erro na análise de IA:", error);
            return null;
        }
    }
}