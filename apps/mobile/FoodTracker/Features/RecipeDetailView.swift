import Foundation
import SafariServices
import SwiftUI

struct RecipeDetailView: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let recipeID: String
    @State private var showingEdit = false
    @State private var showingSchedule = false
    @State private var confirmingDelete = false
    @State private var browserDestination: RecipeBrowserDestination?

    var body: some View {
        Group {
            if store.isInitialLoading {
                RecipeDetailLoadingState()
            } else if let recipe = store.recipe(id: recipeID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                        VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                            Text(recipe.emoji).font(.system(size: 50))
                            Text(recipe.name)
                                .font(.system(.largeTitle, design: .serif, weight: .regular))
                                .foregroundStyle(Color.foodDeep)
                            HStack(spacing: FoodSpacing.small) {
                                FoodTag(text: recipe.mealType)
                                FoodTag(text: recipe.difficulty)
                                ForEach(recipe.tags.prefix(3), id: \.self) { FoodTag(text: $0) }
                            }

                            RecipeSourceMetadata(
                                recipeLink: recipe.recipeLink,
                                book: recipe.recipeBookID.flatMap { bookID in
                                    store.recipeBooks.first(where: { $0.id == bookID })
                                },
                                page: recipe.page
                            )
                        }

                        Button { showingSchedule = true } label: {
                            PrimaryActionLabel(title: "Add to meal plan", systemImage: "calendar.badge.plus")
                        }
                        .buttonStyle(.borderedProminent)

                        if !recipe.ingredients.isEmpty {
                            VStack(alignment: .leading, spacing: FoodSpacing.large) {
                                Text("Ingredients").font(.title2.weight(.semibold)).foregroundStyle(Color.foodDeep)
                                ForEach(recipe.ingredients) { section in
                                    VStack(alignment: .leading, spacing: FoodSpacing.small) {
                                        if !section.title.isEmpty && recipe.ingredients.count > 1 {
                                            Text(section.title).font(.headline)
                                        }
                                        ForEach(section.items, id: \.self) { item in
                                            HStack(alignment: .firstTextBaseline, spacing: FoodSpacing.small) {
                                                Circle().fill(Color.foodAccent).frame(width: 5, height: 5)
                                                Text(item).frame(maxWidth: .infinity, alignment: .leading)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if !recipe.instructions.isEmpty {
                            VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                                Text("Method").font(.title2.weight(.semibold)).foregroundStyle(Color.foodDeep)
                                RecipeMarkdownDocument(markdown: recipe.instructions)
                            }
                        }
                    }
                    .padding(FoodSpacing.medium)
                    .frame(maxWidth: 720, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .background(Color.foodPaper)
                .navigationTitle(recipe.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu("Recipe actions", systemImage: "ellipsis.circle") {
                            Button("Edit", systemImage: "pencil") { showingEdit = true }
                            ShareLink(item: recipe.recipeLink.isEmpty ? recipe.name : recipe.recipeLink) {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                            Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                        }
                    }
                }
                .environment(\.openURL, OpenURLAction { url in
                    guard recipePreviewURL(url) != nil else { return .systemAction }
                    browserDestination = RecipeBrowserDestination(url: url)
                    return .handled
                })
                .sheet(isPresented: $showingEdit) { RecipeEditor(recipe: recipe) }
                .sheet(isPresented: $showingSchedule) { WeekPickerForRecipe(recipeID: recipe.id) }
                .sheet(item: $browserDestination) { destination in
                    RecipeBrowserView(url: destination.url)
                        .ignoresSafeArea()
                        .presentationDetents([.large])
                }
                .confirmationDialog("Delete \(recipe.name)?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                    Button("Delete recipe", role: .destructive) {
                        store.deleteRecipe(id: recipe.id)
                        dismiss()
                    }
                } message: {
                    Text("It will also be removed from meal plans when this change syncs.")
                }
            } else {
                FoodEmptyState(symbol: "book.closed", title: "Recipe unavailable", detail: "It may have been removed on another device.")
            }
        }
    }
}

private struct RecipeSourceMetadata: View {
    let recipeLink: String
    let book: RecipeBook?
    let page: String

    private var sourceURL: URL? { recipePreviewURL(from: recipeLink) }

    var body: some View {
        if sourceURL != nil || book != nil {
            VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                if let sourceURL {
                    Link(destination: sourceURL) {
                        HStack(spacing: FoodSpacing.small) {
                            Image(systemName: "link")
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Recipe source")
                                    .font(.caption.weight(.semibold))
                                    .textCase(.uppercase)
                                Text(sourceURL.host?.replacingOccurrences(of: "www.", with: "") ?? "Open original recipe")
                                    .font(.subheadline)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: FoodSpacing.small)
                            Image(systemName: "safari")
                                .accessibilityHidden(true)
                        }
                        .foregroundStyle(Color.foodSecondaryInk)
                        .padding(.horizontal, FoodSpacing.medium)
                        .padding(.vertical, FoodSpacing.small)
                        .background(Color.foodSurface, in: RoundedRectangle(cornerRadius: FoodRadius.large))
                        .overlay {
                            RoundedRectangle(cornerRadius: FoodRadius.large)
                                .stroke(Color.foodBorder, lineWidth: 0.5)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens a preview without leaving the recipe")
                }

                if let book {
                    Label("\(book.name)\(page.isEmpty ? "" : ", page \(page)")", systemImage: "books.vertical")
                        .font(.subheadline)
                        .foregroundStyle(Color.foodSecondaryInk)
                }
            }
        }
    }
}

private struct RecipeMarkdownDocument: View {
    let markdown: String

    private var blocks: [RecipeMarkdownBlock] { parseRecipeMarkdown(markdown) }

    var body: some View {
        VStack(alignment: .leading, spacing: FoodSpacing.medium) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                RecipeMarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
        .tint(Color.foodAccent)
    }
}

private struct RecipeMarkdownBlockView: View {
    let block: RecipeMarkdownBlock

    var body: some View {
        switch block {
        case let .heading(level, text):
            RecipeInlineMarkdown(source: text)
                .font(headingFont(level))
                .foregroundStyle(Color.foodDeep)
                .padding(.top, level == 1 ? FoodSpacing.small : 0)
        case let .paragraph(text):
            RecipeInlineMarkdown(source: text)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        case let .unorderedList(items):
            VStack(alignment: .leading, spacing: FoodSpacing.small) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: FoodSpacing.small) {
                        Text("•")
                            .foregroundStyle(Color.foodAccent)
                        RecipeInlineMarkdown(source: item)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        case let .orderedList(items):
            VStack(alignment: .leading, spacing: FoodSpacing.small) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: FoodSpacing.small) {
                        Text("\(index + 1).")
                            .font(.body.monospacedDigit().weight(.semibold))
                            .foregroundStyle(Color.foodAccent)
                        RecipeInlineMarkdown(source: item)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        case let .quote(text):
            HStack(alignment: .top, spacing: FoodSpacing.medium) {
                Capsule()
                    .fill(Color.foodAccent)
                    .frame(width: 3)
                RecipeInlineMarkdown(source: text)
                    .italic()
                    .foregroundStyle(Color.foodSecondaryInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, FoodSpacing.extraSmall)
        case let .code(text):
            ScrollView(.horizontal) {
                Text(text)
                    .font(.callout.monospaced())
                    .textSelection(.enabled)
                    .padding(FoodSpacing.medium)
            }
            .background(Color.foodSurface, in: RoundedRectangle(cornerRadius: FoodRadius.medium))
            .overlay {
                RoundedRectangle(cornerRadius: FoodRadius.medium)
                    .stroke(Color.foodBorder, lineWidth: 0.5)
            }
        case .divider:
            Divider()
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: .title.weight(.bold)
        case 2: .title2.weight(.bold)
        case 3: .title3.weight(.semibold)
        default: .headline
        }
    }
}

private struct RecipeInlineMarkdown: View {
    let source: String

    private var attributedText: AttributedString? {
        try? AttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )
    }

    var body: some View {
        if let attributedText {
            Text(attributedText)
        } else {
            Text(source)
        }
    }
}

private enum RecipeMarkdownBlock {
    case heading(level: Int, text: String)
    case paragraph(String)
    case unorderedList([String])
    case orderedList([String])
    case quote(String)
    case code(String)
    case divider
}

private func parseRecipeMarkdown(_ markdown: String) -> [RecipeMarkdownBlock] {
    let lines = markdown
        .replacingOccurrences(of: "\r\n", with: "\n")
        .components(separatedBy: "\n")
    var blocks: [RecipeMarkdownBlock] = []
    var lineIndex = 0

    while lineIndex < lines.count {
        let line = lines[lineIndex]
        let trimmedLine = line.trimmingCharacters(in: .whitespaces)

        if trimmedLine.isEmpty {
            lineIndex += 1
            continue
        }

        if trimmedLine.hasPrefix("```") {
            var codeLines: [String] = []
            lineIndex += 1
            while lineIndex < lines.count, !lines[lineIndex].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                codeLines.append(lines[lineIndex])
                lineIndex += 1
            }
            if lineIndex < lines.count { lineIndex += 1 }
            blocks.append(.code(codeLines.joined(separator: "\n")))
            continue
        }

        if let heading = recipeMarkdownHeading(line) {
            blocks.append(.heading(level: heading.level, text: heading.text))
            lineIndex += 1
            continue
        }

        if recipeMarkdownIsDivider(line) {
            blocks.append(.divider)
            lineIndex += 1
            continue
        }

        if recipeMarkdownUnorderedItem(line) != nil {
            var items: [String] = []
            while lineIndex < lines.count, let item = recipeMarkdownUnorderedItem(lines[lineIndex]) {
                items.append(item)
                lineIndex += 1
            }
            blocks.append(.unorderedList(items))
            continue
        }

        if recipeMarkdownOrderedItem(line) != nil {
            var items: [String] = []
            while lineIndex < lines.count, let item = recipeMarkdownOrderedItem(lines[lineIndex]) {
                items.append(item)
                lineIndex += 1
            }
            blocks.append(.orderedList(items))
            continue
        }

        if trimmedLine.hasPrefix(">") {
            var quoteLines: [String] = []
            while lineIndex < lines.count {
                let quoteLine = lines[lineIndex].trimmingCharacters(in: .whitespaces)
                guard quoteLine.hasPrefix(">") else { break }
                quoteLines.append(String(quoteLine.dropFirst()).trimmingCharacters(in: .whitespaces))
                lineIndex += 1
            }
            blocks.append(.quote(quoteLines.joined(separator: "\n")))
            continue
        }

        var paragraphLines = [line]
        lineIndex += 1
        while lineIndex < lines.count {
            let nextLine = lines[lineIndex]
            if nextLine.trimmingCharacters(in: .whitespaces).isEmpty || recipeMarkdownStartsBlock(nextLine) { break }
            paragraphLines.append(nextLine)
            lineIndex += 1
        }
        blocks.append(.paragraph(paragraphLines.joined(separator: "\n")))
    }

    return blocks
}

private func recipeMarkdownHeading(_ line: String) -> (level: Int, text: String)? {
    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
    let level = trimmedLine.prefix(while: { $0 == "#" }).count
    guard (1...6).contains(level), trimmedLine.dropFirst(level).first == " " else { return nil }
    return (level, String(trimmedLine.dropFirst(level + 1)))
}

private func recipeMarkdownUnorderedItem(_ line: String) -> String? {
    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
    guard trimmedLine.hasPrefix("- ") || trimmedLine.hasPrefix("* ") || trimmedLine.hasPrefix("+ ") else { return nil }
    return String(trimmedLine.dropFirst(2))
}

private func recipeMarkdownOrderedItem(_ line: String) -> String? {
    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
    guard let periodIndex = trimmedLine.firstIndex(of: ".") else { return nil }
    let number = trimmedLine[..<periodIndex]
    let itemStart = trimmedLine.index(after: periodIndex)
    guard !number.isEmpty,
          number.allSatisfy(\.isNumber),
          itemStart < trimmedLine.endIndex,
          trimmedLine[itemStart].isWhitespace else { return nil }
    return String(trimmedLine[itemStart...]).trimmingCharacters(in: .whitespaces)
}

private func recipeMarkdownIsDivider(_ line: String) -> Bool {
    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
    guard trimmedLine.count >= 3, let firstCharacter = trimmedLine.first, "-*_".contains(firstCharacter) else { return false }
    return trimmedLine.allSatisfy { $0 == firstCharacter || $0.isWhitespace }
}

private func recipeMarkdownStartsBlock(_ line: String) -> Bool {
    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
    return trimmedLine.hasPrefix("```")
        || trimmedLine.hasPrefix(">")
        || recipeMarkdownHeading(line) != nil
        || recipeMarkdownUnorderedItem(line) != nil
        || recipeMarkdownOrderedItem(line) != nil
        || recipeMarkdownIsDivider(line)
}

private struct RecipeBrowserDestination: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

private struct RecipeBrowserView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

private func recipePreviewURL(from value: String) -> URL? {
    let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedValue.isEmpty else { return nil }
    let candidate = URL(string: trimmedValue) ?? URL(string: "https://\(trimmedValue)")
    guard let candidate else { return nil }
    if candidate.scheme == nil, let securedCandidate = URL(string: "https://\(trimmedValue)") {
        return recipePreviewURL(securedCandidate)
    }
    return recipePreviewURL(candidate)
}

private func recipePreviewURL(_ url: URL) -> URL? {
    guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme), url.host != nil else { return nil }
    return url
}

