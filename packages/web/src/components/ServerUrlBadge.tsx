export function ServerUrlBadge() {
  const host = typeof window !== "undefined" ? window.location.host : "";
  if (!host) return null;
  return (
    <span className="text-[12px] mono hidden md:inline" title="Server host">
      {host}
    </span>
  );
}
