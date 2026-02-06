import type { WorkflowStep } from "./workflow-step.js";


export class BpcPolicy {
  /* ---------------------------------
     DOCUMENTOS OBRIGATÓRIOS BPC
  --------------------------------- */

  static documentosObrigatorios = [
    'RG',
    'CPF',
    'CADUNICO',
    'LAUDO',
  ];

  /* ---------------------------------
     REGRAS ESPECÍFICAS
  --------------------------------- */

  static validarDocumentoEspecial(
    documentoCodigo: string,
    etapaAtual: WorkflowStep,
  ): boolean {
    // Laudo só pode ser solicitado na etapa correta
    if (documentoCodigo === 'LAUDO' && etapaAtual !== 'COLETA_DOCS') {
      return false;
    }

    return true;
  }

  /* ---------------------------------
     EXCEÇÃO: SEM LAUDO
  --------------------------------- */

  static mensagemSemLaudo(): string {
    return `
Entendi. Sem problemas.

Se ainda não tiver o laudo médico, podemos seguir com os outros documentos.
Depois explico como você pode obtê-lo pelo SUS ou médico particular.
`.trim();
  }
}