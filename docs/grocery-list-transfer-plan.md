# Grocery List Transfer Feature - Implementation Plan

## Overview

Enable users to transfer grocery list items between weeks to handle scenarios where shopping couldn't be completed. Users should be able to transfer:
- Individual items
- Entire sections/categories
- Unchecked items within a section
- All unchecked items in the entire grocery list

## Current State Analysis

### Database Schema
- **Table**: `grocery_items` (schema.ts:298-313)
- **Key Fields**:
  - `id`: Primary key (prefixed "gi_")
  - `weekId`: Foreign key to weeks table (cascade delete)
  - `name`: Item name (max 500 chars)
  - `checked`: Boolean completion status
  - `category`: Optional categorization (max 100 chars)
  - `order`: Display order within category

### UI Components
- **Primary Component**: `CategorizedGroceryList`
  - Location: `src/app/(dashboard)/schedule/[id]/_components/categorized-grocery-list.tsx`
  - Features: Category collapsing, drag-drop, inline editing, bulk updates

### Existing Actions
- `createGroceryItemAction` - Create single item
- `updateGroceryItemAction` - Update item properties
- `deleteGroceryItemAction` - Delete item
- `toggleGroceryItemAction` - Toggle checked status
- `bulkUpdateGroceryItemsAction` - Batch update category/order

---

## Feature Requirements

### 1. Transfer Granularity Levels

#### Level 1: Individual Item Transfer
- Transfer single item to another week
- Preserve item name, category
- Reset checked status to `false`
- Assign new order based on target week's max order

#### Level 2: Section/Category Transfer
- Transfer all items in a category (checked + unchecked)
- Preserve category structure in target week
- Reset all checked statuses to `false`
- Merge with existing items if category exists in target

#### Level 3: Unchecked Items in Section
- Transfer only unchecked items from a specific category
- Preserve category
- Keep order relative to each other

#### Level 4: All Unchecked Items
- Transfer all unchecked items across all categories
- Preserve category groupings
- Full list cleanup of unchecked items

### 2. Transfer Behavior Options

**Option A: Copy** (Recommended)
- Create duplicates in target week
- Original items remain in source week
- User manually deletes originals if desired
- Safer approach, no data loss

**Option B: Move**
- Remove from source week
- Add to target week
- Atomic operation (all or nothing)
- More efficient but riskier

**Recommendation**: Implement **Copy** for initial version, add **Move** as advanced option later.

### 3. Action Section UI/UX

#### Location Options

**Option 1: Item-Level Actions** (Individual items)
- Add transfer icon button next to each item
- Hover/long-press reveals action menu
- Pros: Direct, intuitive for single items
- Cons: Cluttered if many items

**Option 2: Category-Level Actions** (Sections)
- Add action menu to category header
- Options: "Transfer all", "Transfer unchecked"
- Pros: Clean, organized by category
- Cons: Less obvious for single items

**Option 3: Floating Action Bar** (Global)
- Selection mode: Check items to transfer
- Bottom action bar appears with transfer button
- Similar to email/file management apps
- Pros: Flexible, handles all scenarios
- Cons: Requires mode switching

**Recommendation**: **Hybrid Approach**
- Item-level quick actions (Option 1) for single items
- Category header actions (Option 2) for bulk section transfers
- Global "Transfer All Unchecked" button at list top

#### Transfer Destination Selection

**Modal Dialog Approach**:
1. User clicks transfer action
2. Modal opens with:
   - Week selector (dropdown or calendar picker)
   - Transfer mode radio: "Copy" or "Move" (future)
   - Preview of items to be transferred
   - Confirm/Cancel buttons
3. On confirm, execute transfer
4. Show success toast with undo option (future enhancement)

---

## Technical Implementation

### Phase 1: Backend Actions

#### New Server Action: `transferGroceryItemsAction`

**File**: `src/app/(dashboard)/schedule/grocery-items.actions.ts`

**Schema**:
```typescript
// src/schemas/grocery-item.schema.ts
export const transferGroceryItemsSchema = z.object({
  sourceWeekId: z.string(),
  targetWeekId: z.string(),
  transferMode: z.enum(['copy', 'move']), // Future: default to 'copy'
  items: z.array(z.object({
    id: z.string(),
    name: z.string().max(500),
    category: z.string().max(100).optional(),
    order: z.number(),
  })),
});

export type TransferGroceryItemsInput = z.infer<typeof transferGroceryItemsSchema>;
```

