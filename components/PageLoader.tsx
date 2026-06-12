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
        <div className="page-loader-signal" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="page-loader-copy">
          <p>{label}</p>
          <span>{detail}</span>
        </div>

        <div className="page-loader-rail" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
