# List to Ladle - Mystic Theme Refactor Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Color Palette](#color-palette)
3. [Installation & Setup](#installation--setup)
4. [Configuration Files](#configuration-files)
5. [Component Library](#component-library)
6. [Migration Plan](#migration-plan)
7. [Quick Reference](#quick-reference)
8. [Testing Checklist](#testing-checklist)

---

## Overview

This guide provides a complete refactoring plan to align your Next.js application with the "List to Ladle" brand identity. The new design features:

- **Mystic purple** as primary brand color (#4A3B5C, #2D1F3D)
- **Warm cream/tan** as secondary color (#F5EFE6, #EDE4D3)
- **Elegant serif typography** for headings (Cormorant Garamond)
- **Modern interactions** with smooth transitions and hover effects
- **Full shadcn/ui integration** with custom theming

---

## Color Palette

### Mystic Purple (Primary)
```
mystic-50:  #F5F3F7  - Lightest tint
mystic-100: #EBE7EF  - Very light
mystic-200: #D7CFE0  - Light
mystic-300: #B8A9C9  - Light-medium
mystic-400: #9784AD  - Medium-light
mystic-500: #7A6491  - Medium
mystic-600: #6B4E71  - Medium-dark (main button color)
mystic-700: #574265  - Dark (heading color)
mystic-800: #4A3B5C  - Very dark (primary brand)
mystic-900: #2D1F3D  - Darkest (header bg)
mystic-950: #1A1125  - Ultra dark
```

### Cream/Tan (Secondary)
```
cream-50:  #FEFBF6  - Off-white (backgrounds)
cream-100: #F5EFE6  - Light cream (cards, text on purple)
cream-200: #EDE4D3  - Cream (borders)
cream-300: #E4D9C0  - Medium cream
cream-400: #D4C5B0  - Beige
cream-500: #C4B5A0  - Medium beige
cream-600: #A89679  - Dark beige
cream-700: #8C7A5E  - Brown-beige
```

### Accent Colors
```
lavender-light: #B8A9C9  - Soft purple accent
lavender:       #8B7B99  - Medium purple accent
lavender-dark:  #6B5D7A  - Dark purple accent
```

### Usage Guidelines
- **Headings**: mystic-800, mystic-700
- **Body text**: mystic-700, mystic-600
- **Backgrounds**: cream-50, gradient from cream to mystic
- **Cards**: cream-50 to cream-100
- **Buttons**: mystic-600 (primary), cream-200 (secondary)
- **Borders**: cream-300, mystic-200

---

## Installation & Setup

### Step 1: Install Dependencies
```bash
npm install tailwindcss-animate @headlessui/react
```

### Step 2: Update Package Dependencies
Ensure you have:
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "tailwindcss": "^3.4.0",
    "tailwindcss-animate": "^1.0.7",
    "@headlessui/react": "^1.7.0"
  }
}
```

### Step 3: Create Utility Function
Create `lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## Configuration Files

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        mystic: {
          50: '#F5F3F7',
          100: '#EBE7EF',
          200: '#D7CFE0',
          300: '#B8A9C9',
          400: '#9784AD',
          500: '#7A6491',
          600: '#6B4E71',
          700: '#574265',
          800: '#4A3B5C',
          900: '#2D1F3D',
          950: '#1A1125',
        },
        cream: {
          50: '#FEFBF6',
          100: '#F5EFE6',
          200: '#EDE4D3',
          300: '#E4D9C0',
          400: '#D4C5B0',
          500: '#C4B5A0',
          600: '#A89679',
          700: '#8C7A5E',
          800: '#6F5F47',
          900: '#504435',
        },
        lavender: {
          light: '#B8A9C9',
          DEFAULT: '#8B7B99',
          dark: '#6B5D7A',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ['var(--font-raleway)', 'sans-serif'],
  			heading: ['var(--font-rosarivo)', 'serif']
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        'mystic-sm': '0 1px 2px 0 rgba(74, 59, 92, 0.05)',
        'mystic': '0 4px 6px -1px rgba(74, 59, 92, 0.1), 0 2px 4px -1px rgba(74, 59, 92, 0.06)',
        'mystic-md': '0 10px 15px -3px rgba(74, 59, 92, 0.1), 0 4px 6px -2px rgba(74, 59, 92, 0.05)',
        'mystic-lg': '0 20px 25px -5px rgba(74, 59, 92, 0.1), 0 10px 10px -5px rgba(74, 59, 92, 0.04)',
        'mystic-xl': '0 25px 50px -12px rgba(74, 59, 92, 0.25)',
        'cream': '0 4px 6px -1px rgba(196, 181, 160, 0.1), 0 2px 4px -1px rgba(196, 181, 160, 0.06)',
      },
      backgroundImage: {
        'mystic-gradient': 'linear-gradient(135deg, #4A3B5C 0%, #2D1F3D 100%)',
        'mystic-gradient-soft': 'linear-gradient(135deg, #7A6491 0%, #574265 100%)',
        'cream-gradient': 'linear-gradient(135deg, #F5EFE6 0%, #EDE4D3 100%)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### globals.css (or app/globals.css)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 45 20% 97%;
    --foreground: 270 20% 20%;
    --card: 40 30% 96%;
    --card-foreground: 270 20% 20%;
    --popover: 40 30% 96%;
    --popover-foreground: 270 20% 20%;
    --primary: 280 25% 40%;
    --primary-foreground: 40 30% 95%;
    --secondary: 40 30% 85%;
    --secondary-foreground: 270 20% 20%;
    --muted: 280 15% 90%;
    --muted-foreground: 280 10% 40%;
    --accent: 280 30% 60%;
    --accent-foreground: 270 20% 20%;
    --destructive: 0 70% 50%;
    --destructive-foreground: 0 0% 98%;
    --border: 280 20% 85%;
    --input: 280 20% 85%;
    --ring: 280 25% 40%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 270 30% 10%;
    --foreground: 40 30% 95%;
    --card: 270 25% 15%;
    --card-foreground: 40 30% 95%;
    --popover: 270 25% 15%;
    --popover-foreground: 40 30% 95%;
    --primary: 280 30% 60%;
    --primary-foreground: 270 30% 10%;
    --secondary: 280 20% 20%;
    --secondary-foreground: 40 30% 90%;
    --muted: 280 20% 20%;
    --muted-foreground: 280 15% 60%;
    --accent: 280 35% 50%;
    --accent-foreground: 40 30% 95%;
    --destructive: 0 60% 40%;
    --destructive-foreground: 40 30% 95%;
    --border: 280 20% 25%;
    --input: 280 20% 25%;
    --ring: 280 30% 60%;
  }
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans;
    font-feature-settings: "rlig" 1, "calt" 1;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-serif;
  }

  h1 {
    @apply text-4xl md:text-5xl font-semibold text-mystic-800 tracking-tight;
  }

  h2 {
    @apply text-3xl md:text-4xl font-semibold text-mystic-800;
  }

  h3 {
    @apply text-2xl md:text-3xl font-medium text-mystic-700;
  }
}

@layer utilities {
  .text-gradient-mystic {
    @apply bg-gradient-to-r from-mystic-600 to-mystic-800 bg-clip-text text-transparent;
  }

  .shimmer {
    position: relative;
    overflow: hidden;
  }

  .shimmer::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(138, 123, 153, 0.2),
      transparent
    );
    animation: shimmer 2s infinite;
  }

  .glass-mystic {
    @apply bg-mystic-50/30 backdrop-blur-md border border-mystic-200/50;
  }
}

::-webkit-scrollbar {
  width: 10px;
}

::-webkit-scrollbar-track {
  @apply bg-cream-100;
}

::-webkit-scrollbar-thumb {
  @apply bg-mystic-400 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
  @apply bg-mystic-500;
}
```

---

## Component Library

### Button Component
**Location:** `components/ui/Button.tsx`

```tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mystic-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      primary: "bg-mystic-gradient text-cream-50 shadow-mystic hover:shadow-mystic-lg hover:scale-[1.02]",
      secondary: "bg-cream-200 text-mystic-800 hover:bg-cream-300 shadow-cream",
      ghost: "text-mystic-700 hover:bg-mystic-100 hover:text-mystic-900",
      outline: "border-2 border-mystic-600 text-mystic-700 hover:bg-mystic-50",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
```

### Card Component
**Location:** `components/ui/Card.tsx`

```tsx
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={cn(
        "bg-cream-50 border border-cream-300 rounded-xl p-6 shadow-cream",
        hover && "transition-all duration-300 hover:shadow-mystic-md hover:-translate-y-1",
        className
      )}
    >
      {children}
    </div>
  );
}
```

### Input Component
**Location:** `components/ui/Input.tsx`

```tsx
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-mystic-700">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full px-4 py-2 bg-cream-50 border-2 border-cream-300 rounded-lg",
          "text-mystic-900 placeholder:text-mystic-400",
          "focus:outline-none focus:ring-2 focus:ring-mystic-500 focus:border-transparent",
          "transition-all duration-200",
          error && "border-red-400 focus:ring-red-500",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
