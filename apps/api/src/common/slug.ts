// Slug de URL a partir de texto livre: remove acento pela decomposição NFD,
// troca o que não for alfanumérico por hífen e colapsa as sobras.
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
