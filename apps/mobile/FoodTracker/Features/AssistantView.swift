import SwiftUI

struct AssistantView: View {
    private static let bottomAnchor = "assistant-bottom"

    @Environment(AuthStore.self) private var auth
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

    var body: some View {
        VStack(spacing: 0) {
            conversationContent

            if let errorMessage {
                errorBanner(errorMessage)
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
            guard !hasLoadedInitialState else { return }
            hasLoadedInitialState = true
            await loadInitialConversation()
        }
        .onChange(of: auth.session?.teamID) { previousTeamID, teamID in
            guard previousTeamID != teamID else { return }
            chats = []
            savedChatID = ""
            startNewChat()
            Task { await loadInitialConversation() }
        }
        .onDisappear { sendTask?.cancel() }
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
            AssistantWelcomeView(onSelect: sendSuggestion)
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
            HStack(alignment: .bottom, spacing: FoodSpacing.small) {
                TextField("Ask about your recipes or weeks", text: $prompt, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($isComposerFocused)
                    .submitLabel(.send)
                    .onSubmit { send() }
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
                    Button("Send", systemImage: "arrow.up.circle.fill") { send() }
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

    private func loadInitialConversation() async {
        guard connectivity.isOnline else { return }
        isLoadingChats = true
        defer { isLoadingChats = false }
        do {
            chats = try await auth.client.loadAssistantChats()
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadActiveConversation() async {
        guard let chat = chats.first(where: { $0.id == chatID }), !isSending else { return }
        await openConversation(chat)
    }

    private func startNewChat() {
        stopGenerating()
        chatID = Self.newChatID()
        savedChatID = chatID
        activeChatTitle = "New chat"
        messages = []
        prompt = ""
        errorMessage = nil
        isLoadingConversation = false
        isComposerFocused = true
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
        prompt = ""
        errorMessage = nil
        streamStatus = "Thinking through your kitchen…"
        isSending = true
        isComposerFocused = false

        sendTask = Task {
            let assistantID = UUID().uuidString.lowercased()
            var hasReceivedText = false
            do {
                for try await event in auth.client.streamAssistant(
                    chatID: currentChatID,
                    messages: requestMessages
                ) {
                    try Task.checkCancellation()
                    switch event {
                    case .status(let status):
                        if !hasReceivedText { streamStatus = status }
                    case .textDelta(let delta):
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
        sendTask?.cancel()
        sendTask = nil
        streamStatus = nil
        isSending = false
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

private struct AssistantWelcomeView: View {
    let onSelect: (String) -> Void

    private let suggestions = [
        ("timer", "Find three dinner ideas", "Search the recipes I already have"),
        ("carrot", "Cook from familiar ingredients", "Look across my saved recipe ingredients"),
        ("calendar", "Plan this week's prep", "Use my current meal plan as context"),
        ("clock.arrow.circlepath", "Rediscover an old favorite", "Find recipes I haven't made lately"),
    ]

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
