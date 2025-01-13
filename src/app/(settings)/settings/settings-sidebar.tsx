"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ScrollShadow } from '@nextui-org/react'
import {
  User,
  Smartphone,
  Lock
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
  {
    title: "Change Password",
    href: "/forgot-password",
    icon: Lock,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const isLgAndSmaller = useMediaQuery('LG_AND_SMALLER')

  return (
    <ScrollShadow
      className="w-full lg:w-auto whitespace-nowrap pb-2"
      orientation="horizontal"
      isEnabled={isLgAndSmaller}
    >
      <nav className="flex min-w-full space-x-2 pb-2 lg:pb-0 lg:flex-col lg:space-x-0 lg:space-y-1">
        {sidebarNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              pathname === item.href
                ? "bg-muted hover:bg-muted dark:text-foreground dark:hover:text-foreground/70"
                : "hover:bg-transparent",
              "justify-start hover:no-underline whitespace-nowrap"
            )}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {item.title}
          </Link>
        ))}
      </nav>
    </ScrollShadow>
  );
}
