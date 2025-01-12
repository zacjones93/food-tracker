"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  User,
  Bell,
  CreditCard,
  Lock,
  Settings,
  Shield,
  Smartphone
} from "lucide-react";

interface SidebarNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sidebarNavItems: SidebarNavItem[] = [
  {
    title: "Profile",
    href: "/settings",
    icon: User,
  },
  {
    title: "Sessions",
    href: "/settings/sessions",
    icon: Smartphone,
  },
  // {
  //   title: "Account",
  //   href: "/settings/account",
  //   icon: Settings,
  // },
  // {
  //   title: "Notifications",
  //   href: "/settings/notifications",
  //   icon: Bell,
  // },
  // {
  //   title: "Billing",
  //   href: "/settings/billing",
  //   icon: CreditCard,
  // },
  // {
  //   title: "Security",
  //   href: "/settings/security",
  //   icon: Shield,
  // },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
      {sidebarNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            pathname === item.href
              ? "bg-muted hover:bg-muted dark:text-foreground dark:hover:text-foreground/70"
              : "hover:bg-transparent",
            "justify-start hover:no-underline"
          )}
        >
          <item.icon className="mr-2 h-4 w-4" />
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
