import SwiftUI

struct AuthView: View {
    @Environment(AuthStore.self) private var auth
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
                            HStack(spacing: FoodSpacing.small) {
                                TextField("First name", text: $firstName).textContentType(.givenName)
                                TextField("Last name", text: $lastName).textContentType(.familyName)
                            }
                            .textFieldStyle(.roundedBorder)
                        }
                        TextField("Email", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textFieldStyle(.roundedBorder)
                        SecureField("Password", text: $password)
                            .textContentType(isCreatingAccount ? .newPassword : .password)
                            .textFieldStyle(.roundedBorder)
                    }

                    Button {
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
                    } label: {
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
                    .disabled(
                        email.isEmpty || password.count < 8 || auth.isWorking ||
                            (isCreatingAccount && (firstName.isEmpty || lastName.isEmpty))
                    )

                    Button(isCreatingAccount ? "Already have an account? Sign in" : "New to List To Ladle? Create an account") {
                        isCreatingAccount.toggle()
                        auth.clearError()
                    }
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
            .background(Color.foodPaper)
        }
    }
}
