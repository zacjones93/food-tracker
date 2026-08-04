import SwiftUI

extension Color {
    static let foodAccent = adaptive(light: 0x6B4E71, dark: 0xB8A9C9)
    static let foodDeep = adaptive(light: 0x2D1F3D, dark: 0xFEFBF6)
    static let foodPaper = adaptive(light: 0xFEFBF6, dark: 0x201928)
    static let foodSurface = adaptive(light: 0xF5EFE6, dark: 0x2D2435)
    static let foodBorder = adaptive(light: 0xE4D9C0, dark: 0x4C3E57)
    static let foodSecondaryInk = adaptive(light: 0x504435, dark: 0xC9BEB0)
    static let foodSuccess = adaptive(light: 0x3F6945, dark: 0x8DBD91)
    static let foodWarning = adaptive(light: 0x8A5A16, dark: 0xE0B56D)
    static let foodDestructive = adaptive(light: 0xD93636, dark: 0xFF8B86)

    private static func adaptive(light: UInt, dark: UInt) -> Color {
        Color(UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: UInt) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum FoodSpacing {
    static let extraSmall: CGFloat = 4
    static let small: CGFloat = 8
    static let medium: CGFloat = 16
    static let large: CGFloat = 24
    static let extraLarge: CGFloat = 32
}

enum FoodRadius {
    static let small: CGFloat = 8
    static let medium: CGFloat = 10
    static let large: CGFloat = 12
}

extension View {
    func foodSurface(radius: CGFloat = FoodRadius.large) -> some View {
        background(Color.foodSurface, in: RoundedRectangle(cornerRadius: radius))
            .overlay {
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Color.foodBorder, lineWidth: 0.5)
            }
    }

    func foodListBackground() -> some View {
        scrollContentBackground(.hidden)
            .background(Color.foodPaper)
    }

    func foodFormBehavior() -> some View {
        scrollDismissesKeyboard(.interactively)
            .keyboardDismissToolbar()
    }

    func keyboardDismissToolbar() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                }
            }
        }
    }
}

struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    let detail: String?

    init(_ title: String, eyebrow: String, detail: String? = nil) {
        self.eyebrow = eyebrow
        self.title = title
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: FoodSpacing.small) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(0.8)
                .foregroundStyle(Color.foodAccent)
            Text(title)
                .font(.system(.largeTitle, design: .serif, weight: .regular))
                .foregroundStyle(Color.foodDeep)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.foodSecondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct SyncStatusView: View {
    let pendingCount: Int
    let isOnline: Bool
    let isSyncing: Bool
    var isLoading = false

    var body: some View {
        HStack(spacing: FoodSpacing.small) {
            Image(systemName: symbol)
            Text(label)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(tint)
        .padding(.horizontal, FoodSpacing.small)
        .padding(.vertical, FoodSpacing.extraSmall)
        .background(tint.opacity(0.11), in: Capsule())
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel(accessibilityText)
    }

    private var symbol: String {
        if isLoading { return "arrow.triangle.2.circlepath" }
        if isSyncing { return "arrow.triangle.2.circlepath" }
        if !isOnline { return "wifi.slash" }
        if pendingCount > 0 { return "icloud.and.arrow.up" }
        return "checkmark.icloud"
    }

    private var label: String {
        if isLoading { return "Loading" }
        if isSyncing { return "Syncing" }
        if !isOnline { return "Offline" }
        if pendingCount > 0 { return "\(pendingCount) pending" }
        return "Up to date"
    }

    private var tint: Color {
        if isLoading { return .foodAccent }
        if !isOnline || pendingCount > 0 { return .foodWarning }
        return .foodSuccess
    }

    private var accessibilityText: String {
        if isLoading { return "Loading your kitchen." }
        if isSyncing { return "Syncing changes." }
        if !isOnline { return "Offline. Changes save on this device." }
        if pendingCount > 0 { return "\(pendingCount) changes waiting to sync." }
        return "All changes synced."
    }
}

struct ScreenHeaderWithStatus: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    let eyebrow: String
    let title: String
    let detail: String
    let pendingCount: Int
    let isOnline: Bool
    let isSyncing: Bool
    let isLoading: Bool

    var body: some View {
        if horizontalSizeClass == .compact || dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                header
                status
            }
        } else {
            HStack(alignment: .bottom, spacing: FoodSpacing.large) {
                header
                status
            }
        }
    }

    private var header: some View {
        ScreenHeader(title, eyebrow: eyebrow, detail: detail)
    }

    private var status: some View {
        SyncStatusView(
            pendingCount: pendingCount,
            isOnline: isOnline,
            isSyncing: isSyncing,
            isLoading: isLoading
        )
    }
}

struct FoodSkeleton: View {
    var width: CGFloat?
    let height: CGFloat
    var radius: CGFloat = FoodRadius.small

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Color.foodBorder.opacity(0.72))
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .accessibilityHidden(true)
    }
}

struct FoodListSkeleton: View {
    let accessibilityLabel: String
    var rowCount = 4

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rowCount, id: \.self) { index in
                HStack(spacing: FoodSpacing.medium) {
                    FoodSkeleton(width: 42, height: 42, radius: FoodRadius.large)
                    VStack(alignment: .leading, spacing: FoodSpacing.small) {
                        FoodSkeleton(width: index.isMultiple(of: 2) ? 152 : 188, height: 16)
                        FoodSkeleton(width: index.isMultiple(of: 2) ? 96 : 124, height: 11)
                    }
                    Spacer(minLength: FoodSpacing.small)
                    FoodSkeleton(width: 28, height: 11)
                }
                .padding(.horizontal, FoodSpacing.medium)
                .padding(.vertical, FoodSpacing.small)

                if index < rowCount - 1 {
                    Divider().padding(.leading, 72)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct FoodTag: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .foregroundStyle(Color.foodSecondaryInk)
            .padding(.horizontal, FoodSpacing.small)
            .padding(.vertical, FoodSpacing.extraSmall)
            .background(Color.foodSurface, in: Capsule())
            .overlay { Capsule().stroke(Color.foodBorder, lineWidth: 0.5) }
    }
}

struct FoodEmptyState: View {
    let symbol: String
    let title: String
    let detail: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(detail)
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

struct RecipeRow: View {
    let recipe: Recipe
    var trailingText: String?

    var body: some View {
        HStack(alignment: .top, spacing: FoodSpacing.medium) {
            Text(recipe.emoji.isEmpty ? "🍽️" : recipe.emoji)
                .font(.title2)
                .frame(width: 42, height: 42)
                .background(Color.foodAccent.opacity(0.1), in: RoundedRectangle(cornerRadius: FoodRadius.large))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: FoodSpacing.extraSmall) {
                Text(recipe.name)
                    .font(.headline)
                    .foregroundStyle(Color.foodDeep)
                HStack(spacing: FoodSpacing.small) {
                    if !recipe.mealType.isEmpty { Text(recipe.mealType) }
                    if !recipe.difficulty.isEmpty {
                        Text("·")
                        Text(recipe.difficulty)
                    }
                }
                .font(.caption)
                .foregroundStyle(Color.foodSecondaryInk)
            }
            Spacer(minLength: 8)
            if let trailingText {
                Text(trailingText)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Color.foodSecondaryInk)
            }
        }
        .padding(.vertical, FoodSpacing.extraSmall)
        .contentShape(Rectangle())
    }
}

struct PrimaryActionLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        Label(title, systemImage: systemImage)
            .fontWeight(.semibold)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 44)
    }
}
