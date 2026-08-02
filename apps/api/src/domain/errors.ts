/**
 * Domain rule violations — the repository/service error contract (ADR-0015).
 * `code` is stable and machine-readable; `status` and `title` are what the
 * problem-details plugin serialises; the message is the RFC 7807 `detail`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SubmissionWindowClosedError extends DomainError {
  readonly code = "submission-window-closed";
  readonly status = 400;
  readonly title = "Submission window closed";
  constructor(target: string) {
    super(`The submission window for ${target} is closed (FR-14/FR-15).`);
  }
}

export class LockedDayError extends DomainError {
  readonly code = "day-locked";
  readonly status = 409;
  readonly title = "Day is locked";
  constructor(date: string) {
    super(`${date} is Evaluated and locked for the student (FR-20).`);
  }
}

export class AbsentDayConflictError extends DomainError {
  readonly code = "absent-day-conflict";
  readonly status = 409;
  readonly title = "Day is marked absent";
  constructor(date: string) {
    super(`${date} is marked absent — absent and submitted are contradictory.`);
  }
}

export class EntryConflictError extends DomainError {
  readonly code = "entry-conflict";
  readonly status = 409;
  readonly title = "Day already holds entries";
  constructor(date: string) {
    super(`${date} already holds entries — it cannot also be marked absent.`);
  }
}

export class WeekendAbsenceError extends DomainError {
  readonly code = "weekend-absence";
  readonly status = 400;
  readonly title = "Weekends have no absence";
  constructor(date: string) {
    super(`${date} is a weekend — there is nothing to be absent from (FR-16).`);
  }
}

export class OpenEnrolmentExistsError extends DomainError {
  readonly code = "open-enrolment-exists";
  readonly status = 409;
  readonly title = "Student already enrolled";
  constructor(studentId: string) {
    super(`Student ${studentId} already has an open enrolment.`);
  }
}

export class NoOpenEnrolmentError extends DomainError {
  readonly code = "no-open-enrolment";
  readonly status = 409;
  readonly title = "No open enrolment";
  constructor(studentId: string) {
    super(`Student ${studentId} has no open enrolment.`);
  }
}

export class AbsenceExistsError extends DomainError {
  readonly code = "absence-exists";
  readonly status = 409;
  readonly title = "Absence already recorded";
  constructor(date: string) {
    super(`${date} is already marked absent.`);
  }
}

export class AbsenceNotFoundError extends DomainError {
  readonly code = "absence-not-found";
  readonly status = 404;
  readonly title = "No absence recorded";
  constructor(date: string) {
    super(`No absence is recorded for ${date}.`);
  }
}
