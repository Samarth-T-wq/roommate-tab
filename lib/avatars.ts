"use client";

import { supabase, type Member } from "@/lib/supabase";

const SIZE = 256; // pixels; avatars never show bigger than ~80px, so this stays sharp on retina screens

// Center-crop a picked photo to a square and shrink it to a ~20 KB JPEG.
// Drawing through an <img> also converts iPhone HEIC photos, which other browsers can't show.
async function squareJpeg(file: File): Promise<Blob> {
  const src = URL.createObjectURL(file);
  try {
    // onload rather than img.decode(): decode() can stall forever in pages that aren't on screen.
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That file isn't a photo this browser can open. Try a JPEG or PNG."));
      img.src = src;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    canvas
      .getContext("2d")!
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo."))), "image/jpeg", 0.85)
    );
  } finally {
    URL.revokeObjectURL(src);
  }
}

// "https://x.supabase.co/storage/v1/object/public/avatars/<id>/<file>.jpg" -> "<id>/<file>.jpg"
const pathOf = (url: string | null | undefined) => url?.split("/storage/v1/object/public/avatars/")[1] ?? null;

// Give a roommate a new photo (or clear it with null). You can set anyone's photo except your own;
// the database rules enforce that too. Each upload gets a new random file name, so nobody's browser
// keeps showing a cached old photo.
export async function setAvatar(target: Member, file: File | null) {
  const bucket = supabase.storage.from("avatars");
  let path: string | null = null;
  let url: string | null = null;
  if (file) {
    const blob = await squareJpeg(file);
    path = `${target.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await bucket.upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(/bucket not found/i.test(error.message) ? "Photos aren't set up yet: run supabase/avatars.sql." : error.message);
    url = bucket.getPublicUrl(path).data.publicUrl;
  }
  const { error } = await supabase.rpc("set_avatar", { m: target.id, url });
  if (error) {
    if (path) await bucket.remove([path]); // don't leave the unused upload behind
    throw new Error(error.message);
  }
  await clearOldPhotos(target, path);
  return url;
}

// Delete everything in the member's folder except `keep`, so each person only ever stores one photo.
// Also sweeps up files left by an earlier change whose delete didn't go through.
async function clearOldPhotos(target: Member, keep: string | null) {
  const bucket = supabase.storage.from("avatars");
  const { data } = await bucket.list(target.id, { limit: 100 });
  const old = (data ?? []).map((f) => `${target.id}/${f.name}`).filter((p) => p !== keep);
  // The previous photo even if listing came back empty.
  const previous = pathOf(target.avatar_url);
  if (previous && previous !== keep && !old.includes(previous)) old.push(previous);
  if (old.length > 0) await bucket.remove(old);
}
