// In dev, use an empty base so URLs become relative (/card-images/…) and are
// intercepted by the Vite proxy → no CORS. In prod, point directly at the CDN.
export const IMAGE_BASE: string = import.meta.env.DEV
  ? ''
  : ((import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '');

export function cardImageUrl(filename: string): string {
  return `${IMAGE_BASE}/card-images/${filename}`;
}
