import SwiftUI

struct AssistantView: View {
    private static let bottomAnchor = "assistant-bottom"

    @Environment(AuthStore.self) private var auth
    @Environment(FoodTrackerStore.self) private var store
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @AppStorage("assistant.active-chat-id") private var savedChatID = ""
    @FocusState private var isComposerFocused: Bool
    @State private var messages: [AssistantMessage] = []
    @State private var chats: [AssistantChatSummary] = []
    @State private var chatID = AssistantView.newChatID()
    @State private var activeChatTitle = "New chat"
    @State private var prompt = ""
    @State private var streamStatus: String?
    @State private var isSending = false
    @State private var isLoadingChats = false
    @State private var isLoadingConversation = false
    @State private var isShowingHistory = false
    @State private var hasLoadedInitialState = false
    @State private var errorMessage: String?
    @State private var sendTask: Task<Void, Never>?
    @State private var activeRunID: String?
    @State private var pageContext: AssistantPageContext?
    @State private var mentionedContexts: [AssistantPageContext] = []
    @State private var dismissedMentionOffset: Int?

    var body: some View {
        VStack(spacing: 0) {
            conversationContent

            if let errorMessage {
                errorBanner(errorMessage)
            }

            if let pageContext {
                attachedContextBanner(pageContext)
            }

            composer
        }
        .background(Color.foodPaper)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Conversation history", systemImage: "clock.arrow.circlepath") {
                    isShowingHistory = true
                    Task { await refreshChats(showErrors: false) }
                }
                .disabled(isLoadingConversation)
            }
            ToolbarItem(placement: .principal) {
                Text(activeChatTitle)
                    .font(.headline)
                    .foregroundStyle(Color.foodDeep)
                    .lineLimit(1)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("New chat", systemImage: "square.and.pencil") {
                    startNewChat()
                }
                .disabled(isLoadingConversation)
            }
        }
        .sheet(isPresented: $isShowingHistory) {
            AssistantHistorySheet(
                chats: chats,
                activeChatID: chatID,
                isLoading: isLoadingChats,
                onSelect: { chat in
                    isShowingHistory = false
                    Task { await openConversation(chat) }
                },
                onNewChat: {
                    isShowingHistory = false
                    startNewChat()
                },
                onRefresh: { await refreshChats(showErrors: false) }
            )
        }
        .task {
            if !hasLoadedInitialState {
                hasLoadedInitialState = true
                await loadInitialConversation()
            }
            resumeActiveAssistantRunIfNeeded()
        }
        .task(id: store.assistantLaunch?.id) {
            guard let launch = store.assistantLaunch else { return }
            startNewChat(
                pageContext: launch.context,
                suggestedPrompt: launch.suggestedPrompt
            )
            store.consumeAssistantLaunch(id: launch.id)
        }
        .onChange(of: auth.session?.teamID) { previousTeamID, teamID in
            guard previousTeamID != teamID else { return }
            chats = []
            savedChatID = ""
            startNewChat()
            Task { await loadInitialConversation() }
        }
        .onDisappear { disconnectFromAssistantStream() }
    }

    @ViewBuilder
    private var conversationContent: some View {
        if isLoadingConversation {
            VStack(spacing: FoodSpacing.medium) {
                ProgressView()
                Text("Opening conversation…")
                    .font(.subheadline)
                    .foregroundStyle(Color.foodSecondaryInk)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if messages.isEmpty {
            AssistantWelcomeView(pageContext: pageContext, onSelect: sendSuggestion)
                .disabled(!connectivity.isOnline)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: FoodSpacing.large) {
                        ForEach(messages) { message in
                            AssistantMessageRow(message: message)
                        }

                        if let streamStatus, isSending {
                            AssistantActivityRow(status: streamStatus)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(Self.bottomAnchor)
                    }
                    .padding(.horizontal, FoodSpacing.medium)
                    .padding(.vertical, FoodSpacing.large)
                }
                .scrollDismissesKeyboard(.interactively)
                .refreshable { await reloadActiveConversation() }
                .onChange(of: messages) { _, _ in scrollToBottom(proxy) }
                .onChange(of: streamStatus) { _, _ in scrollToBottom(proxy) }
                .onAppear { scrollToBottom(proxy, animated: false) }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            Divider().overlay(Color.foodBorder)

            if activeMention != nil {
                AssistantMentionResults(
                    options: mentionOptions,
                    isAtLimit: mentionedContexts.count >= 4,
                    onSelect: selectMention
                )
            }

            if !mentionedContexts.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(mentionedContexts, id: \.identity) { context in
                            HStack(spacing: 5) {
                                Image(systemName: context.kind == .week ? "calendar" : "fork.knife")
                                Text(context.label).lineLimit(1)
                                Button("Remove \(context.label) from context", systemImage: "xmark") {
                                    mentionedContexts.removeAll { $0.identity == context.identity }
                                }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.plain)
                            }
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.foodDeep)
                            .padding(.leading, 10)
                            .padding(.trailing, 7)
                            .padding(.vertical, 6)
                            .background(Color.foodAccent.opacity(0.1), in: Capsule())
                            .overlay { Capsule().stroke(Color.foodAccent.opacity(0.2), lineWidth: 0.5) }
                        }
                    }
                    .padding(.horizontal, FoodSpacing.small)
                    .padding(.top, FoodSpacing.small)
                }
            }

            HStack(alignment: .bottom, spacing: FoodSpacing.small) {
                TextField("Ask anything, or type @ to add context", text: $prompt, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($isComposerFocused)
                    .submitLabel(.send)
                    .onSubmit { handleComposerSubmit() }
                    .onChange(of: prompt) { _, value in
                        let nextMention = AssistantMentionMatch.find(in: value)
                        if nextMention?.startOffset != dismissedMentionOffset {
                            dismissedMentionOffset = nil
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(Color.foodSurface, in: RoundedRectangle(cornerRadius: 20))
                    .overlay {
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color.foodBorder, lineWidth: 0.5)
                    }
                    .disabled(isSending || !connectivity.isOnline)

                if isSending {
                    Button("Stop generating", systemImage: "stop.circle.fill") {
                        stopGenerating()
                    }
                    .labelStyle(.iconOnly)
                    .font(.system(size: 34))
                    .foregroundStyle(Color.foodDestructive)
                    .frame(width: 44, height: 44)
                } else {
                    Button("Send", systemImage: "arrow.up.circle.fill") { handleComposerSubmit() }
                        .labelStyle(.iconOnly)
                        .font(.system(size: 34))
                        .foregroundStyle(Color.foodAccent)
                        .frame(width: 44, height: 44)
                        .disabled(
                            prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                || !connectivity.isOnline
                                || isLoadingConversation
                        )
                }
            }
            .padding(.horizontal, FoodSpacing.small)
            .padding(.vertical, FoodSpacing.small)

            if !connectivity.isOnline {
                Label("Assistant needs a connection. Your kitchen stays available offline.", systemImage: "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(Color.foodSecondaryInk)
                    .padding(.horizontal, FoodSpacing.medium)
                    .padding(.bottom, FoodSpacing.small)
            }
        }
        .background(.bar)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: FoodSpacing.small) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Color.foodDestructive)
            Text(message)
                .font(.caption)
                .foregroundStyle(Color.foodDeep)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Dismiss", systemImage: "xmark") { errorMessage = nil }
                .labelStyle(.iconOnly)
                .foregroundStyle(Color.foodSecondaryInk)
                .frame(width: 44, height: 44)
        }
        .padding(FoodSpacing.small)
        .background(Color.foodDestructive.opacity(0.08))
    }

    private func attachedContextBanner(_ context: AssistantPageContext) -> some View {
        HStack(spacing: FoodSpacing.small) {
            Image(systemName: context.kind == .week ? "calendar" : "fork.knife")
                .foregroundStyle(Color.foodAccent)
            VStack(alignment: .leading, spacing: 1) {
                Text("USING THIS \(context.kind == .week ? "WEEK" : "RECIPE")")
                    .font(.caption2.weight(.bold))
                    .tracking(0.7)
                    .foregroundStyle(Color.foodAccent)
                Text(context.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.foodDeep)
                    .lineLimit(1)
            }
            Spacer(minLength: FoodSpacing.small)
            Button("Remove page context", systemImage: "xmark") {
                pageContext = nil
            }
            .labelStyle(.iconOnly)
            .foregroundStyle(Color.foodSecondaryInk)
            .frame(width: 44, height: 44)
        }
        .padding(.horizontal, FoodSpacing.medium)
        .padding(.vertical, FoodSpacing.small)
        .background(Color.foodAccent.opacity(0.08))
        .overlay(alignment: .bottom) { Divider().overlay(Color.foodBorder) }
    }

    private func loadInitialConversation() async {
        guard connectivity.isOnline else { return }
        isLoadingChats = true
        defer { isLoadingChats = false }
        do {
            chats = try await auth.client.loadAssistantChats()
            guard store.assistantLaunch == nil, pageContext == nil else { return }
            let preferredChat = chats.first { $0.id == savedChatID } ?? chats.first
            if let preferredChat { await openConversation(preferredChat) }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshChats(showErrors: Bool) async {
        guard connectivity.isOnline else { return }
        isLoadingChats = true
        defer { isLoadingChats = false }
        do {
            chats = try await auth.client.loadAssistantChats()
        } catch {
            if showErrors { errorMessage = error.localizedDescription }
        }
    }

    private func openConversation(_ chat: AssistantChatSummary) async {
        guard connectivity.isOnline else { return }
        stopGenerating()
        isLoadingConversation = true
        errorMessage = nil
        defer { isLoadingConversation = false }
        do {
            let conversation = try await auth.client.loadAssistantConversation(chatID: chat.id)
            chatID = conversation.chat.id
            savedChatID = conversation.chat.id
            activeChatTitle = conversation.chat.displayTitle
            messages = conversation.messages
            pageContext = nil
            mentionedContexts = []
            dismissedMentionOffset = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadActiveConversation() async {
        guard let chat = chats.first(where: { $0.id == chatID }), !isSending else { return }
        await openConversation(chat)
    }

    private func startNewChat(
        pageContext: AssistantPageContext? = nil,
        suggestedPrompt: String = ""
    ) {
        stopGenerating()
        chatID = Self.newChatID()
        savedChatID = chatID
        activeChatTitle = "New chat"
        messages = []
        prompt = suggestedPrompt
        self.pageContext = pageContext
        mentionedContexts = []
        dismissedMentionOffset = nil
        errorMessage = nil
        isLoadingConversation = false
        isComposerFocused = true
    }

    private var mentionOptions: [AssistantMentionOption] {
        guard let mention = activeMention else { return [] }
        let query = mention.query.trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedIdentities = Set(mentionedContexts.map(\.identity))
        let recipeOptions = store.recipes.compactMap { recipe -> AssistantMentionOption? in
            guard let serverID = recipe.serverID else { return nil }
            let context = AssistantPageContext(
                kind: .recipe,
                entityId: serverID,
                label: recipe.name,
                href: "/recipes/\(serverID)"
            )
            guard !selectedIdentities.contains(context.identity) else { return nil }
            return AssistantMentionOption(context: context)
        }
        let weekOptions = store.weeks.compactMap { week -> AssistantMentionOption? in
            guard let serverID = week.serverID else { return nil }
            let context = AssistantPageContext(
                kind: .week,
                entityId: serverID,
                label: week.name,
                href: "/schedule/\(serverID)"
            )
            guard !selectedIdentities.contains(context.identity) else { return nil }
            return AssistantMentionOption(context: context)
        }

        return Array(
            (recipeOptions + weekOptions)
                .filter { query.isEmpty || $0.context.label.localizedCaseInsensitiveContains(query) }
                .sorted { left, right in
                    let leftStartsWithQuery = left.context.label.lowercased().hasPrefix(query.lowercased())
                    let rightStartsWithQuery = right.context.label.lowercased().hasPrefix(query.lowercased())
                    if leftStartsWithQuery != rightStartsWithQuery { return leftStartsWithQuery }
                    return left.context.label.localizedStandardCompare(right.context.label) == .orderedAscending
                }
                .prefix(8)
        )
    }

    private func handleComposerSubmit() {
        if activeMention != nil, let firstOption = mentionOptions.first {
            selectMention(firstOption)
        } else {
            send()
        }
    }

    private func selectMention(_ option: AssistantMentionOption) {
        guard let mention = activeMention, mentionedContexts.count < 4 else { return }
        dismissedMentionOffset = mention.startOffset
        prompt = mention.replacing(in: prompt, with: option.context.label)
        if !mentionedContexts.contains(where: { $0.identity == option.context.identity }) {
            mentionedContexts.append(option.context)
        }
        isComposerFocused = true
    }

    private var activeMention: AssistantMentionMatch? {
        guard let mention = AssistantMentionMatch.find(in: prompt),
              mention.startOffset != dismissedMentionOffset
        else { return nil }
        return mention
    }

    private func sendSuggestion(_ suggestion: String) {
        prompt = suggestion
        send()
    }

    private func send() {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, connectivity.isOnline, !isSending else { return }
        let isFirstTurn = messages.isEmpty
        let userMessage = AssistantMessage(role: "user", text: text)
        messages.append(userMessage)
        let requestMessages = messages
        let currentChatID = chatID
        let currentMentionedContexts = mentionedContexts
        prompt = ""
        errorMessage = nil
        streamStatus = "Thinking through your kitchen…"
        isSending = true
        isComposerFocused = false

        sendTask = Task {
            var assistantID = ""
            var hasReceivedText = false
            do {
                for try await event in auth.client.streamAssistant(
                    chatID: currentChatID,
                    messages: requestMessages,
                    pageContext: pageContext,
                    mentionedContexts: currentMentionedContexts
                ) {
                    try Task.checkCancellation()
                    switch event {
                    case .started(let runID):
                        activeRunID = runID
                        assistantID = "\(runID)-assistant"
                        messages.removeAll { $0.id == assistantID }
                        hasReceivedText = false
                        streamStatus = "Thinking through your kitchen…"
                    case .status(let status):
                        if !hasReceivedText { streamStatus = status }
                    case .textDelta(let delta):
                        if assistantID.isEmpty {
                            assistantID = "\(UUID().uuidString.lowercased())-assistant"
                        }
                        streamStatus = nil
                        if hasReceivedText,
                           let index = messages.firstIndex(where: { $0.id == assistantID }) {
                            messages[index].text += delta
                        } else {
                            messages.append(
                                AssistantMessage(id: assistantID, role: "assistant", text: delta)
                            )
                            hasReceivedText = true
                        }
                    }
                }
                try Task.checkCancellation()
                guard hasReceivedText else {
                    throw APIError.server("The assistant finished without a text response.")
                }

                if isFirstTurn {
                    let title = suggestedTitle(from: text)
                    activeChatTitle = title
                    try? await auth.client.updateAssistantChatTitle(
                        chatID: currentChatID,
                        title: title
                    )
                }
                mentionedContexts = []
                dismissedMentionOffset = nil
                activeRunID = nil
                await refreshChats(showErrors: false)
            } catch is CancellationError {
                // Keep any partial response visible when the user stops generation.
            } catch {
                errorMessage = error.localizedDescription
            }
            streamStatus = nil
            isSending = false
            sendTask = nil
        }
    }

    private func stopGenerating() {
        let runID = activeRunID
        let currentChatID = chatID
        disconnectFromAssistantStream()
        activeRunID = nil
        if let runID {
            Task { try? await auth.client.cancelAssistant(chatID: currentChatID, runID: runID) }
        }
    }

    private func disconnectFromAssistantStream() {
        sendTask?.cancel()
        sendTask = nil
        streamStatus = nil
        isSending = false
    }

    private func resumeActiveAssistantRunIfNeeded() {
        guard connectivity.isOnline,
              sendTask == nil,
              !isLoadingConversation,
              !messages.isEmpty || chats.contains(where: { $0.id == chatID })
        else { return }

        let currentChatID = chatID
        sendTask = Task {
            do {
                let conversation = try await auth.client.loadAssistantConversation(chatID: currentChatID)
                guard chatID == currentChatID else { return }
                messages = conversation.messages
                activeChatTitle = conversation.chat.displayTitle
                var assistantID = ""
                var receivedRun = false
                var hasReceivedText = false
                isSending = true
                streamStatus = "Checking on Ladle…"

                for try await event in auth.client.resumeAssistant(chatID: currentChatID) {
                    try Task.checkCancellation()
                    guard chatID == currentChatID else { return }
                    switch event {
                    case .started(let runID):
                        receivedRun = true
                        activeRunID = runID
                        assistantID = "\(runID)-assistant"
                        messages.removeAll { $0.id == assistantID }
                        hasReceivedText = false
                        streamStatus = "Ladle is still working…"
                    case .status(let status):
                        if !hasReceivedText { streamStatus = status }
                    case .textDelta(let delta):
                        guard receivedRun else { continue }
                        streamStatus = nil
                        if hasReceivedText,
                           let index = messages.firstIndex(where: { $0.id == assistantID }) {
                            messages[index].text += delta
                        } else {
                            messages.append(
                                AssistantMessage(id: assistantID, role: "assistant", text: delta)
                            )
                            hasReceivedText = true
                        }
                    }
                }

                try Task.checkCancellation()
                let completed = try await auth.client.loadAssistantConversation(chatID: currentChatID)
                guard chatID == currentChatID else { return }
                messages = completed.messages
                activeChatTitle = completed.chat.displayTitle
                activeRunID = nil
                await refreshChats(showErrors: false)
            } catch is CancellationError {
                // Leaving the tab disconnects this viewer; the server run continues.
            } catch {
                if chatID == currentChatID { errorMessage = error.localizedDescription }
            }
            if chatID == currentChatID {
                streamStatus = nil
                isSending = false
                sendTask = nil
            }
        }
    }

    private func suggestedTitle(from prompt: String) -> String {
        let singleLine = prompt
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        guard singleLine.count > 64 else { return singleLine }
        return "\(singleLine.prefix(61))…"
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        if animated, !accessibilityReduceMotion {
            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(Self.bottomAnchor, anchor: .bottom) }
        } else {
            proxy.scrollTo(Self.bottomAnchor, anchor: .bottom)
        }
    }

    private static func newChatID() -> String {
        "ios_\(UUID().uuidString.lowercased())"
    }
}

struct AssistantMentionMatch {
    let range: Range<String.Index>
    let query: String
    let startOffset: Int

    static func find(in value: String) -> AssistantMentionMatch? {
        guard let atIndex = value.lastIndex(of: "@") else { return nil }
        if atIndex != value.startIndex {
            let previousIndex = value.index(before: atIndex)
            guard value[previousIndex].isWhitespace else { return nil }
        }

        let queryStart = value.index(after: atIndex)
        let query = String(value[queryStart...])
        guard !query.contains("@"), !query.contains("\n") else { return nil }
        return AssistantMentionMatch(
            range: atIndex..<value.endIndex,
            query: query,
            startOffset: value.distance(from: value.startIndex, to: atIndex)
        )
    }

    func replacing(in value: String, with label: String) -> String {
        "\(value[..<range.lowerBound])@\(label) "
    }
}

private struct AssistantMentionOption: Identifiable {
    let context: AssistantPageContext
    var id: String { context.identity }
}

private struct AssistantMentionResults: View {
    let options: [AssistantMentionOption]
    let isAtLimit: Bool
    let onSelect: (AssistantMentionOption) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("ADD TO LADLE'S CONTEXT")
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.foodSecondaryInk)
                .padding(.horizontal, FoodSpacing.medium)
                .padding(.vertical, FoodSpacing.small)

            Divider().overlay(Color.foodBorder)

            if isAtLimit {
                Text("Remove a context item before adding another.")
                    .font(.subheadline)
                    .foregroundStyle(Color.foodSecondaryInk)
                    .padding(FoodSpacing.medium)
            } else if options.isEmpty {
                Text("No matching recipes or schedules.")
                    .font(.subheadline)
                    .foregroundStyle(Color.foodSecondaryInk)
                    .padding(FoodSpacing.medium)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(options) { option in
                            Button {
                                onSelect(option)
                            } label: {
                                HStack(spacing: FoodSpacing.small) {
                                    Image(systemName: option.context.kind == .week ? "calendar" : "fork.knife")
                                        .frame(width: 32, height: 32)
                                        .background(Color.foodAccent.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))
                                        .foregroundStyle(Color.foodAccent)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(option.context.label)
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(Color.foodDeep)
                                            .lineLimit(1)
                                        Text(option.context.kind == .week ? "Schedule" : "Recipe")
                                            .font(.caption)
                                            .foregroundStyle(Color.foodSecondaryInk)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, FoodSpacing.small)
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(4)
                }
                .frame(maxHeight: 220)
            }
        }
        .background(Color.foodSurface)
        .overlay(alignment: .bottom) { Divider().overlay(Color.foodBorder) }
    }
}

