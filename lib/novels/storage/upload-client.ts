// Browser-only upload orchestration. Files never pass through a Vercel function.
export async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || !result.success) throw Object.assign(new Error(result.message || "Upload failed"), { status: response.status });
  return result.data;
}
export async function sha256(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function putFile(url: string, file: Blob, type: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": type, "If-None-Match": "*" }, body: file });
      // A previous attempt may have completed before the connection dropped.
      // Completion checks bytes and checksum rather than trusting this response.
      if (response.ok || response.status === 412) return;
      if (response.status < 500) throw new Error(`Upload rejected (${response.status}); check bucket CORS and permissions`);
    } catch (error) { if (attempt === 2) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
  }
  throw new Error("Upload failed; retry with the same files");
}
export async function prepareNovel(details: unknown, cover: File | null) {
  const extension = cover?.name.split(".").pop()?.toLowerCase();
  const data = await api<{ backend: "r2"; slug?: string; ready?: boolean }>("/api/novels/upload/prepare", {
    ...details as object, ...(cover ? { cover: { extension, size: cover.size, sha256: await sha256(cover) } } : {}),
  });
  if (!data.ready && cover) {
    const upload = await api<{ url: string; type: string }>("/api/novels/upload/presign", { slug: data.slug, cover: true });
    await putFile(upload.url, cover, upload.type);
  }
  return data;
}
export async function uploadChapters(slug: string, files: File[], titles: Record<number, string>, onProgress: (completed: number, total: number) => void) {
  if (!files.length || files.length > 10000) throw new Error("Choose between 1 and 10,000 chapters");
  // Recover a lost final response (or a library insertion failure) without re-uploading a ready book.
  try {
    await api("/api/novels/upload/complete", { slug, finalize: true, totalChapters: files.length });
    onProgress(files.length, files.length); return;
  } catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
  let completed = 0;
  for (let start = 0; start < files.length; start += 32) {
    const batch = files.slice(start, start + 32);
    const chapters = [];
    for (const [index, file] of batch.entries()) {
      const number = start + index + 1;
      chapters.push({ number, title: titles[number] || `Chapter ${number}`, size: file.size, sha256: await sha256(file) });
    }
    const urls = await api<{ number: number; url: string }[]>("/api/novels/upload/presign", { slug, chapters, totalChapters: files.length });
    // Four independent workers keep both browser memory and upload traffic bounded.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (cursor < urls.length) {
        const upload = urls[cursor++];
        await putFile(upload.url, files[upload.number - 1], "text/plain; charset=utf-8");
        onProgress(++completed, files.length);
      }
    }));
    for (let offset = start; offset < start + batch.length; offset += 8)
      await api("/api/novels/upload/complete", { slug, start: offset + 1, count: Math.min(8, start + batch.length - offset), totalChapters: files.length });
  }
  await api("/api/novels/upload/complete", { slug, finalize: true, totalChapters: files.length });
}