```

### Badge Component
**Location:** `components/ui/Badge.tsx`

```tsx
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const variants = {
    default: "bg-mystic-600 text-cream-50",
    secondary: "bg-lavender-light text-mystic-900",
    outline: "border-2 border-mystic-600 text-mystic-700",
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
      variants[variant]
    )}>
      {children}
    </span>
  );
}
```

### Header Component
**Location:** `components/ui/Header.tsx`

```tsx
export function Header() {
  return (
    <header className="bg-mystic-gradient border-b border-mystic-700/20 shadow-mystic">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Your logo component here */}
            <h1 className="text-2xl font-serif text-cream-50">
              List to Ladle
            </h1>
          </div>
          <nav className="flex items-center gap-6">
            <a
              href="#"
              className="text-cream-100 hover:text-cream-50 transition-colors duration-200 font-medium"
            >
              Recipes
            </a>
            <a
              href="#"
              className="text-cream-100 hover:text-cream-50 transition-colors duration-200 font-medium"
            >
              Schedule
            </a>
            <a
              href="#"
              className="text-cream-100 hover:text-cream-50 transition-colors duration-200 font-medium"
            >
              Shopping
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
```

### Recipe Card Component
**Location:** `components/ui/RecipeCard.tsx`

```tsx
import { Card } from './Card';

interface RecipeCardProps {
  title: string;
  emoji: string;
  category?: string;
  onDelete?: () => void;
}

export function RecipeCard({ title, emoji, category, onDelete }: RecipeCardProps) {
  return (
    <Card hover className="group">
      <div className="flex items-center gap-4">
        {/* Drag handle */}
        <div className="text-mystic-400 hover:text-mystic-600 cursor-grab active:cursor-grabbing">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>

        {/* Emoji icon */}
        <div className="text-3xl">{emoji}</div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="font-serif text-lg text-mystic-800 font-medium">
            {title}
          </h3>
          {category && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-mystic-100 text-mystic-700 text-xs rounded-full">
              {category}
            </span>
          )}
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-mystic-400 hover:text-red-600 p-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </Card>
  );
}
```

---

## Migration Plan

### Phase 1: Setup (Day 1)
- [ ] Install dependencies
- [ ] Replace `tailwind.config.js`
- [ ] Update `globals.css`
- [ ] Add font configuration
- [ ] Create `lib/utils.ts`

### Phase 2: Core Components (Days 2-3)
- [ ] Create Button component
- [ ] Create Input component
- [ ] Create Card component
- [ ] Create Badge component
- [ ] Test all components in isolation

### Phase 3: Layout Components (Day 4)
- [ ] Update Header/Navigation
- [ ] Update Footer (if applicable)
- [ ] Update page layouts
- [ ] Apply background gradients

### Phase 4: Feature Components (Days 5-6)
- [ ] Update Recipe cards
- [ ] Update Week schedule view
- [ ] Update Shopping list
- [ ] Update any forms

### Phase 5: Advanced Features (Days 7-8)
- [ ] Add Modal system
- [ ] Add Toast notifications
- [ ] Add Loading states
- [ ] Add Empty states

### Phase 6: Polish & Testing (Days 9-10)
- [ ] Review all pages for consistency
- [ ] Test responsive behavior
- [ ] Test accessibility
- [ ] Add hover effects
- [ ] Optimize performance

---

## Quick Reference

### Common Patterns

#### Page Background
```tsx
<div className="min-h-screen bg-gradient-to-br from-cream-50 via-background to-mystic-50">
  {/* content */}
