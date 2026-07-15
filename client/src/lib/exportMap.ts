const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = 800;
const BACKGROUND_FILL = '#05060c';

/**
 * Rasterizes the live map — the SVG land/trail/marker layer plus the
 * night-shading canvas — into a downloadable PNG snapshot of the current
 * "living cartography." The SVG is serialized standalone (outside the
 * page's stylesheet), which is exactly why MapScene paints its elements
 * with literal inline colors rather than CSS classes — nothing here
 * depends on App.css being present. The night canvas's CSS blur/blend-mode
 * don't carry over automatically, so they're approximated here with a
 * canvas 2D blur filter instead. Nothing is uploaded; this is a pure
 * client-side capture.
 */
export async function exportMapAsPng(svg: SVGSVGElement | null, nightCanvas: HTMLCanvasElement | null): Promise<void> {
  if (!svg) throw new Error('Map is not ready yet.');

  const svgMarkup = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const svgImage = await loadImage(svgUrl);

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_WIDTH;
    canvas.height = EXPORT_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    ctx.fillStyle = BACKGROUND_FILL;
    ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
    ctx.drawImage(svgImage, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

    if (nightCanvas) {
      ctx.save();
      ctx.filter = 'blur(6px)';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(nightCanvas, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
      ctx.restore();
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to encode PNG.');

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `umbra-cartography-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to rasterize the map SVG.'));
    img.src = src;
  });
}