private struct AssistantWelcomeView: View {
    let pageContext: AssistantPageContext?
    let onSelect: (String) -> Void

    private var suggestions: [(String, String, String)] {
        switch pageContext?.kind {
        case .recipe:
            [
                ("fork.knife", "What pairs well with this recipe?", "Use the recipe attached above"),
                ("calendar.badge.plus", "When should I make this?", "Fit it into one of my meal plans"),
                ("wand.and.stars", "Suggest a useful variation", "Work from this recipe's ingredients and method"),
                ("cart", "What should I shop for?", "Check what this recipe needs"),
            ]
        case .week:
            [
                ("calendar", "Help me fill the gaps this week", "Use the meal plan attached above"),
                ("scale.3d", "Balance the effort across these meals", "Review the whole week"),
                ("clock", "What should I prep first?", "Build a practical prep order"),
                ("cart", "Review this grocery list", "Look for missing or duplicate items"),
            ]
        case nil:
            [
                ("timer", "Find three dinner ideas", "Search the recipes I already have"),
                ("carrot", "Cook from familiar ingredients", "Look across my saved recipe ingredients"),
                ("calendar", "Plan this week's prep", "Use my current meal plan as context"),
                ("clock.arrow.circlepath", "Rediscover an old favorite", "Find recipes I haven't made lately"),
            ]
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(Color.foodAccent)
                        .frame(width: 52, height: 52)
                        .background(Color.foodAccent.opacity(0.12), in: RoundedRectangle(cornerRadius: 18))
                    Text("Ask your kitchen")
                        .font(.system(.largeTitle, design: .serif, weight: .regular))
                        .foregroundStyle(Color.foodDeep)
                    Text("I can search your saved recipes and meal plans, compare options, and help you decide what to cook.")
                        .font(.body)
                        .foregroundStyle(Color.foodSecondaryInk)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: FoodSpacing.small) {
                    Text("TRY ASKING")
                        .font(.caption.weight(.semibold))
                        .tracking(0.8)
                        .foregroundStyle(Color.foodAccent)

                    ForEach(Array(suggestions.enumerated()), id: \.offset) { _, suggestion in
                        Button {
                            onSelect(suggestion.1)
                        } label: {
                            HStack(spacing: FoodSpacing.medium) {
                                Image(systemName: suggestion.0)
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Color.foodAccent)
                                    .frame(width: 34, height: 34)
                                    .background(Color.foodPaper, in: RoundedRectangle(cornerRadius: FoodRadius.medium))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(suggestion.1)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(Color.foodDeep)
                                    Text(suggestion.2)
                                        .font(.caption)
                                        .foregroundStyle(Color.foodSecondaryInk)
                                }
                                Spacer(minLength: FoodSpacing.small)
                                Image(systemName: "arrow.up.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Color.foodSecondaryInk)
                            }
                            .padding(FoodSpacing.small)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .foodSurface(radius: FoodRadius.large)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(FoodSpacing.medium)
            .padding(.top, FoodSpacing.large)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

private struct AssistantMessageRow: View {
    let message: AssistantMessage

    var body: some View {
        if message.role == "user" {
            HStack {
                Spacer(minLength: 44)
                Text(message.text)
                    .font(.body)
                    .foregroundStyle(Color.foodPaper)
                    .padding(.horizontal, FoodSpacing.medium)
                    .padding(.vertical, 11)
                    .background(Color.foodAccent, in: RoundedRectangle(cornerRadius: 18))
                    .textSelection(.enabled)
            }
        } else {
            HStack(alignment: .top, spacing: FoodSpacing.small) {
                Image(systemName: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.foodAccent)
                    .frame(width: 28, height: 28)
                    .background(Color.foodAccent.opacity(0.11), in: RoundedRectangle(cornerRadius: FoodRadius.small))
                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                    Text("LADLE")
                        .font(.caption2.weight(.bold))
                        .tracking(0.8)
                        .foregroundStyle(Color.foodAccent)
                    Text(renderedText)
                        .font(.body)
                        .foregroundStyle(Color.foodDeep)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
            }
        }
    }

    private var renderedText: AttributedString {
        (try? AttributedString(markdown: message.text)) ?? AttributedString(message.text)
    }
}

private struct AssistantActivityRow: View {
    let status: String

    var body: some View {
        HStack(spacing: FoodSpacing.small) {
            ProgressView().controlSize(.small)
            Text(status)
                .font(.caption)
                .foregroundStyle(Color.foodSecondaryInk)
            Spacer()
        }
        .padding(.leading, 36)
        .accessibilityElement(children: .combine)
    }
}

private struct AssistantHistorySheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    let chats: [AssistantChatSummary]
    let activeChatID: String
    let isLoading: Bool
    let onSelect: (AssistantChatSummary) -> Void
    let onNewChat: () -> Void
    let onRefresh: () async -> Void

    private var filteredChats: [AssistantChatSummary] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return chats }
        return chats.filter { $0.displayTitle.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && chats.isEmpty {
                    ProgressView("Loading conversations…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredChats.isEmpty {
                    ContentUnavailableView {
                        Label(search.isEmpty ? "No conversations yet" : "No matches", systemImage: "bubble.left.and.bubble.right")
                    } description: {
                        Text(search.isEmpty ? "Start a new chat and it will appear here." : "Try a different search.")
                    }
                } else {
                    List(filteredChats) { chat in
                        Button {
                            onSelect(chat)
                        } label: {
                            HStack(spacing: FoodSpacing.medium) {
                                Image(systemName: chat.id == activeChatID ? "bubble.left.fill" : "bubble.left")
                                    .foregroundStyle(chat.id == activeChatID ? Color.foodAccent : Color.foodSecondaryInk)
                                    .frame(width: 24)
                                VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                                    Text(chat.displayTitle)
                                        .font(.body.weight(chat.id == activeChatID ? .semibold : .regular))
                                        .foregroundStyle(Color.foodDeep)
                                        .lineLimit(2)
                                    Text(chat.updatedAt, style: .relative)
                                        .font(.caption)
                                        .foregroundStyle(Color.foodSecondaryInk)
                                }
                                Spacer(minLength: FoodSpacing.small)
                                if chat.id == activeChatID {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(Color.foodAccent)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                    .refreshable { await onRefresh() }
                }
            }
            .background(Color.foodPaper)
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, prompt: "Search conversations")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                        .labelStyle(.iconOnly)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New chat", systemImage: "square.and.pencil") {
                        onNewChat()
                    }
                    .labelStyle(.iconOnly)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