</div>
```

#### Section Heading
```tsx
<h2 className="text-3xl font-serif text-mystic-800 mb-4">
  Section Title
</h2>
```

#### Primary Button
```tsx
<Button variant="primary" size="lg">
  Click Me
</Button>
```

#### Card with Gradient
```tsx
<Card className="bg-gradient-to-br from-cream-50 to-cream-100">
  {/* content */}
</Card>
```

#### Form Input
```tsx
<Input
  label="Recipe Name"
  placeholder="Enter name"
  error={errors.name}
/>
```

### Color Usage Guide

| Element | Color Class |
|---------|-------------|
| Page heading | `text-mystic-800` |
| Section heading | `text-mystic-700` |
| Body text | `text-mystic-700` |
| Muted text | `text-mystic-600` |
| Link text | `text-mystic-600 hover:text-mystic-800` |
| Button primary | `bg-mystic-gradient` |
| Button secondary | `bg-cream-200` |
| Card background | `bg-cream-50` |
| Input background | `bg-cream-50` |
| Border | `border-cream-300` |

---

## Testing Checklist

### Visual Testing
- [ ] All colors match brand palette
- [ ] Typography hierarchy is clear
- [ ] Spacing is consistent
- [ ] Shadows are subtle and appropriate
- [ ] Gradients are smooth
- [ ] Hover states work correctly
- [ ] Focus states are visible

### Responsive Testing
- [ ] Mobile (320px - 768px)
- [ ] Tablet (768px - 1024px)
- [ ] Desktop (1024px+)
- [ ] Large desktop (1440px+)

### Browser Testing
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Screen reader compatibility
- [ ] Color contrast ratios pass WCAG AA
- [ ] Focus indicators are visible
- [ ] Alt text on images

### Functionality Testing
- [ ] All buttons work
- [ ] Forms submit correctly
- [ ] Modals open/close
- [ ] Drag and drop works
- [ ] Delete actions work
- [ ] Navigation works

---

## Common Migration Issues

### Issue: Hard-coded colors remain
**Solution:** Search for common color patterns:
- `bg-gray-` → replace with `bg-cream-` or `bg-mystic-`
- `text-gray-` → replace with `text-mystic-`
- `blue-` → replace with `mystic-`

### Issue: Shadows not visible
**Solution:** Use themed shadows:
```tsx
shadow-mystic    // Instead of shadow-md
shadow-mystic-lg // Instead of shadow-lg
```

### Issue: Font not loading
**Solution:** Check Google Fonts import in `globals.css` and verify font-family in `tailwind.config.js`

### Issue: Gradients not showing
**Solution:** Use the predefined gradients:
```tsx
bg-mystic-gradient  // For buttons/headers
bg-gradient-to-br from-cream-50 to-cream-100  // For cards
```

---

## Best Practices

1. **Always use theme colors** - Never hard-code hex values in components
2. **Use semantic classes** - Prefer `text-mystic-800` over arbitrary values
3. **Maintain consistency** - Use the same spacing/sizing across similar components
4. **Test accessibility** - Ensure sufficient color contrast
5. **Optimize images** - Use Next.js Image component
6. **Keep components small** - Each component should have a single responsibility
7. **Document deviations** - Comment any custom styles that deviate from the system

---

## Support Resources

- **Tailwind CSS Documentation**: https://tailwindcss.com/docs
- **shadcn/ui Documentation**: https://ui.shadcn.com
- **Next.js Documentation**: https://nextjs.org/docs
- **Headless UI**: https://headlessui.com

---

## Summary

This refactoring plan transforms your application to align with the "List to Ladle" brand identity:

✨ **Mystical purple** and warm cream color palette
🎨 **Elegant serif typography** for headings
🎯 **Consistent component library** with shadcn integration
📱 **Fully responsive** design system
♿ **Accessible** by default
🚀 **Performance optimized** with modern techniques

Follow the migration plan step-by-step, testing thoroughly at each phase. The result will be a cohesive, professional application that reflects your brand's mystical and inviting character.

---

**Document Version:** 1.0
**Last Updated:** October 19, 2025
**Author:** Claude (Anthropic)