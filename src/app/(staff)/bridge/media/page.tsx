import type { Metadata } from "next";
import { getOperator } from "../../data";
import { signFrames } from "@/components/site/voyage-data";
import { MediaClient, type MediaCard } from "./media-client";
import { must } from "../../staff";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  const { supabase } = await getOperator();

  const { data: mediaData } = await supabase
    .from("voyage_media")
    .select("*")
    .order("created_at", { ascending: false });
  const media = mediaData ?? [];

  const voyageIds = [...new Set(media.map((m) => m.voyage_id))];
  const uploaderIds = [
    ...new Set(media.map((m) => m.uploaded_by).filter((id): id is string => !!id)),
  ];

  const [voyagesRes, uploadersRes] = await Promise.all([
    voyageIds.length
      ? supabase.from("voyages").select("id, title, starts_at").in("id", voyageIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; starts_at: string }> }),
    uploaderIds.length
      ? supabase.from("profiles").select("id, full_name, member_no").in("id", uploaderIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null; member_no: string | null }>,
        }),
  ]);

  const voyages = new Map((must(voyagesRes)).map((v) => [v.id, v]));
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
    const voyage = voyages.get(m.voyage_id);
    const uploader = m.uploaded_by ? uploaders.get(m.uploaded_by) : undefined;
    const uploaderName = uploader?.full_name ?? "Unknown hand";
    return {
      id: m.id,
      voyageId: m.voyage_id,
      voyageTitle: voyage?.title ?? "Voyage off the books",
      uploader: uploader?.member_no ? `${uploaderName} · ${uploader.member_no}` : uploaderName,
      caption: m.caption ?? "",
      approved: m.approved,
      createdAt: m.created_at,
      src: signed.get(m.storage_path) ?? null,
    };
  });

  const voyageOptions = [...voyages.values()]
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
      <MediaClient cards={cards} voyages={voyageOptions} />
    </div>
  );
}
