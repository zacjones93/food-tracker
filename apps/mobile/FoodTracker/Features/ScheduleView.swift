import SwiftUI

struct ScheduleView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @Environment(ConnectivityMonitor.self) private var connectivity
    @State private var showingNewWeek = false
    @State private var showingArchived = false
    @State private var savedWeekID: String?
    @State private var createdWeekID: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                ScreenHeaderWithStatus(
                    eyebrow: "Your kitchen",
                    title: "Meal plan",
                    detail: "Decide once, then cook from a clear plan.",
                    pendingCount: store.pendingCount,
                    isOnline: connectivity.isOnline,
                    isSyncing: store.isSyncing,
                    isLoading: store.isInitialLoading || store.isRefreshing
                )

                if store.isInitialLoading {
                    ScheduleLoadingState()
                } else {
                    if !canCreateWeek {
                        Label(
                            "Your team has used its four free week creations.",
                            systemImage: "lock.fill"
                        )
                        .font(.subheadline)
                        .foregroundStyle(Color.foodSecondaryInk)
                        .padding(FoodSpacing.medium)
                        .foodSurface()
                    }
                    weekSection("Current", weeks: weeks(with: .current), expanded: true)
                    weekSection("Upcoming", weeks: weeks(with: .upcoming), expanded: false)

                    if !weeks(with: .archived).isEmpty {
                        DisclosureGroup("Archived · \(weeks(with: .archived).count)", isExpanded: $showingArchived) {
                            VStack(spacing: FoodSpacing.small) {
                                ForEach(weeks(with: .archived)) { week in WeekLink(week: week) }
                            }
                            .padding(.top, 10)
                        }
                        .font(.headline)
                    }

                    if store.weeks.isEmpty {
                        FoodEmptyState(
                            symbol: "calendar.badge.plus",
                            title: "Plan your first week",
                            detail: "Add a week, choose recipes, and build a grocery list that works offline.",
                            actionTitle: "Create week",
                            action: { showingNewWeek = true }
                        )
                        .frame(minHeight: 360)
                    }
                }
            }
            .padding(.horizontal, FoodSpacing.medium)
            .padding(.vertical, FoodSpacing.large)
        }
        .background(Color.foodPaper)
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New week", systemImage: "plus") { showingNewWeek = true }
                    .disabled(!canCreateWeek)
            }
        }
        .sheet(isPresented: $showingNewWeek, onDismiss: openSavedWeek) {
            WeekEditor { week in
                savedWeekID = week.id
            }
        }
        .navigationDestination(item: $createdWeekID) { weekID in
            WeekDetailView(weekID: weekID)
        }
        .refreshable {
            guard connectivity.isOnline else { return }
            await store.sync(using: auth.client)
            await store.refresh(using: auth.client)
        }
    }

    private var canCreateWeek: Bool {
        guard let entitlements = auth.session?.entitlements else { return true }
        if entitlements.features.weekCreationLimit == nil { return true }
        return (entitlements.usage.weeksRemaining ?? 0) > 0
    }

    @ViewBuilder
    private func weekSection(_ title: String, weeks: [WeekPlan], expanded: Bool) -> some View {
        if !weeks.isEmpty {
            VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                Text(title)
                    .font(.title3.bold())
                ForEach(weeks) { week in
                    if expanded { ExpandedWeekLink(week: week) }
                    else { WeekLink(week: week) }
                }
            }
        }
    }

    private func weeks(with status: WeekPlan.Status) -> [WeekPlan] {
        store.weeks.filter { $0.status == status }.sorted {
            ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture)
        }
    }

    private func openSavedWeek() {
        guard let savedWeekID else { return }
        self.savedWeekID = nil
        createdWeekID = savedWeekID
    }
}

private struct ScheduleLoadingState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: FoodSpacing.medium) {
            FoodSkeleton(width: 82, height: 20)
            ForEach(0..<2, id: \.self) { index in
                VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                    HStack(spacing: FoodSpacing.medium) {
                        FoodSkeleton(width: 36, height: 36, radius: 18)
                        VStack(alignment: .leading, spacing: FoodSpacing.small) {
                            FoodSkeleton(width: index == 0 ? 174 : 142, height: 18)
                            FoodSkeleton(width: 128, height: 12)
                        }
                        Spacer()
                    }
                    FoodSkeleton(width: 184, height: 32, radius: 16)
                }
                .padding(FoodSpacing.medium)
                .foodSurface()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading meal plan")
    }
}

