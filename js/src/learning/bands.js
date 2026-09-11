// Viewport width bands. This is the ONLY definition on the JS side; `ghost:export
// --breakpoint` accepts exactly these names, mirrored in src/Support/ViewportBands.php.
export const BANDS = [
  { name: '2xl', min: 1536 },
  { name: 'xl', min: 1280 },
  { name: 'lg', min: 1024 },
  { name: 'md', min: 768 },
  { name: 'sm', min: 640 },
  { name: 'xs', min: 0 },
];

export const BAND_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

export function bandFor(width) {
  const w = Number.isFinite(width) ? width : 0;

  for (const band of BANDS) {
    if (w >= band.min) return band.name;
  }

  return 'xs';
}
