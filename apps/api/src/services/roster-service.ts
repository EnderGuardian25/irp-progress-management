import { cycleContaining, type CivilDate } from "@irp/core";
import type { BatchRepo } from "../db/batch-repo.js";
import type { MentorRecordRepo } from "../db/mentor-record-repo.js";
import type { DayService, DayView } from "./day-service.js";
import { BatchNotFoundError } from "../domain/errors.js";

export interface RosterRowView {
  student: { id: string; displayName: string; email: string };
  day: DayView;
  hasMentorRecord: boolean;
  extraCountThisCycle: number;
}

export interface RosterService {
  roster(batchId: string, date: CivilDate, now: Date): Promise<RosterRowView[]>;
}

/**
 * The mentor's working view over one batch's roster on one date (FR-28
 * groundwork). Reuses the day service (Task 5) so obligation/compliance
 * arithmetic always derives from its enrolment-clipped classification —
 * never enrolment-blind working-day math computed here instead.
 */
export function createRosterService(deps: {
  batchRepo: Pick<BatchRepo, "getBatch" | "rosterMembers">;
  dayService: DayService;
  mentorRecordRepo: Pick<MentorRecordRepo, "get">;
}): RosterService {
  return {
    async roster(batchId, date, now) {
      const batch = await deps.batchRepo.getBatch(batchId);
      if (!batch) throw new BatchNotFoundError(batchId);

      const members = await deps.batchRepo.rosterMembers(batchId, date);
      const cycle = cycleContaining(date);

      // Known cost, accepted for now: 2 queries per student (a whole-cycle
      // listDays call, itself 4 queries internally, plus the mentor-record
      // lookup) fanned out via Promise.all. Fine for a <=10-student roster;
      // no premature batching until a real roster size demands it.
      return Promise.all(
        members.map(async (m) => {
          const [cycleDays, record] = await Promise.all([
            deps.dayService.listDays(m.studentId, cycle.start, cycle.end, now),
            deps.mentorRecordRepo.get(m.studentId, date),
          ]);
          const day = cycleDays.find((d) => d.date === date);
          if (day === undefined) {
            // cycleContaining(date) always brackets date, so listDays(cycle.start,
            // cycle.end) always includes it — this branch is unreachable in
            // practice and exists only to keep `day` non-optional for callers.
            throw new Error(`roster: day service omitted ${date} from its own containing cycle`);
          }
          const extraCountThisCycle = cycleDays
            .flatMap((d) => d.entries)
            .filter((e) => e.isExtra).length;
          return {
            student: { id: m.studentId, displayName: m.displayName, email: m.email },
            day,
            hasMentorRecord: record !== null,
            extraCountThisCycle,
          };
        }),
      );
    },
  };
}
