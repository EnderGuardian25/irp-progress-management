import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { StudentToday } from "./student-today";
import { MentorToday } from "./mentor-today";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();
  return user.role === "Student" ? (
    <StudentToday displayName={user.displayName} role={user.role} />
  ) : (
    <MentorToday displayName={user.displayName} role={user.role} />
  );
}
