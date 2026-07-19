---
name: Food Tracker
description: A warm, dependable system for recipes, meal planning, and groceries.
colors:
  mystic-deep: "#2D1F3D"
  mystic-action: "#6B4E71"
  mystic-soft: "#B8A9C9"
  cream-paper: "#FEFBF6"
  cream-surface: "#F5EFE6"
  cream-border: "#E4D9C0"
  ink-warm: "#504435"
  destructive: "#D93636"
typography:
  headline:
    fontFamily: "Rosarivo, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.mystic-action}"
    textColor: "{colors.cream-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.mystic-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.cream-paper}"
    textColor: "{colors.mystic-deep}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "40px"
  surface:
    backgroundColor: "{colors.cream-surface}"
    textColor: "{colors.mystic-deep}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Food Tracker

## 1. Overview

**Creative North Star: "The Well-Used Recipe Binder"**

Food Tracker should feel like a trusted household object made precise enough for daily planning. Warm paper-like surfaces and muted plum ink provide culinary character, while familiar controls keep recipes, schedules, and grocery work fast. The interface is quiet around the content and decisive at the point of action.

This is product UI, not recipe media and not a generic SaaS dashboard. Density is welcome when it shortens a workflow, but complexity is progressively disclosed. On mobile, hierarchy, navigation, and editing are rebuilt around touch rather than copied from desktop tables.

**Key Characteristics:**

- Warm, restrained surfaces with one scarce action accent.
- Culinary headings paired with highly legible task text.
- Clear offline, pending, synced, and conflict states.
- Familiar web and native controls with consistent nouns.
- Useful empty, loading, and recovery states.

## 2. Colors

The palette combines cream paper neutrals with muted mystic plum. Semantic colors communicate state and never become decoration.

### Primary

- **Mystic Action:** Reserved for primary actions, selected navigation, focus, and compact sync state emphasis.
- **Mystic Deep:** Primary high-contrast ink on light surfaces and the anchor for dark surfaces.

### Secondary

- **Mystic Soft:** Quiet selection fills, secondary indicators, and charts where an additional tonal step is required.

### Neutral

- **Cream Paper:** Main reading and editing background.
- **Cream Surface:** Sidebars, grouped controls, and elevated content regions.
- **Cream Border:** Dividers and boundaries that need structure without visual weight.
- **Warm Ink:** Secondary text on cream surfaces.

**The Scarce Plum Rule.** Mystic Action carries actions and state on no more than a small portion of a task screen. Its rarity makes it legible.

**The State Has a Shape Rule.** Error, pending, offline, and success always include an icon or text label, never color alone.

## 3. Typography

**Display Font:** Rosarivo (with Georgia fallback)  
**Body Font:** Raleway (with system UI fallback)  
**Label/Mono Font:** Raleway

**Character:** Rosarivo gives recipe and section headings a quiet cookbook quality. Raleway carries every control, field, list, and status because task text must remain crisp at compact sizes. iOS uses the system typeface for controls and may reserve a restrained serif treatment for recipe titles only.

### Hierarchy

- **Headline** (regular, 2rem, 1.2): Page and recipe titles, never button labels.
- **Title** (semibold, 1.25rem, 1.3): Section and grouped-list titles.
- **Body** (regular, 1rem, 1.5): Instructions, descriptions, and prose capped at 70ch.
- **Label** (semibold, 0.875rem, 1.25): Controls, metadata, navigation, and state.

**The Task Type Rule.** Any text the user must scan, compare, or operate uses the body family, not the culinary heading face.

## 4. Elevation

The system is tonal and bordered by default. Low ambient shadows may separate menus, dialogs, and transient overlays, but content lists and cards stay flat until interaction. On iOS, use native material and grouped background behavior only where it clarifies hierarchy.

### Shadow Vocabulary

- **Ambient Low:** A very soft plum-tinted shadow for menus and hoverable desktop surfaces.
- **Overlay:** A broader low-opacity shadow for dialogs and sheets only.

**The Flat Until Needed Rule.** If a border or background change communicates the layer, a shadow is forbidden.

## 5. Components

### Buttons

- **Shape:** Gently rounded and compact, with a 40px web control height and at least a 44pt mobile target.
- **Primary:** Solid Mystic Action with Cream Paper text. One primary action per local decision area.
- **Hover / Focus:** A subtle tonal darkening on hover and a visible two-pixel focus ring. State transitions last 150 to 200ms and respect reduced motion.
- **Secondary / Ghost:** Cream Surface or transparent backgrounds with Mystic Deep text. Destructive actions remain visually separate from the default primary action.

### Chips

- **Style:** Compact tonal fills with clear text and no decorative gradient.
- **State:** Selected chips use both fill and a leading check or equivalent non-color cue.

### Cards / Containers

- **Corner Style:** Gently curved edges using the 12px large radius.
- **Background:** Cream Surface for grouped content against Cream Paper.
- **Shadow Strategy:** Flat at rest, with borders or tonal contrast preferred.
- **Border:** One-pixel Cream Border only where grouping needs a boundary.
- **Internal Padding:** 16px for compact lists and 24px for focused content.

### Inputs / Fields

- **Style:** Cream Paper fill, quiet border, 8px radius, and persistent labels.
- **Focus:** Mystic Action ring with no layout shift.
- **Error / Disabled:** Error text includes recovery guidance; disabled controls remain legible and clearly inactive.

### Navigation

Web navigation uses a stable sidebar with a compact collapsed state. Mobile navigation uses native tabs or hierarchical navigation based on task depth. Active destinations combine emphasis, icon, and label changes. Sync status is available without dominating navigation.

### Grocery Row

A grocery row is a generous touch target with the item name as the dominant element, quantity and category as supporting information, and a native check affordance. Checking an item updates optimistically and remains reversible while offline.

## 6. Do's and Don'ts

### Do:

- **Do** keep the next meal-planning or shopping action visible and concrete.
- **Do** expose offline, pending, synced, and conflict states in plain language.
- **Do** use the shared button, field, list, dialog, and navigation vocabulary.
- **Do** adapt dense desktop tables into touch-first lists, detail screens, and contextual actions.
- **Do** meet WCAG 2.2 AA, Dynamic Type, VoiceOver, reduced motion, and 44pt touch-target requirements.

### Don't:

- **Don't** build generic SaaS dashboards made from interchangeable nested cards and oversized summary metrics.
- **Don't** use purple-gradient, glassmorphic AI interfaces that make ordinary actions feel theatrical.
- **Don't** imitate recipe blogs that bury the task under promotional content, lifestyle photography, or excessive prose.
- **Don't** compress desktop tables onto a phone instead of adapting them to touch-first workflows.
- **Don't** invent novel controls, hidden gestures, or ornamental motion that compete with planning or shopping.
- **Don't** use gradient text, decorative glass, colored side stripes, or repeated identical card grids.

