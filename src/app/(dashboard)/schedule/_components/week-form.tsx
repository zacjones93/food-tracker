"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createWeekFormSchema,
  type CreateWeekFormSchema,
} from "@/schemas/week.schema";
import { createWeekAction, updateWeekAction } from "../weeks.actions";
import {
  getGroceryListTemplatesAction,
  applyTemplateToWeekAction,
} from "../grocery-templates.actions";
import { useServerAction } from "zsa-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "@/components/ui/themed-icons";
import { toast } from "sonner";
import type { GroceryListTemplate } from "@/db/schema";
import { useSessionStore } from "@/state/session";

// Get the next Sunday from today (or today if it's Sunday) in local timezone
function getNextSunday(): Date {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // If today is Sunday (0), get next Sunday (7 days from now)
  // Otherwise, calculate days until next Sunday
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;

  const nextSunday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + daysUntilSunday
  );

  return nextSunday;
}

// Convert date input string (YYYY-MM-DD) to Date in local timezone
function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Format Date to YYYY-MM-DD for date input in local timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Calculate week number from a date
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

// Format week name like "Oct 14th - 19th, 2025" or "Oct 19 - Nov 5, 2025"
function formatWeekName(startDate: Date, endDate: Date): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const startMonth = months[startDate.getMonth()];
  const endMonth = months[endDate.getMonth()];
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const year = startDate.getFullYear();

  // If same month, use ordinals and only show month once
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startMonth} ${startDay}${getOrdinalSuffix(
      startDay
    )} - ${endDay}${getOrdinalSuffix(endDay)}, ${year}`;
  }

  // If different months, show both months without ordinals
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

interface WeekFormProps {
  mode: "create" | "edit";
  weekId?: string;
  initialValues?: {
    name: string;
    emoji?: string | null;
    status: string;
    startDate?: Date | null;
    endDate?: Date | null;
    weekNumber?: number | null;
  };
}

export function WeekForm({ mode, weekId, initialValues }: WeekFormProps) {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const { execute: executeCreate, isPending: isCreating } =
    useServerAction(createWeekAction);
  const { execute: executeUpdate, isPending: isUpdating } =
    useServerAction(updateWeekAction);
  const { execute: fetchTemplates } = useServerAction(
    getGroceryListTemplatesAction
  );
  const { execute: applyTemplate } = useServerAction(applyTemplateToWeekAction);

  const isPending = isCreating || isUpdating;

  const [templates, setTemplates] = useState<GroceryListTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const defaultStartDate = getNextSunday();
  const defaultEndDate = new Date(
    defaultStartDate.getFullYear(),
    defaultStartDate.getMonth(),
    defaultStartDate.getDate() + 7
  );
  const defaultWeekName = formatWeekName(defaultStartDate, defaultEndDate);

  // Get the selected template data
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const form = useForm<CreateWeekFormSchema>({
    resolver: zodResolver(createWeekFormSchema),
    defaultValues:
      mode === "edit" && initialValues
        ? {
            name: initialValues.name,
            emoji: initialValues.emoji ?? "📅",
            status: (initialValues.status as "current" | "upcoming" | "archived") ?? "upcoming",
            startDate: initialValues.startDate ?? undefined,
            endDate: initialValues.endDate ?? undefined,
            weekNumber: initialValues.weekNumber ?? undefined,
          }
        : {
            name: defaultWeekName,
            emoji: "📅",
            status: "upcoming",
            startDate: defaultStartDate,
            endDate: defaultEndDate,
            weekNumber: getWeekNumber(defaultStartDate),
          },
  });

  // Load templates on mount (only for create mode)
  useEffect(() => {
    if (mode === "create") {
      async function loadTemplates() {
        const [data, err] = await fetchTemplates();
        if (!err && data) {
          setTemplates(data.templates);
        }
      }
      loadTemplates();
    }
  }, [fetchTemplates, mode]);

  async function onSubmit(values: CreateWeekFormSchema) {
    if (mode === "edit" && weekId) {
      const [, err] = await executeUpdate({
        id: weekId,
        ...values,
      });

      if (err) {
        toast.error(err.message || "Failed to update week");
        return;
      }

      toast.success("Week updated successfully!");
      router.push(`/schedule/${weekId}`);
    } else {
      const teamId = session?.activeTeamId || "";

      if (!teamId) {
        toast.error("No active team selected");
        return;
      }

      const [data, err] = await executeCreate({
        ...values,
        teamId,
      });

      if (err) {
        toast.error(err.message || "Failed to create week");
        return;
      }

      // Apply grocery template if selected
      if (selectedTemplateId) {
        const [templateData, templateErr] = await applyTemplate({
          weekId: data.week.id,
          templateId: selectedTemplateId,
        });

        if (templateErr) {
          toast.error("Week created but failed to apply grocery template");
        } else {
          toast.success(
            `Week created with ${templateData.itemCount} grocery items!`
          );
        }
      } else {
        toast.success("Week created successfully!");
      }

      router.push(`/schedule/${data.week.id}`);
    }
  }

  return (
    <div className="max-w-2xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? formatLocalDate(field.value) : ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          field.onChange(undefined);
                          return;
                        }
                        const date = parseLocalDate(e.target.value);
                        field.onChange(date);
                        // Update end date to be 7 days after start date
                        const newEndDate = new Date(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate() + 7
                        );
                        form.setValue("endDate", newEndDate);
                        // Update week name to match new dates
                        form.setValue(
                          "name",
                          formatWeekName(date, newEndDate)
                        );
                        // Update week number
                        form.setValue("weekNumber", getWeekNumber(date));
                      }}
                    />
                  </FormControl>
                  <FormDescription>Defaults to next Sunday</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? formatLocalDate(field.value) : ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          field.onChange(undefined);
                          return;
                        }
                        const date = parseLocalDate(e.target.value);
                        field.onChange(date);
                        // Update week name when end date changes
                        const startDate = form.getValues("startDate");
                        if (startDate) {
                          form.setValue(
                            "name",
                            formatWeekName(startDate, date)
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Defaults to 7 days after start
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Week Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Oct 14th - 19th, 2025"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  A descriptive name for this week (auto-generated from dates)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="emoji"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Emoji</FormLabel>
                <FormControl>
                  <Input placeholder="📅" maxLength={10} {...field} />
                </FormControl>
                <FormDescription>
                  Add an emoji to make your week easier to identify
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  The current status of this week
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="weekNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Week Number</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g., 52"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const value = e.target.value
                        ? parseInt(e.target.value)
                        : undefined;
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  ISO week number (auto-calculated from start date)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {mode === "create" && (
            <>
              <FormItem>
                <FormLabel>Grocery List Template (Optional)</FormLabel>
                <Select
                  value={selectedTemplateId || undefined}
                  onValueChange={(value) => setSelectedTemplateId(value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="None (add items manually)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Optionally apply a grocery list template to pre-populate items
                </FormDescription>
              </FormItem>

              {selectedTemplate && (
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-medium mb-3">
                    Template Preview: {selectedTemplate.name}
                  </h4>
                  <div className="space-y-3">
                    {selectedTemplate.template
                      .sort((a, b) => a.order - b.order)
                      .map((category) => (
                        <div key={category.category}>
                          <h5 className="font-medium text-sm mb-1">
                            {category.category}
                          </h5>
                          {category.items.length > 0 ? (
                            <ul className="list-disc list-inside text-sm text-muted-foreground ml-2 space-y-0.5">
                              {category.items
                                .sort((a, b) => a.order - b.order)
                                .map((item, idx) => (
                                  <li key={idx}>{item.name}</li>
                                ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground italic ml-2">
                              Empty category
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin dark:text-cream-100" />
              )}
              {mode === "edit" ? "Save Changes" : "Create Week"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  mode === "edit" && weekId
                    ? `/schedule/${weekId}`
                    : "/schedule"
                )
              }
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
