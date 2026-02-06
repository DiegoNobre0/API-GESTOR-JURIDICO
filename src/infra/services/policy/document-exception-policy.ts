export class DocumentExceptionPolicy {
  /* ---------------------------------
     DETECÇÃO
  --------------------------------- */

  static clienteNaoPossuiDocumento(mensagem: string): boolean {
    return /não tenho|não possuo|perdi|ainda não tenho/i.test(mensagem);
  }

  /* ---------------------------------
     RESPOSTA PADRÃO
  --------------------------------- */

  static mensagemPadrao(documento: string): string {
    return `
Tudo bem.

Se você ainda não tiver o ${documento}, podemos seguir com o que já tem.
Depois te explico como obter esse documento.
`.trim();
  }
}