private struct RecipeDetailLoadingState: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FoodSpacing.extraLarge) {
                FoodSkeleton(width: 52, height: 52, radius: FoodRadius.large)
                FoodSkeleton(width: 258, height: 34)
                HStack(spacing: FoodSpacing.small) {
                    FoodSkeleton(width: 76, height: 26, radius: 13)
                    FoodSkeleton(width: 92, height: 26, radius: 13)
                }
                FoodSkeleton(height: 44, radius: FoodRadius.medium)
                VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                    FoodSkeleton(width: 124, height: 22)
                    ForEach(0..<5, id: \.self) { index in
                        FoodSkeleton(width: index.isMultiple(of: 2) ? 248 : 286, height: 15)
                    }
                }
            }
            .padding(FoodSpacing.medium)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading recipe")
        }
        .background(Color.foodPaper)
    }
}

private struct WeekPickerForRecipe: View {
    @Environment(FoodTrackerStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let recipeID: String

    var body: some View {
        NavigationStack {
            List(store.weeks.filter { $0.status != .archived }) { week in
                Button {
                    store.scheduleRecipe(recipeID: recipeID, weekID: week.id)
                    dismiss()
                } label: {
                    HStack {
                        Text(week.emoji)
                        Text(week.name)
                        Spacer()
                        if store.scheduledRecipes(for: week.id).contains(where: { $0.recipeID == recipeID }) {
                            Image(systemName: "checkmark").foregroundStyle(Color.foodSuccess)
                        }
                    }
                }
                .disabled(store.scheduledRecipes(for: week.id).contains(where: { $0.recipeID == recipeID }))
            }
            .foodListBackground()
            .navigationTitle("Add to week")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}
