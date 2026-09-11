export const getStatsCsvValue = (
  record: object,
  primaryHeader: string,
  fallbackHeader: string
) => {
  const values = record as Record<string, string | null | undefined>
  return values[primaryHeader] || values[fallbackHeader] || null
}
