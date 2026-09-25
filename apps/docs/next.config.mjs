import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Plain static files in out/: the docs need no server.
  output: "export",
  reactStrictMode: true,
};

export default withMDX(config);
