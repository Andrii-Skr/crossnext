import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SignInForm } from "@/components/auth/SignInForm";

const signInMock = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "ru",
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

describe("SignInForm", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ error: null });
  });

  it("renders login and password fields", async () => {
    render(<SignInForm />);
    const login = screen.getByLabelText(/login/i);
    const password = screen.getByLabelText(/password/i);
    await userEvent.type(login, "user@example.com");
    await userEvent.type(password, "Password123!");
    expect((login as HTMLInputElement).value).toBe("user@example.com");
    expect((password as HTMLInputElement).value).toBe("Password123!");
  });

  it("blocks submit when password is too short", async () => {
    render(<SignInForm />);
    await userEvent.type(screen.getByLabelText(/login/i), "user@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /signIn/i }));

    expect(await screen.findByText("passwordMinError")).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });
});
