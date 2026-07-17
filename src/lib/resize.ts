/**
 * 업로드 전 브라우저에서 사진을 줄인다.
 *
 * 요즘 폰은 12MP 사진을 찍는데, 라벨 글자를 읽는 데 그만한 해상도가 필요하지 않다.
 * 줄이면 업로드가 빨라지고 무료 티어 토큰도 덜 쓴다.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  if (scale === 1 && file.size < 1_500_000) {
    bitmap.close();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  return new File([blob], "label.jpg", { type: "image/jpeg" });
}
