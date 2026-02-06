import type { WorkflowStep } from "./workflow-step.js";


export class InssPolicy {
  static documentosObrigatorios = [
    'RG',
    'CPF',
    'CTPS',
    'CNIS',
  ];

  /* ---------------------------------
     CNIS
  --------------------------------- */

  static podeSolicitarCNIS(
    etapaAtual: WorkflowStep,
  ): boolean {
    return etapaAtual === 'COLETA_DOCS';
  }

  /* ---------------------------------
     GOV.BR
  --------------------------------- */

  static validarGovBr(
    nivel: 'bronze' | 'prata' | 'ouro',
  ): boolean {
    return nivel === 'prata' || nivel === 'ouro';
  }

  static mensagemGovBrInvalido(): string {
    return `
Para esse tipo de solicitação, a conta GOV.BR precisa ser nível prata ou ouro.

Se quiser, posso te orientar como aumentar o nível da conta.
`.trim();
  }

  /* ---------------------------------
     EXCEÇÃO: SEM CNIS
  --------------------------------- */

  static mensagemSemCNIS(): string {
    return `
Sem problema.

Se você não tiver o CNIS agora, posso te explicar como emitir pelo aplicativo Meu INSS ou em uma agência.
`.trim();
  }
}