**Action Implementation**:
```typescript
export const transferGroceryItemsAction = createServerAction()
  .input(transferGroceryItemsSchema)
  .handler(async ({ input, ctx }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    // Verify user owns both weeks
    const sourceWeek = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.sourceWeekId),
        eq(weeksTable.teamId, session.activeTeamId),
      ),
    });

    const targetWeek = await db.query.weeksTable.findFirst({
      where: and(
        eq(weeksTable.id, input.targetWeekId),
        eq(weeksTable.teamId, session.activeTeamId),
      ),
    });

    if (!sourceWeek || !targetWeek) {
      throw new ZSAError("NOT_FOUND", "Week not found");
    }

    // Get max order in target week for proper ordering
    const maxOrderResult = await db
      .select({ maxOrder: max(groceryItemsTable.order) })
      .from(groceryItemsTable)
      .where(eq(groceryItemsTable.weekId, input.targetWeekId));

    const maxOrder = maxOrderResult[0]?.maxOrder ?? 0;

    // Prepare new items for target week
    const newItems = input.items.map((item, index) => ({
      weekId: input.targetWeekId,
      name: item.name,
      category: item.category,
      checked: false, // Always reset checked status
      order: maxOrder + index + 1,
    }));

    // Insert into target week
    await db.insert(groceryItemsTable).values(newItems);

    // If move mode, delete from source (future enhancement)
    if (input.transferMode === 'move') {
      const itemIds = input.items.map(item => item.id);
      await db
        .delete(groceryItemsTable)
        .where(
          and(
            eq(groceryItemsTable.weekId, input.sourceWeekId),
            inArray(groceryItemsTable.id, itemIds)
          )
        );
    }

    // Revalidate both weeks
    revalidatePath(`/schedule/${input.sourceWeekId}`);
    revalidatePath(`/schedule/${input.targetWeekId}`);
    revalidatePath('/schedule');

    return {
      success: true,
      transferredCount: newItems.length,
      targetWeekId: input.targetWeekId,
    };
  });
```

#### Helper Action: `getAvailableWeeksForTransferAction`

**Purpose**: Fetch weeks to populate transfer destination dropdown

```typescript
export const getAvailableWeeksForTransferAction = createServerAction()
  .input(z.object({ excludeWeekId: z.string() }))
  .handler(async ({ input, ctx }) => {
    const session = await getSessionFromCookie();
    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");
    }

    const weeks = await db.query.weeksTable.findMany({
      where: and(
        eq(weeksTable.teamId, session.activeTeamId),
        ne(weeksTable.id, input.excludeWeekId), // Exclude current week
      ),
      orderBy: desc(weeksTable.startDate),
      columns: {
        id: true,
        startDate: true,
        endDate: true,
        name: true,
      },
      limit: 20, // Only show recent/upcoming weeks
    });

    return { weeks };
  });
```

---

### Phase 2: UI Components

#### Component 1: `TransferItemsDialog`

**File**: `src/app/(dashboard)/schedule/[id]/_components/transfer-items-dialog.tsx`

**Purpose**: Modal dialog for selecting transfer destination and confirming transfer

**Props**:
```typescript
interface TransferItemsDialogProps {
  sourceWeekId: string;
  items: Array<{
    id: string;
    name: string;
    category?: string;
    order: number;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}
```

**Features**:
- Week selector dropdown (using `getAvailableWeeksForTransferAction`)
- Display count of items to be transferred
- Grouped preview by category
- Loading state during transfer
- Success/error toast notifications

