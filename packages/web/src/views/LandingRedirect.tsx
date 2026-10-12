// TASK-2381 — where `#/` goes. With anything pending from an automated source
// the app opens on the decide screen, so Butter sees it before anything else;
// otherwise it opens on Sync, as before. An unreachable adapter is not
// "nothing pending" — it falls back to Sync, whose screen says so.

import { Navigate } from "react-router-dom";
import { usePending } from "../hooks/use-pending";
import { Skeleton } from "../components/state/Skeleton";

export function LandingRedirect(): React.JSX.Element {
  const { items, isLoading, isError } = usePending();
  if (isLoading) return <Skeleton shape="list" label="Opening…" />;
  return <Navigate to={!isError && items.length > 0 ? "/decide" : "/sync"} replace />;
}
