"use client";

/**
 * Themed Phosphor Icons - Mystic Design System
 *
 * Pre-styled icons with mystic color palette and appropriate weights.
 * Uses duotone for decorative/food icons, regular/bold for UI elements.
 */

import {
  // Navigation & Layout
  Calendar as PhosphorCalendar,
  CalendarBlank,
  CalendarPlus as PhosphorCalendarPlus,
  BookOpen as PhosphorBookOpen,
  ClipboardText,
  Gear,
  ArrowLeft as PhosphorArrowLeft,
  ArrowRight as PhosphorArrowRight,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  ArrowsDownUp,
  List as PhosphorMenu,
  SidebarSimple,

  // Food & Cooking
  CookingPot,
  ForkKnife,

  // UI Elements
  Clock as PhosphorClock,
  Plus as PhosphorPlus,
  X as PhosphorX,
  Check,
  CheckCircle,
  Circle as PhosphorCircle,
  MagnifyingGlass,
  DotsThree,
  DotsThreeVertical,
  DotsSixVertical,
  Sliders,
  CircleNotch,
  ArrowsLeftRight,

  // Actions
  PencilSimple,
  Trash,
  FloppyDisk,
  Eye,
  EyeSlash,

  // External & Links
  ArrowSquareOut,
  ShareNetwork,
  Folder as PhosphorFolder,

  // Decorative
  Sparkle,
  Moon as PhosphorMoon,
  Sun as PhosphorSun,
  Star,
  Crown as PhosphorCrown,
  ShieldCheck,

  // User & Auth
  User,
  Users,
  UserPlus as PhosphorUserPlus,
  SignOut,
  LockKey,

  // Additional UI
  DeviceMobile,
  Buildings,
  type IconProps,
} from "phosphor-react";

// Type for icon components
export type ThemedIconProps = Omit<IconProps, "weight" | "color"> & {
  /** Override default weight */
  weight?: IconProps["weight"];
  /** Override default color */
  color?: string;
};

// Mystic color palette
export const MYSTIC_COLORS = {
  primary: "#6B4E71",
  secondary: "#4A3B5C",
  accent: "#8B7B99",
  tertiary: "#574265",
  quaternary: "#7A6491",
  cream: {
    100: "#F5EFE6",
    200: "#E8DFD0",
    300: "#DBC9B8",
  },
} as const;

// =============================================================================
// NAVIGATION & LAYOUT ICONS (Regular/Bold weights)
// =============================================================================

