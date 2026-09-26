import { SignInIcon } from "@phosphor-icons/react/SignIn";
import { APP_NAME } from "@repo/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { OfflineBanner } from "../components/common/offline-banner";
import { useAuth } from "../features/auth/auth-context";
import { SignInProvider, useSignIn } from "../features/auth/sign-in";
import { type NavItem, RAIL_FOOT_ITEMS, RAIL_ITEMS, TAB_ITEMS } from "./navigation";

// Hidden until focused, so the first Tab on any page reaches it.
const skipLinkClass =
  "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-20 focus:rounded-control focus:border focus:border-line focus:bg-paper focus:px-4 focus:py-3 focus:font-medium focus:shadow-float";

// The current page gets ink text and a 2 px ink line on its edge, so color is never the only
// signal. Hover changes the background only.
const railLinkClass =
  "flex min-h-11 items-center gap-3 border-l-2 border-transparent px-5 text-ink-2 hover:bg-paper-2 hover:text-ink aria-[current=page]:border-ink aria-[current=page]:font-medium aria-[current=page]:text-ink";
const tabLinkClass =
  "flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 border-transparent text-fine text-ink-2 hover:bg-paper-2 hover:text-ink aria-[current=page]:border-ink aria-[current=page]:font-medium aria-[current=page]:text-ink";

// The frame around every page: a rail on the left from 1024 px, tabs at the bottom below that.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SignInProvider>
      <ShellFrame>{children}</ShellFrame>
    </SignInProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a href="#content" className={skipLinkClass}>
        Skip to content
      </a>
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {/* tabIndex -1 lets the skip link move focus here. It is not a control, so no ring. */}
        <main id="content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <TabBar />
      </div>
    </div>
  );
}

function NavRail() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-line border-r py-6 lg:flex"
    >
      {/* The same transparent edge as the links, so the name lines up with their labels. */}
      <Link
        to="/"
        className="flex min-h-11 items-center border-transparent border-l-2 px-5 font-semibold text-section"
      >
        {APP_NAME}
      </Link>
      <ul className="mt-6">
        {RAIL_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink item={item} className={railLinkClass} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto">
        {RAIL_FOOT_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink item={item} className={railLinkClass} />
          </li>
        ))}
        <RailSignIn />
      </ul>
    </nav>
  );
}

// Visitors get a way to sign in from every page. Phones reach sign-in from the pages that
// need it, since the tabs are full.
function RailSignIn() {
  const { status } = useAuth();
  const { openSignIn } = useSignIn();
  if (status !== "signed-out") {
    return null;
  }
  return (
    <li>
      <button type="button" onClick={openSignIn} className={`w-full ${railLinkClass}`}>
        <SignInIcon size={20} aria-hidden="true" />
        Sign in
      </button>
    </li>
  );
}

function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-10 border-line border-t bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* On tablets the tabs keep to the content column instead of spreading edge to edge. */}
      <ul className="mx-auto grid max-w-feed auto-cols-fr grid-flow-col">
        {TAB_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink item={item} className={tabLinkClass} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

// The router marks the link of the current page with aria-current="page", which the classes
// above style. Search params don't change which page is current.
function NavLink({ item, className }: { item: NavItem; className: string }) {
  return (
    <Link to={item.to} activeOptions={{ includeSearch: false }} className={className}>
      <item.icon size={20} aria-hidden="true" />
      {item.label}
    </Link>
  );
}
