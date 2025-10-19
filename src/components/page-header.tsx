import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

interface BreadcrumbItem {
  href: string;
  label: string;
}

interface PageHeaderProps {
  items?: BreadcrumbItem[];
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({
  items = [],
  title,
  description,
  icon,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <Breadcrumb>
            <BreadcrumbList>
              {items.map((item, index) => (
                <React.Fragment key={item.href}>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href={item.href}>
                      {item.label}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {index < items.length - 1 && (
                    <BreadcrumbSeparator className="hidden md:block" />
                  )}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {(title || description || icon || children) && (
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              {title && <h1 className="text-2xl font-semibold">{title}</h1>}
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {children && (
            <div className="flex items-center gap-2">{children}</div>
          )}
        </div>
      )}
    </div>
  );
}