export const Calendar = (props: ThemedIconProps) => (
  <PhosphorCalendar
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChefHat = (props: ThemedIconProps) => (
  <CookingPot
    weight={props.weight || "duotone"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const BookOpen = (props: ThemedIconProps) => (
  <PhosphorBookOpen
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ClipboardList = (props: ThemedIconProps) => (
  <ClipboardText
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Settings2 = (props: ThemedIconProps) => (
  <Gear
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

// =============================================================================
// UI ELEMENT ICONS (Regular weights)
// =============================================================================

export const ArrowLeft = (props: ThemedIconProps) => (
  <PhosphorArrowLeft
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronDown = (props: ThemedIconProps) => (
  <CaretDown
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronUp = (props: ThemedIconProps) => (
  <CaretUp
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronLeft = (props: ThemedIconProps) => (
  <CaretLeft
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronRight = (props: ThemedIconProps) => (
  <CaretRight
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronsLeft = (props: ThemedIconProps) => (
  <CaretDoubleLeft
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronsRight = (props: ThemedIconProps) => (
  <CaretDoubleRight
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ChevronsUpDown = (props: ThemedIconProps) => (
  <ArrowsDownUp
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ArrowRight = (props: ThemedIconProps) => (
  <PhosphorArrowRight
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const CalendarPlus = (props: ThemedIconProps) => (
  <PhosphorCalendarPlus
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Clock = (props: ThemedIconProps) => (
  <PhosphorClock
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Plus = (props: ThemedIconProps) => (
  <PhosphorPlus
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ExternalLink = (props: ThemedIconProps) => (
  <ArrowSquareOut
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const CheckCircle2 = (props: ThemedIconProps) => (
  <CheckCircle
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Circle = (props: ThemedIconProps) => (
  <PhosphorCircle
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const MoreHorizontal = (props: ThemedIconProps) => (
  <DotsThree
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const MoreVertical = (props: ThemedIconProps) => (
  <DotsThreeVertical
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const ArrowRightLeft = (props: ThemedIconProps) => (
  <ArrowsLeftRight
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Menu = (props: ThemedIconProps) => (
  <PhosphorMenu
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const PanelLeft = (props: ThemedIconProps) => (
  <SidebarSimple
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Save = (props: ThemedIconProps) => (
  <FloppyDisk
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const GripVertical = (props: ThemedIconProps) => (
  <DotsSixVertical
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const SlidersHorizontal = (props: ThemedIconProps) => (
  <Sliders
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Loader2 = (props: ThemedIconProps) => (
  <CircleNotch
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Settings = (props: ThemedIconProps) => (
  <Gear
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Moon = (props: ThemedIconProps) => (
  <PhosphorMoon
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Sun = (props: ThemedIconProps) => (
  <PhosphorSun
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Crown = (props: ThemedIconProps) => (
  <PhosphorCrown
    weight={props.weight || "duotone"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Sparkles = (props: ThemedIconProps) => (
  <Sparkle
    weight={props.weight || "duotone"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Shield = (props: ThemedIconProps) => (
  <ShieldCheck
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Trash2 = (props: ThemedIconProps) => (
  <Trash
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const UserPlus = (props: ThemedIconProps) => (
  <PhosphorUserPlus
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Smartphone = (props: ThemedIconProps) => (
  <DeviceMobile
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Building2 = (props: ThemedIconProps) => (
  <Buildings
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

// =============================================================================
// FOOD & COOKING ICONS (Duotone for mystic aesthetic)
// =============================================================================

export const MysticCookingPot = (props: ThemedIconProps) => (
  <CookingPot
    weight="duotone"
    color={props.color || MYSTIC_COLORS.primary}
    {...props}
  />
);

export const MysticForkKnife = (props: ThemedIconProps) => (
  <ForkKnife
    weight="duotone"
    color={props.color || MYSTIC_COLORS.accent}
    {...props}
  />
);

// =============================================================================
// DECORATIVE ICONS (Duotone for magical feel)
// =============================================================================

export const MysticSparkle = (props: ThemedIconProps) => (
  <Sparkle
    weight="duotone"
    color={props.color || MYSTIC_COLORS.accent}
    {...props}
  />
);

export const MysticMoon = (props: ThemedIconProps) => (
  <Moon
    weight="fill"
    color={props.color || MYSTIC_COLORS.secondary}
    {...props}
  />
);

export const MysticStar = (props: ThemedIconProps) => (
  <Star
    weight="duotone"
    color={props.color || MYSTIC_COLORS.accent}
    {...props}
  />
);

// =============================================================================
// ACTION ICONS (Regular/Bold weights)
// =============================================================================

export const Pencil = (props: ThemedIconProps) => (
  <PencilSimple
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const TrashIcon = (props: ThemedIconProps) => (
  <Trash
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Search = (props: ThemedIconProps) => (
  <MagnifyingGlass
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const CheckIcon = (props: ThemedIconProps) => (
  <Check
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const XIcon = (props: ThemedIconProps) => (
  <PhosphorX
    weight={props.weight || "bold"}
    color={props.color || "currentColor"}
    {...props}
  />
);

// Alias for compatibility
export const X = XIcon;

// =============================================================================
// USER & AUTH ICONS (Regular weights)
// =============================================================================

export const UserIcon = (props: ThemedIconProps) => (
  <User
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const UsersIcon = (props: ThemedIconProps) => (
  <Users
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const LogOut = (props: ThemedIconProps) => (
  <SignOut
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const LockIcon = (props: ThemedIconProps) => (
  <LockKey
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const EyeIcon = (props: ThemedIconProps) => (
  <Eye
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const EyeOffIcon = (props: ThemedIconProps) => (
  <EyeSlash
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Folder = (props: ThemedIconProps) => (
  <PhosphorFolder
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

export const Forward = (props: ThemedIconProps) => (
  <ShareNetwork
    weight={props.weight || "regular"}
    color={props.color || "currentColor"}
    {...props}
  />
);

// Export all Phosphor icons for direct use
export {
  PhosphorCalendar,
  CalendarBlank,
  PhosphorCalendarPlus,
  PhosphorBookOpen,
  ClipboardText,
  Gear,
  PhosphorArrowLeft,
  PhosphorArrowRight,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  CaretDoubleLeft,
  CaretDoubleRight,
  ArrowsDownUp,
  PhosphorMenu,
  SidebarSimple,
  CookingPot,
  ForkKnife,
  PhosphorClock,
  PhosphorPlus,
  PhosphorX,
  Check,
  CheckCircle,
  PhosphorCircle,
  MagnifyingGlass,
  DotsThree,
  DotsThreeVertical,
  DotsSixVertical,
  Sliders,
  CircleNotch,
  ArrowsLeftRight,
  PencilSimple,
  Trash,
  Eye,
  EyeSlash,
  ArrowSquareOut,
  Sparkle,
  PhosphorMoon,
  PhosphorSun,
  Star,
  PhosphorCrown,
  ShieldCheck,
  User,
  Users,
  PhosphorUserPlus,
  SignOut,
  LockKey,
  DeviceMobile,
  Buildings,
};