**UI Structure**:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Transfer Grocery Items</DialogTitle>
      <DialogDescription>
        Select a week to transfer {items.length} item(s) to
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
      {/* Week Selector */}
      <Select value={targetWeekId} onValueChange={setTargetWeekId}>
        <SelectTrigger>
          <SelectValue placeholder="Select destination week" />
        </SelectTrigger>
        <SelectContent>
          {weeks.map(week => (
            <SelectItem key={week.id} value={week.id}>
              {formatWeekDisplay(week)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Items Preview */}
      <div className="max-h-48 overflow-y-auto">
        <p className="text-sm font-medium mb-2">Items to transfer:</p>
        {groupedItems.map(category => (
          <div key={category.name} className="mb-2">
            <p className="text-xs text-muted-foreground">{category.name}</p>
            <ul className="text-sm list-disc list-inside">
              {category.items.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button
        onClick={handleTransfer}
        disabled={!targetWeekId || isPending}
      >
        {isPending ? "Transferring..." : "Transfer Items"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Component 2: Enhanced `CategorizedGroceryList`

**File**: `src/app/(dashboard)/schedule/[id]/_components/categorized-grocery-list.tsx`

**Changes**:

1. **Add Item-Level Transfer Button**
```tsx
// Inside SortableItem component
<Button
  variant="ghost"
  size="icon"
  className="h-6 w-6"
  onClick={() => handleOpenTransferDialog([item])}
  title="Transfer item to another week"
>
  <ArrowRightLeft className="h-3 w-3" />
</Button>
```

2. **Add Category-Level Actions Menu**
```tsx
// Inside SortableCategory header
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-6 w-6">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleTransferCategory(category, 'all')}>
      <ArrowRightLeft className="mr-2 h-4 w-4" />
      Transfer all items
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleTransferCategory(category, 'unchecked')}>
      <ArrowRightLeft className="mr-2 h-4 w-4" />
      Transfer unchecked items
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

3. **Add Global "Transfer All Unchecked" Button**
```tsx
// At the top of the grocery list (before categories)
<div className="flex justify-between items-center mb-4">
  <h3 className="text-lg font-semibold">Grocery List</h3>
  <Button
    variant="outline"
    size="sm"
    onClick={handleTransferAllUnchecked}
    disabled={uncheckedItems.length === 0}
  >
    <ArrowRightLeft className="mr-2 h-4 w-4" />
    Transfer All Unchecked ({uncheckedItems.length})
  </Button>
</div>
```

4. **State Management for Transfer Dialog**
```tsx
const [transferDialogOpen, setTransferDialogOpen] = useState(false);
const [itemsToTransfer, setItemsToTransfer] = useState<GroceryItem[]>([]);

const handleOpenTransferDialog = (items: GroceryItem[]) => {
  setItemsToTransfer(items);
  setTransferDialogOpen(true);
};

const handleTransferCategory = (category: string, mode: 'all' | 'unchecked') => {
  const categoryItems = items.filter(item => item.category === category);
  const filteredItems = mode === 'unchecked'
    ? categoryItems.filter(item => !item.checked)
    : categoryItems;
  handleOpenTransferDialog(filteredItems);
};

const handleTransferAllUnchecked = () => {
  const unchecked = items.filter(item => !item.checked);
  handleOpenTransferDialog(unchecked);
};
```

5. **Render Transfer Dialog**
```tsx
return (
  <>
    {/* Existing grocery list UI */}

    <TransferItemsDialog
      sourceWeekId={weekId}
      items={itemsToTransfer}
      open={transferDialogOpen}
      onOpenChange={setTransferDialogOpen}
      onSuccess={() => {
        setTransferDialogOpen(false);
        setItemsToTransfer([]);
        toast.success("Items transferred successfully");
      }}
    />
  </>
);
```

#### Component 3: Helper Utilities

**File**: `src/lib/grocery-utils.ts`

```typescript
import { format } from 'date-fns';

export function formatWeekDisplay(week: {
  name?: string | null;
  startDate: Date;
  endDate: Date;
}): string {
  const start = format(week.startDate, 'MMM d');
  const end = format(week.endDate, 'MMM d, yyyy');
  return week.name || `Week of ${start} - ${end}`;
}

export function groupItemsByCategory(items: Array<{
  id: string;
  name: string;
  category?: string | null;
}>): Array<{ name: string; items: typeof items }> {
  const grouped = new Map<string, typeof items>();

  items.forEach(item => {
    const category = item.category || 'Uncategorized';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(item);
  });

  return Array.from(grouped.entries()).map(([name, items]) => ({
    name,
    items,
  }));
}
```

---

### Phase 3: User Flow Examples

#### Flow 1: Transfer Single Item
1. User views Week 1 grocery list
2. Hovers over "Carrots" item
3. Clicks transfer icon (ArrowRightLeft)
4. Modal opens showing "Transfer 1 item"
5. Selects "Week 2" from dropdown
6. Clicks "Transfer Items"
7. Success toast: "1 item transferred to Week 2"
8. "Carrots" still visible in Week 1 (copy mode)
9. Navigate to Week 2: "Carrots" appears unchecked

#### Flow 2: Transfer Unchecked Items in Category
1. User views Week 1 grocery list with "Produce" category
2. Some items checked, some unchecked
3. Clicks three-dot menu on "Produce" category header
4. Selects "Transfer unchecked items"
5. Modal shows 3 unchecked items
6. Selects Week 3
7. Confirms transfer
8. Success toast: "3 items transferred"

#### Flow 3: Transfer All Unchecked Items
1. User views Week 1 grocery list
2. Has 15 total items: 7 checked, 8 unchecked
3. Clicks "Transfer All Unchecked (8)" button at top
4. Modal shows all 8 items grouped by category
5. Selects Week 2
6. Confirms transfer
7. Success toast: "8 items transferred to Week 2"
8. Can now safely check off remaining items in Week 1

---

## Database Changes

**No schema changes required!** The existing `grocery_items` table supports all transfer functionality:
- `weekId` can be updated (though we're creating new rows)
- No constraints prevent items in multiple weeks
- Categories preserved during transfer

---

## Edge Cases & Considerations

### 1. Duplicate Prevention
**Issue**: Transferring "Milk" to Week 2 which already has "Milk"

**Solution Options**:
- **Option A**: Allow duplicates (user can delete manually)
- **Option B**: Check for duplicates, show warning, merge quantities
- **Option C**: Smart merge: "2 cups Milk" + "1 cup Milk" = "3 cups Milk"

**Recommendation**: Option A for MVP (simplest), Option C for future enhancement

### 2. Category Merging
**Issue**: Source week has "Vegetables", target week has "Produce"

**Solution**: Keep original category names, user manually reorganizes if needed

### 3. Order Conflicts
**Issue**: Target week has items 1-10, transferring 5 items

**Solution**: Append to end (max order + 1, max order + 2, etc.)

### 4. Concurrent Transfers
**Issue**: User transfers items while someone else modifies target week

**Solution**: Database handles via auto-incrementing order, no locking needed

### 5. Transfer to Same Week
**Issue**: User accidentally selects same week as source

**Solution**: Exclude source week from destination dropdown

### 6. Empty Transfer
**Issue**: User selects "Transfer unchecked" but all items are checked

**Solution**: Disable button or show "No items to transfer" message

---

## Testing Strategy

### Unit Tests
- `transferGroceryItemsAction`: Test copy/move modes, order calculation
- `getAvailableWeeksForTransferAction`: Test filtering, permissions
- `groupItemsByCategory`: Test edge cases (no category, empty arrays)

### Integration Tests
1. Transfer single item preserves name, category, resets checked
2. Transfer category maintains category grouping
3. Transfer all unchecked excludes checked items
4. Unauthorized user cannot transfer to other team's weeks
5. Transfer to non-existent week returns error

### Manual Testing Checklist
- [ ] Transfer single item between weeks
- [ ] Transfer entire category (all items)
- [ ] Transfer unchecked items in category
- [ ] Transfer all unchecked items
- [ ] Verify original items remain (copy mode)
- [ ] Verify items appear unchecked in target week
- [ ] Verify categories preserved
- [ ] Test with empty categories
- [ ] Test with no unchecked items
- [ ] Test UI responsiveness on mobile
- [ ] Test with 50+ items (performance)

---

## Implementation Phases

### Phase 1: Backend Foundation (2-3 hours)
- [ ] Add `transferGroceryItemsSchema` to schemas
- [ ] Implement `transferGroceryItemsAction`
- [ ] Implement `getAvailableWeeksForTransferAction`
- [ ] Add unit tests for actions
- [ ] Test actions via API testing tool (Postman/Insomnia)

### Phase 2: Transfer Dialog Component (2-3 hours)
- [ ] Create `TransferItemsDialog` component
- [ ] Add week selector dropdown with formatting
- [ ] Add items preview grouped by category
- [ ] Implement loading and error states
- [ ] Add success/error toast notifications
- [ ] Test dialog in isolation (Storybook or standalone page)

### Phase 3: Integrate with Grocery List (3-4 hours)
- [ ] Add item-level transfer button to `SortableItem`
- [ ] Add category-level actions menu to `SortableCategory`
- [ ] Add global "Transfer All Unchecked" button
- [ ] Wire up dialog open handlers
- [ ] Implement transfer logic using `useServerAction`
- [ ] Test all transfer scenarios in dev environment

### Phase 4: Polish & Refinement (1-2 hours)
- [ ] Add keyboard shortcuts (optional)
- [ ] Improve mobile touch targets
- [ ] Add confirmation for large transfers (>20 items)
- [ ] Add "undo" functionality (future enhancement)
- [ ] Update user documentation/help text
- [ ] Accessibility audit (ARIA labels, keyboard nav)

### Phase 5: Testing & Deployment (1-2 hours)
- [ ] Run manual testing checklist
- [ ] Fix any bugs found during testing
- [ ] Performance testing with large lists
- [ ] Deploy to staging environment
- [ ] User acceptance testing
- [ ] Deploy to production
- [ ] Monitor error logs for first 24 hours

**Total Estimated Time**: 9-14 hours

---

## Future Enhancements

### 1. Move Mode (Delete from Source)
Add option to remove items from source week after transfer

### 2. Undo Transfer
Store transfer history, allow undo within 5 minutes

### 3. Smart Duplicate Detection
Merge quantities when transferring duplicate items

### 4. Bulk Selection Mode
Checkboxes to select arbitrary items across categories

### 5. Transfer Templates
Save common transfer patterns (e.g., "All Produce to next week")

### 6. Schedule Auto-Transfer
Automatically transfer unchecked items to next week on Sunday night

### 7. Transfer History
Show audit log of what was transferred when

### 8. Multi-Week Transfer
Transfer to multiple weeks at once (e.g., next 3 weeks)

---

## Success Metrics

### Usability
- Users can transfer items in <3 clicks
- Transfer completes in <2 seconds
- Zero data loss incidents

### Adoption
- Track transfer action usage in analytics
- Survey users after 2 weeks for feedback
- Measure time saved vs manual recreation

### Performance
- Transfer dialog opens in <500ms
- 50 item transfer completes in <1s
- No impact on page load times

---

## Open Questions for Review

1. **Transfer Mode Default**: Should we implement "move" mode immediately or just "copy" for MVP?

2. **Duplicate Handling**: Allow duplicates or show warning? Any auto-merge logic?

3. **UI Placement**: Are item-level + category-level + global buttons too many options? Should we consolidate?

4. **Mobile Experience**: Should we use a bottom sheet instead of modal on mobile devices?

5. **Permissions**: Should regular team members be able to transfer items, or only admins/owners?

6. **Cross-Team Transfer**: Should users be able to transfer items to other team's weeks? (Likely no, but worth discussing)

7. **Notification**: Should other team members be notified when items are transferred to a week?

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during transfer | Low | High | Use database transactions, add extensive testing |
| Poor mobile UX | Medium | Medium | Mobile-first design, touch target testing |
| Performance with large lists | Low | Medium | Pagination, lazy loading, limit transfer size |
| User confusion with buttons | Medium | Low | Clear iconography, tooltips, user testing |
| Duplicate items clutter | High | Low | Document behavior, add future enhancement for deduplication |

---

## Dependencies

- No new NPM packages required
- Uses existing Shadcn UI components (Dialog, Select, DropdownMenu)
- No database migrations needed
- No changes to authentication or permissions

---

## Rollout Plan

1. **Internal Testing**: Test with team for 1 week
2. **Beta Users**: Roll out to 10-20 power users
3. **Gradual Rollout**: 25% → 50% → 100% over 1 week
4. **Documentation**: Update help docs and in-app tooltips
5. **Announcement**: Email newsletter + in-app notification

---

## Documentation Updates Needed

- [ ] Add "Transferring Grocery Items" section to user guide
- [ ] Update FAQ with common transfer scenarios
- [ ] Add video tutorial (optional)
- [ ] Update API documentation for new actions
- [ ] Add JSDoc comments to new functions

---

## Conclusion

This plan implements a comprehensive grocery list transfer feature that addresses the core user need: easily moving items between weeks when shopping plans change. The phased approach allows for iterative development and testing, while the hybrid UI approach (item-level + category-level + global actions) provides flexibility for different user workflows.

The "copy" mode default ensures data safety, while leaving room for future "move" mode enhancement. The implementation leverages existing infrastructure (database schema, UI components, action patterns) to minimize complexity and risk.

**Next Steps**: Review this plan with team, gather feedback on open questions, then proceed with Phase 1 implementation.
