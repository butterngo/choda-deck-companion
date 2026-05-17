import { createHashRouter, Navigate } from "react-router-dom";
import { Shell } from "./layouts/Shell";
import { QueueList } from "./views/QueueList";
import { QueueDetail } from "./views/QueueDetail";
import { TaskList } from "./views/TaskList";
import { TaskDetail } from "./views/TaskDetail";
import { InboxList } from "./views/InboxList";
import { InboxDetail } from "./views/InboxDetail";
import { ConversationList } from "./views/ConversationList";
import { ConversationDetail } from "./views/ConversationDetail";
import { Settings } from "./views/Settings";

export const router = createHashRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/queue" replace /> },
      { path: "queue", element: <QueueList /> },
      { path: "queue/:id", element: <QueueDetail /> },
      { path: "tasks", element: <TaskList /> },
      { path: "tasks/:id", element: <TaskDetail /> },
      { path: "inbox", element: <InboxList /> },
      { path: "inbox/:id", element: <InboxDetail /> },
      { path: "conversations", element: <ConversationList /> },
      { path: "conversations/:id", element: <ConversationDetail /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);
