import { BookHeart, Library, Sparkles } from "lucide-react";

type PageLoaderProps = {
  label?: string;
  detail?: string;
  compact?: boolean;
};

export function PageLoader({
  label = "Opening Chronicle",
  detail = "Preparing your shelves",
  compact = false,
}: PageLoaderProps) {
  return (
    <div className={compact ? "page-loader-wrap page-loader-wrap-compact" : "page-loader-wrap"}>
      <div className={compact ? "page-loader page-loader-compact" : "page-loader"}>
        <div className="page-loader-mark" aria-hidden="true">
          <BookHeart size={30} />
          <span />
        </div>

        <div className="page-loader-copy">
          <p>{label}</p>
          <span>{detail}</span>
        </div>

        <div className="page-loader-rail" aria-hidden="true">
          <span />
        </div>

        <div className="page-loader-stack" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>

        <div className="page-loader-steps" aria-hidden="true">
          <span><Sparkles size={13} /> Session</span>
          <span><Library size={13} /> Library</span>
          <span>Ready</span>
        </div>
      </div>
    </div>
  );
}
