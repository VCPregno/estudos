/**
 * Datas como strings ISO "YYYY-MM-DD", com aritmética em UTC.
 * Assim o algoritmo não depende do fuso do servidor nem sofre com horário de verão.
 */

export type DataISO = string;
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo

const DIA_MS = 86_400_000;

function paraUTC(data: DataISO): number {
  const [a, m, d] = data.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUTC(ms: number): DataISO {
  return new Date(ms).toISOString().slice(0, 10);
}

export function somarDias(data: DataISO, dias: number): DataISO {
  return deUTC(paraUTC(data) + dias * DIA_MS);
}

export function diaDaSemana(data: DataISO): DiaSemana {
  return new Date(paraUTC(data)).getUTCDay() as DiaSemana;
}

export function diferencaEmDias(a: DataISO, b: DataISO): number {
  return Math.round((paraUTC(a) - paraUTC(b)) / DIA_MS);
}

export function maxData(a: DataISO, b: DataISO): DataISO {
  return a >= b ? a : b;
}

/** Primeira data >= `data` cujo dia da semana está em `permitidos`. */
export function proximoDiaPermitido(data: DataISO, permitidos: readonly DiaSemana[]): DataISO {
  if (permitidos.length === 0) return data;
  let d = data;
  for (let i = 0; i < 7; i++) {
    if (permitidos.includes(diaDaSemana(d))) return d;
    d = somarDias(d, 1);
  }
  return data;
}

/** "Hoje" no fuso de São Paulo, independente do fuso do servidor. */
export function hojeEmSaoPaulo(agora: Date = new Date()): DataISO {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
