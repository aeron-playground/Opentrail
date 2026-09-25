import { APP_NAME } from "@repo/shared";

export const SITE_NAME = `${APP_NAME} docs`;

export const REPOSITORY = {
  owner: "aeron-playground",
  name: "Opentrail",
  branch: "main",
} as const;

export const REPOSITORY_URL = `https://github.com/${REPOSITORY.owner}/${REPOSITORY.name}`;
