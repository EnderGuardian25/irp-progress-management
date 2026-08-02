import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import TodayPage from "@/app/(app)/page";
import { StudentToday } from "@/app/(app)/student-today";
import { MentorToday } from "@/app/(app)/mentor-today";

// TodayPage is a thin role dispatcher: Student -> StudentToday, everyone
// else -> MentorToday. Both branches' own rendering is covered by their
// dedicated suites (student-today's tests, mentor-today.test.tsx) -- this
// file only proves the dispatch itself, so it mocks nothing those
// components need and never renders either branch's tree.
const { getCurrentUserOrRedirect } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect }));

const ADMIN_USER = {
  id: "1",
  email: "mentor@bistec.test",
  displayName: "Dev Mentor",
  role: "Admin" as const,
};

const STUDENT_USER = {
  id: "2",
  email: "student@bistec.test",
  displayName: "Dev Student",
  role: "Student" as const,
};

describe("TodayPage role branches", () => {
  it("delegates an Admin caller to MentorToday, with the signed-in user's identity", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);

    const element = await TodayPage();

    expect(element.type).toBe(MentorToday);
    expect(element.props as ComponentProps<typeof MentorToday>).toEqual({
      displayName: "Dev Mentor",
      role: "Admin",
    });
  });

  it("delegates a Student caller to StudentToday, with the signed-in user's identity", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);

    const element = await TodayPage();

    expect(element.type).toBe(StudentToday);
    expect(element.props as ComponentProps<typeof StudentToday>).toEqual({
      displayName: "Dev Student",
      role: "Student",
    });
  });
});
