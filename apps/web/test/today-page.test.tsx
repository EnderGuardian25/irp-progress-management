import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import TodayPage from "@/app/(app)/page";
import { StudentToday } from "@/app/(app)/student-today";

// Playwright's sign-in chain (e2e/signin.spec.ts) asserts data-testid
// "user-name" and "user-role" -- carrying the exact API role string -- on
// BOTH the mentor and Student paths. TodayPage is an async server
// component; calling it directly and rendering the returned element is the
// only way to exercise the role branch without a running Next server.
const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

// student-today.tsx calls listMyDays; mocked so the student branch never
// needs a real client or network access.
const { listMyDays } = vi.hoisted(() => ({ listMyDays: vi.fn() }));

vi.mock("@irp/client", () => ({ listMyDays }));

/**
 * TodayPage() returns `<StudentToday .../>` unresolved on the Student
 * branch -- a React element referencing an async function component, not
 * yet invoked. react-dom/client's render() cannot execute an async function
 * component itself ("Only Server Components can be async at the moment"),
 * so the nested async Server Component has to be resolved by hand before
 * handing the tree to Testing Library, the same way Next's own RSC runtime
 * would. The mentor branch returns plain, already-resolved JSX and needs
 * no such step.
 */
async function resolveTodayPage(): Promise<ReactElement> {
  const element = await TodayPage();
  if (element.type === StudentToday) {
    return StudentToday(element.props as ComponentProps<typeof StudentToday>);
  }
  return element;
}

describe("TodayPage role branches", () => {
  it("renders both testids on the mentor branch, with the exact role string", async () => {
    getCurrentUserOrRedirect.mockResolvedValue({
      id: "1",
      email: "mentor@bistec.test",
      displayName: "Dev Mentor",
      role: "Admin",
    });

    render(await resolveTodayPage());

    expect(screen.getByTestId("user-name")).toHaveTextContent("Dev Mentor");
    expect(screen.getByTestId("user-role")).toHaveTextContent("Admin");
  });

  it("renders both testids on the Student branch, with the exact role string", async () => {
    getCurrentUserOrRedirect.mockResolvedValue({
      id: "2",
      email: "student@bistec.test",
      displayName: "Dev Student",
      role: "Student",
    });
    apiClient.mockResolvedValue({});
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    render(await resolveTodayPage());

    expect(screen.getByTestId("user-name")).toHaveTextContent("Dev Student");
    expect(screen.getByTestId("user-role")).toHaveTextContent("Student");
  });
});
