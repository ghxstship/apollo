import type { Metadata } from "next";
import { getOperator } from "../../data";
import { signFrames } from "@/components/site/episode-data";
import { MediaClient, type MediaCard } from "./media-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  const { supabase } = await getOperator();

  const mediaRes = await supabase
    .from("episode_media")
    .select("*")
    .order("created_at", { ascending: false });
  const media = must(mediaRes);

  const episodeIds = [...new Set(media.map((m) => m.episode_id))];
  const uploaderIds = [
    ...new Set(media.map((m) => m.uploaded_by).filter((id): id is string => !!id)),
  ];

  const [episodesRes, uploadersRes] = await Promise.all([
    episodeIds.length
      ? supabase.from("episodes").select("id, title, starts_at").in("id", episodeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; starts_at: string }> }),
    uploaderIds.length
      ? supabase.from("profiles").select("id, full_name, member_no").in("id", uploaderIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }>,
        }),
  ]);

  const episodes = new Map((must(episodesRes)).map((v) => [v.id, v]));
  const uploaders = new Map((must(uploadersRes)).map((p) => [p.id, p]));

  /* The bucket is private, so the path is not a URL — this screen built one
     against /object/public/ and every thumbnail came back 400. The Bridge was
     approving and rejecting frames it could not see. Sign them, the same way
     the gallery does.

     A frame whose file is missing gets no signed URL and keeps `src: null`
     rather than being dropped: the row is exactly what staff need to see in
     order to clear it. */
  const signed = await signFrames(supabase, media.map((m) => m.storage_path));

  const cards: MediaCard[] = media.map((m) => {
    const episode = episodes.get(m.episode_id);
    const uploader = m.uploaded_by ? uploaders.get(m.uploaded_by) : undefined;
    const uploaderName = uploader?.full_name ?? "Unknown hand";
    return {
      id: m.id,
      episodeId: m.episode_id,
      voyageTitle: episode?.title ?? "Episode off the books",
      uploader: uploader?.member_no ? `${uploaderName} · ${uploader.member_no}` : uploaderName,
      caption: m.caption ?? "",
      approved: m.approved,
      createdAt: m.created_at,
      src: signed.get(m.storage_path) ?? null,
    };
  });

  const voyageOptions = [...episodes.values()]
    .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1))
    .map((v) => ({ id: v.id, title: v.title }));

  return (
    <div>
      <span className="hm-eyebrow">Media</span>
      <h1 className="hm-h1">What came back from the water.</h1>
      <p className="hm-lede">
        Members aboard send frames up; nothing shows until it is cleared here. Look at the faces
        before you clear it — consent is the whole test.
      </p>
      <MediaClient cards={cards} episodes={voyageOptions} />
    </div>
  );
}