private struct WeekLink: View {
    @Environment(FoodTrackerStore.self) private var store
    let week: WeekPlan

    var body: some View {
        NavigationLink {
            WeekDetailView(weekID: week.id)
        } label: {
            HStack(spacing: FoodSpacing.medium) {
                Text(week.emoji)
                    .font(.title2)
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    Text(week.name).font(.headline).foregroundStyle(Color.foodDeep)
                    Text("\(store.scheduledRecipes(for: week.id).count) recipes")
                        .font(.caption).foregroundStyle(Color.foodSecondaryInk)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(FoodSpacing.medium)
            .foodSurface()
        }
        .buttonStyle(.plain)
    }
}

private struct ExpandedWeekLink: View {
    @Environment(FoodTrackerStore.self) private var store
    let week: WeekPlan

    var body: some View {
        NavigationLink {
            WeekDetailView(weekID: week.id)
        } label: {
            VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                HStack {
                    Text(week.emoji).font(.title)
                    VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                        Text(week.name).font(.title3.bold())
                        if let start = week.startDate, let end = week.endDate {
                            Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption).foregroundStyle(Color.foodSecondaryInk)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                }
                let scheduled = store.scheduledRecipes(for: week.id)
                if scheduled.isEmpty {
                    Text("No recipes yet")
                        .font(.subheadline).foregroundStyle(Color.foodSecondaryInk)
                } else {
                    HStack(spacing: -4) {
                        ForEach(scheduled.prefix(7)) { item in
                            Text(store.recipe(id: item.recipeID)?.emoji ?? "🍽️")
                                .font(.title3)
                                .frame(width: 36, height: 36)
                                .background(Color(.systemBackground), in: Circle())
                                .overlay(Circle().stroke(Color(.separator), lineWidth: 0.5))
                        }
                        if scheduled.count > 7 {
                            Text("+\(scheduled.count - 7)")
                                .font(.caption.bold()).foregroundStyle(Color.foodSecondaryInk).padding(.leading, FoodSpacing.small)
                        }
                    }
                }
            }
            .padding(FoodSpacing.medium)
            .foregroundStyle(Color.foodDeep)
            .foodSurface()
        }
        .buttonStyle(.plain)
    }
}

