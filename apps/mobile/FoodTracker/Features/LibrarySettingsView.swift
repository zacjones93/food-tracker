import SwiftUI

struct LibrarySettingsView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @Environment(ConnectivityMonitor.self) private var connectivity

    var body: some View {
        List {
            Section {
                NavigationLink {
                    RecipeBooksView()
                } label: {
                    Label("Recipe books", systemImage: "books.vertical")
                        .badge(store.recipeBooks.count)
                }
                NavigationLink {
                    GroceryTemplatesView()
                } label: {
                    Label("Grocery templates", systemImage: "list.bullet.clipboard")
                        .badge(store.groceryTemplates.count)
                }
            } header: { Text("Library") }

            Section("Workspace") {
                if let session = auth.session, session.teams.count > 1 {
                    HStack {
                        Text("Team")
                        Spacer()
                        Menu {
                            ForEach(session.teams, id: \.id) { team in
                                Button {
                                    Task { await auth.switchTeam(to: team.id) }
                                } label: {
                                    if team.id == session.teamID {
                                        Label(team.name, systemImage: "checkmark")
                                    } else {
                                        Text(team.name)
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: FoodSpacing.extraSmall) {
                                if auth.isWorking { ProgressView().controlSize(.small) }
                                Text(session.teamName)
                                Image(systemName: "chevron.up.chevron.down")
                                    .font(.caption2)
                            }
                        }
                        .disabled(auth.isWorking)
                    }
                } else {
                    LabeledContent("Team", value: auth.session?.teamName ?? "List To Ladle")
                }
                LabeledContent("Sync") {
                    SyncStatusView(
                        pendingCount: store.pendingCount,
                        isOnline: connectivity.isOnline,
                        isSyncing: store.isSyncing,
                        isLoading: store.isInitialLoading || store.isRefreshing
                    )
                }
                NavigationLink {
                    AccountView()
                } label: {
                    Label("Account and sessions", systemImage: "person.crop.circle")
                }
            }

            Section("About") {
                Link(destination: FoodTrackerAPIClient.defaultBaseURL.appending(path: "/support")) {
                    Label("Support", systemImage: "questionmark.circle")
                }
                Link(destination: FoodTrackerAPIClient.defaultBaseURL.appending(path: "/privacy")) {
                    Label("Privacy", systemImage: "hand.raised")
                }
                Link(destination: FoodTrackerAPIClient.defaultBaseURL.appending(path: "/terms")) {
                    Label("Terms", systemImage: "doc.text")
                }
            }
        }
        .foodListBackground()
        .navigationTitle("More")
    }
}

private struct RecipeBooksView: View {
    @Environment(FoodTrackerStore.self) private var store
    @State private var showingNewBook = false
    @State private var name = ""

    var body: some View {
        List {
            if store.isInitialLoading {
                FoodListSkeleton(accessibilityLabel: "Loading recipe books", rowCount: 4)
            } else if store.recipeBooks.isEmpty {
                FoodEmptyState(symbol: "books.vertical", title: "No recipe books", detail: "Track the books and page numbers behind your favorite recipes.")
            } else {
                ForEach(store.recipeBooks) { book in
                    NavigationLink {
                        List(store.recipes.filter { $0.recipeBookID == book.id }) { recipe in
                            NavigationLink { RecipeDetailView(recipeID: recipe.id) } label: { RecipeRow(recipe: recipe) }
                        }
                        .foodListBackground()
                        .navigationTitle(book.name)
                    } label: {
                        LabeledContent(book.name, value: "\(store.recipes.filter { $0.recipeBookID == book.id }.count) recipes")
                    }
                }
            }
        }
        .foodListBackground()
        .navigationTitle("Recipe books")
        .toolbar {
            Button("Add book", systemImage: "plus") { showingNewBook = true }
        }
        .alert("New recipe book", isPresented: $showingNewBook) {
            TextField("Name", text: $name)
            Button("Cancel", role: .cancel) { name = "" }
            Button("Add") {
                store.saveRecipeBook(RecipeBook(name: name.trimmingCharacters(in: .whitespacesAndNewlines)))
                name = ""
            }
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}

private struct GroceryTemplatesView: View {
    @Environment(FoodTrackerStore.self) private var store
    @State private var showingEditor = false

    var body: some View {
        List {
            if store.isInitialLoading {
                FoodListSkeleton(accessibilityLabel: "Loading grocery templates", rowCount: 4)
            } else if store.groceryTemplates.isEmpty {
                FoodEmptyState(
                    symbol: "list.bullet.clipboard",
                    title: "No grocery templates",
                    detail: "Save the staples you buy often, then add them to any week in one tap."
                )
            } else {
                ForEach(store.groceryTemplates) { template in
                    NavigationLink {
                        GroceryTemplateEditor(template: template)
                    } label: {
                        VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                            Text(template.name).font(.headline)
                            Text("\(template.categories.reduce(0) { $0 + $1.items.count }) items")
                                .font(.caption).foregroundStyle(Color.foodSecondaryInk)
                        }
                    }
                }
            }
        }
        .foodListBackground()
        .navigationTitle("Grocery templates")
        .toolbar { Button("New template", systemImage: "plus") { showingEditor = true } }
        .sheet(isPresented: $showingEditor) { NavigationStack { GroceryTemplateEditor() } }
    }
}

private struct GroceryTemplateEditor: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    var template: GroceryTemplate?
    @State private var name: String
    @State private var itemsText: String
    @State private var category = "Staples"

    init(template: GroceryTemplate? = nil) {
        self.template = template
        _name = State(initialValue: template?.name ?? "")
        _itemsText = State(initialValue: template?.categories.flatMap(\.items).map(\.name).joined(separator: "\n") ?? "")
    }

    var body: some View {
        Form {
            Section("Template") {
                TextField("Name", text: $name)
                TextField("Category", text: $category)
            }
            Section("Items") {
                TextEditor(text: $itemsText).frame(minHeight: 220)
                Text("Put one item on each line.").font(.caption).foregroundStyle(Color.foodSecondaryInk)
            }
        }
        .foodListBackground()
        .foodFormBehavior()
        .navigationTitle(template == nil ? "New template" : "Edit template")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    var value = template ?? GroceryTemplate(name: name)
                    value.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    value.categories = [GroceryTemplateCategory(
                        category: category,
                        order: 0,
                        items: itemsText.split(whereSeparator: \.isNewline).enumerated().map {
                            GroceryTemplateItem(name: String($0.element), order: $0.offset)
                        }
                    )]
                    store.saveGroceryTemplate(value)
                    dismiss()
                }
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}

private struct AccountView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(FoodTrackerStore.self) private var store
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(PushNotificationCoordinator.self) private var pushNotifications
    @State private var isConfirmingSignOut = false

    var body: some View {
        List {
            Section {
                HStack(spacing: FoodSpacing.medium) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 48)).foregroundStyle(Color.foodAccent)
                    VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                        Text(auth.session?.user.name ?? "List To Ladle member").font(.headline)
                        Text(auth.session?.user.email ?? "").font(.subheadline).foregroundStyle(Color.foodSecondaryInk)
                    }
                }
                .padding(.vertical, FoodSpacing.small)
            }
            Section("This device") {
                if let team = auth.session?.activeTeam {
                    LabeledContent("Active team", value: team.name)
                    if let role = team.roleID {
                        LabeledContent("Role", value: role.capitalized)
                    }
                }
                LabeledContent("Local changes", value: "\(store.pendingCount)")
                LabeledContent("Connection", value: connectivity.isOnline ? "Online" : "Offline")
                Text("Signing out removes this workspace from view, but queued changes remain encrypted by iOS file protection for your next sign-in.")
                    .font(.footnote).foregroundStyle(Color.foodSecondaryInk)
            }
            Section {
                Button("Sign out", role: .destructive) {
                    isConfirmingSignOut = true
                }
            }
            Section("Danger zone") {
                NavigationLink {
                    DeleteAccountView()
                } label: {
                    Label("Delete account", systemImage: "person.crop.circle.badge.minus")
                        .foregroundStyle(.red)
                }
            }
        }
        .foodListBackground()
        .navigationTitle("Account")
        .toolbar(.hidden, for: .tabBar)
        .confirmationDialog("Sign out of this device?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) {
                store.deactivateWorkspace()
                Task {
                    await pushNotifications.disableForCurrentAccount()
                    await auth.signOut()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your queued changes stay protected on this device for your next sign-in.")
        }
    }
}

