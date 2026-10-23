// TASK-2381 — where `#/` goes.
//
// TASK-2675 replaced the old choice (decide screen when something was pending,
// else Sync): the app now always opens on Today, which shows yesterday, every
// project's focus and what is outstanding. Pending decisions are still the first
// thing below it in the sidebar, with their red badge.

import { Navigate } from "react-router-dom";

export function LandingRedirect(): React.JSX.Element {
  return <Navigate to="/today" replace />;
}
