import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { createAppRouter } from "./router";

export function App() {
  const [router] = useState(() => createAppRouter());
  return <RouterProvider router={router} />;
}
