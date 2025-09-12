import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInForm } from "@/components/auth/SignInForm";

describe("SignInForm", () => {
  it("renders login and password fields", async () => {
    render(<SignInForm />);
    const login = screen.getByLabelText(/login/i);
    const password = screen.getByLabelText(/password/i);
    await userEvent.type(login, "user@example.com");
    await userEvent.type(password, "Password123!");
    expect((login as HTMLInputElement).value).toBe("user@example.com");
    expect((password as HTMLInputElement).value).toBe("Password123!");
  });
});
