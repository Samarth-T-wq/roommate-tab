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

// Upload a new photo for my membership and point my avatar at it, then delete the old file.
// Each upload gets a new random file name, so nobody's browser keeps showing a cached old photo.
export async function setAvatar(me: Member, file: File | null) {
  let url: string | null = null;
  if (file) {
    const blob = await squareJpeg(file);
    const path = `${me.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw new Error(/bucket not found/i.test(error.message) ? "Photos aren't set up yet: run supabase/avatars.sql." : error.message);
    url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await supabase.rpc("set_my_avatar", { m: me.id, url });
  if (error) throw new Error(error.message);
  // Best effort: an orphaned old photo only wastes a few KB.
  const old = pathOf(me.avatar_url);
  if (old) await supabase.storage.from("avatars").remove([old]);
  return url;
}
