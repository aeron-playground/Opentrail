import type { Icon } from "@phosphor-icons/react";
// One import per icon: the package's index loads all of its three thousand icons.
import { BellIcon } from "@phosphor-icons/react/Bell";
import { ChartPieSliceIcon } from "@phosphor-icons/react/ChartPieSlice";
import { CompassIcon } from "@phosphor-icons/react/Compass";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { HouseIcon } from "@phosphor-icons/react/House";
import { PlusCircleIcon } from "@phosphor-icons/react/PlusCircle";
import type { FileRouteTypes } from "../routeTree.gen";

// A menu leads to whole pages, never to one token's page: no path with a parameter such as $mint.
type PagePath = Exclude<FileRouteTypes["to"], `${string}/$${string}`>;

export type NavItem = {
  to: PagePath;
  label: string;
  icon: Icon;
};

const home: NavItem = { to: "/", label: "Home", icon: HouseIcon };
const explore: NavItem = { to: "/explore", label: "Explore", icon: CompassIcon };
const portfolio: NavItem = { to: "/portfolio", label: "Portfolio", icon: ChartPieSliceIcon };
const alerts: NavItem = { to: "/alerts", label: "Alerts", icon: BellIcon };
const addFunds: NavItem = { to: "/deposit", label: "Add funds", icon: PlusCircleIcon };
const settings: NavItem = { to: "/settings", label: "Settings", icon: GearSixIcon };

// Wide screens: the rail lists the main pages, with Add funds and Settings at its foot.
export const RAIL_ITEMS = [home, explore, portfolio, alerts];
export const RAIL_FOOT_ITEMS = [addFunds, settings];

// Phones have room for five tabs. Add funds sits in the Portfolio header instead, and Settings
// holds the fifth tab until there are profiles to show there.
export const TAB_ITEMS = [home, explore, portfolio, alerts, settings];
