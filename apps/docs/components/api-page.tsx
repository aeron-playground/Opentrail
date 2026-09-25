"use client";
import { createOpenAPIPage } from "fumadocs-openapi/ui";

// No "Send" button: the API isn't public yet, and the examples point at a local one.
export const APIPage = createOpenAPIPage({ playground: { enabled: false } });
