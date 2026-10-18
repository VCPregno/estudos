import type { EditalExtraido } from "@/lib/ai/esquema-edital";

/** Resultado de exemplo para conhecer a tela de revisão sem gastar chamada de IA. */
export const EDITAL_EXEMPLO: EditalExtraido = {
  edital: {
    nome: "TRT 2ª Região — Analista Judiciário, Área Judiciária",
    orgao: "Tribunal Regional do Trabalho da 2ª Região",
    banca: "FCC",
    cargo: "Analista Judiciário - Área Judiciária",
    carreira: "direito",
    ano: 2026,
    data_prova: "2027-03-14",
  },
  disciplinas: [
    {
      nome: "Língua Portuguesa",
      area: "geral",
      peso: 1,
      qtd_questoes: 10,
      topicos: [
        { codigo: "1", titulo: "Compreensão e interpretação de textos de gêneros variados", subtopicos: [] },
        { codigo: "2", titulo: "Ortografia oficial e acentuação gráfica", subtopicos: [] },
        { codigo: "3", titulo: "Emprego das classes de palavras", subtopicos: [] },
        { codigo: "4", titulo: "Concordância verbal e nominal", subtopicos: [] },
        { codigo: "5", titulo: "Regência verbal e nominal. Emprego do sinal indicativo de crase", subtopicos: [] },
      ],
    },
    {
      nome: "Direito Constitucional",
      area: "direito",
      peso: 2,
      qtd_questoes: 10,
      topicos: [
        { codigo: "1", titulo: "Princípios fundamentais", subtopicos: [] },
        {
          codigo: "2",
          titulo: "Direitos e garantias fundamentais",
          subtopicos: [
            { codigo: "2.1", titulo: "Direitos e deveres individuais e coletivos" },
            { codigo: "2.2", titulo: "Direitos sociais" },
            { codigo: "2.3", titulo: "Nacionalidade e direitos políticos" },
          ],
        },
        { codigo: "3", titulo: "Organização político-administrativa do Estado", subtopicos: [] },
        { codigo: "4", titulo: "Administração Pública: disposições gerais e servidores públicos", subtopicos: [] },
        {
          codigo: "5",
          titulo: "Poder Judiciário",
          subtopicos: [
            { codigo: "5.1", titulo: "Disposições gerais" },
            { codigo: "5.2", titulo: "Tribunais e Juízes do Trabalho" },
          ],
        },
      ],
    },
    {
      nome: "Direito do Trabalho",
      area: "direito",
      peso: 2,
      qtd_questoes: 15,
      topicos: [
        { codigo: "1", titulo: "Princípios e fontes do Direito do Trabalho", subtopicos: [] },
        { codigo: "2", titulo: "Relação de trabalho e relação de emprego: requisitos e distinção", subtopicos: [] },
        { codigo: "3", titulo: "Contrato individual de trabalho: conceito, classificação e características", subtopicos: [] },
        { codigo: "4", titulo: "Duração do trabalho: jornada, horas extras, intervalos e trabalho noturno", subtopicos: [] },
        { codigo: "5", titulo: "Remuneração e salário: distinção, composição e proteção", subtopicos: [] },
      ],
    },
    {
      nome: "Noções de Tecnologia da Informação",
      area: "ti",
      peso: 1,
      qtd_questoes: 5,
      topicos: [
        { codigo: "1", titulo: "Segurança da informação: backup, vírus, phishing e autenticação em dois fatores", subtopicos: [] },
        { codigo: "2", titulo: "Lei Geral de Proteção de Dados (Lei nº 13.709/2018)", subtopicos: [] },
        { codigo: "3", titulo: "Computação em nuvem e ferramentas de colaboração", subtopicos: [] },
      ],
    },
  ],
  observacoes: "Exemplo ilustrativo. Em um edital real, aqui aparecem avisos da IA, como cargos ignorados ou páginas ilegíveis.",
};
