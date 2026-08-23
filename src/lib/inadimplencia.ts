// Parametros e regra PURA da escalada por inadimplencia (processo E5, doc 01 §4).
// Sem rede/DB, testavel. D+10 ja vira tarefa humana (Fila do Dia); o E5 e o
// desfecho: sem acordo ate D+30, escala para rescisao formal com prazo de cura.
// TODO: mover os defaults para config por instancia (TENANT) quando existir.

export const INADIMPLENCIA_DIAS_PADRAO = 30; // D+30 do vencimento
export const PRAZO_CURA_DIAS_PADRAO = 10; // prazo de cura na notificacao formal

// Elegivel a escalada quando a parcela esta vencida ha PELO MENOS `limiar` dias.
export function elegivelInadimplencia(diasVencida: number, limiar: number): boolean {
  return diasVencida >= limiar;
}
