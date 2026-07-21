import SwiftUI

struct AuthView: View {
    private enum Field: Hashable {
        case firstName
        case lastName
        case email
        case password
    }

    @Environment(AuthStore.self) private var auth
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @FocusState private var focusedField: Field?
    @State private var isCreatingAccount = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: FoodSpacing.large) {
                    VStack(alignment: .leading, spacing: FoodSpacing.medium) {
                        Image("BrandLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 76, height: 76)
                            .background(Color.foodDeep)
                            .clipShape(.rect(cornerRadius: 18))
                            .accessibilityHidden(true)
                        Text(isCreatingAccount ? "Make room at the table" : "Welcome back")
                            .font(.system(.largeTitle, design: .serif, weight: .regular))
                            .foregroundStyle(Color.foodDeep)
                        Text(isCreatingAccount
                             ? "Keep recipes, meal plans, and grocery lists in one shared kitchen."
                             : "Your kitchen stays useful offline and catches up when you reconnect.")
                            .font(.body)
                            .foregroundStyle(Color.foodSecondaryInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(spacing: FoodSpacing.medium) {
                        if isCreatingAccount {
                            if horizontalSizeClass == .compact || dynamicTypeSize.isAccessibilitySize {
                                VStack(spacing: FoodSpacing.medium) {
                                    firstNameField
                                    lastNameField
                                }
                            } else {
                                HStack(spacing: FoodSpacing.small) {
                                    firstNameField
                                    lastNameField
                                }
                            }
                        }
                        TextField("Email", text: $email)
                            .focused($focusedField, equals: .email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                            .textFieldStyle(.roundedBorder)
                        SecureField("Password", text: $password)
                            .focused($focusedField, equals: .password)
                            .textContentType(isCreatingAccount ? .newPassword : .password)
                            .submitLabel(.go)
                            .onSubmit { authenticate() }
                            .textFieldStyle(.roundedBorder)
                    }

                    Button(action: authenticate) {
                        if auth.isWorking {
                            ProgressView().frame(maxWidth: .infinity).frame(minHeight: 44)
                        } else {
                            PrimaryActionLabel(
                                title: isCreatingAccount ? "Create account" : "Sign in",
                                systemImage: isCreatingAccount ? "person.badge.plus" : "arrow.right"
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!isFormValid || auth.isWorking)

                    Button(isCreatingAccount ? "Already have an account? Sign in" : "New to List To Ladle? Create an account") {
                        isCreatingAccount.toggle()
                        auth.clearError()
                        focusedField = isCreatingAccount ? .firstName : .email
                    }
                    .frame(minHeight: 44)
                    .frame(maxWidth: .infinity)

                    if let error = auth.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(Color.foodDestructive)
                    }
                }
                .padding(FoodSpacing.large)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.foodPaper)
        }
    }

    private var firstNameField: some View {
        TextField("First name", text: $firstName)
            .focused($focusedField, equals: .firstName)
            .textContentType(.givenName)
            .textInputAutocapitalization(.words)
            .submitLabel(.next)
            .onSubmit { focusedField = .lastName }
            .textFieldStyle(.roundedBorder)
    }

    private var lastNameField: some View {
        TextField("Last name", text: $lastName)
            .focused($focusedField, equals: .lastName)
            .textContentType(.familyName)
            .textInputAutocapitalization(.words)
            .submitLabel(.next)
            .onSubmit { focusedField = .email }
            .textFieldStyle(.roundedBorder)
    }

    private var isFormValid: Bool {
        let hasCredentials = !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && password.count >= 8
        guard isCreatingAccount else { return hasCredentials }
        return hasCredentials
            && !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func authenticate() {
        guard isFormValid, !auth.isWorking else { return }
        focusedField = nil
        Task {
            if isCreatingAccount {
                await auth.signUp(
                    firstName: firstName,
                    lastName: lastName,
                    email: email,
                    password: password
                )
            } else {
                await auth.signIn(email: email, password: password)
            }
        }
    }
}
