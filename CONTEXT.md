# Household Food Planning

This context describes the shared household truth that connects recipes, weekly meal planning, grocery work, assistant changes, and offline edits.

## Household and Recipes

**Household**:
The people who share ownership of food-planning information and permissions.
_Avoid_: Team, organization, tenant

**Recipe Collection**:
The recipes a household can use when planning meals, including readable shared recipes.
_Avoid_: Library, corpus

**Recipe**:
A named set of ingredients, instructions, and optional planning metadata for preparing food.
_Avoid_: Item, document

**Recipe Book**:
A named source or grouping used to organize recipes.
_Avoid_: Folder, category

**Recipe Relation**:
A directional connection from a main recipe to an accompaniment or preparation recipe, optionally including how many days early it should be scheduled.
_Avoid_: Dependency, edge, linked recipe

## Planning and Groceries

**Weekly Plan**:
A named planning window that groups scheduled recipes and grocery items for a household.
_Avoid_: Week record, schedule container

**Scheduled Recipe**:
One occurrence of a recipe in a weekly plan, with its own date, order, completion state, and optional preparation linkage.
_Avoid_: Week recipe, join row, meal slot

**Preparation Occurrence**:
A scheduled recipe created to prepare an accompaniment or component for another scheduled recipe.
_Avoid_: Child row, generated side

**Grocery Item**:
A named shopping task within a weekly plan, with category, order, and completion state.
_Avoid_: Checklist row

**Grocery Template**:
A reusable ordered set of grocery categories and items.
_Avoid_: Default list, preset JSON

**Food-Planning Settings**:
Household preferences that control recipe visibility defaults and automatic grocery behavior.
_Avoid_: Team settings, configuration row

## Changes and Synchronization

**Approved Assistant Change**:
An explicit food-planning mutation the household has reviewed and authorized the assistant to apply.
_Avoid_: Tool call, AI write

**Offline Change**:
A food-planning mutation saved on a device before the canonical household record acknowledges it.
_Avoid_: Pending request, queued payload

**Canonical Record**:
The server-acknowledged representation of a household entity and its version.
_Avoid_: Remote row, backend copy

**Sync Conflict**:
A case where an offline change and a newer canonical change overlap and cannot be merged automatically.
_Avoid_: Sync error, failed request