private struct DeleteAccountView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(FoodTrackerStore.self) private var store
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(PushNotificationCoordinator.self) private var pushNotifications
    @State private var confirmation = ""
    @State private var isConfirmingDeletion = false
    @State private var password = ""
    @State private var preview: AccountDeletionPreview?

    private var canSubmit: Bool {
        connectivity.isOnline &&
            preview?.canDelete == true &&
            confirmation == "DELETE" &&
            password.count >= 8 &&
            !auth.isWorking
    }

    var body: some View {
        Form {
            Section("What will happen") {
                Text("Your profile, assistant history, sync records, sessions on every device, and push-notification tokens will be permanently removed.")
                if store.pendingCount > 0 {
                    Label(
                        "\(store.pendingCount) unsynced local change\(store.pendingCount == 1 ? "" : "s") will also be erased from this iPhone.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(.orange)
                }
                teamImpactRows
            }

            if let preview, !preview.canDelete {
                Section("Ownership transfer required") {
                    Text("Shared kitchens are never deleted or reassigned automatically. In web team settings, make another active member an owner of each kitchen first:")
                    ForEach(preview.ownershipTransferRequired) { team in
                        Label(team.name, systemImage: "person.2.badge.gearshape")
                    }
                }
            } else if preview != nil {
                Section("Confirm your identity") {
                    SecureField("Current password", text: $password)
                        .textContentType(.password)
                    TextField("Type DELETE", text: $confirmation)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    Text("Account deletion is immediate and cannot be undone.")
                        .font(.footnote)
                        .foregroundStyle(Color.foodSecondaryInk)
                }

                Section {
                    Button("Delete account", role: .destructive) {
                        isConfirmingDeletion = true
                    }
                    .disabled(!canSubmit)
                }
            }

            if let errorMessage = auth.errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .accessibilityLabel("Account deletion error: \(errorMessage)")
                }
            }
        }
        .foodListBackground()
        .foodFormBehavior()
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .overlay {
            if preview == nil && auth.isWorking {
                ProgressView("Checking your account…")
            }
        }
        .task {
            preview = await auth.loadAccountDeletionPreview()
        }
        .confirmationDialog(
            "Permanently delete your account?",
            isPresented: $isConfirmingDeletion,
            titleVisibility: .visible
        ) {
            Button("Delete permanently", role: .destructive) {
                Task { await performDeletion() }
            }
            Button("Cancel", role: .cancel) {
                password = ""
            }
        } message: {
            Text("Sole-member kitchens and their associated subscriptions will be deleted now. Shared kitchen data remains for other members.")
        }
    }

    @ViewBuilder
    private var teamImpactRows: some View {
        if let preview {
            if !preview.deletedTeams.isEmpty {
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    Text("Deleted kitchens").font(.headline)
                    ForEach(preview.deletedTeams) { team in
                        Label(team.name, systemImage: "trash")
                    }
                }
            }
            if !preview.leftTeams.isEmpty {
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    Text("Shared kitchens that remain").font(.headline)
                    ForEach(preview.leftTeams) { team in
                        Label(team.name, systemImage: "person.2")
                    }
                }
            }
        }
    }

    private func performDeletion() async {
        guard let userID = auth.session?.user.id else { return }
        let didDelete = await auth.deleteAccount(password: password)
        password = ""
        confirmation = ""
        guard didDelete else { return }

        store.purgeAccountData(userID: userID)
        pushNotifications.deactivate()
    }
}
