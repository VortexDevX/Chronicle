"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Camera, Check, Trash2 } from "lucide-react";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import { putFile, sha256 } from "@/lib/novels/storage/upload-client";
import { useMediaStore } from "@/store/mediaStore";
export function ProfileAvatar({ editable = false }: { editable?: boolean }) {
  const username = useMediaStore(s => s.username);
  const [url,setUrl] = useState<string | null>(null); const [busy,setBusy] = useState(false); const [message,setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => { void apiRequest<{ avatar_url?: string | null }>("/api/profile").then(d => { if (active) setUrl(d.avatar_url || null); }).catch(() => {}); };
    const changed = (event: Event) => setUrl((event as CustomEvent<string | null>).detail);
    load(); window.addEventListener("chronicle-avatar",changed);
    return () => { active = false; window.removeEventListener("chronicle-avatar",changed); };
  }, []);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("Choose an image smaller than 3 MiB.");
      const data = await apiRequest<{ id: string; url: string; type: string }>("/api/profile/avatar", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ extension:file.name.split(".").pop()?.toLowerCase(),size:file.size,sha256:await sha256(file) }) });
      await putFile(data.url,file,data.type);
      const result = await apiRequest<{ avatar_url:string }>("/api/profile/avatar",{ method:"PUT",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ id:data.id }) });
      window.dispatchEvent(new CustomEvent("chronicle-avatar",{ detail:result.avatar_url })); setMessage("Avatar updated.");
    } catch(e) { setMessage(getErrorMessage(e)); } finally { setBusy(false); }
  }
  async function remove() { setBusy(true); try { await apiRequest("/api/profile/avatar",{ method:"DELETE" }); window.dispatchEvent(new CustomEvent("chronicle-avatar",{ detail:null })); } catch(e) { setMessage(getErrorMessage(e)); } finally { setBusy(false); } }
  const avatar = <span className="profile-avatar">{url ? <Image src={url} alt="Your avatar" width={64} height={64} unoptimized/> : username?.charAt(0).toUpperCase() || "C"}</span>;
  return editable ? <div className={`avatar-editor ${busy ? "is-uploading" : ""}`}>{avatar}<div className="avatar-editor-copy"><h3>Profile photo</h3><p>A familiar face for your story space.</p><div className="avatar-file-actions"><label className="avatar-upload-control"><span>{busy ? <i className="spinner"/> : <Camera size={16}/>}<b>{busy ? "Uploading…" : url ? "Change photo" : "Upload photo"}</b></span><input aria-label="Profile photo" disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }}/></label>{url && <button className="avatar-remove" type="button" disabled={busy} onClick={remove} aria-label="Remove photo"><Trash2 size={15}/></button>}</div><small>JPG, PNG or WebP · up to 3 MB</small></div><p className="avatar-feedback" role="status">{message && <><Check size={14}/>{message}</>}</p></div> : avatar;
}
