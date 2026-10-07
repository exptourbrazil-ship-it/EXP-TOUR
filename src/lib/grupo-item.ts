// Papel do item de cotacao (`quote_item.group`, que guarda o `product.kind`).
//
// Varios fluxos tratam o CURSO como ancora do contrato (inicio do curso, D-30,
// fornecedor/pais do programa, base de retencao). Um PACOTE de cursos
// (`kind='package'`, preco = soma dos itens) cumpre esse mesmo papel: sem esta
// equivalencia, cotar um pacote deixava o contrato sem data de inicio canonica
// e a retencao sem base. Modulo PURO (sem rede/DB).

/** Grupos que fazem o papel de "curso/programa" do contrato. */
export const GRUPOS_CURSO: readonly string[] = ["program", "package"];

/** True quando o grupo do item e o curso (ou um pacote de cursos). */
export function ehGrupoCurso(grupo: unknown): boolean {
  return typeof grupo === "string" && GRUPOS_CURSO.includes(grupo);
}
