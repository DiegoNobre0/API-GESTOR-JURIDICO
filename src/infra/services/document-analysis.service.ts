import { createGoogleGenerativeAI } from '@ai-sdk/google'; // Importação do Gemini
import { generateObject } from 'ai';
import { z } from 'zod';


const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || '',
});



export class DocumentAnalysisService {

    async analyzeDocument(fileBuffer: Buffer) {
        console.log(`🔍 [Gemini Vision] Analisando imagem para classificação e extração simultânea...`);

        try {
            const extractionSchema = z.object({
                tipo_identificado: z.enum(['RG', 'CNH', 'COMPROVANTE_RESIDENCIA', 'OUTROS']),
                nome_completo: z.string().nullable(),
                cpf_numero: z.string().nullable(),
                rg_numero: z.string().nullable(),
                endereco_completo: z.string().nullable(),
                data_emissao: z.string().nullable(),
                lado: z.enum(['FRENTE', 'VERSO', 'FRENTE_E_VERSO', 'NAO_APLICA']).nullable(),
                legivel: z.boolean(),
            });

            const { object } = await generateObject({
                // Usando o modelo Pro que é o melhor para visão e OCR denso
                model: google('gemini-2.5-flash'),
                schema: extractionSchema,
                temperature: 0, // Zero para máxima precisão em extração de dados
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: this.buildUniversalPrompt(),
                            },
                            {
                                type: 'image',
                                image: fileBuffer
                            }
                        ],
                    },
                ],
            });

            console.log("🧠 CLASSIFICAÇÃO BRUTA (Gemini):", object);
            return this.filterByDocumentType(object);

        } catch (error) {
            console.error("❌ Erro na análise do Gemini:", error);
            return null;
        }
    }

    private buildUniversalPrompt() {
        return `
Analise cuidadosamente a imagem deste documento brasileiro.
Sua tarefa é realizar um OCR (Reconhecimento de Caracteres) de alta precisão.

1. REGRAS DE CLASSIFICAÇÃO ("tipo_identificado"):
- "RG": Registro Geral. Possui brasão, foto e o número do RG.
- "CNH": Carteira de Habilitação. Documento verde com foto.
- "COMPROVANTE_RESIDENCIA": Contas (luz, água, internet) ou faturas. Deve ter um endereço.
- "OUTROS": Se for ilegível ou outro tipo de papel.

2. REGRAS DE EXTRAÇÃO (CRÍTICO):
- "nome_completo": Extraia o nome completo sem abreviações, se possível.
- "rg_numero": O número do Registro Geral.
- "cpf_numero": LOCALIZAÇÃO PRIORITÁRIA. No RG, o CPF costuma estar no VERSO. Procure por uma sequência de 11 dígitos no formato XXX.XXX.XXX-XX. É obrigatório extrair se estiver visível.
- "endereco_completo": Extraia rua, número, bairro, cidade, estado e CEP.
- "data_emissao": Data em que o documento foi feito.

3. IDENTIFICAÇÃO DO LADO ("lado"):
- "FRENTE": Lado com a foto.
- "VERSO": Lado com a digital e os dados escritos (onde costuma ficar o CPF no RG).
- "FRENTE_E_VERSO": Se ambos os lados aparecerem na mesma imagem.

4. QUALIDADE:
- "legivel": Marque como true apenas se os números e nomes puderem ser lidos sem ambiguidade.
`;
    }

    private filterByDocumentType(result: any) {
        if (result.tipo_identificado === 'COMPROVANTE_RESIDENCIA') {
            return {
                ...result,
                rg_numero: null,
                cpf_numero: null,
                data_emissao: null,
                lado: 'NAO_APLICA',
            };
        }

        if (result.tipo_identificado === 'RG' || result.tipo_identificado === 'CNH') {
            return {
                ...result,
                endereco_completo: null,
            };
        }

        return result;
    }
}