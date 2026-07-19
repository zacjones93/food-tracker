import SwiftUI

struct AssistantView: View {
    struct Message: Identifiable {
        var id = UUID()
        var role: Role
        var text: String
        enum Role { case user, assistant }
    }

    @Environment(AuthStore.self) private var auth
    @Environment(ConnectivityMonitor.self) private var connectivity
    @State private var messages: [Message] = []
    @State private var chatID = "ios_\(UUID().uuidString.lowercased())"
    @State private var prompt = ""
    @State private var isSending = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            if messages.isEmpty {
                VStack(alignment: .leading, spacing: FoodSpacing.large) {
                    ScreenHeader("Kitchen assistant", eyebrow: "Plan with what you have", detail: "Ask for meal ideas, substitutions, or help turning recipes into a plan.")
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: FoodSpacing.small) {
                        promptButton("Plan three quick dinners")
                        promptButton("Use what is already on my list")
                        promptButton("Suggest a vegetarian swap")
                        promptButton("What should I prep first?")
                    }
                    Spacer()
                }
                .padding(FoodSpacing.medium)
            } else {
                ScrollView {
                    LazyVStack(spacing: FoodSpacing.medium) {
                        ForEach(messages) { message in
                            HStack {
                                if message.role == .user { Spacer(minLength: 50) }
                                Text(message.text)
                                    .padding(.horizontal, FoodSpacing.medium).padding(.vertical, FoodSpacing.small)
                                    .background(
                                        message.role == .user ? Color.foodAccent : Color.foodSurface,
                                        in: RoundedRectangle(cornerRadius: FoodRadius.large)
                                    )
                                    .foregroundStyle(message.role == .user ? Color.foodPaper : Color.foodDeep)
                                if message.role == .assistant { Spacer(minLength: 50) }
                            }
                        }
                        if isSending { ProgressView().padding() }
                    }
                    .padding(FoodSpacing.medium)
                }
            }

            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(Color.foodDestructive).padding(.horizontal, FoodSpacing.medium)
            }

            HStack(alignment: .bottom, spacing: FoodSpacing.small) {
                TextField("Ask about your kitchen", text: $prompt, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                Button("Send", systemImage: "arrow.up.circle.fill") { send() }
                    .labelStyle(.iconOnly)
                    .font(.title)
                    .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending || !connectivity.isOnline)
            }
            .padding(FoodSpacing.small)
            .background(.bar)

            if !connectivity.isOnline {
                Text("Assistant needs a connection. Your meal plan and lists still work offline.")
                    .font(.caption).foregroundStyle(Color.foodSecondaryInk).padding(.bottom, FoodSpacing.small)
            }
        }
        .background(Color.foodPaper)
        .navigationTitle("Assistant")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func promptButton(_ title: String) -> some View {
        Button(title) {
            prompt = title
            send()
        }
        .buttonStyle(.bordered)
        .frame(maxWidth: .infinity, minHeight: 56)
        .disabled(!connectivity.isOnline)
    }

    private func send() {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, connectivity.isOnline else { return }
        messages.append(Message(role: .user, text: text))
        prompt = ""
        errorMessage = nil
        isSending = true
        Task {
            do {
                let requestMessages = messages.map { message in
                    AssistantMessage(
                        id: message.id.uuidString.lowercased(),
                        role: message.role == .user ? "user" : "assistant",
                        text: message.text
                    )
                }
                let response = try await auth.client.askAssistant(chatID: chatID, messages: requestMessages)
                messages.append(Message(role: .assistant, text: response))
            } catch {
                errorMessage = error.localizedDescription
            }
            isSending = false
        }
    }
}
