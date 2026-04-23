export function normalizeCsvLineDelimited(line, delimiter = ",") {
  const out = [];
  let current = "";
  let inQuotes = false;
  const d = String(delimiter || ",").slice(0, 1);

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === d && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function normalizeCsvLine(line) {
  return normalizeCsvLineDelimited(line, ",");
}