struct WeekEditor: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var week: WeekPlan?
    var onSave: ((WeekPlan) -> Void)?
    @State private var name: String
    @State private var emoji: String
    @State private var status: WeekPlan.Status
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var weekNumber: Int
    @State private var selectedTemplateID: String?

    init(week: WeekPlan? = nil, onSave: ((WeekPlan) -> Void)? = nil) {
        self.week = week
        self.onSave = onSave
        let startDate = week?.startDate ?? WeekFormBehavior.nextSunday()
        let endDate = week?.endDate ?? WeekFormBehavior.endDate(for: startDate)
        _name = State(initialValue: week?.name ?? WeekFormBehavior.name(startDate: startDate, endDate: endDate))
        _emoji = State(initialValue: week?.emoji ?? "📅")
        _status = State(initialValue: week?.status ?? .upcoming)
        _startDate = State(initialValue: startDate)
        _endDate = State(initialValue: endDate)
        _weekNumber = State(initialValue: week?.weekNumber ?? WeekFormBehavior.weekNumber(for: startDate))
        _selectedTemplateID = State(initialValue: nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Week") {
                    TextField("Name", text: $name)
                    TextField("Emoji", text: $emoji)
                    Picker("Status", selection: $status) {
                        ForEach(WeekPlan.Status.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section("Dates") {
                    DatePicker("Starts", selection: $startDate, displayedComponents: .date)
                        .onChange(of: startDate) { _, newStartDate in
                            let newEndDate = WeekFormBehavior.endDate(for: newStartDate)
                            endDate = newEndDate
                            name = WeekFormBehavior.name(startDate: newStartDate, endDate: newEndDate)
                            weekNumber = WeekFormBehavior.weekNumber(for: newStartDate)
                        }
                    DatePicker("Ends", selection: $endDate, in: startDate..., displayedComponents: .date)
                        .onChange(of: endDate) { _, newEndDate in
                            name = WeekFormBehavior.name(startDate: startDate, endDate: newEndDate)
                        }
                    Text("The end date defaults to seven days after the start date. The week name and ISO week number update automatically.")
                        .font(.caption)
                        .foregroundStyle(Color.foodSecondaryInk)
                }
                Section("Week number") {
                    TextField("Week number", value: $weekNumber, format: .number)
                        .keyboardType(.numberPad)
                }
                if week == nil, !store.groceryTemplates.isEmpty {
                    Section("Grocery template") {
                        Picker("Template", selection: $selectedTemplateID) {
                            Text("None").tag(String?.none)
                            ForEach(store.groceryTemplates) { template in
                                Text(template.name).tag(Optional(template.id))
                            }
                        }
                        Text("Optionally pre-populate the new week's grocery list.")
                            .font(.caption)
                            .foregroundStyle(Color.foodSecondaryInk)
                    }
                }
                if let selectedTemplate {
                    Section("Template preview") {
                        ForEach(selectedTemplate.categories.sorted(by: { $0.order < $1.order })) { category in
                            VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                                Text(category.category).font(.headline)
                                ForEach(category.items.sorted(by: { $0.order < $1.order })) { item in
                                    Text("• \(item.name)")
                                        .font(.subheadline)
                                        .foregroundStyle(Color.foodSecondaryInk)
                                }
                                if category.items.isEmpty {
                                    Text("No items")
                                        .font(.subheadline.italic())
                                        .foregroundStyle(Color.foodSecondaryInk)
                                }
                            }
                            .padding(.vertical, FoodSpacing.extraSmall)
                        }
                    }
                }
            }
            .foodListBackground()
            .foodFormBehavior()
            .navigationTitle(week == nil ? "New week" : "Edit week")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var value = week ?? WeekPlan(name: name)
                        value.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                        value.emoji = emoji.isEmpty ? "🗓️" : emoji
                        value.status = status
                        value.startDate = startDate
                        value.endDate = endDate
                        value.weekNumber = weekNumber
                        store.saveWeek(value)
                        if week == nil, let selectedTemplate {
                            store.applyTemplate(selectedTemplate, to: value.id)
                        }
                        onSave?(value)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private var selectedTemplate: GroceryTemplate? {
        guard week == nil, let selectedTemplateID else { return nil }
        return store.groceryTemplates.first { $0.id == selectedTemplateID }
    }
}

enum WeekFormBehavior {
    static func nextSunday(from date: Date = .now, calendar: Calendar = .current) -> Date {
        let startOfDay = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: startOfDay)
        let daysUntilSunday = weekday == 1 ? 7 : 8 - weekday
        return calendar.date(byAdding: .day, value: daysUntilSunday, to: startOfDay)!
    }

    static func endDate(for startDate: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: 7, to: startDate)!
    }

    static func weekNumber(for date: Date, calendar: Calendar = .current) -> Int {
        var isoCalendar = Calendar(identifier: .iso8601)
        isoCalendar.timeZone = calendar.timeZone
        return isoCalendar.component(.weekOfYear, from: date)
    }

    static func name(startDate: Date, endDate: Date, calendar: Calendar = .current) -> String {
        let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let startMonth = calendar.component(.month, from: startDate)
        let endMonth = calendar.component(.month, from: endDate)
        let startDay = calendar.component(.day, from: startDate)
        let endDay = calendar.component(.day, from: endDate)
        let year = calendar.component(.year, from: startDate)

        if startMonth == endMonth {
            return "\(months[startMonth - 1]) \(startDay)\(ordinalSuffix(for: startDay)) - \(endDay)\(ordinalSuffix(for: endDay)), \(year)"
        }

        return "\(months[startMonth - 1]) \(startDay) - \(months[endMonth - 1]) \(endDay), \(year)"
    }

    private static func ordinalSuffix(for day: Int) -> String {
        if day > 3, day < 21 { return "th" }
        switch day % 10 {
        case 1: return "st"
        case 2: return "nd"
        case 3: return "rd"
        default: return "th"
        }
    }
}
