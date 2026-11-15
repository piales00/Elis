import { addProtocol } from "maplibre-gl";

export async function loadTransparentTile({ url }, { signal }) {
  const response = await fetch(url.replace("gibs-transparent://", ""), { signal });
  if (!response.ok) throw new Error(`GIBS imagery: ${response.status} ${response.statusText}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i] === 0 && pixels.data[i + 1] === 0 && pixels.data[i + 2] === 0) pixels.data[i + 3] = 0;
    }
    context.putImageData(pixels, 0, 0);
    return {
      data: await createImageBitmap(canvas),
      cacheControl: response.headers.get("Cache-Control"),
      expires: response.headers.get("Expires"),
    };
  } finally {
    bitmap.close();
  }
}

addProtocol("gibs-transparent", loadTransparentTile);
